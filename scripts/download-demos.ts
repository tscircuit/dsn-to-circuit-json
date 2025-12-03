import { mkdir, writeFile } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

type DemoSpec = {
  readonly url: string
  readonly filename: string
}

// GitHub raw content URLs for freerouting test DSN files
// See: https://github.com/freerouting/freerouting/tree/master/tests
const demos: DemoSpec[] = [
  {
    url: "https://raw.githubusercontent.com/freerouting/freerouting/master/tests/empty_board.dsn",
    filename: "empty_board.dsn",
  },
  {
    url: "https://raw.githubusercontent.com/freerouting/freerouting/master/tests/BBD_Mars-64.dsn",
    filename: "BBD_Mars-64.dsn",
  },
  {
    url: "https://raw.githubusercontent.com/freerouting/freerouting/master/tests/Issue110-testPCBSpecctraFile.dsn",
    filename: "Issue110-testPCBSpecctraFile.dsn",
  },
  {
    url: "https://raw.githubusercontent.com/freerouting/freerouting/master/tests/Issue270-non-ansi_bracket.dsn",
    filename: "Issue270-non-ansi_bracket.dsn",
  },
  {
    url: "https://raw.githubusercontent.com/freerouting/freerouting/master/tests/Issue313-FastTest.dsn",
    filename: "Issue313-FastTest.dsn",
  },
  {
    url: "https://raw.githubusercontent.com/freerouting/freerouting/master/tests/Issue145-smoothieboard.dsn",
    filename: "Issue145-smoothieboard.dsn",
  },
  {
    url: "https://raw.githubusercontent.com/freerouting/freerouting/master/tests/Issue367-Charger.dsn",
    filename: "Issue367-Charger.dsn",
  },
]

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")
const demosDir = resolve(repoRoot, "demos")

async function fetchDemo(demo: DemoSpec): Promise<void> {
  const response = await fetch(demo.url)

  if (!response.ok) {
    throw new Error(`${demo.url} (${response.status} ${response.statusText})`)
  }

  const content = await response.text()
  const targetPath = resolve(demosDir, demo.filename)

  await writeFile(targetPath, content, "utf8")
  console.log(`Saved ${demo.filename}`)
}

async function main(): Promise<void> {
  await mkdir(demosDir, { recursive: true })

  console.log("Downloading DSN demo files from freerouting tests...")

  await Promise.all(
    demos.map(async (demo) => {
      try {
        await fetchDemo(demo)
      } catch (error) {
        console.error(`Failed to download ${demo.filename}:`, error)
        process.exitCode = 1
      }
    }),
  )

  console.log("\nDownload complete!")
}

await main()
