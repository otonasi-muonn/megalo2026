process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dummy-service-role-key'
process.env.CCSS_STYLE_PATCH_RATE_LIMIT_MAX_REQUESTS = '100'
process.env.CCSS_STYLE_PATCH_RATE_LIMIT_WINDOW_MS = '1000'
process.env.CCSS_STATE_EVENT_AUDIT_ENABLED = 'false'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message)
  }
}

const requestJson = async (
  app: { request: (input: string, init?: RequestInit) => Response | Promise<Response> },
  path: string,
  body: JsonValue,
  headers?: Record<string, string>,
): Promise<{ response: Response; data: unknown }> => {
  const response = await Promise.resolve(
    app.request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  )
  const data = await response.json()
  return { response, data }
}

const main = async (): Promise<void> => {
  const module = await import('../src/index.js')
  const app = module.default

  const stylePatch = await requestJson(app, '/api/ccss/style-patch', {
    view: 'sample',
    stateId: 'ccss:sample:sample-panel:menu-open',
    payload: {
      stageId: 'sample',
    },
  })
  assert(stylePatch.response.status === 200, `style-patch 正常系ステータスが想定外です: ${stylePatch.response.status}`)
  if (!isRecord(stylePatch.data)) {
    throw new Error('style-patch 正常系レスポンスがオブジェクトではありません。')
  }
  const stylePatchData = stylePatch.data
  assert(typeof stylePatchData.patchId === 'string', 'style-patch 正常系レスポンスに patchId がありません。')
  assert(!('cssText' in stylePatchData), 'style-patch レスポンスに cssText が含まれています。')

  const stateEvent = await requestJson(app, '/api/ccss/state-events', {
    sessionKey: 'ccss-smoke-session',
    stateId: 'ccss:sample:sample-panel:menu-open',
    eventName: 'ui:state:set',
    payload: {
      source: 'smoke',
    },
  })
  assert(stateEvent.response.status === 200, `state-events ステータスが想定外です: ${stateEvent.response.status}`)
  if (!isRecord(stateEvent.data)) {
    throw new Error('state-events レスポンスがオブジェクトではありません。')
  }
  const stateEventData = stateEvent.data
  assert(stateEventData.recorded === false, 'state-events 既定無効時に recorded=false になっていません。')
  assert(
    stateEventData.reason === 'CCSS_STATE_EVENT_AUDIT_DISABLED',
    'state-events 既定無効時の reason が不正です。',
  )

  const validateNoAuth = await requestJson(app, '/api/ccss/transpile/validate', {
    source: 'export function X(){ return <div /> }',
    sourcePath: 'smoke.tsx',
  })
  assert(
    validateNoAuth.response.status === 401,
    `transpile/validate 無認証ステータスが想定外です: ${validateNoAuth.response.status}`,
  )

  const validateInvalidToken = await requestJson(
    app,
    '/api/ccss/transpile/validate',
    {
      source: 'export function X(){ return <div /> }',
      sourcePath: 'smoke.tsx',
    },
    {
      Authorization: 'Bearer invalid-token',
    },
  )
  assert(
    validateInvalidToken.response.status === 401,
    `transpile/validate 不正トークンステータスが想定外です: ${validateInvalidToken.response.status}`,
  )

  console.log('CCSS API smoke test: PASSED')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`CCSS API smoke test: FAILED\n${message}`)
  process.exit(1)
})
