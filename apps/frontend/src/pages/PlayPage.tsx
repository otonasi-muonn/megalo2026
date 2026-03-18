import { useCallback, useEffect, useRef, useState } from 'react'
import { useKAPLAY } from '../features/game/useKAPLAY'
import type {
  LikeToggleResponse,
  PlayLogResponse,
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

const RESULT_QUERY_KEYS = new Set([
  'stageId',
  'cleared',
  'logStatus',
  'playLogId',
  'playCount',
  'clearCount',
  'logError',
])

const buildResultPath = (params: Record<string, string>): string => {
  const searchParts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (!RESULT_QUERY_KEYS.has(key)) {
      continue
    }
    searchParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  }
  if (searchParts.length === 0) {
    return '/result'
  }
  return `/result?${searchParts.join('&')}`
}

export const PlayPage = ({ stageId }: PlayPageProps) => {
  const [stage, setStage] = useState<StageDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isTogglingLike, setIsTogglingLike] = useState(false)
  const [isFinishingPlay, setIsFinishingPlay] = useState(false)
  const [likeMessage, setLikeMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const finishingRef = useRef(false)
  const isMountedRef = useRef(false)
  const finishAbortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      finishAbortControllerRef.current?.abort()
      finishAbortControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    finishingRef.current = false
    setIsFinishingPlay(false)
    finishAbortControllerRef.current?.abort()
    finishAbortControllerRef.current = null
  }, [stageId])

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

      const response = await apiPost<LikeToggleResponse>(
        `/api/stages/${stageId}/likes`,
        undefined,
        { withAuth: true },
      )
      setLikeMessage(
        `いいね状態: ${response.data.liked ? 'ON' : 'OFF'} / 合計いいね: ${response.data.like_count}`,
      )
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsTogglingLike(false)
    }
  }

  const handleFinishPlay = useCallback(async (cleared: boolean) => {
    if (finishingRef.current) {
      return
    }

    const finishController = new AbortController()
    finishAbortControllerRef.current?.abort()
    finishAbortControllerRef.current = finishController

    finishingRef.current = true
    setIsFinishingPlay(true)
    setErrorMessage(null)

    try {
      const response = await apiPost<PlayLogResponse>(
        `/api/stages/${stageId}/play_logs`,
        { is_cleared: cleared },
        { signal: finishController.signal },
      )

      if (finishController.signal.aborted || !isMountedRef.current) {
        return
      }

      navigate(
        buildResultPath({
          stageId,
          cleared: String(cleared),
          logStatus: 'success',
          playLogId: response.data.id,
          playCount: String(response.aggregates.play_count),
          clearCount: String(response.aggregates.clear_count),
        }),
      )
    } catch (error) {
      if (
        finishController.signal.aborted ||
        (error instanceof DOMException && error.name === 'AbortError') ||
        !isMountedRef.current
      ) {
        return
      }

      navigate(
        buildResultPath({
          stageId,
          cleared: String(cleared),
          logStatus: 'failed',
          logError: getErrorMessage(error),
        }),
      )
    } finally {
      if (finishAbortControllerRef.current === finishController) {
        finishAbortControllerRef.current = null
      }
      if (isMountedRef.current) {
        finishingRef.current = false
        setIsFinishingPlay(false)
      }
    }
  }, [stageId])

  const { canvasRef } = useKAPLAY({
    initialStageData: stage?.stage_data,
    mode: 'play',
    onGameEnd: handleFinishPlay,
  })

  return (
    <section className="page-card">
      <h1 className="page-heading">プレイ画面</h1>
      <p className="status-text">ステージを読み込み中です。ゴール到達で結果画面へ移動します。</p>

      {isLoading && <p className="status-text">ステージ読込中...</p>}

      {stage && !isLoading && (
        <>
          <h2 className="sub-heading">{stage.title}</h2>
          <p className="meta-text">
            play: {stage.play_count} / clear: {stage.clear_count} / like: {stage.like_count}
          </p>

          {isFinishingPlay && <p className="status-text">プレイログを送信して結果画面へ移動中です...</p>}

          <div className="canvas-wrapper">
            <canvas ref={canvasRef} width={960} height={540} className="game-canvas" style={{ touchAction: 'none' }} />
          </div>

          <div className="inline-actions">
            <button
              type="button"
              className="button secondary"
              onClick={handleLikeToggle}
              disabled={isTogglingLike || isFinishingPlay}
            >
              {isTogglingLike ? '送信中...' : 'いいねトグル'}
            </button>
          </div>

          <div className="inline-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => navigate(`/edit/${stageId}`)}
              disabled={isFinishingPlay}
            >
              編集へ
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => navigate('/')}
              disabled={isFinishingPlay}
            >
              ホームへ
            </button>
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
