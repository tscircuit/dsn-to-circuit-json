import { SesConverterStage } from "../types"
import { compose, scale, translate } from "transformation-matrix"
import type { DsnCircle } from "dsnts"

/**
 * InitializeSesContextStage sets up the conversion context for SES files.
 *
 * This stage handles:
 * 1. Parsing resolution and unit information from the SES file
 * 2. Creating the coordinate transformation matrix (SES → Circuit JSON)
 * 3. Initializing mappings for components, pads, nets, etc.
 * 4. Building padstack lookup table from library_out section
 *
 * SES Coordinate System:
 * - SES files typically use mils as the base unit
 * - Resolution specifies the design unit precision
 * - Format: (resolution <unit> <value>) e.g., (resolution mil 1000)
 *
 * Circuit JSON Coordinate System:
 * - Uses millimeters (mm) as the base unit
 * - Y-axis may need to be flipped depending on SES origin
 *
 * Transform:
 * - SES to Circuit JSON: scale based on resolution unit
 * - Mils to mm: 1 mil = 0.0254 mm
 */
export class InitializeSesContextStage extends SesConverterStage {
  step(): boolean {
    const { parsedSes } = this.ctx

    // Extract resolution information from routes section
    const routes = parsedSes.routes
    if (routes?.resolution) {
      this.ctx.sesUnit = routes.resolution.unit
      this.ctx.sesResolutionValue = routes.resolution.value
    } else if (parsedSes.placement?.resolution) {
      // Fallback to placement resolution
      this.ctx.sesUnit = parsedSes.placement.resolution.unit
      this.ctx.sesResolutionValue = parsedSes.placement.resolution.value
    }

    // Default to mils if not specified
    if (!this.ctx.sesUnit) {
      this.ctx.sesUnit = "mil"
      this.ctx.sesResolutionValue = 1000
    }

    // Calculate scale factor based on unit
    let scaleFactor: number
    const resolutionValue = this.ctx.sesResolutionValue || 1

    switch (this.ctx.sesUnit) {
      case "mil":
        // Convert mils to mm: 1 mil = 0.0254 mm
        // With resolution value, 1 design unit = 1/resolutionValue mils
        scaleFactor = 0.0254 / resolutionValue
        break
      case "mm":
        scaleFactor = 1 / resolutionValue
        break
      case "um":
        scaleFactor = 0.001 / resolutionValue
        break
      case "in":
        scaleFactor = 25.4 / resolutionValue
        break
      default:
        // Default to mils
        scaleFactor = 0.0254 / resolutionValue
    }

    // Calculate board center for translation (from placement if available)
    const boardCenter = this.calculateBoardCenter()

    // Build transform: translate to center, then scale
    this.ctx.sesToCircuitJsonTransformMatrix = compose(
      scale(scaleFactor, scaleFactor), // Scale
      translate(-boardCenter.x, -boardCenter.y), // Center at origin
    )

    // Initialize mappings
    this.ctx.padstackIdToInfo = new Map()
    this.ctx.netNameToId = new Map()
    this.ctx.netNameToSourceTraceId = new Map()
    this.ctx.pinRefToPortId = new Map()

    // Build padstack lookup table from library_out
    this.buildPadstackLookup()

    this.finished = true
    return false
  }

  /**
   * Calculate the center of the board from placements.
   * Used for centering the board at origin in Circuit JSON.
   */
  private calculateBoardCenter(): { x: number; y: number } {
    const { parsedSes } = this.ctx
    const placement = parsedSes.placement

    if (!placement) {
      return { x: 0, y: 0 }
    }

    // Collect all placement coordinates
    const xs: number[] = []
    const ys: number[] = []

    for (const component of placement.components) {
      for (const place of component.places) {
        if (place.x !== undefined) xs.push(place.x)
        if (place.y !== undefined) ys.push(place.y)
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
   * Build a lookup table from padstack IDs to their via diameter.
   */
  private buildPadstackLookup(): void {
    const { parsedSes } = this.ctx
    const libraryOut = parsedSes.routes?.libraryOut

    if (!libraryOut) return

    for (const padstack of libraryOut.padstacks) {
      if (!padstack.padstackId) continue

      // Get the first shape to determine via diameter
      const shape = padstack.shapes[0]
      if (!shape) continue

      // Shape contains otherChildren with circle elements for vias
      const shapeChildren = shape.otherChildren || []
      for (const child of shapeChildren) {
        if (child.token === "circle" || child.token === "circ") {
          const circleChild = child as DsnCircle
          this.ctx.padstackIdToInfo!.set(padstack.padstackId, {
            shape: "circle",
            diameter: circleChild.diameter,
          })
          break
        }
      }
    }
  }
}
