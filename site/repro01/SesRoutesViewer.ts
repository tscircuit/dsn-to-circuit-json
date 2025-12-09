import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import type { PcbTrace, PcbVia, LayerRef } from "circuit-json"

/**
 * Input for the SesRoutesViewer
 */
export interface SesRoutesViewerInput {
  traces: PcbTrace[]
  vias: PcbVia[]
  boardBounds?: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
}

/**
 * Output from the SesRoutesViewer
 */
export interface SesRoutesViewerOutput {
  stats: {
    traceCount: number
    viaCount: number
    topLayerSegments: number
    bottomLayerSegments: number
    totalRoutePoints: number
  }
}

/**
 * SesRoutesViewer extends BaseSolver to visualize the output of CollectSesRoutesStage.
 *
 * This viewer displays:
 * - pcb_trace elements as colored lines (different colors per layer)
 * - pcb_via elements as circles
 * - Route points as small dots
 * - Statistics about the traces
 *
 * The visualization steps through each trace to show how the routes were collected.
 *
 * Note: Circuit JSON coordinates are in mm which are very small for visualization.
 * This viewer automatically scales coordinates to make them visible.
 */
export class SesRoutesViewer extends BaseSolver {
  private input: SesRoutesViewerInput
  private currentTraceIndex = 0
  private currentPointIndex = 0
  private phase: "setup" | "animating" | "done" = "setup"

  // Scale factor to make small mm coordinates visible
  // Circuit JSON uses mm, typical traces are 0.1-0.5mm apart
  // We scale up by 100x to make them ~10-50 units apart
  private scale = 100

  // Computed data (already scaled)
  private traceSegments: Array<{
    traceId: string
    layer: LayerRef
    points: Array<{ x: number; y: number }>
    width: number
  }> = []

  // Scaled vias for visualization
  private scaledVias: Array<{
    x: number
    y: number
    outer_diameter: number
    hole_diameter: number
  }> = []

  constructor(input: SesRoutesViewerInput) {
    super()
    this.input = input
  }

  override _setup(): void {
    // Parse traces into segments for visualization (applies scaling)
    this.parseTraceSegments()

    // Scale vias for visualization
    this.scaleVias()

    // Calculate board bounds from scaled data
    this.calculateBoardBounds()

    this.phase = "animating"
  }

  /**
   * Scale vias for visualization
   */
  private scaleVias(): void {
    for (const via of this.input.vias) {
      this.scaledVias.push({
        x: via.x * this.scale,
        y: via.y * this.scale,
        outer_diameter: via.outer_diameter * this.scale,
        hole_diameter: via.hole_diameter * this.scale,
      })
    }
  }

  /**
   * Parse traces into segments for easier visualization
   * Applies scaling to all coordinates
   */
  private parseTraceSegments(): void {
    for (const trace of this.input.traces) {
      if (!trace.route || trace.route.length === 0) continue

      let currentSegment: {
        traceId: string
        layer: LayerRef
        points: Array<{ x: number; y: number }>
        width: number
      } | null = null

      for (const point of trace.route) {
        if (point.route_type === "wire") {
          // Scale coordinates for visualization
          const scaledPoint = {
            x: point.x * this.scale,
            y: point.y * this.scale,
          }
          const scaledWidth = point.width * this.scale

          if (!currentSegment || currentSegment.layer !== point.layer) {
            // Start a new segment
            if (currentSegment && currentSegment.points.length >= 2) {
              this.traceSegments.push(currentSegment)
            }
            currentSegment = {
              traceId: trace.pcb_trace_id,
              layer: point.layer,
              points: [scaledPoint],
              width: scaledWidth,
            }
          } else {
            currentSegment.points.push(scaledPoint)
          }
        } else if (point.route_type === "via") {
          // Finalize current segment before via
          if (currentSegment && currentSegment.points.length >= 2) {
            this.traceSegments.push(currentSegment)
          }
          currentSegment = null
        }
      }

      // Finalize last segment
      if (currentSegment && currentSegment.points.length >= 2) {
        this.traceSegments.push(currentSegment)
      }
    }
  }

  /**
   * Calculate board bounds from scaled trace segments and vias
   */
  private calculateBoardBounds(): void {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    // Use already-scaled trace segments
    for (const segment of this.traceSegments) {
      for (const point of segment.points) {
        minX = Math.min(minX, point.x)
        minY = Math.min(minY, point.y)
        maxX = Math.max(maxX, point.x)
        maxY = Math.max(maxY, point.y)
      }
    }

    // Use already-scaled vias
    for (const via of this.scaledVias) {
      minX = Math.min(minX, via.x)
      minY = Math.min(minY, via.y)
      maxX = Math.max(maxX, via.x)
      maxY = Math.max(maxY, via.y)
    }

    if (minX === Infinity) {
      // No data, use defaults
      this.input.boardBounds = { minX: -50, minY: -50, maxX: 50, maxY: 50 }
      return
    }

    // Add padding (proportional to the data range)
    const rangeX = maxX - minX
    const rangeY = maxY - minY
    const padding = Math.max(rangeX * 0.2, rangeY * 0.2, 5)
    this.input.boardBounds = {
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding,
    }
  }

