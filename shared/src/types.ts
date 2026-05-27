// shared/src/types.ts

export type GamePhase =
  | 'LOBBY'
  | 'ANNOUNCE'
  | 'BETTING'
  | 'QUESTION_TEXT'
  | 'QUESTION'
  | 'REVEAL'
  | 'LEADERBOARD'
  | 'GAME_OVER'

export type GameMode = 'all' | 'kerri' | 'closest' | 'top5'
export type MainMode = 'all' | 'kerri'

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
  items?: string[]
  orderedItems?: string[]
}

export interface GameState {
  id: string
  phase: GamePhase
  roundIndex: number
  lastMainMode: MainMode
  mode: GameMode
  currentQuestion: Omit<Question, 'answer' | 'numericAnswer' | 'orderedItems'> | null
  gladiatorId?: string
  gladiatorAnswer?: string
  hostId: string
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
export interface PlaceBankBetPayload { optionIndex: number; amount: number }
export interface SubmitAnswerPayload { answer: string | number | string[] }
export interface GladiatorHoverPayload { optionIndex: number | null }

// Socket event payloads — Server → Client
export interface PhaseChangedPayload { phase: GamePhase; timeLeft: number }
export interface BetUpdatedPayload { playerId: string; amount: number; target?: 'win' | 'lose' }
export interface BankBetUpdatedPayload { playerId: string; optionIndex: number; amount: number }
export interface PlayerAnsweredPayload { playerId: string }
export interface GladiatorHoveringPayload { optionIndex: number | null }
export interface RoundResultsPayload {
  results: RoundResult[]
  correctAnswer?: string | null
  correctNumericAnswer?: number | null
  mode?: GameMode
  gladiatorId?: string
}
export interface GameOverPayload { winner: Player }
