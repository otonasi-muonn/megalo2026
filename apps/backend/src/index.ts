import { randomUUID } from 'node:crypto'
import { parseComponentSource } from '@ccss/compiler'
import { createClient, type PostgrestError } from '@supabase/supabase-js'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'
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
type CcssStyleRecipe = {
  view: string
  stateId: string
  recipeId: string
  targetClass: string
  addClasses: string[]
}
type RateLimitBucket = {
  count: number
  resetAt: number
}

const STAGE_LIST_SELECT =
  'id,author_id,title,is_published,play_count,clear_count,like_count,created_at,updated_at'
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CCSS_STATE_ID_PATTERN = /^ccss:[a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+$/
const CCSS_RULESET_VERSION = '2026-03-17'
const CCSS_PATCH_TTL_MS = 3000
const CCSS_RECIPE_REGISTRY: CcssStyleRecipe[] = [
  {
    view: 'sample',
    stateId: 'ccss:sample:sample-panel:menu-open',
    recipeId: 'rcpDashboardStageCardMenuOpenV1',
    targetClass: 'ccss-dashboard-stage-card',
    addClasses: ['is-menu-open'],
  },
  {
    view: 'sample',
    stateId: 'ccss:sample:sample-panel:menu-open',
    recipeId: 'rcpSharedToastVisibleV1',
    targetClass: 'ccss-toast',
    addClasses: ['is-visible'],
  },
]
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

const getClientIp = (c: AppContext): string => {
  const forwarded = c.req.header('X-Forwarded-For')?.trim()
  if (forwarded && forwarded.length > 0) {
    const first = forwarded.split(',')[0]?.trim()
    if (first && first.length > 0) {
      return first
    }
  }

  const realIp = c.req.header('X-Real-IP')?.trim()
  if (realIp && realIp.length > 0) {
    return realIp
  }
  return 'unknown'
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
  const subject = userId ?? getClientIp(c)
  const key = userId ? `user:${subject}` : `ip:${subject}`

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

const parseStageId = (c: AppContext): string | Response => {
  const stageId = c.req.param('id')
  if (!stageId || !isUuid(stageId)) {
    return jsonError(c, 400, 'stage id はUUID形式で指定してください。')
  }
  return stageId
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

  const bodyResult = await readJsonObject(c)
  if (bodyResult instanceof Response) {
    return bodyResult
  }

  const rawView = bodyResult.view
  if (typeof rawView !== 'string' || rawView.trim().length === 0) {
    return jsonCodeError(
      c,
      400,
      'CCSS_INVALID_VIEW',
      'view は空でない文字列で指定してください',
      '例: sample',
    )
  }
  const view = rawView.trim()

  const rawStateId = bodyResult.stateId
  if (typeof rawStateId !== 'string' || !CCSS_STATE_ID_PATTERN.test(rawStateId)) {
    return jsonCodeError(
      c,
      400,
      'CCSS_INVALID_STATE',
      '未定義の stateId です',
      'ccss.manifest.json の stateId を指定してください',
    )
  }
  const stateId = rawStateId

  if (hasOwn(bodyResult, 'payload') && bodyResult.payload !== null && !isRecord(bodyResult.payload)) {
    return jsonCodeError(
      c,
      400,
      'CCSS_INVALID_PAYLOAD',
      'payload はJSONオブジェクトで指定してください',
      '例: { \"stageId\": \"...\" }',
    )
  }
  const payload = bodyResult.payload ?? {}

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

  const knownStateRecipes = CCSS_RECIPE_REGISTRY.filter((recipe) => recipe.stateId === stateId)
  if (knownStateRecipes.length === 0) {
    return jsonCodeError(
      c,
      400,
      'CCSS_INVALID_STATE',
      '未定義の stateId です',
      'ccss.manifest.json の stateId を指定してください',
    )
  }

  const resolvedRecipes = knownStateRecipes.filter((recipe) => recipe.view === view)
  if (resolvedRecipes.length === 0) {
    return jsonCodeError(
      c,
      403,
      'CCSS_RECIPE_OUT_OF_SCOPE',
      '指定 view に対応しないレシピ参照です',
      'view と stateId の組み合わせを見直してください',
    )
  }

  const requestId = `req_${randomUUID().replace(/-/g, '')}`
  const patchId = `ccss_patch_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 8)}`

  return c.json({
    requestId,
    patchId,
    stateId,
    ttlMs: CCSS_PATCH_TTL_MS,
    recipeIds: resolvedRecipes.map((recipe) => recipe.recipeId),
    classList: resolvedRecipes.map((recipe) => ({
      targetClass: recipe.targetClass,
      add: recipe.addClasses,
    })),
    rulesetVersion: CCSS_RULESET_VERSION,
  })
})

app.post('/api/ccss/transpile/validate', requireCcssAdmin, async (c) => {
  const bodyResult = await readJsonObject(c)
  if (bodyResult instanceof Response) {
    return bodyResult
  }

  const rawSource = bodyResult.source
  if (typeof rawSource !== 'string' || rawSource.trim().length === 0) {
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
    return c.json({
      ok: false,
      sourcePath,
      errors: parseResult.errors,
      warnings: [],
    })
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
