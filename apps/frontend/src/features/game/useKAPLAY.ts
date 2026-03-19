import { createEmptyStageData, type StageData, type StageGimmick, type StageGimmickKind } from '@shared/types'
import { useCallback, useEffect, useRef } from 'react'
import { createUnplacedGoalPosition, isGoalPlaced } from './stageEditorConstants'
import { buildAlphaMask, getGimmickSize, getMaskHit, pixelCollision, toItemKind } from './useKAPLAY.canvas'
import { applyFanRightWind, applySpringBounce, calcWindForce, detectCollision, isCharTouchingWindLine, resolveWallCollision, WIND_APPLY_STEPS, WIND_MAX_LIFETIME_MS } from './useKAPLAY.physics'
import { drawStagePreview } from './useKAPLAY.renderer'
import type {
  AlphaMask,
  CharState,
  GimmickImageMap,
  MockKaplayInstance,
  PickedItem,
  SwipeState,
  UseKAPLAYProps,
  WindLine,
} from './useKAPLAY.types'

const isFanOpaqueAtStagePoint = (
  fan: StageGimmick,
  fanMask: AlphaMask,
  stageX: number,
  stageY: number,
): boolean => {
  const fanSize = getGimmickSize(fan)
  const centerX = fan.position.x + fanSize.width / 2
  const centerY = fan.position.y + fanSize.height / 2
  const dx = stageX - centerX
  const dy = stageY - centerY
  const rot = ((fan.rotationDeg ?? 0) * Math.PI) / 180
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)

  // 回転済み座標を逆回転して、画像ローカル座標に戻す
  const localX = dx * cos + dy * sin + fanSize.width / 2
  const localY = -dx * sin + dy * cos + fanSize.height / 2

  if (localX < 0 || localX >= fanSize.width || localY < 0 || localY >= fanSize.height) {
    return false
  }

  const px = Math.min(Math.floor((localX / fanSize.width) * fanMask.width), fanMask.width - 1)
  const py = Math.min(Math.floor((localY / fanSize.height) * fanMask.height), fanMask.height - 1)
  return fanMask.data[py * fanMask.width + px] > 0
}

const isCharCollidingFanOpaque = (
  char: CharState,
  stageData: StageData,
  fanMask: AlphaMask | null | undefined,
): boolean => {
  if (!fanMask) {
    return false
  }

  const sampleScale = 0.85
  const r = char.radius * sampleScale
  const samples = [
    [0, 0],
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
    [r * 0.7, r * 0.7],
    [-r * 0.7, r * 0.7],
    [r * 0.7, -r * 0.7],
    [-r * 0.7, -r * 0.7],
  ] as const

  for (const gimmick of stageData.gimmicks) {
    if (gimmick.kind !== 'fan') {
      continue
    }

    const size = getGimmickSize(gimmick)
    const halfDiag = Math.hypot(size.width, size.height) / 2
    if (Math.hypot(char.x - (gimmick.position.x + size.width / 2), char.y - (gimmick.position.y + size.height / 2)) > halfDiag + char.radius) {
      continue
    }

    for (const [sx, sy] of samples) {
      if (isFanOpaqueAtStagePoint(gimmick, fanMask, char.x + sx, char.y + sy)) {
        return true
      }
    }
  }

  return false
}

