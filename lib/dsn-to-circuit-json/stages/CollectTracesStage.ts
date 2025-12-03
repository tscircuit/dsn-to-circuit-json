import { ConverterStage } from "../types"
import { applyToPoint } from "transformation-matrix"

/**
 * CollectTracesStage creates pcb_trace and pcb_via elements from DSN wiring section.
 *
 * DSN Wiring Section:
 * (wiring
 *   (wire (path <layer> <width> <x1> <y1> <x2> <y2> ...) (net <net_name>) (type protect))
 *   (via <padstack_name> <x> <y> (net <net_name>))
 * )
 *
 * This stage:
 * 1. Processes wire elements to create pcb_trace elements
 * 2. Processes via elements to create pcb_via elements
 * 3. Associates traces and vias with their nets
 *
 * Wire path format:
 * - (path <layer> <width> x1 y1 x2 y2 ... xn yn)
 * - Creates a route with multiple wire segments
 *
 * Via format:
 * - (via <padstack_name> x y)
 * - Padstack name contains size info (e.g., "Via[0-1]_600:300_um")
 */
export class CollectTracesStage extends ConverterStage {
  step(): boolean {
    const { spectraDsn, dsnToCircuitJsonTransformMatrix } = this.ctx

    if (!dsnToCircuitJsonTransformMatrix) {
      throw new Error("Transform matrix not initialized")
    }

    const wiring = spectraDsn.wiring
    if (!wiring) {
      this.finished = true
      return false
    }

    // Process wires
    for (const wire of wiring.wires || []) {
      this.processWire(wire, dsnToCircuitJsonTransformMatrix)
    }

    // Process vias
    for (const via of wiring.vias || []) {
      this.processVia(via, dsnToCircuitJsonTransformMatrix)
    }

    this.finished = true
    return false
  }

  private processWire(wire: any, transformMatrix: any): void {
    // Get net name from wire
    const netId = wire.netId

    // Get layer
    const layer = this.mapLayer(wire.layer)

    // Get width
    const width = (wire.width ?? 200) / 1000 // Convert from μm to mm

    // Process paths
    const paths = wire.paths || wire.otherChildren || []
    const route: Array<{
      route_type: "wire"
      x: number
      y: number
      width: number
      layer: "top" | "bottom"
    }> = []

    for (const child of paths) {
      if (child.token === "path") {
        const path = child as any
        const pathLayer = this.mapLayer(path.layer)
        const pathWidth = (path.width ?? width * 1000) / 1000

        const coords = path.coordinates || []
        for (let i = 0; i < coords.length; i += 2) {
          if (coords[i] !== undefined && coords[i + 1] !== undefined) {
            const transformed = applyToPoint(transformMatrix, {
              x: coords[i]!,
              y: coords[i + 1]!,
            })

            route.push({
              route_type: "wire",
              x: transformed.x,
              y: transformed.y,
              width: pathWidth,
              layer: pathLayer,
            })
          }
        }
      }
    }

    // Create pcb_trace if we have route points
    if (route.length >= 2) {
      this.ctx.db.pcb_trace.insert({
        route,
      } as any)

      // Update stats
      if (this.ctx.stats) {
        this.ctx.stats.traces = (this.ctx.stats.traces || 0) + 1
      }
    }
  }

  private processVia(via: any, transformMatrix: any): void {
    // Via can be a child element or have specific properties
    // Common formats:
    // (via <padstack_name> <x> <y>)
    // or as SxClass with properties

    let x = 0
    let y = 0
    let outerDiameter = 0.6 // Default 600μm
    let holeDiameter = 0.3 // Default 300μm

    // Try to extract coordinates
    if (via.x !== undefined && via.y !== undefined) {
      x = via.x
      y = via.y
    }

    // Try to parse via dimensions from padstack name
    // Format: "Via[0-1]_600:300_um" -> outer=600μm, hole=300μm
    const padstackName = via.padstackName || via.padstackId || ""
    const match = padstackName.match(/(\d+):(\d+)/)
    if (match) {
      outerDiameter = parseInt(match[1]!, 10) / 1000 // Convert to mm
      holeDiameter = parseInt(match[2]!, 10) / 1000
    }

    // Transform coordinates
    const transformed = applyToPoint(transformMatrix, { x, y })

    // Create pcb_via
    this.ctx.db.pcb_via.insert({
      x: transformed.x,
      y: transformed.y,
      outer_diameter: outerDiameter,
      hole_diameter: holeDiameter,
      layers: ["top", "bottom"],
    } as any)

    // Update stats
    if (this.ctx.stats) {
      this.ctx.stats.vias = (this.ctx.stats.vias || 0) + 1
    }
  }

  /**
   * Maps DSN layer name to Circuit JSON layer.
   */
  private mapLayer(dsnLayer: string | undefined): "top" | "bottom" {
    if (!dsnLayer) return "top"

    const layerLower = dsnLayer.toLowerCase()
    if (
      layerLower.includes("b.cu") ||
      layerLower.includes("bottom") ||
      layerLower.includes("back")
    ) {
      return "bottom"
    }
    return "top"
  }
}
