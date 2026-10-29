import { create } from 'zustand'
import { socket } from '../socket'
import type {
  GameState, Player, RoundResult, GameMode,
  BetUpdatedPayload, PlayerAnsweredPayload,
  GladiatorHoveringPayload, GameOverPayload,
  BankBetUpdatedPayload, RoundResultsPayload,
  ChipStagedPayload,
  ItemId, ItemUsedPayload, GemResultPayload, MantaResultPayload,
  BribePromptPayload, BribeMsgPayload,
} from '@cumsino/shared'

export interface ItemFeedEntry { playerId: string; item: ItemId; targetId?: string; at: number }

export interface QuestionRating {
  questionId: string
  score: number | null
  difficulty: number | null
}

/** Отправить оценку, если что-то выбрано. Сервер принимает оценку только последнего посчитанного вопроса —
 *  он остаётся «оцениваемым» до конца следующего вопроса, так что отправка на ANNOUNCE успевает. */
function flushRating(r: QuestionRating | null) {
  if (r && (r.score !== null || r.difficulty !== null)) {
    socket.emit('rate_question', { questionId: r.questionId, score: r.score, difficulty: r.difficulty })
  }
}

interface GameStore {
  gameState: GameState | null
  myId: string | null
  roundResults: RoundResult[]
  roundCorrectAnswer: string | number | null
  roundComment: string | null
  roundOptionNotes: string[] | null
  roundMode: GameMode | null
  roundGladiatorId: string | null
  winner: Player | null
  answeredIds: Set<string>
  gladiatorHoverIndex: number | null
  pendingTarget: 'win' | 'lose' | null
  bankBets: Record<string, { optionIndex: number; amount: number }>
  stagedBets: Record<string, number[]>
  isLateJoiner: boolean
  bribePrompt: { amount: number; startedAt: number; cycleIndex: number } | null
  bribeEliminatedIdx: number | null
  /** Своя оценка вопроса раунда — живёт от раскрытия ответа до следующего раунда, отправляется один раз */
  rating: QuestionRating | null
  /** кто чем пользовался в этом раунде — для бирок над никами (свежие сверху) */
  itemFeed: ItemFeedEntry[]
  /** результаты своего гема: targetId → что выбрано у цели на момент взгляда */
  gemResults: Record<string, { answer: string | number | null; smoked: boolean }>
  /** на меня посмотрели гемом (сколько раз за раунд) */
  gemmedOnMe: number
  targeting: ItemId | null

  payBribe: () => void

  connect: (name: string, gameCode: string) => void
  setPendingTarget: (target: 'win' | 'lose' | null) => void
  submitAnswer: (answer: string | number | string[], blink?: boolean) => void
  buyItem: (item: ItemId) => void
  /** лавка: готов / передумал */
  shopReady: (ready: boolean) => void
  useItem: (item: ItemId, targetId?: string) => void
  /** выбор цели для гема / хекса: панель предметов включает, клик по игроку завершает, Esc — отмена */
  setTargeting: (item: ItemId | null) => void
  sendHover: (optionIndex: number | null) => void
  startGame: () => void
  /** «Кто ты» в лобби: человек из компании или null (пропустить) */
  identify: (friendId: number | null) => void
  /** Оценка вопроса раунда: score −2…+2 (без 0), difficulty −1 легко / +1 сложно; null — снять */
  rateQuestion: (questionId: string, vote: { score?: number | null; difficulty?: number | null }) => void
  /** Поменять свою оценку (повторный выбор того же значения снимает его) */
  setRating: (questionId: string, patch: { score?: number | null; difficulty?: number | null }) => void
  reset: () => void
}

