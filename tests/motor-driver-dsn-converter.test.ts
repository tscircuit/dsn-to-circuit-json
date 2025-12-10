import { expect, test } from "bun:test"
import { resolve } from "node:path"
import { readFile } from "node:fs/promises"
import { convertDsnToCircuitJson } from "../lib/dsn-to-circuit-json/DsnToCircuitJsonConverter"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"

test("can convert motor driver dsn to circuit json", async () => {
  const dsnPath = resolve("site/repro01/assets/motor_driver_input.dsn")
  const content = await readFile(dsnPath, "utf-8")

  const circuitJson = convertDsnToCircuitJson(content)

  expect(circuitJson).toBeDefined()
  Bun.write(
    "./debug-output/motor-driver-dsn-converter.json",
    JSON.stringify(circuitJson, null, 2),
  )

  const svg = convertCircuitJsonToPcbSvg(circuitJson)
  expect(svg).toMatchSvgSnapshot(import.meta.path)
})
