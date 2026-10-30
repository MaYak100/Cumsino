// shared/src/constants.ts
import type { GamePhase } from './types'
export const STARTING_CHIPS = 500
export const WIN_CHIPS = 3000
export const GLADIATOR_BONUS = 300
export const CLOSEST_WINNER_BONUS = 200
export const CLOSEST_EXACT_BONUS = 200
/** игроков в комнате не больше; лишнему — join_error 'room_full' */
export const MAX_PLAYERS = 8
/** самая мелкая фишка: ставки кратны ей, с балансом меньше — ставить нечем */
export const MIN_CHIP = 10

export const PHASE_DURATIONS: Partial<Record<GamePhase, number>> = {
  /** лавка перед каждым раундом «для всех»; все нажали «Готов» — закрывается раньше */
  SHOP: 25,
  ANNOUNCE: 9,
  BETTING: 30,
  QUESTION: 45,
  REVEAL: 14,
}
/** анонс режима, который в этой игре ещё не встречался, — на столько секунд дольше */
export const NEW_MODE_ANNOUNCE_EXTRA = 3

// Сколько фаза QUESTION показывает правильный ответ до REVEAL; с подписями значений вариантов — дольше
export const ANSWER_REVEAL_MS = 5500
export const ANSWER_REVEAL_NOTES_MS = 7500

// Взятка (аукцион за подсказку керри в kerri) выключена до переделки: работала криво (2026-10-28)
export const BRIBE_ENABLED = false

/** Первая лавка (после первого «кто ближе», когда предметы видят впервые) — на столько секунд дольше */
export const FIRST_SHOP_EXTRA = 20
