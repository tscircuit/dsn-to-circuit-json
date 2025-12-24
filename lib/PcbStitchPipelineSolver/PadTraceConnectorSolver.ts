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
import { applyToPoint, type Matrix } from "transformation-matrix"
import { visualizeSesWires } from "./visualize/visualizeSesWires"
import { calculatePadBounds } from "./utils/calculatePadBounds"
import {
  doesWirePathIntersectBounds,
  extractPointsFromCoordinates,
} from "./utils/geometryUtils"

export interface SpecificDsnPad {
  pin: DsnPin
  image: DsnImage
  padstack: DsnPadstack
  placementComponent: DsnComponent
}

export interface SpecificSesWire {
  specificSesWireId: string
  net: SesNet
  wire: SesWire
  parentWire?: SpecificSesWire
}

export class PadTraceConnectorSolver extends BaseSolver {
  queuedPads: Array<SpecificDsnPad> = []

  unusedWires: Array<SpecificSesWire> = []

  usedWires: Array<SpecificSesWire> = []

  currentPad?: SpecificDsnPad
  exploredWires?: SpecificSesWire[]
  currentLeafWires?: Array<SpecificSesWire>

  constructor(
    private input: {
      dsn: SpectraDsn
      ses: SpectraSes
      dsnToRealTransform: Matrix
      sesToRealTransform: Matrix
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
          specificSesWireId: `wire${wireCount++}`,
          net,
          wire,

          // store all vias that this wire is connected to
          // vias: this.getViasConnectedToWire(net, wire)
        })
      }
    }
  }

  override _step(): void {
    if (this.queuedPads.length <= 0 && !this.currentPad) {
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
      this.currentPad = undefined
      return
    }

    // We're exploring a currentPad, there are two ways that we stop exploring
    // and say the pad is done:
    // 1. We reached the end of all the wires, there's no more leaves to explore
    // 2. We hit another pad! Yay we figured out this trace

    // Check if any leaf is connected to another pad
    for (const leaf of this.currentLeafWires!) {
      // TODO: Check if leaf is connected to another pad
    }

    const nextLeaves: SpecificSesWire[] = []
    for (const leaf of this.currentLeafWires!) {
      // Find any other wires this leaf is connected to
      const otherWires = this.getUnusedWiresConnectedToWire(leaf)
      nextLeaves.push(...otherWires)
      // NOTE: otherWires[*] has .parentWire set to leaf
    }

    this.currentLeafWires = nextLeaves
  }

  /**
   * Finds all unused wires that have a path intersecting with the pad's bounds.
   *
   * The method:
   * 1. Calculates the pad's bounding box in DSN coordinates
   * 2. Transforms pad bounds to real (mm) coordinates
   * 3. Iterates through all unused wires
   * 4. Extracts and transforms wire points to real (mm) coordinates
   * 5. Checks if the wire path intersects with the pad bounds
   * 6. Returns matching wires (and marks them as used)
   *
   * Note: DSN and SES use different coordinate scales, so we convert both
   * to real (mm) coordinates before comparison.
   */
  getWiresConnectedToPad(pad: SpecificDsnPad): Array<SpecificSesWire> {
    const dsnPadBounds = calculatePadBounds(pad)

    // Transform pad bounds from DSN coordinates to real (mm) coordinates
    const dsnToReal = this.input.dsnToRealTransform
    const minPoint = applyToPoint(dsnToReal, {
      x: dsnPadBounds.minX,
      y: dsnPadBounds.minY,
    })
    const maxPoint = applyToPoint(dsnToReal, {
      x: dsnPadBounds.maxX,
      y: dsnPadBounds.maxY,
    })

    const realPadBounds = {
      minX: Math.min(minPoint.x, maxPoint.x),
      maxX: Math.max(minPoint.x, maxPoint.x),
      minY: Math.min(minPoint.y, maxPoint.y),
      maxY: Math.max(minPoint.y, maxPoint.y),
      centerX: (minPoint.x + maxPoint.x) / 2,
      centerY: (minPoint.y + maxPoint.y) / 2,
      halfWidth: Math.abs(maxPoint.x - minPoint.x) / 2,
      halfHeight: Math.abs(maxPoint.y - minPoint.y) / 2,
    }

    const connectedWires: SpecificSesWire[] = []
    const stillUnusedWires: SpecificSesWire[] = []
    const sesToReal = this.input.sesToRealTransform

    for (const specificWire of this.unusedWires) {
      const wirePath = specificWire.wire.path
      if (!wirePath) {
        stillUnusedWires.push(specificWire)
        continue
      }

      const coordinates = wirePath.coordinates ?? []
      if (coordinates.length < 2) {
        stillUnusedWires.push(specificWire)
        continue
      }

      // Extract wire points and transform to real (mm) coordinates
      const sesWirePoints = extractPointsFromCoordinates(coordinates)
      const realWirePoints = sesWirePoints.map((p) =>
        applyToPoint(sesToReal, p),
      )

      if (doesWirePathIntersectBounds(realWirePoints, realPadBounds)) {
        connectedWires.push(specificWire)
        this.usedWires.push(specificWire)
      } else {
        stillUnusedWires.push(specificWire)
      }
    }

    this.unusedWires = stillUnusedWires
    return connectedWires
  }

  getUnusedWiresConnectedToWire(wire: SpecificSesWire): Array<SpecificSesWire> {
    // TODO: Implement wire-to-wire connection logic
    return []
  }

  override getOutput() {
    // TODO: Return actual traced results
    return {
      padAttachedTraces: [] as any[],
      padAttachedVias: [] as any[],
      hangingTraces: [] as any[],
      hangingVias: [] as any[],
    }
  }

  override visualize(): GraphicsObject {
    let graphics: GraphicsObject = {
      lines: [],
      circles: [],
      rects: [],
      texts: [],
    }

    //TODO: the traces should come from the solver
    const allWiresFromInput: SesWire[] = []
    const nets = this.input.ses.routes?.networkOut?.nets ?? []
    for (const net of nets) {
      for (const wire of net.wires ?? []) {
        allWiresFromInput.push(wire)
      }
    }

    const sesWireGraphics = visualizeSesWires(allWiresFromInput, {
      sesToRealTransform: this.input.sesToRealTransform,
    })

    graphics = mergeGraphics(graphics, sesWireGraphics)

    return graphics
  }
}
