import Flatten from "@flatten-js/core"
import type { PadShape } from "./getPadShape"

const { Point, Segment, Box, Polygon, Circle } = Flatten

export { Point, Segment, Box, Polygon, Circle }

/**
 * Creates a polyline (chain of connected segments) from an array of points.
 */
export function createPolylineFromPoints(
  points: Flatten.Point[],
): Flatten.Segment[] {
  const segments: Flatten.Segment[] = []
  for (let i = 0; i < points.length - 1; i++) {
    segments.push(new Segment(points[i]!, points[i + 1]!))
  }
  return segments
}

/**
 * Checks if any part of a wire path (polyline) intersects with the given box.
 */
export function doesWirePathIntersectBox(
  pathPoints: Flatten.Point[],
  box: Flatten.Box,
): boolean {
  if (pathPoints.length === 0) {
    return false
  }

  // Check if any point is inside the box
  for (const point of pathPoints) {
    if (box.contains(point)) {
      return true
    }
  }

  // Check if any segment intersects with the box
  const boxPolygon = new Polygon(box)
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const segment = new Segment(pathPoints[i]!, pathPoints[i + 1]!)
    if (boxPolygon.intersect(segment).length > 0) {
      return true
    }
  }

  return false
}

/**
 * Extracts points from a wire path's coordinate array.
 * Coordinates are stored as a flat array [x1, y1, x2, y2, ...]
 */
export function extractPointsFromCoordinates(
  coordinates: number[],
): Flatten.Point[] {
  const points: Flatten.Point[] = []

  for (let i = 0; i < coordinates.length; i += 2) {
    const x = coordinates[i]
    const y = coordinates[i + 1]
    if (x !== undefined && y !== undefined) {
      points.push(new Point(x, y))
    }
  }

  return points
}

/**
 * Checks if any part of a wire path intersects with a pad shape.
 * This is more accurate than box intersection for circles and polygons.
 */
export function doesWirePathIntersectShape(
  pathPoints: Flatten.Point[],
  padShape: PadShape,
): boolean {
  if (pathPoints.length === 0) {
    return false
  }

  switch (padShape.type) {
    case "circle": {
      const circle = padShape.shape
      // Check if any point is inside the circle
      for (const point of pathPoints) {
        if (circle.contains(point)) {
          return true
        }
      }
      // Check if any segment intersects the circle
      for (let i = 0; i < pathPoints.length - 1; i++) {
        const segment = new Segment(pathPoints[i]!, pathPoints[i + 1]!)
        if (circle.intersect(segment).length > 0) {
          return true
        }
      }
      return false
    }

    case "polygon": {
      const polygon = padShape.shape
      // Check if any point is inside the polygon
      for (const point of pathPoints) {
        if (polygon.contains(point)) {
          return true
        }
      }
      // Check if any segment intersects the polygon
      for (let i = 0; i < pathPoints.length - 1; i++) {
        const segment = new Segment(pathPoints[i]!, pathPoints[i + 1]!)
        if (polygon.intersect(segment).length > 0) {
          return true
        }
      }
      return false
    }

    case "box": {
      return doesWirePathIntersectBox(pathPoints, padShape.shape)
    }

    default:
      return false
  }
}
