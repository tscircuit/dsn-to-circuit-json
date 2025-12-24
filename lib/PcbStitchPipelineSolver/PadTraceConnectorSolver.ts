import Flatten from "@flatten-js/core"
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
  doesWirePathIntersectBox,
  extractPointsFromCoordinates,
  Point,
  Box,
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
      x: dsnPadBounds.xmin,
      y: dsnPadBounds.ymin,
    })
    const maxPoint = applyToPoint(dsnToReal, {
      x: dsnPadBounds.xmax,
      y: dsnPadBounds.ymax,
    })

    const realPadBounds = new Box(
      Math.min(minPoint.x, maxPoint.x),
      Math.min(minPoint.y, maxPoint.y),
      Math.max(minPoint.x, maxPoint.x),
      Math.max(minPoint.y, maxPoint.y),
    )

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
      const realWirePoints = sesWirePoints.map((p) => {
        const transformed = applyToPoint(sesToReal, { x: p.x, y: p.y })
        return new Point(transformed.x, transformed.y)
      })

      if (doesWirePathIntersectBox(realWirePoints, realPadBounds)) {
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

    // Visualize all pad bounds for debugging
    const dsnToReal = this.input.dsnToRealTransform
    const allPads = [
      ...this.queuedPads,
      ...(this.currentPad ? [this.currentPad] : []),
    ]

    for (const pad of allPads) {
      const dsnPadBounds = calculatePadBounds(pad)
      const minPoint = applyToPoint(dsnToReal, {
        x: dsnPadBounds.xmin,
        y: dsnPadBounds.ymin,
      })
      const maxPoint = applyToPoint(dsnToReal, {
        x: dsnPadBounds.xmax,
        y: dsnPadBounds.ymax,
      })

      graphics.rects!.push({
        center: {
          x: (minPoint.x + maxPoint.x) / 2,
          y: (minPoint.y + maxPoint.y) / 2,
        },
        width: Math.abs(maxPoint.x - minPoint.x),
        height: Math.abs(maxPoint.y - minPoint.y),
        stroke: "blue",
        label: `pad-${pad.pin.pinId}`,
      })
    }

    // Visualize unused wires in red
    const unusedWireGraphics = visualizeSesWires(
      this.unusedWires.map((w) => w.wire),
      {
        sesToRealTransform: this.input.sesToRealTransform,
      },
    )
    // Override colors to red for unused
    for (const line of unusedWireGraphics.lines ?? []) {
      line.strokeColor = "red"
    }
    for (const circle of unusedWireGraphics.circles ?? []) {
      circle.fill = "red"
    }
    graphics = mergeGraphics(graphics, unusedWireGraphics)

    // Visualize used wires in green
    const usedWireGraphics = visualizeSesWires(
      this.usedWires.map((w) => w.wire),
      {
        sesToRealTransform: this.input.sesToRealTransform,
      },
    )
    // Override colors to green for used
    for (const line of usedWireGraphics.lines ?? []) {
      line.strokeColor = "green"
    }
    for (const circle of usedWireGraphics.circles ?? []) {
      circle.fill = "green"
    }
    graphics = mergeGraphics(graphics, usedWireGraphics)

    return graphics
  }
}
