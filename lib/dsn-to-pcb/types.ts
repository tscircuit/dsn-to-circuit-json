import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util"
import type { CircuitJson } from "circuit-json"
import type { SpectraDsn } from "dsnts"
import type { Matrix } from "transformation-matrix"

/**
 * Context object shared between all converter stages.
 * Contains the parsed DSN, database for circuit JSON construction,
 * and various mappings needed during conversion.
 */
export interface ConverterContext {
  /**
   * The parsed DSN file (SpectraDsn object from dsnts)
   */
  spectraDsn: SpectraDsn

  /**
   * Circuit JSON utility objects for building the output
   */
  db: CircuitJsonUtilObjects

  /**
   * Transformation matrix from DSN coordinates to Circuit JSON coordinates.
   * DSN uses micrometers (μm), Circuit JSON uses millimeters (mm).
   * Also handles coordinate system differences (DSN Y-axis may be inverted).
   */
  dsnToCircuitJsonTransformMatrix?: Matrix

  /**
   * The resolution/scale factor from DSN file.
   * Typically the value from (resolution um 10) means 1 design unit = 10 μm.
   */
  dsnResolutionValue?: number

  /**
   * The unit from DSN file (e.g., "um", "mil", "mm")
   */
  dsnUnit?: string

  /**
   * Maps DSN image ID (footprint name) to pcb_component_ids that use it.
   * Populated by CollectComponentsStage, used by CollectPadsStage.
   */
  imageIdToComponentIds?: Map<string, string[]>

  /**
   * Maps DSN component reference (from placement) to pcb_component_id.
   * Format: "componentRef" -> "pcb_component_id"
   */
  componentRefToId?: Map<string, string>

  /**
   * Maps DSN padstack ID to pad shape information.
   * Used to look up pad dimensions when creating pads.
   */
  padstackIdToInfo?: Map<
    string,
    {
      shape: "circle" | "rect" | "polygon"
      diameter?: number
      width?: number
      height?: number
      layer?: string
      coordinates?: number[]
    }
  >

  /**
   * Maps DSN net name to source_net_id.
   * Populated by CollectNetsStage.
   */
  netNameToId?: Map<string, string>

  /**
   * Maps component-pin reference to pcb_port_id.
   * Format: "componentRef-pinId" -> "pcb_port_id"
   */
  pinRefToPortId?: Map<string, string>

  /**
   * Maps DSN component reference to source_component_id.
   * Format: "componentRef" -> "source_component_id"
   */
  sourceComponentRefToId?: Map<string, string>

  /**
   * Maps DSN net name to source_trace_id.
   * Populated by CollectNetsStage.
   */
  netNameToSourceTraceId?: Map<string, string>
}

/**
 * Abstract base class for converter stages.
 * Each stage performs a specific part of the DSN to Circuit JSON conversion.
 */
export abstract class ConverterStage {
  MAX_ITERATIONS = 1000
  iteration = 0
  finished = false

  protected ctx: ConverterContext

  constructor(ctx: ConverterContext) {
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
