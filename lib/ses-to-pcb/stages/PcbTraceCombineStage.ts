import type { PcbTrace, PcbTraceRoutePointWire, PcbPort } from "circuit-json"
import { SesConverterStage } from "../types"

/**
 * Represents a point in the trace graph with its connections
 */
interface TracePoint {
  x: number
  y: number
  key: string
}

/**
 * Represents a segment of a trace (a sequence of connected route points)
 */
interface TraceSegment {
  segmentId: string
  traceId: string
  route: PcbTrace["route"]
  startPoint: TracePoint
  endPoint: TracePoint
  explored: boolean
  committed: boolean
}

/**
 * Represents a port location from the original circuit JSON
 * Includes bounding box info for matching trace points within the port area
 */
interface PortLocation {
  pcb_port_id: string
  x: number
  y: number
  width: number
  height: number
  key: string
}

/**
 * PcbTraceCombineStage combines small pcb_trace segments into larger traces.
 *
 * The algorithm:
 * 1. Extract port locations from original circuit JSON (pcb_smtpad and pcb_plated_hole with pcb_port_id)
 * 2. Build a graph of trace segments from current pcb_traces
 * 3. For each pcb_port:
 *    - Find traces that connect to it
 *    - Explore the trace graph from that point
 *    - When encountering branches, explore all directions
 *    - Commit paths that reach another pcb_port or explored segment
 * 4. After iterating all ports, handle remaining unexplored segments
 */
export class PcbTraceCombineStage extends SesConverterStage {
  private portLocations: PortLocation[] = []
  private traceSegments: TraceSegment[] = []
  private pointToSegments: Map<string, TraceSegment[]> = new Map()
  private combinedTraces: PcbTrace[] = []
  private segmentCounter = 0

  // Tolerance for matching coordinates (in mm)
  private readonly TOLERANCE = 0.001

  // Larger tolerance for matching trace endpoints to port areas (in mm)
  // Traces often connect to pad edges rather than centers, so we need more slack
  private readonly PORT_MATCH_TOLERANCE = 0.01

  step(): boolean {
    const { db, originalCircuitJson } = this.ctx

    // Get current pcb_traces from the database
    const currentTraces = db.pcb_trace.list() as PcbTrace[]

    if (currentTraces.length === 0) {
      this.finished = true
      return false
    }

    // Extract port locations from original circuit JSON if available
    if (originalCircuitJson) {
      this.extractPortLocations(originalCircuitJson)
    }

    // Build trace segment graph
    this.buildTraceSegmentGraph(currentTraces)

    // Combine traces starting from ports
    this.combineTracesFromPorts()

    // Replace old traces with combined traces in the database
    this.replaceTracesInDb(currentTraces)

    this.finished = true
    return false
  }

  /**
   * Extract port locations from original circuit JSON.
   * Ports are associated with pcb_smtpad and pcb_plated_hole elements.
   */
  private extractPortLocations(circuitJson: any[]): void {
    // Extract from pcb_smtpad elements
    for (const element of circuitJson) {
      if (
        element.type === "pcb_smtpad" &&
        element.pcb_port_id &&
        typeof element.x === "number" &&
        typeof element.y === "number"
      ) {
        const width = element.width ?? 0
        const height = element.height ?? 0
        this.portLocations.push({
          pcb_port_id: element.pcb_port_id,
          x: element.x,
          y: element.y,
          width,
          height,
          key: this.pointKey(element.x, element.y),
        })
      }

      // Extract from pcb_plated_hole elements
      if (
        element.type === "pcb_plated_hole" &&
        element.pcb_port_id &&
        typeof element.x === "number" &&
        typeof element.y === "number"
      ) {
        // For plated holes, use outer_diameter or rect_pad dimensions
        let width = 0
        let height = 0
        if (element.outer_diameter) {
          width = element.outer_diameter
          height = element.outer_diameter
        } else if (element.rect_pad_width && element.rect_pad_height) {
          width = element.rect_pad_width
          height = element.rect_pad_height
        } else if (element.hole_diameter) {
          // Fallback to hole diameter if no pad dimensions
          width = element.hole_diameter
          height = element.hole_diameter
        }
        this.portLocations.push({
          pcb_port_id: element.pcb_port_id,
          x: element.x,
          y: element.y,
          width,
          height,
          key: this.pointKey(element.x, element.y),
        })
      }

      // Also check pcb_port directly
      if (element.type === "pcb_port") {
        const port = element as PcbPort
        this.portLocations.push({
          pcb_port_id: port.pcb_port_id,
          x: port.x,
          y: port.y,
          width: 0,
          height: 0,
          key: this.pointKey(port.x, port.y),
        })
      }
    }
  }

