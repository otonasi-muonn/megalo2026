import { useEffect, useState } from 'react'
import { AppLink } from '../components/AppLink'
import type { PlayLogResponse } from '../types/api'
import { apiPost } from '../utils/api'

interface ResultPageProps {
  stageId?: string
  cleared: boolean
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '不明なエラーが発生しました。'

export const ResultPage = ({ stageId, cleared }: ResultPageProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!stageId) {
      setErrorMessage('stageId が未指定のため、プレイログを送信できません。')
      return
    }

    const submitPlayLog = async () => {
      try {
        setIsSubmitting(true)
        setErrorMessage(null)
        setResultMessage(null)

        const response = await apiPost<PlayLogResponse>(
          `/api/stages/${stageId}/play_logs`,
          {
            is_cleared: cleared,
            retry_count: 0,
            player_id: null,
          },
        )

        setResultMessage(
          `ログ送信完了: ${response.data.id} / clear_count加算: ${response.aggregates.clear_count}`,
        )
      } catch (error) {
        setErrorMessage(getErrorMessage(error))
      } finally {
        setIsSubmitting(false)
      }
    }

    void submitPlayLog()
  }, [cleared, stageId])

  return (
    <section className="page-card">
      <h1 className="page-heading">リザルト</h1>
      <p className="status-text">
        判定: <strong>{cleared ? 'クリア' : '失敗'}</strong> / API:{' '}
        <code>POST /api/stages/:id/play_logs</code>
      </p>

      {isSubmitting && <p className="status-text">プレイログ送信中...</p>}
      {resultMessage && <p className="success-text">{resultMessage}</p>}
      {errorMessage && (
        <p className="error-text" role="alert">
          ログ送信失敗: {errorMessage}
        </p>
      )}

      <div className="inline-actions">
        {stageId && (
          <AppLink to={`/play/${stageId}`} className="button">
            もう一度プレイ
          </AppLink>
        )}
        <AppLink to="/" className="button secondary">
          ホームへ戻る
        </AppLink>
      </div>
    </section>
  )
}
