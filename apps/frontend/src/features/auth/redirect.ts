export const DEFAULT_AUTH_REDIRECT_PATH = '/dashboard'

const LOGIN_PATH = '/login'
const AUTH_CALLBACK_PATH = '/auth/callback'
const REDIRECT_QUERY_KEY = 'redirect'

const isSafeInternalPath = (path: string): boolean =>
  path.startsWith('/') && !path.startsWith('//')

export const resolveRedirectPath = (
  value: string | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT_PATH,
): string => {
  const trimmed = value?.trim()
  if (!trimmed) {
    return fallback
  }

  if (!isSafeInternalPath(trimmed)) {
    return fallback
  }

  return trimmed
}

export const getRedirectPathFromSearch = (
  search: string,
  fallback = DEFAULT_AUTH_REDIRECT_PATH,
): string => {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return resolveRedirectPath(params.get(REDIRECT_QUERY_KEY), fallback)
}

export const buildLoginPath = (redirectPath: string): string => {
  const params = new URLSearchParams({
    [REDIRECT_QUERY_KEY]: resolveRedirectPath(redirectPath),
  })
  return `${LOGIN_PATH}?${params.toString()}`
}

export const buildAuthCallbackUrl = (redirectPath: string): string => {
  const params = new URLSearchParams({
    [REDIRECT_QUERY_KEY]: resolveRedirectPath(redirectPath),
  })
  return `${window.location.origin}${AUTH_CALLBACK_PATH}?${params.toString()}`
}
