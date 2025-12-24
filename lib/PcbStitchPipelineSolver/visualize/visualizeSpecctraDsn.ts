import type { GraphicsObject } from "graphics-debug"
import type { DsnPin, DsnPlace, SpectraDsn } from "dsnts"
import {
  applyToPoint,
  type Matrix,
} from "transformation-matrix"
import {
  BOUNDARY_COLOR,
  PAD_LAYER_COLORS,
  PAD_FILL_OPACITY,
} from "./utils/colors"

interface PadShapeInfo {
  type: "circle" | "rect" | "polygon"
  radius?: number
  width?: number
  height?: number
  coordinates?: number[]
}

const buildImageMap = (dsn: SpectraDsn): Map<string, any> => {
  const imageMap = new Map<string, any>()
  const images = dsn.library?.images ?? []
  for (const image of images) {
    if (image.imageId) {
      imageMap.set(image.imageId, image)
    }
  }
  return imageMap
}

/**
 * Build a map from padstackId to DsnPadstack for quick lookup
 */
const buildPadstackMap = (dsn: SpectraDsn): Map<string, any> => {
  const padstackMap = new Map<string, any>()
  const padstacks = dsn.library?.padstacks ?? []
  for (const padstack of padstacks) {
    if (padstack.padstackId) {
      padstackMap.set(padstack.padstackId, padstack)
    }
  }
  return padstackMap
}

/**
 * Get pad shape info from padstack
 */
const getPadShapeInfo = (
  pin: DsnPin,
  padstackMap: Map<string, any>,
): PadShapeInfo | null => {
  const padstackId = pin.padstackId
  if (!padstackId) return null

  const padstack = padstackMap.get(padstackId)
  if (!padstack) return null

  // Check shapes for different types
  const shapes = padstack.shapes ?? []
  for (const shape of shapes) {
    const otherChildren = shape.otherChildren ?? []
    for (const child of otherChildren) {
      // Circle shape
      if (child.token === "circle" && child.diameter !== undefined) {
        return {
          type: "circle",
          radius: child.diameter / 2,
        }
      }

      // Rectangle shape
      if (child.token === "rect") {
        const x1 = child.x1 ?? 0
        const y1 = child.y1 ?? 0
        const x2 = child.x2 ?? 0
        const y2 = child.y2 ?? 0
        return {
          type: "rect",
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
        }
      }

      // Polygon shape
      if (child.token === "polygon") {
        const coords: number[] = child.coordinates ?? []
        if (coords.length >= 4) {
          // Calculate bounding box to get width/height
          let minX = Infinity
          let maxX = -Infinity
          let minY = Infinity
          let maxY = -Infinity

          for (let i = 0; i < coords.length; i += 2) {
            const x = coords[i]
            const y = coords[i + 1]
            if (x !== undefined && y !== undefined) {
              minX = Math.min(minX, x)
              maxX = Math.max(maxX, x)
              minY = Math.min(minY, y)
              maxY = Math.max(maxY, y)
            }
          }

          return {
            type: "polygon",
            width: maxX - minX,
            height: maxY - minY,
            coordinates: coords,
          }
        }
      }
    }
  }

  return null
}

export interface VisualizeSpecctraDsnOptions {
  /**
   * Transformation matrix from DSN coordinates to real (mm) coordinates.
   */
  dsnToRealTransform: Matrix
}

/**
 * Visualize a SpectraDsn structure as graphics objects
 */
