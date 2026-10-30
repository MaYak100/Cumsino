import { create } from 'zustand'
import { socket } from '../socket'
import type {
  GameState, Player, RoundResult,
  BetUpdatedPayload, PlayerAnsweredPayload,
  GladiatorHoveringPayload, GameOverPayload,
  BankBetUpdatedPayload, RoundResultsPayload,
  ChipStagedPayload,
  ItemId, ItemUsedPayload, GemResultPayload, MantaResultPayload,
  BribePromptPayload, BribeMsgPayload, JoinErrorPayload,
} from '@cumsino/shared'

export interface ItemFeedEntry { playerId: string; item: ItemId; targetId?: string; at: number }

export interface QuestionRating {
  questionId: string
  score: number | null
  difficulty: number | null
}

/** Оценка уходит на сервер при каждом изменении — через RATING_DEBOUNCE_MS после последнего нажатия (перещёлкал
 *  шкалу — одна отправка). Голос целиком: null — снято (сервер заменяет прошлый голос). Сервер принимает оценку
 *  только последнего посчитанного вопроса — он «оцениваемый» до конца следующего вопроса, поэтому отложенная
 *  отправка досылается сразу на смене раунда и при закрытии вкладки. */
const RATING_DEBOUNCE_MS = 800
let ratingTimer: ReturnType<typeof setTimeout> | null = null
let ratingPending: QuestionRating | null = null
/** ключ раунда (currentQuestion.id — до расчёта сервер не говорит настоящий id) → настоящий id из round_results */
const realQuestionIds = new Map<string, string>()
const realId = (questionId: string) => realQuestionIds.get(questionId) ?? questionId

function sendRatingNow() {
  if (ratingTimer) clearTimeout(ratingTimer)
  ratingTimer = null
  const r = ratingPending
  ratingPending = null
  if (r) socket.emit('rate_question', { questionId: realId(r.questionId), score: r.score, difficulty: r.difficulty })
}

function scheduleRating(r: QuestionRating) {
  if (ratingPending && ratingPending.questionId !== r.questionId) sendRatingNow()
  ratingPending = r
  if (ratingTimer) clearTimeout(ratingTimer)
  ratingTimer = setTimeout(sendRatingNow, RATING_DEBOUNCE_MS)
}

interface GameStore {
  gameState: GameState | null
  myId: string | null
  roundResults: RoundResult[]
  roundCorrectAnswer: string | number | null
  roundComment: string | null
  roundOptionNotes: string[] | null
  /** настоящий id вопроса раунда — приходит в round_results (в game_state currentQuestion.id — ключ раунда) */
  roundQuestionId: string | null
  winner: Player | null
  answeredIds: Set<string>
  gladiatorHoverIndex: number | null
  /** банк-ставки толпы керри (сервер шлёт их только толпе — керри и зрители их не получают) */
  bankBets: Record<string, { optionIndex: number; amount: number }>
  stagedBets: Record<string, number[]>
  /** я зритель этого раунда (вошёл посреди раунда) — по серверному Player.spectator */
  isLateJoiner: boolean
  /** отказ во входе (join_error): комната полна, сервер полон, пустое имя, плохой код; null — нет. Снимается
   *  новой попыткой входа (connect) и reset */
  joinError: JoinErrorPayload | null
  bribePrompt: { amount: number; startedAt: number; cycleIndex: number } | null
  bribeEliminatedIdx: number | null
  /** Своя оценка вопроса раунда — живёт от раскрытия ответа до следующего раунда; каждое изменение уходит на
   *  сервер (с debounce) */
  rating: QuestionRating | null
  /** сам подтвердил ставку в этом раунде (иначе bet_updated за меня — это принудительный блайнд) */
  betSent: boolean
  /** короткая наклейка поверх экрана («Поставили на ответит») */
  notice: { text: string; at: number } | null
  /** кто чем пользовался в этом раунде — для бирок над никами (свежие сверху) */
  itemFeed: ItemFeedEntry[]
  /** результаты своего гема: targetId → что выбрано у цели на момент взгляда */
  gemResults: Record<string, { answer: string | number | null; smoked: boolean }>
  /** на меня посмотрели гемом (сколько раз за раунд) */
  gemmedOnMe: number
  targeting: ItemId | null

  payBribe: () => void

  connect: (name: string, gameCode: string) => void
  submitAnswer: (answer: string | number | string[], blink?: boolean) => void
  buyItem: (item: ItemId) => void
  /** лавка: готов / передумал */
  shopReady: (ready: boolean) => void
  useItem: (item: ItemId, targetId?: string) => void
  /** выбор цели для гема / хекса: панель предметов включает, клик по игроку завершает, Esc — отмена */
  setTargeting: (item: ItemId | null) => void
  markBetSent: () => void
  sendHover: (optionIndex: number | null) => void
  startGame: () => void
  /** Боты для соло-тестов: только хост в лобби; сервер отвечает game_state (Player.bot) */
  addBot: () => void
  removeBot: (id: string) => void
  /** «Играем впервые» (хост, лобби): предметы в лавке открываются по два */
  setFirstGame: (on: boolean) => void
  /** «Кто ты» в лобби: человек из компании или null (пропустить) */
  identify: (friendId: number | null) => void
  /** Оценка вопроса раунда: score −2…+2 (без 0), difficulty −1 легко / +1 сложно; null — снять */
  /** Поменять свою оценку (повторный выбор того же значения снимает его) */
  setRating: (questionId: string, patch: { score?: number | null; difficulty?: number | null }) => void
  reset: () => void
}

