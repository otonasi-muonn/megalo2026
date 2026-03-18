import { access, stat } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUIRED_FILES = ['ui.generated.c', 'ui.generated.css', 'ccss.manifest.json']

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const sourceDir = path.join(repoRoot, 'packages', 'ccss-compiler', 'examples', 'output')
const targetDir = path.join(repoRoot, 'apps', 'frontend', 'public', 'ccss')

const run = (command) => {
  execSync(command, {
    cwd: repoRoot,
    stdio: 'inherit',
  })
}

const ensureNonEmptyFile = async (filePath) => {
  await access(filePath)
  const info = await stat(filePath)
  if (!info.isFile() || info.size <= 0) {
    throw new Error(`generated file is empty: ${filePath}`)
  }
}

const main = async () => {
  run('pnpm ccss:compiler:sample')
  run('pnpm ccss:assets:sync')
  run('pnpm ccss:recipe-integrity')

  for (const name of REQUIRED_FILES) {
    await ensureNonEmptyFile(path.join(sourceDir, name))
    await ensureNonEmptyFile(path.join(targetDir, name))
  }

  console.log('CCSS transpile build: PASSED')
}

main().catch((error) => {
  console.error('[CCSS_TRANSPILE_BUILD_ERROR]', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