export const visualizeSpecctraDsn = (
  dsn: SpectraDsn,
  opts: VisualizeSpecctraDsnOptions,
): GraphicsObject => {
  const graphics: GraphicsObject = {
    lines: [],
    circles: [],
    rects: [],
    texts: [],
  }

  const { dsnToRealTransform } = opts
  const scaleFactor = dsnToRealTransform.a

  const imageMap = buildImageMap(dsn)
  const padstackMap = buildPadstackMap(dsn)

  // Visualize board boundary
  const boundary = dsn.structure?.boundary
  if (boundary) {
    // Handle path-based boundary
    for (const path of boundary.paths ?? []) {
      const coords = path.coordinates ?? []
      if (coords.length >= 4) {
        const points: { x: number; y: number }[] = []
        for (let i = 0; i < coords.length; i += 2) {
          const x = coords[i]
          const y = coords[i + 1]
          if (x !== undefined && y !== undefined) {
            points.push(applyToPoint(dsnToRealTransform, { x, y }))
          }
        }
        if (points.length >= 2) {
          graphics.lines!.push({
            points,
            strokeColor: BOUNDARY_COLOR,
            strokeWidth: (path.width ?? 1) * scaleFactor,
            label: "boundary",
          })
        }
      }
    }

    // Handle rect-based boundary
    for (const rect of boundary.rects ?? []) {
      if (
        rect.x1 !== undefined &&
        rect.y1 !== undefined &&
        rect.x2 !== undefined &&
        rect.y2 !== undefined
      ) {
        const center = applyToPoint(dsnToRealTransform, {
          x: (rect.x1 + rect.x2) / 2,
          y: (rect.y1 + rect.y2) / 2,
        })
        const width = Math.abs(rect.x2 - rect.x1) * scaleFactor
        const height = Math.abs(rect.y2 - rect.y1) * scaleFactor
        graphics.rects!.push({
          center,
          width,
          height,
          stroke: BOUNDARY_COLOR,
          label: "boundary",
        })
      }
    }
  }

  // Visualize component placements and pads
  const components = dsn.placement?.components ?? []

  for (const component of components) {
    const imageId = component.imageId
    if (!imageId) continue

    const image = imageMap.get(imageId)
    if (!image) continue

    const pins: DsnPin[] = image.pins ?? []
    const places: DsnPlace[] = component.places ?? []

    for (const place of places) {
      const componentRef = place.componentRef ?? ""
      const side = place.side ?? "front"
      const layerColor =
        side === "back" ? PAD_LAYER_COLORS.bottom : PAD_LAYER_COLORS.top

      // Visualize each pin
      for (const pin of pins) {
        const pinX = pin.x ?? 0
        const pinY = pin.y ?? 0
        const pinId = pin.pinId ?? ""

        const realPos = applyToPoint(dsnToRealTransform, { x: pinX, y: pinY })
        const shapeInfo = getPadShapeInfo(pin, padstackMap)

        const fillColor = `${layerColor}${Math.round(PAD_FILL_OPACITY * 255)
          .toString(16)
          .padStart(2, "0")}`
        const label = `${componentRef}-${pinId}`

        if (!shapeInfo) {
          // Default to circle with radius 400 if no shape info found
          graphics.circles!.push({
            center: realPos,
            radius: 400 * scaleFactor,
            stroke: layerColor,
            fill: fillColor,
            label,
          })
        } else if (shapeInfo.type === "circle") {
          graphics.circles!.push({
            center: realPos,
            radius: (shapeInfo.radius ?? 400) * scaleFactor,
            stroke: layerColor,
            fill: fillColor,
            label,
          })
        } else if (shapeInfo.type === "rect") {
          graphics.rects!.push({
            center: realPos,
            width: (shapeInfo.width ?? 800) * scaleFactor,
            height: (shapeInfo.height ?? 800) * scaleFactor,
            stroke: layerColor,
            fill: fillColor,
            label,
          })
        } else if (shapeInfo.type === "polygon" && shapeInfo.coordinates) {
          // Transform polygon coordinates to real coordinates
          // Polygon coords are relative to pin center, so we need to
          // translate them to pin position first, then apply full transform
          const coords = shapeInfo.coordinates

          const points: { x: number; y: number }[] = []
          for (let i = 0; i < coords.length; i += 2) {
            const localX = coords[i]
            const localY = coords[i + 1]
            if (localX !== undefined && localY !== undefined) {
              // Polygon vertex in pin-local coordinates, offset by pin position
              const pinLocalPos = { x: pinX + localX, y: pinY + localY }
              points.push(applyToPoint(dsnToRealTransform, pinLocalPos))
            }
          }

          // Close the polygon if not already closed
          if (points.length >= 3) {
            const first = points[0]!
            const last = points[points.length - 1]!
            if (first.x !== last.x || first.y !== last.y) {
              points.push({ x: first.x, y: first.y })
            }
          }

          if (points.length >= 3) {
            graphics.lines!.push({
              points,
              strokeColor: layerColor,
              strokeWidth: 0.05,
              label,
            })
          }
        }
      }
    }
  }

  return graphics
}
