import type { StageData, StageGimmickKind } from '@shared/types'

export type AlphaMask = {
  data: Uint8Array
  width: number
  height: number
}

export interface CharState {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

export type CollisionResult = 'none' | 'goal' | 'spike'

export interface SwipeState {
  points: { x: number; y: number }[]
  startTime: number
}

export interface WindLine {
  points: { x: number; y: number }[]
  endTime: number
  fx: number
  fy: number
  remainingSteps: number
  decay: number
  totalWeight: number
}

export type GimmickImageMap = Partial<Record<StageGimmickKind, HTMLImageElement>>

export type PickedItem = {
  kind: string
  stageX: number
  stageY: number
  rotationDeg: number
}

export interface UseKAPLAYProps {
  initialStageData?: StageData
  mode: 'play' | 'edit' | 'test'
  onGameEnd?: (isCleared: boolean) => void
  onStageDataChange?: () => void
}

export interface MockKaplayInstance {
  destroy: () => void
}
