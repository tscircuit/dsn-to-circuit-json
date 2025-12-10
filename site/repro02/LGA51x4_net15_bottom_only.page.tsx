import React, { useMemo, useState, useCallback } from "react"
import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { TraceViewer, type ColorMode } from "../TraceViewer"
import { convertSesToCircuitJson } from "../../lib/ses-to-pcb"
import type { CircuitJson, PcbTrace, PcbVia } from "circuit-json"
// @ts-ignore
import LGA51x4_net15_bottom_only_SES from "./assets/LGA51x4_net15_bottom_only.ses?raw"

export default function LGA51x4_net15_bottom_onlyFixture() {
  const [colorMode, setColorMode] = useState<ColorMode>("layer")
  const [solverKey, setSolverKey] = useState(0)

  const solver = useMemo(() => {
    try {
      const circuitJson = convertSesToCircuitJson(LGA51x4_net15_bottom_only_SES)

      const traces = circuitJson.filter(
        (el): el is PcbTrace => el.type === "pcb_trace",
      )
      const vias = circuitJson.filter(
        (el): el is PcbVia => el.type === "pcb_via",
      )

      return new TraceViewer({
        traces,
        vias,
        colorMode,
      })
    } catch (e) {
      console.error("Failed to parse SES:", e)
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
