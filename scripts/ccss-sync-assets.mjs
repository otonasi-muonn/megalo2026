import { copyFile, mkdir, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUIRED_FILES = ['ui.generated.c', 'ui.generated.css', 'ccss.manifest.json']

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const sourceDir = path.join(repoRoot, 'packages', 'ccss-compiler', 'examples', 'output')
const targetDir = path.join(repoRoot, 'apps', 'frontend', 'public', 'ccss')

const ensureFileExists = async (filePath) => {
  try {
    await access(filePath)
  } catch {
    throw new Error(`missing generated file: ${filePath}`)
  }
}

const main = async () => {
  await mkdir(targetDir, { recursive: true })

  for (const name of REQUIRED_FILES) {
    const from = path.join(sourceDir, name)
    const to = path.join(targetDir, name)
    await ensureFileExists(from)
    await copyFile(from, to)
    console.log(`synced: ${name}`)
  }
}

main().catch((error) => {
  console.error('[CCSS_SYNC_ERROR]', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
