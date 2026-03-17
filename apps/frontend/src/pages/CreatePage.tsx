import { useCallback, useMemo, useState } from 'react'
import { createEmptyStageData } from '@shared/types'
import { AppLink } from '../components/AppLink'
import { useKAPLAY } from '../features/game/useKAPLAY'
import type { StageResponse } from '../types/api'
import { apiPost } from '../utils/api'

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '不明なエラーが発生しました。'

export const CreatePage = () => {
  const initialStageData = useMemo(() => createEmptyStageData(), [])

  // ── クリア制限付き公開フラグ ──────────────────────────────
  const [isClearChecked, setIsClearChecked] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleTestEnd = useCallback((isCleared: boolean) => {
    setIsTesting(false)
    if (isCleared) {
      setIsClearChecked(true)
      setResultMessage('テストプレイ：クリア成功！「公開して作成」ボタンが有効になりました。')
    } else {
      setResultMessage('テストプレイ：失敗。公開する場合は再度テストプレイでクリアしてください。')
    }
  }, [])

  const { canvasRef, exportStageData } = useKAPLAY({
    initialStageData,
    mode: isTesting ? 'test' : 'edit',
    onGameEnd: handleTestEnd,
  })

  const [title, setTitle] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdStageId, setCreatedStageId] = useState<string | null>(null)

  const handleSubmit = async (
    event: { preventDefault: () => void },
    publishNow: boolean,
  ) => {
    event.preventDefault()

    try {
      setIsSubmitting(true)
      setErrorMessage(null)
      setResultMessage(null)

      const response = await apiPost<StageResponse>('/api/stages', {
        title: title.trim() || 'Untitled Stage',
        is_published: publishNow,
        stage_data: exportStageData(),
      })

      setCreatedStageId(response.data.id)
      setResultMessage(
        publishNow
          ? `ステージを公開しました: ${response.data.id}`
          : `ステージを下書き保存しました: ${response.data.id}`,
      )
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
            プレイ中です。（デバッグ: C キー=クリア / F キー=失敗）
          </p>
        )}
      </div>

      {/* クリア確認インジケータ */}
      {isClearChecked && (
        <p className="success-text">✓ クリア確認済み。「公開して作成」ボタンが有効です。</p>
      )}

      {/* 作成フォーム */}
      <form className="form-grid" onSubmit={(e) => handleSubmit(e, false)}>
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

        <div className="inline-actions">
          {/* 下書き保存 */}
          <button className="button secondary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? '保存中...' : '下書き保存'}
          </button>

          {/* 公開して作成：クリア確認済みのときのみ活性化 */}
          <button
            className="button"
            type="button"
            disabled={isSubmitting || !isClearChecked}
            title={!isClearChecked ? 'テストプレイでクリアしてから公開できます' : undefined}
            onClick={(e) => handleSubmit(e, true)}
          >
            {isSubmitting ? '保存中...' : '公開して作成'}
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
