import Flatten from "@flatten-js/core"
import type { SpecificDsnPad } from "../PadTraceConnectorSolver"

const { Point, Box, Circle, Polygon } = Flatten

export type PadShape =
  | { type: "circle"; shape: Flatten.Circle }
  | { type: "polygon"; shape: Flatten.Polygon }
  | { type: "box"; shape: Flatten.Box }

function getPadstackShapeInfo(padstack: SpecificDsnPad["padstack"]): {
  type: "circle" | "polygon" | "rect" | "path" | "unknown"
  diameter?: number
  coordinates?: number[]
  width?: number
  height?: number
} {
  const shapes = padstack.shapes || []
  if (shapes.length === 0) {
    return { type: "unknown" }
  }

  const shape = shapes[0]
  const shapeChildren = shape?.otherChildren || []

  for (const child of shapeChildren) {
    const token = (child as any).token

    // Circle shape
    if (token === "circle" || token === "circ") {
      const circle = child as any
      const diameter = circle.diameter ?? circle._diameter ?? 0
      return { type: "circle", diameter }
    }

    // Rectangle shape
    if (token === "rect") {
      const rect = child as any
      const x1 = rect.x1 ?? rect._x1 ?? 0
      const y1 = rect.y1 ?? rect._y1 ?? 0
      const x2 = rect.x2 ?? rect._x2 ?? 0
      const y2 = rect.y2 ?? rect._y2 ?? 0
      return {
        type: "rect",
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      }
    }

    // Polygon shape
    if (token === "polygon") {
      const polygon = child as any
      const coords: number[] = polygon.coordinates ?? polygon._coordinates ?? []
      return { type: "polygon", coordinates: coords }
    }

    // Path shape (oval/pill pads)
    if (token === "path") {
      const path = child as any
      const pathCoords: number[] = path.coordinates ?? path._coordinates ?? []
      const pathWidth = path.width ?? path._width ?? 0
      return { type: "path", coordinates: pathCoords, width: pathWidth }
    }
  }

  return { type: "unknown" }
}

/**
 * Returns the actual geometric shape of a pad (circle, polygon, etc.)
 * positioned at its final location in DSN coordinates.
 *
 */
export function getPadShape(pad: SpecificDsnPad): PadShape {
  const { pin, placementComponent, padstack } = pad

  // Get pin position relative to image origin
  const pinX = pin.x ?? 0
  const pinY = pin.y ?? 0

  // Get component placement position
  const place = placementComponent.places?.[0]
  const componentX = place?.x ?? 0
  const componentY = place?.y ?? 0
  const componentRotation = place?.rotation ?? 0

  // Apply component rotation to pin offset using flatten-js Point rotation
  const pinOffset = new Point(pinX, pinY)
  const rotatedPinOffset = pinOffset.rotate(
    (componentRotation * Math.PI) / 180,
    new Point(0, 0),
  )

  // Calculate final pad center in DSN coordinates
  const centerX = componentX + rotatedPinOffset.x
  const centerY = componentY + rotatedPinOffset.y
  const center = new Point(centerX, centerY)

  // Get padstack shape info
  const shapeInfo = getPadstackShapeInfo(padstack)
  const totalRotation = componentRotation + (pin.rotation ?? 0)
  const rotationRad = (totalRotation * Math.PI) / 180

  switch (shapeInfo.type) {
    case "circle": {
      const radius = (shapeInfo.diameter ?? 0) / 2
      return {
        type: "circle",
        shape: new Circle(center, radius),
      }
    }

    case "polygon": {
      const coords = shapeInfo.coordinates ?? []
      if (coords.length < 6) {
        // Not enough points for a polygon, fallback to box
        return {
          type: "box",
          shape: new Box(centerX, centerY, centerX, centerY),
        }
      }

      // Create polygon points relative to center, apply rotation
      const points: Flatten.Point[] = []
      for (let i = 0; i < coords.length; i += 2) {
        const x = coords[i]!
        const y = coords[i + 1]!
        // Point relative to pad center, then rotated and translated
        const pt = new Point(x, y).rotate(rotationRad, new Point(0, 0))
        points.push(new Point(centerX + pt.x, centerY + pt.y))
      }

      // Close the polygon if needed
      if (
        points.length > 0 &&
        !points[points.length - 1]!.equalTo(points[0]!)
      ) {
        points.push(points[0]!)
      }

      const polygon = new Polygon()
      polygon.addFace(points)
      return { type: "polygon", shape: polygon }
    }

    case "rect": {
      const halfW = (shapeInfo.width ?? 0) / 2
      const halfH = (shapeInfo.height ?? 0) / 2

      // For non-rotated or 180-degree rotated rectangles, use Box
      const normalizedRotation = ((totalRotation % 360) + 360) % 360
      if (normalizedRotation === 0 || normalizedRotation === 180) {
        return {
          type: "box",
          shape: new Box(
            centerX - halfW,
            centerY - halfH,
            centerX + halfW,
            centerY + halfH,
          ),
        }
      }

      // For 90/270 rotations, swap width and height
      if (normalizedRotation === 90 || normalizedRotation === 270) {
        return {
          type: "box",
          shape: new Box(
            centerX - halfH,
            centerY - halfW,
            centerX + halfH,
            centerY + halfW,
          ),
        }
      }

      // For arbitrary rotations, create a rotated polygon
      const corners = [
        new Point(-halfW, -halfH),
        new Point(halfW, -halfH),
        new Point(halfW, halfH),
        new Point(-halfW, halfH),
      ]
      const rotatedCorners = corners.map((p) => {
        const rotated = p.rotate(rotationRad, new Point(0, 0))
        return new Point(centerX + rotated.x, centerY + rotated.y)
      })
      rotatedCorners.push(rotatedCorners[0]!) // Close the polygon

      const polygon = new Polygon()
      polygon.addFace(rotatedCorners)
      return { type: "polygon", shape: polygon }
    }

    case "path": {
      // Path shapes are treated as polygons for now
      // For a more accurate representation, we would need to create
      // a capsule/stadium shape, but polygon is a reasonable approximation
      const pathWidth = shapeInfo.width ?? 0
      const coords = shapeInfo.coordinates ?? []

      if (coords.length >= 4) {
        const x1 = coords[0]!
        const y1 = coords[1]!
        const x2 = coords[2]!
        const y2 = coords[3]!

        // Create a rectangle oriented along the path
        const dx = x2 - x1
        const dy = y2 - y1
        const len = Math.sqrt(dx * dx + dy * dy)
        const halfW = pathWidth / 2

        if (len > 0) {
          // Normal perpendicular to the path
          const nx = -dy / len
          const ny = dx / len

          const corners = [
            new Point(x1 + nx * halfW, y1 + ny * halfW),
            new Point(x2 + nx * halfW, y2 + ny * halfW),
            new Point(x2 - nx * halfW, y2 - ny * halfW),
            new Point(x1 - nx * halfW, y1 - ny * halfW),
          ]

          const rotatedCorners = corners.map((p) => {
            const rotated = p.rotate(rotationRad, new Point(0, 0))
            return new Point(centerX + rotated.x, centerY + rotated.y)
          })
          rotatedCorners.push(rotatedCorners[0]!)

          const polygon = new Polygon()
          polygon.addFace(rotatedCorners)
          return { type: "polygon", shape: polygon }
        }
      }

      // Fallback: treat as circle with pathWidth diameter
      return {
        type: "circle",
        shape: new Circle(center, pathWidth / 2),
      }
    }

    default:
      throw new Error(`Unknown pad shape type: ${shapeInfo.type}`)
  }
}
