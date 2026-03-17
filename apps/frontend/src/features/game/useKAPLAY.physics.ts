import type { StageData } from '@shared/types'
import type { CharState, CollisionResult } from './useKAPLAY.types'

export const WIND_MAX_LIFETIME_MS = 1500
export const WIND_APPLY_STEPS = 12

const isCircleCollidingRect = (
  cx: number,
  cy: number,
  radius: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean => {
  const nearestX = Math.max(rx, Math.min(cx, rx + rw))
  const nearestY = Math.max(ry, Math.min(cy, ry + rh))
  const dx = cx - nearestX
  const dy = cy - nearestY
  return dx * dx + dy * dy < radius * radius
}

export const detectCollision = (char: CharState, stageData: StageData): CollisionResult => {
  const { goal, gimmicks, world } = stageData

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

  if (
    char.y - char.radius > world.height ||
    char.x + char.radius < 0 ||
    char.x - char.radius > world.width
  ) {
    return 'spike'
  }

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

export const calcWindForce = (
  dx: number,
  dy: number,
  durationMs: number,
  canvasWidth: number,
  stageWidth: number,
  forceScale: number,
): { fx: number; fy: number } => {
  const durationSec = Math.max(durationMs / 1000, 0.016)
  const scale = stageWidth / canvasWidth

  const speedX = (dx / durationSec) * scale
  const speedY = (dy / durationSec) * scale
  const speed = Math.hypot(speedX, speedY)

  const distX = dx * scale
  const distY = dy * scale
  const dist = Math.hypot(distX, distY)

  const maxSpeed = 4000
  const maxDist = 600
  const normSpeed = Math.min(speed / maxSpeed, 1)
  const normDist = Math.min(dist / maxDist, 1)
  const strength = (normSpeed * normDist) ** 2

  const maxImpulse = 2200 * forceScale
  const impulse = strength * maxImpulse
  const safeDenom = speed > 0 ? speed : 1

  return {
    fx: (speedX / safeDenom) * impulse,
    fy: (speedY / safeDenom) * impulse,
  }
}

export const isCharTouchingWindLine = (
  char: CharState,
  worldWidth: number,
  worldHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  points: { x: number; y: number }[],
): boolean => {
  const charCx = (char.x / worldWidth) * canvasWidth
  const charCy = (char.y / worldHeight) * canvasHeight
  const charCr = (char.radius / worldWidth) * canvasWidth

  for (let i = 0; i < points.length - 1; i += 1) {
    const ax = points[i].x
    const ay = points[i].y
    const bx = points[i + 1].x
    const by = points[i + 1].y
    const abx = bx - ax
    const aby = by - ay
    const lenSq = abx * abx + aby * aby
    const t = lenSq > 0
      ? Math.max(0, Math.min(1, ((charCx - ax) * abx + (charCy - ay) * aby) / lenSq))
      : 0
    const nearX = ax + t * abx
    const nearY = ay + t * aby
    if (Math.hypot(charCx - nearX, charCy - nearY) < charCr + 6) {
      return true
    }
  }
  return false
}
