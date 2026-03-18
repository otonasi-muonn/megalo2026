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
    cssPath: path.join(repoRoot, 'packages', 'ccss-compiler', 'examples', 'output', 'ui.generated.css'),
  },
  {
    name: 'frontend-public',
    manifestPath: path.join(repoRoot, 'apps', 'frontend', 'public', 'ccss', 'ccss.manifest.json'),
    cssPath: path.join(repoRoot, 'apps', 'frontend', 'public', 'ccss', 'ui.generated.css'),
  },
]

const escapeCssId = (value) => value.replace(/([:\\.[\]#(), ])/g, '\\$1')

const getStateIds = (manifest, label) => {
  if (!manifest || !Array.isArray(manifest.states)) {
    throw new Error(`manifest.states が配列ではありません: ${label}`)
  }

  const result = []
  for (const state of manifest.states) {
    if (typeof state?.stateId !== 'string') {
      throw new Error(`stateId が文字列ではありません: ${label}`)
    }
    result.push(state.stateId)
  }
  return result
}

const collectCssStateIds = (cssText) => {
  const result = new Set()
  const pattern = /\[data-ccss-state="([^"]+)"\]/g
  let match = pattern.exec(cssText)
  while (match) {
    result.add(match[1])
    match = pattern.exec(cssText)
  }
  return result
}

const main = async () => {
  const errors = []

  for (const target of targets) {
    const manifestRaw = await readFile(target.manifestPath, 'utf-8')
    const manifest = JSON.parse(manifestRaw)
    const cssText = await readFile(target.cssPath, 'utf-8')

    const stateIds = getStateIds(manifest, target.name)
    const cssStateIds = collectCssStateIds(cssText)
    const manifestStateSet = new Set(stateIds)

    for (const stateId of stateIds) {
      const stateSelector = `[data-ccss-state="${stateId}"]`
      if (!cssText.includes(stateSelector)) {
        errors.push(`${target.name}: data-ccss-state セレクタ不足 (${stateId})`)
      }

      const escapedStateId = escapeCssId(stateId)
      const toggleSelector = `#${escapedStateId}:checked ~ [data-ccss-state="${stateId}"]`
      if (!cssText.includes(toggleSelector)) {
        errors.push(`${target.name}: checkedトグルセレクタ不足 (${stateId})`)
      }
    }

    for (const cssStateId of cssStateIds) {
      if (!manifestStateSet.has(cssStateId)) {
        errors.push(`${target.name}: manifest未定義の data-ccss-state が存在 (${cssStateId})`)
      }
    }
  }

  if (errors.length > 0) {
    console.error('[CCSS_SELECTOR_CHECK_ERROR] stateセレクタ検証に失敗しました。')
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exitCode = 1
    return
  }

  console.log('CCSS selector check: PASSED')
}

main().catch((error) => {
  console.error('[CCSS_SELECTOR_CHECK_ERROR]', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
