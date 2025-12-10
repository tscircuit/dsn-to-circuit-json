import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import type {
  PcbTrace,
  PcbVia,
  LayerRef,
  PcbSmtPad,
  PcbPlatedHole,
} from "circuit-json"
import { hslToHex } from "./utils/hslToHex"

/**
 * Color mode for visualization
 */
export type ColorMode = "layer" | "trace"

/**
 * Input for the TraceViewer
 */
export interface TraceViewerInput {
  traces: PcbTrace[]
  vias: PcbVia[]
  smtpads?: PcbSmtPad[]
  platedHoles?: PcbPlatedHole[]
  boardBounds?: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
  colorMode?: ColorMode
}

/**
 * Output from the SesRoutesViewer
 */
export interface TraceViewerOutput {
  stats: {
    traceCount: number
    viaCount: number
    smtpadCount: number
    platedHoleCount: number
    topLayerSegments: number
    bottomLayerSegments: number
    totalRoutePoints: number
  }
}

/**
 * TraceViewer extends BaseSolver to visualize the output of CollectSesRoutesStage.
 *
 * This viewer displays:
 * - pcb_trace elements as colored lines (different colors per layer)
 * - pcb_via elements as circles
 * - Route points as small dots
 * - Statistics about the traces
 *
 * The visualization steps through each trace to show how the routes were collected.
 */
export class TraceViewer extends BaseSolver {
  private input: TraceViewerInput
  private currentTraceIndex = 0
  private currentPointIndex = 0
  private phase: "setup" | "animating" | "done" = "setup"

  // Color mode: "layer" colors by layer, "trace" colors by pcb_trace
  colorMode: ColorMode = "layer"

  // Parsed trace segments for visualization
  private traceSegments: Array<{
    traceId: string
    layer: LayerRef
    points: Array<{ x: number; y: number }>
    width: number
  }> = []

  // Vias for visualization
  private vias: Array<{
    x: number
    y: number
    outer_diameter: number
    hole_diameter: number
  }> = []

  // SMT pads for visualization
  private smtpads: Array<{
    x: number
    y: number
    shape:
      | "rect"
      | "circle"
      | "pill"
      | "rotated_rect"
      | "polygon"
      | "rotated_pill"
    width?: number
    height?: number
    radius?: number
    layer: LayerRef
  }> = []

  // Plated holes for visualization
  private platedHoles: Array<{
    x: number
    y: number
    outer_diameter: number
    hole_diameter: number
    shape: "circle" | "oval" | "pill"
  }> = []

  // Map of trace IDs to their assigned colors
  private traceColors: Map<string, string> = new Map()

  constructor(input: TraceViewerInput) {
    super()
    this.input = input
    this.colorMode = input.colorMode || "layer"
  }

  /**
   * Generate a color for a trace based on its index using golden ratio distribution.
   * This ensures maximum visual separation between colors regardless of how many traces exist.
   */
  private generateColorFromIndex(index: number, total: number): string {
    // Golden ratio conjugate for optimal hue distribution
    const GOLDEN_RATIO_CONJUGATE = 0.618033988749895

    // Distribute hue using golden ratio - this ensures adjacent indices
    // get maximally different hues
    const hue = ((index * GOLDEN_RATIO_CONJUGATE) % 1) * 360

    // Vary saturation and lightness slightly based on index to add more distinction
    const saturation = 70 + (index % 3) * 10 // 70%, 80%, or 90%
    const lightness = 45 + (index % 4) * 5 // 45%, 50%, 55%, or 60%

    return hslToHex(hue, saturation, lightness)
  }

  /**
   * Toggle between color modes
   */
  toggleColorMode(): void {
    this.colorMode = this.colorMode === "layer" ? "trace" : "layer"
  }

  /**
   * Set the color mode
   */
  setColorMode(mode: ColorMode): void {
    this.colorMode = mode
  }

  override _setup(): void {
    // Parse traces into segments for visualization
    this.parseTraceSegments()

    // Parse vias for visualization
    this.parseVias()

    // Parse SMT pads for visualization
    this.parseSmtpads()

    // Parse plated holes for visualization
    this.parsePlatedHoles()

    // Assign colors to each unique trace ID
    this.assignTraceColors()

    // Calculate board bounds
    this.calculateBoardBounds()

    this.phase = "animating"
  }

