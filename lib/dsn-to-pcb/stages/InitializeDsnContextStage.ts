import { ConverterStage } from "../types"
import { compose, scale, translate } from "transformation-matrix"

/**
 * InitializeDsnContextStage sets up the conversion context.
 *
 * This stage handles:
 * 1. Parsing resolution and unit information from the DSN file
 * 2. Creating the coordinate transformation matrix (DSN → Circuit JSON)
 * 3. Initializing mappings for components, pads, nets, etc.
 * 4. Building padstack lookup table from library section
 *
 * DSN Coordinate System:
 * - DSN files typically use micrometers (μm) as the base unit
 * - Resolution specifies the design unit precision
 * - Format: (resolution <unit> <value>) e.g., (resolution um 10)
 *
 * Circuit JSON Coordinate System:
 * - Uses millimeters (mm) as the base unit
 * - Y-axis may need to be flipped depending on DSN origin
 *
 * Transform:
 * - DSN to Circuit JSON: scale by (1/1000) to convert μm to mm
 * - May also include translation to center the board at origin
 */
export class InitializeDsnContextStage extends ConverterStage {
  step(): boolean {
    const { spectraDsn } = this.ctx

    // Extract resolution information
    const resolution = spectraDsn.resolution
    if (resolution) {
      this.ctx.dsnUnit = resolution.unit
      this.ctx.dsnResolutionValue = resolution.value
    } else {
      // Default to micrometers if not specified
      this.ctx.dsnUnit = "um"
      this.ctx.dsnResolutionValue = 1
    }

    // Create transformation matrix
    // DSN uses μm, Circuit JSON uses mm, so scale by 1/1000
    // Also flip Y-axis as DSN typically has Y increasing downward
    const DSN_TO_MM_SCALE = 1 / 1000

    // Calculate board center for translation (will be refined in CollectBoardInfoStage)
    const boardCenter = this.calculateBoardCenter()

    // Build transform: translate to center, then scale
    this.ctx.dsnToCircuitJsonTransformMatrix = compose(
      scale(DSN_TO_MM_SCALE, DSN_TO_MM_SCALE), // Scale
      translate(-boardCenter.x, -boardCenter.y), // Center at origin
    )

    // Initialize mappings
    this.ctx.imageIdToComponentIds = new Map()
    this.ctx.componentRefToId = new Map()
    this.ctx.sourceComponentRefToId = new Map()
    this.ctx.padstackIdToInfo = new Map()
    this.ctx.netNameToId = new Map()
    this.ctx.netNameToSourceTraceId = new Map()
    this.ctx.pinRefToPortId = new Map()

    // Build padstack lookup table from library
    this.buildPadstackLookup()

    this.finished = true
    return false
  }

  /**
   * Calculate the center of the board from the boundary.
   * Used for centering the board at origin in Circuit JSON.
   */
  private calculateBoardCenter(): { x: number; y: number } {
    const boundary = this.ctx.spectraDsn.structure?.boundary

    if (!boundary) {
      return { x: 0, y: 0 }
    }

    // Collect all boundary points
    const xs: number[] = []
    const ys: number[] = []

    // Process paths
    for (const path of boundary.paths || []) {
      const coords = path.coordinates || []
      for (let i = 0; i < coords.length; i += 2) {
        if (coords[i] !== undefined && coords[i + 1] !== undefined) {
          xs.push(coords[i]!)
          ys.push(coords[i + 1]!)
        }
      }
    }

    // Process rects
    for (const rect of boundary.rects || []) {
      if (
        rect.x1 !== undefined &&
        rect.y1 !== undefined &&
        rect.x2 !== undefined &&
        rect.y2 !== undefined
      ) {
        xs.push(rect.x1, rect.x2)
        ys.push(rect.y1, rect.y2)
      }
    }

    if (xs.length === 0 || ys.length === 0) {
      return { x: 0, y: 0 }
    }

    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    }
  }

  /**
   * Build a lookup table from padstack IDs to their shape information.
   * This is used when creating pads to know the pad dimensions.
   */
  private buildPadstackLookup(): void {
    const library = this.ctx.spectraDsn.library
    if (!library) return

    for (const padstack of library.padstacks || []) {
      const padstackId = padstack.padstackId
      if (!padstackId) continue

      // Get the first shape to determine pad info
      const shapes = padstack.shapes || []
      if (shapes.length === 0) continue

      // Look at the shape's children to determine the pad type
      const shape = shapes[0]
      const shapeChildren = shape?.otherChildren || []

      for (const child of shapeChildren) {
        // Check for circle
        if (child.token === "circle" || child.token === "circ") {
          const circle = child as any
          this.ctx.padstackIdToInfo!.set(padstackId, {
            shape: "circle",
            diameter: circle.diameter || circle._diameter,
            layer: circle.layer || circle._layer,
          })
          break
        }

        // Check for rect
        if (child.token === "rect") {
          const rect = child as any
          const x1 = rect.x1 ?? rect._x1 ?? 0
          const y1 = rect.y1 ?? rect._y1 ?? 0
          const x2 = rect.x2 ?? rect._x2 ?? 0
          const y2 = rect.y2 ?? rect._y2 ?? 0
          this.ctx.padstackIdToInfo!.set(padstackId, {
            shape: "rect",
            width: Math.abs(x2 - x1),
            height: Math.abs(y2 - y1),
            layer: rect.layer || rect._layer,
          })
          break
        }

        // Check for polygon
        if (child.token === "polygon") {
          const polygon = child as any
          this.ctx.padstackIdToInfo!.set(padstackId, {
            shape: "polygon",
            coordinates: polygon.coordinates || polygon._coordinates || [],
            layer: polygon.layer || polygon._layer,
            width: polygon.width || polygon._width,
          })
          break
        }

        // Check for path (oval/pill pads)
        if (child.token === "path") {
          const path = child as any
          const pathCoords = path.coordinates || path._coordinates || []
          const pathWidth = path.width || path._width || 0

          // For path shapes (oval/pill pads), width is the path width
          // and height is calculated from path endpoints
          let pathHeight = 0
          if (pathCoords.length >= 4) {
            const [x1, y1, x2, y2] = pathCoords
            pathHeight = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
          }

          this.ctx.padstackIdToInfo!.set(padstackId, {
            shape: "rect", // Approximate as rect
            width: pathWidth,
            height: pathHeight || pathWidth,
            layer: path.layer || path._layer,
            coordinates: pathCoords,
          })
          break
        }
      }
    }
  }
}