  /**
   * Build a graph of trace segments from pcb_traces.
   */
  private buildTraceSegmentGraph(traces: PcbTrace[]): void {
    for (const trace of traces) {
      if (!trace.route || trace.route.length < 2) continue

      // Each trace becomes a segment
      const wirePoints = trace.route.filter(
        (p): p is PcbTraceRoutePointWire => p.route_type === "wire",
      )

      if (wirePoints.length < 2) continue

      const startPoint: TracePoint = {
        x: wirePoints[0]!.x,
        y: wirePoints[0]!.y,
        key: this.pointKey(wirePoints[0]!.x, wirePoints[0]!.y),
      }

      const endPoint: TracePoint = {
        x: wirePoints[wirePoints.length - 1]!.x,
        y: wirePoints[wirePoints.length - 1]!.y,
        key: this.pointKey(
          wirePoints[wirePoints.length - 1]!.x,
          wirePoints[wirePoints.length - 1]!.y,
        ),
      }

      const segment: TraceSegment = {
        segmentId: `seg_${this.segmentCounter++}`,
        traceId: trace.pcb_trace_id,
        route: [...trace.route],
        startPoint,
        endPoint,
        explored: false,
        committed: false,
      }

      this.traceSegments.push(segment)

      // Index by start and end points
      this.addToPointIndex(startPoint.key, segment)
      this.addToPointIndex(endPoint.key, segment)
    }
  }

  /**
   * Add a segment to the point index.
   */
  private addToPointIndex(key: string, segment: TraceSegment): void {
    if (!this.pointToSegments.has(key)) {
      this.pointToSegments.set(key, [])
    }
    this.pointToSegments.get(key)!.push(segment)
  }

  /**
   * Generate a key for a point with tolerance handling.
   */
  private pointKey(x: number, y: number): string {
    // Round to tolerance precision
    const rx = Math.round(x / this.TOLERANCE) * this.TOLERANCE
    const ry = Math.round(y / this.TOLERANCE) * this.TOLERANCE
    return `${rx.toFixed(4)},${ry.toFixed(4)}`
  }

  /**
   * Check if a point falls within a port's bounding box.
   */
  private isPointWithinPort(
    px: number,
    py: number,
    port: PortLocation,
  ): boolean {
    // If port has no dimensions, fall back to key-based exact match
    if (port.width === 0 && port.height === 0) {
      return this.pointKey(px, py) === port.key
    }

    const halfWidth = port.width / 2
    const halfHeight = port.height / 2

    // Use PORT_MATCH_TOLERANCE since traces often connect to pad edges
    return (
      px >= port.x - halfWidth - this.PORT_MATCH_TOLERANCE &&
      px <= port.x + halfWidth + this.PORT_MATCH_TOLERANCE &&
      py >= port.y - halfHeight - this.PORT_MATCH_TOLERANCE &&
      py <= port.y + halfHeight + this.PORT_MATCH_TOLERANCE
    )
  }

  /**
   * Find port at a given location (checks if point falls within port's bounding box).
   */
  private findPortAtLocation(x: number, y: number): PortLocation | undefined {
    return this.portLocations.find((port) => this.isPointWithinPort(x, y, port))
  }

  /**
   * Find segments connected to a point (excluding a given segment).
   */
  private findConnectedSegments(
    point: TracePoint,
    excludeSegment?: TraceSegment,
  ): TraceSegment[] {
    const segments = this.pointToSegments.get(point.key) || []
    return segments.filter((s) => s !== excludeSegment && !s.committed)
  }

