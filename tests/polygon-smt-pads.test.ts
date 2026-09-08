import { expect, test } from "bun:test"
import { convertDsnToCircuitJson } from "../lib/dsn-to-circuit-json/DsnToCircuitJsonConverter"

/**
 * Triangle pad in DSN micrometers, closed with a duplicate first vertex.
 * A bounding-box rect would be 1.0 × 1.5 mm; the real copper is a triangle.
 */
const TRIANGLE_DSN = `(pcb triangle_pad.dsn
  (parser
    (string_quote ")
    (space_in_quoted_tokens on)
    (host_cad "test")
    (host_version "")
  )
  (resolution um 10)
  (unit um)
  (structure
    (layer F.Cu
      (type signal)
      (property
        (index 0)
      )
    )
    (boundary
      (path pcb 0  -5000 -5000 5000 -5000 5000 5000 -5000 5000 -5000 -5000)
    )
    (via "Via[0-1]_600:300_um")
    (rule
      (width 200)
      (clearance 150)
    )
  )
  (placement
    (component "triangle_chip"
      (place U1 0 0 front 0)
    )
  )
  (library
    (image "triangle_chip"
      (pin triangle_pad 1 0 0)
    )
    (padstack "triangle_pad"
      (shape (polygon F.Cu 0 0 1000 -500 -500 500 -500 0 1000))
      (attach off)
    )
    (padstack "Via[0-1]_600:300_um"
      (shape (circle F.Cu 600))
      (attach off)
    )
  )
  (network
    (net "NET1"
      (pins U1-1)
    )
  )
)
`

test("DSN polygon padstacks emit pcb_smtpad polygon points, not a bounding rect", () => {
  const circuitJson = convertDsnToCircuitJson(TRIANGLE_DSN)
  const pads = circuitJson.filter((el: any) => el.type === "pcb_smtpad")

  expect(pads).toHaveLength(1)
  const pad = pads[0] as any
  expect(pad.shape).toBe("polygon")
  expect(pad.width).toBeUndefined()
  expect(pad.height).toBeUndefined()
  expect(pad.points).toHaveLength(3)

  const points = pad.points as Array<{ x: number; y: number }>
  expect(points[0]!.x).toBeCloseTo(0, 6)
  expect(points[0]!.y).toBeCloseTo(1, 6)
  expect(points[1]!.x).toBeCloseTo(-0.5, 6)
  expect(points[1]!.y).toBeCloseTo(-0.5, 6)
  expect(points[2]!.x).toBeCloseTo(0.5, 6)
  expect(points[2]!.y).toBeCloseTo(-0.5, 6)
})

test("polygon pad vertices rotate with the component placement", () => {
  const rotatedDsn = TRIANGLE_DSN.replace(
    "(place U1 0 0 front 0)",
    "(place U1 0 0 front 90)",
  )
  const circuitJson = convertDsnToCircuitJson(rotatedDsn)
  const pad = circuitJson.find((el: any) => el.type === "pcb_smtpad") as any

  expect(pad.shape).toBe("polygon")
  expect(pad.points).toHaveLength(3)
  // 90°: (x,y) -> (-y, x)
  expect(pad.points[0]!.x).toBeCloseTo(-1, 6)
  expect(pad.points[0]!.y).toBeCloseTo(0, 6)
  expect(pad.points[1]!.x).toBeCloseTo(0.5, 6)
  expect(pad.points[1]!.y).toBeCloseTo(-0.5, 6)
  expect(pad.points[2]!.x).toBeCloseTo(0.5, 6)
  expect(pad.points[2]!.y).toBeCloseTo(0.5, 6)
})
