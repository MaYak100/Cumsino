// shared/src/types.ts

export type GamePhase =
  | 'LOBBY'
  | 'ANNOUNCE'        // тема раунда, ~5 сек
  | 'BETTING'         // ставки фишками, ~30 сек
  | 'QUESTION_TEXT'   // вопрос без вариантов, ~5 сек
  | 'QUESTION'        // вопрос + варианты ответа, ~40 сек
  | 'REVEAL'          // итоги раунда, ~8 сек
  | 'LEADERBOARD'     // таблица лидеров, ~5 сек
  | 'GAME_OVER'

export type GameMode = 'all' | 'gladiator' | 'closest' | 'top5'

export type MainMode = 'all' | 'gladiator'

export interface ChipBreakdown {
  500: number
  100: number
  50: number
  20: number
  10: number
}

export interface Player {
  id: string
  name: string
  chips: number
  currentBet: number
  betTarget?: 'win' | 'lose'
  answer?: string | number | string[]
  hasAnswered: boolean
}

export interface Question {
  id: string
  mode: GameMode
  topic: string
  text: string
  options?: string[]
  answer?: string
  numericAnswer?: number
  items?: string[]         // для ТОП 5: перемешанный порядок, показывается игроку
  orderedItems?: string[]  // для ТОП 5: правильный порядок, только на сервере
}

export interface GameState {
  id: string
  phase: GamePhase
  roundIndex: number
  lastMainMode: MainMode
  mode: GameMode
  currentQuestion: Omit<Question, 'answer' | 'numericAnswer' | 'orderedItems'> | null
  gladiatorId?: string
  gladiatorAnswer?: string // правильный ответ — отправляется ТОЛЬКО толпе (не гладиатору) во время BETTING
  players: Player[]
  phaseTimeLeft: number
}

export interface RoundResult {
  playerId: string
  delta: number
  chipBreakdown: ChipBreakdown
}

// Socket event payloads — Client → Server
export interface JoinGamePayload { name: string; gameCode: string }
export interface PlaceBetPayload { amount: number; target?: 'win' | 'lose' }
export interface SubmitAnswerPayload { answer: string | number | string[] }
export interface GladiatorHoverPayload { optionIndex: number | null }

// Socket event payloads — Server → Client
export interface PhaseChangedPayload { phase: GamePhase; timeLeft: number }
export interface BetUpdatedPayload { playerId: string; amount: number; target?: 'win' | 'lose' }
export interface PlayerAnsweredPayload { playerId: string }
export interface GladiatorHoveringPayload { optionIndex: number | null }
export interface RoundResultsPayload { results: RoundResult[] }
export interface GameOverPayload { winner: Player }
