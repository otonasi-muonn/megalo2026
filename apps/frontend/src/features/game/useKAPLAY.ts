import { createEmptyStageData, type Size2D, type StageData, type StageGimmick, type StageGimmickKind } from '@shared/types'
import { useCallback, useEffect, useRef } from 'react'
import { createUnplacedGoalPosition, FAN_DEFAULT_SIZE, isGoalPlaced } from './stageEditorConstants'

// ピクセル精度の当たり判定用アルファマスク
type AlphaMask = { data: Uint8Array; width: number; height: number }

const buildAlphaMask = (img: HTMLImageElement): AlphaMask => {
  const offscreen = document.createElement('canvas')
  offscreen.width = img.naturalWidth
  offscreen.height = img.naturalHeight
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const ctx = offscreen.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height)
  const alpha = new Uint8Array(img.naturalWidth * img.naturalHeight)
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = imageData.data[i * 4 + 3]
  }
  return { data: alpha, width: img.naturalWidth, height: img.naturalHeight }
}

// ステージ座標系でピクセル単位の重なり判定（透明部分を除外）
const pixelCollision = (
  mask1: AlphaMask, pos1x: number, pos1y: number, size1w: number, size1h: number,
  mask2: AlphaMask, pos2x: number, pos2y: number, size2w: number, size2h: number,
): boolean => {
  const ix = Math.max(pos1x, pos2x)
  const iy = Math.max(pos1y, pos2y)
  const iRight = Math.min(pos1x + size1w, pos2x + size2w)
  const iBottom = Math.min(pos1y + size1h, pos2y + size2h)
  if (ix >= iRight || iy >= iBottom) return false
  // 4ステージ座標刻みでサンプリング（精度とパフォーマンスのバランス）
  const step = 4
  for (let sy = iy; sy < iBottom; sy += step) {
    for (let sx = ix; sx < iRight; sx += step) {
      const px1 = Math.min(Math.floor(((sx - pos1x) / size1w) * mask1.width), mask1.width - 1)
      const py1 = Math.min(Math.floor(((sy - pos1y) / size1h) * mask1.height), mask1.height - 1)
      if (mask1.data[py1 * mask1.width + px1] === 0) continue
      const px2 = Math.min(Math.floor(((sx - pos2x) / size2w) * mask2.width), mask2.width - 1)
      const py2 = Math.min(Math.floor(((sy - pos2y) / size2h) * mask2.height), mask2.height - 1)
      if (mask2.data[py2 * mask2.width + px2] > 0) return true
    }
  }
  return false
}

interface UseKAPLAYProps {
  initialStageData?: StageData
  mode: 'play' | 'edit' | 'test'
  onGameEnd?: (isCleared: boolean) => void
}

interface MockKaplayInstance {
  destroy: () => void
}

type GimmickImageMap = Partial<Record<StageGimmickKind, HTMLImageElement>>
type PickedItem = { kind: string; stageX: number; stageY: number; rotationDeg: number }

const toCanvasX = (stageX: number, stageWidth: number, canvasWidth: number): number =>
  (stageX / stageWidth) * canvasWidth

const toCanvasY = (stageY: number, stageHeight: number, canvasHeight: number): number =>
  (stageY / stageHeight) * canvasHeight

const getGimmickSize = (gimmick: StageGimmick): Size2D =>
  'size' in gimmick && gimmick.size ? gimmick.size : FAN_DEFAULT_SIZE

const getMaskHit = (
  mask: AlphaMask | null | undefined,
  localX: number,
  localY: number,
  width: number,
  height: number,
): boolean => {
  if (!mask) {
    return true
  }
  const x = Math.min(Math.max(Math.floor((localX / width) * mask.width), 0), mask.width - 1)
  const y = Math.min(Math.max(Math.floor((localY / height) * mask.height), 0), mask.height - 1)
  return mask.data[y * mask.width + x] > 0
}

