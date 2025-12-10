import { resolve } from "node:path"
import { readFile } from "node:fs/promises"
import { expect, test } from "bun:test"
import { convertSesToCircuitJson } from "../lib/ses-to-circuit-json/SesToCircuitJsonConverter"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"

test("can convert Example.ses to circuit json", async () => {
  const sesPath = resolve("tests/assets/Example.ses")
  const content = await readFile(sesPath, "utf-8")

  const circuitJson = convertSesToCircuitJson(content)

  expect(circuitJson).toBeDefined()
  expect(circuitJson.length).toBeGreaterThan(0)

  // Verify we have pcb_trace elements
  const traces = circuitJson.filter((el: any) => el.type === "pcb_trace")
  expect(traces.length).toBeGreaterThan(0)

  // Write debug output
  Bun.write(
    "./debug-output/ses-example.json",
    JSON.stringify(circuitJson, null, 2),
  )

  const svg = convertCircuitJsonToPcbSvg(circuitJson)
  expect(svg).toMatchSvgSnapshot(import.meta.path)
})
