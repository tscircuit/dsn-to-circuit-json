import type { LayerRef, PcbTrace } from "circuit-json"
import {
  SesToCircuitJsonConverterStage,
  type WireSegment,
  type ViaInfo,
} from "../types"

interface SegmentData {
  points: Array<{ x: number; y: number }>
  layer: "top" | "bottom"
  width: number
  startKey: string
  endKey: string
  used: boolean
}
/**
 * GroupWiresIntoTracesStage groups wire segments from each net into pcb_traces.
 *
 * This stage:
 * 1. Reads wire segments and vias from ctx (populated by CollectSesRoutesStage)
 * 2. For each net, stitches wire segments that share endpoints into connected routes
 * 3. Handles layer transitions via
 * 4. Creates pcb_trace elements in the database
 *
 * Algorithm:
 * - Wire segments within the same net that share endpoints are stitched together
 * - Segments on different layers can be connected if there's a via at the junction point
 * - Each connected group of segments becomes a single pcb_trace
 */
export class GroupWiresIntoTracesStage extends SesToCircuitJsonConverterStage {
  // Tolerance for matching points (in mm)
  private readonly TOLERANCE = 0.001

  step(): boolean {
    const { wireSegmentsByNet, viasByNet } = this.ctx

    if (!wireSegmentsByNet || wireSegmentsByNet.size === 0) {
      this.finished = true
      return false
    }

    // Process each net
    for (const [netName, segments] of wireSegmentsByNet) {
      const vias = viasByNet?.get(netName) || []
      this.processNet(netName, segments, vias)
    }

    this.finished = true
    return false
  }

  /**
   * Process a single net: stitch wire segments into pcb_traces.
   */
  private processNet(
    _netName: string,
    segments: WireSegment[],
    vias: ViaInfo[],
  ): void {
    if (segments.length === 0) return

    // Stitch segments into connected routes
    const connectedRoutes = this.stitchSegmentsIntoRoutes(segments, vias)

    // Create pcb_trace for each connected route
    for (const route of connectedRoutes) {
      if (route.length >= 2) {
        this.ctx.db.pcb_trace.insert({
          route,
          trace_length: this.calculateTraceLength(route),
        })
      }
    }
  }

  /**
   * Generate a key for a point with tolerance handling.
   */
  private pointKey(x: number, y: number): string {
    const rx = Math.round(x / this.TOLERANCE) * this.TOLERANCE
    const ry = Math.round(y / this.TOLERANCE) * this.TOLERANCE
    return `${rx.toFixed(4)},${ry.toFixed(4)}`
  }

