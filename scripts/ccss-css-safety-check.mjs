import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const targetFiles = [
  path.join(repoRoot, 'packages', 'ccss-compiler', 'examples', 'output', 'ui.generated.css'),
  path.join(repoRoot, 'apps', 'frontend', 'public', 'ccss', 'ui.generated.css'),
]

const BLOCKED_PATTERNS = [
  { label: '@import', pattern: /@import/i },
  { label: 'url(', pattern: /url\s*\(/i },
  { label: 'expression(', pattern: /expression\s*\(/i },
  { label: 'universal-selector', pattern: /\*\s*\{/m },
]

const main = async () => {
  const violations = []

  for (const filePath of targetFiles) {
    const cssText = await readFile(filePath, 'utf-8')
    for (const check of BLOCKED_PATTERNS) {
      if (check.pattern.test(cssText)) {
        violations.push(`${filePath}: ${check.label}`)
      }
    }
  }

  if (violations.length > 0) {
    console.error('[CCSS_CSS_SAFETY_ERROR] 危険パターンを検知しました。')
    for (const violation of violations) {
      console.error(`- ${violation}`)
    }
    process.exitCode = 1
    return
  }

  console.log('CCSS CSS safety check: PASSED')
}

main().catch((error) => {
  console.error('[CCSS_CSS_SAFETY_ERROR]', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
