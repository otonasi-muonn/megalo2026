import { getAccessToken } from '../features/auth/authActions'

type QueryValue = string | number | boolean | null | undefined

interface RequestOptions {
  query?: Record<string, QueryValue>
  body?: unknown
  signal?: AbortSignal
  withAuth?: boolean
}

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8787'

const buildUrl = (path: string, query?: Record<string, QueryValue>): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(normalizedPath, API_BASE_URL)

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

const requestJson = async <TResponse>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options.withAuth !== false) {
    const token = await getAccessToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  const response = await fetch(buildUrl(path, options.query), {
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
