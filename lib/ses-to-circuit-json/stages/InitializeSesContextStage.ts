import { SesToCircuitJsonConverterStage } from "../types"
import { scale } from "transformation-matrix"
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
export class InitializeSesContextStage extends SesToCircuitJsonConverterStage {
  step(): boolean {
    const { ses: parsedSes } = this.ctx

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

    // For SES files, we do a direct coordinate conversion without centering.
    // SES routes are meant to be applied on top of existing DSN placements,
    // so we should preserve the original coordinate system.
    // Only scale from SES units to mm.
    this.ctx.sesToCircuitJsonTransformMatrix = scale(scaleFactor, scaleFactor)

    // Initialize mappings
    this.ctx.padstackIdToViaShape = new Map()

    // Build padstack lookup table from library_out
    this.buildPadstackLookup()

    this.finished = true
    return false
  }

  /**
   * Build a lookup table from padstack IDs to their via diameter.
   */
  private buildPadstackLookup(): void {
    const { ses: spectraDsn } = this.ctx
    const libraryOut = spectraDsn.routes?.libraryOut

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
          this.ctx.padstackIdToViaShape!.set(padstack.padstackId, {
            shape: "circle",
            diameter: circleChild.diameter,
          })
          break
        }
      }
    }
  }
}
