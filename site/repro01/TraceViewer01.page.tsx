import React, { useMemo, useState, useCallback } from "react"
import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { TraceViewer, type ColorMode } from "./TraceViewer"
import { convertSesToCircuitJson } from "../../lib/ses-to-pcb"
import type { CircuitJson, PcbTrace, PcbVia } from "circuit-json"
import originalCircuitJson from "./assets/motor-drive-breakout.json"

const MOTOR_DRIVER_SES = `(session "input (3).ses"
  (base_design "input (3).dsn")
  (placement
    (resolution um 10)
    (component simple_chip:7.4322x8.4741_mm
      (place M1_source_component_0 0 0 front 0)
    )
    (component simple_capacitor:1.5600x0.6400_mm
      (place C1_source_component_3 -70000 80000 front 0)
      (place C3_source_component_4 -50000 80000 front 0)
      (place C2_source_component_5 50000 80000 front 0)
    )
    (component simple_pin_header:1.5000x19.2800_mm
      (place JP1_source_component_1 -90000 0 front 0)
      (place JP2_source_component_2 90000 0 front 0)
    )
  )
  (was_is
  )
  (routes 
    (resolution um 10)
    (parser
      (host_cad "KiCad's Pcbnew")
      (host_version )
    )
    (library_out 
      (padstack "Via[0-1]_600:300_um"
        (shape
          (circle F.Cu 6000 0 0)
        )
        (shape
          (circle B.Cu 6000 0 0)
        )
        (attach off)
      )
      (padstack "Via[0-1]_600:300_um"
        (shape
          (circle F.Cu 6000 0 0)
        )
        (shape
          (circle B.Cu 6000 0 0)
        )
        (attach off)
      )
    )
    (network_out 
      (net "Net-(C1_source_component_3-Pad2)"
        (wire
          (path F.Cu 1500
            -64900 80000
            -44508 59608
            -44508 35750
          )
        )
        (wire
          (path F.Cu 1500
            -35621 35750
            -44508 35750
          )
        )
        (wire
          (path F.Cu 1500
            -35621 35750
            -26734 35750
          )
        )
        (wire
          (path F.Cu 1500
            -35621 29251
            -26734 29251
          )
        )
        (wire
          (path F.Cu 1500
            -26734 29251
            -26734 35750
          )
        )
      )
      (net "Net-(C3_source_component_4-Pad1)"
        (wire
          (path F.Cu 1500
            -35621 29251
            -44508 29251
          )
        )
        (wire
          (path F.Cu 1500
            -35621 -35750
            -44508 -35750
          )
        )
        (wire
          (path F.Cu 1500
            -44508 -35750
            -44508 29251
          )
        )
      )
      (net "Net-(JP1_source_component_1-Pad2)"
        (wire
          (path B.Cu 1500
            -90000 -63500
            -48877 -63500
            21398 6775
            21398 25606
          )
        )
        (wire
          (path F.Cu 1500
            21398 25606
          )
        )
        (wire
          (path B.Cu 1500
            21398 25606
          )
        )
        (wire
          (path F.Cu 1500
            26734 29251
            25043 29251
            21398 25606
          )
        )
        (via "Via[0-1]_600:300_um" 21398 25606
        )
        (wire
          (path F.Cu 1500
            31178 29251
            26734 29251
          )
        )
        (wire
          (path F.Cu 1500
            35621 29251
            31178 29251
          )
        )
        (wire
          (path F.Cu 1500
            35621 35750
            26734 35750
          )
        )
        (wire
          (path F.Cu 1500
            26734 35750
            26734 29251
          )
        )
      )
      (net "Net-(JP1_source_component_1-Pad3)"
        (wire
          (path B.Cu 1500
            9087 2058
            -31071 -38100
            -90000 -38100
          )
        )
        (wire
          (path F.Cu 1500
            9087 2058
          )
        )
        (wire
          (path B.Cu 1500
            9087 2058
          )
        )
        (wire
          (path F.Cu 1500
            9087 2042
            9087 2058
          )
        )
        (wire
          (path F.Cu 1500
            9087 2042
          )
        )
        (wire
          (path F.Cu 1500
            9103 2042
            9087 2042
          )
        )
        (wire
          (path F.Cu 1500
            9119 2042
            9103 2042
          )
        )
        (wire
          (path F.Cu 1500
            9103 2042
            9119 2042
          )
        )
        (wire
          (path F.Cu 1500
            9119 2042
            9103 2042
          )
        )
        (wire
          (path F.Cu 1500
            35621 3251
            26734 3251
          )
        )
        (wire
          (path F.Cu 1500
            9119 2042
            25525 2042
            26734 3251
          )
        )
        (via "Via[0-1]_600:300_um" 9087 2058
        )
        (wire
          (path F.Cu 1500
            40065 9751
            35621 9751
          )
        )
        (wire
          (path F.Cu 1500
            40065 9751
            44508 9751
          )
        )
        (wire
          (path F.Cu 1500
            40065 3251
            35621 3251
          )
        )
        (wire
          (path F.Cu 1500
            40065 3251
            44508 3251
          )
        )
        (wire
          (path F.Cu 1500
            44508 9751
            44508 3251
          )
        )
      )
      (net "Net-(JP1_source_component_1-Pad4)"
        (wire
          (path B.Cu 1500
            -90000 -12700
            -14436 -12700
            762 2498
          )
        )
        (wire
          (path F.Cu 1500
            762 2498
          )
        )
        (wire
          (path F.Cu 1500
            35621 -3249
            6509 -3249
            762 2498
          )
        )
        (via "Via[0-1]_600:300_um" 762 2498
        )
        (wire
          (path F.Cu 1500
            37512 -3249
            35621 -3249
          )
        )
        (wire
          (path F.Cu 1500
            37512 -3249
            44508 -3249
          )
        )
        (wire
          (path F.Cu 1500
            36982 -9751
            35621 -9751
          )
        )
        (wire
          (path F.Cu 1500
            36982 -9751
            44508 -9751
          )
        )
        (wire
          (path F.Cu 1500
            44508 -3249
            44508 -9751
          )
        )
      )
      (net "Net-(JP1_source_component_1-Pad5)"
        (wire
          (path B.Cu 1500
            -17415 2439
            -79739 2439
            -90000 12700
          )
        )
        (via "Via[0-1]_600:300_um" -17415 2439
        )
        (wire
          (path F.Cu 1500
            35621 -29251
            14275 -29251
            -17415 2439
          )
        )
        (wire
          (path F.Cu 1500
            35621 -35750
            44508 -35750
          )
        )
        (wire
          (path F.Cu 1500
            35621 -29251
            44508 -29251
          )
        )
        (wire
          (path F.Cu 1500
            44508 -29251
            44508 -35750
          )
        )
      )
      (net "Net-(JP1_source_component_1-Pad8)"
        (wire
          (path F.Cu 1500
            -64279 80000
            -64900 80000
          )
        )
        (wire
          (path F.Cu 1500
            -64900 80000
            -69867 80000
          )
        )
        (wire
          (path F.Cu 1500
            -69867 80000
            -69867 84967
            -73800 88900
            -90000 88900
          )
        )
        (wire
          (path F.Cu 1500
            -64279 80000
            -59933 80000
          )
        )
        (wire
          (path F.Cu 1500
            -55100 80000
            -59933 80000
          )
        )
      )
      (net "Net-(JP2_source_component_2-Pad1)"
        (wire
          (path F.Cu 1500
            90000 -88900
            32915 -88900
            -26734 -29251
          )
        )
        (wire
          (path F.Cu 1500
            -35621 -29251
            -26734 -29251
          )
        )
      )
      (net "Net-(JP2_source_component_2-Pad2)"
        (wire
          (path F.Cu 1500
            90000 -63500
            31106 -63500
            -9643 -22751
            -35621 -22751
          )
        )
      )
      (net "Net-(JP2_source_component_2-Pad3)"
        (wire
          (path F.Cu 1500
            90000 -38100
            85468 -42632
            14506 -42632
            -11875 -16251
            -35621 -16251
          )
        )
      )
      (net "Net-(JP2_source_component_2-Pad4)"
        (wire
          (path F.Cu 1500
            90000 -12700
            63143 -39557
            16120 -39557
            -20188 -3249
            -35621 -3249
          )
        )
      )
      (net "Net-(JP2_source_component_2-Pad5)"
        (wire
          (path F.Cu 1500
            -26734 9751
            -21930 9751
            7876 39557
            63143 39557
            90000 12700
          )
        )
        (wire
          (path F.Cu 1500
            -35621 9751
            -26734 9751
          )
        )
      )
      (net "Net-(JP2_source_component_2-Pad6)"
        (wire
          (path F.Cu 1500
            -35621 16251
            -19697 16251
            6849 42797
            85303 42797
            90000 38100
          )
        )
      )
      (net "Net-(JP2_source_component_2-Pad7)"
        (wire
          (path F.Cu 1500
            -26734 22751
            14015 63500
            90000 63500
          )
        )
        (wire
          (path F.Cu 1500
            -35621 22751
            -26734 22751
          )
        )
      )
      (net GND_source_net_1
        (wire
          (path B.Cu 1500
            -90000 38100
            -104350 23750
            -104350 -64783
            -90000 -79133
          )
        )
        (wire
          (path F.Cu 1500
            35621 16251
            -11051 16251
            -24051 3251
            -35621 3251
          )
        )
        (wire
          (path F.Cu 1500
            -75100 80000
            -80067 80000
          )
        )
        (wire
          (path F.Cu 1500
            -44900 80000
            -49867 80000
          )
        )
        (wire
          (path F.Cu 1500
            -49867 80000
            -49867 84967
            -64140 99240
            -93606 99240
            -99767 93079
            -99767 84332
            -93993 78558
            -81509 78558
            -80067 80000
          )
        )
        (wire
          (path F.Cu 1500
            44508 -16251
            47645 -13114
            47645 13114
            44508 16251
          )
        )
        (wire
          (path F.Cu 1500
            44508 -16251
            44508 -22751
          )
        )
        (wire
          (path F.Cu 1500
            40065 16251
            35621 16251
          )
        )
        (wire
          (path F.Cu 1500
            40065 16251
            44508 16251
          )
        )
        (wire
          (path F.Cu 1500
            35621 22751
            44508 22751
          )
        )
        (wire
          (path F.Cu 1500
            44508 22751
            44508 16251
          )
        )
        (wire
          (path F.Cu 1500
            -73700 80000
            -73700 54400
            -90000 38100
          )
        )
        (wire
          (path F.Cu 1500
            -75100 80000
            -73700 80000
          )
        )
        (wire
          (path F.Cu 1500
            55100 80000
            50133 80000
          )
        )
        (wire
          (path F.Cu 1500
            -44900 80000
            -39933 80000
          )
        )
        (wire
          (path F.Cu 1500
            -39933 80000
            -34466 74533
            49633 74533
            50133 75033
            50133 80000
          )
        )
        (wire
          (path F.Cu 1500
            35621 -22751
            44508 -22751
          )
        )
        (wire
          (path F.Cu 1500
            35621 -16251
            44508 -16251
          )
        )
        (wire
          (path F.Cu 1500
            55100 80000
            81100 80000
            90000 88900
          )
        )
        (wire
          (path B.Cu 1500
            -90000 -88900
            -90000 -79133
          )
        )
      )
      (net VCC_source_net_0
        (wire
          (path F.Cu 1500
            39933 80000
            17676 102257
            -94856 102257
            -102784 94329
            -102784 76284
            -90000 63500
          )
        )
        (wire
          (path F.Cu 1500
            44900 80000
            39933 80000
          )
        )
      )
    )
  )
)`

export default function TraceViewer01Fixture() {
  const [colorMode, setColorMode] = useState<ColorMode>("layer")
  const [solverKey, setSolverKey] = useState(0)

  const solver = useMemo(() => {
    try {
      const circuitJson = convertSesToCircuitJson(MOTOR_DRIVER_SES, {
        originalCircuitJson: originalCircuitJson as CircuitJson,
      })

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
