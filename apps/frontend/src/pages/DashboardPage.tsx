import { useEffect, useState } from 'react'
import { AppLink } from '../components/AppLink'
import { Trash2 } from 'lucide-react'
import { PencilLine } from 'lucide-react'
import { ArrowDownUp } from 'lucide-react'
import { Heart } from 'lucide-react'
import { SpellCheck } from 'lucide-react'
import { Search } from 'lucide-react'
import type {
  Pagination,
  ProfileResponse,
  StageListItemDto,
  StageListResponse,
} from '../types/api'
import { apiGet } from '../utils/api'
import './DashboardPage.css'

type DashboardStage = StageListItemDto & {
  imageUrl?: string
  isMock?: boolean
}

const initialPagination: Pagination = {
  page: 1,
  limit: 10,
  total: 0,
  total_pages: 0,
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '不明なエラーが発生しました。'

const mockStages: DashboardStage[] = [
  {
    id: '1',
    author_id: 'mock-user-1',
    title: '仮のステージ 1',
    is_published: true,
    play_count: 0,
    clear_count: 0,
    like_count: 8,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
    updated_at: new Date().toISOString(),
    isMock: true,
  },
  {
    id: '2',
    author_id: 'mock-user-1',
    title: '仮のステージ 2',
    is_published: false,
    play_count: 0,
    clear_count: 0,
    like_count: 2,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    updated_at: new Date().toISOString(),
    isMock: true,
  },
  {
    id: '3',
    author_id: 'mock-user-1',
    title: '仮のステージ 3',
    is_published: true,
    play_count: 0,
    clear_count: 0,
    like_count: 15,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    updated_at: new Date().toISOString(),
    isMock: true,
  },
  {
    id: '4',
    author_id: 'mock-user-1',
    title: '仮のステージ 4',
    is_published: false,
    play_count: 0,
    clear_count: 0,
    like_count: 5,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    updated_at: new Date().toISOString(),
    isMock: true,
  },
]

type StageSortKey = 'favorite' | 'created' | 'name'
type SortOrder = 'desc' | 'asc'

export const DashboardPage = () => {
  const [displayName, setDisplayName] = useState('未取得')
  const [stages, setStages] = useState<DashboardStage[]>(mockStages) // 仮データを初期値に設定
  const [pagination, setPagination] = useState<Pagination>({
    ...initialPagination,
    total: mockStages.length,
    total_pages: 1,
  })
  const [sortKey, setSortKey] = useState<StageSortKey>('created')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [favoriteStageIds, setFavoriteStageIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

  const handleDeleteStage = (stageId: string) => {
    if (confirm('このステージを削除してもよろしいですか？')) {
      setStages((prevStages) => prevStages.filter((stage) => stage.id !== stageId))
      setPagination((prevPagination) => ({
        ...prevPagination,
        total: prevPagination.total - 1,
      }))
    }
  }

  const handleEditStageName = (stageId: string, newName: string) => {
    setStages((prevStages) => {
      return prevStages.map((stage) =>
        stage.id === stageId ? { ...stage, title: newName } : stage
      );
    });
  }

  const handleUploadImage = (stageId: string, imageUrl: string) => {
    setStages((prevStages) => {
      return prevStages.map((stage) =>
        stage.id === stageId ? { ...stage, imageUrl } : stage
      );
    });
  }

  useEffect(() => {
    const controller = new AbortController()

    const loadDashboard = async () => {
      try {
        setIsLoading(true)
        setErrorMessage(null)

        const profileResponse = await apiGet<ProfileResponse>('/api/profiles/me', {
          signal: controller.signal,
          withAuth: true,
        })
        setDisplayName(profileResponse.data.display_name)

        const stageResponse = await apiGet<StageListResponse>('/api/stages', {
          query: {
            author_id: profileResponse.data.id,
            page: 1,
            limit: 10,
          },
          signal: controller.signal,
          withAuth: true,
        })

        setStages(stageResponse.data.map((stage) => ({ ...stage, isMock: false })))
        setPagination(stageResponse.pagination)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        setErrorMessage(getErrorMessage(error))
        // エラー時に仮データを使用
        setStages(mockStages)
        setPagination({
          ...initialPagination,
          total: mockStages.length,
          total_pages: 1,
        })
      } finally {
        setIsLoading(false)
      }
    }

    void loadDashboard()

    return () => controller.abort()
  }, [])

  return (
    <section className="page-card dashboard-page">
      <h1 className="page-heading">My Stages</h1>
      <p className="status-text">
        {displayName} さんのステージ一覧です。
      </p>

      {isLoading && <p className="status-text">読み込み中...</p>}
      {errorMessage && (
        <p className="error-text" role="alert">
          読み込み失敗: {errorMessage}
        </p>
      )}

      {!isLoading && !errorMessage && (
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
              <li
                key={stage.id}
                className={`stage-item ${stage.isMock ? 'stage-item-mock' : ''}`.trim()}
              >
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
                    onClick={() => handleDeleteStage(stage.id)}
                    className="button secondary stage-delete-button action-with-label"
                  >
                    <Trash2 />
                    <span className="action-label">消去</span>
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
