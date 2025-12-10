import { BaseSolver } from "@tscircuit/solver-utils"
import type { PcbTrace, PcbVia } from "circuit-json"
import type { DsnPin, SpectraDsn } from "dsnts"
import type { GraphicsObject } from "graphics-debug"

export class PadTraceConnectorSolver extends BaseSolver {
  queuedPads: DsnPin[] = []

  constructor(
    private input: {
      sesOutputTraces: PcbTrace[]
      sesOutputVias: PcbVia[]
      inputDsn: SpectraDsn
    },
  ) {
    super()
  }

  override _setup(): void {}

  override _step(): void {}

  override visualize(): GraphicsObject {}
}
