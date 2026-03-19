import { useEffect, useMemo, useState } from 'react'
import { AppLink } from '../components/AppLink'
import { StageStats } from '../components/stage/StageStats'
import type { Pagination, StageListItemDto, StageListResponse } from '../types/api'
import { apiGet } from '../utils/api'
import { copyStagePlayUrl } from '../utils/stageShare'
import '../styles/HomePage.css'

const initialPagination: Pagination = {
  page: 1,
  limit: 12,
  total: 0,
  total_pages: 0,
}

const getErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : '不明なエラーが発生しました。'
  if (message.includes('APIサーバーへ接続できませんでした')) {
    return 'APIサーバーに接続できません。バックエンド起動後に再読み込みしてください。'
  }
  return message
}

const OFFICIAL_AUTHOR_ID = 'a0000000-0000-4000-8000-000000000001'

type HomePageProps = {
  isAuthLoading: boolean
  isLoggedIn: boolean
  isSigningOut: boolean
  onSignOut: () => Promise<void>
}

export const HomePage = ({
  isAuthLoading,
  isLoggedIn,
  isSigningOut,
  onSignOut,
}: HomePageProps) => {
  const [stages, setStages] = useState<StageListItemDto[]>([])
  const [pagination, setPagination] = useState<Pagination>(initialPagination)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [shareErrorMessage, setShareErrorMessage] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    const loadStages = async () => {
      try {
        setIsLoading(true)
        setErrorMessage(null)

        const response = await apiGet<StageListResponse>('/api/stages', {
          query: {
            author_id: OFFICIAL_AUTHOR_ID,
            is_published: true,
            page: 1,
            limit: 12,
          },
          signal: controller.signal,
        })

        setStages(response.data)
        setPagination(response.pagination)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        setErrorMessage(getErrorMessage(error))
      } finally {
        setIsLoading(false)
      }
    }

    void loadStages()

    return () => controller.abort()
  }, [reloadToken])

  const handleCopyShareLink = async (stage: StageListItemDto) => {
    try {
      const stageUrl = await copyStagePlayUrl(stage.id)
      setShareMessage(`「${stage.title}」の共有リンクをコピーしました: ${stageUrl}`)
      setShareErrorMessage(null)
    } catch (error) {
      setShareErrorMessage(getErrorMessage(error))
      setShareMessage(null)
    }
  }

  const featuredStagePath = useMemo(() => {
    const featuredStage = stages[0]
    return featuredStage ? `/play/${featuredStage.id}` : '/dashboard'
  }, [stages])

  return (
    <>
      <section className="hero-section">
        <div className="hero-container">
          <nav className="hero-nav">
            <AppLink to={featuredStagePath} className="button hero-button play-button">
              <img
                src="/images/playbutton.png"
                alt="Play"
                className="hero-button-image"
              />
            </AppLink>
            <AppLink to="/create" className="button hero-button create-button">
              <img
                src="/images/createbutton.png"
                alt="Create"
                className="hero-button-image"
              />
            </AppLink>
            <AppLink to="/dashboard" className="button hero-button dashboard-button">
              <img
                src="/images/mystagebutton.png"
                alt="My Stages"
                className="hero-button-image"
              />
            </AppLink>
          </nav>
          <div className="hero-auth-actions">
            {isAuthLoading ? (
              <p className="status-text home-auth-status">認証状態を確認中...</p>
            ) : isLoggedIn ? (
              <button
                type="button"
                className="button secondary hero-auth-button"
                onClick={() => {
                  void onSignOut()
                }}
                disabled={isSigningOut}
              >
                {isSigningOut ? 'ログアウト中...' : 'ログアウト'}
              </button>
            ) : (
              <AppLink to="/login" className="button secondary hero-auth-button">
                ログイン
              </AppLink>
            )}
          </div>
        </div>
      </section>

      <section className="page-card home-stage-card" id="official-stages">
        <h2 className="page-heading">公式ステージ</h2>
        <p className="status-text">公式アカウントが作成したステージをプレイできます。</p>

        {isLoading && <p className="status-text">読み込み中...</p>}

        {errorMessage && (
          <div className="error-text" role="alert">
            <p>読み込み失敗: {errorMessage}</p>
            <button
              type="button"
              className="button secondary retry-button"
              onClick={() => setReloadToken((count) => count + 1)}
            >
              再読み込み
            </button>
          </div>
        )}
        {shareMessage && <p className="success-text">{shareMessage}</p>}
        {shareErrorMessage && (
          <p className="error-text" role="alert">
            共有リンクのコピー失敗: {shareErrorMessage}
          </p>
        )}

        {!isLoading && !errorMessage && (
          <>
            <p className="status-text">
              {pagination.total === 0
                ? '公開中の公式ステージはまだありません。'
                : `公開中の公式ステージ: ${pagination.total}件`}
            </p>
            <ul className="home-stage-grid">
              {stages.map((stage) => (
                <li key={stage.id} className="home-stage-item">
                  <article className="official-stage-card">
                    <p className="official-stage-label">OFFICIAL</p>
                    <h3 className="official-stage-title">{stage.title}</h3>
                    <StageStats
                      playCount={stage.play_count}
                      clearCount={stage.clear_count}
                      likeCount={stage.like_count}
                      className="meta-text official-stage-metrics"
                    />
                    <div className="official-stage-actions">
                      <AppLink to={`/play/${stage.id}`} className="button secondary">
                        プレイ
                      </AppLink>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => {
                          void handleCopyShareLink(stage)
                        }}
                      >
                        共有リンクをコピー
                      </button>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  )
}
