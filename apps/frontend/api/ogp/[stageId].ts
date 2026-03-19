type StageSummary = {
  id: string
  title: string
  playCount: number
  clearCount: number
  likeCount: number
}

type StageFetchResult =
  | {
      ok: true
      stage: StageSummary
    }
  | {
      ok: false
      reason: string
    }

const DEFAULT_SITE_NAME = 'megalo2026'
const DEFAULT_TITLE = 'megalo2026 | 共有ステージ'
const DEFAULT_DESCRIPTION = 'スワイプで風を起こして遊ぶ、ステージ作成・共有ゲーム。'
const FALLBACK_STAGE_TITLE = '未取得ステージ'
const STAGE_FETCH_TIMEOUT_MS = 2500

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toSingleString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    return value[0]
  }
  return null
}

const safeDecodeURIComponent = (value: string): string | null => {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

const truncate = (value: string, maxLength: number): string =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const getRuntimeEnv = (): Record<string, string | undefined> => {
  const globalObject = globalThis as {
    process?: {
      env?: Record<string, string | undefined>
    }
  }
  return globalObject.process?.env ?? {}
}

const resolveStageApiBaseUrl = (): string => {
  const env = getRuntimeEnv()
  const rawBaseUrl =
    env.OGP_STAGE_API_BASE_URL ??
    env.VITE_API_BASE_URL ??
    env.API_BASE_URL ??
    'http://localhost:8787'
  return rawBaseUrl.replace(/\/+$/, '')
}

const resolveOrigin = (req: {
  headers: Record<string, string | string[] | undefined>
}): string => {
  const protocol = toSingleString(req.headers['x-forwarded-proto']) ?? 'https'
  const host =
    toSingleString(req.headers['x-forwarded-host']) ??
    toSingleString(req.headers.host) ??
    'localhost:3000'
  return `${protocol}://${host}`
}

const parseStageSummary = (value: unknown): StageSummary | null => {
  if (!isRecord(value)) {
    return null
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.play_count !== 'number' ||
    typeof value.clear_count !== 'number' ||
    typeof value.like_count !== 'number'
  ) {
    return null
  }

  return {
    id: value.id,
    title: value.title,
    playCount: value.play_count,
    clearCount: value.clear_count,
    likeCount: value.like_count,
  }
}

const fetchStageSummary = async (stageId: string): Promise<StageFetchResult> => {
  const stageApiBaseUrl = resolveStageApiBaseUrl()
  const stageApiUrl = `${stageApiBaseUrl}/api/stages/${encodeURIComponent(stageId)}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), STAGE_FETCH_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(stageApiUrl, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
      },
    })
  } catch (error) {
    clearTimeout(timeoutId)
    const message = error instanceof Error ? error.message : 'unknown fetch error'
    return { ok: false, reason: `ステージAPI通信失敗: ${message}` }
  }
  clearTimeout(timeoutId)

  if (!response.ok) {
    const responseBody = await response.text()
    return {
      ok: false,
      reason: `ステージAPI応答異常: status=${response.status}, body=${responseBody.slice(0, 200)}`,
    }
  }

  let body: unknown
  try {
    body = (await response.json()) as unknown
  } catch {
    return { ok: false, reason: 'ステージAPIのJSONパースに失敗しました。' }
  }
  if (!isRecord(body)) {
    return { ok: false, reason: 'ステージAPIのレスポンス形式が不正です。' }
  }

  const stage = parseStageSummary(body.data)
  if (!stage) {
    return { ok: false, reason: 'ステージ情報のパースに失敗しました。' }
  }

  return { ok: true, stage }
}

const buildHtml = (params: {
  title: string
  description: string
  canonicalUrl: string
  imageUrl: string
  stageId: string
  stageResolved: boolean
}): string => {
  const escapedTitle = escapeHtml(params.title)
  const escapedDescription = escapeHtml(params.description)
  const escapedCanonicalUrl = escapeHtml(params.canonicalUrl)
  const escapedImageUrl = escapeHtml(params.imageUrl)
  const escapedStageId = escapeHtml(params.stageId)

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapedTitle}</title>
    <meta name="description" content="${escapedDescription}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${DEFAULT_SITE_NAME}" />
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:description" content="${escapedDescription}" />
    <meta property="og:url" content="${escapedCanonicalUrl}" />
    <meta property="og:image" content="${escapedImageUrl}" />
    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:title" content="${escapedTitle}" />
    <meta property="twitter:description" content="${escapedDescription}" />
    <meta property="twitter:image" content="${escapedImageUrl}" />
    <link rel="canonical" href="${escapedCanonicalUrl}" />
  </head>
  <body>
    <main>
      <h1>${escapedTitle}</h1>
      <p>${escapedDescription}</p>
      <p>stage: ${escapedStageId}</p>
      <p>resolved: ${params.stageResolved ? 'true' : 'false'}</p>
      <p>stage-fetch-status: ${params.stageResolved ? 'ok' : 'fallback'}</p>
    </main>
  </body>
</html>`
}

export default async function handler(
  req: {
    headers: Record<string, string | string[] | undefined>
    query: Record<string, unknown>
  },
  res: {
    status: (statusCode: number) => { setHeader: (name: string, value: string) => unknown; send: (body: string) => unknown }
  },
) {
  const rawStageId = toSingleString(req.query.stageId)
  const decodedStageId = rawStageId ? safeDecodeURIComponent(rawStageId) : null
  const stageId = decodedStageId ?? ''
  if (!stageId || decodedStageId === null) {
    return res
      .status(400)
      .setHeader('Content-Type', 'text/plain; charset=utf-8')
      .send('stageId が未指定です。')
  }

  const origin = resolveOrigin(req)
  const playUrl = `${origin}/play/${encodeURIComponent(stageId)}`

  const stageResult = await fetchStageSummary(stageId)
  const stageTitle =
    stageResult.ok && stageResult.stage.title.trim().length > 0
      ? truncate(stageResult.stage.title.trim(), 80)
      : FALLBACK_STAGE_TITLE

  const title = stageResult.ok
    ? `${stageTitle} | ${DEFAULT_SITE_NAME}`
    : DEFAULT_TITLE
  const description = stageResult.ok
    ? truncate(
        `ステージ「${stageTitle}」に挑戦しよう。play ${stageResult.stage.playCount} / clear ${stageResult.stage.clearCount} / like ${stageResult.stage.likeCount}`,
        180,
      )
    : DEFAULT_DESCRIPTION

  const imageUrl = `${origin}/api/ogp-image/${encodeURIComponent(stageId)}?title=${encodeURIComponent(stageTitle)}`
  const html = buildHtml({
    title,
    description,
    canonicalUrl: playUrl,
    imageUrl,
    stageId,
    stageResolved: stageResult.ok,
  })

  const cacheControl = stageResult.ok
    ? 'public, max-age=0, s-maxage=300, stale-while-revalidate=600'
    : 'public, max-age=0, s-maxage=60'
  return res
    .status(200)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    .setHeader('Cache-Control', cacheControl)
    .send(html)
}
