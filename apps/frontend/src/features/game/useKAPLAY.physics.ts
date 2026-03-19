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

const toRotatedLocalPoint = (
  worldX: number,
  worldY: number,
  centerX: number,
  centerY: number,
  rotationRad: number,
): { x: number; y: number } => {
  const dx = worldX - centerX
  const dy = worldY - centerY
  const cos = Math.cos(rotationRad)
  const sin = Math.sin(rotationRad)

  return {
    x: dx * cos + dy * sin,
    y: -dx * sin + dy * cos,
  }
}

const toWorldVector = (
  localX: number,
  localY: number,
  rotationRad: number,
): { x: number; y: number } => {
  const cos = Math.cos(rotationRad)
  const sin = Math.sin(rotationRad)

  return {
    x: localX * cos - localY * sin,
    y: localX * sin + localY * cos,
  }
}

const isSegmentIntersectingRotatedRect = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  rotationDeg: number,
  padding: number,
): boolean => {
  const centerX = rx + rw / 2
  const centerY = ry + rh / 2
  const rotRad = (rotationDeg * Math.PI) / 180

  const p1 = toRotatedLocalPoint(x1, y1, centerX, centerY, rotRad)
  const p2 = toRotatedLocalPoint(x2, y2, centerX, centerY, rotRad)

  return isSegmentIntersectingRect(
    p1.x,
    p1.y,
    p2.x,
    p2.y,
    -rw / 2 - padding,
    -rh / 2 - padding,
    rw + padding * 2,
    rh + padding * 2,
  )
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

    if (
      isSegmentIntersectingRotatedRect(
        startX,
        startY,
        endX,
        endY,
        gimmick.position.x,
        gimmick.position.y,
        gimmick.size.width,
        gimmick.size.height,
        gimmick.rotationDeg ?? 0,
        padding,
      )
    ) {
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

    const rotationRad = ((gimmick.rotationDeg ?? 0) * Math.PI) / 180
    const rw = gimmick.size.width
    const rh = gimmick.size.height
    const halfW = rw / 2
    const halfH = rh / 2
    const centerX = gimmick.position.x + halfW
    const centerY = gimmick.position.y + halfH

    const localChar = toRotatedLocalPoint(char.x, char.y, centerX, centerY, rotationRad)
    const nearestX = Math.max(-halfW, Math.min(localChar.x, halfW))
    const nearestY = Math.max(-halfH, Math.min(localChar.y, halfH))
    let dx = localChar.x - nearestX
    let dy = localChar.y - nearestY
    let dist = Math.hypot(dx, dy)

    if (dist >= char.radius) {
      continue
    }

    if (dist === 0) {
      const toLeft = Math.abs(localChar.x + halfW)
      const toRight = Math.abs(halfW - localChar.x)
      const toTop = Math.abs(localChar.y + halfH)
      const toBottom = Math.abs(halfH - localChar.y)
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

    const nxLocal = dx / dist
    const nyLocal = dy / dist
    const normal = toWorldVector(nxLocal, nyLocal, rotationRad)
    const penetration = char.radius - dist

    char.x += normal.x * penetration
    char.y += normal.y * penetration

    const vn = char.vx * normal.x + char.vy * normal.y
    if (vn < 0) {
      // 壁に向かう速度成分だけ打ち消して貫通を防ぐ
      char.vx -= vn * normal.x
      char.vy -= vn * normal.y
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
    const rotDeg = gimmick.rotationDeg ?? 0

    // 円と矩形の衝突判定
    if (!isCircleCollidingRect(char.x, char.y, char.radius, rx, ry, rw, rh)) {
      continue
    }

    // 回転に応じた法線方向を計算
    const radians = (rotDeg * Math.PI) / 180
    const normalX = Math.sin(radians)
    const normalY = -Math.cos(radians)

    // バネの中心から見たプレイヤーへのベクトル
    const springCenterX = rx + rw / 2
    const springCenterY = ry + rh / 2
    const toCharX = char.x - springCenterX
    const toCharY = char.y - springCenterY

    // プレイヤーがバネの表面側にいるかチェック（法線方向への投影が正）
    const positionDot = toCharX * normalX + toCharY * normalY
    if (positionDot < 0) {
      continue
    }

    // プレイヤーの速度がバネに向かっているかチェック（法線の反対方向）
    const normalVelComponent = char.vx * normalX + char.vy * normalY
    if (normalVelComponent >= 0) {
      continue // 離れていく場合はスキップ
    }

    // プレイヤーをバネ表面（法線方向の外側）に押し出す
    const pushDistance = rh / 2 + char.radius + 1
    char.x = springCenterX + normalX * pushDistance
    char.y = springCenterY + normalY * pushDistance

    // 法線方向の入射速度を基準に、安定した反射速度を与える
    const incomingNormalSpeed = Math.abs(normalVelComponent)
    const minBounce = Math.max(60, gimmick.power * 0.22)
    const bounceVelComponent = Math.max(minBounce, incomingNormalSpeed * 1.15)
    char.vx = normalX * bounceVelComponent
    char.vy = normalY * bounceVelComponent
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
