import { ConverterStage } from "../types"
import { applyToPoint, compose, rotate, translate } from "transformation-matrix"

/**
 * CollectPadsStage creates pcb_smtpad and pcb_plated_hole elements from DSN library images.
 *
 * DSN Library Section:
 * (library
 *   (image <image_id>
 *     (pin <padstack_id> <pin_id> <x> <y> [rotation])
 *   )
 *   (padstack <padstack_id>
 *     (shape (circle <layer> <diameter>))
 *     (shape (rect <layer> <x1> <y1> <x2> <y2>))
 *   )
 * )
 *
 * This stage:
 * 1. Iterates through all images in the library
 * 2. For each image, processes its pins
 * 3. Looks up padstack info to determine pad shape
 * 4. Creates pcb_smtpad or pcb_plated_hole elements
 * 5. Creates pcb_port elements for net connectivity
 *
 * Pin positions are relative to the component origin.
 * Final pad position = component_position + rotated(pin_position)
 */
export class CollectPadsStage extends ConverterStage {
  private processedImages = new Set<string>()

  step(): boolean {
    const { spectraDsn, dsnToCircuitJsonTransformMatrix } = this.ctx

    if (!dsnToCircuitJsonTransformMatrix) {
      throw new Error("Transform matrix not initialized")
    }

    const library = spectraDsn.library
    if (!library) {
      this.finished = true
      return false
    }

    // Process each image (footprint)
    for (const image of library.images || []) {
      const imageId = image.imageId
      if (!imageId || this.processedImages.has(imageId)) continue

      // Get all components that use this image
      const componentIds = this.ctx.imageIdToComponentIds?.get(imageId) || []
      if (componentIds.length === 0) {
        this.processedImages.add(imageId)
        continue
      }

      // Get component info for each placement
      for (const componentId of componentIds) {
        const pcbComponent = this.ctx.db.pcb_component
          .list()
          .find((c: any) => c.pcb_component_id === componentId)

        if (!pcbComponent) continue

        // Get component position and rotation
        const componentX = pcbComponent.center?.x ?? 0
        const componentY = pcbComponent.center?.y ?? 0
        const componentRotation = pcbComponent.rotation ?? 0
        const componentLayer = (pcbComponent as any).layer ?? "top"

        // Get the component reference from the reverse mapping
        let componentRef = ""
        for (const [ref, id] of this.ctx.componentRefToId!.entries()) {
          if (id === componentId) {
            componentRef = ref
            break
          }
        }

        // Process each pin in the image
        for (const pin of image.pins || []) {
          this.processPin(
            pin,
            componentId,
            componentRef,
            componentX,
            componentY,
            componentRotation,
            componentLayer,
            dsnToCircuitJsonTransformMatrix,
          )
        }
      }

      this.processedImages.add(imageId)
    }

    this.finished = true
    return false
  }

