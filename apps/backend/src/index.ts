import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import { parseComponentSource } from '@ccss/compiler'
import { createClient, type PostgrestError } from '@supabase/supabase-js'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'
import { CCSS_RECIPE_REGISTRY } from './ccssRecipes.js'
import { createEmptyStageData, isStageData } from './types/stage.js'
import type { Database } from './types/database.js'

type AppBindings = {
  Variables: {
    authUserId: string | null
  }
}

type AppContext = Context<AppBindings>
type ErrorStatus = 400 | 401 | 403 | 404 | 422 | 429 | 500
type StageRecord = Database['public']['Tables']['stages']['Row']
type StageListItem = Omit<StageRecord, 'stage_data'>
type CcssTranspileJobStatus = Database['public']['Tables']['ccss_transpile_jobs']['Row']['status']
type RateLimitBucket = {
  count: number
  resetAt: number
}
type CcssClassListItem = {
  targetClass: string
  add: string[]
}

const STAGE_LIST_SELECT =
  'id,author_id,title,is_published,play_count,clear_count,like_count,created_at,updated_at'
const CCSS_STYLE_PATCH_AUDIT_SELECT =
  'id,request_id,view,state_id,applied_recipe_ids,resolved_class_list,ruleset_version,ttl_ms,rejection_code,created_by,created_at'
const CCSS_STATE_EVENT_AUDIT_SELECT =
  'id,session_key,state_id,event_name,request_id,patch_id,payload,created_by,created_at'
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CCSS_STATE_ID_PATTERN = /^ccss:[a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+$/
const CCSS_TRANSPILE_JOB_STATUSES: CcssTranspileJobStatus[] = ['queued', 'running', 'succeeded', 'failed']
const CCSS_RULESET_VERSION = '2026-03-17'
const CCSS_PATCH_TTL_MS = 3000
const CCSS_UNSAFE_TOKEN_CHECKS: Array<{ label: string; pattern: RegExp }> = [
  { label: '@import', pattern: /@import/i },
  { label: 'url(', pattern: /url\s*\(/i },
  { label: 'expression(', pattern: /expression\s*\(/i },
  { label: '<style', pattern: /<style/i },
]

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isUuid = (value: string): boolean => UUID_PATTERN.test(value)

const parseCsv = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

const ccssAdminUserIds = new Set(parseCsv(process.env.CCSS_ADMIN_USER_IDS).filter(isUuid))

const getRequiredEnv = (name: string): string => {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`環境変数 ${name} が未設定です。`)
  }
  return value
}

const normalizeSupabaseUrl = (value: string): string => value.replace(/\/+$/, '')

const supabaseUrl = normalizeSupabaseUrl(getRequiredEnv('SUPABASE_URL'))
const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
const supabaseJwtAudience = process.env.SUPABASE_JWT_AUDIENCE?.trim() || 'authenticated'
const supabaseJwtIssuer = `${supabaseUrl}/auth/v1`
const supabaseJwks = createRemoteJWKSet(
  new URL(`${supabaseJwtIssuer}/.well-known/jwks.json`),
)

const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const app = new Hono<AppBindings>()

const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173']

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

const ccssStylePatchRateLimitMaxRequests = parsePositiveInt(
  process.env.CCSS_STYLE_PATCH_RATE_LIMIT_MAX_REQUESTS,
  20,
)
const ccssStylePatchRateLimitWindowMs = parsePositiveInt(
  process.env.CCSS_STYLE_PATCH_RATE_LIMIT_WINDOW_MS,
  5000,
)
const ccssStylePatchRateLimitBuckets = new Map<string, RateLimitBucket>()

const parseBoolean = (value: string | undefined): boolean | undefined => {
  if (value === undefined) {
    return undefined
  }
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  return undefined
}

const ccssStylePatchAuditEnabled = parseBoolean(process.env.CCSS_STYLE_PATCH_AUDIT_ENABLED) ?? false
const ccssTranspileAuditEnabled = parseBoolean(process.env.CCSS_TRANSPILE_AUDIT_ENABLED) ?? false
const ccssStateEventAuditEnabled = parseBoolean(process.env.CCSS_STATE_EVENT_AUDIT_ENABLED) ?? false
const ccssTrustProxyHeaders = parseBoolean(process.env.CCSS_TRUST_PROXY_HEADERS) ?? false

const readJsonObject = async (c: AppContext): Promise<Record<string, unknown> | Response> => {
  try {
    const body = await c.req.json<unknown>()
    if (!isRecord(body)) {
      return c.json({ error: 'リクエストボディはJSONオブジェクトである必要があります。' }, 400)
    }
    return body
  } catch {
    return c.json({ error: 'JSONのパースに失敗しました。' }, 400)
  }
}

const jsonError = (c: AppContext, status: ErrorStatus, message: string): Response =>
  c.json({ error: message }, status)

const jsonCodeError = (
  c: AppContext,
  status: ErrorStatus,
  code: string,
  message: string,
  hint: string,
): Response =>
  c.json(
    {
      error: {
        code,
        message,
        hint,
      },
    },
    status,
  )

const detectUnsafeTokenLabel = (value: string): string | null => {
  for (const check of CCSS_UNSAFE_TOKEN_CHECKS) {
    if (check.pattern.test(value)) {
      return check.label
    }
  }
  return null
}

const findUnsafeTokenPath = (
  value: unknown,
  pathPrefix: string,
): { path: string; token: string } | null => {
  if (typeof value === 'string') {
    const token = detectUnsafeTokenLabel(value)
    if (token) {
      return { path: pathPrefix, token }
    }
    return null
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findUnsafeTokenPath(value[index], `${pathPrefix}[${index}]`)
      if (found) {
        return found
      }
    }
    return null
  }

  if (isRecord(value)) {
    for (const [key, childValue] of Object.entries(value)) {
      const found = findUnsafeTokenPath(childValue, `${pathPrefix}.${key}`)
      if (found) {
        return found
      }
    }
  }

  return null
}

const dbError = (
  c: AppContext,
  error: PostgrestError | null,
  contextMessage: string,
): Response =>
  jsonError(c, 500, `${contextMessage}: ${error?.message ?? '不明なDBエラーです。'}`)

const toStageListItem = ({ stage_data: _stageData, ...stage }: StageRecord): StageListItem =>
  stage

const extractBearerToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader) {
    return null
  }
  const matched = authorizationHeader.match(/^Bearer\s+(.+)$/i)
  if (!matched) {
    return null
  }
  const token = matched[1].trim()
  return token.length > 0 ? token : null
}

const verifyAccessToken = async (token: string): Promise<string | null> => {
  try {
    const { payload } = await jwtVerify(token, supabaseJwks, {
      issuer: supabaseJwtIssuer,
      audience: supabaseJwtAudience,
    })
    if (typeof payload.sub !== 'string' || !isUuid(payload.sub)) {
      return null
    }
    return payload.sub
  } catch {
    return null
  }
}

const requireAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const token = extractBearerToken(c.req.header('Authorization'))
  if (!token) {
    return jsonError(c, 401, '認証トークンが必要です。')
  }

  const userId = await verifyAccessToken(token)
  if (!userId) {
    return jsonError(c, 401, '認証トークンが無効です。')
  }

  c.set('authUserId', userId)
  await next()
}

const optionalAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const token = extractBearerToken(c.req.header('Authorization'))
  if (!token) {
    c.set('authUserId', null)
    await next()
    return
  }

  const userId = await verifyAccessToken(token)
  if (!userId) {
    return jsonError(c, 401, '認証トークンが無効です。')
  }

  c.set('authUserId', userId)
  await next()
}

const requireCcssAdmin: MiddlewareHandler<AppBindings> = async (c, next) => {
  const token = extractBearerToken(c.req.header('Authorization'))
  if (!token) {
    return jsonError(c, 401, '認証トークンが必要です。')
  }

  const userId = await verifyAccessToken(token)
  if (!userId) {
    return jsonError(c, 401, '認証トークンが無効です。')
  }

  if (ccssAdminUserIds.size === 0) {
    return jsonCodeError(
      c,
      500,
      'CCSS_ADMIN_CONFIG_MISSING',
      'CCSS管理者ユーザーが未設定です。',
      'CCSS_ADMIN_USER_IDS に管理者UUIDをカンマ区切りで設定してください。',
    )
  }

  if (!ccssAdminUserIds.has(userId)) {
    return jsonCodeError(
      c,
      403,
      'CCSS_ADMIN_REQUIRED',
      'CCSS transpile validate API は管理者のみ実行できます。',
      '管理者として登録されたユーザーで再試行してください。',
    )
  }

  c.set('authUserId', userId)
  await next()
}

const getAuthUserId = (c: AppContext): string | null => c.get('authUserId')

const toValidatedIp = (value: string | undefined): string | null => {
  if (!value) {
    return null
  }
  const normalized = value.trim()
  if (normalized.length === 0) {
    return null
  }
  return isIP(normalized) > 0 ? normalized : null
}

const getClientIp = (c: AppContext): string => {
  if (!ccssTrustProxyHeaders) {
    return 'anonymous'
  }

  const forwarded = c.req.header('X-Forwarded-For')?.trim()
  if (forwarded && forwarded.length > 0) {
    const first = forwarded.split(',')[0]
    const validatedForwardedIp = toValidatedIp(first)
    if (validatedForwardedIp) {
      return validatedForwardedIp
    }
  }

  const validatedRealIp = toValidatedIp(c.req.header('X-Real-IP'))
  if (validatedRealIp) {
    return validatedRealIp
  }
  return 'anonymous'
}

const consumeStylePatchRateLimit = (c: AppContext): { allowed: true } | { allowed: false; retryAfterMs: number } => {
  const now = Date.now()

  if (ccssStylePatchRateLimitBuckets.size >= 2048) {
    for (const [key, bucket] of ccssStylePatchRateLimitBuckets.entries()) {
      if (bucket.resetAt <= now) {
        ccssStylePatchRateLimitBuckets.delete(key)
      }
    }
  }

  const userId = getAuthUserId(c)
  const key = userId ? `user:${userId}` : `anon:${getClientIp(c)}`

  const existing = ccssStylePatchRateLimitBuckets.get(key)
  if (!existing || existing.resetAt <= now) {
    ccssStylePatchRateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + ccssStylePatchRateLimitWindowMs,
    })
    return { allowed: true }
  }

  if (existing.count >= ccssStylePatchRateLimitMaxRequests) {
    return {
      allowed: false,
      retryAfterMs: Math.max(1, existing.resetAt - now),
    }
  }

  existing.count += 1
  ccssStylePatchRateLimitBuckets.set(key, existing)
  return { allowed: true }
}

const toAuditText = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback
  }
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : fallback
}

const toAuditPayload = (value: unknown): Record<string, unknown> => {
  if (value === undefined || value === null) {
    return {}
  }
  if (isRecord(value)) {
    return value
  }
  return { raw: value }
}

const writeStylePatchAudit = async (
  c: AppContext,
  record: Database['public']['Tables']['ccss_style_patches']['Insert'],
): Promise<Response | null> => {
  if (!ccssStylePatchAuditEnabled) {
    return null
  }

  const { error } = await supabase
    .from('ccss_style_patches')
    .insert(record)

  if (error) {
    return jsonCodeError(
      c,
      500,
      'CCSS_AUDIT_LOG_WRITE_FAILED',
      'style-patch 監査ログの保存に失敗しました。',
      error.message,
    )
  }
  return null
}

const writeTranspileAudit = async (
  c: AppContext,
  record: Database['public']['Tables']['ccss_transpile_jobs']['Insert'],
): Promise<Response | null> => {
  if (!ccssTranspileAuditEnabled) {
    return null
  }

  const { error } = await supabase
    .from('ccss_transpile_jobs')
    .insert(record)

  if (error) {
    return jsonCodeError(
      c,
      500,
      'CCSS_TRANSPILE_AUDIT_LOG_WRITE_FAILED',
      'transpile validate 監査ログの保存に失敗しました。',
      error.message,
    )
  }
  return null
}

const parseStageId = (c: AppContext): string | Response => {
  const stageId = c.req.param('id')
  if (!stageId || !isUuid(stageId)) {
    return jsonError(c, 400, 'stage id はUUID形式で指定してください。')
  }
  return stageId
}

const parseQueryLimit = (
  c: AppContext,
  rawLimit: string | undefined,
  fallback = 50,
): number | Response => {
  if (rawLimit === undefined) {
    return fallback
  }

  const limit = Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return jsonError(c, 400, 'limit は 1 以上 200 以下の整数で指定してください。')
  }
  return limit
}

const ensureStageOwner = async (
  c: AppContext,
  stageId: string,
  userId: string,
): Promise<{ stage: { id: string; author_id: string } } | Response> => {
  const { data: stage, error } = await supabase
    .from('stages')
    .select('id,author_id')
    .eq('id', stageId)
    .maybeSingle()

  if (error) {
    return dbError(c, error, 'ステージ情報の取得に失敗しました')
  }
  if (!stage) {
    return jsonError(c, 404, '対象ステージが存在しません。')
  }
  if (stage.author_id !== userId) {
    return jsonError(c, 403, '他ユーザーのステージは操作できません。')
  }

  return { stage }
}

app.use(
  '/api/*',
  cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
)

app.get('/', (c) => c.text('API server for Issue #14 is running.'))

app.get('/api/profiles/me', requireAuth, async (c) => {
  const userId = getAuthUserId(c)
  if (!userId) {
    return jsonError(c, 401, '認証情報の取得に失敗しました。')
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    return dbError(c, error, 'プロフィール取得に失敗しました')
  }
  if (!profile) {
    return jsonError(c, 404, 'プロフィールが見つかりません。')
  }

  return c.json({ data: profile })
})

