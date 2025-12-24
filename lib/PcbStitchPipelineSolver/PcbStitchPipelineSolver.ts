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

    return compose(scale(DSN_TO_MM_SCALE, DSN_TO_MM_SCALE))
  }

  private createSesToRealTransform(): Matrix {
    // TODO: parse the resolution unit and value
    const ses = this.inputProblem.ses
    const SES_TO_MM_SCALE = 1 / 10000 // um to mm

    return scale(SES_TO_MM_SCALE, SES_TO_MM_SCALE)
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
