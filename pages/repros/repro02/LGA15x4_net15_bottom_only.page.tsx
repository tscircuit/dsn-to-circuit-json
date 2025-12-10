import React, { useMemo, useState, useCallback } from "react"
import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import {
  TraceViewer,
  type ColorMode,
} from "../../SesToCircuitJsonPipelineSolver"
import { convertSesToCircuitJson } from "lib/ses-to-circuit-json"
import { convertDsnToCircuitJson } from "lib/dsn-to-circuit-json"
import type { PcbTrace, PcbVia, PcbSmtPad, PcbPlatedHole } from "circuit-json"
// @ts-ignore
import LGA51x4_net15_bottom_only_SES from "./assets/LGA15x4_net15_bottom_only.ses?raw"
// @ts-ignore
import LGA51x4_net15_bottom_only_DSN from "./assets/LGA15x4_net15_bottom_only_input.dsn?raw"

export default function LGA51x4_net15_bottom_onlyFixture() {
  const [colorMode, setColorMode] = useState<ColorMode>("layer")
  const [solverKey, setSolverKey] = useState(0)

  const solver = useMemo(() => {
    try {
      // Parse SES for traces and vias
      const sesCircuitJson = convertSesToCircuitJson(
        LGA51x4_net15_bottom_only_SES,
      )

      const traces = sesCircuitJson.filter(
        (el): el is PcbTrace => el.type === "pcb_trace",
      )
      const vias = sesCircuitJson.filter(
        (el): el is PcbVia => el.type === "pcb_via",
      )

      // Parse DSN for SMT pads and plated holes
      const dsnCircuitJson = convertDsnToCircuitJson(
        LGA51x4_net15_bottom_only_DSN,
      )

      const smtpads = dsnCircuitJson.filter(
        (el): el is PcbSmtPad => el.type === "pcb_smtpad",
      )
      const platedHoles = dsnCircuitJson.filter(
        (el): el is PcbPlatedHole => el.type === "pcb_plated_hole",
      )

      return new TraceViewer({
        traces,
        vias,
        smtpads,
        platedHoles,
        colorMode,
      })
    } catch (e) {
      console.error("Failed to parse SES/DSN:", e)
      return new TraceViewer({ traces: [], vias: [], colorMode })
    }
  }, [colorMode])

  const handleToggleColorMode = useCallback(() => {
    setColorMode((prev) => (prev === "layer" ? "trace" : "layer"))
  }, [])

  const handleReset = useCallback(() => {
    setSolverKey((prev) => prev + 1)
  }, [])

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 1000,
          display: "flex",
          gap: 8,
        }}
      >
        <button
          onClick={handleToggleColorMode}
          style={{
            padding: "8px 16px",
            fontSize: 14,
            fontWeight: "bold",
            cursor: "pointer",
            backgroundColor: colorMode === "layer" ? "#e74c3c" : "#9b59b6",
            color: "white",
            border: "none",
            borderRadius: 4,
            boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
          }}
        >
          {colorMode === "layer" ? "Layer Colors" : "Trace Colors"}
        </button>
        <button
          onClick={handleReset}
          style={{
            padding: "8px 16px",
            fontSize: 14,
            cursor: "pointer",
            backgroundColor: "#333",
            color: "white",
            border: "1px solid #555",
            borderRadius: 4,
          }}
        >
          Reset
        </button>
      </div>
      <GenericSolverDebugger solver={solver} animationSpeed={150} />
    </div>
  )
}
