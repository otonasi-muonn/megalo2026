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

const decodeCString = (value) =>
  value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')

const extractHtml = (cSource, filePath) => {
  const match = cSource.match(/return\s+"([\s\S]*?)";/)
  if (!match) {
    throw new Error(`HTML文字列を抽出できませんでした: ${filePath}`)
  }
  return decodeCString(match[1])
}

const assertDomIsolation = (html, filePath) => {
  if (/<canvas\b/i.test(html)) {
    throw new Error(`DOM分離違反: <canvas> が混入しています (${filePath})`)
  }
  if (/\bid\s*=\s*["']ccss-game-root["']/i.test(html)) {
    throw new Error(`DOM分離違反: #ccss-game-root が混入しています (${filePath})`)
  }
}

const main = async () => {
  for (const filePath of targetFiles) {
    const cSource = await readFile(filePath, 'utf-8')
    const html = extractHtml(cSource, filePath)
    assertDomIsolation(html, filePath)
  }

  console.log('CCSS DOM isolation check: PASSED')
}

main().catch((error) => {
  console.error('[CCSS_DOM_ISOLATION_ERROR]', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
