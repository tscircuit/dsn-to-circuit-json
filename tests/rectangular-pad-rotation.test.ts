import { expect, test } from "bun:test"
import { pcb_smtpad } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { convertDsnToCircuitJson } from "../lib/dsn-to-circuit-json/DsnToCircuitJsonConverter"

const createDsn = (
  componentRotation: number,
  pinRotation = 0,
  {
    side = "front",
    flipStyle,
    pinX = 2000,
  }: {
    side?: "front" | "back"
    flipStyle?: "mirror_first" | "rotate_first"
    pinX?: number
  } = {},
) => `
(pcb rectangular-pad
  (resolution um 10)
  (structure
    (layer F.Cu (type signal))
    (layer B.Cu (type signal))
    (boundary (rect pcb -5000 -5000 5000 5000))
  )
  (placement
    ${flipStyle ? `(place_control (flip_style ${flipStyle}))` : ""}
    (component test-footprint
      (place U1 0 0 ${side} ${componentRotation})
    )
  )
  (library
    (image test-footprint
      (pin rectangular-pad (rotate ${pinRotation}) 1 ${pinX} 0)
    )
    (padstack rectangular-pad
      (shape (rect ${side === "back" ? "B.Cu" : "F.Cu"} -1000 -500 1000 500))
    )
  )
)
`

test.each([
  { componentRotation: 90, pinRotation: 0, padRotation: 90, x: 0, y: 2 },
  { componentRotation: 0, pinRotation: 90, padRotation: 90, x: 2, y: 0 },
  {
    componentRotation: 45,
    pinRotation: 90,
    padRotation: 135,
    x: Math.SQRT2,
    y: Math.SQRT2,
  },
])("rectangular pad combines component $componentRotation and pin $pinRotation rotation", ({
  componentRotation,
  pinRotation,
  padRotation,
  x,
  y,
}) => {
  const circuitJson = convertDsnToCircuitJson(
    createDsn(componentRotation, pinRotation),
  )
  const pad = pcb_smtpad.parse(
    circuitJson.find((element) => element.type === "pcb_smtpad"),
  )

  expect(pad.shape).toBe("rotated_rect")
  if (pad.shape !== "rotated_rect") throw new Error("Expected a rotated pad")
  expect(pad.width).toBe(2)
  expect(pad.height).toBe(1)
  expect(pad.ccw_rotation).toBe(padRotation)
  expect(pad.x).toBeCloseTo(x, 6)
  expect(pad.y).toBeCloseTo(y, 6)

  const port = circuitJson.find((element) => element.type === "pcb_port")
  expect(port?.x).toBeCloseTo(x, 6)
  expect(port?.y).toBeCloseTo(y, 6)
})

test("unrotated rectangular pad keeps its original dimensions", () => {
  const circuitJson = convertDsnToCircuitJson(createDsn(0))
  const pad = circuitJson.find((element) => element.type === "pcb_smtpad")

  expect(pad).toMatchObject({
    shape: "rect",
    x: 2,
    y: 0,
    width: 2,
    height: 1,
  })
})

test.each([
  { side: "front", flipStyle: undefined, expectedRotation: 45 },
  { side: "front", flipStyle: "mirror_first", expectedRotation: 45 },
  { side: "front", flipStyle: "rotate_first", expectedRotation: 45 },
  { side: "back", flipStyle: undefined, expectedRotation: 15 },
  { side: "back", flipStyle: "mirror_first", expectedRotation: 15 },
  { side: "back", flipStyle: "rotate_first", expectedRotation: -45 },
] as const)("$side rectangular pad honors flip style $flipStyle", ({
  side,
  flipStyle,
  expectedRotation,
}) => {
  const circuitJson = convertDsnToCircuitJson(
    createDsn(30, 15, { side, flipStyle, pinX: 0 }),
  )
  const pad = pcb_smtpad.parse(
    circuitJson.find((element) => element.type === "pcb_smtpad"),
  )

  expect(pad.shape).toBe("rotated_rect")
  if (pad.shape !== "rotated_rect") throw new Error("Expected a rotated pad")
  expect(pad.ccw_rotation).toBe(expectedRotation)
  expect(pad.width).toBe(2)
  expect(pad.height).toBe(1)
  expect(pad.x).toBe(0)
  expect(pad.y).toBe(0)
  expect(pad.layer).toBe(side === "back" ? "bottom" : "top")
})

test("default back-side mirroring cancels equal component and pin rotation", () => {
  const circuitJson = convertDsnToCircuitJson(
    createDsn(45, 45, { side: "back", pinX: 0 }),
  )
  const pad = circuitJson.find((element) => element.type === "pcb_smtpad")

  expect(pad).toMatchObject({
    shape: "rect",
    width: 2,
    height: 1,
    x: 0,
    y: 0,
    layer: "bottom",
  })
})

test("renders a rectangular pad on a rotated component", () => {
  const circuitJson = convertDsnToCircuitJson(createDsn(45))

  expect(convertCircuitJsonToPcbSvg(circuitJson)).toMatchSvgSnapshot(
    import.meta.path,
  )
})
