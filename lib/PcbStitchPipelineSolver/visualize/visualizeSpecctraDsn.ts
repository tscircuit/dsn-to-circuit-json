import type { GraphicsObject } from "graphics-debug"
import type { DsnPin, DsnPlace, SpectraDsn } from "dsnts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import {
  BOUNDARY_COLOR,
  PAD_LAYER_COLORS,
  PAD_FILL_OPACITY,
} from "./utils/colors"
/**
 * Convert DSN coordinates to world coordinates, applying component placement transform
 */
const transformPinPosition = (
  pinX: number,
  pinY: number,
  place: DsnPlace,
): { x: number; y: number } => {
  const placeX = place.x ?? 0
  const placeY = place.y ?? 0
  const rotation = place.rotation ?? 0
  const side = place.side ?? "front"

  // Convert rotation to radians
  const radians = (rotation * Math.PI) / 180

  // Apply rotation around origin
  let rotatedX = pinX * Math.cos(radians) - pinY * Math.sin(radians)
  const rotatedY = pinX * Math.sin(radians) + pinY * Math.cos(radians)

  // Mirror X for back side
  if (side === "back") {
    rotatedX = -rotatedX
  }

  // Translate to component position
  return {
    x: placeX + rotatedX,
    y: placeY + rotatedY,
  }
}

/**
 * Build a map from imageId to DsnImage for quick lookup
 */
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
 * Get pin radius from padstack
 */
const getPinRadius = (
  pin: DsnPin,
  padstackMap: Map<string, any>,
): number | null => {
  const padstackId = pin.padstackId
  if (!padstackId) return null

  const padstack = padstackMap.get(padstackId)
  if (!padstack) return null

  // Check shapes for circle diameter
  const shapes = padstack.shapes ?? []
  for (const shape of shapes) {
    const otherChildren = shape.otherChildren ?? []
    for (const child of otherChildren) {
      if (child.token === "circle" && child.diameter !== undefined) {
        return child.diameter / 2
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

        const dsnPos = transformPinPosition(pinX, pinY, place)
        const realPos = applyToPoint(dsnToRealTransform, dsnPos)

        // Get pad radius from padstack, default to 400 if not found
        const radius = (getPinRadius(pin, padstackMap) ?? 400) * scaleFactor

        graphics.circles!.push({
          center: realPos,
          radius,
          stroke: layerColor,
          fill: `${layerColor}${Math.round(PAD_FILL_OPACITY * 255)
            .toString(16)
            .padStart(2, "0")}`,
          label: `${componentRef}-${pinId}`,
        })
      }
    }
  }

  return graphics
}
