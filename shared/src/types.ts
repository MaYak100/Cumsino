// shared/src/types.ts

export type GamePhase =
  | 'LOBBY'
  | 'ANNOUNCE'
  | 'BETTING'
  | 'QUESTION'
  | 'REVEAL'
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
  /** номиналы фишек на сукне в порядке выкладки (как в черновике stage_chip); у толпы керри — основная ставка,
   *  затем банк-ставка, т. е. сумма может быть больше currentBet */
  betChips?: number[]
  answer?: string | number | string[]
  hasAnswered: boolean
  /** account id человека из компании, которым игрок назвался в лобби («кто ты»); нет — пропустил */
  friendId?: number
}

export interface FriendProfile { id: number; name: string }

export interface Question {
  id: string
  mode: GameMode
  topic: string
  displayTopic?: string
  comment?: string
  text: string
  options?: string[]
  /** Истинные значения вариантов («610», «64%», «+2.4») — по индексу options, до ~6 символов.
   *  Как answer и comment, уходят клиентам только в round_results. */
  optionNotes?: string[]
  answer?: string
  numericAnswer?: number
  items?: string[]
  orderedItems?: string[]
  /** id категории и подкатегории (server/src/game/questions/categories.ts) — для оценок и статистики */
  category?: string
  subcategory?: string
}

export interface GameState {
  id: string
  phase: GamePhase
  roundIndex: number
  lastMainMode: MainMode
  mode: GameMode
  currentQuestion: Omit<Question, 'answer' | 'numericAnswer' | 'orderedItems' | 'comment' | 'optionNotes'> | null
  gladiatorId?: string
  gladiatorAnswer?: string
  hostId: string
  players: Player[]
  phaseTimeLeft: number
  /** кем можно назваться в лобби (компания из вопросов про друзей) */
  friendRoster?: FriendProfile[]
}

export interface RoundResult {
  playerId: string
  delta: number
  chipBreakdown: ChipBreakdown
  sources?: Array<{ label: string; delta: number }>
}

// Socket event payloads — Client → Server
export interface JoinGamePayload { name: string; gameCode: string }
/** chips — все фишки игрока на сукне (с банк-ставкой: сначала основная, потом банк) — сервер хранит их в betChips */
export interface PlaceBetPayload { amount: number; target?: 'win' | 'lose'; chips?: number[]; bankBet?: { optionIndex: number; amount: number } }
export interface PlaceBankBetPayload { optionIndex: number; amount: number }
export interface SubmitAnswerPayload { answer: string | number | string[] }
export interface GladiatorHoverPayload { optionIndex: number | null }
export interface IdentifyPayload { friendId: number | null }
/** score: −2 удалить (в архив навсегда), −1 слабый, +1 хороший, +2 ахуенный; difficulty: −1 легко, +1 сложно.
 *  null — снять отметку; поле не передано — не менять. */
export interface RateQuestionPayload { questionId: string; score?: number | null; difficulty?: number | null }

// Socket event payloads — Server → Client
export interface PhaseChangedPayload { phase: GamePhase; timeLeft: number }
export interface BetUpdatedPayload { playerId: string; amount: number; target?: 'win' | 'lose'; chips?: number[] }
export interface BankBetUpdatedPayload { playerId: string; optionIndex: number; amount: number }
export interface PlayerAnsweredPayload { playerId: string }
export interface GladiatorHoveringPayload { optionIndex: number | null }
export interface RoundResultsPayload {
  results: RoundResult[]
  correctAnswer?: string | null
  correctNumericAnswer?: number | null
  comment?: string | null
  optionNotes?: string[] | null
  mode?: GameMode
  gladiatorId?: string
}
export interface GameOverPayload { winner: Player }
export interface ChipStagedPayload { playerId: string; chips: number[] }

export interface BribePromptPayload { amount: number; cycleIndex: number }
export interface BribePromptCancelPayload { dummy?: never }
export interface BribeMsgPayload {
  type: 'helping' | 'betrayed' | 'helped'
  eliminatedOptionIndex?: number
}