/** куда входили — для повторного входа после обрыва связи */
let joined: { name: string; gameCode: string } | null = null

export const useGameStore = create<GameStore>((set, get) => {
  // вкладку закрыли посреди итогов — отложенная оценка уходит сразу
  window.addEventListener('pagehide', sendRatingNow)

  socket.on('connect', () => {
    set({ myId: socket.id ?? null })
  })

  // Обрыв связи: сервер уже убрал старый сокет из комнаты, новый сокет — новый игрок. Без повторного join экран
  // замирает на старом стейте (мой id сменился, событий нет). Входим заново тем же именем в ту же комнату;
  // первый стейт после этого — как при первом входе (посреди раунда — зритель до следующего раунда).
  socket.io.on('reconnect', () => {
    if (!joined) return
    socket.emit('join_game', joined)
  })

  socket.on('join_error', (err: JoinErrorPayload) => {
    set({ joinError: err })
  })

  socket.on('game_state', (state: GameState) => {
    const { rating, gameState: before } = get()
    const roundOver = state.phase === 'ANNOUNCE' || state.phase === 'GAME_OVER' || state.phase === 'LOBBY'
      || (before !== null && state.roundIndex !== before.roundIndex)
    if (roundOver) sendRatingNow()
    if (rating && roundOver) set({ rating: null })
    // зритель — пока сервер так считает (до следующего раунда), а не по фазе первого стейта
    const me = state.players.find(p => p.id === socket.id)
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
        roundQuestionId: clearRound ? null : prev.roundQuestionId,
        bankBets: clearRound ? {} : prev.bankBets,
        stagedBets: clearRound ? {} : prev.stagedBets,
        betSent: clearRound ? false : prev.betSent,
        // вошедший в лобби или в лавку — участник; посреди раунда — зритель, пока сервер не снимет флаг (nextRound)
        isLateJoiner: !!me?.spectator,
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
      // за меня поставил сервер (не подтвердил к концу ставок) — сказать, куда и сколько
      const forced = playerId === prev.myId && !prev.betSent
      const notice = forced
        ? { text: target ? `Поставили на ${target === 'lose' ? 'завалит' : 'ответит'}` : `Поставили $${amount}`, at: Date.now() }
        : prev.notice
      return {
        stagedBets,
        notice,
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

  socket.on('round_results', ({ results, correctAnswer, correctNumericAnswer, comment, optionNotes, questionId, questionKey }: RoundResultsPayload) => {
    if (questionKey && questionId) {
      realQuestionIds.set(questionKey, questionId)
      if (realQuestionIds.size > 50) realQuestionIds.delete(realQuestionIds.keys().next().value!)
    }
    set({
      roundQuestionId: questionId ?? null,
      roundResults: results,
      roundCorrectAnswer: correctAnswer ?? correctNumericAnswer ?? null,
      roundComment: comment ?? null,
      roundOptionNotes: optionNotes ?? null,
      // раунд посчитан — прицел гема больше некуда применить
      targeting: null,
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
    roundQuestionId: null,
    winner: null,
    answeredIds: new Set(),
    gladiatorHoverIndex: null,
    bankBets: {},
    stagedBets: {},
    isLateJoiner: false,
    joinError: null,
    bribePrompt: null,
    bribeEliminatedIdx: null,
    rating: null,
    betSent: false,
    notice: null,
    itemFeed: [],
    gemResults: {},
    gemmedOnMe: 0,
    targeting: null,

    connect(name, gameCode) {
      joined = { name, gameCode }
      set({ joinError: null })
      if (!socket.connected) socket.connect()
      socket.emit('join_game', { name, gameCode })
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

    markBetSent() {
      set({ betSent: true })
    },

    sendHover(optionIndex) {
      socket.emit('gladiator_hover', { optionIndex })
    },

    startGame() {
      socket.emit('start_game')
    },

    addBot() {
      socket.emit('add_bot')
    },

    removeBot(id) {
      socket.emit('remove_bot', { id })
    },

    setFirstGame(on) {
      socket.emit('set_first_game', { on })
    },

    identify(friendId) {
      socket.emit('identify', { friendId })
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
      const r = get().rating
      if (r) scheduleRating(r)
    },

    reset() {
      sendRatingNow()
      joined = null
      set({
        gameState: null,
        myId: null,
        roundResults: [],
        roundCorrectAnswer: null,
        roundComment: null,
        roundOptionNotes: null,
        roundQuestionId: null,
        winner: null,
        answeredIds: new Set(),
        gladiatorHoverIndex: null,
        bankBets: {},
        stagedBets: {},
        isLateJoiner: false,
        joinError: null,
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
