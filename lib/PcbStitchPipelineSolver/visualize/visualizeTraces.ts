import type { PcbTrace } from "circuit-json"
import type { GraphicsObject } from "graphics-debug"

const LAYER_COLORS = {
  top: "#e74c3c", // Red for top layer
  bottom: "#3498db", // Blue for bottom layer
  inner1: "#2ecc71", // Green for inner1 layer
  inner2: "#9b59b6", // Purple for inner2 layer
}

export const visualizeTraces = (
  traces: PcbTrace[],
  opts?: {
    colorBasedOn?: "layer" | "trace_id"

    // This trace will be specially highlighted in green
    activePcbTraceId?: string
  },
): GraphicsObject => {
  const graphics: GraphicsObject = {
    lines: [],
    circles: [],
    rects: [],
    texts: [],
  }

  // TODO

  return graphics
}
