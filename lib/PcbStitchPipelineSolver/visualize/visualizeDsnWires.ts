import type { PcbTrace } from "circuit-json"
import type { Wire } from "dsnts"
import type { GraphicsObject } from "graphics-debug"

export const visualizeDsnWires = (
  { wires }: { wires: Wire[] },
  opts?: {
    colorBasedOn?: "layer"
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
