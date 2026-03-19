import { useEffect, useState } from 'react'
import { AppLink } from '../components/AppLink'
import { StageStats } from '../components/stage/StageStats'
import { Trash2 } from 'lucide-react'
import { PencilLine } from 'lucide-react'
import { ArrowDownUp } from 'lucide-react'
import { Heart } from 'lucide-react'
import { SpellCheck } from 'lucide-react'
import { Search } from 'lucide-react'
import type {
  Pagination,
  ProfileResponse,
  StageDeleteResponse,
  StageListItemDto,
  StageListResponse,
} from '../types/api'
import { apiDelete, apiGet } from '../utils/api'
import { copyStagePlayUrl } from '../utils/stageShare'
import './DashboardPage.css'

type DashboardStage = StageListItemDto & {
  imageUrl?: string
}

const initialPagination: Pagination = {
  page: 1,
  limit: 10,
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

type StageSortKey = 'favorite' | 'created' | 'name'
type SortOrder = 'desc' | 'asc'

type DashboardPageProps = {
  currentUserId: string
  fallbackDisplayName: string
}

export const DashboardPage = ({ currentUserId, fallbackDisplayName }: DashboardPageProps) => {
  const [displayName, setDisplayName] = useState(fallbackDisplayName)
  const [stages, setStages] = useState<DashboardStage[]>([])
  const [pagination, setPagination] = useState<Pagination>(initialPagination)
  const [sortKey, setSortKey] = useState<StageSortKey>('created')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [favoriteStageIds, setFavoriteStageIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isDeletingStageId, setIsDeletingStageId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [shareErrorMessage, setShareErrorMessage] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const filteredStages = stages.filter((stage) =>
    stage.title.toLowerCase().includes(searchKeyword.trim().toLowerCase())
  )

  const sortedStages = [...filteredStages].sort((a, b) => {
    const direction = sortOrder === 'asc' ? 1 : -1

    if (sortKey === 'favorite') {
      const aFavorite = favoriteStageIds.has(a.id) ? 1 : 0
      const bFavorite = favoriteStageIds.has(b.id) ? 1 : 0
      if (aFavorite !== bFavorite) {
        return (aFavorite - bFavorite) * direction
      }
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction
    }

    if (sortKey === 'created') {
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction
    }

    return a.title.localeCompare(b.title, 'ja') * direction
  })

  const handleToggleFavorite = (stageId: string) => {
    setFavoriteStageIds((prev) => {
      const next = new Set(prev)
      if (next.has(stageId)) {
        next.delete(stageId)
      } else {
        next.add(stageId)
      }
      return next
    })
  }

  const handleDeleteStage = async (stageId: string) => {
    if (!window.confirm('このステージを削除してもよろしいですか？')) {
      return
    }

    try {
      setIsDeletingStageId(stageId)
      setErrorMessage(null)
      await apiDelete<StageDeleteResponse>(`/api/stages/${stageId}`, { withAuth: true })
      setStages((prevStages) => prevStages.filter((stage) => stage.id !== stageId))
      setPagination((prevPagination) => ({
        ...prevPagination,
        total: Math.max(prevPagination.total - 1, 0),
      }))
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsDeletingStageId(null)
    }
  }

  const handleCopyShareLink = async (stage: DashboardStage) => {
    try {
      const stageUrl = await copyStagePlayUrl(stage.id)
      setShareMessage(`「${stage.title}」の共有リンクをコピーしました: ${stageUrl}`)
      setShareErrorMessage(null)
    } catch (error) {
      setShareErrorMessage(getErrorMessage(error))
      setShareMessage(null)
    }
  }

  const handleEditStageName = (stageId: string, newName: string) => {
    setStages((prevStages) => {
      return prevStages.map((stage) =>
        stage.id === stageId ? { ...stage, title: newName } : stage
      )
    })
  }

  const handleUploadImage = (stageId: string, imageUrl: string) => {
    setStages((prevStages) => {
      return prevStages.map((stage) =>
        stage.id === stageId ? { ...stage, imageUrl } : stage
      )
    })
  }

  useEffect(() => {
    setDisplayName(fallbackDisplayName)
  }, [fallbackDisplayName])

  useEffect(() => {
    const controller = new AbortController()

    const loadDashboard = async () => {
      if (!currentUserId) {
        setErrorMessage('ユーザー情報を取得できなかったため、ダッシュボードを表示できません。')
        setStages([])
        setPagination(initialPagination)
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setErrorMessage(null)

        const profileNamePromise = apiGet<ProfileResponse>('/api/profiles/me', {
          signal: controller.signal,
          withAuth: true,
        })
          .then((profileResponse) => profileResponse.data.display_name)
          .catch(() => null)

        const stageResponse = await apiGet<StageListResponse>('/api/stages', {
          query: {
            author_id: currentUserId,
            page: 1,
            limit: 10,
          },
          signal: controller.signal,
          withAuth: true,
        })

        setStages(stageResponse.data)
        setPagination(stageResponse.pagination)
        const profileName = await profileNamePromise
        if (typeof profileName === 'string' && profileName.trim().length > 0) {
          setDisplayName(profileName.trim())
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        setErrorMessage(getErrorMessage(error))
        setStages([])
        setPagination(initialPagination)
      } finally {
        setIsLoading(false)
      }
    }

    void loadDashboard()

    return () => controller.abort()
  }, [currentUserId, reloadToken])

  return (
    <section className="page-card dashboard-page">
      <h1 className="page-heading">My Stages</h1>
      <p className="status-text">
        {displayName} さんのステージ一覧です。
      </p>
      <div className="inline-actions dashboard-page-nav">
        <AppLink to="/" className="button secondary">
          ホームへ戻る
        </AppLink>
        <a href="/#official-stages" className="button secondary">
          公式ステージを見る
        </a>
        <AppLink to="/create" className="button secondary">
          ステージ作成へ
        </AppLink>
      </div>

      {isLoading && <p className="status-text">読み込み中...</p>}
      {errorMessage && (
        <div className="error-text" role="alert">
          <p>処理失敗: {errorMessage}</p>
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

      {!isLoading && (
        <>
          <div className="dashboard-toolbar">
            <div className="dashboard-toolbar-left">
              <div className="search-controls">
                <label htmlFor="stage-search-input">
                  <span className="search-icon" aria-hidden="true">
                    <Search />
                  </span>
                  ステージ名検索:
                </label>
                <input
                  id="stage-search-input"
                  type="text"
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="ステージ名を入力"
                />
              </div>
              <div className="sort-controls">
                <label htmlFor="stage-sort-select">並べ替え:</label>
                <div className="sort-select-wrap">
                  {sortKey === 'favorite' && (
                    <span className="sort-key-icon" aria-hidden="true">
                      <Heart />
                    </span>
                  )}
                  {sortKey === 'created' && (
                    <span className="sort-key-icon" aria-hidden="true">
                      <PencilLine />
                    </span>
                  )}
                  {sortKey === 'name' && (
                    <span className="sort-key-icon" aria-hidden="true">
                      <SpellCheck />
                    </span>
                  )}
                  <select
                    id="stage-sort-select"
                    className={
                      sortKey === 'favorite' || sortKey === 'created' || sortKey === 'name'
                        ? 'with-icon'
                        : ''
                    }
                    value={sortKey}
                    onChange={(event) => setSortKey(event.target.value as StageSortKey)}
                  >
                    <option value="favorite">お気に入り順</option>
                    <option value="created">制作順</option>
                    <option value="name">名前順</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="button secondary sort-order-button"
                  onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                  aria-label={`並び順を${sortOrder === 'desc' ? '昇順' : '降順'}に変更`}
                >
                  <ArrowDownUp />
                  {sortOrder === 'desc' ? '降順' : '昇順'}
                </button>
              </div>
            </div>
            <p className="status-text status-text-right stage-count-text">自分のステージ: {pagination.total}件</p>
          </div>
          {sortedStages.length === 0 && <p className="status-text">作成したステージはまだありません。</p>}
          <ul className="stage-list">
            {sortedStages.map((stage) => (
              <li key={stage.id} className="stage-item">
                <div className="stage-card">
                  <div className="stage-image-area">
                    {stage.imageUrl ? (
                      <img src={stage.imageUrl} alt={`${stage.title}の画像`} className="stage-image" />
                    ) : (
                      <div className="stage-image-placeholder" aria-hidden="true" />
                    )}
                    <input
                      id={`stage-image-upload-${stage.id}`}
                      type="file"
                      accept="image/*"
                      className="stage-image-upload-input"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (!file) {
                          return
                        }

                        const reader = new FileReader()
                        reader.onload = () => {
                          if (typeof reader.result === 'string') {
                            handleUploadImage(stage.id, reader.result)
                          }
                        }
                        reader.readAsDataURL(file)
                      }}
                    />
                    <label
                      htmlFor={`stage-image-upload-${stage.id}`}
                      className="stage-image-overlay-button"
                    >
                      画像を変更
                    </label>
                  </div>
                  <div
                    className="stage-title editable-stage-title"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(event) => {
                      const editedTitle = event.currentTarget.textContent?.trim() ?? ''
                      const nextTitle = editedTitle.length > 0 ? editedTitle : stage.title
                      if (nextTitle !== stage.title) {
                        handleEditStageName(stage.id, nextTitle)
                      }
                      event.currentTarget.textContent = nextTitle
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        event.currentTarget.blur()
                      }
                    }}
                    role="textbox"
                    aria-label="ステージ名を編集"
                  >
                    {stage.title}
                  </div>
                  <StageStats
                    playCount={stage.play_count}
                    clearCount={stage.clear_count}
                    likeCount={stage.like_count}
                    className="meta-text stage-stats-text"
                  />
                  <div className="favorite-rating">
                    <button
                      type="button"
                      className={`stage-favorite-button ${
                        favoriteStageIds.has(stage.id) ? 'active' : 'inactive'
                      }`}
                      aria-pressed={favoriteStageIds.has(stage.id)}
                      aria-label={
                        favoriteStageIds.has(stage.id)
                          ? `${stage.title}のお気に入りを解除`
                          : `${stage.title}をお気に入りに追加`
                      }
                      onClick={() => handleToggleFavorite(stage.id)}
                    >
                      {favoriteStageIds.has(stage.id) ? '❤' : '♡'}
                    </button>
                  </div>
                </div>
                <div className="stage-actions">
                  <AppLink to={`/edit/${stage.id}`} className="button secondary action-with-label">
                    <PencilLine />
                    <span className="action-label">編集</span>
                  </AppLink>
                  <AppLink to={`/play/${stage.id}`} className="button secondary test-play-button">
                    テストプレイ
                  </AppLink>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      void handleCopyShareLink(stage)
                    }}
                  >
                    共有リンク
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDeleteStage(stage.id)
                    }}
                    className="button secondary stage-delete-button action-with-label"
                    disabled={isDeletingStageId === stage.id}
                  >
                    <Trash2 />
                    <span className="action-label">
                      {isDeletingStageId === stage.id ? '削除中' : '消去'}
                    </span>
                  </button>
                </div>
              </li>
            ))}
            <li className="stage-item stage-create-item">
              <AppLink to="/create" className="stage-card stage-create-card">
                <div className="stage-create-plus">＋</div>
                <div className="stage-title">新規ステージ作成</div>
              </AppLink>
            </li>
          </ul>
        </>
      )}
    </section>
  )
}