const toItemKind = (kind: StageGimmickKind): string | null => {
  switch (kind) {
    case 'spring':
      return 'bane'
    case 'wall':
      return 'block'
    case 'fan':
      return 'souhuuki'
    case 'spike':
      return 'toge'
    default:
      return null
  }
}

const drawStagePreview = (
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  stageData: StageData,
  mode: UseKAPLAYProps['mode'],
  frame: number,
  playerImage?: HTMLImageElement | null,
  goalImage?: HTMLImageElement | null,
  gimmickImages?: GimmickImageMap,
) => {
  const stageWidth = stageData.world.width
  const stageHeight = stageData.world.height

  if (mode === 'play') {
    context.fillStyle = '#0f172a'
    context.fillRect(0, 0, canvasWidth, canvasHeight)
    context.fillStyle = '#1f2937'
    context.fillRect(0, 0, canvasWidth, canvasHeight)
  }

  context.fillStyle = '#93c5fd'
  const spawnX = toCanvasX(stageData.spawn.position.x, stageWidth, canvasWidth)
  const spawnY = toCanvasY(stageData.spawn.position.y, stageHeight, canvasHeight)
  if (playerImage) {
    const size = 48
    context.drawImage(playerImage, spawnX - size / 2, spawnY - size / 2 + 20, size, size)
  } else {
    context.beginPath()
    context.arc(spawnX, spawnY + 20, 10, 0, Math.PI * 2)
    context.fill()
  }

  const goalX = toCanvasX(stageData.goal.position.x, stageWidth, canvasWidth)
  const goalY = toCanvasY(stageData.goal.position.y, stageHeight, canvasHeight)
  const goalW = (stageData.goal.size.width / stageWidth) * canvasWidth
  const goalH = (stageData.goal.size.height / stageHeight) * canvasHeight
  const goalRotDeg = stageData.goal.rotationDeg ?? 0
  if (goalImage && goalImage.complete && goalImage.naturalWidth > 0) {
    context.save()
    context.translate(goalX + goalW / 2, goalY + goalH / 2)
    context.rotate((goalRotDeg * Math.PI) / 180)
    context.drawImage(goalImage, -goalW / 2, -goalH / 2, goalW, goalH)
    context.restore()
  }

  for (const gimmick of stageData.gimmicks) {
    const x = toCanvasX(gimmick.position.x, stageWidth, canvasWidth)
    const y = toCanvasY(gimmick.position.y, stageHeight, canvasHeight)
    const rotDeg = gimmick.rotationDeg ?? 0

    switch (gimmick.kind) {
      case 'wall': {
        const width = (gimmick.size.width / stageWidth) * canvasWidth
        const height = (gimmick.size.height / stageHeight) * canvasHeight
        const wallImg = gimmickImages?.wall
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
        const spikeImg = gimmickImages?.spike
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
        const springImg = gimmickImages?.spring
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
        const fanImg = gimmickImages?.fan
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

export const useKAPLAY = ({
  initialStageData,
  mode,
  onGameEnd,
}: UseKAPLAYProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameInstanceRef = useRef<MockKaplayInstance | null>(null)
  const latestStageDataRef = useRef<StageData>(initialStageData ?? createEmptyStageData())
  const gimmickMasksRef = useRef<Partial<Record<StageGimmickKind, AlphaMask>>>({})
  const goalMaskRef = useRef<AlphaMask | null>(null)

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

    const goalImage = new Image()
    let goalImageLoaded = false
    goalImage.onload = () => {
      goalImageLoaded = true
      goalMaskRef.current = buildAlphaMask(goalImage)
    }
    goalImage.src = '/images/gool.png'

    const gimmickImages: GimmickImageMap = {}
    const gimmickImageSrcs: [StageGimmickKind, string][] = [
      ['spike', '/images/toge.png'],
      ['spring', '/images/bane.png'],
      ['fan', '/images/souhuuki.png'],
      ['wall', '/images/block.png'],
    ]
    for (const [kind, src] of gimmickImageSrcs) {
      const img = new Image()
      img.src = src
      img.onload = () => {
        gimmickImages[kind] = img
        gimmickMasksRef.current[kind] = buildAlphaMask(img)
      }
    }

    const render = () => {
      frame += 1
      context.clearRect(0, 0, canvas.width, canvas.height)
      drawStagePreview(
        context,
        canvas.width,
        canvas.height,
        latestStageDataRef.current,
        mode,
        frame,
        playerImageLoaded ? playerImage : null,
        goalImageLoaded ? goalImage : null,
        gimmickImages,
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

  const placeItemAtStage = useCallback((itemKind: string, stageX: number, stageY: number, rotationDeg?: number): boolean => {
    const stageData = latestStageDataRef.current

    // play.png（プレイヤー）の当たり判定領域: スポーン位置を中心に約120x120程度（ステージ座標）
    // キャンバス48pxをステージ座標に変換して計算
    const playerSize = 120
    const spawnPos = stageData.spawn.position
    const spawnMargin = stageData.world.gridSize * 2  // マス2つ分
    const playerMinX = spawnPos.x - playerSize / 2 - spawnMargin
    const playerMaxX = spawnPos.x + playerSize / 2 + spawnMargin
    const playerMinY = spawnPos.y - playerSize / 2 - spawnMargin
    const playerMaxY = spawnPos.y + playerSize / 2 + spawnMargin

    if (itemKind === 'gool') {
      const newW = 180
      const newH = 180
      const posX = stageX - newW / 2
      const posY = stageY - newH / 2
      // play.pngの周囲マス2つ分は配置不可
      if (posX < playerMaxX && posX + newW > playerMinX &&
          posY < playerMaxY && posY + newH > playerMinY) {
        return false
      }
      const goalMask = goalMaskRef.current
      if (goalMask) {
        const hasOverlap = stageData.gimmicks.some((g) => {
          const gMask = gimmickMasksRef.current[g.kind]
          if (!gMask) return false
          const gSize = getGimmickSize(g)
          return pixelCollision(goalMask, posX, posY, newW, newH, gMask, g.position.x, g.position.y, gSize.width, gSize.height)
        })
        if (hasOverlap) return false
      }
      latestStageDataRef.current = {
        ...stageData,
        goal: {
          ...stageData.goal,
          position: { x: posX, y: posY },
          size: { width: newW, height: newH },
          rotationDeg: rotationDeg ?? 0,
        },
      }
      return true
    }

    const kindMap: Partial<Record<string, StageGimmickKind>> = {
      bane: 'spring',
      block: 'wall',
      souhuuki: 'fan',
      toge: 'spike',
    }
    const kind = kindMap[itemKind]
    if (!kind) return false

    let newGimmick: StageGimmick
    switch (kind) {
      case 'spike':
        newGimmick = { id: crypto.randomUUID(), kind, position: { x: stageX - 64, y: stageY - 64 }, size: { width: 128, height: 128 }, rotationDeg: rotationDeg ?? 0, damage: 1 }
        break
      case 'spring':
        newGimmick = { id: crypto.randomUUID(), kind, position: { x: stageX - 48, y: stageY - 48 }, size: { width: 96, height: 96 }, rotationDeg: rotationDeg ?? 0, power: 500 }
        break
      case 'fan':
        newGimmick = { id: crypto.randomUUID(), kind, position: { x: stageX - 120, y: stageY - 120 }, size: { width: 240, height: 240 }, rotationDeg: rotationDeg ?? 0, force: 200, range: 150, direction: { x: 0, y: -1 } }
        break
      case 'wall':
        newGimmick = { id: crypto.randomUUID(), kind, position: { x: stageX - 130, y: stageY - 48 }, size: { width: 260, height: 96 }, rotationDeg: rotationDeg ?? 0 }
        break
      default:
        return false
    }

    // ピクセル精度の重なり判定（透明部分を除外）
    const newSize = getGimmickSize(newGimmick)
    // play.pngの周囲マス2つ分は配置不可
    if (newGimmick.position.x < playerMaxX && newGimmick.position.x + newSize.width > playerMinX &&
        newGimmick.position.y < playerMaxY && newGimmick.position.y + newSize.height > playerMinY) {
      return false
    }
    const newMask = gimmickMasksRef.current[kind]
    if (newMask) {
      const hasGimmickOverlap = stageData.gimmicks.some((g) => {
        const gMask = gimmickMasksRef.current[g.kind]
        if (!gMask) return false
        const gSize = getGimmickSize(g)
        return pixelCollision(newMask, newGimmick.position.x, newGimmick.position.y, newSize.width, newSize.height, gMask, g.position.x, g.position.y, gSize.width, gSize.height)
      })
      if (hasGimmickOverlap) return false
      const goalPos = stageData.goal.position
      if (isGoalPlaced(goalPos) && goalMaskRef.current) {
        const goalSize = stageData.goal.size
        if (pixelCollision(newMask, newGimmick.position.x, newGimmick.position.y, newSize.width, newSize.height, goalMaskRef.current, goalPos.x, goalPos.y, goalSize.width, goalSize.height)) return false
      }
    }

    latestStageDataRef.current = {
      ...stageData,
      gimmicks: [...stageData.gimmicks, newGimmick],
    }
    return true
  }, [])

  const addItem = useCallback((itemKind: string, canvasX: number, canvasY: number, rotationDeg?: number) => {
    const canvas = canvasRef.current
    if (!canvas) return false

    const stageData = latestStageDataRef.current
    const stageX = (canvasX / canvas.width) * stageData.world.width
    const stageY = (canvasY / canvas.height) * stageData.world.height
    return placeItemAtStage(itemKind, stageX, stageY, rotationDeg)
  }, [placeItemAtStage])

  const addItemAtStage = useCallback((itemKind: string, stageX: number, stageY: number, rotationDeg?: number) => {
    return placeItemAtStage(itemKind, stageX, stageY, rotationDeg)
  }, [placeItemAtStage])

  // キャンバス座標でヒットしたアイテムを取り外して返す（透明部分は除外）
  const pickItemAt = useCallback((canvasX: number, canvasY: number): PickedItem | null => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const stageData = latestStageDataRef.current
    const stageX = (canvasX / canvas.width) * stageData.world.width
    const stageY = (canvasY / canvas.height) * stageData.world.height

    // ゴールの判定
    const goalPos = stageData.goal.position
    if (isGoalPlaced(goalPos)) {
      const goalSize = stageData.goal.size
      if (
        stageX >= goalPos.x && stageX < goalPos.x + goalSize.width &&
        stageY >= goalPos.y && stageY < goalPos.y + goalSize.height
      ) {
        const hit = getMaskHit(goalMaskRef.current, stageX - goalPos.x, stageY - goalPos.y, goalSize.width, goalSize.height)
        if (hit) {
          latestStageDataRef.current = {
            ...stageData,
            goal: { ...stageData.goal, position: createUnplacedGoalPosition() },
          }
          return {
            kind: 'gool',
            stageX: goalPos.x + goalSize.width / 2,
            stageY: goalPos.y + goalSize.height / 2,
            rotationDeg: stageData.goal.rotationDeg ?? 0,
          }
        }
      }
    }

    // ギミックの判定（後ろから検索して上に重なっているものを優先）
    const gimmicks = stageData.gimmicks
    for (let i = gimmicks.length - 1; i >= 0; i--) {
      const g = gimmicks[i]
      const gSize = getGimmickSize(g)
      if (
        stageX >= g.position.x && stageX < g.position.x + gSize.width &&
        stageY >= g.position.y && stageY < g.position.y + gSize.height
      ) {
        const hit = getMaskHit(gimmickMasksRef.current[g.kind], stageX - g.position.x, stageY - g.position.y, gSize.width, gSize.height)
        if (hit) {
          const itemKind = toItemKind(g.kind)
          if (!itemKind) {
            return null
          }
          latestStageDataRef.current = {
            ...stageData,
            gimmicks: gimmicks.filter((_, idx) => idx !== i),
          }
          return {
            kind: itemKind,
            stageX: g.position.x + gSize.width / 2,
            stageY: g.position.y + gSize.height / 2,
            rotationDeg: g.rotationDeg ?? 0,
          }
        }
      }
    }
    return null
  }, [])

  // アイテムの情報を返すだけで取り外しはしない（✕ボタン表示用）
  const getItemAt = useCallback((canvasX: number, canvasY: number): { id: string; kind: string; stageX: number; stageY: number; stageW: number; stageH: number; rotationDeg: number } | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const stageData = latestStageDataRef.current
    const stageX = (canvasX / canvas.width) * stageData.world.width
    const stageY = (canvasY / canvas.height) * stageData.world.height

    const goalPos = stageData.goal.position
    if (isGoalPlaced(goalPos)) {
      const goalSize = stageData.goal.size
      if (stageX >= goalPos.x && stageX < goalPos.x + goalSize.width &&
          stageY >= goalPos.y && stageY < goalPos.y + goalSize.height) {
        if (getMaskHit(goalMaskRef.current, stageX - goalPos.x, stageY - goalPos.y, goalSize.width, goalSize.height)) {
          return { id: 'gool', kind: 'gool', stageX: goalPos.x, stageY: goalPos.y, stageW: goalSize.width, stageH: goalSize.height, rotationDeg: stageData.goal.rotationDeg ?? 0 }
        }
      }
    }

    const gimmicks = stageData.gimmicks
    for (let i = gimmicks.length - 1; i >= 0; i--) {
      const g = gimmicks[i]
      const gSize = getGimmickSize(g)
      if (stageX >= g.position.x && stageX < g.position.x + gSize.width &&
          stageY >= g.position.y && stageY < g.position.y + gSize.height) {
        if (getMaskHit(gimmickMasksRef.current[g.kind], stageX - g.position.x, stageY - g.position.y, gSize.width, gSize.height)) {
          return { id: g.id, kind: toItemKind(g.kind) ?? g.kind, stageX: g.position.x, stageY: g.position.y, stageW: gSize.width, stageH: gSize.height, rotationDeg: g.rotationDeg ?? 0 }
        }
      }
    }
    return null
  }, [])

  // IDでアイテムを削除する
  const removeItem = useCallback((id: string) => {
    const stageData = latestStageDataRef.current
    if (id === 'gool') {
      latestStageDataRef.current = {
        ...stageData,
        goal: { ...stageData.goal, position: createUnplacedGoalPosition() },
      }
    } else {
      latestStageDataRef.current = {
        ...stageData,
        gimmicks: stageData.gimmicks.filter((g) => g.id !== id),
      }
    }
  }, [])

  // IDでアイテムを90度回転させる
  const rotateItem = useCallback((id: string) => {
    const stageData = latestStageDataRef.current
    if (id === 'gool') {
      const nextRot = ((stageData.goal.rotationDeg ?? 0) + 90) % 360
      latestStageDataRef.current = {
        ...stageData,
        goal: { ...stageData.goal, rotationDeg: nextRot },
      }
      return
    }
    latestStageDataRef.current = {
      ...stageData,
      gimmicks: stageData.gimmicks.map((g) => {
        if (g.id !== id) {
          return g
        }
        const nextRot = ((g.rotationDeg ?? 0) + 90) % 360
        return { ...g, rotationDeg: nextRot }
      }),
    }
  }, [])

  return {
    canvasRef,
    exportStageData,
    addItem,
    addItemAtStage,
    pickItemAt,
    getItemAt,
    removeItem,
    rotateItem,
  }
}