app.put('/api/profiles/me', requireAuth, async (c) => {
  const userId = getAuthUserId(c)
  if (!userId) {
    return jsonError(c, 401, '認証情報の取得に失敗しました。')
  }

  const bodyResult = await readJsonObject(c)
  if (bodyResult instanceof Response) {
    return bodyResult
  }

  const rawDisplayName = bodyResult.display_name
  if (typeof rawDisplayName !== 'string') {
    return jsonError(c, 400, 'display_name は文字列で指定してください。')
  }
  const displayName = rawDisplayName.trim()
  if (displayName.length === 0) {
    return jsonError(c, 400, 'display_name は空文字にできません。')
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId)
    .select('*')
    .maybeSingle()

  if (error) {
    return dbError(c, error, 'プロフィール更新に失敗しました')
  }
  if (!profile) {
    return jsonError(c, 404, '更新対象プロフィールが見つかりません。')
  }

  return c.json({ data: profile })
})

app.get('/api/profiles/me/likes', requireAuth, async (c) => {
  const userId = getAuthUserId(c)
  if (!userId) {
    return jsonError(c, 401, '認証情報の取得に失敗しました。')
  }

  const { data: likes, error: likesError } = await supabase
    .from('likes')
    .select('stage_id,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (likesError) {
    return dbError(c, likesError, 'いいね一覧取得に失敗しました')
  }

  const stageIds = (likes ?? []).map((like) => like.stage_id)
  if (stageIds.length === 0) {
    return c.json({ data: [], total: 0 })
  }

  const { data: stages, error: stagesError } = await supabase
    .from('stages')
    .select(STAGE_LIST_SELECT)
    .in('id', stageIds)

  if (stagesError) {
    return dbError(c, stagesError, 'いいね済みステージ取得に失敗しました')
  }

  const stageById = new Map((stages ?? []).map((stage) => [stage.id, stage]))
  const orderedStages = stageIds
    .map((stageId) => stageById.get(stageId))
    .filter((stage): stage is StageListItem => stage !== undefined)

  return c.json({
    data: orderedStages,
    total: orderedStages.length,
  })
})

app.get('/api/stages', async (c) => {
  const q = c.req.query('q')?.trim()
  const authorId = c.req.query('author_id')?.trim()
  const isPublished = parseBoolean(c.req.query('is_published'))
  const page = parsePositiveInt(c.req.query('page'), 1)
  const limit = Math.min(parsePositiveInt(c.req.query('limit'), 10), 50)
  const offset = (page - 1) * limit

  let query = supabase
    .from('stages')
    .select(STAGE_LIST_SELECT, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (q && q.length > 0) {
    query = query.ilike('title', `%${q}%`)
  }
  if (authorId && authorId.length > 0) {
    query = query.eq('author_id', authorId)
  }
  if (isPublished !== undefined) {
    query = query.eq('is_published', isPublished)
  }

  const { data: stages, error, count } = await query
  if (error) {
    return dbError(c, error, 'ステージ一覧の取得に失敗しました')
  }

  const total = count ?? 0
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit)

  return c.json({
    data: stages ?? [],
    pagination: {
      page,
      limit,
      total,
      total_pages: totalPages,
    },
    filters: {
      q: q ?? null,
      author_id: authorId ?? null,
      is_published: isPublished ?? null,
    },
  })
})

app.post('/api/stages', requireAuth, async (c) => {
  const userId = getAuthUserId(c)
  if (!userId) {
    return jsonError(c, 401, '認証情報の取得に失敗しました。')
  }

  const bodyResult = await readJsonObject(c)
  if (bodyResult instanceof Response) {
    return bodyResult
  }

  if (bodyResult.title !== undefined && typeof bodyResult.title !== 'string') {
    return jsonError(c, 400, 'title は文字列で指定してください。')
  }
  if (bodyResult.is_published !== undefined && typeof bodyResult.is_published !== 'boolean') {
    return jsonError(c, 400, 'is_published はbooleanで指定してください。')
  }

  const title =
    typeof bodyResult.title === 'string' && bodyResult.title.trim().length > 0
      ? bodyResult.title.trim()
      : 'Untitled Stage'
  const stageDataCandidate = bodyResult.stage_data ?? createEmptyStageData()
  if (!isStageData(stageDataCandidate)) {
    return jsonError(c, 400, 'stage_data の形式が不正です。')
  }

  const { data: stage, error } = await supabase
    .from('stages')
    .insert({
      author_id: userId,
      title,
      stage_data: stageDataCandidate,
      is_published: bodyResult.is_published === true,
    })
    .select('*')
    .single()

  if (error) {
    return dbError(c, error, 'ステージ作成に失敗しました')
  }

  return c.json(
    {
      data: stage,
      message: 'Stage created.',
    },
    201,
  )
})

app.get('/api/stages/:id', async (c) => {
  const stageIdResult = parseStageId(c)
  if (stageIdResult instanceof Response) {
    return stageIdResult
  }
  const stageId = stageIdResult

  const { data: stage, error } = await supabase
    .from('stages')
    .select('*')
    .eq('id', stageId)
    .maybeSingle()

  if (error) {
    return dbError(c, error, 'ステージ取得に失敗しました')
  }
  if (!stage) {
    return jsonError(c, 404, '対象ステージが見つかりません。')
  }

  return c.json({ data: stage })
})

app.put('/api/stages/:id', requireAuth, async (c) => {
  const userId = getAuthUserId(c)
  if (!userId) {
    return jsonError(c, 401, '認証情報の取得に失敗しました。')
  }

  const stageIdResult = parseStageId(c)
  if (stageIdResult instanceof Response) {
    return stageIdResult
  }
  const stageId = stageIdResult

  const ownerResult = await ensureStageOwner(c, stageId, userId)
  if (ownerResult instanceof Response) {
    return ownerResult
  }

  const bodyResult = await readJsonObject(c)
  if (bodyResult instanceof Response) {
    return bodyResult
  }

  const updates: Database['public']['Tables']['stages']['Update'] = {}

  if (hasOwn(bodyResult, 'title')) {
    if (typeof bodyResult.title !== 'string') {
      return jsonError(c, 400, 'title は文字列で指定してください。')
    }
    const title = bodyResult.title.trim()
    if (title.length === 0) {
      return jsonError(c, 400, 'title は空文字にできません。')
    }
    updates.title = title
  }

  if (hasOwn(bodyResult, 'stage_data')) {
    if (!isStageData(bodyResult.stage_data)) {
      return jsonError(c, 400, 'stage_data の形式が不正です。')
    }
    updates.stage_data = bodyResult.stage_data
  }

  if (hasOwn(bodyResult, 'is_published')) {
    if (typeof bodyResult.is_published !== 'boolean') {
      return jsonError(c, 400, 'is_published はbooleanで指定してください。')
    }
    updates.is_published = bodyResult.is_published
  }

  if (Object.keys(updates).length === 0) {
    return jsonError(c, 400, '更新対象フィールドがありません。')
  }

  const { data: updatedStage, error: updateError } = await supabase
    .from('stages')
    .update(updates)
    .eq('id', ownerResult.stage.id)
    .select('*')
    .single()

  if (updateError) {
    return dbError(c, updateError, 'ステージ更新に失敗しました')
  }

  return c.json({
    data: updatedStage,
    message: 'Stage updated.',
  })
})

