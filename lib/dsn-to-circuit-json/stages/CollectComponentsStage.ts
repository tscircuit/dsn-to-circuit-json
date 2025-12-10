import { DsnToCircuitJsonConverterStage } from "../types"
import { applyToPoint } from "transformation-matrix"

/**
 * CollectComponentsStage creates source_component and pcb_component elements
 * from DSN placement section.
 *
 * DSN Placement Section:
 * (placement
 *   (component <image_id>
 *     (place <component_ref> <x> <y> <side> <rotation> (PN <part_number>))
 *     (place <component_ref2> <x2> <y2> <side2> <rotation2> (PN <part_number2>))
 *   )
 * )
 *
 * This stage:
 * 1. Iterates through all components in the placement section
 * 2. Creates source_component elements (logical components)
 * 3. Creates pcb_component elements with transformed coordinates
 * 4. Builds mapping from component references to component IDs
 * 5. Builds mapping from image IDs to component IDs (for pad creation)
 *
 * Side mapping:
 * - "front" -> "top" layer in Circuit JSON
 * - "back" -> "bottom" layer in Circuit JSON
 *
 * Rotation:
 * - DSN rotation is in degrees (0-360)
 * - Circuit JSON rotation is also in degrees
 */
export class CollectComponentsStage extends DsnToCircuitJsonConverterStage {
  private processedComponents = new Set<string>()

  step(): boolean {
    const { specctraDsn: spectraDsn, dsnToCircuitJsonTransformMatrix } =
      this.ctx

    if (!dsnToCircuitJsonTransformMatrix) {
      throw new Error("Transform matrix not initialized")
    }

    const placement = spectraDsn.placement
    if (!placement) {
      this.finished = true
      return false
    }

    // Process each component definition (dsnts uses _components with underscored props)
    const components = placement.components || placement._components || []
    for (const component of components) {
      const imageId = component.imageId || component._imageId
      if (!imageId) continue

      // Initialize the image to components mapping if not exists
      if (!this.ctx.imageIdToComponentIds!.has(imageId)) {
        this.ctx.imageIdToComponentIds!.set(imageId, [])
      }

      // Process each placement of this component type (dsnts uses _places)
      const places = component.places || component._places || []
      for (const place of places) {
        const componentRef = place.componentRef || place._componentRef
        if (!componentRef || this.processedComponents.has(componentRef)) {
          continue
        }

        // Get position (dsnts uses _x, _y) - default to origin
        const x = place.x ?? place._x ?? 0
        const y = place.y ?? place._y ?? 0

        // Transform coordinates
        const transformed = applyToPoint(dsnToCircuitJsonTransformMatrix, {
          x,
          y,
        })

        // Get side (front/back -> top/bottom) - dsnts uses _side
        const side = place.side ?? place._side ?? "front"
        const layer = side === "back" ? "bottom" : "top"

        // Get rotation - dsnts uses _rotation
        const rotation = place.rotation ?? place._rotation ?? 0

        // Get part number (PN) if available
        const partNumber = this.extractPartNumber(place)

        // Create source_component (logical component)
        const sourceComponent = this.ctx.db.source_component.insert({
          name: componentRef,
          display_value: partNumber || "",
          ftype: "simple_chip", // Default type, could be inferred from imageId
        } as any)

        const sourceComponentId = sourceComponent.source_component_id

        // Create pcb_component (physical placement)
        const pcbComponent = this.ctx.db.pcb_component.insert({
          source_component_id: sourceComponentId,
          center: { x: transformed.x, y: transformed.y },
          layer,
          rotation,
          width: 0, // Will be computed from pads if needed
          height: 0,
        } as any)

        const pcbComponentId = pcbComponent.pcb_component_id

        // Store mappings
        this.ctx.componentRefToId!.set(componentRef, pcbComponentId)
        this.ctx.sourceComponentRefToId!.set(componentRef, sourceComponentId)
        this.ctx.imageIdToComponentIds!.get(imageId)!.push(pcbComponentId)

        this.processedComponents.add(componentRef)
      }
    }

    this.finished = true
    return false
  }

  /**
   * Extract part number (PN) from place definition.
   * DSN format: (place REF x y side rotation (PN "part_number"))
   */
  private extractPartNumber(place: any): string | undefined {
    // Check for PN property directly (dsnts uses _PN or similar)
    if (place.PN) return String(place.PN)
    if (place._PN) return String(place._PN)
    if (place.partNumber) return String(place.partNumber)
    if (place._partNumber) return String(place._partNumber)

    // Check in otherChildren for (PN ...) element (dsnts uses _otherChildren)
    const otherChildren = place.otherChildren || place._otherChildren || []
    for (const child of otherChildren) {
      if (child.token === "PN" || child.token === "pn") {
        // Try various property names
        return (
          child.value ||
          child._value ||
          child.partNumber ||
          child._partNumber ||
          (child.children && child.children[0]?.value)
        )
      }
    }

    return undefined
  }
}
