import { ConverterStage } from "../types"
import { applyToPoint } from "transformation-matrix"

/**
 * CollectComponentsStage creates pcb_component elements from DSN placement section.
 *
 * DSN Placement Section:
 * (placement
 *   (component <image_id>
 *     (place <component_ref> <x> <y> <side> <rotation>)
 *     (place <component_ref2> <x2> <y2> <side2> <rotation2>)
 *   )
 * )
 *
 * This stage:
 * 1. Iterates through all components in the placement section
 * 2. Creates pcb_component elements with transformed coordinates
 * 3. Builds mapping from component references to pcb_component_ids
 * 4. Builds mapping from image IDs to component IDs (for pad creation)
 *
 * Side mapping:
 * - "front" -> "top" layer in Circuit JSON
 * - "back" -> "bottom" layer in Circuit JSON
 *
 * Rotation:
 * - DSN rotation is in degrees (0-360)
 * - Circuit JSON rotation is also in degrees
 */
export class CollectComponentsStage extends ConverterStage {
  private processedComponents = new Set<string>()

  step(): boolean {
    const { spectraDsn, dsnToCircuitJsonTransformMatrix } = this.ctx

    if (!dsnToCircuitJsonTransformMatrix) {
      throw new Error("Transform matrix not initialized")
    }

    const placement = spectraDsn.placement
    if (!placement) {
      this.finished = true
      return false
    }

    // Process each component definition
    for (const component of placement.components || []) {
      const imageId = component.imageId
      if (!imageId) continue

      // Initialize the image to components mapping if not exists
      if (!this.ctx.imageIdToComponentIds!.has(imageId)) {
        this.ctx.imageIdToComponentIds!.set(imageId, [])
      }

      // Process each placement of this component type
      for (const place of component.places || []) {
        const componentRef = place.componentRef
        if (!componentRef || this.processedComponents.has(componentRef)) {
          continue
        }

        // Get position (default to origin)
        const x = place.x ?? 0
        const y = place.y ?? 0

        // Transform coordinates
        const transformed = applyToPoint(dsnToCircuitJsonTransformMatrix, {
          x,
          y,
        })

        // Get side (front/back -> top/bottom)
        const side = place.side ?? "front"
        const layer = side === "back" ? "bottom" : "top"

        // Get rotation
        const rotation = place.rotation ?? 0

        // Create pcb_component
        const inserted = this.ctx.db.pcb_component.insert({
          center: { x: transformed.x, y: transformed.y },
          layer,
          rotation,
          width: 0, // Will be computed from pads if needed
          height: 0,
        } as any)

        const componentId = inserted.pcb_component_id

        // Store mappings
        this.ctx.componentRefToId!.set(componentRef, componentId)
        this.ctx.imageIdToComponentIds!.get(imageId)!.push(componentId)

        this.processedComponents.add(componentRef)

        // Update stats
        if (this.ctx.stats) {
          this.ctx.stats.components = (this.ctx.stats.components || 0) + 1
        }
      }
    }

    this.finished = true
    return false
  }
}