  /**
   * Assign unique colors to each trace using golden ratio distribution
   */
  private assignTraceColors(): void {
    const uniqueTraceIds: string[] = []
    for (const segment of this.traceSegments) {
      if (!uniqueTraceIds.includes(segment.traceId)) {
        uniqueTraceIds.push(segment.traceId)
      }
    }

    const total = uniqueTraceIds.length
    for (let i = 0; i < total; i++) {
      const traceId = uniqueTraceIds[i]!
      this.traceColors.set(traceId, this.generateColorFromIndex(i, total))
    }
  }

  /**
   * Parse vias for visualization
   */
  private parseVias(): void {
    for (const via of this.input.vias) {
      this.vias.push({
        x: via.x,
        y: via.y,
        outer_diameter: via.outer_diameter,
        hole_diameter: via.hole_diameter,
      })
    }
  }

  /**
   * Parse SMT pads for visualization
   */
  private parseSmtpads(): void {
    const smtpads = this.input.smtpads || []
    for (const pad of smtpads) {
      // Skip polygon pads for now as they don't have simple x/y coordinates
      if (pad.shape === "polygon") {
        continue
      }

      const parsedPad: (typeof this.smtpads)[0] = {
        x: pad.x,
        y: pad.y,
        shape: pad.shape,
        layer: pad.layer,
      }

      if (pad.shape === "rect" || pad.shape === "rotated_rect") {
        parsedPad.width = pad.width ?? 0
        parsedPad.height = pad.height ?? 0
      } else if (pad.shape === "circle") {
        parsedPad.radius = pad.radius ?? 0
      } else if (pad.shape === "pill" || pad.shape === "rotated_pill") {
        parsedPad.width = pad.width ?? 0
        parsedPad.height = pad.height ?? 0
        parsedPad.radius = pad.radius ?? 0
      }

      this.smtpads.push(parsedPad)
    }
  }

  /**
   * Parse plated holes for visualization
   */
  private parsePlatedHoles(): void {
    const platedHoles = this.input.platedHoles || []
    for (const hole of platedHoles) {
      // Handle different plated hole shapes
      if (hole.shape === "circle") {
        this.platedHoles.push({
          x: hole.x,
          y: hole.y,
          outer_diameter: hole.outer_diameter,
          hole_diameter: hole.hole_diameter,
          shape: "circle",
        })
      } else if (hole.shape === "oval" || hole.shape === "pill") {
        // Oval and pill shaped holes use outer_width/height instead of diameter
        this.platedHoles.push({
          x: hole.x,
          y: hole.y,
          outer_diameter: Math.max(hole.outer_width, hole.outer_height),
          hole_diameter: Math.max(hole.hole_width, hole.hole_height),
          shape: hole.shape,
        })
      }
      // Skip complex shapes like circular_hole_with_rect_pad, etc. for now
    }
  }

  /**
   * Parse traces into segments for easier visualization
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
          if (!currentSegment || currentSegment.layer !== point.layer) {
            // Start a new segment
            if (currentSegment && currentSegment.points.length >= 2) {
              this.traceSegments.push(currentSegment)
            }
            currentSegment = {
              traceId: trace.pcb_trace_id,
              layer: point.layer,
              points: [{ x: point.x, y: point.y }],
              width: point.width,
            }
          } else {
            currentSegment.points.push({ x: point.x, y: point.y })
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
   * Calculate board bounds from trace segments, vias, pads, and plated holes
   */
  private calculateBoardBounds(): void {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const segment of this.traceSegments) {
      for (const point of segment.points) {
        minX = Math.min(minX, point.x)
        minY = Math.min(minY, point.y)
        maxX = Math.max(maxX, point.x)
        maxY = Math.max(maxY, point.y)
      }
    }

    for (const via of this.vias) {
      minX = Math.min(minX, via.x)
      minY = Math.min(minY, via.y)
      maxX = Math.max(maxX, via.x)
      maxY = Math.max(maxY, via.y)
    }

