import type { SpecificDsnPad } from "../PadTraceConnectorSolver"
import type { PadBounds } from "./types"

/**
 * Extracts the shape dimensions from a padstack.
 * Returns width and height in DSN units.
 */
function getPadstackDimensions(padstack: SpecificDsnPad["padstack"]): {
  width: number
  height: number
} {
  const shapes = padstack.shapes || []
  if (shapes.length === 0) {
    return { width: 0, height: 0 }
  }

  const shape = shapes[0]
  const shapeChildren = shape?.otherChildren || []

  for (const child of shapeChildren) {
    const token = (child as any).token

    // Circle shape
    if (token === "circle" || token === "circ") {
      const circle = child as any
      const diameter = circle.diameter ?? circle._diameter ?? 0
      return { width: diameter, height: diameter }
    }

    // Rectangle shape
    if (token === "rect") {
      const rect = child as any
      const x1 = rect.x1 ?? rect._x1 ?? 0
      const y1 = rect.y1 ?? rect._y1 ?? 0
      const x2 = rect.x2 ?? rect._x2 ?? 0
      const y2 = rect.y2 ?? rect._y2 ?? 0
      return {
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      }
    }

    // Polygon shape - calculate bounding box from coordinates
    if (token === "polygon") {
      const polygon = child as any
      const coords: number[] = polygon.coordinates ?? polygon._coordinates ?? []

      if (coords.length < 4) {
        return { width: 0, height: 0 }
      }

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
        width: maxX - minX,
        height: maxY - minY,
      }
    }

    // Path shape (oval/pill pads)
    if (token === "path") {
      const path = child as any
      const pathCoords: number[] = path.coordinates ?? path._coordinates ?? []
      const pathWidth = path.width ?? path._width ?? 0

      if (pathCoords.length >= 4) {
        const [x1, y1, x2, y2] = pathCoords
        const pathLength = Math.sqrt(
          ((x2 as number) - (x1 as number)) ** 2 +
            ((y2 as number) - (y1 as number)) ** 2,
        )
        // For path shapes, the bounding box is the path width plus path length
        return {
          width: pathWidth,
          height: pathLength || pathWidth,
        }
      }

      return { width: pathWidth, height: pathWidth }
    }
  }

  return { width: 0, height: 0 }
}

/**
 * Applies rotation to a point around the origin.
 */
function rotatePoint(
  x: number,
  y: number,
  rotationDegrees: number,
): { x: number; y: number } {
  const rotationRad = (rotationDegrees * Math.PI) / 180
  return {
    x: x * Math.cos(rotationRad) - y * Math.sin(rotationRad),
    y: x * Math.sin(rotationRad) + y * Math.cos(rotationRad),
  }
}

/**
 * Calculates the axis-aligned bounding box for a pad in DSN coordinates.
 *
 * The pad's final position is computed by:
 * 1. Getting the pin's position relative to the image (footprint)
 * 2. Applying the component's rotation to the pin offset
 * 3. Adding the component's placement position
 *
 * The bounding box is then computed from the padstack dimensions,
 * taking into account the pin's rotation.
 */
export function calculatePadBounds(pad: SpecificDsnPad): PadBounds {
  const { pin, placementComponent, padstack } = pad

  // Get pin position relative to image origin
  const pinX = pin.x ?? 0
  const pinY = pin.y ?? 0

  // Get component placement position
  const place = placementComponent.places?.[0]
  const componentX = place?.x ?? 0
  const componentY = place?.y ?? 0
  const componentRotation = place?.rotation ?? 0

  // Apply component rotation to pin offset
  const rotatedPinOffset = rotatePoint(pinX, pinY, componentRotation)

  // Calculate final pad center in DSN coordinates
  const centerX = componentX + rotatedPinOffset.x
  const centerY = componentY + rotatedPinOffset.y

  // Get padstack dimensions
  const { width, height } = getPadstackDimensions(padstack)

  // For rotated components, we need to account for the rotated bounding box
  // For simplicity, we use the maximum dimension to create a conservative bounding box
  // when there's rotation that's not a multiple of 90 degrees
  let halfWidth = width / 2
  let halfHeight = height / 2

  // If component rotation is not aligned to 90 degrees, expand bounds to be safe
  const totalRotation = componentRotation + (pin.rotation ?? 0)
  const normalizedRotation = ((totalRotation % 360) + 360) % 360

  if (normalizedRotation % 90 !== 0) {
    // Use the diagonal as the half-dimension for non-axis-aligned rotations
    const diagonal = Math.sqrt(halfWidth ** 2 + halfHeight ** 2)
    halfWidth = diagonal
    halfHeight = diagonal
  } else if (normalizedRotation === 90 || normalizedRotation === 270) {
    // Swap width and height for 90/270 degree rotations
    const temp = halfWidth
    halfWidth = halfHeight
    halfHeight = temp
  }

  return {
    centerX,
    centerY,
    halfWidth,
    halfHeight,
    minX: centerX - halfWidth,
    maxX: centerX + halfWidth,
    minY: centerY - halfHeight,
    maxY: centerY + halfHeight,
  }
}
