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

const parseResultQuery = (search: string): { stageId?: string; cleared: boolean } => {
  const stageIdRaw = getQueryParam(search, 'stageId')
  const stageId = stageIdRaw && UUID_PATTERN.test(stageIdRaw) ? stageIdRaw : undefined
  const cleared = getQueryParam(search, 'cleared') === 'true'
  return { stageId, cleared }
}

const isRouteActive = (currentPathname: string, path: string): boolean => {
  if (path === '/') {
    return currentPathname === '/'
  }

  return currentPathname === path || currentPathname.startsWith(`${path}/`)
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '不明なエラーが発生しました。'

type FrontendUiMode = 'vite' | 'ccss'

const resolveFrontendUiMode = (): FrontendUiMode => {
  const raw = (import.meta.env.VITE_FRONTEND_UI_MODE as string | undefined)?.trim().toLowerCase()
  if (raw === 'ccss' || raw === 'vite') {
    return raw
  }

  return import.meta.env.MODE === 'ccss' ? 'ccss' : 'vite'
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
  const frontendUiMode = resolveFrontendUiMode()
  const isCcssMode = frontendUiMode === 'ccss'
  const loginRedirectPath = useMemo(
    () => getRedirectPathFromSearch(locationState.search, isCcssMode ? '/' : undefined),
    [isCcssMode, locationState.search],
  )

  const editStageId = getPathParam(pathname, '/edit/')
  const playStageId = getPathParam(pathname, '/play/')
  const isProtectedRoute =
    !isCcssMode && (pathname === '/dashboard' || pathname === '/create' || Boolean(editStageId))

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
      return isCcssMode ? <CcssPocPage /> : <HomePage />
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

    if (isCcssMode) {
      return (
        <section className="page-card">
          <h1 className="page-heading">CCSSモードで起動中です</h1>
          <p className="status-text">
            このモードでは CCSSランタイム（/）と監査画面（/ccss-audit）を確認できます。
          </p>
          <div className="inline-actions">
            <AppLink to="/" className="button">
              CCSSランタイムへ
            </AppLink>
            <AppLink to="/ccss-audit" className="button secondary">
              CCSS監査へ
            </AppLink>
          </div>
        </section>
      )
    }

    if (pathname === '/dashboard') {
      if (isAuthLoading) {
        return renderAuthChecking('認証状態を確認中です...')
      }
      if (!user) {
        return renderAuthChecking('ログイン画面へ移動中です...')
      }
      return <DashboardPage />
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
      <header className="app-header">
        <div className="app-brand">
          <AppLink className="app-title" to="/">
            megalo2026
          </AppLink>
          <span className="app-mode-badge">ui mode: {frontendUiMode}</span>
        </div>
        <nav className="app-nav" aria-label="主要ナビゲーション">
          {isCcssMode ? (
            <>
              <AppLink
                to="/"
                className={isRouteActive(pathname, '/') ? 'nav-link active' : 'nav-link'}
              >
                CCSSランタイム
              </AppLink>
              <AppLink
                to="/ccss-audit"
                className={isRouteActive(pathname, '/ccss-audit') ? 'nav-link active' : 'nav-link'}
              >
                CCSS監査
              </AppLink>
            </>
          ) : (
            <>
              <AppLink
                to="/"
                className={isRouteActive(pathname, '/') ? 'nav-link active' : 'nav-link'}
              >
                ホーム
              </AppLink>
              <AppLink
                to="/dashboard"
                className={
                  isRouteActive(pathname, '/dashboard') ? 'nav-link active' : 'nav-link'
                }
              >
                ダッシュボード
              </AppLink>
              <AppLink
                to="/create"
                className={isRouteActive(pathname, '/create') ? 'nav-link active' : 'nav-link'}
              >
                ステージ作成
              </AppLink>
              <AppLink
                to="/ccss-poc"
                className={isRouteActive(pathname, '/ccss-poc') ? 'nav-link active' : 'nav-link'}
              >
                CCSS PoC
              </AppLink>
              <AppLink
                to="/ccss-audit"
                className={isRouteActive(pathname, '/ccss-audit') ? 'nav-link active' : 'nav-link'}
              >
                CCSS監査
              </AppLink>
            </>
          )}
          {!isAuthLoading && (
            user ? (
              <button
                type="button"
                className="nav-link nav-link-button"
                onClick={handleSignOut}
                disabled={isSigningOut}
              >
                {isSigningOut ? 'ログアウト中...' : 'ログアウト'}
              </button>
            ) : (
              <AppLink
                to="/login"
                className={isRouteActive(pathname, '/login') ? 'nav-link active' : 'nav-link'}
              >
                ログイン
              </AppLink>
            )
          )}
        </nav>
      </header>
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