    for (const pad of this.smtpads) {
      const halfWidth = (pad.width ?? pad.radius ?? 0) / 2
      const halfHeight = (pad.height ?? pad.radius ?? 0) / 2
      minX = Math.min(minX, pad.x - halfWidth)
      minY = Math.min(minY, pad.y - halfHeight)
      maxX = Math.max(maxX, pad.x + halfWidth)
      maxY = Math.max(maxY, pad.y + halfHeight)
    }

    for (const hole of this.platedHoles) {
      const halfDiameter = hole.outer_diameter / 2
      minX = Math.min(minX, hole.x - halfDiameter)
      minY = Math.min(minY, hole.y - halfDiameter)
      maxX = Math.max(maxX, hole.x + halfDiameter)
      maxY = Math.max(maxY, hole.y + halfDiameter)
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
    }

    // Draw all trace segments
    for (let i = 0; i < this.traceSegments.length; i++) {
      const segment = this.traceSegments[i]!
      const isCurrentSegment = i === this.currentTraceIndex
      const isPastSegment = i < this.currentTraceIndex

      // Get color based on color mode
      const baseColor =
        this.colorMode === "trace"
          ? this.traceColors.get(segment.traceId) || "#666"
          : layerColors[segment.layer] || "#666"
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
          label: segment.traceId, // Shows on hover
          layer: segment.layer,
        })
      }
    }

    // Draw vias
    for (const via of this.vias) {
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

    // Draw SMT pads (always visible, underneath traces)
    for (const pad of this.smtpads) {
      const padColor = layerColors[pad.layer] || "#888"
      // Lighter version for pads (50% lighter)
      const lightPadColor = this.lightenColor(padColor, 0.5)

      if (pad.shape === "circle") {
        graphics.circles!.push({
          center: { x: pad.x, y: pad.y },
          radius: pad.radius ?? 1,
          fill: lightPadColor,
          stroke: padColor,
        })
      } else if (
        pad.shape === "rect" ||
        pad.shape === "rotated_rect" ||
        pad.shape === "pill" ||
        pad.shape === "rotated_pill" ||
        pad.shape === "polygon"
      ) {
        graphics.rects!.push({
          center: { x: pad.x, y: pad.y },
          width: pad.width ?? 1,
          height: pad.height ?? 1,
          fill: lightPadColor,
          stroke: padColor,
        })
      }
    }

    // Draw plated holes (always visible)
    for (const hole of this.platedHoles) {
      // Outer copper ring
      graphics.circles!.push({
        center: { x: hole.x, y: hole.y },
        radius: hole.outer_diameter / 2,
        fill: "#d4af37", // Gold color for plated holes
        stroke: "#b8960c",
      })

      // Inner hole
      graphics.circles!.push({
        center: { x: hole.x, y: hole.y },
        radius: hole.hole_diameter / 2,
        fill: "#1a1a2e",
        stroke: "#333",
      })
    }

    return graphics
  }

  /**
   * Lighten a hex color by a factor
   */
  private lightenColor(hexColor: string, factor: number): string {
    const r = parseInt(hexColor.slice(1, 3), 16)
    const g = parseInt(hexColor.slice(3, 5), 16)
    const b = parseInt(hexColor.slice(5, 7), 16)

    const newR = Math.min(255, Math.round(r + (255 - r) * factor))
      .toString(16)
      .padStart(2, "0")
    const newG = Math.min(255, Math.round(g + (255 - g) * factor))
      .toString(16)
      .padStart(2, "0")
    const newB = Math.min(255, Math.round(b + (255 - b) * factor))
      .toString(16)
      .padStart(2, "0")

    return `#${newR}${newG}${newB}`
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
  override getConstructorParams(): TraceViewerInput {
    return this.input
  }

  /**
   * Get the output of the viewer
   */
  override getOutput(): TraceViewerOutput {
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
        smtpadCount: this.input.smtpads?.length ?? 0,
        platedHoleCount: this.input.platedHoles?.length ?? 0,
        totalRoutePoints,
      },
    }
  }
}