export const useKAPLAY = ({
  initialStageData,
  mode,
  onGameEnd,
  onStageDataChange,
}: UseKAPLAYProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameInstanceRef = useRef<MockKaplayInstance | null>(null)
  const latestStageDataRef = useRef<StageData>(initialStageData ?? createEmptyStageData())
  const gimmickMasksRef = useRef<Partial<Record<StageGimmickKind, AlphaMask>>>({})
  const goalMaskRef = useRef<AlphaMask | null>(null)
  const onGameEndRef = useRef(onGameEnd)
  const onStageDataChangeRef = useRef(onStageDataChange)
  const windLineRef = useRef<WindLine | null>(null)

  useEffect(() => {
    onGameEndRef.current = onGameEnd
  }, [onGameEnd])

  useEffect(() => {
    onStageDataChangeRef.current = onStageDataChange
  }, [onStageDataChange])

  useEffect(() => {
    latestStageDataRef.current = initialStageData ?? createEmptyStageData()
  }, [initialStageData])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const stageData = latestStageDataRef.current
    const { spawn } = stageData

    windLineRef.current = null

    const char: CharState = {
      x: spawn.position.x,
      y: spawn.position.y,
      vx: mode === 'edit' ? 0 : 120,
      vy: 0,
      radius: 24,
    }

    const seaImage = new Image()
    let seaImageLoaded = false
    seaImage.onload = () => {
      seaImageLoaded = true
    }
    seaImage.src = '/images/sea.png'

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

    const fps = 60
    const dt = 1 / fps
    let collisionFired = false
    let frame = 0
    let animationFrameId: number | null = null

    const tick = () => {
      frame += 1

      if (mode !== 'edit' && !collisionFired) {
        const latestStageData = latestStageDataRef.current
        const physics = latestStageData.physics
        const windLine = windLineRef.current

        if (windLine !== null) {
          const elapsed = performance.now() - windLine.endTime
          if (elapsed > WIND_MAX_LIFETIME_MS || windLine.remainingSteps <= 0) {
            windLineRef.current = null
          } else if (
            isCharTouchingWindLine(
              char,
              latestStageData.world.width,
              latestStageData.world.height,
              canvas.width,
              canvas.height,
              windLine.points,
            )
          ) {
            const retention = 1 - windLine.decay
            const appliedIndex = WIND_APPLY_STEPS - windLine.remainingSteps
            const stepWeight = retention ** appliedIndex
            const stepScale = stepWeight / windLine.totalWeight
            char.vx += windLine.fx * stepScale
            char.vy += windLine.fy * stepScale
            windLine.remainingSteps -= 1
            if (windLine.remainingSteps <= 0) {
              windLineRef.current = null
            }
          }
        }

        char.vy += physics.gravity.y * dt * 60
        char.vx *= 1 - physics.airDrag
        char.vy *= 1 - physics.airDrag
        applyFanRightWind(char, latestStageData, dt)
        const prevX = char.x
        const prevY = char.y
        char.x += char.vx * dt
        char.y += char.vy * dt

        applySpringBounce(char, latestStageData)
        resolveWallCollision(char, latestStageData)
        if (isCharCollidingFanOpaque(char, latestStageData, gimmickMasksRef.current.fan)) {
          char.x = prevX
          char.y = prevY
          char.vx *= 0.6
          char.vy *= 0.6
        }

        if (char.y - char.radius < 0) {
          char.y = char.radius
          char.vy = Math.abs(char.vy) * 0.5
        }

        const collision = detectCollision(char, latestStageData)
        if (collision !== 'none') {
          collisionFired = true
          drawStagePreview(
            context,
            canvas.width,
            canvas.height,
            latestStageData,
            mode,
            frame,
            char,
            windLineRef.current,
            {
              playerImage: playerImageLoaded ? playerImage : null,
              goalImage: goalImageLoaded ? goalImage : null,
              gimmickImages,
              seaImage: seaImageLoaded ? seaImage : null,
            },
          )
          onGameEndRef.current?.(collision === 'goal')
          return
        }
      }

      if (mode === 'edit') {
        const latestStageData = latestStageDataRef.current
        char.x = latestStageData.spawn.position.x
        char.y = latestStageData.spawn.position.y
        char.vx = 0
        char.vy = 0
      }

      drawStagePreview(
        context,
        canvas.width,
        canvas.height,
        latestStageDataRef.current,
        mode,
        frame,
        char,
        windLineRef.current,
        {
          playerImage: playerImageLoaded ? playerImage : null,
          goalImage: goalImageLoaded ? goalImage : null,
          gimmickImages,
          seaImage: seaImageLoaded ? seaImage : null,
        },
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
  }, [mode, initialStageData])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || mode === 'edit') return

    let swipe: SwipeState | null = null

    const onSwipeStart = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      swipe = {
        points: [{ x: clientX - rect.left, y: clientY - rect.top }],
        startTime: performance.now(),
      }
    }

    const clampToCanvas = (clientX: number, clientY: number, rect: DOMRect) => ({
      x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, clientY - rect.top)),
    })

    const onSwipeMove = (clientX: number, clientY: number) => {
      if (swipe === null) return
      const rect = canvas.getBoundingClientRect()
      const { x, y } = clampToCanvas(clientX, clientY, rect)
      const last = swipe.points[swipe.points.length - 1]
      if (Math.hypot(x - last.x, y - last.y) >= 4) {
        swipe.points.push({ x, y })
      }
    }

    const onSwipeEnd = (clientX: number, clientY: number) => {
      if (swipe === null) return
      const rect = canvas.getBoundingClientRect()
      swipe.points.push(clampToCanvas(clientX, clientY, rect))
      const points = swipe.points
      const durationMs = performance.now() - swipe.startTime
      swipe = null

      const first = points[0]
      const last = points[points.length - 1]
      const dx = last.x - first.x
      const dy = last.y - first.y
      if (Math.hypot(dx, dy) < 8) return

      const { world, physics } = latestStageDataRef.current
      const { fx, fy } = calcWindForce(
        dx,
        dy,
        durationMs,
        canvas.width,
        world.width,
        physics.windForceScale,
      )
      const decay = Math.max(0, Math.min(0.95, physics.windDecay))
      const retention = 1 - decay
      const totalWeight = retention === 1
        ? WIND_APPLY_STEPS
        : (1 - retention ** WIND_APPLY_STEPS) / (1 - retention)

      windLineRef.current = {
        points,
        endTime: performance.now(),
        fx,
        fy,
        remainingSteps: WIND_APPLY_STEPS,
        decay,
        totalWeight,
      }
    }

    const handleMouseDown = (event: MouseEvent) => onSwipeStart(event.clientX, event.clientY)
    const handleMouseMove = (event: MouseEvent) => onSwipeMove(event.clientX, event.clientY)
    const handleMouseUp = (event: MouseEvent) => onSwipeEnd(event.clientX, event.clientY)

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (touch) onSwipeStart(touch.clientX, touch.clientY)
    }
    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (touch) onSwipeMove(touch.clientX, touch.clientY)
    }
    const handleTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0]
      if (touch) onSwipeEnd(touch.clientX, touch.clientY)
    }

    canvas.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true })
    canvas.addEventListener('touchmove', handleTouchMove, { passive: true })
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', handleTouchEnd)
    }
  }, [mode, initialStageData])

  const setStageData = useCallback((nextStageData: StageData) => {
    latestStageDataRef.current = nextStageData
    onStageDataChangeRef.current?.()
  }, [])

  const exportStageData = useCallback((): StageData => latestStageDataRef.current, [])

  const placeItemAtStage = useCallback((itemKind: string, stageX: number, stageY: number, rotationDeg?: number): boolean => {
    const stageData = latestStageDataRef.current

    const playerSize = 120
    const spawnPos = stageData.spawn.position
    const spawnMargin = stageData.world.gridSize * 2
    const playerMinX = spawnPos.x - playerSize / 2 - spawnMargin
    const playerMaxX = spawnPos.x + playerSize / 2 + spawnMargin
    const playerMinY = spawnPos.y - playerSize / 2 - spawnMargin
    const playerMaxY = spawnPos.y + playerSize / 2 + spawnMargin

    if (itemKind === 'gool') {
      const newW = 180
      const newH = 180
      const posX = stageX - newW / 2
      const posY = stageY - newH / 2

      if (
        posX < playerMaxX &&
        posX + newW > playerMinX &&
        posY < playerMaxY &&
        posY + newH > playerMinY
      ) {
        return false
      }

      const goalMask = goalMaskRef.current
      if (goalMask) {
        const hasOverlap = stageData.gimmicks.some((gimmick) => {
          const gimmickMask = gimmickMasksRef.current[gimmick.kind]
          if (!gimmickMask) return false
          const gimmickSize = getGimmickSize(gimmick)
          return pixelCollision(
            goalMask,
            posX,
            posY,
            newW,
            newH,
            gimmickMask,
            gimmick.position.x,
            gimmick.position.y,
            gimmickSize.width,
            gimmickSize.height,
          )
        })
        if (hasOverlap) return false
      }

      setStageData({
        ...stageData,
        goal: {
          ...stageData.goal,
          position: { x: posX, y: posY },
          size: { width: newW, height: newH },
          rotationDeg: rotationDeg ?? 0,
        },
      })
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

    const newSize = getGimmickSize(newGimmick)

    if (
      newGimmick.position.x < playerMaxX &&
      newGimmick.position.x + newSize.width > playerMinX &&
      newGimmick.position.y < playerMaxY &&
      newGimmick.position.y + newSize.height > playerMinY
    ) {
      return false
    }

    const newMask = gimmickMasksRef.current[kind]
    if (newMask) {
      const hasGimmickOverlap = stageData.gimmicks.some((gimmick) => {
        const gimmickMask = gimmickMasksRef.current[gimmick.kind]
        if (!gimmickMask) return false
        const gimmickSize = getGimmickSize(gimmick)
        return pixelCollision(
          newMask,
          newGimmick.position.x,
          newGimmick.position.y,
          newSize.width,
          newSize.height,
          gimmickMask,
          gimmick.position.x,
          gimmick.position.y,
          gimmickSize.width,
          gimmickSize.height,
        )
      })
      if (hasGimmickOverlap) return false

      const goalPos = stageData.goal.position
      if (isGoalPlaced(goalPos) && goalMaskRef.current) {
        const goalSize = stageData.goal.size
        if (
          pixelCollision(
            newMask,
            newGimmick.position.x,
            newGimmick.position.y,
            newSize.width,
            newSize.height,
            goalMaskRef.current,
            goalPos.x,
            goalPos.y,
            goalSize.width,
            goalSize.height,
          )
        ) {
          return false
        }
      }
    }

    setStageData({
      ...stageData,
      gimmicks: [...stageData.gimmicks, newGimmick],
    })

    return true
  }, [setStageData])

  const addItem = useCallback((itemKind: string, canvasX: number, canvasY: number, rotationDeg?: number) => {
    const canvas = canvasRef.current
    if (!canvas) return false

    const stageData = latestStageDataRef.current
    const stageX = (canvasX / canvas.width) * stageData.world.width
    const stageY = (canvasY / canvas.height) * stageData.world.height
    return placeItemAtStage(itemKind, stageX, stageY, rotationDeg)
  }, [placeItemAtStage])

  const addItemAtStage = useCallback((itemKind: string, stageX: number, stageY: number, rotationDeg?: number) => (
    placeItemAtStage(itemKind, stageX, stageY, rotationDeg)
  ), [placeItemAtStage])

  const pickItemAt = useCallback((canvasX: number, canvasY: number): PickedItem | null => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const stageData = latestStageDataRef.current
    const stageX = (canvasX / canvas.width) * stageData.world.width
    const stageY = (canvasY / canvas.height) * stageData.world.height

    const goalPos = stageData.goal.position
    if (isGoalPlaced(goalPos)) {
      const goalSize = stageData.goal.size
      if (
        stageX >= goalPos.x &&
        stageX < goalPos.x + goalSize.width &&
        stageY >= goalPos.y &&
        stageY < goalPos.y + goalSize.height
      ) {
        const hit = getMaskHit(goalMaskRef.current, stageX - goalPos.x, stageY - goalPos.y, goalSize.width, goalSize.height)
        if (hit) {
          setStageData({
            ...stageData,
            goal: { ...stageData.goal, position: createUnplacedGoalPosition() },
          })
          return {
            kind: 'gool',
            stageX: goalPos.x + goalSize.width / 2,
            stageY: goalPos.y + goalSize.height / 2,
            rotationDeg: stageData.goal.rotationDeg ?? 0,
          }
        }
      }
    }

    const gimmicks = stageData.gimmicks
    for (let i = gimmicks.length - 1; i >= 0; i -= 1) {
      const gimmick = gimmicks[i]
      const gimmickSize = getGimmickSize(gimmick)
      if (
        stageX >= gimmick.position.x &&
        stageX < gimmick.position.x + gimmickSize.width &&
        stageY >= gimmick.position.y &&
        stageY < gimmick.position.y + gimmickSize.height
      ) {
        const hit = getMaskHit(
          gimmickMasksRef.current[gimmick.kind],
          stageX - gimmick.position.x,
          stageY - gimmick.position.y,
          gimmickSize.width,
          gimmickSize.height,
        )
        if (hit) {
          const itemKind = toItemKind(gimmick.kind)
          if (!itemKind) return null

          setStageData({
            ...stageData,
            gimmicks: gimmicks.filter((_, idx) => idx !== i),
          })
          return {
            kind: itemKind,
            stageX: gimmick.position.x + gimmickSize.width / 2,
            stageY: gimmick.position.y + gimmickSize.height / 2,
            rotationDeg: gimmick.rotationDeg ?? 0,
          }
        }
      }
    }

    return null
  }, [setStageData])

  const getItemAt = useCallback((canvasX: number, canvasY: number): { id: string; kind: string; stageX: number; stageY: number; stageW: number; stageH: number; rotationDeg: number } | null => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const stageData = latestStageDataRef.current
    const stageX = (canvasX / canvas.width) * stageData.world.width
    const stageY = (canvasY / canvas.height) * stageData.world.height

    const goalPos = stageData.goal.position
    if (isGoalPlaced(goalPos)) {
      const goalSize = stageData.goal.size
      if (
        stageX >= goalPos.x &&
        stageX < goalPos.x + goalSize.width &&
        stageY >= goalPos.y &&
        stageY < goalPos.y + goalSize.height &&
        getMaskHit(goalMaskRef.current, stageX - goalPos.x, stageY - goalPos.y, goalSize.width, goalSize.height)
      ) {
        return {
          id: 'gool',
          kind: 'gool',
          stageX: goalPos.x,
          stageY: goalPos.y,
          stageW: goalSize.width,
          stageH: goalSize.height,
          rotationDeg: stageData.goal.rotationDeg ?? 0,
        }
      }
    }

    const gimmicks = stageData.gimmicks
    for (let i = gimmicks.length - 1; i >= 0; i -= 1) {
      const gimmick = gimmicks[i]
      const gimmickSize = getGimmickSize(gimmick)
      if (
        stageX >= gimmick.position.x &&
        stageX < gimmick.position.x + gimmickSize.width &&
        stageY >= gimmick.position.y &&
        stageY < gimmick.position.y + gimmickSize.height &&
        getMaskHit(
          gimmickMasksRef.current[gimmick.kind],
          stageX - gimmick.position.x,
          stageY - gimmick.position.y,
          gimmickSize.width,
          gimmickSize.height,
        )
      ) {
        return {
          id: gimmick.id,
          kind: toItemKind(gimmick.kind) ?? gimmick.kind,
          stageX: gimmick.position.x,
          stageY: gimmick.position.y,
          stageW: gimmickSize.width,
          stageH: gimmickSize.height,
          rotationDeg: gimmick.rotationDeg ?? 0,
        }
      }
    }

    return null
  }, [])

  const removeItem = useCallback((id: string) => {
    const stageData = latestStageDataRef.current

    if (id === 'gool') {
      if (!isGoalPlaced(stageData.goal.position)) {
        return
      }
      setStageData({
        ...stageData,
        goal: { ...stageData.goal, position: createUnplacedGoalPosition() },
      })
      return
    }

    const nextGimmicks = stageData.gimmicks.filter((gimmick) => gimmick.id !== id)
    if (nextGimmicks.length === stageData.gimmicks.length) {
      return
    }

    setStageData({
      ...stageData,
      gimmicks: nextGimmicks,
    })
  }, [setStageData])

  const rotateItem = useCallback((id: string) => {
    const stageData = latestStageDataRef.current

    if (id === 'gool') {
      const nextRot = ((stageData.goal.rotationDeg ?? 0) + 90) % 360
      setStageData({
        ...stageData,
        goal: { ...stageData.goal, rotationDeg: nextRot },
      })
      return
    }

    let changed = false
    const nextGimmicks = stageData.gimmicks.map((gimmick) => {
      if (gimmick.id !== id) {
        return gimmick
      }
      changed = true
      const nextRot = ((gimmick.rotationDeg ?? 0) + 90) % 360
      return { ...gimmick, rotationDeg: nextRot }
    })
    if (!changed) {
      return
    }

    setStageData({
      ...stageData,
      gimmicks: nextGimmicks,
    })
  }, [setStageData])

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
