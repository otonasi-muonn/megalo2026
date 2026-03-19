import { getAccessToken } from '../features/auth/authActions'

type QueryValue = string | number | boolean | null | undefined

interface RequestOptions {
  query?: Record<string, QueryValue>
  body?: unknown
  signal?: AbortSignal
  headers?: Record<string, string>
  withAuth?: boolean
}

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://127.0.0.1:8787'

const isLoopbackHost = (hostname: string): boolean =>
  hostname === '127.0.0.1' || hostname === 'localhost'

const getRuntimeOrigin = (): string | null => {
  if (typeof window === 'undefined') {
    return null
  }
  return window.location.origin
}

const buildApiBaseCandidates = (primaryBaseUrl: string): string[] => {
  const candidates = [primaryBaseUrl]
  let primaryIsLoopback = false

  try {
    const parsed = new URL(primaryBaseUrl)
    primaryIsLoopback = isLoopbackHost(parsed.hostname)
    const alternateHost =
      parsed.hostname === '127.0.0.1'
        ? 'localhost'
        : parsed.hostname === 'localhost'
          ? '127.0.0.1'
          : null
    if (alternateHost) {
      parsed.hostname = alternateHost
      candidates.push(parsed.toString())
    }
  } catch {
    // URLが不正な場合は primary のみで処理する
  }

  const runtimeOrigin = getRuntimeOrigin()
  if (runtimeOrigin) {
    try {
      const runtimeHost = new URL(runtimeOrigin).hostname
      if (!isLoopbackHost(runtimeHost) && primaryIsLoopback) {
        candidates.unshift(runtimeOrigin)
      } else {
        candidates.push(runtimeOrigin)
      }
    } catch {
      // runtime origin が不正な場合は無視
    }
  }

  return Array.from(new Set(candidates))
}

const API_BASE_URL_CANDIDATES = buildApiBaseCandidates(API_BASE_URL)

const buildUrl = (
  apiBaseUrl: string,
  path: string,
  query?: Record<string, QueryValue>,
): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(normalizedPath, apiBaseUrl)

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined) {
        continue
      }
      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

const isNetworkFetchError = (error: unknown): boolean => {
  if (error instanceof TypeError) {
    return true
  }

  if (error instanceof Error) {
    return /Failed to fetch|NetworkError/i.test(error.message)
  }

  return false
}

const isJsonContentType = (contentType: string): boolean =>
  contentType.includes('application/json') || contentType.includes('+json')

const looksLikeHtml = (text: string): boolean => {
  const normalized = text.trimStart().toLowerCase()
  return (
    normalized.startsWith('<!doctype html') ||
    normalized.startsWith('<html') ||
    normalized.startsWith('<!doctype')
  )
}

const requestJson = async <TResponse>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (options.withAuth) {
    const token = await getAccessToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  let lastAttemptError: unknown = null

  for (const apiBaseUrl of API_BASE_URL_CANDIDATES) {
    const requestUrl = buildUrl(apiBaseUrl, path, options.query)

    try {
      const response = await fetch(requestUrl, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      })
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

      if (!response.ok) {
        const bodyText = await response.text()
        if (contentType.includes('text/html') || looksLikeHtml(bodyText)) {
          lastAttemptError = new Error(
            `API候補がHTMLを返しました: ${requestUrl} (${response.status})`,
          )
          continue
        }
        throw new Error(
          `API request failed: ${method} ${path} (${response.status}) ${bodyText}`,
        )
      }

      const bodyText = await response.text()

      if (!isJsonContentType(contentType)) {
        if (contentType.includes('text/html') || looksLikeHtml(bodyText)) {
          lastAttemptError = new Error(
            `API候補がHTMLを返しました: ${requestUrl}`,
          )
          continue
        }
        throw new Error(
          `API response is not JSON: ${method} ${path} (${contentType || 'unknown content-type'})`,
        )
      }

      try {
        return JSON.parse(bodyText) as TResponse
      } catch (error) {
        if (looksLikeHtml(bodyText)) {
          lastAttemptError = new Error(
            `API候補がJSONではなくHTMLを返しました: ${requestUrl}`,
          )
          continue
        }
        const parseErrorMessage = error instanceof Error ? error.message : 'invalid JSON'
        throw new Error(
          `API response parse failed: ${method} ${path} (${parseErrorMessage})`,
          { cause: error },
        )
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }
      if (isNetworkFetchError(error)) {
        lastAttemptError = error
        continue
      }
      throw error
    }
  }

  const detail =
    lastAttemptError instanceof Error ? lastAttemptError.message : 'unknown network error'
  throw new Error(
    `APIサーバーへ接続できませんでした。バックエンド起動状態とURLを確認してください。（試行: ${API_BASE_URL_CANDIDATES.join(', ')} / 詳細: ${detail}）`,
  )
}

export const apiGet = <TResponse>(
  path: string,
  options?: Omit<RequestOptions, 'body'>,
): Promise<TResponse> => requestJson<TResponse>('GET', path, options)

export const apiPost = <TResponse>(
  path: string,
  body?: RequestOptions['body'],
  options?: Omit<RequestOptions, 'body'>,
): Promise<TResponse> => requestJson<TResponse>('POST', path, { ...options, body })

export const apiPut = <TResponse>(
  path: string,
  body?: RequestOptions['body'],
  options?: Omit<RequestOptions, 'body'>,
): Promise<TResponse> => requestJson<TResponse>('PUT', path, { ...options, body })

export const apiDelete = <TResponse>(
  path: string,
  options?: Omit<RequestOptions, 'body'>,
): Promise<TResponse> => requestJson<TResponse>('DELETE', path, options)