  /**
   * Find all segments that have an endpoint within a port's bounding box.
   */
  private findSegmentsConnectedToPort(port: PortLocation): TraceSegment[] {
    const connectedSegments: TraceSegment[] = []

    for (const segment of this.traceSegments) {
      if (segment.committed) continue

      // Check if either endpoint falls within the port area
      if (
        this.isPointWithinPort(segment.startPoint.x, segment.startPoint.y, port)
      ) {
        connectedSegments.push(segment)
      } else if (
        this.isPointWithinPort(segment.endPoint.x, segment.endPoint.y, port)
      ) {
        connectedSegments.push(segment)
      }
    }

    return connectedSegments
  }

  /**
   * Get the endpoint of a segment that connects to a port.
   */
  private getSegmentEndpointNearPort(
    segment: TraceSegment,
    port: PortLocation,
  ): TracePoint | null {
    if (
      this.isPointWithinPort(segment.startPoint.x, segment.startPoint.y, port)
    ) {
      return segment.startPoint
    }
    if (this.isPointWithinPort(segment.endPoint.x, segment.endPoint.y, port)) {
      return segment.endPoint
    }
    return null
  }

  /**
   * Combine traces starting from port locations.
   */
  private combineTracesFromPorts(): void {
    for (const port of this.portLocations) {
      // Find segments that connect to this port (within its bounding box)
      const connectedSegments = this.findSegmentsConnectedToPort(port)

      for (const startSegment of connectedSegments) {
        if (startSegment.committed) continue

        // Find which endpoint of the segment is near the port
        const connectedEndpoint = this.getSegmentEndpointNearPort(
          startSegment,
          port,
        )
        if (!connectedEndpoint) continue

        // Explore from this segment
        const combinedRoute = this.exploreFromSegment(
          startSegment,
          port,
          connectedEndpoint.key,
        )

        if (combinedRoute) {
          this.combinedTraces.push(combinedRoute)
        }
      }
    }
  }

  /**
   * Explore from a starting segment, combining connected segments.
   */
  private exploreFromSegment(
    startSegment: TraceSegment,
    startPort: PortLocation,
    startPointKey: string,
  ): PcbTrace | null {
    // Determine which direction to explore (away from the start port)
    const exploringFromStart = startSegment.startPoint.key === startPointKey
    const currentEndPoint = exploringFromStart
      ? startSegment.endPoint
      : startSegment.startPoint

    // Build the combined route
    let combinedRoute: PcbTrace["route"] = []

    // Add the start segment's route (possibly reversed)
    if (exploringFromStart) {
      combinedRoute = [...startSegment.route]
    } else {
      combinedRoute = this.reverseRoute(startSegment.route)
    }

    // Mark as explored and committed
    startSegment.explored = true
    startSegment.committed = true

    // Set start port id on first wire point
    const firstWire = combinedRoute.find(
      (p): p is PcbTraceRoutePointWire => p.route_type === "wire",
    )
    if (firstWire) {
      firstWire.start_pcb_port_id = startPort.pcb_port_id
    }

    // Explore further
    let endPortId: string | undefined
    const result = this.exploreDirection(
      currentEndPoint,
      startSegment,
      combinedRoute,
    )

    if (result.endPort) {
      endPortId = result.endPort.pcb_port_id
      // Set end port id on last wire point
      const lastWire = [...combinedRoute]
        .reverse()
        .find((p): p is PcbTraceRoutePointWire => p.route_type === "wire")
      if (lastWire) {
        lastWire.end_pcb_port_id = endPortId
      }
    }

    // Create the combined trace
    return {
      type: "pcb_trace",
      pcb_trace_id: `combined_${startSegment.segmentId}`,
      route: combinedRoute,
      trace_length: this.calculateTraceLength(combinedRoute),
    }
  }

