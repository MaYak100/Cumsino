// shared/src/types.ts
import type { ItemId } from './items'

export type GamePhase =
  | 'LOBBY'
  | 'SHOP'
  | 'ANNOUNCE'
  | 'BETTING'
  | 'QUESTION'
  | 'REVEAL'
  | 'GAME_OVER'

export type GameMode = 'all' | 'kerri' | 'closest'
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
  /** верных раундов подряд (docs/items.md) */
  streak?: number
  /** минимальная ставка этого раунда («для всех» и толпа керри): 5% баланса, у единственного лидера — 10% */
  blind?: number
  bigBlind?: boolean
  /** в лавке нажал «Готов» */
  shopReady?: boolean
  /** видимые всем эффекты этого раунда: bkb, hex (на нём), smoke; aegis — есть аегис (держится до срабатывания) */
  effects?: PublicEffect[]
  /** вошёл посреди раунда: до следующего раунда только смотрит (не ставит, не отвечает, не цель предметов, не
   *  керри, его не ждут). Нет поля — участник. */
  spectator?: boolean
  /** бот для соло-тестов (add_bot в лобби): играет сам, в оценках и «кто ты» не участвует */
  bot?: true
}

export type PublicEffect = 'bkb' | 'hex' | 'smoke' | 'aegis'

export interface FriendProfile { id: number; name: string }

export interface Question {
  id: string
  mode: GameMode
  topic: string
  /** Тема: субъект и аспект через перенос строки («Lion\nспособности», «Heart of Tarrasque») — shared/src/topic.ts.
   *  topic — заголовок подкатегории (для /dev и логов). */
  displayTopic?: string
  comment?: string
  text: string
  options?: string[]
  /** Истинные значения вариантов («610», «64%», «+2.4») — по индексу options, до ~6 символов.
   *  Как answer и comment, уходят клиентам только в round_results. */
  optionNotes?: string[]
  answer?: string
  numericAnswer?: number
  /** Единица числового вопроса («%», «сек.», «золота»). В MC уже вписана в варианты, в «ближе всех» —
   *  подпись у поля ввода и у правильного ответа (withUnit). */
  unit?: string
  /** id категории и подкатегории (server/src/game/questions/categories.ts) — для оценок и статистики */
  category?: string
  subcategory?: string
}

export interface GameState {
  id: string
  phase: GamePhase
  roundIndex: number
  mode: GameMode
  /** Вопрос раунда без ответа. id здесь — непрозрачный ключ раунда («r3-k8f2…»), а не id вопроса из банка: настоящий
   *  id (у статистики в нём ответ) приходит только в round_results (questionId). */
  currentQuestion: Omit<Question, 'answer' | 'numericAnswer' | 'comment' | 'optionNotes'> | null
  gladiatorId?: string
  gladiatorAnswer?: string
  hostId: string
  players: Player[]
  phaseTimeLeft: number
  /** кем можно назваться в лобби (компания из вопросов про друзей) */
  friendRoster?: FriendProfile[]
  // ── личное (только в getStateForPlayer для самого игрока) ──
  /** свой запас предметов */
  inventory?: Partial<Record<ItemId, number>>
  /** свои цены сейчас (зависят от баланса) */
  prices?: Record<ItemId, number>
  /** аегис уже покупался в этой игре */
  aegisBought?: boolean
  /** на тебе хекс: сколько секунд осталось на ответ (в QUESTION) */
  hexTimeLeft?: number
  /** варианты, убранные мантой (индексы options) */
  removedOptions?: number[]
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
/** blink — сменить уже отправленный ответ (тратит блинк) */
export interface SubmitAnswerPayload { answer: string | number | string[]; blink?: boolean }
export interface BuyItemPayload { item: ItemId }
export interface UseItemPayload { item: ItemId; targetId?: string }
/** лавка: готов / передумал */
export interface ShopReadyPayload { ready: boolean }
export interface GladiatorHoverPayload { optionIndex: number | null }
export interface IdentifyPayload { friendId: number | null }
/** add_bot — без данных (хост, лобби); remove_bot — убрать бота по id (хост, лобби) */
export interface RemoveBotPayload { id: string }
/** score: −2 удалить (в архив навсегда), −1 слабый, +1 хороший, +2 ахуенный; difficulty: −1 легко, +1 сложно.
 *  null — снять отметку; поле не передано — не менять. questionId — настоящий id (round_results.questionId) или ключ
 *  раунда (currentQuestion.id): сервер оценивает только последний посчитанный вопрос комнаты. */
export interface RateQuestionPayload { questionId: string; score?: number | null; difficulty?: number | null }

// Socket event payloads — Server → Client
/** отказ во входе (join_game): комната полна, сервер полон, пустое имя, плохой код. message — готовый текст */
export interface JoinErrorPayload {
  reason: 'room_full' | 'server_full' | 'bad_name' | 'bad_code'
  message: string
}
export interface BetUpdatedPayload { playerId: string; amount: number; target?: 'win' | 'lose'; chips?: number[] }
/** банк-ставка толпы — только толпе керри (не самому керри и не зрителям) */
export interface BankBetUpdatedPayload { playerId: string; optionIndex: number; amount: number }
export interface PlayerAnsweredPayload { playerId: string }
export interface GladiatorHoveringPayload { optionIndex: number | null }
export interface RoundResultsPayload {
  results: RoundResult[]
  /** настоящий id вопроса (до расчёта не виден) и ключ раунда (= currentQuestion.id) */
  questionId?: string | null
  questionKey?: string | null
  correctAnswer?: string | null
  correctNumericAnswer?: number | null
  comment?: string | null
  optionNotes?: string[] | null
  mode?: GameMode
  gladiatorId?: string
}
/** winner — публичная проекция игрока (как в game_state) */
export interface GameOverPayload { winner: Player }
/** кто-то применил предмет. targetId — только у хекса (всем) и у гема (только самой цели: onYou) */
export interface ItemUsedPayload { playerId: string; item: ItemId; targetId?: string; onYou?: boolean }
/** результат гема — только тому, кто смотрел: выбранный сейчас ответ цели (null — ещё не ответил), smoked — цель в смоке */
export interface GemResultPayload { targetId: string; answer: string | number | null; smoked: boolean }
export interface MantaResultPayload { optionIndex: number }
export interface ChipStagedPayload { playerId: string; chips: number[] }

export interface BribePromptPayload { amount: number; cycleIndex: number }
export interface BribeMsgPayload {
  type: 'helping' | 'betrayed' | 'helped'
  eliminatedOptionIndex?: number
}
