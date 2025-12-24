import type { SesWire } from "dsnts"
import type { GraphicsObject } from "graphics-debug"
import { PAD_LAYER_COLORS } from "./utils/colors"
import { applyToPoint, type Matrix } from "transformation-matrix"

const DEFAULT_WIRE_WIDTH = 1000

/**
 * Map layer (number or string) to color
 * In SES files: layer 1 = top (F.Cu), layer 2 = bottom (B.Cu)
 */
const getLayerColor = (layer: string | number | undefined): string => {
  if (layer === undefined || layer === null) return PAD_LAYER_COLORS.top

  // Handle numeric layers (common in SES files)
  if (typeof layer === "number") {
    return layer === 2 ? PAD_LAYER_COLORS.bottom : PAD_LAYER_COLORS.top
  }

  const layerStr = layer.toString().toLowerCase()

  // Check for bottom layer indicators
  if (
    layerStr === "2" ||
    layerStr.includes("b.cu") ||
    layerStr.includes("bottom") ||
    layerStr.includes("back")
  ) {
    return PAD_LAYER_COLORS.bottom
  }

  // Default to top layer
  return PAD_LAYER_COLORS.top
}

/**
 * Get layer name for labeling
 */
const getLayerName = (layer: string | number | undefined): string => {
  if (layer === undefined || layer === null) return "unknown"

  if (typeof layer === "number") {
    return layer === 1 ? "top" : layer === 2 ? "bottom" : `layer-${layer}`
  }

  return layer.toString()
}

export interface VisualizeSesWiresOptions {
  /**
   * Transformation matrix from SES coordinates to real (mm) coordinates.
   * This should be the sesToRealTransform from PcbStitchPipelineSolver.
   */
  sesToRealTransform: Matrix
}

/**
 * Visualize SES wires as graphics objects.
 * Transforms SES coordinates to real (mm) coordinates using the provided matrix.
 */
export const visualizeSesWires = (
  wires: SesWire[],
  opts: VisualizeSesWiresOptions,
): GraphicsObject => {
  const graphics: GraphicsObject = {
    lines: [],
    circles: [],
    rects: [],
    texts: [],
  }

  const { sesToRealTransform } = opts

  for (const wire of wires) {
    const path = wire.path
    if (!path) continue

    const layer = path.layer
    const layerColor = getLayerColor(layer)
    const layerName = getLayerName(layer)

    // Transform width using the scale factor from the matrix
    // The matrix scale is in the 'a' component for x and 'd' for y (they should be equal)
    const scaleFactor = sesToRealTransform.a
    const width = (path.width ?? DEFAULT_WIRE_WIDTH) * scaleFactor

    const coords = path.coordinates ?? []

    // Skip wires with insufficient coordinates
    if (coords.length < 4) continue

    const points: { x: number; y: number }[] = []

    for (let i = 0; i < coords.length; i += 2) {
      const x = coords[i]
      const y = coords[i + 1]
      if (x !== undefined && y !== undefined) {
        // Transform from SES coordinates to real (mm) coordinates
        const realPoint = applyToPoint(sesToRealTransform, { x, y })
        points.push(realPoint)
      }
    }

    if (points.length < 2) continue

    // Draw the wire path
    graphics.lines!.push({
      points,
      strokeColor: layerColor,
      strokeWidth: width,
      label: `wire-${layerName}`,
    })

    // Add circles at wire endpoints for visibility
    const startPoint = points[0]!
    const endPoint = points[points.length - 1]!

    graphics.circles!.push({
      center: startPoint,
      radius: width / 2,
      fill: layerColor,
      label: `wire-start-${layerName}`,
    })

    graphics.circles!.push({
      center: endPoint,
      radius: width / 2,
      fill: layerColor,
      label: `wire-end-${layerName}`,
    })
  }

  return graphics
}
