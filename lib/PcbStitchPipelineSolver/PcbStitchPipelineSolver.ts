import {
  BasePipelineSolver,
  BaseSolver,
  definePipelineStep,
  type PipelineStep,
} from "@tscircuit/solver-utils"
import type { CircuitJson, PcbTrace, PcbVia } from "circuit-json"
import type { DsnPin, SpectraDsn } from "dsnts"
import type { GraphicsObject } from "graphics-debug"
import { PadTraceConnectorSolver } from "./PadTraceConnectorSolver"
import { HangingTraceSolver } from "./HangingTraceSolver"
import type {
  SesConverterContext,
  SesToCircuitJsonConverterStage,
} from "../ses-to-circuit-json/types"

export class PcbStitchPipelineSolver extends BasePipelineSolver<{
  sesOutputTraces: PcbTrace[]
  sesOutputVias: PcbVia[]
  inputDsn: SpectraDsn
}> {
  get iteration(): number {
    return this.iterations
  }
  get finished(): boolean {
    return Boolean(this.solved || this.error)
  }
  protected ctx: SesConverterContext = null as any
  runUntilFinished(): void {
    this.solve()
  }

  padTraceConnector?: PadTraceConnectorSolver
  hangingTrace?: HangingTraceSolver

  override pipelineDef: PipelineStep<any>[] = [
    definePipelineStep("padTraceConnector", PadTraceConnectorSolver, (psp) => [
      {
        sesOutputTraces: psp.inputProblem.sesOutputTraces,
        sesOutputVias: psp.inputProblem.sesOutputVias,
        inputDsn: psp.inputProblem.inputDsn,
      },
    ]),
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

  override _setup(): void {}

  override _step(): void {}

  override visualize(): GraphicsObject {}
}
