process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dummy-service-role-key'
process.env.CCSS_STYLE_PATCH_RATE_LIMIT_MAX_REQUESTS = '100'
process.env.CCSS_STYLE_PATCH_RATE_LIMIT_WINDOW_MS = '1000'
process.env.CCSS_STYLE_PATCH_AUDIT_ENABLED = 'false'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getErrorCode = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null
  }
  const error = value.error
  if (!isRecord(error) || typeof error.code !== 'string') {
    return null
  }
  return error.code
}

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message)
  }
}

const requestStylePatch = async (
  app: { request: (input: string, init?: RequestInit) => Response | Promise<Response> },
  body: JsonValue,
): Promise<{ response: Response; data: unknown }> => {
  const response = await Promise.resolve(app.request('http://localhost/api/ccss/style-patch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }))
  const data = await response.json()
  return { response, data }
}

const main = async (): Promise<void> => {
  const module = await import('../src/index.js')
  const app = module.default

  const validStateId = 'ccss:sample:sample-panel:menu-open'

  const valid = await requestStylePatch(app, {
    view: 'sample',
    stateId: validStateId,
    payload: {
      stageId: 'sample',
    },
  })
  assert(valid.response.status === 200, `正常系ステータスが想定外です: ${valid.response.status}`)
  if (!isRecord(valid.data)) {
    throw new Error('正常系レスポンスがオブジェクトではありません。')
  }
  const validData = valid.data
  assert(Array.isArray(validData.recipeIds), 'recipeIds が配列ではありません。')
  assert(Array.isArray(validData.classList), 'classList が配列ではありません。')
  assert(!('cssText' in validData), '正常系レスポンスに cssText が含まれています。')

  const unsafe = await requestStylePatch(app, {
    view: 'sample',
    stateId: validStateId,
    payload: {
      text: 'url(http://malicious.example)',
    },
  })
  assert(unsafe.response.status === 422, `危険トークン拒否ステータスが想定外です: ${unsafe.response.status}`)
  assert(
    getErrorCode(unsafe.data) === 'CCSS_UNSAFE_INPUT_REJECTED',
    '危険トークン拒否コードが不正です。',
  )

  const outOfScope = await requestStylePatch(app, {
    view: 'unknown-view',
    stateId: validStateId,
    payload: {},
  })
  assert(outOfScope.response.status === 403, `範囲外拒否ステータスが想定外です: ${outOfScope.response.status}`)
  assert(
    getErrorCode(outOfScope.data) === 'CCSS_RECIPE_OUT_OF_SCOPE',
    '範囲外拒否コードが不正です。',
  )

  const invalidState = await requestStylePatch(app, {
    view: 'sample',
    stateId: 'ccss:sample:sample-panel:not-defined',
    payload: {},
  })
  assert(invalidState.response.status === 400, `未定義state拒否ステータスが想定外です: ${invalidState.response.status}`)
  assert(
    getErrorCode(invalidState.data) === 'CCSS_INVALID_STATE',
    '未定義state拒否コードが不正です。',
  )

  console.log('CCSS style-patch contract check: PASSED')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`CCSS style-patch contract check: FAILED\n${message}`)
  process.exit(1)
})