  /**
   * Stitch wire segments into connected routes.
   * Segments that share endpoints are combined into a single route.
   * Vias allow layer transitions - segments on different layers can be connected if there's a via at the junction.
   */
  private stitchSegmentsIntoRoutes(
    segments: WireSegment[],
    vias: ViaInfo[],
  ): PcbTrace["route"][] {
    if (segments.length === 0) return []

    // Build a set of via locations for quick lookup
    const viaLocations = new Map<string, ViaInfo>()
    for (const via of vias) {
      viaLocations.set(this.pointKey(via.x, via.y), via)
    }

    const segmentData: SegmentData[] = segments.map((s) => ({
      ...s,
      startKey: this.pointKey(s.points[0]!.x, s.points[0]!.y),
      endKey: this.pointKey(
        s.points[s.points.length - 1]!.x,
        s.points[s.points.length - 1]!.y,
      ),
      used: false,
    }))

    // Build index by endpoints
    const byStart = new Map<string, SegmentData[]>()
    const byEnd = new Map<string, SegmentData[]>()

    for (const seg of segmentData) {
      if (!byStart.has(seg.startKey)) byStart.set(seg.startKey, [])
      byStart.get(seg.startKey)!.push(seg)
      if (!byEnd.has(seg.endKey)) byEnd.set(seg.endKey, [])
      byEnd.get(seg.endKey)!.push(seg)
    }

    // Helper to check if a layer transition is allowed at a point
    const canTransitionLayer = (
      key: string,
      fromLayer: string,
      toLayer: string,
    ): boolean => {
      if (fromLayer === toLayer) return true
      return viaLocations.has(key)
    }

    // Helper to get via info at a point
    const getViaAt = (key: string) => viaLocations.get(key)

    const routes: PcbTrace["route"][] = []

    // Process each unused segment
    for (const startSeg of segmentData) {
      if (startSeg.used) continue

      // Build a route starting from this segment
      const route: PcbTrace["route"] = []
      startSeg.used = true

      // Add initial segment points
      for (const pt of startSeg.points) {
        route.push({
          route_type: "wire",
          x: pt.x,
          y: pt.y,
          width: Number(startSeg.width.toFixed(4)),
          layer: startSeg.layer,
        })
      }

      // Extend in the "end" direction
      let currentEndKey = startSeg.endKey
      let currentLayer = startSeg.layer
      let extended = true

      while (extended) {
        extended = false

        // Find segments starting at current end (same layer first, then different layer via via)
        const candidates = byStart.get(currentEndKey) || []
        for (const cand of candidates) {
          if (cand.used) continue
          if (!canTransitionLayer(currentEndKey, currentLayer, cand.layer))
            continue

          // If layer is different, insert via and wire point at via location on new layer
          if (cand.layer !== currentLayer) {
            const via = getViaAt(currentEndKey)
            if (via) {
              // Add via
              route.push({
                route_type: "via",
                x: via.x,
                y: via.y,
                from_layer: currentLayer,
                to_layer: cand.layer,
              })
              // Add wire point at via location on the new layer
              route.push({
                route_type: "wire",
                x: via.x,
                y: via.y,
                width: Number(cand.width.toFixed(4)),
                layer: cand.layer,
              })
            }
          }

          // Append this segment (skip first point - it's the same as current end or via location)
          for (let i = 1; i < cand.points.length; i++) {
            route.push({
              route_type: "wire",
              x: cand.points[i]!.x,
              y: cand.points[i]!.y,
              width: Number(cand.width.toFixed(4)),
              layer: cand.layer,
            })
          }
          cand.used = true
          currentEndKey = cand.endKey
          currentLayer = cand.layer
          extended = true
          break
        }

        if (!extended) {
          // Try segments ending at current end (need to reverse)
          const reverseCandidates = byEnd.get(currentEndKey) || []
          for (const cand of reverseCandidates) {
            if (cand.used) continue
            if (!canTransitionLayer(currentEndKey, currentLayer, cand.layer))
              continue

            // If layer is different, insert via and wire point at via location on new layer
            if (cand.layer !== currentLayer) {
              const via = getViaAt(currentEndKey)
              if (via) {
                // Add via
                route.push({
                  route_type: "via",
                  x: via.x,
                  y: via.y,
                  from_layer: currentLayer,
                  to_layer: cand.layer,
                })
                // Add wire point at via location on the new layer
                route.push({
                  route_type: "wire",
                  x: via.x,
                  y: via.y,
                  width: Number(cand.width.toFixed(4)),
                  layer: cand.layer,
                })
              }
            }

            // Append reversed segment (skip last point - it's the same as current end or via location)
            for (let i = cand.points.length - 2; i >= 0; i--) {
              route.push({
                route_type: "wire",
                x: cand.points[i]!.x,
                y: cand.points[i]!.y,
                width: Number(cand.width.toFixed(4)),
                layer: cand.layer,
              })
            }
            cand.used = true
            currentEndKey = cand.startKey
            currentLayer = cand.layer
            extended = true
            break
          }
        }
      }

      // Extend in the "start" direction
      let currentStartKey = startSeg.startKey
      currentLayer = startSeg.layer
      extended = true

      while (extended) {
        extended = false

        // Find segments ending at current start
        const candidates = byEnd.get(currentStartKey) || []
        for (const cand of candidates) {
          if (cand.used) continue
          if (!canTransitionLayer(currentStartKey, currentLayer, cand.layer))
            continue

          // Prepend this segment (skip last point - it's the same as current start or via location)
          const newPoints: PcbTrace["route"] = []
          for (let i = 0; i < cand.points.length - 1; i++) {
            newPoints.push({
              route_type: "wire",
              x: cand.points[i]!.x,
              y: cand.points[i]!.y,
              width: Number(cand.width.toFixed(4)),
              layer: cand.layer,
            })
          }

          // If layer is different, we need to add:
          // 1. Wire point at via location on the candidate's layer
          // 2. Via point
          // These go between the prepended segment points and the existing route
          if (cand.layer !== currentLayer) {
            const via = getViaAt(currentStartKey)
            if (via) {
              // Add wire point at via location on candidate's layer
              newPoints.push({
                route_type: "wire",
                x: via.x,
                y: via.y,
                width: Number(cand.width.toFixed(4)),
                layer: cand.layer,
              })
              // Add via
              newPoints.push({
                route_type: "via",
                x: via.x,
                y: via.y,
                from_layer: cand.layer,
                to_layer: currentLayer,
              })
            }
          }

          route.unshift(...newPoints)
          cand.used = true
          currentStartKey = cand.startKey
          currentLayer = cand.layer
          extended = true
          break
        }

        if (!extended) {
          // Try segments starting at current start (need to reverse)
          const reverseCandidates = byStart.get(currentStartKey) || []
          for (const cand of reverseCandidates) {
            if (cand.used) continue
            if (!canTransitionLayer(currentStartKey, currentLayer, cand.layer))
              continue

            // Prepend reversed segment (skip first point - it's the same as current start or via location)
            const newPoints: PcbTrace["route"] = []
            for (let i = cand.points.length - 1; i > 0; i--) {
              newPoints.push({
                route_type: "wire",
                x: cand.points[i]!.x,
                y: cand.points[i]!.y,
                width: Number(cand.width.toFixed(4)),
                layer: cand.layer,
              })
            }

            // If layer is different, we need to add:
            // 1. Wire point at via location on the candidate's layer
            // 2. Via point
            // These go between the prepended segment points and the existing route
            if (cand.layer !== currentLayer) {
              const via = getViaAt(currentStartKey)
              if (via) {
                // Add wire point at via location on candidate's layer
                newPoints.push({
                  route_type: "wire",
                  x: via.x,
                  y: via.y,
                  width: Number(cand.width.toFixed(4)),
                  layer: cand.layer,
                })
                // Add via
                newPoints.push({
                  route_type: "via",
                  x: via.x,
                  y: via.y,
                  from_layer: cand.layer,
                  to_layer: currentLayer,
                })
              }
            }

            route.unshift(...newPoints)
            cand.used = true
            currentStartKey = cand.endKey
            currentLayer = cand.layer
            extended = true
            break
          }
        }
      }

      routes.push(route)
    }

    return routes
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
}
