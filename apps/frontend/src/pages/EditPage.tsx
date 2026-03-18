import { useCallback, useEffect, useState } from 'react'
import { AppLink } from '../components/AppLink'
import { useKAPLAY } from '../features/game/useKAPLAY'
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

  // ── クリア制限付き公開フラグ ──────────────────────────────
  // テストプレイでゴール到達した場合のみ true になる。
  // ステージデータを変更すると false にリセットされ、再テストが必要になる。
  const [isClearChecked, setIsClearChecked] = useState(false)

  // テストプレイ中かどうか（mode を 'test' に切り替える）
  const [isTesting, setIsTesting] = useState(false)

  // ゴール到達 / 失敗時のコールバック（useKAPLAY に渡す）
  const handleTestEnd = useCallback((isCleared: boolean) => {
    setIsTesting(false)
    if (isCleared) {
      setIsClearChecked(true)
      setResultMessage('テストプレイ：クリア成功！「公開する」ボタンが有効になりました。')
    } else {
      setResultMessage('テストプレイ：失敗。再度テストプレイでクリアしてから公開できます。')
    }
  }, [])

  // ギミック配置が変化したときのコールバック（useKAPLAY から通知される）
  const handleStageDataChange = useCallback(() => {
    setIsClearChecked(false)
    setResultMessage('ステージを変更しました。公開前に再度テストプレイが必要です。')
  }, [])

  const { canvasRef, exportStageData } = useKAPLAY({
    initialStageData: stage?.stage_data ?? undefined,
    mode: isTesting ? 'test' : 'edit',
    onGameEnd: handleTestEnd,
    onStageDataChange: handleStageDataChange,
  })

  // ステージ読み込み
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
        if (error instanceof DOMException && error.name === 'AbortError') return
        setErrorMessage(getErrorMessage(error))
      } finally {
        setIsLoading(false)
      }
    }

    void loadStage()
    return () => controller.abort()
  }, [stageId])

  // 下書き保存
  const handleSubmit = async (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (!stage) return

    try {
      setIsSaving(true)
      setErrorMessage(null)
      setResultMessage(null)

      const response = await apiPut<StageResponse>(`/api/stages/${stageId}`, {
        title: stage.title,
        is_published: false,
        stage_data: exportStageData(),
      }, { withAuth: true })

      setStage(response.data)
      setResultMessage('ステージを更新しました。')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  // 公開保存（isClearChecked が true のときのみ呼び出せる）
  const handlePublish = async () => {
    if (!stage) return
    try {
      setIsSaving(true)
      setErrorMessage(null)
      setResultMessage(null)

      const response = await apiPut<StageResponse>(`/api/stages/${stageId}`, {
        title: stage.title,
        is_published: true,
        stage_data: exportStageData(),
      }, { withAuth: true })
      setStage(response.data)
      setResultMessage('ステージを公開しました！')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  const handleTitleChange = (title: string) => {
    setStage((current) => (current ? { ...current, title } : current))
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
        <>
          {/* ゲームキャンバス */}
          <div className="canvas-wrapper">
            <canvas ref={canvasRef} width={960} height={540} className="game-canvas" style={{ touchAction: 'none' }} />
          </div>

          {/* テストプレイ操作 */}
          <div className="inline-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setResultMessage(null)
                setIsTesting(true)
              }}
              disabled={isTesting}
            >
              {isTesting ? 'テスト中...' : 'テストプレイ開始'}
            </button>
            {isTesting && (
              <p className="status-text">
                プレイ中です。ゴールに到達すると公開可能になります。
                （デバッグ: C キー=クリア / F キー=失敗）
              </p>
            )}
          </div>

          {/* クリア確認インジケータ */}
          {isClearChecked && (
            <p className="success-text">✓ クリア確認済み。「公開する」ボタンが有効です。</p>
          )}

          {/* 編集フォーム */}
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

            <div className="inline-actions">
              {/* 下書き保存 */}
              <button className="button secondary" type="submit" disabled={isSaving}>
                {isSaving ? '保存中...' : '下書き保存'}
              </button>

              {/* 公開ボタン：クリア確認済みのときのみ活性化 */}
              <button
                className="button"
                type="button"
                disabled={isSaving || !isClearChecked}
                title={!isClearChecked ? 'テストプレイでクリアしてから公開できます' : undefined}
                onClick={handlePublish}
              >
                {isSaving ? '保存中...' : '公開する'}
              </button>

              <AppLink to={`/play/${stageId}`} className="button secondary">
                プレイ画面へ
              </AppLink>
            </div>
          </form>
        </>
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
