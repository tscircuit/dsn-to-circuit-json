import { BaseSolver } from "@tscircuit/solver-utils"
import type { PcbTrace, PcbVia } from "circuit-json"
import type {
  DsnComponent,
  DsnImage,
  DsnNet,
  DsnNetwork,
  DsnPadstack,
  DsnPin,
  DsnPlacement,
  DsnVia,
  DsnWire,
  SesNet,
  SesWire,
  SpectraDsn,
  SpectraSes,
} from "dsnts"
import { mergeGraphics, type GraphicsObject } from "graphics-debug"
import { visualizeSpecificDsnPad } from "./visualize/visualizeSpecificDsnPad"

export interface SpecificDsnPad {
  pin: DsnPin
  image: DsnImage
  padstack: DsnPadstack
  placementComponent: DsnComponent
}

export interface SpecificDsnWire {
  specificDsnWireId: string
  net: SesNet
  wire: SesWire
  parentWire?: SpecificDsnWire
}

export class PadTraceConnectorSolver extends BaseSolver {
  queuedPads: Array<SpecificDsnPad> = []

  unusedWires: Array<SpecificDsnWire> = []

  usedWires: Array<SpecificDsnWire> = []

  currentPad?: SpecificDsnPad
  exploredWires?: SpecificDsnWire[]
  currentLeafWires?: Array<SpecificDsnWire>

  constructor(
    private input: {
      dsn: SpectraDsn
      ses: SpectraSes
    },
  ) {
    super()
  }

  override _setup(): void {
    const placementComponents = this.input.dsn.placement!.components!

    for (const placementComponent of placementComponents) {
      const image = this.input.dsn.library?.images.find(
        (image) => image.imageId === placementComponent.imageId,
      )

      if (!image) {
        throw new Error(
          `Image not found for placement ${placementComponent.imageId}`,
        )
      }

      for (const pin of image.pins) {
        this.queuedPads.push({
          pin,
          image,
          placementComponent,
          padstack: this.input.dsn.library!.padstacks.find(
            (ps) => ps.padstackId === pin.padstackId,
          )!,
        })
      }
    }

    let wireCount = 0
    for (const net of this.input.ses.routes!.networkOut!.nets) {
      for (const wire of net.wires) {
        this.unusedWires.push({
          specificDsnWireId: `wire${wireCount++}`,
          net,
          wire,

          // store all vias that this wire is connected to
          // vias: this.getViasConnectedToWire(net, wire)
        })
      }
    }
  }

  override _step(): void {
    if (this.queuedPads.length <= 0) {
      this.solved = true
      return
    }

    if (!this.currentPad) {
      this.currentPad = this.queuedPads.shift()!
      this.exploredWires = []
      this.currentLeafWires = this.getWiresConnectedToPad(this.currentPad)
      return
    }

    if (this.currentLeafWires!.length <= 0) {
      this.solved = true
      return
    }

    // We're explored a currentPad, there are two ways that we stop exploring
    // and say the pad is done:
    // 1. We reached the end of all the wires, there's no more leaves to explore
    // 2. We hit another pad! Yay we figured out this trace

    // Check if any leaf is connected to another pad
    for (const leaf of this.currentLeafWires!) {
      // Check if leaf is connected to another pad
    }

    const nextLeaves: SpecificDsnWire[] = []
    for (const leaf of this.currentLeafWires!) {
      // Find any other wires this leaf is connected to
      const otherWires = this.getUnusedWiresConnectedToWire(leaf)
      // NOTE: otherWires[*] has .parentWire set to leaf
    }

    this.currentLeafWires = nextLeaves
  }

  getWiresConnectedToPad(pad: SpecificDsnPad): Array<SpecificDsnWire> {
    // TODO
  }

  override visualize(): GraphicsObject {
    let graphics: GraphicsObject = {
      lines: [],
      circles: [],
      rects: [],
      texts: [],
    }

    if (this.currentPad) {
      graphics = mergeGraphics(
        graphics,
        visualizeSpecificDsnPad(this.currentPad),
      )
    }

    return graphics
  }
}
