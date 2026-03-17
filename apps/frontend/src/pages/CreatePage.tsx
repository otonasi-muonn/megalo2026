import { type FormEvent, useMemo, useRef, useState } from 'react'
import { createEmptyStageData } from '@shared/types'
import { AppLink } from '../components/AppLink'
import { ItemPalette } from '../components/ItemPalette'
import { useKAPLAY } from '../features/game/useKAPLAY'
import type { StageResponse } from '../types/api'
import { apiPost } from '../utils/api'

const ITEM_IMAGES: Record<string, { label: string; src: string }> = {
  bane: { label: 'バネ', src: '/images/bane.png' },
  block: { label: 'ブロック', src: '/images/block.png' },
  gool: { label: 'ゴール', src: '/images/gool.png' },
  souhuuki: { label: '扇風機', src: '/images/souhuuki.png' },
  toge: { label: 'トゲ', src: '/images/toge.png' },
}

type LiftedItem = {
  kind: string
  stageX: number
  stageY: number
  rotationDeg: number
  clientX: number
  clientY: number
  pointerId: number
}

type PendingPress = {
  pointerId: number
  clientX: number
  clientY: number
  canvasX: number
  canvasY: number
}

type SelectedItem = {
  id: string
  kind: string
  stageX: number
  stageY: number
  stageW: number
  stageH: number
  rotationDeg: number
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '不明なエラーが発生しました。'

export const CreatePage = () => {
  const initialStageData = useMemo(() => {
    const base = createEmptyStageData()
    return {
      ...base,
      goal: { ...base.goal, position: { x: -9999, y: -9999 } },
    }
  }, [])
  const { canvasRef, exportStageData, addItem, addItemAtStage, pickItemAt, getItemAt, removeItem, rotateItem } = useKAPLAY({
    initialStageData,
    mode: 'edit',
  })

  const [title, setTitle] = useState('')
  const [isPublished, setIsPublished] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdStageId, setCreatedStageId] = useState<string | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [liftedItem, setLiftedItem] = useState<LiftedItem | null>(null)
  const pendingPressRef = useRef<PendingPress | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const stageData = exportStageData()
    if (stageData.goal.position.x < -9000) {
      setErrorMessage('ゴールを設置してください')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage(null)
      setResultMessage(null)

      const response = await apiPost<StageResponse>('/api/stages', {
        title: title.trim() || 'Untitled Stage',
        is_published: isPublished,
        stage_data: stageData,
      })

      setCreatedStageId(response.data.id)
      setResultMessage(`ステージを作成しました: ${response.data.id}`)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const toCanvasPoint = (clientX: number, clientY: number) => {
    if (!canvasRef.current) {
      return null
    }
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      canvasX: (clientX - rect.left) * scaleX,
      canvasY: (clientY - rect.top) * scaleY,
      rect,
    }
  }

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    pendingPressRef.current = null
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || liftedItem) {
      return
    }

    const pointerId = event.pointerId

    const point = toCanvasPoint(event.clientX, event.clientY)
    if (!point) {
      return
    }

    clearLongPress()
    pendingPressRef.current = {
      pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      canvasX: point.canvasX,
      canvasY: point.canvasY,
    }
    event.currentTarget.setPointerCapture(pointerId)

    longPressTimerRef.current = window.setTimeout(() => {
      const pending = pendingPressRef.current
      if (!pending || pending.pointerId !== pointerId) {
        return
      }

      const pickedItem = pickItemAt(pending.canvasX, pending.canvasY)
      if (!pickedItem) {
        clearLongPress()
        return
      }

      setLiftedItem({
        ...pickedItem,
        clientX: pending.clientX,
        clientY: pending.clientY,
        pointerId: pending.pointerId,
      })
      setSelectedItem(null)
      pendingPressRef.current = null
      longPressTimerRef.current = null
    }, 300)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pending = pendingPressRef.current
    if (pending && pending.pointerId === event.pointerId) {
      pendingPressRef.current = {
        ...pending,
        clientX: event.clientX,
        clientY: event.clientY,
      }

      if (!liftedItem) {
        const distance = Math.hypot(event.clientX - pending.clientX, event.clientY - pending.clientY)
        if (distance > 10) {
          clearLongPress()
        }
      }
    }

    setLiftedItem((current) => {
      if (!current || current.pointerId !== event.pointerId) {
        return current
      }

      return {
        ...current,
        clientX: event.clientX,
        clientY: event.clientY,
      }
    })
  }

  const finishLiftedMove = (event: React.PointerEvent<HTMLDivElement>) => {
    clearLongPress()

    const current = liftedItem
    if (!current || current.pointerId !== event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      // 短押し：ヒットしたアイテムを選択、外れたら選択解除
      const point = toCanvasPoint(event.clientX, event.clientY)
      if (point) {
        setSelectedItem(getItemAt(point.canvasX, point.canvasY))
      }
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const point = toCanvasPoint(event.clientX, event.clientY)
    let moved = false
    if (point) {
      const { rect, canvasX, canvasY } = point
      const insideCanvas =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      if (insideCanvas) {
        moved = addItem(current.kind, canvasX, canvasY, current.rotationDeg)
      }
    }

    if (!moved) {
      addItemAtStage(current.kind, current.stageX, current.stageY, current.rotationDeg)
    }

    setLiftedItem(null)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const itemKind = event.dataTransfer.getData('item-kind')
    if (!itemKind || !canvasRef.current) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const canvasX = (event.clientX - rect.left) * scaleX
    const canvasY = (event.clientY - rect.top) * scaleY
    addItem(itemKind, canvasX, canvasY)
  }

  return (
    <section className="page-card">
      <h1 className="page-heading">ステージ作成</h1>
      <p className="status-text">
        保存アクション時に <code>POST /api/stages</code> を実行します。
      </p>

      <ItemPalette />

      <div
        className={`canvas-wrapper sea-background${liftedItem ? ' is-lifting' : ''}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishLiftedMove}
        onPointerCancel={finishLiftedMove}
      >
        <canvas ref={canvasRef} width={960} height={540} className="game-canvas" />
        {selectedItem && (
          <>
            <button
              className="item-delete-btn"
              style={{
                left: `${((selectedItem.stageX + selectedItem.stageW) / initialStageData.world.width) * 100}%`,
                top: `${(selectedItem.stageY / initialStageData.world.height) * 100}%`,
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={() => { removeItem(selectedItem.id); setSelectedItem(null) }}
              aria-label="削除"
            >
              ×
            </button>
            <button
              className="item-rotate-btn"
              style={{
                left: `${((selectedItem.stageX - 24) / initialStageData.world.width) * 100}%`,
                top: `${(selectedItem.stageY / initialStageData.world.height) * 100}%`,
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={() => { rotateItem(selectedItem.id); setSelectedItem({ ...selectedItem, rotationDeg: (selectedItem.rotationDeg + 90) % 360 }) }}
              aria-label="回転"
            >
              ↻
            </button>
          </>
        )}
      </div>
      {liftedItem ? (
        <div
          className="lifted-item-preview"
          style={{ left: liftedItem.clientX, top: liftedItem.clientY }}
        >
          <img
            src={ITEM_IMAGES[liftedItem.kind].src}
            alt={ITEM_IMAGES[liftedItem.kind].label}
            className="lifted-item-preview-image"
          />
          <span className="lifted-item-preview-label">{ITEM_IMAGES[liftedItem.kind].label}</span>
        </div>
      ) : null}

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
