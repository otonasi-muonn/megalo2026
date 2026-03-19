export const DEFAULT_AUTH_REDIRECT_PATH = '/dashboard'

const LOGIN_PATH = '/login'
const AUTH_CALLBACK_PATH = '/auth/callback'
const REDIRECT_QUERY_KEY = 'redirect'
const INTERNAL_REDIRECT_ORIGIN = 'https://redirect.local'
const MAX_REDIRECT_PATH_LENGTH = 2048

const safeDecodeURIComponent = (value: string): string | null => {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return null
  }
}

const getQueryParamFromSearch = (search: string, key: string): string | null => {
  const query = search.startsWith('?') ? search.slice(1) : search
  if (!query) {
    return null
  }

  for (const pair of query.split('&')) {
    if (!pair) {
      continue
    }
    const separatorIndex = pair.indexOf('=')
    const rawKey = separatorIndex >= 0 ? pair.slice(0, separatorIndex) : pair
    const decodedKey = safeDecodeURIComponent(rawKey)
    if (decodedKey !== key) {
      continue
    }

    const rawValue = separatorIndex >= 0 ? pair.slice(separatorIndex + 1) : ''
    const decodedValue = safeDecodeURIComponent(rawValue)
    return decodedValue ?? null
  }

  return null
}

const buildQueryString = (entries: Record<string, string>): string =>
  Object.entries(entries)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')

const hasControlCharacter = (value: string): boolean => {
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }

  return false
}

const parseInternalRedirectPath = (path: string): URL | null => {
  if (!path.startsWith('/') || path.startsWith('//')) {
    return null
  }
  if (
    path.length > MAX_REDIRECT_PATH_LENGTH ||
    path.includes('\\') ||
    hasControlCharacter(path)
  ) {
    return null
  }

  try {
    const parsed = new URL(path, INTERNAL_REDIRECT_ORIGIN)
    if (parsed.origin !== INTERNAL_REDIRECT_ORIGIN || !parsed.pathname.startsWith('/')) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

const toNormalizedInternalPath = (url: URL): string =>
  `${url.pathname}${url.search}${url.hash}`

export const resolveRedirectPath = (
  value: string | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT_PATH,
): string => {
  const fallbackUrl = parseInternalRedirectPath(fallback)
  const safeFallback = fallbackUrl
    ? toNormalizedInternalPath(fallbackUrl)
    : DEFAULT_AUTH_REDIRECT_PATH

  const trimmed = value?.trim()
  if (!trimmed) {
    return safeFallback
  }

  const redirectUrl = parseInternalRedirectPath(trimmed)
  if (!redirectUrl) {
    return safeFallback
  }

  return toNormalizedInternalPath(redirectUrl)
}

export const getRedirectPathFromSearch = (
  search: string,
  fallback = DEFAULT_AUTH_REDIRECT_PATH,
): string => {
  return resolveRedirectPath(getQueryParamFromSearch(search, REDIRECT_QUERY_KEY), fallback)
}

export const buildLoginPath = (redirectPath: string): string => {
  const query = buildQueryString({
    [REDIRECT_QUERY_KEY]: resolveRedirectPath(redirectPath),
  })
  return `${LOGIN_PATH}?${query}`
}

export const buildAuthCallbackUrl = (redirectPath: string): string => {
  const query = buildQueryString({
    [REDIRECT_QUERY_KEY]: resolveRedirectPath(redirectPath),
  })
  return `${window.location.origin}${AUTH_CALLBACK_PATH}?${query}`
}
