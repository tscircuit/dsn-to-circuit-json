import { BaseSolver } from "@tscircuit/solver-utils"
import type { PcbTrace, PcbVia } from "circuit-json"
import type { SpectraDsn } from "dsnts"

export class HangingTraceSolver extends BaseSolver {
  constructor(
    private input: {
      hangingTraces: PcbTrace[]
      hangingVias: PcbVia[]

      padAttachedTraces: PcbTrace[]
      padAttachedVias: PcbVia[]
    },
  ) {
    super()
  }

  override getOutput() {
    return {
      attachedTraces: this.input.padAttachedTraces,
      attachedVias: this.input.padAttachedVias,
    }
  }
}
