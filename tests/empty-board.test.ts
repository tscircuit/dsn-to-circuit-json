import { resolve } from "node:path"
import { readFile } from "node:fs/promises"
import { expect, test } from "bun:test"
import { convertDsnToCircuitJson } from "../lib/dsn-to-circuit-json/DsnToCircuitJsonConverter"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"

test("can convert empty_board.dsn to circuit json", async () => {
    const dsnPath = resolve("demos/empty_board.dsn")
    const content = await readFile(dsnPath, "utf-8")

    const circuitJson = convertDsnToCircuitJson(content)

    expect(circuitJson).toBeDefined()
    const svg = convertCircuitJsonToPcbSvg(circuitJson)
    expect(svg).toMatchSvgSnapshot(import.meta.path)

  })
