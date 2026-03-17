export const STAGE_SCHEMA_VERSION = '1.0.0' as const

export type StageSchemaVersion = typeof STAGE_SCHEMA_VERSION

export interface Vector2 {
  x: number
  y: number
}

export interface Size2D {
  width: number
  height: number
}

export interface StageWorld {
  width: number
  height: number
  gridSize: number
}

export interface StagePhysics {
  gravity: Vector2
  airDrag: number
  windDecay: number
  windForceScale: number
}

export interface StageSpawnPoint {
  position: Vector2
}

export interface StageGoalArea {
  position: Vector2
  size: Size2D
}

export type StageGimmickKind = 'spike' | 'spring' | 'fan' | 'wave' | 'wall'

interface StageGimmickBase<TKind extends StageGimmickKind> {
  id: string
  kind: TKind
  position: Vector2
  rotationDeg?: number
}

export interface SpikeGimmick extends StageGimmickBase<'spike'> {
  size: Size2D
  damage: number
}

export interface SpringGimmick extends StageGimmickBase<'spring'> {
  size: Size2D
  power: number
  cooldownMs?: number
}

export interface FanGimmick extends StageGimmickBase<'fan'> {
  force: number
  range: number
  direction: Vector2
}

export interface WaveGimmick extends StageGimmickBase<'wave'> {
  length: number
  amplitude: number
  frequency: number
  speed: number
}

export interface WallGimmick extends StageGimmickBase<'wall'> {
  size: Size2D
  friction?: number
  restitution?: number
}

export type StageGimmick =
  | SpikeGimmick
  | SpringGimmick
  | FanGimmick
  | WaveGimmick
  | WallGimmick

export interface StageData {
  version: StageSchemaVersion
  world: StageWorld
  physics: StagePhysics
  spawn: StageSpawnPoint
  goal: StageGoalArea
  gimmicks: StageGimmick[]
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isVector2 = (value: unknown): value is Vector2 => {
  if (!isObject(value)) {
    return false
  }

  return isFiniteNumber(value.x) && isFiniteNumber(value.y)
}

const isSize2D = (value: unknown): value is Size2D => {
  if (!isObject(value)) {
    return false
  }

  return isFiniteNumber(value.width) && isFiniteNumber(value.height)
}

const isStageGimmickKind = (value: unknown): value is StageGimmickKind =>
  value === 'spike' ||
  value === 'spring' ||
  value === 'fan' ||
  value === 'wave' ||
  value === 'wall'

const isStageGimmick = (value: unknown): value is StageGimmick => {
  if (!isObject(value) || !isStageGimmickKind(value.kind)) {
    return false
  }

  if (typeof value.id !== 'string' || !isVector2(value.position)) {
    return false
  }

  switch (value.kind) {
    case 'spike':
      return isSize2D(value.size) && isFiniteNumber(value.damage)
    case 'spring':
      return (
        isSize2D(value.size) &&
        isFiniteNumber(value.power) &&
        (value.cooldownMs === undefined || isFiniteNumber(value.cooldownMs))
      )
    case 'fan':
      return (
        isFiniteNumber(value.force) &&
        isFiniteNumber(value.range) &&
        isVector2(value.direction)
      )
    case 'wave':
      return (
        isFiniteNumber(value.length) &&
        isFiniteNumber(value.amplitude) &&
        isFiniteNumber(value.frequency) &&
        isFiniteNumber(value.speed)
      )
    case 'wall':
      return (
        isSize2D(value.size) &&
        (value.friction === undefined || isFiniteNumber(value.friction)) &&
        (value.restitution === undefined || isFiniteNumber(value.restitution))
      )
    default:
      return false
  }
}

export const isStageData = (value: unknown): value is StageData => {
  if (!isObject(value)) {
    return false
  }

  const gimmicks = value.gimmicks

  return (
    value.version === STAGE_SCHEMA_VERSION &&
    isObject(value.world) &&
    isFiniteNumber(value.world.width) &&
    isFiniteNumber(value.world.height) &&
    isFiniteNumber(value.world.gridSize) &&
    isObject(value.physics) &&
    isVector2(value.physics.gravity) &&
    isFiniteNumber(value.physics.airDrag) &&
    isFiniteNumber(value.physics.windDecay) &&
    isFiniteNumber(value.physics.windForceScale) &&
    isObject(value.spawn) &&
    isVector2(value.spawn.position) &&
    isObject(value.goal) &&
    isVector2(value.goal.position) &&
    isSize2D(value.goal.size) &&
    Array.isArray(gimmicks) &&
    gimmicks.every(isStageGimmick)
  )
}

export const createEmptyStageData = (): StageData => ({
  version: STAGE_SCHEMA_VERSION,
  world: {
    width: 1920,
    height: 1080,
    gridSize: 16,
  },
  physics: {
    gravity: { x: 0, y: 9.8 },
    airDrag: 0.012,             // 空気抵抗を下げてスワイプの効きを良くする
    windDecay: 0.08,            // 風の減衰率（1フレームあたり8%減、2秒程度で消える）
    windForceScale: 1,
  },
  spawn: {
    position: { x: 120, y: 120 },
  },
  goal: {
    position: { x: 1720, y: 920 },
    size: { width: 100, height: 100 },
  },
  gimmicks: [],
})
