import type { PcbTrace } from "circuit-json"
import type { GraphicsObject } from "graphics-debug"
import type { SpectraDsn } from "dsnts"

export const PAD_LAYER_COLORS = {
  top: "#e74c3c", // Red for top layer
  bottom: "#3498db", // Blue for bottom layer
  drill: "#ff69b4", // Hot pink for drill layer
}

export const visualizeSpecctraDsn = (
  dsn: SpectraDsn,
  opts?: {},
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
