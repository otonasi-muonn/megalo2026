import type { Size2D, Vector2 } from '@shared/types'

export const FAN_DEFAULT_SIZE: Size2D = { width: 240, height: 240 }

const GOAL_UNPLACED_COORD = -9999
const GOAL_PLACED_MIN_X = -9000

export const isGoalPlaced = (position: Vector2): boolean =>
  position.x > GOAL_PLACED_MIN_X

export const createUnplacedGoalPosition = (): Vector2 => ({
  x: GOAL_UNPLACED_COORD,
  y: GOAL_UNPLACED_COORD,
})
