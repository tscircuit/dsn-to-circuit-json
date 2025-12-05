import { cju } from "@tscircuit/circuit-json-util"
import type { CircuitJson } from "circuit-json"
import type { SesConverterContext, SesConverterStage } from "./types"
import { parseSpectraSes } from "dsnts"
import { InitializeSesContextStage } from "./stages/InitializeSesContextStage"
import { CollectSesRoutesStage } from "./stages/CollectSesRoutesStage"

/**
 * Converts a Specctra SES (Session) file to Circuit JSON format.
 *
 * SES files contain routing results from an autorouter. The structure includes:
 * - session: Root element with session name
 * - base_design: Reference to original DSN file
 * - placement: Component placement results
 * - was_is: Design changes/modifications
 * - routes: Wire routes and via placements
 *
 * The conversion is performed in stages:
 * 1. InitializeSesContextStage - Set up coordinate transforms and mappings
 * 3. CollectSesRoutesStage - Create pcb_trace and pcb_via elements from routes
 *
 * Usage:
 * ```typescript
 * const converter = new SesToCircuitJsonConverter(sesString)
 * converter.runUntilFinished()
 * const circuitJson = converter.getOutput()
 * ```
 */
export class SesToCircuitJsonConverter {
  ctx: SesConverterContext
  pipeline: SesConverterStage[]
  currentStageIndex = 0
  finished = false

  get currentStage(): SesConverterStage | undefined {
    return this.pipeline[this.currentStageIndex]
  }

  /**
   * Create a new converter from a SES string.
   * @param sesString - The raw SES file content as a string
   */
  constructor(sesString: string) {
    // Parse the SES file using dsnts parseSpectraSes
    const parsedSes = parseSpectraSes(sesString)

    // Initialize the context with parsed SES and empty circuit JSON database
    this.ctx = {
      parsedSes,
      db: cju([]), // Start with empty circuit JSON
    }

    // Set up the conversion pipeline
    this.pipeline = [
      new InitializeSesContextStage(this.ctx),
      new CollectSesRoutesStage(this.ctx),
    ]
  }

  /**
   * Execute one step of the current stage.
   */
  step(): void {
    if (!this.currentStage) {
      this.finished = true
      return
    }

    this.currentStage.step()

    if (this.currentStage.finished) {
      this.currentStageIndex++
      if (this.currentStageIndex >= this.pipeline.length) {
        this.finished = true
      }
    }
  }

  /**
   * Run all stages until the conversion is complete.
   */
  runUntilFinished(): void {
    while (!this.finished) {
      this.step()
    }
  }

  /**
   * Get the converted Circuit JSON as an array of elements.
   */
  getOutput(): CircuitJson {
    return this.ctx.db.toArray() as CircuitJson
  }
}

/**
 * Convenience function to convert a SES string to Circuit JSON.
 * @param sesString - The raw SES file content as a string
 * @returns The converted Circuit JSON array
 */
export function convertSesToCircuitJson(sesString: string): CircuitJson {
  const converter = new SesToCircuitJsonConverter(sesString)
  converter.runUntilFinished()
  return converter.getOutput()
}
