import {
  BasePipelineSolver,
  definePipelineStep,
  type PipelineStep,
} from "@tscircuit/solver-utils"
import type { DsnVia, SpectraDsn, SpectraSes, Wire } from "dsnts"
import { mergeGraphics, type GraphicsObject } from "graphics-debug"
import { PadTraceConnectorSolver } from "./PadTraceConnectorSolver"
import { HangingTraceSolver } from "./HangingTraceSolver"
import type { SesConverterContext } from "../ses-to-circuit-json/types"
import { visualizeSpecctraDsn } from "./visualize/visualizeSpecctraDsn"
import { compose, scale, translate, type Matrix } from "transformation-matrix"

export interface PcbStitchInputProblem {
  ses: SpectraSes
  dsn: SpectraDsn
}

type AggregatedTraceId = string
export interface PcbStitchOutput {
  aggregatedTraces: Array<{
    aggregatedTraceId: AggregatedTraceId
    wires: Wire[]
    vias: DsnVia[]
  }>
}

export class PcbStitchPipelineSolver extends BasePipelineSolver<PcbStitchInputProblem> {
  get iteration(): number {
    return this.iterations
  }
  get finished(): boolean {
    return Boolean(this.solved || this.error)
  }
  protected ctx: SesConverterContext = null as any
  runUntilFinished(): void {
    this.initializeTransforms()
    this.solve()
  }

  padTraceConnector?: PadTraceConnectorSolver
  hangingTrace?: HangingTraceSolver

  dsnToRealTransform!: Matrix
  sesToRealTransform!: Matrix

  override _setup(): void {
    this.initializeTransforms()
  }

  initializeTransforms(): void {
    if (
      this.dsnToRealTransform !== undefined &&
      this.sesToRealTransform !== undefined
    ) {
      return
    }

    this.dsnToRealTransform = this.createDsnToRealTransform()
    this.sesToRealTransform = this.createSesToRealTransform()
  }

  private createDsnToRealTransform(): Matrix {
    // TODO: parse the resolution unit and value
    const dsn = this.inputProblem.dsn.resolution
    const DSN_TO_MM_SCALE = 1 / 1000 // um to mm

    // Calculate board center for centering at origin
    const boardCenter = this.calculateDsnBoardCenter()

    // Build transform: translate to center, then scale
    return compose(
      scale(DSN_TO_MM_SCALE, DSN_TO_MM_SCALE),
      translate(-boardCenter.x, -boardCenter.y),
    )
  }

  private createSesToRealTransform(): Matrix {
    // TODO: parse the resolution unit and value
    const ses = this.inputProblem.ses
    const SES_TO_MM_SCALE = 1 / 10000 // um to mm

    return scale(SES_TO_MM_SCALE, SES_TO_MM_SCALE)
  }

  /**
   * Calculate the center of the board from the DSN boundary.
   * Used for centering the board at origin in real coordinates.
   */
  private calculateDsnBoardCenter(): { x: number; y: number } {
    const boundary = this.inputProblem.dsn.structure?.boundary

    if (!boundary) {
      return { x: 0, y: 0 }
    }

    // Collect all boundary points
    const xs: number[] = []
    const ys: number[] = []

    // Process paths
    for (const path of boundary.paths || []) {
      const coords = path.coordinates || []
      for (let i = 0; i < coords.length; i += 2) {
        if (coords[i] !== undefined && coords[i + 1] !== undefined) {
          xs.push(coords[i]!)
          ys.push(coords[i + 1]!)
        }
      }
    }

    // Process rects
    for (const rect of boundary.rects || []) {
      if (
        rect.x1 !== undefined &&
        rect.y1 !== undefined &&
        rect.x2 !== undefined &&
        rect.y2 !== undefined
      ) {
        xs.push(rect.x1, rect.x2)
        ys.push(rect.y1, rect.y2)
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

  override pipelineDef: PipelineStep<any>[] = [
    definePipelineStep(
      "padTraceConnector",
      PadTraceConnectorSolver,
      (psp: PcbStitchPipelineSolver) => [
        {
          dsn: psp.inputProblem.dsn,
          ses: psp.inputProblem.ses,
          dsnToRealTransform: psp.dsnToRealTransform,
          sesToRealTransform: psp.sesToRealTransform,
        },
      ],
    ),
    definePipelineStep(
      "hangingTrace",
      HangingTraceSolver,
      (psp: PcbStitchPipelineSolver) => {
        const {
          padAttachedTraces,
          padAttachedVias,
          hangingTraces,
          hangingVias,
        } = psp.padTraceConnector!.getOutput()

        return [
          {
            hangingTraces: hangingTraces,
            hangingVias: hangingVias,
            padAttachedTraces: padAttachedTraces,
            padAttachedVias: padAttachedVias,
          },
        ]
      },
    ),
  ]

  override visualize(): GraphicsObject {
    this.initializeTransforms()

    const subSolverGraphics = super.visualize()
    const dsnGraphics = visualizeSpecctraDsn(this.inputProblem.dsn, {
      dsnToRealTransform: this.dsnToRealTransform,
    })
    const merged = mergeGraphics(dsnGraphics, subSolverGraphics)

    return merged
  }
}
