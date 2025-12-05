import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util"
import type { SpectraSes } from "dsnts"
import type { Matrix } from "transformation-matrix"

/**
 * Context object shared between all SES converter stages.
 * Contains the parsed SES, database for circuit JSON construction,
 * and various mappings needed during conversion.
 */
export interface SesConverterContext {
  /**
   * The parsed SES file structure from dsnts
   */
  parsedSes: SpectraSes

  /**
   * Circuit JSON utility objects for building the output
   */
  db: CircuitJsonUtilObjects

  /**
   * Transformation matrix from SES coordinates to Circuit JSON coordinates.
   * SES typically uses mils, Circuit JSON uses millimeters (mm).
   */
  sesToCircuitJsonTransformMatrix?: Matrix

  /**
   * The resolution/scale factor from SES file.
   * Typically from (resolution mil 1000) in routes section.
   */
  sesResolutionValue?: number

  /**
   * The unit from SES file (e.g., "mil", "mm")
   */
  sesUnit?: string

  /**
   * Maps SES net name to source_net_id.
   */
  netNameToId?: Map<string, string>

  /**
   * Maps padstack ID to via diameter.
   * Vias are always circular.
   */
  padstackIdToInfo?: Map<
    string,
    {
      shape: "circle"
      diameter?: number
    }
  >
}

/**
 * Abstract base class for SES converter stages.
 * Each stage performs a specific part of the SES to Circuit JSON conversion.
 */
export abstract class SesConverterStage {
  MAX_ITERATIONS = 1000
  iteration = 0
  finished = false

  protected ctx: SesConverterContext

  constructor(ctx: SesConverterContext) {
    this.ctx = ctx
  }

  /**
   * Execute one step of the conversion stage.
   * Returns true if the stage needs more iterations, false if complete.
   */
  abstract step(): boolean

  /**
   * Run the stage until completion.
   */
  runUntilFinished(): void {
    while (!this.finished) {
      this.iteration++
      if (this.iteration > this.MAX_ITERATIONS) {
        throw new Error(`Max iterations reached in ${this.constructor.name}`)
      }
      this.step()
    }
  }
}
