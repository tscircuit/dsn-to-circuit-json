import type { PcbTrace, PcbTraceRoutePointWire } from "circuit-json"
import { SesToCircuitJsonConverterStage } from "../types"

/**
 * Represents a trace with its start and end points for quick lookup
 */
interface TraceWithEndpoints {
  trace: PcbTrace
  startKey: string
  endKey: string
  startPoint: { x: number; y: number }
  endPoint: { x: number; y: number }
  startLayer: string
  endLayer: string
  merged: boolean
}

/**
 * PcbStitchTraceStage stitches together pcb_traces that share endpoints on the same layer.
 *
 * For example:
 * - pcb_trace_1: [{x1, y1, layer: "top"}, {x2, y2, layer: "top"}]
 * - pcb_trace_2: [{x2, y2, layer: "top"}, {x3, y3, layer: "top"}]
 * Result:
 * - pcb_trace_1: [{x1, y1, layer: "top"}, {x2, y2, layer: "top"}, {x3, y3, layer: "top"}]
 *
 * Traces on different layers at the same position will NOT be stitched together.
 *
 * This stage runs before PcbTraceCombineStage to reduce the number of
 * individual trace segments that need to be combined.
 */
export class PcbStitchTraceStage extends SesToCircuitJsonConverterStage {
  // Tolerance for matching coordinates (in mm)
  private readonly TOLERANCE = 0.001

