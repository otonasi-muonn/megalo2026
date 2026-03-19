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

const escapeXml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

const normalizeTitle = (value: string): string =>
  truncate(value.trim().length > 0 ? value.trim() : 'megalo2026 stage', 36)

const normalizeStageId = (value: string): string =>
  truncate(value.trim().length > 0 ? value.trim() : 'unknown-stage', 42)

const buildSvg = (title: string, stageId: string): string => {
  const escapedTitle = escapeXml(title)
  const escapedStageId = escapeXml(stageId)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapedTitle}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220" />
      <stop offset="100%" stop-color="#1f5fae" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect x="44" y="44" width="1112" height="542" rx="24" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.28)" />
  <text x="80" y="138" fill="#eaf3ff" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="40" font-weight="700">megalo2026</text>
  <text x="80" y="250" fill="#ffffff" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="58" font-weight="800">${escapedTitle}</text>
  <text x="80" y="334" fill="#d5e5ff" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="30" font-weight="500">Swipe the wind, clear the stage.</text>
  <text x="80" y="520" fill="#9fc1ee" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="28">stage: ${escapedStageId}</text>
</svg>`
}

export default function handler(
  req: { query: Record<string, unknown> },
  res: {
    status: (statusCode: number) => {
      setHeader: (name: string, value: string) => unknown
      send: (body: string) => unknown
    }
  },
) {
  const rawStageId = toSingleString(req.query.stageId)
  const rawTitle = toSingleString(req.query.title)

  const stageId = normalizeStageId(
    rawStageId ? (safeDecodeURIComponent(rawStageId) ?? '') : '',
  )
  const title = normalizeTitle(rawTitle ? (safeDecodeURIComponent(rawTitle) ?? '') : '')
  const svg = buildSvg(title, stageId)

  return res
    .status(200)
    .setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    .setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400')
    .setHeader('X-Content-Type-Options', 'nosniff')
    .send(svg)
}
