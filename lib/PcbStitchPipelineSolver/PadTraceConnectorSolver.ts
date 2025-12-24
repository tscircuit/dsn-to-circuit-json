import Flatten from "@flatten-js/core"
import type * as FlattenTypes from "@flatten-js/core"
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
import { getPadShape, type PadShape } from "./utils/getPadShape"
import {
  doesWirePathIntersectShape,
  extractPointsFromCoordinates,
  Point,
  Box,
  Circle,
  Polygon,
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
   * Finds all unused wires that have a path intersecting with the pad's actual shape.
   *
   * The method:
   * 1. Gets the pad's actual shape (circle, polygon, or box) in DSN coordinates
   * 2. Transforms the shape to real (mm) coordinates
   * 3. Iterates through all unused wires
   * 4. Extracts and transforms wire points to real (mm) coordinates
   * 5. Checks if the wire path intersects with the actual pad shape
   * 6. Returns matching wires (and marks them as used)
   *
   * Note: DSN and SES use different coordinate scales, so we convert both
   * to real (mm) coordinates before comparison.
   */
  getWiresConnectedToPad(pad: SpecificDsnPad): Array<SpecificSesWire> {
    const dsnPadShape = getPadShape(pad)
    const dsnToReal = this.input.dsnToRealTransform

    // Transform pad shape from DSN coordinates to real (mm) coordinates
    const realPadShape = this.transformPadShape(dsnPadShape, dsnToReal)

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

      if (doesWirePathIntersectShape(realWirePoints, realPadShape)) {
        connectedWires.push(specificWire)
        this.usedWires.push(specificWire)
      } else {
        stillUnusedWires.push(specificWire)
      }
    }

    this.unusedWires = stillUnusedWires
    return connectedWires
  }

  /**
   * Transforms a pad shape from DSN coordinates to real (mm) coordinates.
   */
  private transformPadShape(shape: PadShape, transform: Matrix): PadShape {
    switch (shape.type) {
      case "circle": {
        const circle = shape.shape
        const center = applyToPoint(transform, {
          x: circle.center.x,
          y: circle.center.y,
        })
        // Scale the radius by the transform's scale factor
        // For uniform scaling, we can use the x scale
        const scale = Math.abs(transform.a)
        return {
          type: "circle",
          shape: new Circle(new Point(center.x, center.y), circle.r * scale),
        }
      }

      case "polygon": {
        const polygon = shape.shape
        const newPolygon = new Polygon()
        for (const face of polygon.faces) {
          const transformedPoints: Flatten.Point[] = []
          for (const edge of face.edges) {
            const start = applyToPoint(transform, {
              x: edge.start.x,
              y: edge.start.y,
            })
            transformedPoints.push(new Point(start.x, start.y))
          }
          if (transformedPoints.length > 0) {
            transformedPoints.push(transformedPoints[0]!) // Close the polygon
            newPolygon.addFace(transformedPoints)
          }
        }
        return { type: "polygon", shape: newPolygon }
      }

      case "box": {
        const box = shape.shape
        const minPoint = applyToPoint(transform, {
          x: box.xmin,
          y: box.ymin,
        })
        const maxPoint = applyToPoint(transform, {
          x: box.xmax,
          y: box.ymax,
        })
        return {
          type: "box",
          shape: new Box(
            Math.min(minPoint.x, maxPoint.x),
            Math.min(minPoint.y, maxPoint.y),
            Math.max(minPoint.x, maxPoint.x),
            Math.max(minPoint.y, maxPoint.y),
          ),
        }
      }

      default:
        return shape
    }
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

    // Visualize all pad shapes for debugging
    const dsnToReal = this.input.dsnToRealTransform
    const allPads = [
      ...this.queuedPads,
      ...(this.currentPad ? [this.currentPad] : []),
    ]

    for (const pad of allPads) {
      const dsnPadShape = getPadShape(pad)
      const realPadShape = this.transformPadShape(dsnPadShape, dsnToReal)

      switch (realPadShape.type) {
        case "circle": {
          const circle = realPadShape.shape
          graphics.circles!.push({
            center: { x: circle.center.x, y: circle.center.y },
            radius: circle.r,
            stroke: "blue",
            label: `pad-${pad.pin.pinId}`,
          })
          break
        }

        case "polygon": {
          // For polygons, draw lines connecting the vertices
          const polygon = realPadShape.shape
          for (const face of polygon.faces) {
            for (const edge of face.edges) {
              graphics.lines!.push({
                points: [
                  { x: edge.start.x, y: edge.start.y },
                  { x: edge.end.x, y: edge.end.y },
                ],
                strokeColor: "blue",
              })
            }
          }
          break
        }

        case "box": {
          const box = realPadShape.shape
          graphics.rects!.push({
            center: {
              x: (box.xmin + box.xmax) / 2,
              y: (box.ymin + box.ymax) / 2,
            },
            width: Math.abs(box.xmax - box.xmin),
            height: Math.abs(box.ymax - box.ymin),
            stroke: "blue",
            label: `pad-${pad.pin.pinId}`,
          })
          break
        }
      }
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
