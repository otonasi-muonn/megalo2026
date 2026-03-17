import { useEffect, useMemo, useState } from 'react'
import { AppLink } from './components/AppLink'
import { CreatePage } from './pages/CreatePage'
import { DashboardPage } from './pages/DashboardPage'
import { EditPage } from './pages/EditPage'
import { HomePage } from './pages/HomePage'
import { PlayPage } from './pages/PlayPage'
import { ResultPage } from './pages/ResultPage'
import { getCurrentLocation, subscribeLocation } from './utils/navigation'
import './App.css'

const normalizePathname = (pathname: string): string => {
  if (pathname === '/') {
    return pathname
  }

  return pathname.replace(/\/+$/, '')
}

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

const isRouteActive = (currentPathname: string, path: string): boolean => {
  if (path === '/') {
    return currentPathname === '/'
  }

  return currentPathname === path || currentPathname.startsWith(`${path}/`)
}

function App() {
  const [locationState, setLocationState] = useState(getCurrentLocation)

  useEffect(() => subscribeLocation(() => setLocationState(getCurrentLocation())), [])

  const pathname = normalizePathname(locationState.pathname)
  const searchParams = useMemo(
    () => new URLSearchParams(locationState.search),
    [locationState.search],
  )

  const editStageId = getPathParam(pathname, '/edit/')
  const playStageId = getPathParam(pathname, '/play/')

  const content = (() => {
    if (pathname === '/') {
      return <HomePage />
    }

    if (pathname === '/dashboard') {
      return <DashboardPage />
    }

    if (pathname === '/create') {
      return <CreatePage />
    }

    if (editStageId) {
      return <EditPage stageId={editStageId} />
    }

    if (playStageId) {
      return <PlayPage stageId={playStageId} />
    }

    if (pathname === '/result') {
      return (
        <ResultPage
          stageId={searchParams.get('stageId') ?? undefined}
          cleared={searchParams.get('cleared') === 'true'}
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
        <AppLink className="app-title" to="/">
          megalo2026
        </AppLink>
        <nav className="app-nav" aria-label="主要ナビゲーション">
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
        </nav>
      </header>
      <main className="app-main">{content}</main>
    </div>
  )
}

export default App
