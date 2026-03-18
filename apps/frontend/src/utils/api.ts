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

const buildApiBaseCandidates = (primaryBaseUrl: string): string[] => {
  const candidates = [primaryBaseUrl]

  try {
    const parsed = new URL(primaryBaseUrl)
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

  let lastNetworkError: unknown = null

  for (const apiBaseUrl of API_BASE_URL_CANDIDATES) {
    const requestUrl = buildUrl(apiBaseUrl, path, options.query)

    try {
      const response = await fetch(requestUrl, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      })

      if (!response.ok) {
        const bodyText = await response.text()
        throw new Error(
          `API request failed: ${method} ${path} (${response.status}) ${bodyText}`,
        )
      }

      return (await response.json()) as TResponse
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }
      if (!isNetworkFetchError(error)) {
        throw error
      }
      lastNetworkError = error
    }
  }

  const detail =
    lastNetworkError instanceof Error ? lastNetworkError.message : 'unknown network error'
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
