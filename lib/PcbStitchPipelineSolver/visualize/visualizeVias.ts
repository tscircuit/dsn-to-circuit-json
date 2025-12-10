import type { PcbTrace, PcbVia } from "circuit-json"
import type { GraphicsObject } from "graphics-debug"

import { PAD_LAYER_COLORS } from "./visualizeDsnTs"

export const visualizeTraces = (vias: PcbVia[], opts?: {}): GraphicsObject => {
  const graphics: GraphicsObject = {
    lines: [],
    circles: [],
    rects: [],
    texts: [],
  }

  // TODO

  return graphics
}
