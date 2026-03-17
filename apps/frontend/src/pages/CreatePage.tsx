import { type FormEvent, useMemo, useState } from 'react'
import { createEmptyStageData } from '@shared/types'
import { AppLink } from '../components/AppLink'
import { useKAPLAY } from '../features/game/useKAPLAY'
import type { StageResponse } from '../types/api'
import { apiPost } from '../utils/api'

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '不明なエラーが発生しました。'

export const CreatePage = () => {
  const initialStageData = useMemo(() => createEmptyStageData(), [])
  const { canvasRef, exportStageData } = useKAPLAY({
    initialStageData,
    mode: 'edit',
  })

  const [title, setTitle] = useState('')
  const [isPublished, setIsPublished] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdStageId, setCreatedStageId] = useState<string | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    try {
      setIsSubmitting(true)
      setErrorMessage(null)
      setResultMessage(null)

      const response = await apiPost<StageResponse>('/api/stages', {
        title: title.trim() || 'Untitled Stage',
        is_published: isPublished,
        stage_data: exportStageData(),
      })

      setCreatedStageId(response.data.id)
      setResultMessage(`ステージを作成しました: ${response.data.id}`)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page-card">
      <h1 className="page-heading">ステージ作成</h1>
      <p className="status-text">
        保存アクション時に <code>POST /api/stages</code> を実行します。
      </p>

      <div className="canvas-wrapper">
        <canvas ref={canvasRef} width={960} height={540} className="game-canvas" />
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label className="field-label">
          タイトル
          <input
            className="text-input"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例: 風の練習場"
          />
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(event) => setIsPublished(event.target.checked)}
          />
          公開状態で作成する
        </label>

        <div className="inline-actions">
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? '保存中...' : 'ステージ作成'}
          </button>
          <AppLink to="/dashboard" className="button secondary">
            ダッシュボードへ
          </AppLink>
        </div>
      </form>

      {resultMessage && <p className="success-text">{resultMessage}</p>}
      {errorMessage && (
        <p className="error-text" role="alert">
          保存失敗: {errorMessage}
        </p>
      )}

      {createdStageId && (
        <div className="inline-actions">
          <AppLink to={`/edit/${createdStageId}`} className="button secondary">
            作成したステージを編集
          </AppLink>
          <AppLink to={`/play/${createdStageId}`} className="button secondary">
            作成したステージをプレイ
          </AppLink>
        </div>
      )}
    </section>
  )
}
