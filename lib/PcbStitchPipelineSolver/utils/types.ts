/**
 * Represents a 2D point with x and y coordinates
 */
export interface Point {
  x: number
  y: number
}

/**
 * Represents an axis-aligned bounding box for a pad
 */
export interface PadBounds {
  /** Center X coordinate in DSN units */
  centerX: number
  /** Center Y coordinate in DSN units */
  centerY: number
  /** Half-width of the bounding box */
  halfWidth: number
  /** Half-height of the bounding box */
  halfHeight: number
  /** Minimum X coordinate */
  minX: number
  /** Maximum X coordinate */
  maxX: number
  /** Minimum Y coordinate */
  minY: number
  /** Maximum Y coordinate */
  maxY: number
}
