import { useEffect, useState } from 'react'
import { AppLink } from '../components/AppLink'
import type { Pagination, StageListItemDto, StageListResponse } from '../types/api'
import { apiGet } from '../utils/api'

const initialPagination: Pagination = {
  page: 1,
  limit: 12,
  total: 0,
  total_pages: 0,
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '不明なエラーが発生しました。'

export const HomePage = () => {
  const [stages, setStages] = useState<StageListItemDto[]>([])
  const [pagination, setPagination] = useState<Pagination>(initialPagination)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    const loadStages = async () => {
      try {
        setIsLoading(true)
        setErrorMessage(null)

        const response = await apiGet<StageListResponse>('/api/stages', {
          query: {
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
  }, [])

  return (
    <section className="page-card">
      <h1 className="page-heading">ホーム</h1>
      <p className="status-text">
        公開ステージ一覧を表示します。API: <code>GET /api/stages</code>
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
            取得件数: {pagination.total}件（ページ {pagination.page}/{pagination.total_pages || 1}
            ）
          </p>
          <ul className="stage-list">
            {stages.map((stage) => (
              <li key={stage.id} className="stage-item">
                <div>
                  <strong>{stage.title}</strong>
                  <p className="meta-text">
                    play: {stage.play_count} / clear: {stage.clear_count} / like:{' '}
                    {stage.like_count}
                  </p>
                </div>
                <AppLink to={`/play/${stage.id}`} className="button secondary">
                  プレイ
                </AppLink>
              </li>
            ))}
            {stages.length === 0 && <li className="status-text">公開ステージは0件です。</li>}
          </ul>
        </>
      )}
    </section>
  )
}
