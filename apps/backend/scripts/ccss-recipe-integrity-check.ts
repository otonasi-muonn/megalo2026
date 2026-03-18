import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CCSS_RECIPE_REGISTRY } from '../src/ccssRecipes.js'

type CcssManifest = {
  states: Array<{
    stateId: string
  }>
}

const STATE_ID_PATTERN = /^ccss:[a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+$/
const CLASS_NAME_PATTERN = /^[a-z0-9-]+$/

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../../..')

const manifestCandidates = [
  resolve(repoRoot, 'apps/frontend/public/ccss/ccss.manifest.json'),
  resolve(repoRoot, 'packages/ccss-compiler/examples/output/ccss.manifest.json'),
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseManifest = (raw: string, sourcePath: string): CcssManifest => {
  const parsed = JSON.parse(raw) as unknown
  if (!isRecord(parsed) || !Array.isArray(parsed.states)) {
    throw new Error(`manifest形式が不正です: ${sourcePath}`)
  }

  const states = parsed.states
  for (let index = 0; index < states.length; index += 1) {
    const state = states[index]
    if (!isRecord(state) || typeof state.stateId !== 'string') {
      throw new Error(`manifestの states[${index}] に stateId がありません: ${sourcePath}`)
    }
  }

  return parsed as CcssManifest
}

const loadManifest = async (): Promise<{ manifest: CcssManifest; path: string }> => {
  const readErrors: string[] = []

  for (const candidate of manifestCandidates) {
    try {
      const raw = await readFile(candidate, 'utf-8')
      return {
        manifest: parseManifest(raw, candidate),
        path: candidate,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      readErrors.push(`${candidate}: ${message}`)
    }
  }

  throw new Error(
    `manifestを読み込めませんでした。\n${readErrors.join('\n')}\n必要に応じて \`pnpm ccss:poc:prepare\` を実行してください。`,
  )
}

const main = async (): Promise<void> => {
  const { manifest, path } = await loadManifest()
  const manifestStateIds = new Set(manifest.states.map((state) => state.stateId))
  const errors: string[] = []

  if (manifestStateIds.size === 0) {
    errors.push('manifestに stateId が1件も定義されていません。')
  }
  if (CCSS_RECIPE_REGISTRY.length === 0) {
    errors.push('CCSS_RECIPE_REGISTRY が空です。')
  }

  const duplicateKeys = new Set<string>()

  for (const recipe of CCSS_RECIPE_REGISTRY) {
    const key = `${recipe.view}|${recipe.stateId}|${recipe.recipeId}|${recipe.targetClass}`
    if (duplicateKeys.has(key)) {
      errors.push(`重複レシピを検出しました: ${key}`)
    }
    duplicateKeys.add(key)

    if (!STATE_ID_PATTERN.test(recipe.stateId)) {
      errors.push(`stateId形式が不正です: ${recipe.stateId}`)
    }
    if (!manifestStateIds.has(recipe.stateId)) {
      errors.push(`manifest未定義のstateIdを参照しています: ${recipe.stateId}`)
    }
    if (recipe.view.trim().length === 0) {
      errors.push(`view が空です: ${key}`)
    }
    if (recipe.recipeId.trim().length === 0) {
      errors.push(`recipeId が空です: ${key}`)
    }
    if (!CLASS_NAME_PATTERN.test(recipe.targetClass)) {
      errors.push(`targetClass 形式が不正です: ${recipe.targetClass}`)
    }
    if (recipe.addClasses.length === 0) {
      errors.push(`addClasses が空です: ${key}`)
    }
    for (const className of recipe.addClasses) {
      if (!CLASS_NAME_PATTERN.test(className)) {
        errors.push(`addClasses の class 名が不正です: ${className} (${key})`)
      }
    }
  }

  if (errors.length > 0) {
    console.error('CCSS recipe integrity check: FAILED')
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exit(1)
  }

  console.log('CCSS recipe integrity check: PASSED')
  console.log(`manifest: ${path}`)
  console.log(`states: ${manifestStateIds.size}, recipes: ${CCSS_RECIPE_REGISTRY.length}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`CCSS recipe integrity check: FAILED\n${message}`)
  process.exit(1)
})
