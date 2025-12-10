# dsn-to-circuit-json

Convert Specctra DSN and SES files to Circuit JSON format.

DSN (Design) files contain PCB layout data including component placements, pad definitions, and net connectivity. SES (Session) files contain autorouter results with wire routes and via placements.

## Installation

```bash
npm install dsn-to-circuit-json
# or
bun install dsn-to-circuit-json
```

## Usage

### Converting DSN Files

```typescript
import { DsnToCircuitJsonConverter, convertDsnToCircuitJson } from "dsn-to-circuit-json"
import fs from "fs"

// Option 1: Using the converter class
const dsnContent = fs.readFileSync("path/to/file.dsn", "utf-8")
const converter = new DsnToCircuitJsonConverter(dsnContent)
converter.runUntilFinished()
const circuitJson = converter.getOutput()

// Option 2: Using the convenience function
const circuitJson = convertDsnToCircuitJson(dsnContent)

console.log(JSON.stringify(circuitJson, null, 2))
```

### Converting SES Files

```typescript
import { SesToCircuitJsonConverter, convertSesToCircuitJson } from "dsn-to-circuit-json"
import fs from "fs"

// Option 1: Using the converter class
const sesContent = fs.readFileSync("path/to/file.ses", "utf-8")
const converter = new SesToCircuitJsonConverter(sesContent)
converter.runUntilFinished()
const circuitJson = converter.getOutput()

// Option 2: Using the convenience function
const circuitJson = convertSesToCircuitJson(sesContent)

console.log(JSON.stringify(circuitJson, null, 2))
```

## Architecture

The converters use a staged pipeline architecture for modular and maintainable conversion:

### DSN Pipeline

1. **InitializeDsnContextStage** - Sets up coordinate transformations (DSN μm → Circuit JSON mm) and initializes mappings
2. **CollectBoardInfoStage** - Extracts board boundary and layer information to create `pcb_board` element
3. **CollectComponentsStage** - Converts placements to `source_component` and `pcb_component` elements
4. **CollectPadsStage** - Creates `pcb_smtpad`, `pcb_plated_hole`, `source_port`, and `pcb_port` elements from library images
5. **CollectNetsStage** - Creates `source_net` and `source_trace` elements from network definitions
6. **CollectTracesStage** - Converts wiring section to `pcb_trace` elements

### SES Pipeline

1. **InitializeSesContextStage** - Sets up coordinate transformations and mappings
2. **CollectSesRoutesStage** - Extracts wire segments and vias from routes, grouped by net
3. **GroupWiresIntoTracesStage** - Groups wire segments within each net into `pcb_trace` elements

## Coordinate Transformations

The converters handle coordinate system differences:

- **DSN files** use micrometers (μm) as the base unit
- **Circuit JSON** uses millimeters (mm) as the base unit
- Transform: `scale(1/1000, 1/1000)` with translation to center board at origin

## Supported Features

### DSN Files
- ✅ Board boundary/outline
- ✅ Components/Placements
- ✅ SMD pads (rectangular, circular, polygon)
- ✅ Through-hole pads (plated holes)
- ✅ Pin definitions from library images
- ✅ Net definitions and connectivity
- ✅ Traces/Wires from wiring section
- ✅ Multi-layer support (F.Cu, B.Cu)

### SES Files
- ✅ Wire routes from autorouter
- ✅ Via placements
- ✅ Net-grouped trace segments
- ✅ Layer mapping

## DSN File Structure

```
(pcb <filename>
  (parser ...)
  (resolution <unit> <value>)
  (structure
    (layer ...)
    (boundary ...)
    (via ...)
    (rule ...)
  )
  (placement
    (component <image_id>
      (place <ref> <x> <y> <side> <rotation>)
    )
  )
  (library
    (image <image_id>
      (pin <padstack_id> <pin_id> <x> <y>)
    )
    (padstack <padstack_id>
      (shape (circle <layer> <diameter>))
      (shape (rect <layer> <x1> <y1> <x2> <y2>))
      (shape (polygon <layer> <width> <coords...>))
    )
  )
  (network
    (net <net_name>
      (pins <component_ref>-<pin_id> ...)
    )
  )
  (wiring
    (wire (path <layer> <width> <coords...>))
  )
)
```


## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Type check
bunx tsc --noEmit

# Test
bun test

# Start development server (Cosmos)
bun run start
```

## Related Projects

- [circuit-json-to-dsn](https://github.com/tscircuit/circuit-json-to-dsn) - Convert Circuit JSON to DSN (reverse direction)
- [circuit-to-svg](https://github.com/tscircuit/circuit-to-svg) - Render Circuit JSON as SVG
- [dsnts](https://github.com/AltiumSharp/dsnts) - TypeScript parser for Specctra DSN/SES files

## License

MIT
