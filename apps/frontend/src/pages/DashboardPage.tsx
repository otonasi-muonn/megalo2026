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
    title: '仮のステージ 1',
    is_published: true,
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    title: '仮のステージ 2',
    is_published: false,
    updated_at: new Date().toISOString(),
  },
]

export const DashboardPage = () => {
  const [displayName, setDisplayName] = useState('未取得')
  const [stages, setStages] = useState<StageListItemDto[]>(mockStages) // 仮データを初期値に設定
  const [pagination, setPagination] = useState<Pagination>({
    ...initialPagination,
    total: mockStages.length,
    total_pages: 1,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
    <section className="page-card">
      <h1 className="page-heading">ダッシュボード</h1>
      <p className="status-text">
        {displayName} の作成ステージを表示します。API: <code>GET /api/profiles/me</code> /{' '}
        <code>GET /api/stages</code>
      </p>

      <div className="inline-actions">
        <AppLink to="/create" className="button">
          新規ステージ作成
        </AppLink>
      </div>

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
          <ul className="stage-list">
            {stages.map((stage) => (
              <li key={stage.id} className="stage-item">
                <div>
                  <strong contentEditable onBlur={(e) => handleEditStageName(stage.id, e.target.textContent || stage.title)}>
                    {stage.title}
                  </strong>
                  <p className="meta-text">
                    公開状態: {stage.is_published ? '公開' : '非公開'} / 更新日:{' '}
                    {new Date(stage.updated_at).toLocaleDateString('ja-JP')}
                  </p>
                </div>
                <div className="inline-actions">
                  <AppLink to={`/edit/${stage.id}`} className="button secondary">
                    <PencilLine />
                  </AppLink>
                  <AppLink to={`/play/${stage.id}`} className="button secondary">
                    テストプレイ
                  </AppLink>
                  <button
                    onClick={() => handleDeleteStage(stage.id)}
                    className="button secondary"
                    style={{ backgroundColor: 'red', color: 'white' }}
                  >
                    <Trash2 />
                  </button>
                </div>
              </li>
            ))}
            {stages.length === 0 && (
              <li className="status-text">作成したステージはまだありません。</li>
            )}
          </ul>
        </>
      )}
    </section>
  )
}