  private processPin(
    pin: any,
    componentId: string,
    componentRef: string,
    componentX: number,
    componentY: number,
    componentRotation: number,
    componentLayer: string,
    transformMatrix: any,
  ): void {
    const padstackId = pin.padstackId
    const pinId = pin.pinId
    const pinX = pin.x ?? 0
    const pinY = pin.y ?? 0
    const pinRotation = pin.rotation ?? 0

    if (!padstackId) return

    // Get padstack info
    const padstackInfo = this.ctx.padstackIdToInfo?.get(padstackId)
    if (!padstackInfo) {
      this.ctx.warnings?.push(
        `Unknown padstack: ${padstackId} for pin ${pinId}`,
      )
      return
    }

    // Pin position is in DSN coordinates relative to component
    // We need to:
    // 1. Convert pin position from DSN units to mm
    // 2. Apply component rotation to pin position
    // 3. Add to component position

    // First transform the pin offset from DSN to mm (just scaling)
    const DSN_TO_MM_SCALE = 1 / 1000
    const pinOffsetMm = {
      x: pinX * DSN_TO_MM_SCALE,
      y: -pinY * DSN_TO_MM_SCALE, // Flip Y for DSN to CJ
    }

    // Apply component rotation to pin offset
    const rotationRad = (componentRotation * Math.PI) / 180
    const rotatedPinOffset = {
      x:
        pinOffsetMm.x * Math.cos(rotationRad) -
        pinOffsetMm.y * Math.sin(rotationRad),
      y:
        pinOffsetMm.x * Math.sin(rotationRad) +
        pinOffsetMm.y * Math.cos(rotationRad),
    }

    // Calculate final pad position
    const padPosition = {
      x: componentX + rotatedPinOffset.x,
      y: componentY + rotatedPinOffset.y,
    }

    // Determine layer
    const layer = this.mapLayer(padstackInfo.layer, componentLayer)

    // Create pad based on shape
    if (padstackInfo.shape === "circle") {
      const diameter = (padstackInfo.diameter ?? 1000) * DSN_TO_MM_SCALE

      // Check if this is a through-hole (has "hole" in padstack name)
      if (padstackId.toLowerCase().includes("hole")) {
        this.ctx.db.pcb_plated_hole.insert({
          pcb_component_id: componentId,
          x: padPosition.x,
          y: padPosition.y,
          shape: "circle",
          outer_diameter: diameter,
          hole_diameter: diameter * 0.5, // Estimate hole size
          layers: ["top", "bottom"],
          port_hints: [pinId],
        } as any)
      } else {
        this.ctx.db.pcb_smtpad.insert({
          pcb_component_id: componentId,
          x: padPosition.x,
          y: padPosition.y,
          shape: "circle",
          radius: diameter / 2,
          layer,
          port_hints: [pinId],
        } as any)
      }
    } else if (padstackInfo.shape === "rect") {
      const width = (padstackInfo.width ?? 1000) * DSN_TO_MM_SCALE
      const height = (padstackInfo.height ?? 1000) * DSN_TO_MM_SCALE

      this.ctx.db.pcb_smtpad.insert({
        pcb_component_id: componentId,
        x: padPosition.x,
        y: padPosition.y,
        shape: "rect",
        width,
        height,
        layer,
        port_hints: [pinId],
      } as any)
    } else if (padstackInfo.shape === "polygon") {
      const coords = padstackInfo.coordinates || []
      const points: Array<{ x: number; y: number }> = []

      for (let i = 0; i < coords.length; i += 2) {
        if (coords[i] !== undefined && coords[i + 1] !== undefined) {
          points.push({
            x: padPosition.x + coords[i]! * DSN_TO_MM_SCALE,
            y: padPosition.y - coords[i + 1]! * DSN_TO_MM_SCALE,
          })
        }
      }

      if (points.length > 0) {
        this.ctx.db.pcb_smtpad.insert({
          pcb_component_id: componentId,
          shape: "polygon",
          points,
          layer,
          port_hints: [pinId],
        } as any)
      }
    }

    // Create pcb_port for net connectivity
    const pinRef = `${componentRef}-${pinId}`
    const portInserted = this.ctx.db.pcb_port.insert({
      pcb_component_id: componentId,
      x: padPosition.x,
      y: padPosition.y,
      layers: [layer],
    } as any)

    this.ctx.pinRefToPortId!.set(pinRef, portInserted.pcb_port_id)

    // Update stats
    if (this.ctx.stats) {
      this.ctx.stats.pads = (this.ctx.stats.pads || 0) + 1
    }
  }

  /**
   * Maps DSN layer name to Circuit JSON layer.
   */
  private mapLayer(
    dsnLayer: string | undefined,
    componentLayer: string,
  ): "top" | "bottom" {
    if (!dsnLayer) return componentLayer as "top" | "bottom"

    const layerLower = dsnLayer.toLowerCase()
    if (
      layerLower.includes("b.cu") ||
      layerLower.includes("bottom") ||
      layerLower.includes("back")
    ) {
      return "bottom"
    }
    return "top"
  }
}