app.delete('/api/stages/:id', requireAuth, async (c) => {
  const userId = getAuthUserId(c)
  if (!userId) {
    return jsonError(c, 401, '認証情報の取得に失敗しました。')
  }

  const stageIdResult = parseStageId(c)
  if (stageIdResult instanceof Response) {
    return stageIdResult
  }
  const stageId = stageIdResult

  const ownerResult = await ensureStageOwner(c, stageId, userId)
  if (ownerResult instanceof Response) {
    return ownerResult
  }

  const { error } = await supabase.from('stages').delete().eq('id', ownerResult.stage.id)
  if (error) {
    return dbError(c, error, 'ステージ削除に失敗しました')
  }

  return c.json({
    data: {
      id: ownerResult.stage.id,
      deleted: true,
      deleted_at: new Date().toISOString(),
    },
    message: 'Stage deleted.',
  })
})

app.post('/api/stages/:id/play_logs', optionalAuth, async (c) => {
  const stageIdResult = parseStageId(c)
  if (stageIdResult instanceof Response) {
    return stageIdResult
  }
  const stageId = stageIdResult

  const bodyResult = await readJsonObject(c)
  if (bodyResult instanceof Response) {
    return bodyResult
  }

  if (hasOwn(bodyResult, 'is_cleared') && typeof bodyResult.is_cleared !== 'boolean') {
    return jsonError(c, 400, 'is_cleared はbooleanで指定してください。')
  }
  if (
    hasOwn(bodyResult, 'retry_count') &&
    (typeof bodyResult.retry_count !== 'number' ||
      !Number.isInteger(bodyResult.retry_count) ||
      bodyResult.retry_count < 0)
  ) {
    return jsonError(c, 400, 'retry_count は0以上の整数で指定してください。')
  }

  const isCleared = bodyResult.is_cleared === true
  const retryCount = typeof bodyResult.retry_count === 'number' ? bodyResult.retry_count : 0
  const authUserId = getAuthUserId(c)

  const { data: stage, error: stageError } = await supabase
    .from('stages')
    .select('id,play_count,clear_count')
    .eq('id', stageId)
    .maybeSingle()

  if (stageError) {
    return dbError(c, stageError, '対象ステージの取得に失敗しました')
  }
  if (!stage) {
    return jsonError(c, 404, '対象ステージが存在しません。')
  }

  const { data: playLog, error: logError } = await supabase
    .from('play_logs')
    .insert({
      stage_id: stageId,
      player_id: authUserId,
      is_cleared: isCleared,
      retry_count: retryCount,
    })
    .select('*')
    .single()

  if (logError) {
    return dbError(c, logError, 'プレイログ記録に失敗しました')
  }

  const { data: updatedStage, error: updateError } = await supabase
    .rpc('increment_stage_counters', {
      p_stage_id: stageId,
      p_clear_increment: isCleared ? 1 : 0,
    })
    .single()

  if (updateError) {
    return dbError(c, updateError, 'ステージ統計更新に失敗しました')
  }

  return c.json({
    data: playLog,
    aggregates: {
      play_count: updatedStage.play_count,
      clear_count: updatedStage.clear_count,
    },
  })
})

app.post('/api/stages/:id/likes', requireAuth, async (c) => {
  const userId = getAuthUserId(c)
  if (!userId) {
    return jsonError(c, 401, '認証情報の取得に失敗しました。')
  }

  const stageIdResult = parseStageId(c)
  if (stageIdResult instanceof Response) {
    return stageIdResult
  }
  const stageId = stageIdResult

  const { data: stage, error: stageError } = await supabase
    .from('stages')
    .select('id')
    .eq('id', stageId)
    .maybeSingle()
  if (stageError) {
    return dbError(c, stageError, '対象ステージの取得に失敗しました')
  }
  if (!stage) {
    return jsonError(c, 404, '対象ステージが存在しません。')
  }

  const { data: existingLike, error: existingLikeError } = await supabase
    .from('likes')
    .select('stage_id')
    .eq('stage_id', stageId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existingLikeError) {
    return dbError(c, existingLikeError, 'いいね状態の確認に失敗しました')
  }

  let liked: boolean
  if (existingLike) {
    liked = false
    const { error: deleteLikeError } = await supabase
      .from('likes')
      .delete()
      .eq('stage_id', stageId)
      .eq('user_id', userId)
    if (deleteLikeError) {
      return dbError(c, deleteLikeError, 'いいね解除に失敗しました')
    }
  } else {
    liked = true
    const { error: insertLikeError } = await supabase
      .from('likes')
      .insert({ stage_id: stageId, user_id: userId })
    if (insertLikeError) {
      return dbError(c, insertLikeError, 'いいね登録に失敗しました')
    }
  }

  const { data: updatedStage, error: updateError } = await supabase
    .rpc('recalc_stage_like_count', { stage_id: stageId })
    .single()

  if (updateError) {
    return dbError(c, updateError, 'ステージのいいね件数更新に失敗しました')
  }

  return c.json({
    data: {
      stage_id: stageId,
      user_id: userId,
      liked,
      like_count: updatedStage.like_count,
      updated_at: updatedStage.updated_at,
    },
  })
})

app.get('/api/ccss/style-patch/states', optionalAuth, (c) => {
  const viewFilter = c.req.query('view')?.trim()

  const capabilitiesByKey = new Map<string, { view: string; stateId: string; recipeCount: number }>()
  for (const recipe of CCSS_RECIPE_REGISTRY) {
    if (viewFilter && viewFilter.length > 0 && recipe.view !== viewFilter) {
      continue
    }

    const key = `${recipe.view}:${recipe.stateId}`
    const existing = capabilitiesByKey.get(key)
    if (existing) {
      existing.recipeCount += 1
      continue
    }

    capabilitiesByKey.set(key, {
      view: recipe.view,
      stateId: recipe.stateId,
      recipeCount: 1,
    })
  }

  const data = Array.from(capabilitiesByKey.values()).sort((a, b) => {
    const viewOrder = a.view.localeCompare(b.view)
    return viewOrder !== 0 ? viewOrder : a.stateId.localeCompare(b.stateId)
  })

  return c.json({ data })
})

