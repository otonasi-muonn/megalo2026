import { useEffect, useState } from 'react'
import { AppLink } from '../components/AppLink'
import { Trash2 } from 'lucide-react'
import { PencilLine } from 'lucide-react'
import type {
  Pagination,
  ProfileResponse,
  StageListItemDto,
  StageListResponse,
} from '../types/api'
import { apiGet } from '../utils/api'
import './DashboardPage.css'

const initialPagination: Pagination = {
  page: 1,
  limit: 10,
  total: 0,
  total_pages: 0,
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '不明なエラーが発生しました。'

const mockStages: StageListItemDto[] = [
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
  },
]

type StageSortKey = 'favorite' | 'created' | 'name'

export const DashboardPage = () => {
  const [displayName, setDisplayName] = useState('未取得')
  const [stages, setStages] = useState<StageListItemDto[]>(mockStages) // 仮データを初期値に設定
  const [pagination, setPagination] = useState<Pagination>({
    ...initialPagination,
    total: mockStages.length,
    total_pages: 1,
  })
  const [sortKey, setSortKey] = useState<StageSortKey>('favorite')
  const [favoriteStageIds, setFavoriteStageIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const sortedStages = [...stages].sort((a, b) => {
    if (sortKey === 'favorite') {
      const aFavorite = favoriteStageIds.has(a.id) ? 1 : 0
      const bFavorite = favoriteStageIds.has(b.id) ? 1 : 0
      if (aFavorite !== bFavorite) {
        return bFavorite - aFavorite
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }

    if (sortKey === 'created') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }

    return a.title.localeCompare(b.title, 'ja')
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
        })
        setDisplayName(profileResponse.data.display_name)

        const stageResponse = await apiGet<StageListResponse>('/api/stages', {
          query: {
            author_id: profileResponse.data.id,
            page: 1,
            limit: 10,
          },
          signal: controller.signal,
        })

        setStages(stageResponse.data)
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
      <h1 className="page-heading">ダッシュボード</h1>
      <p className="status-text">
        {displayName} の作成ステージを表示します。API: <code>GET /api/profiles/me</code> /{' '}
        <code>GET /api/stages</code>
      </p>

      {isLoading && <p className="status-text">読み込み中...</p>}
      {errorMessage && (
        <p className="error-text" role="alert">
          読み込み失敗: {errorMessage}
        </p>
      )}

      {!isLoading && !errorMessage && (
        <>
          <p className="status-text">
            自分のステージ: {pagination.total}件（ページ {pagination.page}/
            {pagination.total_pages || 1}）
          </p>
          <div className="sort-controls">
            <label htmlFor="stage-sort-select">並べ替え:</label>
            <select
              id="stage-sort-select"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as StageSortKey)}
            >
              <option value="favorite">お気に入り順</option>
              <option value="created">制作順</option>
              <option value="name">名前順</option>
            </select>
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
                      <div className="stage-image-placeholder">画像未設定</div>
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
                  <div className="stage-title">{stage.title}</div>
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
                  <AppLink to={`/play/${stage.id}`} className="button secondary">
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
