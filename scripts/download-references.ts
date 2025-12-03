import { mkdir, writeFile } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

type ReferenceSpec = {
  readonly url: string
  readonly filename: string
}

// TODO: Add actual DSN specification references
// The main Specctra specification PDF is at:
// https://cdn.hackaday.io/files/1666717130852064/specctra.pdf
//
// Other useful references:
// - FreeRouting documentation: https://github.com/freerouting/freerouting
// - Layout Editor DSN format: https://layouteditor.org/layout/file-formats/dsn

const references: ReferenceSpec[] = [
  // Placeholder - will add actual DSN format references
  // {
  //   url: "https://cdn.hackaday.io/files/1666717130852064/specctra.pdf",
  //   filename: "SPECCTRA_SPEC.pdf",
  // },
]

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")
const referencesDir = resolve(repoRoot, "references")

async function fetchReference(reference: ReferenceSpec): Promise<void> {
  const response = await fetch(reference.url)

  if (!response.ok) {
    throw new Error(
      `${reference.url} (${response.status} ${response.statusText})`,
    )
  }

  const content = await response.text()
  const targetPath = resolve(referencesDir, reference.filename)

  await writeFile(targetPath, content, "utf8")
  console.log(`Saved ${reference.filename}`)
}

async function main(): Promise<void> {
  await mkdir(referencesDir, { recursive: true })

  if (references.length === 0) {
    console.log(
      "No references configured yet. See TODO.md for implementation plan.",
    )
    return
  }

  await Promise.all(
    references.map(async (reference) => {
      try {
        await fetchReference(reference)
      } catch (error) {
        console.error(`Failed to download ${reference.filename}:`, error)
        process.exitCode = 1
      }
    }),
  )
}

await main()
