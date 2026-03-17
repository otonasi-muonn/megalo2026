import type { StageData } from '@shared/types'
import { WIND_MAX_LIFETIME_MS } from './useKAPLAY.physics'
import type { CharState, GimmickImageMap, WindLine } from './useKAPLAY.types'
import { getGimmickSize, toCanvasX, toCanvasY } from './useKAPLAY.canvas'

type GameMode = 'play' | 'edit' | 'test'

type RenderAssets = {
  playerImage?: HTMLImageElement | null
  goalImage?: HTMLImageElement | null
  gimmickImages?: GimmickImageMap
  seaImage?: HTMLImageElement | null
}

export const drawStagePreview = (
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  stageData: StageData,
  mode: GameMode,
  frame: number,
  char: CharState,
  windLine: WindLine | null,
  assets: RenderAssets,
) => {
  const stageWidth = stageData.world.width
  const stageHeight = stageData.world.height

  if (mode === 'edit' || mode === 'test') {
    // edit/testモード: sea.png背景 + 白いグリッド線
    if (assets.seaImage && assets.seaImage.complete && assets.seaImage.naturalWidth > 0) {
      context.drawImage(assets.seaImage, 0, 0, canvasWidth, canvasHeight)
    } else {
      context.fillStyle = '#4a90d9'
      context.fillRect(0, 0, canvasWidth, canvasHeight)
    }
    const gridPx = (stageData.world.gridSize / stageWidth) * canvasWidth * 2
    context.strokeStyle = 'rgba(255, 255, 255, 0.25)'
    context.lineWidth = 1
    for (let x = 0; x <= canvasWidth; x += gridPx) {
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, canvasHeight)
      context.stroke()
    }
    for (let y = 0; y <= canvasHeight; y += gridPx) {
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(canvasWidth, y)
      context.stroke()
    }
  } else {
    context.fillStyle = '#1f2937'
    context.fillRect(0, 0, canvasWidth, canvasHeight)
  }

  const spawnX = toCanvasX(stageData.spawn.position.x, stageWidth, canvasWidth)
  const spawnY = toCanvasY(stageData.spawn.position.y, stageHeight, canvasHeight)

  if (mode === 'edit') {
    if (assets.playerImage) {
      const size = 48
      context.drawImage(assets.playerImage, spawnX - size / 2, spawnY - size / 2 + 20, size, size)
    } else {
      context.fillStyle = '#93c5fd'
      context.beginPath()
      context.arc(spawnX, spawnY + 20, 10, 0, Math.PI * 2)
      context.fill()
    }
  }
  if (mode !== 'edit' && mode !== 'test') {
    context.fillStyle = 'rgba(147, 197, 253, 0.3)'
    context.beginPath()
    context.arc(spawnX, spawnY, 8, 0, Math.PI * 2)
    context.fill()
  }

  const goalX = toCanvasX(stageData.goal.position.x, stageWidth, canvasWidth)
  const goalY = toCanvasY(stageData.goal.position.y, stageHeight, canvasHeight)
  const goalW = (stageData.goal.size.width / stageWidth) * canvasWidth
  const goalH = (stageData.goal.size.height / stageHeight) * canvasHeight
  const goalRotDeg = stageData.goal.rotationDeg ?? 0
  if (assets.goalImage && assets.goalImage.complete && assets.goalImage.naturalWidth > 0) {
    context.save()
    context.translate(goalX + goalW / 2, goalY + goalH / 2)
    context.rotate((goalRotDeg * Math.PI) / 180)
    context.drawImage(assets.goalImage, -goalW / 2, -goalH / 2, goalW, goalH)
    context.restore()
  } else {
    context.fillStyle = '#34d399'
    context.fillRect(goalX, goalY, goalW, goalH)
    context.fillStyle = '#ffffff'
    context.font = '11px sans-serif'
    context.textAlign = 'center'
    context.fillText('GOAL', goalX + goalW / 2, goalY + goalH / 2 + 4)
  }

  for (const gimmick of stageData.gimmicks) {
    const x = toCanvasX(gimmick.position.x, stageWidth, canvasWidth)
    const y = toCanvasY(gimmick.position.y, stageHeight, canvasHeight)
    const rotDeg = gimmick.rotationDeg ?? 0

    switch (gimmick.kind) {
      case 'wall': {
        const width = (gimmick.size.width / stageWidth) * canvasWidth
        const height = (gimmick.size.height / stageHeight) * canvasHeight
        const wallImg = assets.gimmickImages?.wall
        if (wallImg) {
          context.save()
          context.translate(x + width / 2, y + height / 2)
          context.rotate((rotDeg * Math.PI) / 180)
          context.drawImage(wallImg, -width / 2, -height / 2, width, height)
          context.restore()
        } else {
          context.fillStyle = '#9ca3af'
          context.fillRect(x, y, width, height)
        }
        break
      }
      case 'spike': {
        const width = (gimmick.size.width / stageWidth) * canvasWidth
        const height = (gimmick.size.height / stageHeight) * canvasHeight
        const spikeImg = assets.gimmickImages?.spike
        if (spikeImg) {
          context.save()
          context.translate(x + width / 2, y + height / 2)
          context.rotate((rotDeg * Math.PI) / 180)
          context.drawImage(spikeImg, -width / 2, -height / 2, width, height)
          context.restore()
        } else {
          context.fillStyle = '#ef4444'
          context.beginPath()
          context.moveTo(x, y + height)
          context.lineTo(x + width / 2, y)
          context.lineTo(x + width, y + height)
          context.closePath()
          context.fill()
        }
        break
      }
      case 'spring': {
        const width = (gimmick.size.width / stageWidth) * canvasWidth
        const height = (gimmick.size.height / stageHeight) * canvasHeight
        const springImg = assets.gimmickImages?.spring
        if (springImg) {
          context.save()
          context.translate(x + width / 2, y + height / 2)
          context.rotate((rotDeg * Math.PI) / 180)
          context.drawImage(springImg, -width / 2, -height / 2, width, height)
          context.restore()
        } else {
          context.strokeStyle = '#f59e0b'
          context.lineWidth = 2
          context.beginPath()
          context.moveTo(x, y + height)
          context.lineTo(x + width * 0.25, y)
          context.lineTo(x + width * 0.5, y + height)
          context.lineTo(x + width * 0.75, y)
          context.lineTo(x + width, y + height)
          context.stroke()
        }
        break
      }
      case 'fan': {
        const fanSize = getGimmickSize(gimmick)
        const width = (fanSize.width / stageWidth) * canvasWidth
        const height = (fanSize.height / stageHeight) * canvasHeight
        const fanImg = assets.gimmickImages?.fan
        if (fanImg) {
          context.save()
          context.translate(x + width / 2, y + height / 2)
          context.rotate((rotDeg * Math.PI) / 180)
          context.drawImage(fanImg, -width / 2, -height / 2, width, height)
          context.restore()
        } else {
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
        }
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
      default:
        break
    }
  }

  if (mode !== 'edit') {
    const charCx = toCanvasX(char.x, stageWidth, canvasWidth)
    const charCy = toCanvasY(char.y, stageHeight, canvasHeight)
    const charCr = (char.radius / stageWidth) * canvasWidth
    const spriteSize = charCr * 2

    if (assets.playerImage && assets.playerImage.complete && assets.playerImage.naturalWidth > 0) {
      context.drawImage(assets.playerImage, charCx - spriteSize / 2, charCy - spriteSize / 2, spriteSize, spriteSize)
    } else {
      context.fillStyle = '#facc15'
      context.beginPath()
      context.arc(charCx, charCy, charCr, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = '#1f2937'
      const eyeOffsetX = Math.sign(char.vx) * charCr * 0.3 + charCr * 0.25
      context.beginPath()
      context.arc(charCx + eyeOffsetX, charCy - charCr * 0.2, charCr * 0.2, 0, Math.PI * 2)
      context.fill()
    }
  }

  if (windLine !== null && windLine.points.length >= 2) {
    const elapsed = performance.now() - windLine.endTime
    const alpha = Math.max(0, 1 - elapsed / WIND_MAX_LIFETIME_MS)
    context.save()
    context.globalAlpha = alpha
    context.strokeStyle = '#7dd3fc'
    context.lineWidth = 3
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.setLineDash([6, 4])
    context.beginPath()
    context.moveTo(windLine.points[0].x, windLine.points[0].y)
    for (let i = 1; i < windLine.points.length; i += 1) {
      context.lineTo(windLine.points[i].x, windLine.points[i].y)
    }
    context.stroke()
    context.restore()
  }
}
