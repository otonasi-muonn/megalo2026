import { useCallback, useEffect, useRef, useState } from 'react'
import { AppLink } from '../components/AppLink'
import { useKAPLAY } from '../features/game/useKAPLAY'
import type {
  LikeToggleResponse,
  StageDto,
  StageResponse,
} from '../types/api'
import { apiGet, apiPost } from '../utils/api'
import { navigate } from '../utils/navigation'

interface PlayPageProps {
  stageId: string
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '不明なエラーが発生しました。'

export const PlayPage = ({ stageId }: PlayPageProps) => {
  const [stage, setStage] = useState<StageDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isTogglingLike, setIsTogglingLike] = useState(false)
  const [likeMessage, setLikeMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const finishingRef = useRef(false)

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

  const handleLikeToggle = async () => {
    try {
      setIsTogglingLike(true)
      setErrorMessage(null)
      setLikeMessage(null)

      const response = await apiPost<LikeToggleResponse>(`/api/stages/${stageId}/likes`)
      setLikeMessage(
        `いいね状態: ${response.data.liked ? 'ON' : 'OFF'} / 合計いいね: ${response.data.like_count}`,
      )
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsTogglingLike(false)
    }
  }

  const handleFinishPlay = useCallback((cleared: boolean) => {
    if (finishingRef.current) {
      return
    }
    finishingRef.current = true
    navigate(`/result?stageId=${encodeURIComponent(stageId)}&cleared=${String(cleared)}`)
    // 結果遷移を優先し、ログはバックグラウンド送信する
    void apiPost(`/api/stages/${stageId}/play_logs`, { is_cleared: cleared }).catch(() => {
      // ログ送信失敗はゲーム体験に影響させない
    })
  }, [stageId])

  const { canvasRef } = useKAPLAY({
    initialStageData: stage?.stage_data,
    mode: 'play',
    onGameEnd: handleFinishPlay,
  })

  return (
    <section className="page-card">
      <h1 className="page-heading">プレイ画面</h1>
      <p className="status-text">
        API: <code>GET /api/stages/:id</code> / <code>POST /api/stages/:id/likes</code>
      </p>

      {isLoading && <p className="status-text">ステージ読込中...</p>}

      {stage && !isLoading && (
        <>
          <h2 className="sub-heading">{stage.title}</h2>
          <p className="meta-text">
            play: {stage.play_count} / clear: {stage.clear_count} / like: {stage.like_count}
          </p>

          <p className="status-text">
            キャンバスの初期化済み（<code>useKAPLAY</code>）。デモ用に C キーでクリア、
            F キーで失敗を発火できます。
          </p>

          <div className="canvas-wrapper">
            <canvas ref={canvasRef} width={960} height={540} className="game-canvas" style={{ touchAction: 'none' }} />
          </div>

          <div className="inline-actions">
            <button
              type="button"
              className="button secondary"
              onClick={handleLikeToggle}
              disabled={isTogglingLike}
            >
              {isTogglingLike ? '送信中...' : 'いいねトグル'}
            </button>
            <button type="button" className="button" onClick={() => handleFinishPlay(true)}>
              クリアして結果へ
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => handleFinishPlay(false)}
            >
              失敗して結果へ
            </button>
          </div>

          <div className="inline-actions">
            <AppLink to={`/edit/${stageId}`} className="button secondary">
              編集へ
            </AppLink>
            <AppLink to="/" className="button secondary">
              ホームへ
            </AppLink>
          </div>
        </>
      )}

      {likeMessage && <p className="success-text">{likeMessage}</p>}
      {errorMessage && (
        <p className="error-text" role="alert">
          通信失敗: {errorMessage}
        </p>
      )}
    </section>
  )
}