  step(): boolean {
    const { db } = this.ctx

    // Get current pcb_traces from the database
    const currentTraces = db.pcb_trace.list() as PcbTrace[]

    if (currentTraces.length === 0) {
      this.finished = true
      return false
    }

    // Build trace lookup structures
    const tracesWithEndpoints = this.buildTraceEndpoints(currentTraces)

    // Stitch traces together
    const stitchedTraces = this.stitchTraces(tracesWithEndpoints)

    // Replace old traces with stitched traces in the database
    this.replaceTracesInDb(currentTraces, stitchedTraces)

    this.finished = true
    return false
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
   * Build trace endpoint lookup structures.
   */
  private buildTraceEndpoints(traces: PcbTrace[]): TraceWithEndpoints[] {
    const result: TraceWithEndpoints[] = []

    for (const trace of traces) {
      if (!trace.route || trace.route.length < 2) continue

      const wirePoints = trace.route.filter(
        (p): p is PcbTraceRoutePointWire => p.route_type === "wire",
      )

      if (wirePoints.length < 2) continue

      const firstWire = wirePoints[0]!
      const lastWire = wirePoints[wirePoints.length - 1]!

      const startPoint = {
        x: firstWire.x,
        y: firstWire.y,
      }
      const endPoint = {
        x: lastWire.x,
        y: lastWire.y,
      }

      result.push({
        trace,
        startKey: this.pointKey(startPoint.x, startPoint.y),
        endKey: this.pointKey(endPoint.x, endPoint.y),
        startPoint,
        endPoint,
        startLayer: firstWire.layer,
        endLayer: lastWire.layer,
        merged: false,
      })
    }

    return result
  }

  /**
   * Stitch traces that share endpoints on the same layer.
   */
  private stitchTraces(traces: TraceWithEndpoints[]): PcbTrace[] {
    const result: PcbTrace[] = []

    // Build index of traces by their endpoints
    const startIndex = new Map<string, TraceWithEndpoints[]>()
    const endIndex = new Map<string, TraceWithEndpoints[]>()

    for (const t of traces) {
      if (!startIndex.has(t.startKey)) {
        startIndex.set(t.startKey, [])
      }
      startIndex.get(t.startKey)!.push(t)

      if (!endIndex.has(t.endKey)) {
        endIndex.set(t.endKey, [])
      }
      endIndex.get(t.endKey)!.push(t)
    }

    // Process each trace
    for (const traceData of traces) {
      if (traceData.merged) continue

      // Start a new stitched trace from this trace
      let currentRoute = [...traceData.trace.route]
      traceData.merged = true

      // Track current endpoint layer for layer-aware stitching
      let currentEndLayer = traceData.endLayer

      // Try to extend in the "end" direction
      let currentEndKey = traceData.endKey
      let extended = true

      while (extended) {
        extended = false

        // Find traces that start where this one ends (and same layer)
        const candidates = startIndex.get(currentEndKey) || []
        for (const candidate of candidates) {
          if (candidate.merged) continue
          if (candidate === traceData) continue
          // Only stitch if layers match
          if (candidate.startLayer !== currentEndLayer) continue

          // Stitch: append candidate's route (skip first point to avoid duplicate)
          currentRoute = this.appendRoute(currentRoute, candidate.trace.route)
          candidate.merged = true
          currentEndKey = candidate.endKey
          currentEndLayer = candidate.endLayer
          extended = true
          break
        }

        if (!extended) {
          // Try traces that end where this one ends (need to reverse them)
          const reverseCandidates = endIndex.get(currentEndKey) || []
          for (const candidate of reverseCandidates) {
            if (candidate.merged) continue
            if (candidate === traceData) continue
            // Only stitch if layers match (candidate's end connects to our end)
            if (candidate.endLayer !== currentEndLayer) continue

            // Stitch: append reversed candidate's route (skip first point)
            currentRoute = this.appendRoute(
              currentRoute,
              this.reverseRoute(candidate.trace.route),
            )
            candidate.merged = true
            currentEndKey = candidate.startKey
            currentEndLayer = candidate.startLayer
            extended = true
            break
          }
        }
      }

      // Track current start layer for layer-aware stitching
      let currentStartLayer = traceData.startLayer

      // Try to extend in the "start" direction
      let currentStartKey = traceData.startKey
      extended = true

      while (extended) {
        extended = false

        // Find traces that end where this one starts (and same layer)
        const candidates = endIndex.get(currentStartKey) || []
        for (const candidate of candidates) {
          if (candidate.merged) continue
          if (candidate === traceData) continue
          // Only stitch if layers match
          if (candidate.endLayer !== currentStartLayer) continue

          // Stitch: prepend candidate's route (skip last point to avoid duplicate)
          currentRoute = this.prependRoute(candidate.trace.route, currentRoute)
          candidate.merged = true
          currentStartKey = candidate.startKey
          currentStartLayer = candidate.startLayer
          extended = true
          break
        }

        if (!extended) {
          // Try traces that start where this one starts (need to reverse them)
          const reverseCandidates = startIndex.get(currentStartKey) || []
          for (const candidate of reverseCandidates) {
            if (candidate.merged) continue
            if (candidate === traceData) continue
            // Only stitch if layers match (candidate's start connects to our start)
            if (candidate.startLayer !== currentStartLayer) continue

            // Stitch: prepend reversed candidate's route (skip last point)
            currentRoute = this.prependRoute(
              this.reverseRoute(candidate.trace.route),
              currentRoute,
            )
            candidate.merged = true
            currentStartKey = candidate.endKey
            currentStartLayer = candidate.endLayer
            extended = true
            break
          }
        }
      }

      // Create the stitched trace
      result.push({
        type: "pcb_trace",
        pcb_trace_id: traceData.trace.pcb_trace_id,
        route: currentRoute,
        trace_length: this.calculateTraceLength(currentRoute),
      })
    }

    return result
  }

  /**
   * Append a route to the end of another route, skipping the first point.
   */
  private appendRoute(
    baseRoute: PcbTrace["route"],
    appendRoute: PcbTrace["route"],
  ): PcbTrace["route"] {
    return [...baseRoute, ...appendRoute.slice(1)]
  }

  /**
   * Prepend a route to the start of another route, skipping the last point.
   */
  private prependRoute(
    prependRoute: PcbTrace["route"],
    baseRoute: PcbTrace["route"],
  ): PcbTrace["route"] {
    return [...prependRoute.slice(0, -1), ...baseRoute]
  }

  /**
   * Reverse a route's points.
   */
  private reverseRoute(route: PcbTrace["route"]): PcbTrace["route"] {
    return [...route].reverse()
  }

  /**
   * Calculate the total length of a trace route.
   */
  private calculateTraceLength(route: PcbTrace["route"]): number {
    let length = 0

    for (let i = 0; i < route.length - 1; i++) {
      const p1 = route[i]!
      const p2 = route[i + 1]!

      if (p2.route_type === "via") continue

      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      length += Math.sqrt(dx * dx + dy * dy)
    }

    return Number(length.toFixed(4))
  }

  /**
   * Replace old traces with stitched traces in the database.
   */
  private replaceTracesInDb(
    oldTraces: PcbTrace[],
    newTraces: PcbTrace[],
  ): void {
    // Remove old traces
    for (const trace of oldTraces) {
      this.ctx.db.pcb_trace.delete(trace.pcb_trace_id)
    }

    // Add stitched traces
    for (const trace of newTraces) {
      this.ctx.db.pcb_trace.insert({
        route: trace.route,
        trace_length: trace.trace_length,
      })
    }
  }
}
