import type { LayerRef, PcbTrace, PcbTraceRoutePointVia } from "circuit-json"
import { ConverterStage } from "../types"
import { applyToPoint } from "transformation-matrix"

/**
 * CollectTracesStage creates pcb_trace and pcb_via elements from DSN wiring section.
 *
 * DSN Wiring Section:
 * (wiring
 *   (wire (path <layer> <width> <x1> <y1> <x2> <y2> ...) (net <net_name>) (type protect))
 *   (wire (polyline_path <layer> <width> <x1> <y1> <x2> <y2> ...) (net <net_name>))
 *   (via <padstack_name> <x> <y> (net <net_name>))
 * )
 *
 * This stage:
 * 1. Processes wire elements to create pcb_trace elements
 * 2. Handles both path and polyline_path wire formats
 * 3. Processes via elements to create pcb_via elements
 * 4. Associates traces and vias with their nets/source_traces
 * 5. Calculates trace_length for each trace
 *
 * Wire path format:
 * - (path <layer> <width> x1 y1 x2 y2 ... xn yn)
 * - Creates a route with multiple wire segments
 *
 * Wire polyline_path format:
 * - (polyline_path <layer> <width> x1 y1 x2 y2 x3 y3 x4 y4 ...)
 * - Coordinates are in groups of 4 representing line segments
 * - Needs intersection calculation to get actual trace points
 *
 * Via format:
 * - (via <padstack_name> x y)
 * - Padstack name contains size info (e.g., "Via[0-1]_600:300_um")
 */
export class CollectTracesStage extends ConverterStage {
  private processedNets = new Set<string>()
  private viasByNet = new Map<
    string,
    Array<{ x: number; y: number; fromLayer: LayerRef; toLayer: LayerRef }>
  >()

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

    // First pass: collect vias and their net associations
    for (const via of wiring.vias || []) {
      this.collectVia(via, dsnToCircuitJsonTransformMatrix)
    }

    // Second pass: process wires and create traces
    for (const wire of wiring.wires || []) {
      this.processWire(wire, dsnToCircuitJsonTransformMatrix)
    }

    // Third pass: create standalone vias (not already part of traces)
    for (const via of wiring.vias || []) {
      this.processVia(via, dsnToCircuitJsonTransformMatrix)
    }

