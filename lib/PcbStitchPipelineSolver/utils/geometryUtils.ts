import type { PadBounds, Point } from "./types"

/**
 * Checks if a point is inside the pad bounds (axis-aligned bounding box).
 */
export function isPointInsideBounds(point: Point, bounds: PadBounds): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  )
}

/**
 * Checks if a line segment intersects with the pad bounds.
 * Uses the Liang-Barsky algorithm for efficient line-rectangle intersection.
 */
export function doesSegmentIntersectBounds(
  p1: Point,
  p2: Point,
  bounds: PadBounds,
): boolean {
  // If either endpoint is inside the bounds, there's an intersection
  if (isPointInsideBounds(p1, bounds) || isPointInsideBounds(p2, bounds)) {
    return true
  }

  // Liang-Barsky line clipping algorithm
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y

  // Parameters for the four edges
  const p = [-dx, dx, -dy, dy]
  const q = [
    p1.x - bounds.minX,
    bounds.maxX - p1.x,
    p1.y - bounds.minY,
    bounds.maxY - p1.y,
  ]

  let t0 = 0
  let t1 = 1

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      // Line is parallel to this edge
      if (q[i]! < 0) {
        // Line is outside the boundary
        return false
      }
    } else {
      const t = q[i]! / p[i]!
      if (p[i]! < 0) {
        // Entry point
        t0 = Math.max(t0, t)
      } else {
        // Exit point
        t1 = Math.min(t1, t)
      }
    }
  }

  return t0 <= t1
}

/**
 * Checks if any part of a wire path (polyline) intersects with the pad bounds.
 * A wire path is a series of connected segments.
 */
export function doesWirePathIntersectBounds(
  pathPoints: Point[],
  bounds: PadBounds,
): boolean {
  if (pathPoints.length === 0) {
    return false
  }

  // Check if any single point is inside bounds
  for (const point of pathPoints) {
    if (isPointInsideBounds(point, bounds)) {
      return true
    }
  }

  // Check if any segment intersects with bounds
  for (let i = 0; i < pathPoints.length - 1; i++) {
    if (
      doesSegmentIntersectBounds(pathPoints[i]!, pathPoints[i + 1]!, bounds)
    ) {
      return true
    }
  }

  return false
}

/**
 * Extracts points from a wire path's coordinate array.
 * Coordinates are stored as a flat array [x1, y1, x2, y2, ...]
 */
export function extractPointsFromCoordinates(coordinates: number[]): Point[] {
  const points: Point[] = []

  for (let i = 0; i < coordinates.length; i += 2) {
    const x = coordinates[i]
    const y = coordinates[i + 1]
    if (x !== undefined && y !== undefined) {
      points.push({ x, y })
    }
  }

  return points
}