export const useGameStore = create<GameStore>((set, get) => {
  // вкладку закрыли посреди итогов — оценка не должна пропасть
  window.addEventListener('pagehide', () => flushRating(get().rating))

  socket.on('connect', () => {
    set({ myId: socket.id ?? null })
  })

  socket.on('game_state', (state: GameState) => {
    const { rating, gameState: before } = get()
    const roundOver = state.phase === 'ANNOUNCE' || state.phase === 'GAME_OVER' || state.phase === 'LOBBY'
      || (before !== null && state.roundIndex !== before.roundIndex)
    if (rating && roundOver) {
      flushRating(rating)
      set({ rating: null })
    }
    set(prev => {
      const newRound =
        prev.gameState !== null && state.roundIndex !== prev.gameState.roundIndex
      const clearRound = state.phase === 'ANNOUNCE' || newRound
      const clearBribe = clearRound || state.phase !== 'QUESTION'
      const samePhase = !clearRound && prev.gameState?.phase === state.phase
      return {
        gameState: state,
        // «ответил» — с сервера (hasAnswered), а не сброс на каждый game_state: иначе вход / выход
        // другого игрока посреди вопроса снимал «Ответ принят» и делал варианты снова кликабельными
        answeredIds: new Set([
          ...state.players.filter(p => p.hasAnswered).map(p => p.id),
          ...(samePhase ? prev.answeredIds : []),
        ]),
        gladiatorHoverIndex: samePhase ? prev.gladiatorHoverIndex : null,
        roundResults: clearRound ? [] : prev.roundResults,
        roundCorrectAnswer: clearRound ? null : prev.roundCorrectAnswer,
        roundComment: clearRound ? null : prev.roundComment,
        roundOptionNotes: clearRound ? null : prev.roundOptionNotes,
        roundMode: clearRound ? null : prev.roundMode,
        roundGladiatorId: clearRound ? null : prev.roundGladiatorId,
        bankBets: clearRound ? {} : prev.bankBets,
        stagedBets: clearRound ? {} : prev.stagedBets,
        isLateJoiner: prev.gameState === null
          ? state.phase !== 'LOBBY'
          : state.phase === 'ANNOUNCE'
            ? false
            : prev.isLateJoiner,
        bribePrompt: clearBribe ? null : prev.bribePrompt,
        bribeEliminatedIdx: clearRound ? null : prev.bribeEliminatedIdx,
        itemFeed: clearRound ? [] : prev.itemFeed,
        gemResults: clearRound ? {} : prev.gemResults,
        gemmedOnMe: clearRound ? 0 : prev.gemmedOnMe,
        // цель выбирают в своей фазе (хекс — ставки, гем — вопрос): сменилась фаза — выбор снят
        targeting: prev.gameState?.phase === state.phase ? prev.targeting : null,
      }
    })
  })

  socket.on('bet_updated', ({ playerId, amount, target, chips }: BetUpdatedPayload) => {
    set(prev => {
      if (!prev.gameState) return prev
      const { [playerId]: _confirmed, ...stagedBets } = prev.stagedBets   // ставка подтверждена — черновик не нужен
      return {
        stagedBets,
        gameState: {
          ...prev.gameState,
          players: prev.gameState.players.map(p =>
            p.id === playerId
              ? { ...p, currentBet: amount, betChips: chips, ...(target ? { betTarget: target } : {}) }
              : p
          ),
        },
      }
    })
  })

  socket.on('player_answered', ({ playerId }: PlayerAnsweredPayload) => {
    set(s => ({ answeredIds: new Set([...s.answeredIds, playerId]) }))
  })

  socket.on('gladiator_hovering', ({ optionIndex }: GladiatorHoveringPayload) => {
    set({ gladiatorHoverIndex: optionIndex })
  })

  socket.on('round_results', ({ results, correctAnswer, correctNumericAnswer, comment, optionNotes, mode, gladiatorId }: RoundResultsPayload) => {
    set({
      roundResults: results,
      roundCorrectAnswer: correctAnswer ?? correctNumericAnswer ?? null,
      roundComment: comment ?? null,
      roundOptionNotes: optionNotes ?? null,
      roundMode: mode ?? null,
      roundGladiatorId: gladiatorId ?? null,
    })
  })

  socket.on('bank_bet_updated', ({ playerId, optionIndex, amount }: BankBetUpdatedPayload) => {
    set(prev => ({
      bankBets: { ...prev.bankBets, [playerId]: { optionIndex, amount } },
    }))
  })

  socket.on('chip_staged', ({ playerId, chips }: ChipStagedPayload) => {
    set(prev => ({ stagedBets: { ...prev.stagedBets, [playerId]: chips } }))
  })

  socket.on('bribe_prompt', ({ amount, cycleIndex }: BribePromptPayload) => {
    set({ bribePrompt: { amount, startedAt: Date.now(), cycleIndex } })
  })

  socket.on('bribe_prompt_cancel', () => {
    set({ bribePrompt: null })
  })

  socket.on('bribe_msg', ({ eliminatedOptionIndex }: BribeMsgPayload) => {
    if (eliminatedOptionIndex !== undefined) {
      set({ bribeEliminatedIdx: eliminatedOptionIndex })
    }
  })

  socket.on('item_used', ({ playerId, item, targetId, onYou }: ItemUsedPayload) => {
    set(prev => ({
      itemFeed: [{ playerId, item, targetId, at: Date.now() }, ...prev.itemFeed].slice(0, 30),
      gemmedOnMe: onYou ? prev.gemmedOnMe + 1 : prev.gemmedOnMe,
    }))
  })

  socket.on('gem_result', ({ targetId, answer, smoked }: GemResultPayload) => {
    set(prev => ({ gemResults: { ...prev.gemResults, [targetId]: { answer, smoked } } }))
  })

  // убранный мантой вариант придёт и в game_state (removedOptions) — событие только чтобы не ждать стейта
  socket.on('manta_result', ({ optionIndex }: MantaResultPayload) => {
    set(prev => prev.gameState ? {
      gameState: {
        ...prev.gameState,
        removedOptions: [...new Set([...(prev.gameState.removedOptions ?? []), optionIndex])],
      },
    } : prev)
  })

  socket.on('game_over', ({ winner }: GameOverPayload) => {
    set({ winner })
  })

  return {
    gameState: null,
    myId: null,
    roundResults: [],
    roundCorrectAnswer: null,
    roundComment: null,
    roundOptionNotes: null,
    roundMode: null,
    roundGladiatorId: null,
    winner: null,
    answeredIds: new Set(),
    gladiatorHoverIndex: null,
    pendingTarget: null,
    bankBets: {},
    stagedBets: {},
    isLateJoiner: false,
    bribePrompt: null,
    bribeEliminatedIdx: null,
    rating: null,
    itemFeed: [],
    gemResults: {},
    gemmedOnMe: 0,
    targeting: null,

    connect(name, gameCode) {
      if (!socket.connected) socket.connect()
      socket.emit('join_game', { name, gameCode })
    },

    setPendingTarget(target) {
      set({ pendingTarget: target })
    },

    submitAnswer(answer, blink) {
      socket.emit('submit_answer', blink ? { answer, blink: true } : { answer })
    },

    buyItem(item) {
      socket.emit('buy_item', { item })
    },

    shopReady(ready) {
      socket.emit('shop_ready', { ready })
    },

    useItem(item, targetId) {
      socket.emit('use_item', targetId ? { item, targetId } : { item })
      set({ targeting: null })
    },

    setTargeting(item) {
      set({ targeting: item })
    },

    sendHover(optionIndex) {
      socket.emit('gladiator_hover', { optionIndex })
    },

    startGame() {
      socket.emit('start_game')
    },

    identify(friendId) {
      socket.emit('identify', { friendId })
    },

    rateQuestion(questionId, vote) {
      socket.emit('rate_question', { questionId, ...vote })
    },

    setRating(questionId, patch) {
      set(prev => {
        const cur = prev.rating?.questionId === questionId
          ? prev.rating
          : { questionId, score: null, difficulty: null }
        const next = { ...cur }
        if (patch.score !== undefined) next.score = cur.score === patch.score ? null : patch.score
        if (patch.difficulty !== undefined) next.difficulty = cur.difficulty === patch.difficulty ? null : patch.difficulty
        return { rating: next }
      })
    },

    reset() {
      set({
        gameState: null,
        myId: null,
        roundResults: [],
        roundCorrectAnswer: null,
        roundComment: null,
        roundOptionNotes: null,
        roundMode: null,
        roundGladiatorId: null,
        winner: null,
        answeredIds: new Set(),
        gladiatorHoverIndex: null,
        pendingTarget: null,
        bankBets: {},
        stagedBets: {},
        isLateJoiner: false,
        bribePrompt: null,
        bribeEliminatedIdx: null,
        rating: null,
        itemFeed: [],
        gemResults: {},
        gemmedOnMe: 0,
        targeting: null,
      })
      socket.disconnect()
    },

    payBribe() {
      socket.emit('pay_bribe')
      set({ bribePrompt: null })
    },
  }
})

export const selectMe = (s: GameStore): Player | undefined =>
  s.gameState?.players.find(p => p.id === s.myId)

export const selectIsGladiator = (s: GameStore): boolean =>
  s.myId !== null && s.gameState?.gladiatorId === s.myId
