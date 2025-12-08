import type { LayerRef, PcbTrace, PcbTraceRoutePointVia } from "circuit-json"
import { SesConverterStage } from "../types"
import { applyToPoint } from "transformation-matrix"
import type { SesNet, SesVia, SesWire } from "dsnts"

/**
 * CollectSesRoutesStage creates pcb_trace and pcb_via elements from SES routes section.
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
 * 2. Processes wire elements to create pcb_trace elements
 * 3. Processes via elements to create pcb_via elements
 * 4. Associates traces and vias with their nets
 */
export class CollectSesRoutesStage extends SesConverterStage {
  private viasByNet = new Map<
    string,
    Array<{ x: number; y: number; fromLayer: LayerRef; toLayer: LayerRef }>
  >()

  step(): boolean {
    const { parsedSes, sesToCircuitJsonTransformMatrix } = this.ctx

    if (!sesToCircuitJsonTransformMatrix) {
      throw new Error("Transform matrix not initialized")
    }

    const networkOut = parsedSes.routes?.networkOut
    if (!networkOut) {
      this.finished = true
      return false
    }

    // First pass: collect vias
    for (const net of networkOut.nets) {
      this.collectVias(net, sesToCircuitJsonTransformMatrix)
    }

    // Second pass: process nets and create traces
    for (const net of networkOut.nets) {
      this.processNet(net, sesToCircuitJsonTransformMatrix)
    }

    this.finished = true
    return false
  }

  /**
   * Collect all vias from a net.
   */
  private collectVias(net: SesNet, transformMatrix: any): void {
    const netName = net.netName
    if (!netName) return

    for (const via of net.vias) {
      this.collectVia(via, netName, transformMatrix)
    }
  }

  /**
   * Collect a single via.
   */
  private collectVia(via: SesVia, netName: string, transformMatrix: any): void {
    const transformed = applyToPoint(transformMatrix, {
      x: via.x ?? 0,
      y: via.y ?? 0,
    })

    if (!this.viasByNet.has(netName)) {
      this.viasByNet.set(netName, [])
    }

    this.viasByNet.get(netName)!.push({
      x: Number(transformed.x.toFixed(4)),
      y: Number(transformed.y.toFixed(4)),
      fromLayer: "top",
      toLayer: "bottom",
    })

    // Create pcb_via element
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
      x: Number(transformed.x.toFixed(4)),
      y: Number(transformed.y.toFixed(4)),
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
   * Process a single net and create traces from its wires.
   */
  private processNet(net: SesNet, transformMatrix: any): void {
    const netName = net.netName
    if (!netName) return

    // Process wire elements
    for (const wire of net.wires) {
      this.processWire(wire, netName, transformMatrix)
    }
  }

  /**
   * Process a wire element and create pcb_trace.
   */
  private processWire(
    wire: SesWire,
    netName: string,
    transformMatrix: any,
  ): void {
    const path = wire.path
    if (!path) return

    // Map layer number to name
    const layerRef = this.mapLayer(path.layer)

    // Convert width from SES units to mm
    const widthMm = this.convertToMm(path.width ?? 0)

    // Build route points
    const route: PcbTrace["route"] = []
    const coords = path.coordinates

    for (let i = 0; i < coords.length; i += 2) {
      if (coords[i] !== undefined && coords[i + 1] !== undefined) {
        const transformed = applyToPoint(transformMatrix, {
          x: coords[i]!,
          y: coords[i + 1]!,
        })

        route.push({
          route_type: "wire",
          x: Number(transformed.x.toFixed(4)),
          y: Number(transformed.y.toFixed(4)),
          width: Number(widthMm.toFixed(4)),
          layer: layerRef,
        })
      }
    }

    // Insert vias at matching points
    const vias = this.viasByNet.get(netName) || []
    this.insertViasIntoRoute(route, vias)

    // Create pcb_trace if we have route points
    if (route.length >= 2) {
      this.ctx.db.pcb_trace.insert({
        route,
        trace_length: this.calculateTraceLength(route),
      })
    }
  }

  /**
   * Insert via points into route at matching coordinates.
   */
  private insertViasIntoRoute(
    route: PcbTrace["route"],
    vias: Array<{
      x: number
      y: number
      fromLayer: LayerRef
      toLayer: LayerRef
    }>,
  ): void {
    for (const via of vias) {
      for (let i = 0; i < route.length; i++) {
        const point = route[i]!
        if (
          Math.abs(point.x - via.x) < 0.001 &&
          Math.abs(point.y - via.y) < 0.001
        ) {
          // Insert via point after the matching point
          const viaPoint: PcbTraceRoutePointVia = {
            route_type: "via",
            x: via.x,
            y: via.y,
            from_layer: via.fromLayer,
            to_layer: via.toLayer,
          }
          route.splice(i + 1, 0, viaPoint)
          i++ // Skip the inserted via
        }
      }
    }
  }

  /**
   * Calculate the total length of a trace route.
   */
  private calculateTraceLength(route: PcbTrace["route"]): number {
    let length = 0

    for (let i = 0; i < route.length - 1; i++) {
      const p1 = route[i]!
      const p2 = route[i + 1]!

      // Skip via points in length calculation
      if (p2.route_type === "via") continue

      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      length += Math.sqrt(dx * dx + dy * dy)
    }

    return Number(length.toFixed(4))
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
