import { createEmptyStageData, type StageData } from '@shared/types'
import { useCallback, useEffect, useRef } from 'react'

interface UseKAPLAYProps {
  initialStageData?: StageData
  mode: 'play' | 'edit' | 'test'
  onGameEnd?: (isCleared: boolean) => void
}

interface MockKaplayInstance {
  destroy: () => void
}

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
  playerImage?: HTMLImageElement | null,
) => {
  const stageWidth = stageData.world.width
  const stageHeight = stageData.world.height

  context.fillStyle = '#0f172a'
  context.fillRect(0, 0, canvasWidth, canvasHeight)

  context.fillStyle = mode === 'play' ? '#1f2937' : '#111827'
  context.fillRect(0, 0, canvasWidth, canvasHeight)

  context.fillStyle = '#93c5fd'
  const spawnX = toCanvasX(stageData.spawn.position.x, stageWidth, canvasWidth)
  const spawnY = toCanvasY(stageData.spawn.position.y, stageHeight, canvasHeight)
  if (playerImage) {
    const size = 48
    context.drawImage(playerImage, spawnX - size / 2, spawnY - size / 2, size, size)
  } else {
    context.beginPath()
    context.arc(spawnX, spawnY, 10, 0, Math.PI * 2)
    context.fill()
  }

  context.fillStyle = '#34d399'
  const goalX = toCanvasX(stageData.goal.position.x, stageWidth, canvasWidth)
  const goalY = toCanvasY(stageData.goal.position.y, stageHeight, canvasHeight)
  const goalW = (stageData.goal.size.width / stageWidth) * canvasWidth
  const goalH = (stageData.goal.size.height / stageHeight) * canvasHeight
  context.fillRect(goalX, goalY, goalW, goalH)

  for (const gimmick of stageData.gimmicks) {
    const x = toCanvasX(gimmick.position.x, stageWidth, canvasWidth)
    const y = toCanvasY(gimmick.position.y, stageHeight, canvasHeight)

    switch (gimmick.kind) {
      case 'wall': {
        context.fillStyle = '#9ca3af'
        const width = (gimmick.size.width / stageWidth) * canvasWidth
        const height = (gimmick.size.height / stageHeight) * canvasHeight
        context.fillRect(x, y, width, height)
        break
      }
      case 'spike': {
        context.fillStyle = '#ef4444'
        const width = (gimmick.size.width / stageWidth) * canvasWidth
        const height = (gimmick.size.height / stageHeight) * canvasHeight
        context.beginPath()
        context.moveTo(x, y + height)
        context.lineTo(x + width / 2, y)
        context.lineTo(x + width, y + height)
        context.closePath()
        context.fill()
        break
      }
      case 'spring': {
        context.strokeStyle = '#f59e0b'
        context.lineWidth = 2
        const width = (gimmick.size.width / stageWidth) * canvasWidth
        const height = (gimmick.size.height / stageHeight) * canvasHeight
        context.beginPath()
        context.moveTo(x, y + height)
        context.lineTo(x + width * 0.25, y)
        context.lineTo(x + width * 0.5, y + height)
        context.lineTo(x + width * 0.75, y)
        context.lineTo(x + width, y + height)
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
          if (i === 0) {
            context.moveTo(waveX, waveY)
          } else {
            context.lineTo(waveX, waveY)
          }
        }
        context.stroke()
        break
      }
    }
  }
}

export const useKAPLAY = ({ initialStageData, mode, onGameEnd }: UseKAPLAYProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameInstanceRef = useRef<MockKaplayInstance | null>(null)
  const latestStageDataRef = useRef<StageData>(initialStageData ?? createEmptyStageData())

  useEffect(() => {
    latestStageDataRef.current = initialStageData ?? createEmptyStageData()
  }, [initialStageData])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    let frame = 0
    let animationFrameId: number | null = null

    const playerImage = new Image()
    let playerImageLoaded = false
    playerImage.onload = () => {
      playerImageLoaded = true
    }
    playerImage.src = '/images/player.png'

    const render = () => {
      frame += 1
      drawStagePreview(
        context,
        canvas.width,
        canvas.height,
        latestStageDataRef.current,
        mode,
        frame,
        playerImageLoaded ? playerImage : null,
      )
      animationFrameId = window.requestAnimationFrame(render)
    }

    render()

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
  }, [mode])

  useEffect(() => {
    if (!onGameEnd) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'c') {
        onGameEnd(true)
      }
      if (event.key.toLowerCase() === 'f') {
        onGameEnd(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onGameEnd])

  const exportStageData = useCallback((): StageData => latestStageDataRef.current, [])

  return {
    canvasRef,
    exportStageData,
  }
}
