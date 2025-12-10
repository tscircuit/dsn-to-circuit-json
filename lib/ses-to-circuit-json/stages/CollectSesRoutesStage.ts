import type { LayerRef } from "circuit-json"
import {
  SesToCircuitJsonConverterStage,
  type WireSegment,
  type ViaInfo,
} from "../types"
import { applyToPoint } from "transformation-matrix"
import type { SesNet, SesVia, SesWire } from "dsnts"

/**
 * CollectSesRoutesStage extracts wire segments and vias from the SES routes section.
 *
 * SES Routes Section structure:
 * (routes
 *   (resolution mil 1000)
 *   (parser)
 *   (library_out
 *     (padstack via0 (shape (circle 1 3024 0 0)) (shape (circle 2 3024 0 0)))
 *   )
 *   (network_out
 *     (net VCC
 *       (wire (path 2 1772 45016 -138866 19999 -113849 ...))
 *       (via via0 29574 -111576)
 *     )
 *   )
 * )
 *
 * Path format: (path <layer_number> <width> x1 y1 x2 y2 ...)
 *
 * This stage:
 * 1. Processes network_out section for nets
 * 2. Extracts wire segments and stores them in ctx.wireSegmentsByNet
 * 3. Extracts via information and stores them in ctx.viasByNet
 * 4. Creates pcb_via elements in the database
 *
 * Wire grouping into pcb_traces is handled by the GroupWiresIntoTracesStage.
 */
export class CollectSesRoutesStage extends SesToCircuitJsonConverterStage {
  step(): boolean {
    const { ses: parsedSes, sesToCircuitJsonTransformMatrix } = this.ctx

    if (!sesToCircuitJsonTransformMatrix) {
      throw new Error("Transform matrix not initialized")
    }

    const networkOut = parsedSes.routes?.networkOut
    if (!networkOut) {
      this.finished = true
      return false
    }

    // Initialize context maps
    this.ctx.wireSegmentsByNet = new Map()
    this.ctx.viasByNet = new Map()

    // Process all nets
    for (const net of networkOut.nets) {
      this.processNet(net, sesToCircuitJsonTransformMatrix)
    }

    this.finished = true
    return false
  }

  /**
   * Process a single net: extract wire segments and vias.
   */
  private processNet(net: SesNet, transformMatrix: any): void {
    const netName = net.netName
    if (!netName) return

    // Collect wire segments
    const wireSegments: WireSegment[] = []
    for (const wire of net.wires) {
      const segment = this.extractWireSegment(wire, transformMatrix)
      if (segment && segment.points.length >= 2) {
        wireSegments.push(segment)
      }
    }

    if (wireSegments.length > 0) {
      this.ctx.wireSegmentsByNet!.set(netName, wireSegments)
    }

    // Collect vias
    const vias: ViaInfo[] = []
    for (const via of net.vias) {
      const viaInfo = this.extractVia(via, transformMatrix)
      if (viaInfo) {
        vias.push(viaInfo)
        // Also create pcb_via element in database
        this.createPcbVia(via, viaInfo)
      }
    }

    if (vias.length > 0) {
      this.ctx.viasByNet!.set(netName, vias)
    }
  }

  /**
   * Extract a wire segment's points, layer, and width.
   */
  private extractWireSegment(
    wire: SesWire,
    transformMatrix: any,
  ): WireSegment | null {
    const path = wire.path
    if (!path) return null

    const layerRef = this.mapLayer(path.layer)
    const widthMm = this.convertToMm(path.width ?? 0)
    const points: Array<{ x: number; y: number }> = []
    const coords = path.coordinates

    for (let i = 0; i < coords.length; i += 2) {
      if (coords[i] !== undefined && coords[i + 1] !== undefined) {
        const transformed = applyToPoint(transformMatrix, {
          x: coords[i]!,
          y: coords[i + 1]!,
        })
        points.push({
          x: Number(transformed.x.toFixed(4)),
          y: Number(transformed.y.toFixed(4)),
        })
      }
    }

    return { points, layer: layerRef, width: widthMm }
  }

  /**
   * Extract via information.
   */
  private extractVia(via: SesVia, transformMatrix: any): ViaInfo | null {
    const transformed = applyToPoint(transformMatrix, {
      x: via.x ?? 0,
      y: via.y ?? 0,
    })

    return {
      x: Number(transformed.x.toFixed(4)),
      y: Number(transformed.y.toFixed(4)),
      fromLayer: "top",
      toLayer: "bottom",
    }
  }

  /**
   * Create a pcb_via element in the database.
   */
  private createPcbVia(via: SesVia, viaInfo: ViaInfo): void {
    let outerDiameter = 0.6 // Default 600μm
    let holeDiameter = 0.3 // Default 300μm

    // Try to get dimensions from padstack info
    if (via.padstackId && this.ctx.padstackIdToInfo?.has(via.padstackId)) {
      const info = this.ctx.padstackIdToInfo.get(via.padstackId)!
      if (info.diameter) {
        // Convert from SES units to mm
        outerDiameter = this.convertToMm(info.diameter)
        holeDiameter = outerDiameter * 0.5 // Assume hole is 50% of outer
      }
    }

    this.ctx.db.pcb_via.insert({
      x: viaInfo.x,
      y: viaInfo.y,
      outer_diameter: outerDiameter,
      hole_diameter: holeDiameter,
      layers: ["top", "bottom"],
    })
  }

  /**
   * Convert a value from SES units to mm.
   */
  private convertToMm(value: number): number {
    const unit = this.ctx.sesUnit || "mil"
    const resolutionValue = this.ctx.sesResolutionValue || 1

    switch (unit) {
      case "mil":
        return (value * 0.0254) / resolutionValue
      case "mm":
        return value / resolutionValue
      case "um":
        return (value * 0.001) / resolutionValue
      case "in":
        return (value * 25.4) / resolutionValue
      default:
        return (value * 0.0254) / resolutionValue
    }
  }

  /**
   * Maps SES layer (number or string) to Circuit JSON layer.
   * SES typically uses 1 for top, 2 for bottom, etc.
   */
  private mapLayer(layer: number | string | undefined): "top" | "bottom" {
    if (layer === undefined) {
      return "top"
    }
    if (typeof layer === "number") {
      // Layer 1 is typically top, 2 is bottom
      return layer === 2 ? "bottom" : "top"
    }

    const layerLower = layer.toLowerCase()
    if (
      layerLower.includes("b.cu") ||
      layerLower.includes("bottom") ||
      layerLower.includes("back") ||
      layerLower === "2"
    ) {
      return "bottom"
    }
    return "top"
  }
}
