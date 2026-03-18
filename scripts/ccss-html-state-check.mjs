import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const targets = [
  {
    name: 'compiler-output',
    manifestPath: path.join(repoRoot, 'packages', 'ccss-compiler', 'examples', 'output', 'ccss.manifest.json'),
    cSourcePath: path.join(repoRoot, 'packages', 'ccss-compiler', 'examples', 'output', 'ui.generated.c'),
  },
  {
    name: 'frontend-public',
    manifestPath: path.join(repoRoot, 'apps', 'frontend', 'public', 'ccss', 'ccss.manifest.json'),
    cSourcePath: path.join(repoRoot, 'apps', 'frontend', 'public', 'ccss', 'ui.generated.c'),
  },
]

const decodeCString = (value) =>
  value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')

const extractHtml = (cSource, label) => {
  const match = cSource.match(/return\s+"([\s\S]*?)";/)
  if (!match) {
    throw new Error(`HTML文字列抽出に失敗しました: ${label}`)
  }
  return decodeCString(match[1])
}

const getManifestStates = (manifest, label) => {
  if (!manifest || !Array.isArray(manifest.states)) {
    throw new Error(`manifest.states が配列ではありません: ${label}`)
  }

  const result = []
  for (const state of manifest.states) {
    if (typeof state?.stateId !== 'string') {
      throw new Error(`stateId が文字列ではありません: ${label}`)
    }
    if (state.kind !== 'boolean' && state.kind !== 'enum') {
      throw new Error(`state.kind が不正です: ${label}`)
    }
    result.push({
      stateId: state.stateId,
      kind: state.kind,
    })
  }
  return result
}

const collectHtmlStateIds = (html) => {
  const ids = new Set()
  const pattern = /id="(ccss:[^"]+)"/g
  let match = pattern.exec(html)
  while (match) {
    ids.add(match[1])
    match = pattern.exec(html)
  }
  return ids
}

const main = async () => {
  const errors = []

  for (const target of targets) {
    const manifestRaw = await readFile(target.manifestPath, 'utf-8')
    const cSource = await readFile(target.cSourcePath, 'utf-8')
    const manifest = JSON.parse(manifestRaw)
    const html = extractHtml(cSource, target.name)
    const states = getManifestStates(manifest, target.name)
    const manifestStateSet = new Set(states.map((state) => state.stateId))
    const htmlStateIds = collectHtmlStateIds(html)

    for (const state of states) {
      if (state.kind !== 'boolean') {
        continue
      }
      const stateInput = `id="${state.stateId}"`
      if (!html.includes(stateInput)) {
        errors.push(`${target.name}: boolean stateId に対応する input id が不足 (${state.stateId})`)
      }
    }

    for (const htmlStateId of htmlStateIds) {
      if (!manifestStateSet.has(htmlStateId)) {
        errors.push(`${target.name}: manifest未定義の ccss id がHTMLに存在 (${htmlStateId})`)
      }
    }
  }

  if (errors.length > 0) {
    console.error('[CCSS_HTML_STATE_CHECK_ERROR] HTML state整合チェックに失敗しました。')
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exitCode = 1
    return
  }

  console.log('CCSS HTML state check: PASSED')
}

main().catch((error) => {
  console.error('[CCSS_HTML_STATE_CHECK_ERROR]', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
