import { resolve } from "node:path"
import { readFile } from "node:fs/promises"
import { expect, test } from "bun:test"
import { convertDsnToCircuitJson } from "../lib/dsn-to-circuit-json/DsnToCircuitJsonConverter"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"

test("can convert BBD_Mars-64.dsn to circuit json", async () => {
  const dsnPath = resolve("demos/BBD_Mars-64.dsn")
  const content = await readFile(dsnPath, "utf-8")

  const circuitJson = convertDsnToCircuitJson(content)

  expect(circuitJson).toBeDefined()
  Bun.write(
    "./debug-output/bbd-mars.json",
    JSON.stringify(circuitJson, null, 2),
  )

  const svg = convertCircuitJsonToPcbSvg(circuitJson)
  expect(svg).toMatchSvgSnapshot(import.meta.path)
})
