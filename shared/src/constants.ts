// shared/src/constants.ts
import type { GamePhase } from './types'
export const STARTING_CHIPS = 500
export const WIN_CHIPS = 3000
export const GLADIATOR_BONUS = 300
export const CLOSEST_WINNER_BONUS = 200
export const CLOSEST_EXACT_BONUS = 200
export const TOP5_SLOT_BONUS = 20
export const TOP5_PERFECT_BONUS = 150

export const PHASE_DURATIONS: Partial<Record<GamePhase, number>> = {
  ANNOUNCE: 9,
  BETTING: 30,
  QUESTION: 45,
  REVEAL: 14,
}

export const SPECIAL_MODE_CHANCE = 0.3
