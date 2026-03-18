import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const targetFiles = [
  path.join(repoRoot, 'packages', 'ccss-compiler', 'examples', 'output', 'ui.generated.c'),
  path.join(repoRoot, 'apps', 'frontend', 'public', 'ccss', 'ui.generated.c'),
]

const REQUIRED_PATTERNS = [
  {
    label: 'render-function-signature',
    pattern: /const\s+char\*\s+ccss_render_[a-z0-9_]+\s*\(\s*void\s*\)/i,
  },
  {
    label: 'string-return',
    pattern: /return\s+"/,
  },
]

const BLOCKED_PATTERNS = [
  { label: 'malloc(', pattern: /\bmalloc\s*\(/i },
  { label: 'calloc(', pattern: /\bcalloc\s*\(/i },
  { label: 'realloc(', pattern: /\brealloc\s*\(/i },
  { label: 'free(', pattern: /\bfree\s*\(/i },
  { label: 'strcpy(', pattern: /\bstrcpy\s*\(/i },
  { label: 'strcat(', pattern: /\bstrcat\s*\(/i },
  { label: 'sprintf(', pattern: /\bsprintf\s*\(/i },
  { label: 'system(', pattern: /\bsystem\s*\(/i },
  { label: '<script', pattern: /<script/i },
]

const main = async () => {
  const violations = []
  const missing = []

  for (const filePath of targetFiles) {
    const cSource = await readFile(filePath, 'utf-8')

    for (const required of REQUIRED_PATTERNS) {
      if (!required.pattern.test(cSource)) {
        missing.push(`${filePath}: ${required.label}`)
      }
    }

    for (const blocked of BLOCKED_PATTERNS) {
      if (blocked.pattern.test(cSource)) {
        violations.push(`${filePath}: ${blocked.label}`)
      }
    }
  }

  if (missing.length > 0 || violations.length > 0) {
    console.error('[CCSS_C_SAFETY_ERROR] C生成物の安全性検証に失敗しました。')
    for (const item of missing) {
      console.error(`- required missing: ${item}`)
    }
    for (const item of violations) {
      console.error(`- blocked detected: ${item}`)
    }
    process.exitCode = 1
    return
  }

  console.log('CCSS C safety check: PASSED')
}

main().catch((error) => {
  console.error('[CCSS_C_SAFETY_ERROR]', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
