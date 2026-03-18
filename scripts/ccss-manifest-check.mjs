import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const manifestFiles = [
  path.join(repoRoot, 'packages', 'ccss-compiler', 'examples', 'output', 'ccss.manifest.json'),
  path.join(repoRoot, 'apps', 'frontend', 'public', 'ccss', 'ccss.manifest.json'),
]

const STATE_ID_PATTERN = /^ccss:[a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+$/

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

const validateManifest = (manifest, filePath) => {
  const errors = []

  if (!isRecord(manifest)) {
    return [`manifestがオブジェクトではありません: ${filePath}`]
  }

  if (manifest.schemaVersion !== 1) {
    errors.push(`schemaVersion が 1 ではありません: ${filePath}`)
  }
  if (manifest.compiler !== '@ccss/compiler') {
    errors.push(`compiler が @ccss/compiler ではありません: ${filePath}`)
  }
  if (typeof manifest.generatedAt !== 'string' || Number.isNaN(Date.parse(manifest.generatedAt))) {
    errors.push(`generatedAt がISO日時ではありません: ${filePath}`)
  }
  if (typeof manifest.sourcePath !== 'string' || manifest.sourcePath.trim().length === 0) {
    errors.push(`sourcePath が空です: ${filePath}`)
  }

  if (!isRecord(manifest.component)) {
    errors.push(`component が不正です: ${filePath}`)
  } else {
    if (typeof manifest.component.name !== 'string' || manifest.component.name.trim().length === 0) {
      errors.push(`component.name が空です: ${filePath}`)
    }
    if (typeof manifest.component.slug !== 'string' || manifest.component.slug.trim().length === 0) {
      errors.push(`component.slug が空です: ${filePath}`)
    }
  }

  if (!isRecord(manifest.domRoots)) {
    errors.push(`domRoots が不正です: ${filePath}`)
  } else {
    if (manifest.domRoots.uiRootId !== 'ccss-ui-root') {
      errors.push(`domRoots.uiRootId が ccss-ui-root ではありません: ${filePath}`)
    }
    if (manifest.domRoots.gameRootId !== 'ccss-game-root') {
      errors.push(`domRoots.gameRootId が ccss-game-root ではありません: ${filePath}`)
    }
  }

  if (!Array.isArray(manifest.states) || manifest.states.length === 0) {
    errors.push(`states が空、または配列ではありません: ${filePath}`)
    return errors
  }

  const stateIds = new Set()
  for (let index = 0; index < manifest.states.length; index += 1) {
    const state = manifest.states[index]
    if (!isRecord(state)) {
      errors.push(`states[${index}] がオブジェクトではありません: ${filePath}`)
      continue
    }

    if (typeof state.name !== 'string' || state.name.trim().length === 0) {
      errors.push(`states[${index}].name が空です: ${filePath}`)
    }
    if (state.kind !== 'boolean' && state.kind !== 'enum') {
      errors.push(`states[${index}].kind が不正です: ${filePath}`)
    }
    if (state.kind === 'boolean' && typeof state.initialValue !== 'boolean') {
      errors.push(`states[${index}].initialValue は boolean が必要です: ${filePath}`)
    }
    if (state.kind === 'enum' && typeof state.initialValue !== 'string') {
      errors.push(`states[${index}].initialValue は string が必要です: ${filePath}`)
    }
    if (state.kind === 'enum') {
      if (!Array.isArray(state.enumValues) || state.enumValues.length === 0) {
        errors.push(`states[${index}].enumValues は空でない配列が必要です: ${filePath}`)
      } else {
        const enumValues = new Set()
        for (let enumIndex = 0; enumIndex < state.enumValues.length; enumIndex += 1) {
          const enumValue = state.enumValues[enumIndex]
          if (typeof enumValue !== 'string' || enumValue.trim().length === 0) {
            errors.push(`states[${index}].enumValues[${enumIndex}] が不正です: ${filePath}`)
            continue
          }
          if (enumValues.has(enumValue)) {
            errors.push(`states[${index}].enumValues が重複しています: ${enumValue} (${filePath})`)
            continue
          }
          enumValues.add(enumValue)
        }
        if (typeof state.initialValue === 'string' && !enumValues.has(state.initialValue)) {
          errors.push(`states[${index}].initialValue が enumValues に含まれていません: ${filePath}`)
        }
      }
    }
    if (typeof state.stateId !== 'string' || !STATE_ID_PATTERN.test(state.stateId)) {
      errors.push(`states[${index}].stateId が不正です: ${filePath}`)
      continue
    }
    if (stateIds.has(state.stateId)) {
      errors.push(`states[].stateId が重複しています: ${state.stateId} (${filePath})`)
    }
    stateIds.add(state.stateId)
  }

  return errors
}

const toComparableSignature = (manifest) => ({
  schemaVersion: manifest.schemaVersion,
  compiler: manifest.compiler,
  component: manifest.component,
  domRoots: manifest.domRoots,
  states: manifest.states,
})

const main = async () => {
  const manifests = []
  const errors = []

  for (const filePath of manifestFiles) {
    const raw = await readFile(filePath, 'utf-8')
    const manifest = JSON.parse(raw)
    manifests.push({ filePath, manifest })
    errors.push(...validateManifest(manifest, filePath))
  }

  if (manifests.length === 2) {
    const first = JSON.stringify(toComparableSignature(manifests[0].manifest))
    const second = JSON.stringify(toComparableSignature(manifests[1].manifest))
    if (first !== second) {
      errors.push('compiler出力とfrontend公開配下の manifest 主要構造が一致しません。')
    }
  }

  if (errors.length > 0) {
    console.error('[CCSS_MANIFEST_CHECK_ERROR] manifest 検証に失敗しました。')
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exitCode = 1
    return
  }

  console.log('CCSS manifest check: PASSED')
}

main().catch((error) => {
  console.error('[CCSS_MANIFEST_CHECK_ERROR]', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
