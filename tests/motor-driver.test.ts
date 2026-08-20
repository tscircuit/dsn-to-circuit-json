import { resolve } from "node:path"
import { readFile } from "node:fs/promises"
import { expect, test } from "bun:test"
import { convertSesToCircuitJson } from "../lib/ses-to-circuit-json/SesToCircuitJsonConverter"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"

test("convert motor driver ses to circuit json", async () => {
  const sesPath = resolve("pages/repros/repro01/assets/output.ses")
  const dsnPath = resolve("pages/repros/repro01/assets/motor_driver_input.dsn")
  const content = await readFile(sesPath, "utf-8")
  const dsnContent = await readFile(dsnPath, "utf-8")

  const circuitJson = convertSesToCircuitJson(content, dsnContent)

  expect(circuitJson).toBeDefined()
  expect(circuitJson.length).toBeGreaterThan(0)

  // Verify we have pcb_trace elements
  const traces = circuitJson.filter((el: any) => el.type === "pcb_trace")
  expect(traces.length).toBeGreaterThan(0)

  // Write debug output
  Bun.write(
    "./debug-output/motor-driver.json",
    JSON.stringify(circuitJson, null, 2),
  )

  const svg = convertCircuitJsonToPcbSvg(circuitJson)
  expect(svg).toMatchSvgSnapshot(import.meta.path)
})