    this.finished = true
    return false
  }

  /**
   * Collect via information for later association with traces.
   */
  private collectVia(via: any, transformMatrix: any): void {
    const netName = this.extractNetName(via)
    if (!netName) return

    let x = via.x ?? 0
    let y = via.y ?? 0

    const transformed = applyToPoint(transformMatrix, { x, y })

    if (!this.viasByNet.has(netName)) {
      this.viasByNet.set(netName, [])
    }

    this.viasByNet.get(netName)!.push({
      x: Number(transformed.x.toFixed(4)),
      y: Number(transformed.y.toFixed(4)),
      fromLayer: "top",
      toLayer: "bottom",
    })
  }

  private processWire(wire: any, transformMatrix: any): void {
    // Get net name from wire
    const netName = this.extractNetName(wire)

    // Skip wires with "shove_fixed" type (these are temp routing artifacts)
    if (wire.type === "shove_fixed") {
      return
    }

    // Skip if this is a via marker wire
    if (wire.type === "via") {
      return
    }

    // Get the source_trace_id for this net
    const sourceTraceId = netName
      ? this.ctx.netNameToSourceTraceId?.get(netName)
      : undefined

    // Check for polyline_path first (from reference implementation)
    const polylinePath = this.findPolylinePath(wire)
    if (polylinePath) {
      this.processPolylinePath(
        polylinePath,
        netName,
        sourceTraceId,
        transformMatrix,
      )
      return
    }

    // Check for regular path
    const path = this.findPath(wire)
    if (path) {
      this.processPath(path, netName, sourceTraceId, transformMatrix)
      return
    }

    // Fallback: try processing paths array
    const paths = wire.paths || wire.otherChildren || []
    for (const child of paths) {
      if (child.token === "path") {
        this.processPath(child, netName, sourceTraceId, transformMatrix)
      } else if (child.token === "polyline_path") {
        this.processPolylinePath(child, netName, sourceTraceId, transformMatrix)
      }
    }
  }

  /**
   * Process a regular path and create pcb_trace.
   */
  private processPath(
    path: any,
    netName: string | undefined,
    sourceTraceId: string | undefined,
    transformMatrix: any,
  ): void {
    const layer = this.mapLayer(path.layer)
    const width = (path.width ?? 200) / 1000 // Convert from μm to mm

    const coords = path.coordinates || []
    const route: PcbTrace["route"] = []

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
          width,
          layer,
        })
      }
    }

    // Add vias at matching points if this trace connects through vias
    if (netName) {
      const vias = this.viasByNet.get(netName) || []
      this.insertViasIntoRoute(route, vias)
    }

    // Create pcb_trace if we have route points
    if (route.length >= 2) {
      const traceData: any = {
        route,
        trace_length: this.calculateTraceLength(route),
      }

      if (sourceTraceId) {
        traceData.source_trace_id = sourceTraceId
      }

      this.ctx.db.pcb_trace.insert(traceData)
    }
  }

  /**
   * Process a polyline_path and create pcb_trace.
   * Polyline paths have coordinates in groups of 4 (x1,y1,x2,y2) representing segments.
   * We need to compute intersection points to get the actual trace route.
   */
  private processPolylinePath(
    polylinePath: any,
    netName: string | undefined,
    sourceTraceId: string | undefined,
    transformMatrix: any,
  ): void {
    const layer = this.mapLayer(polylinePath.layer)
    const width = (polylinePath.width ?? 200) / 1000 // Convert from μm to mm

    const coords = polylinePath.coordinates || []

    // Group coordinates into segments (x1, y1, x2, y2)
    const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> =
      []
    for (let i = 0; i + 3 < coords.length; i += 4) {
      segments.push({
        x1: coords[i]!,
        y1: coords[i + 1]!,
        x2: coords[i + 2]!,
        y2: coords[i + 3]!,
      })
    }

    // Calculate intersection points between consecutive segments
    const points: Array<{ x: number; y: number }> = []

    for (let i = 0; i < segments.length - 1; i++) {
      const intersection = this.computeSegmentIntersection(
        segments[i]!,
        segments[i + 1]!,
      )
      if (intersection) {
        const transformed = applyToPoint(transformMatrix, intersection)
        points.push({
          x: Number(transformed.x.toFixed(4)),
          y: Number(transformed.y.toFixed(4)),
        })
      }
    }

    // If no intersections found, just use segment endpoints
    if (points.length === 0 && segments.length > 0) {
      for (const seg of segments) {
        const start = applyToPoint(transformMatrix, { x: seg.x1, y: seg.y1 })
        const end = applyToPoint(transformMatrix, { x: seg.x2, y: seg.y2 })
        if (
          points.length === 0 ||
          points[points.length - 1]!.x !== start.x ||
          points[points.length - 1]!.y !== start.y
        ) {
          points.push({
            x: Number(start.x.toFixed(4)),
            y: Number(start.y.toFixed(4)),
          })
        }
        points.push({
          x: Number(end.x.toFixed(4)),
          y: Number(end.y.toFixed(4)),
        })
      }
    }

    // Build route from points
    const route: PcbTrace["route"] = points.map((point) => ({
      route_type: "wire" as const,
      x: point.x,
      y: point.y,
      width,
      layer,
    }))

    // Add vias at matching points
    if (netName) {
      const vias = this.viasByNet.get(netName) || []
      this.insertViasIntoRoute(route, vias)
    }

    // Create pcb_trace if we have route points
    if (route.length >= 2) {
      const traceData: any = {
        route,
        trace_length: this.calculateTraceLength(route),
      }

      if (sourceTraceId) {
        traceData.source_trace_id = sourceTraceId
      }

      this.ctx.db.pcb_trace.insert(traceData)
    }
  }

  /**
   * Compute intersection point of two line segments.
   */
  private computeSegmentIntersection(
    seg1: { x1: number; y1: number; x2: number; y2: number },
    seg2: { x1: number; y1: number; x2: number; y2: number },
  ): { x: number; y: number } | null {
    const x1 = seg1.x1
    const y1 = seg1.y1
    const x2 = seg1.x2
    const y2 = seg1.y2
    const x3 = seg2.x1
    const y3 = seg2.y1
    const x4 = seg2.x2
    const y4 = seg2.y2

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if (Math.abs(denom) < 1e-10) {
      // Lines are parallel, use midpoint between seg1 end and seg2 start
      return { x: (x2 + x3) / 2, y: (y2 + y3) / 2 }
    }

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom

    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1),
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

  private processVia(via: any, transformMatrix: any): void {
    let x = via.x ?? 0
    let y = via.y ?? 0
    let outerDiameter = 0.6 // Default 600μm
    let holeDiameter = 0.3 // Default 300μm

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

    // Get net name for trace association
    const netName = this.extractNetName(via)
    const sourceTraceId = netName
      ? this.ctx.netNameToSourceTraceId?.get(netName)
      : undefined

    // Create pcb_via
    const viaData: any = {
      x: Number(transformed.x.toFixed(4)),
      y: Number(transformed.y.toFixed(4)),
      outer_diameter: outerDiameter,
      hole_diameter: holeDiameter,
      layers: ["top", "bottom"],
    }

    if (sourceTraceId) {
      viaData.pcb_trace_id = `pcb_trace_${netName}`
    }

    this.ctx.db.pcb_via.insert(viaData)
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
   * Extract net name from wire or via element.
   */
  private extractNetName(element: any): string | undefined {
    // Direct property
    if (element.netId) return element.netId
    if (element.net) return element.net

    // Check otherChildren for (net ...) element
    for (const child of element.otherChildren || []) {
      if (child.token === "net") {
        return child.netId || child.value || child.name
      }
    }

    return undefined
  }

  /**
   * Find path child in wire element.
   */
  private findPath(wire: any): any | undefined {
    if (wire.path) return wire.path

    for (const child of wire.otherChildren || []) {
      if (child.token === "path") {
        return child
      }
    }

    return undefined
  }

  /**
   * Find polyline_path child in wire element.
   */
  private findPolylinePath(wire: any): any | undefined {
    if (wire.polyline_path) return wire.polyline_path

    for (const child of wire.otherChildren || []) {
      if (child.token === "polyline_path") {
        return child
      }
    }

    return undefined
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
