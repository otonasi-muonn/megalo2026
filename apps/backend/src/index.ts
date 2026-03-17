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
type ErrorStatus = 400 | 401 | 403 | 404 | 500
type StageRecord = Database['public']['Tables']['stages']['Row']
type StageListItem = Omit<StageRecord, 'stage_data'>

const STAGE_LIST_SELECT =
  'id,author_id,title,is_published,play_count,clear_count,like_count,created_at,updated_at'
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isUuid = (value: string): boolean => UUID_PATTERN.test(value)

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

const getAuthUserId = (c: AppContext): string | null => c.get('authUserId')

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

  const nextPlayCount = stage.play_count + 1
  const nextClearCount = stage.clear_count + (isCleared ? 1 : 0)
  const { data: updatedStage, error: updateError } = await supabase
    .from('stages')
    .update({
      play_count: nextPlayCount,
      clear_count: nextClearCount,
    })
    .eq('id', stageId)
    .select('play_count,clear_count')
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

  const { count: likeCount, error: countError } = await supabase
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('stage_id', stageId)

  if (countError) {
    return dbError(c, countError, 'いいね件数の算出に失敗しました')
  }

  const { data: updatedStage, error: updateError } = await supabase
    .from('stages')
    .update({ like_count: likeCount ?? 0 })
    .eq('id', stageId)
    .select('updated_at')
    .single()

  if (updateError) {
    return dbError(c, updateError, 'ステージのいいね件数更新に失敗しました')
  }

  return c.json({
    data: {
      stage_id: stageId,
      user_id: userId,
      liked,
      like_count: likeCount ?? 0,
      updated_at: updatedStage.updated_at,
    },
  })
})

app.onError((error, c) => jsonError(c, 500, `サーバーエラー: ${error.message}`))

export default app
