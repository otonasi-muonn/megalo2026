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

function App() {
  const [locationState, setLocationState] = useState(getCurrentLocation)

  useEffect(() => subscribeLocation(() => setLocationState(getCurrentLocation())), [])

  const pathname = normalizePathname(locationState.pathname)
  const resultQuery = useMemo(() => parseResultQuery(locationState.search), [locationState.search])

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
