import { createEmptyStageData, type StageData } from '@shared/types'
import { useCallback, useEffect, useRef } from 'react'

export interface UseKAPLAYProps {
  initialStageData?: StageData
  mode: 'play' | 'edit' | 'test'
  onGameEnd?: (isCleared: boolean) => void
  /** エディタ上でギミック配置が変化したときに呼ばれるコールバック */
  onStageDataChange?: () => void
}

interface MockKaplayInstance {
  destroy: () => void
}

// ステージ座標系でのキャラクター状態
interface CharState {
  x: number
  y: number
  vx: number
  vy: number
  /** ステージ座標系での半径 */
  radius: number
}

// ──────────────────────────────────────────
// 当たり判定ユーティリティ
// ──────────────────────────────────────────

/**
 * 円（キャラ）と軸平行矩形（ゴール・スパイク）の衝突判定。
 * 正確な円×矩形判定を使用し、AABB 近似による誤検知を防ぐ。
 */
const isCircleCollidingRect = (
  cx: number,
  cy: number,
  radius: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean => {
  // 矩形の最近接点を求める
  const nearestX = Math.max(rx, Math.min(cx, rx + rw))
  const nearestY = Math.max(ry, Math.min(cy, ry + rh))
  const dx = cx - nearestX
  const dy = cy - nearestY
  return dx * dx + dy * dy < radius * radius
}

type CollisionResult = 'none' | 'goal' | 'spike'

/**
 * キャラクターとステージオブジェクトの衝突を判定し、結果を返す。
 * goal が優先（ゴールとスパイクが重なるステージへの対応）。
 */
const detectCollision = (char: CharState, stageData: StageData): CollisionResult => {
  const { goal, gimmicks, world } = stageData

  // ゴール判定
  if (
    isCircleCollidingRect(
      char.x,
      char.y,
      char.radius,
      goal.position.x,
      goal.position.y,
      goal.size.width,
      goal.size.height,
    )
  ) {
    return 'goal'
  }

  // ステージ外落下（下辺・左右辺を超えた場合も失敗）
  if (
    char.y - char.radius > world.height ||
    char.x + char.radius < 0 ||
    char.x - char.radius > world.width
  ) {
    return 'spike'
  }

  // スパイク判定
  for (const gimmick of gimmicks) {
    if (gimmick.kind !== 'spike') {
      continue
    }
    if (
      isCircleCollidingRect(
        char.x,
        char.y,
        char.radius,
        gimmick.position.x,
        gimmick.position.y,
        gimmick.size.width,
        gimmick.size.height,
      )
    ) {
      return 'spike'
    }
  }

  return 'none'
}

// ──────────────────────────────────────────
// 描画ユーティリティ
// ──────────────────────────────────────────

const toCanvasX = (stageX: number, stageWidth: number, canvasWidth: number): number =>
  (stageX / stageWidth) * canvasWidth

const toCanvasY = (stageY: number, stageHeight: number, canvasHeight: number): number =>
  (stageY / stageHeight) * canvasHeight

const drawStagePreview = (
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  stageData: StageData,
  mode: UseKAPLAYProps['mode'],
  frame: number,
  char: CharState,
) => {
  const { world, spawn, goal, gimmicks } = stageData
  const sw = world.width
  const sh = world.height

  // 背景
  context.fillStyle = mode === 'play' ? '#1f2937' : '#111827'
  context.fillRect(0, 0, canvasWidth, canvasHeight)

  // スポーン地点（薄く表示）
  context.fillStyle = 'rgba(147, 197, 253, 0.3)'
  context.beginPath()
  context.arc(
    toCanvasX(spawn.position.x, sw, canvasWidth),
    toCanvasY(spawn.position.y, sh, canvasHeight),
    8,
    0,
    Math.PI * 2,
  )
  context.fill()

  // ゴールエリア
  context.fillStyle = '#34d399'
  context.fillRect(
    toCanvasX(goal.position.x, sw, canvasWidth),
    toCanvasY(goal.position.y, sh, canvasHeight),
    (goal.size.width / sw) * canvasWidth,
    (goal.size.height / sh) * canvasHeight,
  )
  // ゴールラベル
  context.fillStyle = '#ffffff'
  context.font = '11px sans-serif'
  context.textAlign = 'center'
  context.fillText(
    'GOAL',
    toCanvasX(goal.position.x + goal.size.width / 2, sw, canvasWidth),
    toCanvasY(goal.position.y + goal.size.height / 2, sh, canvasHeight) + 4,
  )

  // ギミック描画
  for (const gimmick of gimmicks) {
    const x = toCanvasX(gimmick.position.x, sw, canvasWidth)
    const y = toCanvasY(gimmick.position.y, sh, canvasHeight)

    switch (gimmick.kind) {
      case 'wall': {
        context.fillStyle = '#9ca3af'
        context.fillRect(
          x,
          y,
          (gimmick.size.width / sw) * canvasWidth,
          (gimmick.size.height / sh) * canvasHeight,
        )
        break
      }
      case 'spike': {
        const w = (gimmick.size.width / sw) * canvasWidth
        const h = (gimmick.size.height / sh) * canvasHeight
        context.fillStyle = '#ef4444'
        context.beginPath()
        context.moveTo(x, y + h)
        context.lineTo(x + w / 2, y)
        context.lineTo(x + w, y + h)
        context.closePath()
        context.fill()
        break
      }
      case 'spring': {
        const w = (gimmick.size.width / sw) * canvasWidth
        const h = (gimmick.size.height / sh) * canvasHeight
        context.strokeStyle = '#f59e0b'
        context.lineWidth = 2
        context.beginPath()
        context.moveTo(x, y + h)
        context.lineTo(x + w * 0.25, y)
        context.lineTo(x + w * 0.5, y + h)
        context.lineTo(x + w * 0.75, y)
        context.lineTo(x + w, y + h)
        context.stroke()
        break
      }
      case 'fan': {
        context.strokeStyle = '#60a5fa'
        context.lineWidth = 2
        context.beginPath()
        context.moveTo(x, y)
        context.lineTo(x + 18, y)
        context.stroke()
        const pulse = 12 + Math.sin(frame / 12) * 4
        context.strokeStyle = '#93c5fd'
        context.beginPath()
        context.moveTo(x + 18, y)
        context.lineTo(x + 18 + pulse, y)
        context.stroke()
        break
      }
      case 'wave': {
        context.strokeStyle = '#a78bfa'
        context.lineWidth = 2
        context.beginPath()
        for (let i = 0; i <= 32; i += 1) {
          const progress = i / 32
          const waveX = x + progress * 120
          const waveY = y + Math.sin(progress * Math.PI * 2 + frame * 0.08) * 8
          if (i === 0) context.moveTo(waveX, waveY)
          else context.lineTo(waveX, waveY)
        }
        context.stroke()
        break
      }
    }
  }

  // キャラクター描画（edit モードは spawn に静止）
  const charCx = toCanvasX(char.x, sw, canvasWidth)
  const charCy = toCanvasY(char.y, sh, canvasHeight)
  const charCr = (char.radius / sw) * canvasWidth

  context.fillStyle = '#facc15'
  context.beginPath()
  context.arc(charCx, charCy, charCr, 0, Math.PI * 2)
  context.fill()

  // キャラクターの目（進行方向を示す）
  if (mode !== 'edit') {
    context.fillStyle = '#1f2937'
    const eyeOffsetX = Math.sign(char.vx) * charCr * 0.3 + charCr * 0.25
    context.beginPath()
    context.arc(charCx + eyeOffsetX, charCy - charCr * 0.2, charCr * 0.2, 0, Math.PI * 2)
    context.fill()
  }
}

// ──────────────────────────────────────────
// フック本体
// ──────────────────────────────────────────

export const useKAPLAY = ({ initialStageData, mode, onGameEnd, onStageDataChange }: UseKAPLAYProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameInstanceRef = useRef<MockKaplayInstance | null>(null)
  const latestStageDataRef = useRef<StageData>(initialStageData ?? createEmptyStageData())
  // コールバックは最新参照を保持（useEffect の依存配列に含めずに済む）
  const onGameEndRef = useRef(onGameEnd)
  const onStageDataChangeRef = useRef(onStageDataChange)

  useEffect(() => {
    onGameEndRef.current = onGameEnd
  }, [onGameEnd])

  useEffect(() => {
    onStageDataChangeRef.current = onStageDataChange
  }, [onStageDataChange])

  const isFirstStageDataRef = useRef(true)

  useEffect(() => {
    latestStageDataRef.current = initialStageData ?? createEmptyStageData()
    // 初回マウント時（ステージロード完了時）は通知しない
    if (isFirstStageDataRef.current) {
      isFirstStageDataRef.current = false
      return
    }
    onStageDataChangeRef.current?.()
  }, [initialStageData])

  // ゲームループ（mode が変わるたびに再起動）
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const stageData = latestStageDataRef.current
    const { spawn } = stageData

    // キャラクター初期化（ステージ座標系）
    const char: CharState = {
      x: spawn.position.x,
      y: spawn.position.y,
      vx: mode === 'edit' ? 0 : 120, // edit は静止
      vy: 0,
      radius: 24,
    }

    const FPS = 60
    const DT = 1 / FPS
    // 衝突が発火済みかどうか（二重発火防止）
    let collisionFired = false
    let frame = 0
    let animationFrameId: number | null = null

    const tick = () => {
      frame += 1

      if (mode !== 'edit' && !collisionFired) {
        // 物理更新（重力・速度）
        const physics = latestStageDataRef.current.physics
        char.vy += physics.gravity.y * DT * 60
        char.vx *= 1 - physics.airDrag
        char.vy *= 1 - physics.airDrag
        char.x += char.vx * DT
        char.y += char.vy * DT

        // 上辺バウンス
        if (char.y - char.radius < 0) {
          char.y = char.radius
          char.vy = Math.abs(char.vy) * 0.5
        }

        // 当たり判定
        const collision = detectCollision(char, latestStageDataRef.current)
        if (collision !== 'none') {
          collisionFired = true
          // 最後のフレームを描画してからコールバックを呼ぶ
          drawStagePreview(context, canvas.width, canvas.height, latestStageDataRef.current, mode, frame, char)
          onGameEndRef.current?.(collision === 'goal')
          return
        }
      }

      drawStagePreview(
        context,
        canvas.width,
        canvas.height,
        latestStageDataRef.current,
        mode,
        frame,
        char,
      )
      animationFrameId = window.requestAnimationFrame(tick)
    }

    tick()

    gameInstanceRef.current = {
      destroy: () => {
        if (animationFrameId !== null) {
          window.cancelAnimationFrame(animationFrameId)
        }
        context.clearRect(0, 0, canvas.width, canvas.height)
      },
    }

    return () => {
      gameInstanceRef.current?.destroy()
      gameInstanceRef.current = null
    }
  // mode が変わったときのみ再起動（stageData の変化は latestStageDataRef 経由で追従）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // デバッグ用キーボードショートカット（C=クリア / F=失敗）
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'c') {
        onGameEndRef.current?.(true)
      } else if (event.key.toLowerCase() === 'f') {
        onGameEndRef.current?.(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const exportStageData = useCallback((): StageData => latestStageDataRef.current, [])

  return {
    canvasRef,
    exportStageData,
  }
}