  override _step(): void {
    switch (this.phase) {
      case "setup":
        this._setup()
        break

      case "animating":
        // Animate through trace segments
        if (this.currentTraceIndex < this.traceSegments.length) {
          const segment = this.traceSegments[this.currentTraceIndex]!
          this.currentPointIndex++

          if (this.currentPointIndex >= segment.points.length) {
            this.currentTraceIndex++
            this.currentPointIndex = 0
          }
        } else {
          this.phase = "done"
          this.solved = true
        }
        break

      case "done":
        this.solved = true
        break
    }
  }

  /**
   * Visualize the current state of the viewer
   */
  override visualize(): GraphicsObject {
    const graphics: GraphicsObject = {
      lines: [],
      points: [],
      rects: [],
      circles: [],
      texts: [],
    }

    const bounds = this.input.boardBounds || {
      minX: -50,
      minY: -50,
      maxX: 50,
      maxY: 50,
    }

    // Draw board outline
    graphics.rects!.push({
      center: {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
      },
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
      stroke: "#444",
    })

    // Layer colors
    const layerColors: Record<string, string> = {
      top: "#e74c3c", // Red for top layer
      bottom: "#3498db", // Blue for bottom layer
      inner1: "#2ecc71",
      inner2: "#f39c12",
    }

    // Draw all trace segments
    for (let i = 0; i < this.traceSegments.length; i++) {
      const segment = this.traceSegments[i]!
      const isCurrentSegment = i === this.currentTraceIndex
      const isPastSegment = i < this.currentTraceIndex

      const baseColor = layerColors[segment.layer] || "#666"
      const opacity = isPastSegment ? 1 : isCurrentSegment ? 0.8 : 0.3

      // Determine how many points to draw for current segment
      let pointsToDraw = segment.points.length
      if (isCurrentSegment) {
        pointsToDraw = Math.min(
          this.currentPointIndex + 1,
          segment.points.length,
        )
      } else if (!isPastSegment) {
        pointsToDraw = 0
      }

      if (pointsToDraw >= 2) {
        const linePoints = segment.points.slice(0, pointsToDraw).map((p) => ({
          x: p.x,
          y: p.y,
        }))

        graphics.lines!.push({
          points: linePoints,
          strokeColor: this.adjustColorOpacity(baseColor, opacity),
          strokeWidth: Math.max(segment.width, 0.5), // Ensure minimum visibility
        })
      }

      // Draw route points for visible segments
      if (pointsToDraw > 0) {
        for (let j = 0; j < pointsToDraw; j++) {
          const point = segment.points[j]!
          const isCurrentPoint =
            isCurrentSegment && j === this.currentPointIndex

          // Point radius proportional to scaled trace width
          const pointRadius = Math.max(segment.width * 0.8, 0.5)

          // graphics.circles!.push({
          //   center: { x: point.x, y: point.y },
          //   radius: isCurrentPoint ? pointRadius * 1.5 : pointRadius,
          //   fill: isCurrentPoint ? "#fff" : baseColor,
          //   stroke: "#000",
          // })
        }
      }
    }

    // Draw vias (using scaled vias)
    for (const via of this.scaledVias) {
      // Outer circle (copper)
      graphics.circles!.push({
        center: { x: via.x, y: via.y },
        radius: via.outer_diameter / 2,
        fill: "#c0a030",
        stroke: "#907020",
      })

      // Inner circle (hole)
      graphics.circles!.push({
        center: { x: via.x, y: via.y },
        radius: via.hole_diameter / 2,
        fill: "#1a1a2e",
        stroke: "#333",
      })
    }

    return graphics
  }

  /**
   * Adjust color opacity by modifying the hex color
   */
  private adjustColorOpacity(hexColor: string, opacity: number): string {
    // Simple approach: return the color as-is (full opacity visualization)
    // In a real implementation, we'd convert to rgba
    if (opacity < 1) {
      // Darken the color for reduced opacity effect
      const r = parseInt(hexColor.slice(1, 3), 16)
      const g = parseInt(hexColor.slice(3, 5), 16)
      const b = parseInt(hexColor.slice(5, 7), 16)

      const factor = opacity
      const newR = Math.round(r * factor)
        .toString(16)
        .padStart(2, "0")
      const newG = Math.round(g * factor)
        .toString(16)
        .padStart(2, "0")
      const newB = Math.round(b * factor)
        .toString(16)
        .padStart(2, "0")

      return `#${newR}${newG}${newB}`
    }
    return hexColor
  }

  /**
   * Get constructor params for serialization
   */
  override getConstructorParams(): SesRoutesViewerInput {
    return this.input
  }

  /**
   * Get the output of the viewer
   */
  override getOutput(): SesRoutesViewerOutput {
    let topLayerSegments = 0
    let bottomLayerSegments = 0
    let totalRoutePoints = 0

    for (const segment of this.traceSegments) {
      if (segment.layer === "top") {
        topLayerSegments++
      } else if (segment.layer === "bottom") {
        bottomLayerSegments++
      }
      totalRoutePoints += segment.points.length
    }

    return {
      stats: {
        traceCount: this.input.traces.length,
        viaCount: this.input.vias.length,
        topLayerSegments,
        bottomLayerSegments,
        totalRoutePoints,
      },
    }
  }
}
