import { parseSpectraDsn, type SpectraDsn } from "dsnts"
import { cju } from "@tscircuit/circuit-json-util"
import type { CircuitJson } from "circuit-json"
import type { ConverterContext, DsnToCircuitJsonConverterStage } from "./types"
import { InitializeDsnContextStage } from "./stages/InitializeDsnContextStage"
import { CollectBoardInfoStage } from "./stages/CollectBoardInfoStage"
import { CollectComponentsStage } from "./stages/CollectComponentsStage"
import { CollectPadsStage } from "./stages/CollectPadsStage"
import { CollectNetsStage } from "./stages/CollectNetsStage"
import { CollectTracesStage } from "./stages/CollectTracesStage"

/**
 * Converts a Specctra DSN file to Circuit JSON format.
 *
 * The conversion is performed in stages:
 * 1. InitializeDsnContextStage - Set up coordinate transforms and mappings
 * 2. CollectBoardInfoStage - Extract board boundary and layer info
 * 3. CollectComponentsStage - Create pcb_component elements from placements
 * 4. CollectPadsStage - Create pcb_smtpad and pcb_plated_hole elements
 * 5. CollectNetsStage - Create source_net and source_trace elements
 * 6. CollectTracesStage - Create pcb_trace elements from wiring section
 *
 * Usage:
 * ```typescript
 * const converter = new DsnToCircuitJsonConverter(dsnString)
 * converter.runUntilFinished()
 * const circuitJson = converter.getOutput()
 * ```
 */
export class DsnToCircuitJsonConverter {
  ctx: ConverterContext
  pipeline: DsnToCircuitJsonConverterStage[]
  currentStageIndex = 0
  finished = false

  get currentStage(): DsnToCircuitJsonConverterStage | undefined {
    return this.pipeline[this.currentStageIndex]
  }

  /**
   * Create a new converter from a DSN string.
   * @param dsnString - The raw DSN file content as a string
   */
  constructor(dsnString: string) {
    // Parse the DSN file using dsnts
    const spectraDsn = parseSpectraDsn(dsnString)

    // Initialize the context with parsed DSN and empty circuit JSON database
    this.ctx = {
      specctraDsn: spectraDsn,
      db: cju([]), // Start with empty circuit JSON
    }

    // Set up the conversion pipeline
    this.pipeline = [
      new InitializeDsnContextStage(this.ctx),
      new CollectBoardInfoStage(this.ctx),
      new CollectComponentsStage(this.ctx),
      new CollectPadsStage(this.ctx),
      new CollectNetsStage(this.ctx),
      new CollectTracesStage(this.ctx),
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
 * Convenience function to convert a DSN string to Circuit JSON.
 * @param dsnString - The raw DSN file content as a string
 * @returns The converted Circuit JSON array
 */
export function convertDsnToCircuitJson(dsnString: string): CircuitJson {
  const converter = new DsnToCircuitJsonConverter(dsnString)
  converter.runUntilFinished()
  return converter.getOutput()
}