  /**
   * Explore in a direction, following connected segments.
   */
  private exploreDirection(
    currentPoint: TracePoint,
    fromSegment: TraceSegment,
    combinedRoute: PcbTrace["route"],
  ): { endPort?: PortLocation; hitExplored: boolean } {
    // Check if we've reached a port
    const port = this.findPortAtLocation(currentPoint.x, currentPoint.y)
    if (port) {
      return { endPort: port, hitExplored: false }
    }

    // Find connected segments
    const connectedSegments = this.findConnectedSegments(
      currentPoint,
      fromSegment,
    )

    if (connectedSegments.length === 0) {
      // Dead end
      return { hitExplored: false }
    }

    if (connectedSegments.length === 1) {
      // Single path - follow it
      const nextSegment = connectedSegments[0]!

      if (nextSegment.explored) {
        return { hitExplored: true }
      }

      // Determine direction
      const enteringFromStart = nextSegment.startPoint.key === currentPoint.key
      const nextEndPoint = enteringFromStart
        ? nextSegment.endPoint
        : nextSegment.startPoint

      // Add the segment's route (possibly reversed, skip first point to avoid duplication)
      const segmentRoute = enteringFromStart
        ? nextSegment.route.slice(1)
        : this.reverseRoute(nextSegment.route).slice(1)

      combinedRoute.push(...segmentRoute)

      nextSegment.explored = true
      nextSegment.committed = true

      // Continue exploring
      return this.exploreDirection(nextEndPoint, nextSegment, combinedRoute)
    }

    // Multiple paths (branch) - explore all and commit the first one that reaches a port
    let bestResult: { endPort?: PortLocation; hitExplored: boolean } = {
      hitExplored: false,
    }
    let bestSegment: TraceSegment | null = null
    let bestRoute: PcbTrace["route"] = []

    for (const nextSegment of connectedSegments) {
      if (nextSegment.explored) {
        // Hit an explored segment - this is a valid end
        if (!bestResult.endPort && !bestResult.hitExplored) {
          bestResult = { hitExplored: true }
        }
        continue
      }

      // Determine direction
      const enteringFromStart = nextSegment.startPoint.key === currentPoint.key
      const nextEndPoint = enteringFromStart
        ? nextSegment.endPoint
        : nextSegment.startPoint

      // Create a temporary route to explore
      const tempRoute: PcbTrace["route"] = []
      const segmentRoute = enteringFromStart
        ? nextSegment.route.slice(1)
        : this.reverseRoute(nextSegment.route).slice(1)
      tempRoute.push(...segmentRoute)

      // Mark as explored temporarily
      nextSegment.explored = true

      // Explore this path
      const result = this.exploreDirection(nextEndPoint, nextSegment, tempRoute)

      if (result.endPort) {
        // Found a port - this is the best path
        bestResult = result
        bestSegment = nextSegment
        bestRoute = tempRoute
        break
      } else if (result.hitExplored && !bestResult.endPort) {
        // Hit an explored segment - save as potential best
        bestResult = result
        bestSegment = nextSegment
        bestRoute = tempRoute
      }

      // Reset explored for non-chosen paths
      nextSegment.explored = false
    }

    // Commit the best path
    if (bestSegment) {
      bestSegment.explored = true
      bestSegment.committed = true
      combinedRoute.push(...bestRoute)
    }

    return bestResult
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

      // Skip via points in length calculation
      if (p2.route_type === "via") continue

      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      length += Math.sqrt(dx * dx + dy * dy)
    }

    return Number(length.toFixed(4))
  }

  /**
   * Replace old traces with combined traces in the database.
   */
  private replaceTracesInDb(oldTraces: PcbTrace[]): void {
    // Remove old traces
    for (const trace of oldTraces) {
      this.ctx.db.pcb_trace.delete(trace.pcb_trace_id)
    }

    // Add combined traces
    for (const trace of this.combinedTraces) {
      this.ctx.db.pcb_trace.insert(trace)
    }

    // Add back any uncommitted segments as individual traces
    // These are segments that weren't part of any port-to-port path
    for (const segment of this.traceSegments) {
      if (!segment.committed) {
        this.ctx.db.pcb_trace.insert({
          route: segment.route,
          trace_length: this.calculateTraceLength(segment.route),
        })
      }
    }
  }
}
