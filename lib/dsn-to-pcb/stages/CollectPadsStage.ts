import { ConverterStage } from "../types"
import { applyToPoint, compose, rotate, translate } from "transformation-matrix"

/**
 * CollectPadsStage creates pcb_smtpad, pcb_plated_hole, source_port, and pcb_port
 * elements from DSN library images.
 *
 * DSN Library Section:
 * (library
 *   (image <image_id>
 *     (pin <padstack_id> <pin_id> <x> <y> [rotation])
 *   )
 *   (padstack <padstack_id>
 *     (shape (circle <layer> <diameter>))
 *     (shape (rect <layer> <x1> <y1> <x2> <y2>))
 *     (shape (polygon <layer> <width> <x1> <y1> ... <xn> <yn>))
 *     (shape (path <layer> <width> <x1> <y1> <x2> <y2>))
 *   )
 * )
 *
 * This stage:
 * 1. Iterates through all images in the library
 * 2. For each image, processes its pins
 * 3. Looks up padstack info to determine pad shape
 * 4. Creates pcb_smtpad or pcb_plated_hole elements
 * 5. Creates source_port elements (logical ports)
 * 6. Creates pcb_port elements for net connectivity
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

    // Process each image (footprint) - dsnts uses _images and _imageId
    const images = library.images
    for (const image of images) {
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

        // Process each pin in the image (dsnts uses _pins)
        const pins = image.pins
        for (const pin of pins) {
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
    // dsnts uses underscored properties
    // DSN pin format: (pin <padstack_id> <pin_number> <x> <y>)
    // dsnts parses: _padstackId, _x (pin number!), _y (x coord), _rotation (y coord)
    const padstackId = pin.padstackId || pin._padstackId
    const pinId = String(pin.pinId ?? pin._x ?? "") // _x is actually pin number
    const pinX = pin.x ?? pin._y ?? 0 // _y is actually x coordinate
    const pinY = pin.y ?? pin._rotation ?? 0 // _rotation is actually y coordinate

    if (!padstackId) return

    // Get padstack info
    const padstackInfo = this.ctx.padstackIdToInfo?.get(padstackId)
    if (!padstackInfo) {
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
      y: pinY * DSN_TO_MM_SCALE,
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

    // Determine layer from padstack or component
    const layer = this.mapLayer(padstackInfo.layer, componentLayer)

    // Get the source_component_id for this component
    const sourceComponentId = this.ctx.sourceComponentRefToId?.get(componentRef)

    // Create source_port (logical port) first
    const sourcePort = this.ctx.db.source_port.insert({
      source_component_id: sourceComponentId,
      name: `${componentRef}-${pinId}`,
      pin_number: this.parsePinNumber(pinId),
      port_hints: [pinId],
    } as any)

    let pcbSmtpadId: string | undefined
    let pcbPlatedHoleId: string | undefined

    // Create pad based on shape
    if (padstackInfo.shape === "circle") {
      const diameter = (padstackInfo.diameter ?? 1000) * DSN_TO_MM_SCALE

      // Check if this is a through-hole (has "hole" in padstack name or is a via)
      if (
        padstackId.toLowerCase().includes("hole") ||
        padstackId.toLowerCase().includes("through")
      ) {
        const platedHole = this.ctx.db.pcb_plated_hole.insert({
          pcb_component_id: componentId,
          x: padPosition.x,
          y: padPosition.y,
          shape: "circle",
          outer_diameter: diameter,
          hole_diameter: diameter * 0.5, // Estimate hole size
          layers: ["top", "bottom"],
          port_hints: [pinId],
        } as any)
        pcbPlatedHoleId = platedHole.pcb_plated_hole_id
      } else {
        const smtpad = this.ctx.db.pcb_smtpad.insert({
          pcb_component_id: componentId,
          x: padPosition.x,
          y: padPosition.y,
          shape: "circle",
          radius: diameter / 2,
          layer,
          port_hints: [pinId],
        } as any)
        pcbSmtpadId = smtpad.pcb_smtpad_id
      }
    } else if (padstackInfo.shape === "rect") {
      const width = (padstackInfo.width ?? 1000) * DSN_TO_MM_SCALE
      const height = (padstackInfo.height ?? 1000) * DSN_TO_MM_SCALE

      const smtpad = this.ctx.db.pcb_smtpad.insert({
        pcb_component_id: componentId,
        x: padPosition.x,
        y: padPosition.y,
        shape: "rect",
        width,
        height,
        layer,
        port_hints: [pinId],
      } as any)
      pcbSmtpadId = smtpad.pcb_smtpad_id
    } else if (padstackInfo.shape === "polygon") {
      // For polygon pads, calculate bounding box and use rect approximation
      const coords = padstackInfo.coordinates || []

      if (coords.length >= 4) {
        let minX = Infinity
        let maxX = -Infinity
        let minY = Infinity
        let maxY = -Infinity

        for (let i = 0; i < coords.length; i += 2) {
          if (coords[i] !== undefined && coords[i + 1] !== undefined) {
            minX = Math.min(minX, coords[i]!)
            maxX = Math.max(maxX, coords[i]!)
            minY = Math.min(minY, coords[i + 1]!)
            maxY = Math.max(maxY, coords[i + 1]!)
          }
        }

        const width = Math.abs(maxX - minX) * DSN_TO_MM_SCALE
        const height = Math.abs(maxY - minY) * DSN_TO_MM_SCALE

        const smtpad = this.ctx.db.pcb_smtpad.insert({
          pcb_component_id: componentId,
          x: padPosition.x,
          y: padPosition.y,
          shape: "rect",
          width: width || 0.1,
          height: height || 0.1,
          layer,
          port_hints: [pinId],
        } as any)
        pcbSmtpadId = smtpad.pcb_smtpad_id
      }
    }

    // Create pcb_port for net connectivity
    const pinRef = `${componentRef}-${pinId}`
    const pcbPort = this.ctx.db.pcb_port.insert({
      pcb_component_id: componentId,
      source_port_id: sourcePort.source_port_id,
      pcb_smtpad_id: pcbSmtpadId,
      pcb_plated_hole_id: pcbPlatedHoleId,
      x: padPosition.x,
      y: padPosition.y,
      layers: [layer],
    } as any)

    this.ctx.pinRefToPortId!.set(pinRef, pcbPort.pcb_port_id)
  }

  /**
   * Parse pin number from pin ID.
   * Handles formats like "1", "Pad1", "A1", etc.
   */
  private parsePinNumber(pinId: string): number | undefined {
    if (!pinId) return undefined

    // Try to extract number from the pin ID
    const match = pinId.match(/(\d+)/)
    if (match) {
      return parseInt(match[1]!, 10)
    }
    return undefined
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
