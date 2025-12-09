import React, { useMemo, useState, useCallback } from "react"
import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { TraceViewer, type ColorMode } from "./TraceViewer"
import { convertSesToCircuitJson } from "../../lib/ses-to-pcb"
import type { CircuitJson, PcbTrace, PcbVia } from "circuit-json"
import originalCircuitJson from "./assets/motor-drive-breakout.json"

const MOTOR_DRIVER_SES = `(session "tscircuit-b1ddda08-18f7-4058-9152-e1dab6654e38"
  (base_design "tscircuit-b1ddda08-18f7-4058-9152-e1dab6654e38")
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
            -100008 73362
            -100008 92761
            -93933 98836
            -83736 98836
            -64900 80000
          )
        )
        (wire
          (path F.Cu 1500
            -100008 73362
            -86049 73362
            -48437 35750
            -42286 35750
          )
        )
        (wire
          (path F.Cu 1500
            -44508 -35750
            -44508 -18780
            -89603 26315
            -92027 26315
            -100008 34296
            -100008 73362
          )
        )
        (wire
          (path F.Cu 1500
            -40064 29251
            -42286 31473
            -42286 35750
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
            -40064 35750
            -42286 35750
          )
        )
        (wire
          (path F.Cu 1500
            -35621 35750
            -40064 35750
          )
        )
        (wire
          (path F.Cu 1500
            -35621 29251
            -40064 29251
          )
        )
      )
      (net "Net-(JP1_source_component_1-Pad2)"
        (wire
          (path B.Cu 1500
            -90000 -63500
            -19352 -63500
            26803 -17345
            26803 27102
            23757 30148
          )
        )
        (wire
          (path F.Cu 1500
            24277 30148
            23757 30148
          )
        )
        (wire
          (path B.Cu 1500
            24277 30148
            23757 30148
          )
        )
        (wire
          (path F.Cu 1500
            23757 30148
            24277 30148
          )
        )
        (wire
          (path B.Cu 1500
            23757 30148
            24277 30148
          )
        )
        (wire
          (path F.Cu 1500
            35621 29251
            26734 29251
          )
        )
        (wire
          (path F.Cu 1500
            23757 30148
            25837 30148
            26734 29251
          )
        )
        (via "Via[0-1]_600:300_um" 23757 30148
        )
        (wire
          (path F.Cu 1500
            38536 35750
            35621 35750
          )
        )
        (wire
          (path F.Cu 1500
            38536 35750
            44508 35750
          )
        )
        (wire
          (path F.Cu 1500
            35621 29251
            44508 29251
          )
        )
        (wire
          (path F.Cu 1500
            44508 35750
            44508 29251
          )
        )
      )
      (net "Net-(JP1_source_component_1-Pad3)"
        (wire
          (path B.Cu 1500
            -90000 -38100
            1781 -38100
            21366 -18515
            21366 -395
          )
        )
        (wire
          (path F.Cu 1500
            21366 -14248
            21366 -395
          )
        )
        (wire
          (path F.Cu 1500
            21366 -395
            21366 -14248
          )
        )
        (wire
          (path F.Cu 1500
            26734 3251
            30007 3251
          )
        )
        (wire
          (path F.Cu 1500
            21366 -395
            25012 3251
            26734 3251
          )
        )
        (wire
          (path F.Cu 1500
            26734 3251
            26734 9751
          )
        )
        (wire
          (path F.Cu 1500
            30007 3251
            30317 3251
          )
        )
        (wire
          (path F.Cu 1500
            35621 9751
            26734 9751
          )
        )
        (wire
          (path F.Cu 1500
            30317 3251
            35621 3251
          )
        )
        (via "Via[0-1]_600:300_um" 21366 -395
        )
      )
      (net "Net-(JP1_source_component_1-Pad4)"
        (wire
          (path F.Cu 1500
            9282 -18629
            6570 -18629
          )
        )
        (wire
          (path B.Cu 1500
            9282 -18629
            6570 -18629
          )
        )
        (wire
          (path F.Cu 1500
            6570 -18629
            9282 -18629
          )
        )
        (wire
          (path B.Cu 1500
            6570 -18629
            9282 -18629
          )
        )
        (wire
          (path F.Cu 1500
            35621 -9751
            26734 -9751
          )
        )
        (wire
          (path F.Cu 1500
            6570 -18629
            21563 -18629
            26734 -13458
            26734 -9751
          )
        )
        (via "Via[0-1]_600:300_um" 6570 -18629
        )
        (wire
          (path B.Cu 1500
            -90000 -12700
            -69791 -32909
            2705 -32909
            6570 -29044
            6570 -18629
          )
        )
        (wire
          (path F.Cu 1500
            35621 -9751
            44508 -9751
          )
        )
        (wire
          (path F.Cu 1500
            35621 -3249
            44508 -3249
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
          (path F.Cu 1500
            3 -27436
            1818 -29251
            35621 -29251
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
            35621 -35750
            44508 -35750
          )
        )
        (wire
          (path F.Cu 1500
            44508 -35750
            44508 -29251
          )
        )
        (via "Via[0-1]_600:300_um" 3 -27436
        )
        (wire
          (path B.Cu 1500
            -90000 12700
            -40133 12700
            3 -27436
          )
        )
      )
      (net "Net-(JP1_source_component_1-Pad8)"
        (wire
          (path F.Cu 1500
            -64899 80000
            -64898 80000
          )
        )
        (wire
          (path F.Cu 1500
            -64900 80000
            -64899 80000
          )
        )
        (wire
          (path F.Cu 1500
            -64898 80000
            -64896 80000
          )
        )
        (wire
          (path F.Cu 1500
            -64896 80000
            -64893 80000
          )
        )
        (wire
          (path F.Cu 1500
            -64893 80000
            -64886 80000
          )
        )
        (wire
          (path F.Cu 1500
            -64886 80000
            -64872 80000
          )
        )
        (wire
          (path F.Cu 1500
            -64872 80000
            -64844 80000
          )
        )
        (wire
          (path F.Cu 1500
            -64844 80000
            -64789 80000
          )
        )
        (wire
          (path F.Cu 1500
            -64789 80000
            -64679 80000
          )
        )
        (wire
          (path F.Cu 1500
            -64679 80000
            -64458 80000
          )
        )
        (wire
          (path F.Cu 1500
            -64458 80000
            -64017 80000
          )
        )
        (wire
          (path F.Cu 1500
            -64017 80000
            -63134 80000
          )
        )
        (wire
          (path F.Cu 1500
            -63134 80000
            -61369 80000
          )
        )
        (wire
          (path F.Cu 1500
            -26734 29251
            -26734 38632
            -56512 68410
            -73280 68410
            -90000 85130
            -90000 88900
          )
        )
        (wire
          (path F.Cu 1500
            -61369 80000
            -59250 80000
          )
        )
        (wire
          (path F.Cu 1500
            -59250 80000
            -55100 80000
          )
        )
        (wire
          (path F.Cu 1500
            -35621 29251
            -26734 29251
          )
        )
      )
      (net "Net-(JP2_source_component_2-Pad1)"
        (wire
          (path F.Cu 1500
            -35621 -29251
            -23885 -29251
            35764 -88900
            90000 -88900
          )
        )
      )
      (net "Net-(JP2_source_component_2-Pad2)"
        (wire
          (path F.Cu 1500
            -35621 -22751
            -20634 -22751
            20115 -63500
            90000 -63500
          )
        )
      )
      (net "Net-(JP2_source_component_2-Pad3)"
        (wire
          (path F.Cu 1500
            90000 -38100
            48872 3028
            48872 35714
            44973 39613
            25774 39613
            -26734 -12895
            -26734 -16251
          )
        )
        (wire
          (path F.Cu 1500
            -35621 -16251
            -26734 -16251
          )
        )
      )
      (net "Net-(JP2_source_component_2-Pad4)"
        (wire
          (path F.Cu 1500
            90000 -12700
            60070 17230
            60070 29137
            46577 42630
            23983 42630
            -21896 -3249
            -35621 -3249
          )
        )
      )
      (net "Net-(JP2_source_component_2-Pad5)"
        (wire
          (path F.Cu 1500
            90000 12700
            57053 45647
            22733 45647
            -13163 9751
            -35621 9751
          )
        )
      )
      (net "Net-(JP2_source_component_2-Pad6)"
        (wire
          (path F.Cu 1500
            90000 38100
            79436 48664
            21483 48664
            -10930 16251
            -35621 16251
          )
        )
      )
      (net "Net-(JP2_source_component_2-Pad7)"
        (wire
          (path F.Cu 1500
            -35621 22751
            -8929 22751
            31820 63500
            90000 63500
          )
        )
      )
      (net GND_source_net_1
        (wire
          (path F.Cu 1500
            -53379 33098
            -53379 31097
          )
        )
        (wire
          (path B.Cu 1500
            -53379 33098
            -53379 31097
          )
        )
        (wire
          (path F.Cu 1500
            -53379 31097
            -53379 33098
          )
        )
        (wire
          (path B.Cu 1500
            -53379 31097
            -53379 33098
          )
        )
        (wire
          (path F.Cu 1500
            -99767 25688
            -99007 25688
          )
        )
        (wire
          (path B.Cu 1500
            -99767 25688
            -99007 25688
          )
        )
        (wire
          (path F.Cu 1500
            -99007 25688
            -99767 25688
          )
        )
        (wire
          (path B.Cu 1500
            -99007 25688
            -99767 25688
          )
        )
        (wire
          (path B.Cu 1500
            -90000 38100
            -90000 34695
            -99007 25688
          )
        )
        (wire
          (path B.Cu 1500
            -81226 38100
            -90000 38100
          )
        )
        (wire
          (path B.Cu 1500
            -80916 38100
            -81226 38100
          )
        )
        (wire
          (path B.Cu 1500
            -79612 38100
            -80916 38100
          )
        )
        (wire
          (path B.Cu 1500
            -77215 38100
            -79612 38100
          )
        )
        (wire
          (path B.Cu 1500
            -72309 38100
            -77215 38100
          )
        )
        (wire
          (path B.Cu 1500
            -71999 38100
            -72309 38100
          )
        )
        (wire
          (path B.Cu 1500
            -71689 38100
            -71999 38100
          )
        )
        (wire
          (path F.Cu 1500
            -90000 -88900
            -90000 -79133
          )
        )
        (wire
          (path F.Cu 1500
            -99007 25688
            -99767 24928
            -99767 -69366
            -90000 -79133
          )
        )
        (via "Via[0-1]_600:300_um" -99007 25688
        )
        (wire
          (path B.Cu 1500
            -53379 38100
            -71689 38100
          )
        )
        (wire
          (path F.Cu 1500
            -39933 80000
            -34466 85467
            49633 85467
            50133 84967
            50133 80000
          )
        )
        (wire
          (path F.Cu 1500
            -70133 80000
            -70133 75033
            -69205 74105
            -50794 74105
            -49867 75032
            -49867 80000
          )
        )
        (wire
          (path F.Cu 1500
            47824 -12935
            44508 -16251
          )
        )
        (wire
          (path F.Cu 1500
            47824 -12935
            82832 -47943
            93985 -47943
            99767 -42161
            99767 79133
            90000 88900
          )
        )
        (wire
          (path F.Cu 1500
            44493 16251
            44508 16236
            44508 2073
            47824 -1243
            47824 -12935
          )
        )
        (wire
          (path F.Cu 1500
            -75100 80000
            -70133 80000
          )
        )
        (wire
          (path F.Cu 1500
            44493 16251
            44508 16251
          )
        )
        (wire
          (path F.Cu 1500
            35621 16251
            44491 16251
          )
        )
        (wire
          (path F.Cu 1500
            44491 16251
            44493 16251
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
            -42734 80000
            -44900 80000
          )
        )
        (wire
          (path F.Cu 1500
            -42424 80000
            -42734 80000
          )
        )
        (wire
          (path F.Cu 1500
            -39948 80000
            -42424 80000
          )
        )
        (wire
          (path F.Cu 1500
            -35621 3251
            -44508 3251
          )
        )
        (wire
          (path B.Cu 1500
            -27452 54913
            -44265 38100
            -53379 38100
          )
        )
        (wire
          (path B.Cu 1500
            -53379 31097
            -53379 38100
          )
        )
        (via "Via[0-1]_600:300_um" -53379 31097
        )
        (wire
          (path F.Cu 1500
            -44508 3251
            -44508 22226
            -53379 31097
          )
        )
        (via "Via[0-1]_600:300_um" -27452 54913
        )
        (wire
          (path F.Cu 1500
            -39948 80000
            -27452 67504
            -27452 54913
          )
        )
        (wire
          (path F.Cu 1500
            -39948 80000
            -39933 80000
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
            44508 16251
            44508 22751
          )
        )
        (wire
          (path F.Cu 1500
            90000 88900
            81100 80000
            55100 80000
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
            35621 -16251
            44508 -16251
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
            44508 -22751
            44508 -16251
          )
        )
      )
      (net VCC_source_net_0
        (wire
          (path F.Cu 1500
            36612 76679
            27458 76679
          )
        )
        (wire
          (path B.Cu 1500
            36612 76679
            27458 76679
          )
        )
        (wire
          (path F.Cu 1500
            27458 76679
            36612 76679
          )
        )
        (wire
          (path B.Cu 1500
            27458 76679
            36612 76679
          )
        )
        (wire
          (path F.Cu 1500
            44900 80000
            39933 80000
          )
        )
        (wire
          (path F.Cu 1500
            27458 76679
            36612 76679
            39933 80000
          )
        )
        (via "Via[0-1]_600:300_um" 27458 76679
        )
        (wire
          (path B.Cu 1500
            -90000 63500
            14279 63500
            27458 76679
          )
        )
        (wire
          (path F.Cu 1500
            -90000 63500
            -90000 60270
            -55419 25689
            -55419 1160
            -44508 -9751
          )
        )
        (wire
          (path F.Cu 1500
            -35621 -9751
            -44508 -9751
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
