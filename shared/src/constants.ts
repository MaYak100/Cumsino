// shared/src/constants.ts
import type { GamePhase } from './types'
export const STARTING_CHIPS = 500
export const WIN_CHIPS = 3000
/** Керри и «кто ближе» дорожают с ходом игры: n-й раунд режима (с 1) — база + шаг × (n − 1) */
export const GLADIATOR_BONUS = 300
export const GLADIATOR_BONUS_STEP = 50
export const CLOSEST_WINNER_BONUS = 200
export const CLOSEST_WINNER_BONUS_STEP = 40
/** точное попадание в «кто ближе» — сверху, не растёт */
export const CLOSEST_EXACT_BONUS = 200
export const gladiatorBonus = (n: number) => GLADIATOR_BONUS + GLADIATOR_BONUS_STEP * Math.max(0, n - 1)
export const closestWinnerBonus = (n: number) => CLOSEST_WINNER_BONUS + CLOSEST_WINNER_BONUS_STEP * Math.max(0, n - 1)
/** «подачка»: на итогах у игрока $0 — получает столько */
export const PITY_CHIPS = 50
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

/** «Ставка на вопрос» (настройка хоста, только режим «для всех»): на ставках виден текст вопроса без вариантов —
 *  ставки короче, вопрос короче (варианты читать быстро, сам вопрос прочитан на ставках). Выключено — PHASE_DURATIONS. */
export const QUESTION_BET_BETTING = 20
export const QUESTION_BET_QUESTION = 15

/** Джекпот (настройка хоста, «для всех», ставят ≥ 2): «все угадали» — каждому угадавшему от казино
 *  $50 + $10 × (n − 1), n — номер раунда «для всех» в игре (с 1) */
export const JACKPOT_ALL_CORRECT = 50
export const JACKPOT_ALL_CORRECT_STEP = 10
export const allCorrectBonus = (n: number) => JACKPOT_ALL_CORRECT + JACKPOT_ALL_CORRECT_STEP * Math.max(0, n - 1)
/** джекпот срабатывает, только если в раунде ставят (ставка > 0) не меньше стольких */
export const JACKPOT_MIN_BETTORS = 2

/** Первая лавка (после первого «кто ближе», когда предметы видят впервые) — на столько секунд дольше */
export const FIRST_SHOP_EXTRA = 20
