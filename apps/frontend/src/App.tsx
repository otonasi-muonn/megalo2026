import { useEffect, useMemo, useState } from 'react'
import { AppLink } from './components/AppLink'
import { CcssAuditPage } from './pages/CcssAuditPage'
import { CcssPocPage } from './pages/CcssPocPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { CreatePage } from './pages/CreatePage'
import { DashboardPage } from './pages/DashboardPage'
import { EditPage } from './pages/EditPage'
import {
  buildLoginPath,
  getRedirectPathFromSearch,
  resolveRedirectPath,
} from './features/auth/redirect'
import { signOut } from './features/auth/authActions'
import { useAuth } from './features/auth/useAuth'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { PlayPage } from './pages/PlayPage'
import { ResultPage } from './pages/ResultPage'
import { getCurrentLocation, navigate, subscribeLocation } from './utils/navigation'
import './App.css'

const normalizePathname = (pathname: string): string => {
  if (pathname === '/') {
    return pathname
  }

  return pathname.replace(/\/+$/, '')
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const getPathParam = (pathname: string, prefix: string): string | null => {
  if (!pathname.startsWith(prefix)) {
    return null
  }

  const rawParam = pathname.slice(prefix.length)
  if (!rawParam || rawParam.includes('/')) {
    return null
  }

  return decodeURIComponent(rawParam)
}

const getQueryParam = (search: string, key: string): string | null => {
  const query = search.startsWith('?') ? search.slice(1) : search
  if (!query) {
    return null
  }

  for (const pair of query.split('&')) {
    if (!pair) {
      continue
    }
    const separator = pair.indexOf('=')
    const rawKey = separator >= 0 ? pair.slice(0, separator) : pair
    if (rawKey !== key) {
      continue
    }
    const rawValue = separator >= 0 ? pair.slice(separator + 1) : ''
    try {
      return decodeURIComponent(rawValue.replace(/\+/g, ' '))
    } catch {
      return null
    }
  }

  return null
}

const parseNonNegativeInt = (rawValue: string | null): number | undefined => {
  if (!rawValue) {
    return undefined
  }
  const value = Number.parseInt(rawValue, 10)
  if (!Number.isFinite(value) || value < 0) {
    return undefined
  }
  return value
}

type ResultQuery = {
  stageId?: string
  cleared: boolean
  logStatus?: 'success' | 'failed'
  playLogId?: string
  playCount?: number
  clearCount?: number
  logError?: string
}

const parseResultQuery = (search: string): ResultQuery => {
  const stageIdRaw = getQueryParam(search, 'stageId')
  const stageId = stageIdRaw && UUID_PATTERN.test(stageIdRaw) ? stageIdRaw : undefined
  const cleared = getQueryParam(search, 'cleared') === 'true'
  const logStatusRaw = getQueryParam(search, 'logStatus')
  const logStatus =
    logStatusRaw === 'success' || logStatusRaw === 'failed' ? logStatusRaw : undefined
  const playLogId = getQueryParam(search, 'playLogId') ?? undefined
  const playCount = parseNonNegativeInt(getQueryParam(search, 'playCount'))
  const clearCount = parseNonNegativeInt(getQueryParam(search, 'clearCount'))
  const logError = getQueryParam(search, 'logError') ?? undefined

  return {
    stageId,
    cleared,
    logStatus,
    playLogId,
    playCount,
    clearCount,
    logError,
  }
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '不明なエラーが発生しました。'

const getFallbackDisplayName = (
  user: { email?: string | null; user_metadata?: Record<string, unknown> } | null,
): string => {
  if (!user) {
    return 'プレイヤー'
  }

  const userMetadata = user.user_metadata ?? {}
  const candidateKeys = ['display_name', 'name', 'full_name', 'user_name']
  for (const key of candidateKeys) {
    const value = userMetadata[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  const emailLocalPart = user.email?.split('@')[0]?.trim()
  if (emailLocalPart && emailLocalPart.length > 0) {
    return emailLocalPart
  }

  return 'プレイヤー'
}

function App() {
  const [locationState, setLocationState] = useState(getCurrentLocation)
  const {
    user,
    isLoading: isAuthLoading,
    errorMessage: authErrorMessage,
  } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutErrorMessage, setSignOutErrorMessage] = useState<string | null>(null)

  useEffect(() => subscribeLocation(() => setLocationState(getCurrentLocation())), [])

  const pathname = normalizePathname(locationState.pathname)
  const resultQuery = useMemo(() => parseResultQuery(locationState.search), [locationState.search])
  const loginRedirectPath = useMemo(
    () => getRedirectPathFromSearch(locationState.search),
    [locationState.search],
  )

  const editStageId = getPathParam(pathname, '/edit/')
  const playStageId = getPathParam(pathname, '/play/')
  const isProtectedRoute =
    pathname === '/dashboard' || pathname === '/create' || Boolean(editStageId)

  useEffect(() => {
    if (!isProtectedRoute || isAuthLoading || user) {
      return
    }

    const redirectPath = resolveRedirectPath(`${pathname}${locationState.search}`)
    navigate(buildLoginPath(redirectPath), { replace: true })
  }, [
    isProtectedRoute,
    isAuthLoading,
    locationState.search,
    pathname,
    user,
  ])

  useEffect(() => {
    if (pathname !== '/login' || isAuthLoading || !user) {
      return
    }

    navigate(loginRedirectPath, { replace: true })
  }, [isAuthLoading, loginRedirectPath, pathname, user])

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true)
      setSignOutErrorMessage(null)
      await signOut()
      navigate('/', { replace: true })
    } catch (error) {
      setSignOutErrorMessage(`ログアウトに失敗しました。${getErrorMessage(error)}`)
    } finally {
      setIsSigningOut(false)
    }
  }

  const renderAuthChecking = (message: string) => (
    <section className="page-card">
      <p className="status-text">{message}</p>
    </section>
  )

  const content = (() => {
    if (authErrorMessage) {
      return (
        <section className="page-card">
          <p className="error-text" role="alert">
            {authErrorMessage}
          </p>
          <button
            type="button"
            className="button"
            onClick={() => window.location.reload()}
          >
            再読み込み
          </button>
        </section>
      )
    }

    if (pathname === '/') {
      return (
        <HomePage
          isAuthLoading={isAuthLoading}
          isLoggedIn={Boolean(user)}
          isSigningOut={isSigningOut}
          onSignOut={handleSignOut}
        />
      )
    }

    if (pathname === '/ccss-poc') {
      return <CcssPocPage />
    }

    if (pathname === '/ccss-audit') {
      return <CcssAuditPage />
    }

    if (pathname === '/login') {
      if (isAuthLoading) {
        return renderAuthChecking('認証状態を確認中です...')
      }
      if (user) {
        return renderAuthChecking('ログイン済みのため移動中です...')
      }
      return <LoginPage redirectPath={loginRedirectPath} />
    }

    if (pathname === '/auth/callback') {
      return <AuthCallbackPage redirectPath={loginRedirectPath} />
    }

    if (pathname === '/dashboard') {
      if (isAuthLoading) {
        return renderAuthChecking('認証状態を確認中です...')
      }
      if (!user) {
        return renderAuthChecking('ログイン画面へ移動中です...')
      }
      return (
        <DashboardPage
          currentUserId={user.id}
          fallbackDisplayName={getFallbackDisplayName(user)}
        />
      )
    }

    if (pathname === '/create') {
      if (isAuthLoading) {
        return renderAuthChecking('認証状態を確認中です...')
      }
      if (!user) {
        return renderAuthChecking('ログイン画面へ移動中です...')
      }
      return <CreatePage />
    }

    if (editStageId) {
      if (isAuthLoading) {
        return renderAuthChecking('認証状態を確認中です...')
      }
      if (!user) {
        return renderAuthChecking('ログイン画面へ移動中です...')
      }
      return <EditPage stageId={editStageId} />
    }

    if (playStageId) {
      return <PlayPage stageId={playStageId} />
    }

    if (pathname === '/result') {
      return (
        <ResultPage
          stageId={resultQuery.stageId}
          cleared={resultQuery.cleared}
          logStatus={resultQuery.logStatus}
          playLogId={resultQuery.playLogId}
          playCount={resultQuery.playCount}
          clearCount={resultQuery.clearCount}
          logError={resultQuery.logError}
        />
      )
    }

    return (
      <section className="page-card">
        <h1 className="page-heading">ページが見つかりません</h1>
        <p className="status-text">指定されたURLは未定義です。</p>
        <AppLink to="/" className="button">
          ホームへ戻る
        </AppLink>
      </section>
    )
  })()

  return (
    <div className="app-shell">
      {signOutErrorMessage && (
        <p className="error-text" role="alert">
          {signOutErrorMessage}
        </p>
      )}
      <main className="app-main">{content}</main>
    </div>
  )
}

export default App
