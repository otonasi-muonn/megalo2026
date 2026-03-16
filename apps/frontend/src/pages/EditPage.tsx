import { type FormEvent, useEffect, useState } from 'react'
import { AppLink } from '../components/AppLink'
import type { StageDto, StageResponse } from '../types/api'
import { apiGet, apiPut } from '../utils/api'

interface EditPageProps {
  stageId: string
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '不明なエラーが発生しました。'

export const EditPage = ({ stageId }: EditPageProps) => {
  const [stage, setStage] = useState<StageDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    const loadStage = async () => {
      try {
        setIsLoading(true)
        setErrorMessage(null)

        const response = await apiGet<StageResponse>(`/api/stages/${stageId}`, {
          signal: controller.signal,
        })
        setStage(response.data)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        setErrorMessage(getErrorMessage(error))
      } finally {
        setIsLoading(false)
      }
    }

    void loadStage()

    return () => controller.abort()
  }, [stageId])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!stage) {
      return
    }

    try {
      setIsSaving(true)
      setErrorMessage(null)
      setResultMessage(null)

      const response = await apiPut<StageResponse>(`/api/stages/${stageId}`, {
        title: stage.title,
        is_published: stage.is_published,
        stage_data: stage.stage_data,
      })

      setStage(response.data)
      setResultMessage('ステージを更新しました。')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  const handleTitleChange = (title: string) => {
    setStage((current) => (current ? { ...current, title } : current))
  }

  const handlePublishedChange = (isPublished: boolean) => {
    setStage((current) => (current ? { ...current, is_published: isPublished } : current))
  }

  return (
    <section className="page-card">
      <h1 className="page-heading">ステージ編集</h1>
      <p className="status-text">
        対象ID: <code>{stageId}</code> / API: <code>GET /api/stages/:id</code> /{' '}
        <code>PUT /api/stages/:id</code>
      </p>

      {isLoading && <p className="status-text">読み込み中...</p>}

      {!isLoading && stage && (
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field-label">
            タイトル
            <input
              className="text-input"
              type="text"
              value={stage.title}
              onChange={(event) => handleTitleChange(event.target.value)}
            />
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={stage.is_published}
              onChange={(event) => handlePublishedChange(event.target.checked)}
            />
            公開状態
          </label>

          <div className="inline-actions">
            <button className="button" type="submit" disabled={isSaving}>
              {isSaving ? '保存中...' : '変更を保存'}
            </button>
            <AppLink to={`/play/${stageId}`} className="button secondary">
              プレイ画面へ
            </AppLink>
          </div>
        </form>
      )}

      {resultMessage && <p className="success-text">{resultMessage}</p>}
      {errorMessage && (
        <p className="error-text" role="alert">
          処理失敗: {errorMessage}
        </p>
      )}
    </section>
  )
}