app.post('/api/ccss/style-patch', optionalAuth, async (c) => {
  const rateLimit = consumeStylePatchRateLimit(c)
  if (!rateLimit.allowed) {
    return c.json(
      {
        error: {
          code: 'CCSS_RATE_LIMITED',
          message: 'style-patch API のリクエストが短時間に集中しています。',
          hint: `${rateLimit.retryAfterMs}ms 待って再試行してください。`,
          retryAfterMs: rateLimit.retryAfterMs,
        },
      },
      429,
    )
  }

  const requestId = `req_${randomUUID().replace(/-/g, '')}`
  const patchId = `ccss_patch_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 8)}`
  const authUserId = getAuthUserId(c)

  const bodyResult = await readJsonObject(c)
  if (bodyResult instanceof Response) {
    return bodyResult
  }

  const rejectWithAudit = async (
    status: ErrorStatus,
    code: string,
    message: string,
    hint: string,
    view: unknown,
    stateId: unknown,
    payload: unknown,
  ): Promise<Response> => {
    const auditError = await writeStylePatchAudit(c, {
      id: patchId,
      request_id: requestId,
      view: toAuditText(view, '[invalid-view]'),
      state_id: toAuditText(stateId, '[invalid-state-id]'),
      applied_recipe_ids: [],
      resolved_class_list: [],
      ruleset_version: CCSS_RULESET_VERSION,
      ttl_ms: CCSS_PATCH_TTL_MS,
      requested_payload: toAuditPayload(payload),
      rejection_code: code,
      created_by: authUserId,
    })

    if (auditError) {
      return auditError
    }

    return jsonCodeError(c, status, code, message, hint)
  }

  const rawView = bodyResult.view
  if (typeof rawView !== 'string' || rawView.trim().length === 0) {
    return rejectWithAudit(
      400,
      'CCSS_INVALID_VIEW',
      'view は空でない文字列で指定してください',
      '例: sample',
      rawView,
      bodyResult.stateId,
      bodyResult.payload,
    )
  }
  const view = rawView.trim()

  const rawStateId = bodyResult.stateId
  if (typeof rawStateId !== 'string' || !CCSS_STATE_ID_PATTERN.test(rawStateId)) {
    return rejectWithAudit(
      400,
      'CCSS_INVALID_STATE',
      '未定義の stateId です',
      'ccss.manifest.json の stateId を指定してください',
      view,
      rawStateId,
      bodyResult.payload,
    )
  }
  const stateId = rawStateId

  if (hasOwn(bodyResult, 'payload') && bodyResult.payload !== null && !isRecord(bodyResult.payload)) {
    return rejectWithAudit(
      400,
      'CCSS_INVALID_PAYLOAD',
      'payload はJSONオブジェクトで指定してください',
      '例: { \"stageId\": \"...\" }',
      view,
      stateId,
      bodyResult.payload,
    )
  }
  const payload = toAuditPayload(bodyResult.payload)

  const unsafe = findUnsafeTokenPath(payload, 'payload')
  if (unsafe) {
    return rejectWithAudit(
      422,
      'CCSS_UNSAFE_INPUT_REJECTED',
      `危険トークンを検知したため拒否しました: ${unsafe.path}`,
      `${unsafe.token} を含む入力を除去してください`,
      view,
      stateId,
      payload,
    )
  }

  const knownStateRecipes = CCSS_RECIPE_REGISTRY.filter((recipe) => recipe.stateId === stateId)
  if (knownStateRecipes.length === 0) {
    return rejectWithAudit(
      400,
      'CCSS_INVALID_STATE',
      '未定義の stateId です',
      'ccss.manifest.json の stateId を指定してください',
      view,
      stateId,
      payload,
    )
  }

  const resolvedRecipes = knownStateRecipes.filter((recipe) => recipe.view === view)
  if (resolvedRecipes.length === 0) {
    return rejectWithAudit(
      403,
      'CCSS_RECIPE_OUT_OF_SCOPE',
      '指定 view に対応しないレシピ参照です',
      'view と stateId の組み合わせを見直してください',
      view,
      stateId,
      payload,
    )
  }

  const recipeIds = resolvedRecipes.map((recipe) => recipe.recipeId)
  const classList: CcssClassListItem[] = resolvedRecipes.map((recipe) => ({
    targetClass: recipe.targetClass,
    add: recipe.addClasses,
  }))

  const auditError = await writeStylePatchAudit(c, {
    id: patchId,
    request_id: requestId,
    view,
    state_id: stateId,
    applied_recipe_ids: recipeIds,
    resolved_class_list: classList,
    ruleset_version: CCSS_RULESET_VERSION,
    ttl_ms: CCSS_PATCH_TTL_MS,
    requested_payload: payload,
    rejection_code: null,
    created_by: authUserId,
  })
  if (auditError) {
    return auditError
  }

  return c.json({
    requestId,
    patchId,
    stateId,
    ttlMs: CCSS_PATCH_TTL_MS,
    recipeIds,
    classList,
    rulesetVersion: CCSS_RULESET_VERSION,
  })
})

app.post('/api/ccss/state-events', optionalAuth, async (c) => {
  const bodyResult = await readJsonObject(c)
  if (bodyResult instanceof Response) {
    return bodyResult
  }

  const rawSessionKey = bodyResult.sessionKey
  if (typeof rawSessionKey !== 'string' || rawSessionKey.trim().length === 0) {
    return jsonCodeError(
      c,
      400,
      'CCSS_INVALID_SESSION_KEY',
      'sessionKey は空でない文字列で指定してください。',
      '例: ccss-poc-session-001',
    )
  }
  const sessionKey = rawSessionKey.trim()

  const rawStateId = bodyResult.stateId
  if (typeof rawStateId !== 'string' || !CCSS_STATE_ID_PATTERN.test(rawStateId)) {
    return jsonCodeError(
      c,
      400,
      'CCSS_INVALID_STATE',
      'stateId は ccss:<page>:<component>:<state> 形式で指定してください。',
      '例: ccss:sample:sample-panel:menu-open',
    )
  }
  const stateId = rawStateId

  const rawEventName = bodyResult.eventName
  if (typeof rawEventName !== 'string' || rawEventName.trim().length === 0) {
    return jsonCodeError(
      c,
      400,
      'CCSS_INVALID_EVENT_NAME',
      'eventName は空でない文字列で指定してください。',
      '例: ui:state:set',
    )
  }
  const eventName = rawEventName.trim()

  const rawRequestId = bodyResult.requestId
  if (rawRequestId !== undefined && typeof rawRequestId !== 'string') {
    return jsonCodeError(
      c,
      400,
      'CCSS_INVALID_REQUEST_ID',
      'requestId は文字列で指定してください。',
      '例: req_xxx',
    )
  }
  const requestId = typeof rawRequestId === 'string' && rawRequestId.trim().length > 0
    ? rawRequestId.trim()
    : null

  const rawPatchId = bodyResult.patchId
  if (rawPatchId !== undefined && typeof rawPatchId !== 'string') {
    return jsonCodeError(
      c,
      400,
      'CCSS_INVALID_PATCH_ID',
      'patchId は文字列で指定してください。',
      '例: ccss_patch_xxx',
    )
  }
  const patchId = typeof rawPatchId === 'string' && rawPatchId.trim().length > 0
    ? rawPatchId.trim()
    : null

  if (hasOwn(bodyResult, 'payload') && bodyResult.payload !== null && !isRecord(bodyResult.payload)) {
    return jsonCodeError(
      c,
      400,
      'CCSS_INVALID_PAYLOAD',
      'payload はJSONオブジェクトで指定してください',
      '例: { \"source\": \"poc\" }',
    )
  }
  const payload = toAuditPayload(bodyResult.payload)

  const unsafe = findUnsafeTokenPath(payload, 'payload')
  if (unsafe) {
    return jsonCodeError(
      c,
      422,
      'CCSS_UNSAFE_INPUT_REJECTED',
      `危険トークンを検知したため拒否しました: ${unsafe.path}`,
      `${unsafe.token} を含む入力を除去してください`,
    )
  }

  if (!ccssStateEventAuditEnabled) {
    return c.json({
      recorded: false,
      reason: 'CCSS_STATE_EVENT_AUDIT_DISABLED',
    })
  }

  const { data, error } = await supabase
    .from('ccss_state_events')
    .insert({
      session_key: sessionKey,
      state_id: stateId,
      event_name: eventName,
      request_id: requestId,
      patch_id: patchId,
      payload,
      created_by: getAuthUserId(c),
    })
    .select('id')
    .single()

  if (error) {
    return dbError(c, error, 'state event監査ログの保存に失敗しました')
  }

  return c.json({
    recorded: true,
    eventId: data.id,
  })
})

