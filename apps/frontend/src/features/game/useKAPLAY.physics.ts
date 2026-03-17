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

const isSegmentIntersectingRect = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean => {
  const dx = x2 - x1
  const dy = y2 - y1
  let tMin = 0
  let tMax = 1

  const clip = (p: number, q: number): boolean => {
    if (p === 0) {
      return q >= 0
    }
    const r = q / p
    if (p < 0) {
      if (r > tMax) return false
      if (r > tMin) tMin = r
    } else {
      if (r < tMin) return false
      if (r < tMax) tMax = r
    }
    return true
  }

  if (!clip(-dx, x1 - rx)) return false
  if (!clip(dx, rx + rw - x1)) return false
  if (!clip(-dy, y1 - ry)) return false
  if (!clip(dy, ry + rh - y1)) return false

  return tMax >= tMin
}

const hasWallBetweenFanAndChar = (
  stageData: StageData,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  padding: number,
): boolean => {
  for (const gimmick of stageData.gimmicks) {
    if (gimmick.kind !== 'wall') {
      continue
    }

    const rx = gimmick.position.x - padding
    const ry = gimmick.position.y - padding
    const rw = gimmick.size.width + padding * 2
    const rh = gimmick.size.height + padding * 2

    if (isSegmentIntersectingRect(startX, startY, endX, endY, rx, ry, rw, rh)) {
      return true
    }
  }
  return false
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

export const resolveWallCollision = (char: CharState, stageData: StageData): void => {
  for (const gimmick of stageData.gimmicks) {
    if (gimmick.kind !== 'wall') {
      continue
    }

    const rx = gimmick.position.x
    const ry = gimmick.position.y
    const rw = gimmick.size.width
    const rh = gimmick.size.height

    const nearestX = Math.max(rx, Math.min(char.x, rx + rw))
    const nearestY = Math.max(ry, Math.min(char.y, ry + rh))
    let dx = char.x - nearestX
    let dy = char.y - nearestY
    let dist = Math.hypot(dx, dy)

    if (dist >= char.radius) {
      continue
    }

    if (dist === 0) {
      const toLeft = Math.abs(char.x - rx)
      const toRight = Math.abs(rx + rw - char.x)
      const toTop = Math.abs(char.y - ry)
      const toBottom = Math.abs(ry + rh - char.y)
      const minPen = Math.min(toLeft, toRight, toTop, toBottom)

      if (minPen === toLeft) {
        dx = -1
        dy = 0
      } else if (minPen === toRight) {
        dx = 1
        dy = 0
      } else if (minPen === toTop) {
        dx = 0
        dy = -1
      } else {
        dx = 0
        dy = 1
      }
      dist = 1
    }

    const nx = dx / dist
    const ny = dy / dist
    const penetration = char.radius - dist

    char.x += nx * penetration
    char.y += ny * penetration

    const vn = char.vx * nx + char.vy * ny
    if (vn < 0) {
      // 壁に向かう速度成分だけ打ち消して貫通を防ぐ
      char.vx -= vn * nx
      char.vy -= vn * ny
    }
  }
}

export const applySpringBounce = (char: CharState, stageData: StageData): void => {
  for (const gimmick of stageData.gimmicks) {
    if (gimmick.kind !== 'spring') {
      continue
    }

    const rx = gimmick.position.x
    const ry = gimmick.position.y
    const rw = gimmick.size.width
    const rh = gimmick.size.height

    if (!isCircleCollidingRect(char.x, char.y, char.radius, rx, ry, rw, rh)) {
      continue
    }

    const springTop = ry
    const isApproachingFromTop = char.vy >= 0 && char.y <= ry + rh * 0.65
    if (!isApproachingFromTop) {
      continue
    }

    // バネの上面に押し戻してから、上向き速度を付与
    char.y = springTop - char.radius - 1
    const minBounce = Math.max(60, gimmick.power * 0.22)
    char.vy = -Math.max(minBounce, Math.abs(char.vy) * 1.1)
  }
}

export const applyFanRightWind = (char: CharState, stageData: StageData, dt: number): void => {
  for (const gimmick of stageData.gimmicks) {
    if (gimmick.kind !== 'fan') {
      continue
    }

    const fanW = gimmick.size?.width ?? 240
    const fanH = gimmick.size?.height ?? 240
    const halfW = fanW / 2
    const halfH = fanH / 2
    const fanCx = gimmick.position.x + halfW
    const fanCy = gimmick.position.y + halfH
    const range = Math.max(gimmick.range, fanW)

    // 回転角に追従する風向き（0度=右）
    const rotRad = ((gimmick.rotationDeg ?? 0) * Math.PI) / 180
    const dirX = Math.cos(rotRad)
    const dirY = Math.sin(rotRad)
    const perpX = -dirY
    const perpY = dirX

    const relX = char.x - fanCx
    const relY = char.y - fanCy
    const localForward = relX * dirX + relY * dirY
    const localSide = relX * perpX + relY * perpY

    const inFront = localForward >= halfW - char.radius && localForward <= halfW + range + char.radius
    const inWidth = Math.abs(localSide) <= halfH * 0.8 + char.radius
    if (!inFront || !inWidth) {
      continue
    }

    const distFromFace = Math.max(0, localForward - halfW)
    const windStartX = fanCx + dirX * halfW
    const windStartY = fanCy + dirY * halfW
    if (hasWallBetweenFanAndChar(stageData, windStartX, windStartY, char.x, char.y, char.radius * 0.35)) {
      continue
    }
    const attenuation = 1 - Math.min(distFromFace / range, 1)
    const impulse = gimmick.force * attenuation * dt * 15
    char.vx += dirX * impulse
    char.vy += dirY * impulse
  }
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
