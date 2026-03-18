import { useCallback, useEffect, useState } from 'react'
import { AppLink } from '../components/AppLink'
import type { PlayLogResponse } from '../types/api'
import { apiPost } from '../utils/api'
import { copyStagePlayUrl } from '../utils/stageShare'

interface ResultPageProps {
  stageId?: string
  cleared: boolean
  logStatus?: 'success' | 'failed'
  playLogId?: string
  playCount?: number
  clearCount?: number
  logError?: string
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '不明なエラーが発生しました。'

export const ResultPage = ({
  stageId,
  cleared,
  logStatus,
  playLogId,
  playCount,
  clearCount,
  logError,
}: ResultPageProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [shareErrorMessage, setShareErrorMessage] = useState<string | null>(null)

  const submitPlayLog = useCallback(async () => {
    if (!stageId) {
      setResultMessage(null)
      setErrorMessage('stageId が未指定のため、プレイログを送信できません。')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage(null)
      setResultMessage(null)

      const response = await apiPost<PlayLogResponse>(
        `/api/stages/${stageId}/play_logs`,
        {
          is_cleared: cleared,
          retry_count: 0,
        },
      )

      setResultMessage(
        `ログ送信完了: ${response.data.id} / play_count: ${response.aggregates.play_count} / clear_count: ${response.aggregates.clear_count}`,
      )
    } catch (error) {
      setResultMessage(null)
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }, [cleared, stageId])

  useEffect(() => {
    if (!stageId) {
      setResultMessage(null)
      setErrorMessage('stageId が未指定のため、プレイログを送信できません。')
      return
    }

    if (logStatus === 'success') {
      setErrorMessage(null)
      if (playLogId) {
        setResultMessage(
          `ログ送信完了: ${playLogId} / play_count: ${playCount ?? '-'} / clear_count: ${clearCount ?? '-'}`,
        )
      } else {
        setResultMessage('プレイログ送信に成功しました。')
      }
      return
    }

    if (logStatus === 'failed') {
      setResultMessage(null)
      setErrorMessage(logError ?? 'プレイログ送信に失敗しました。')
      return
    }

    void submitPlayLog()
  }, [clearCount, logError, logStatus, playCount, playLogId, stageId, submitPlayLog])

  const handleCopyShareLink = useCallback(async () => {
    if (!stageId) {
      setShareErrorMessage('stageId が未指定のため共有リンクを生成できません。')
      setShareMessage(null)
      return
    }

    try {
      const stageUrl = await copyStagePlayUrl(stageId)
      setShareMessage(`共有リンクをコピーしました: ${stageUrl}`)
      setShareErrorMessage(null)
    } catch (error) {
      setShareErrorMessage(getErrorMessage(error))
      setShareMessage(null)
    }
  }, [stageId])

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
      {shareMessage && <p className="success-text">{shareMessage}</p>}
      {shareErrorMessage && (
        <p className="error-text" role="alert">
          共有リンクのコピー失敗: {shareErrorMessage}
        </p>
      )}

      <div className="inline-actions">
        {stageId && errorMessage && (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              void submitPlayLog()
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? '再送信中...' : 'プレイログを再送信'}
          </button>
        )}
        {stageId && (
          <>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                void handleCopyShareLink()
              }}
            >
              共有リンクをコピー
            </button>
            <AppLink to={`/play/${stageId}`} className="button">
              もう一度プレイ
            </AppLink>
          </>
        )}
        <AppLink to="/" className="button secondary">
          ホームへ戻る
        </AppLink>
      </div>
    </section>
  )
}