app.get('/api/ccss/audit/style-patches', requireCcssAdmin, async (c) => {
  const limit = parseQueryLimit(c, c.req.query('limit'))
  if (limit instanceof Response) {
    return limit
  }

  const view = c.req.query('view')?.trim()
  const stateId = c.req.query('stateId')?.trim()
  const rejectionCode = c.req.query('rejectionCode')?.trim()
  const requestId = c.req.query('requestId')?.trim()
  const patchId = c.req.query('patchId')?.trim()

  if (stateId && !CCSS_STATE_ID_PATTERN.test(stateId)) {
    return jsonCodeError(
      c,
      400,
      'CCSS_INVALID_STATE',
      'stateId は ccss:<page>:<component>:<state> 形式で指定してください。',
      '例: ccss:sample:sample-panel:menu-open',
    )
  }

  let query = supabase
    .from('ccss_style_patches')
    .select(CCSS_STYLE_PATCH_AUDIT_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (view && view.length > 0) {
    query = query.eq('view', view)
  }
  if (stateId && stateId.length > 0) {
    query = query.eq('state_id', stateId)
  }
  if (rejectionCode && rejectionCode.length > 0) {
    query = query.eq('rejection_code', rejectionCode)
  }
  if (requestId && requestId.length > 0) {
    query = query.eq('request_id', requestId)
  }
  if (patchId && patchId.length > 0) {
    query = query.eq('id', patchId)
  }

  const { data, error } = await query
  if (error) {
    return dbError(c, error, 'style-patch監査ログの取得に失敗しました')
  }
  return c.json({ data: data ?? [] })
})

app.get('/api/ccss/audit/state-events', requireCcssAdmin, async (c) => {
  const limit = parseQueryLimit(c, c.req.query('limit'))
  if (limit instanceof Response) {
    return limit
  }

  const sessionKey = c.req.query('sessionKey')?.trim()
  const stateId = c.req.query('stateId')?.trim()
  const eventName = c.req.query('eventName')?.trim()
  const requestId = c.req.query('requestId')?.trim()
  const patchId = c.req.query('patchId')?.trim()

  if (stateId && !CCSS_STATE_ID_PATTERN.test(stateId)) {
    return jsonCodeError(
      c,
      400,
      'CCSS_INVALID_STATE',
      'stateId は ccss:<page>:<component>:<state> 形式で指定してください。',
      '例: ccss:sample:sample-panel:menu-open',
    )
  }

  let query = supabase
    .from('ccss_state_events')
    .select(CCSS_STATE_EVENT_AUDIT_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (sessionKey && sessionKey.length > 0) {
    query = query.eq('session_key', sessionKey)
  }
  if (stateId && stateId.length > 0) {
    query = query.eq('state_id', stateId)
  }
  if (eventName && eventName.length > 0) {
    query = query.eq('event_name', eventName)
  }
  if (requestId && requestId.length > 0) {
    query = query.eq('request_id', requestId)
  }
  if (patchId && patchId.length > 0) {
    query = query.eq('patch_id', patchId)
  }

  const { data, error } = await query
  if (error) {
    return dbError(c, error, 'state-events監査ログの取得に失敗しました')
  }
  return c.json({ data: data ?? [] })
})

app.get('/api/ccss/audit/sessions', requireCcssAdmin, async (c) => {
  const limit = parseQueryLimit(c, c.req.query('limit'), 50)
  if (limit instanceof Response) {
    return limit
  }

  const stateId = c.req.query('stateId')?.trim()
  const eventName = c.req.query('eventName')?.trim()
  if (stateId && !CCSS_STATE_ID_PATTERN.test(stateId)) {
    return jsonCodeError(
      c,
      400,
      'CCSS_INVALID_STATE',
      'stateId は ccss:<page>:<component>:<state> 形式で指定してください。',
      '例: ccss:sample:sample-panel:menu-open',
    )
  }

  const scanLimit = Math.min(limit * 20, 4000)
  let query = supabase
    .from('ccss_state_events')
    .select('session_key,state_id,event_name,request_id,patch_id,created_at')
    .order('created_at', { ascending: false })
    .limit(scanLimit)

  if (stateId && stateId.length > 0) {
    query = query.eq('state_id', stateId)
  }
  if (eventName && eventName.length > 0) {
    query = query.eq('event_name', eventName)
  }

  const { data, error } = await query
  if (error) {
    return dbError(c, error, 'session一覧監査ログの取得に失敗しました')
  }

  type SessionAggregate = {
    sessionKey: string
    latestCreatedAt: string
    latestStateId: string
    latestEventName: string
    eventCount: number
    withPatchIdCount: number
    withRequestIdCount: number
    stateIds: Set<string>
    eventNames: Set<string>
  }

  const aggregates = new Map<string, SessionAggregate>()
  for (const row of data ?? []) {
    const existing = aggregates.get(row.session_key)
    if (!existing) {
      aggregates.set(row.session_key, {
        sessionKey: row.session_key,
        latestCreatedAt: row.created_at,
        latestStateId: row.state_id,
        latestEventName: row.event_name,
        eventCount: 1,
        withPatchIdCount: row.patch_id ? 1 : 0,
        withRequestIdCount: row.request_id ? 1 : 0,
        stateIds: new Set([row.state_id]),
        eventNames: new Set([row.event_name]),
      })
      continue
    }

    existing.eventCount += 1
    if (row.patch_id) {
      existing.withPatchIdCount += 1
    }
    if (row.request_id) {
      existing.withRequestIdCount += 1
    }
    existing.stateIds.add(row.state_id)
    existing.eventNames.add(row.event_name)
  }

  const sessions = Array.from(aggregates.values())
    .sort((a, b) => b.latestCreatedAt.localeCompare(a.latestCreatedAt))
    .slice(0, limit)
    .map((session) => ({
      sessionKey: session.sessionKey,
      latestCreatedAt: session.latestCreatedAt,
      latestStateId: session.latestStateId,
      latestEventName: session.latestEventName,
      eventCount: session.eventCount,
      withPatchIdCount: session.withPatchIdCount,
      withRequestIdCount: session.withRequestIdCount,
      uniqueStateCount: session.stateIds.size,
      uniqueEventNameCount: session.eventNames.size,
    }))

  return c.json({
    window: {
      sessionLimit: limit,
      scannedRows: data?.length ?? 0,
    },
    data: sessions,
  })
})

app.get('/api/ccss/audit/session-trace', requireCcssAdmin, async (c) => {
  const rawSessionKey = c.req.query('sessionKey')
  if (typeof rawSessionKey !== 'string' || rawSessionKey.trim().length === 0) {
    return jsonCodeError(
      c,
      400,
      'CCSS_INVALID_SESSION_KEY',
      'sessionKey は空でない文字列で指定してください。',
      '例: ccss-poc-session-001',
    )
  }
  const sessionKey = rawSessionKey.trim()

  const limit = parseQueryLimit(c, c.req.query('limit'), 100)
  if (limit instanceof Response) {
    return limit
  }

  const rawFromLatest = c.req.query('fromLatest')
  const parsedFromLatest = parseBoolean(rawFromLatest)
  if (rawFromLatest !== undefined && parsedFromLatest === undefined) {
    return jsonError(c, 400, 'fromLatest は true または false で指定してください。')
  }
  const fromLatest = parsedFromLatest ?? true

  const { data: stateEvents, error: stateEventsError } = await supabase
    .from('ccss_state_events')
    .select(CCSS_STATE_EVENT_AUDIT_SELECT)
    .eq('session_key', sessionKey)
    .order('created_at', { ascending: !fromLatest })
    .limit(limit)

  if (stateEventsError) {
    return dbError(c, stateEventsError, 'state-eventsセッショントレースの取得に失敗しました')
  }

  const fetchedEvents = stateEvents ?? []
  const events = fromLatest ? [...fetchedEvents].reverse() : fetchedEvents
  const patchIds = Array.from(
    new Set(
      events
        .map((event) => event.patch_id)
        .filter((patchId): patchId is string => typeof patchId === 'string' && patchId.length > 0),
    ),
  )
  const requestIds = Array.from(
    new Set(
      events
        .map((event) => event.request_id)
        .filter((requestId): requestId is string => typeof requestId === 'string' && requestId.length > 0),
    ),
  )

  type SessionTracePatchRecord = {
    id: string
    request_id: string
    view: string
    state_id: string
    applied_recipe_ids: string[]
    rejection_code: string | null
    created_at: string
  }
  const toSessionTracePatchRecord = (patch: {
    id: string
    request_id: string
    view: string
    state_id: string
    applied_recipe_ids: string[]
    rejection_code: string | null
    created_at: string
  }): SessionTracePatchRecord => ({
    id: patch.id,
    request_id: patch.request_id,
    view: patch.view,
    state_id: patch.state_id,
    applied_recipe_ids: patch.applied_recipe_ids,
    rejection_code: patch.rejection_code,
    created_at: patch.created_at,
  })
  const patchesById = new Map<string, SessionTracePatchRecord>()
  const patchesByRequestId = new Map<string, SessionTracePatchRecord>()

  if (patchIds.length > 0) {
    const { data: patchesByPatchId, error: patchesByPatchIdError } = await supabase
      .from('ccss_style_patches')
      .select(CCSS_STYLE_PATCH_AUDIT_SELECT)
      .in('id', patchIds)

    if (patchesByPatchIdError) {
      return dbError(c, patchesByPatchIdError, 'style-patch相関情報の取得に失敗しました')
    }

    for (const patch of patchesByPatchId ?? []) {
      const normalizedPatch = toSessionTracePatchRecord(patch)
      patchesById.set(normalizedPatch.id, normalizedPatch)
      if (!patchesByRequestId.has(normalizedPatch.request_id)) {
        patchesByRequestId.set(normalizedPatch.request_id, normalizedPatch)
      }
    }
  }

  const requestIdsForLookup = requestIds.filter((requestId) => !patchesByRequestId.has(requestId))
  if (requestIdsForLookup.length > 0) {
    const { data: patchesByRequestIdRows, error: patchesByRequestIdError } = await supabase
      .from('ccss_style_patches')
      .select(CCSS_STYLE_PATCH_AUDIT_SELECT)
      .in('request_id', requestIdsForLookup)

    if (patchesByRequestIdError) {
      return dbError(c, patchesByRequestIdError, 'request_id相関のstyle-patch取得に失敗しました')
    }

    for (const patch of patchesByRequestIdRows ?? []) {
      const normalizedPatch = toSessionTracePatchRecord(patch)
      patchesById.set(normalizedPatch.id, normalizedPatch)
      if (!patchesByRequestId.has(normalizedPatch.request_id)) {
        patchesByRequestId.set(normalizedPatch.request_id, normalizedPatch)
      }
    }
  }

  const timeline = events.map((event) => {
    const patchFromPatchId =
      event.patch_id && event.patch_id.length > 0 ? patchesById.get(event.patch_id) : undefined
    const patchFromRequestId =
      !patchFromPatchId && event.request_id ? patchesByRequestId.get(event.request_id) : undefined
    const matchedPatch = patchFromPatchId ?? patchFromRequestId

    return {
      eventId: event.id,
      createdAt: event.created_at,
      sessionKey: event.session_key,
      stateId: event.state_id,
      eventName: event.event_name,
      requestId: event.request_id,
      patchId: event.patch_id,
      payload: event.payload,
      correlation: patchFromPatchId ? 'patch_id' : patchFromRequestId ? 'request_id' : null,
      patch: matchedPatch
        ? {
            patchId: matchedPatch.id,
            requestId: matchedPatch.request_id,
            view: matchedPatch.view,
            stateId: matchedPatch.state_id,
            appliedRecipeIds: matchedPatch.applied_recipe_ids,
            rejectionCode: matchedPatch.rejection_code,
            createdAt: matchedPatch.created_at,
          }
        : null,
    }
  })

  const correlatedPatchCount = timeline.reduce((count, item) => count + (item.patch ? 1 : 0), 0)
  const firstCreatedAt = timeline.length > 0 ? timeline[0].createdAt : null
  const lastCreatedAt = timeline.length > 0 ? timeline[timeline.length - 1].createdAt : null
  return c.json({
    sessionKey,
    window: {
      limit,
      fromLatest,
      returned: timeline.length,
      firstCreatedAt,
      lastCreatedAt,
    },
    data: timeline,
    stats: {
      eventCount: timeline.length,
      correlatedPatchCount,
      uncorrelatedEventCount: timeline.length - correlatedPatchCount,
    },
  })
})

app.get('/api/ccss/audit/summary', requireCcssAdmin, async (c) => {
  const limit = parseQueryLimit(c, c.req.query('limit'), 100)
  if (limit instanceof Response) {
    return limit
  }

  const [styleResult, transpileResult, stateEventResult] = await Promise.all([
    supabase
      .from('ccss_style_patches')
      .select('rejection_code,created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('ccss_transpile_jobs')
      .select('status,created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('ccss_state_events')
      .select('event_name,patch_id,created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
  ])

  if (styleResult.error) {
    return dbError(c, styleResult.error, 'style-patch監査サマリーの取得に失敗しました')
  }
  if (transpileResult.error) {
    return dbError(c, transpileResult.error, 'transpile監査サマリーの取得に失敗しました')
  }
  if (stateEventResult.error) {
    return dbError(c, stateEventResult.error, 'state-events監査サマリーの取得に失敗しました')
  }

  const styleRows = styleResult.data ?? []
  const rejectionCodes: Record<string, number> = {}
  let rejectedCount = 0
  for (const row of styleRows) {
    if (!row.rejection_code) {
      continue
    }
    rejectedCount += 1
    rejectionCodes[row.rejection_code] = (rejectionCodes[row.rejection_code] ?? 0) + 1
  }

  const transpileRows = transpileResult.data ?? []
  const statusCounts = Object.fromEntries(
    CCSS_TRANSPILE_JOB_STATUSES.map((status) => [status, 0]),
  ) as Record<CcssTranspileJobStatus, number>
  for (const row of transpileRows) {
    statusCounts[row.status] += 1
  }

  const stateEventRows = stateEventResult.data ?? []
  const eventNames: Record<string, number> = {}
  let withPatchIdCount = 0
  for (const row of stateEventRows) {
    eventNames[row.event_name] = (eventNames[row.event_name] ?? 0) + 1
    if (row.patch_id && row.patch_id.length > 0) {
      withPatchIdCount += 1
    }
  }

  return c.json({
    window: {
      limit,
    },
    stylePatches: {
      total: styleRows.length,
      rejectedCount,
      rejectionCodes,
    },
    transpileJobs: {
      total: transpileRows.length,
      statusCounts,
    },
    stateEvents: {
      total: stateEventRows.length,
      eventNames,
      withPatchIdCount,
      withoutPatchIdCount: stateEventRows.length - withPatchIdCount,
    },
  })
})

app.get('/api/ccss/audit/transpile-jobs', requireCcssAdmin, async (c) => {
  const limit = parseQueryLimit(c, c.req.query('limit'))
  if (limit instanceof Response) {
    return limit
  }

  const rawStatus = c.req.query('status')?.trim()
  const requestedBy = c.req.query('requestedBy')?.trim()

  if (requestedBy && !isUuid(requestedBy)) {
    return jsonError(c, 400, 'requestedBy はUUID形式で指定してください。')
  }

  let status: CcssTranspileJobStatus | undefined
  if (rawStatus && rawStatus.length > 0) {
    if (!CCSS_TRANSPILE_JOB_STATUSES.includes(rawStatus as CcssTranspileJobStatus)) {
      return jsonCodeError(
        c,
        400,
        'CCSS_INVALID_STATUS',
        'status は queued/running/succeeded/failed のいずれかで指定してください。',
        '例: succeeded',
      )
    }
    status = rawStatus as CcssTranspileJobStatus
  }

  let query = supabase
    .from('ccss_transpile_jobs')
    .select('id,requested_by,source_path,status,warnings,errors,created_at,finished_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) {
    query = query.eq('status', status)
  }
  if (requestedBy && requestedBy.length > 0) {
    query = query.eq('requested_by', requestedBy)
  }

  const { data, error } = await query
  if (error) {
    return dbError(c, error, 'transpile監査ログの取得に失敗しました')
  }
  return c.json({ data: data ?? [] })
})

app.post('/api/ccss/transpile/validate', requireCcssAdmin, async (c) => {
  const requestedBy = getAuthUserId(c)
  if (!requestedBy) {
    return jsonCodeError(
      c,
      500,
      'CCSS_ADMIN_CONTEXT_MISSING',
      'CCSS管理者の認証コンテキストを解決できませんでした。',
      'Authorization ヘッダーを確認して再試行してください。',
    )
  }

  const bodyResult = await readJsonObject(c)
  if (bodyResult instanceof Response) {
    return bodyResult
  }

  const persistAudit = async (
    sourcePath: string,
    status: 'failed' | 'succeeded',
    errors: Array<Record<string, unknown>>,
    warnings: Array<Record<string, unknown>>,
  ): Promise<Response | null> => writeTranspileAudit(c, {
    requested_by: requestedBy,
    source_path: sourcePath,
    status,
    errors,
    warnings,
    finished_at: new Date().toISOString(),
  })

  const rawSource = bodyResult.source
  if (typeof rawSource !== 'string' || rawSource.trim().length === 0) {
    const auditError = await persistAudit(
      toAuditText(bodyResult.sourcePath, '[invalid-source-path]'),
      'failed',
      [{ code: 'CCSS_INVALID_SOURCE', message: 'source は空でない文字列で指定してください' }],
      [],
    )
    if (auditError) {
      return auditError
    }
    return jsonCodeError(
      c,
      400,
      'CCSS_INVALID_SOURCE',
      'source は空でない文字列で指定してください',
      'TSXソース文字列を source に指定してください',
    )
  }
  const source = rawSource

  const rawSourcePath = bodyResult.sourcePath
  if (rawSourcePath !== undefined && typeof rawSourcePath !== 'string') {
    const auditError = await persistAudit(
      toAuditText(rawSourcePath, '[invalid-source-path]'),
      'failed',
      [{ code: 'CCSS_INVALID_SOURCE_PATH', message: 'sourcePath は文字列で指定してください' }],
      [],
    )
    if (auditError) {
      return auditError
    }
    return jsonCodeError(
      c,
      400,
      'CCSS_INVALID_SOURCE_PATH',
      'sourcePath は文字列で指定してください',
      '例: inline.tsx',
    )
  }
  const sourcePath = typeof rawSourcePath === 'string' && rawSourcePath.trim().length > 0
    ? rawSourcePath.trim()
    : 'inline.tsx'

  const parseResult = parseComponentSource(source, sourcePath)
  if (!parseResult.component || parseResult.errors.length > 0) {
    const auditError = await persistAudit(
      sourcePath,
      'failed',
      parseResult.errors.map((error) => ({
        message: error.message,
        line: error.line,
        column: error.column,
      })),
      [],
    )
    if (auditError) {
      return auditError
    }
    return c.json({
      ok: false,
      sourcePath,
      errors: parseResult.errors,
      warnings: [],
    })
  }

  const auditError = await persistAudit(sourcePath, 'succeeded', [], [])
  if (auditError) {
    return auditError
  }

  return c.json({
    ok: true,
    sourcePath,
    component: {
      name: parseResult.component.name,
      stateCount: parseResult.component.states.length,
      stateNames: parseResult.component.states.map((state) => state.name),
    },
    errors: [],
    warnings: [],
  })
})

app.onError((error, c) => jsonError(c, 500, `サーバーエラー: ${error.message}`))

export default app
