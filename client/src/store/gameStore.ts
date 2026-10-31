import { create } from 'zustand'
import { socket } from '../socket'
import type {
  GameState, Player, RoundResult,
  BetUpdatedPayload, PlayerAnsweredPayload,
  GladiatorHoveringPayload, GameOverPayload,
  RoundResultsPayload, ChipStagedPayload, JoinedPayload,
  ItemId, ItemUsedPayload, GemResultPayload, MantaResultPayload,
  JoinErrorPayload, SetSettingsPayload,
} from '@cumsino/shared'
import { activeSession, forgetActive, loadDraft, rememberActive, saveDraft, tokenFor, type Session } from '../lib/session'
import { syncClock } from '../lib/clock'

export interface ItemFeedEntry { playerId: string; item: ItemId; targetId?: string; at: number }

export interface QuestionRating {
  questionId: string
  score: number | null
  difficulty: number | null
}

/** Оценка уходит на сервер при каждом изменении — через RATING_DEBOUNCE_MS после последнего нажатия (перещёлкал
 *  шкалу — одна отправка). Голос целиком: null — снято (сервер заменяет прежний голос). Сервер принимает оценку
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

/** Черновик числа в «кто ближе» — живёт в сторе по ключу вопроса: экран может смонтироваться заново, текст останется. */
export interface ClosestDraft { key: string; value: string }

interface GameStore {
  gameState: GameState | null
  /** свой id в комнате (приходит в joined; не socket.id — тот меняется при каждом переподключении) */
  myId: string | null
  /** соединение с сервером есть (нет — сокет переподключается сам, а игра ждёт тебя «не в сети») */
  connected: boolean
  /** эту игру открыли в другой вкладке / на другом устройстве — здесь она больше не идёт */
  replaced: boolean
  roundResults: RoundResult[]
  roundCorrectAnswer: string | number | null
  roundComment: string | null
  roundOptionNotes: string[] | null
  /** настоящий id вопроса раунда — приходит в round_results (в game_state currentQuestion.id — ключ раунда) */
  roundQuestionId: string | null
  winner: Player | null
  answeredIds: Set<string>
  gladiatorHoverIndex: number | null
  /** черновики соперников на столе: номиналы и (толпа керри) вариант */
  stagedBets: Record<string, number[]>
  stagedOptions: Record<string, number>
  /** я зритель этого раунда (вошёл посреди раунда) — по серверному Player.spectator */
  isLateJoiner: boolean
  /** отказ во входе (join_error): комната полна, сервер полон, пустое имя, плохой код; null — нет. Снимается
   *  новой попыткой входа (connect) и reset */
  joinError: JoinErrorPayload | null
  /** Своя оценка вопроса раунда — живёт от раскрытия ответа до следующего раунда; каждое изменение уходит на
   *  сервер (с debounce) */
  rating: QuestionRating | null
  /** сам подтвердил ставку в этом раунде (иначе bet_updated за меня — ставка за меня в конце ставок) */
  betSent: boolean
  /** короткая наклейка поверх экрана («Поставили $30») */
  notice: { text: string; at: number } | null
  /** кто чем пользовался в этом раунде — для бирок над никами (свежие сверху) */
  itemFeed: ItemFeedEntry[]
  /** результаты своего гема: targetId → что выбрано у цели (null — ещё думает: покажется первый выбор) */
  gemResults: Record<string, { answer: string | number | null; smoked: boolean }>
  /** на меня посмотрели гемом (сколько раз за раунд) */
  gemmedOnMe: number
  targeting: ItemId | null
  closestDraft: ClosestDraft | null

  connect: (name: string, gameCode: string) => void
  /** перезагрузка страницы посреди игры — обратно в неё (true — было куда) */
  resumeActive: () => boolean
  /** игра открыта в другой вкладке — забрать её сюда */
  takeOver: () => void
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
  /** Настройки игры (хост, лобби): джекпот и ставка на вопрос (режим «для всех») */
  setSettings: (patch: SetSettingsPayload) => void
  /** «Кто ты» в лобби: человек из компании или null (пропустить) */
  identify: (friendId: number | null) => void
  /** Поменять свою оценку (повторный выбор того же значения снимает его): score −2…+2 (без 0), difficulty ±1 */
  setRating: (questionId: string, patch: { score?: number | null; difficulty?: number | null }) => void
  setClosestDraft: (draft: ClosestDraft | null) => void
  /** выйти из игры совсем (сервер убирает игрока) */
  reset: () => void
}

/** куда входили — повторный вход после обрыва связи (с тем же токеном — тем же игроком) */
let joined: Session | null = null
/** последний обрыв: почему и когда — уходит в журнал сервера после возвращения */
let lastDrop: { reason: string; at: number; hidden: boolean } | null = null

function sendJoin() {
  if (joined) socket.emit('join_game', joined)
}

/** Черновики соперников без тех, чья ставка скрыта смоком (betHidden). */
function withoutHidden(staged: Record<string, number[]>, players: Player[]) {
  const hidden = players.filter(p => p.betHidden && staged[p.id])
  if (!hidden.length) return staged
  const next = { ...staged }
  for (const p of hidden) delete next[p.id]
  return next
}

/** Раунд посчитан (round_results или итоги в стейте после переподключения) — поля стора. */
function resultsPatch(r: RoundResultsPayload) {
  if (r.questionKey && r.questionId) {
    realQuestionIds.set(r.questionKey, r.questionId)
    if (realQuestionIds.size > 50) realQuestionIds.delete(realQuestionIds.keys().next().value!)
  }
  return {
    roundQuestionId: r.questionId ?? null,
    roundResults: r.results,
    roundCorrectAnswer: r.correctAnswer ?? r.correctNumericAnswer ?? null,
    roundComment: r.comment ?? null,
    roundOptionNotes: r.optionNotes ?? null,
  }
}

export const useGameStore = create<GameStore>((set, get) => {
  // вкладку закрыли посреди итогов — отложенная оценка уходит сразу
  window.addEventListener('pagehide', sendRatingNow)

  // Обрыв связи: сокет переподключается сам; на каждом подключении входим снова с тем же токеном — сервер
  // возвращает того же игрока (он ждал «не в сети»), стейт приходит целиком
  socket.on('connect', () => {
    set({ connected: true })
    sendJoin()
  })

  socket.on('disconnect', (reason: string) => {
    if (reason !== 'io client disconnect') lastDrop = { reason, at: Date.now(), hidden: document.visibilityState === 'hidden' }
    set({ connected: false })
  })

  // вернулся на вкладку (телефон разблокировали), а сокет лежит — подключаемся сразу, не ждём паузы переподключения
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && joined && !socket.connected && !get().replaced) socket.connect()
  })

  socket.on('joined', ({ playerId }: JoinedPayload) => {
    set({ myId: playerId, joinError: null })
    if (lastDrop) {
      socket.emit('client_log', {
        reason: lastDrop.reason, downMs: Date.now() - lastDrop.at,
        transport: socket.io.engine?.transport?.name, hidden: lastDrop.hidden,
      })
      lastDrop = null
    }
  })

  // игру забрала другая вкладка: сервер отключил этот сокет и сам переподключать его не будет
  socket.on('session_replaced', () => {
    set({ replaced: true })
  })

  socket.on('join_error', (err: JoinErrorPayload) => {
    set({ joinError: err })
  })

  socket.on('game_state', (state: GameState) => {
    syncClock(state.serverNow)   // разница часов с сервером — отсчёты фаз идут от дедлайна (lib/clock)
    const { rating, gameState: before, myId } = get()
    const roundOver = state.phase === 'ANNOUNCE' || state.phase === 'GAME_OVER' || state.phase === 'LOBBY'
      || (before !== null && state.roundIndex !== before.roundIndex)
    if (roundOver) sendRatingNow()
    if (rating && roundOver) set({ rating: null })
    // зритель — пока сервер так считает (до следующего раунда), а не по фазе первого стейта
    const me = state.players.find(p => p.id === myId)
    set(prev => {
      const newRound =
        prev.gameState !== null && state.roundIndex !== prev.gameState.roundIndex
      const clearRound = state.phase === 'ANNOUNCE' || newRound
      const samePhase = !clearRound && prev.gameState?.phase === state.phase
      // итоги раунда есть в стейте (показ ответа, REVEAL) — вернувшийся после обрыва не пропустит их
      const results = state.roundResults && (clearRound || !prev.roundResults.length)
        ? resultsPatch(state.roundResults) : null
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
        ...(results ?? {}),
        // соперник ушёл в смок («для всех») — его черновик больше не показываем (сервер его и не шлёт)
        stagedBets: clearRound ? {} : withoutHidden(prev.stagedBets, state.players),
        stagedOptions: clearRound ? {} : prev.stagedOptions,
        betSent: clearRound ? false : prev.betSent || !!state.betConfirmed,
        // вошедший в лобби или в лавку — участник; посреди раунда — зритель, пока сервер не снимет флаг (nextRound)
        isLateJoiner: !!me?.spectator,
        itemFeed: clearRound ? [] : prev.itemFeed,
        // гем — сервер помнит, что ты видел (после переподключения — из стейта)
        gemResults: clearRound ? {} : { ...prev.gemResults, ...(state.gemResults ?? {}) },
        gemmedOnMe: clearRound ? 0 : prev.gemmedOnMe,
        closestDraft: clearRound ? null : prev.closestDraft,
        // цель выбирают в своей фазе (хекс — ставки, гем — вопрос): сменилась фаза — выбор снят
        targeting: prev.gameState?.phase === state.phase ? prev.targeting : null,
      }
    })
  })

  socket.on('bet_updated', ({ playerId, amount, option, chips }: BetUpdatedPayload) => {
    set(prev => {
      if (!prev.gameState) return prev
      const { [playerId]: _confirmed, ...stagedBets } = prev.stagedBets   // ставка подтверждена — черновик не нужен
      const { [playerId]: _opt, ...stagedOptions } = prev.stagedOptions
      // за меня поставил сервер (не подтвердил к концу ставок) — сказать, сколько; поставилось то, что лежало на
      // столе (chips есть) — говорить нечего, это и было
      const forced = playerId === prev.myId && !prev.betSent && !chips
      const notice = forced ? { text: `Поставили $${amount}`, at: Date.now() } : prev.notice
      return {
        stagedBets,
        stagedOptions,
        notice,
        betSent: playerId === prev.myId ? true : prev.betSent,
        gameState: {
          ...prev.gameState,
          ...(playerId === prev.myId ? { betConfirmed: true } : {}),
          players: prev.gameState.players.map(p =>
            p.id === playerId
              ? { ...p, currentBet: amount, betChips: chips, ...(option !== undefined ? { betOption: option } : {}) }
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

  socket.on('round_results', (payload: RoundResultsPayload) => {
    set({ ...resultsPatch(payload), targeting: null })   // раунд посчитан — прицел гема больше некуда применить
  })

  socket.on('chip_staged', ({ playerId, chips, option }: ChipStagedPayload) => {
    set(prev => ({
      stagedBets: { ...prev.stagedBets, [playerId]: chips },
      stagedOptions: option !== undefined ? { ...prev.stagedOptions, [playerId]: option } : prev.stagedOptions,
    }))
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

  const empty = {
    gameState: null,
    myId: null,
    roundResults: [],
    roundCorrectAnswer: null,
    roundComment: null,
    roundOptionNotes: null,
    roundQuestionId: null,
    winner: null,
    answeredIds: new Set<string>(),
    gladiatorHoverIndex: null,
    stagedBets: {},
    stagedOptions: {},
    isLateJoiner: false,
    joinError: null,
    rating: null,
    betSent: false,
    notice: null,
    itemFeed: [],
    gemResults: {},
    gemmedOnMe: 0,
    targeting: null,
    closestDraft: null,
    replaced: false,
  }

  /** войти (или вернуться) с сессией: подключение само шлёт join_game (socket 'connect') */
  function enter(s: Session) {
    joined = s
    rememberActive(s)
    set({ joinError: null, replaced: false })
    if (socket.connected) sendJoin()
    else socket.connect()
  }

  return {
    ...empty,
    connected: false,
    // набранное до перезагрузки страницы (ключ — вопрос: чужой раунд его не покажет)
    closestDraft: loadDraft(),

    connect(name, gameCode) {
      enter({ name, gameCode, token: tokenFor(gameCode, name) })
    },

    resumeActive() {
      const s = activeSession()
      if (!s) return false
      enter(s)
      return true
    },

    takeOver() {
      if (joined) enter(joined)
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

    setSettings(patch) {
      socket.emit('set_settings', patch)
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

    setClosestDraft(draft) {
      set({ closestDraft: draft })
      saveDraft(draft)
    },

    reset() {
      sendRatingNow()
      if (socket.connected) socket.emit('leave_game')
      joined = null
      lastDrop = null
      forgetActive()
      set({ ...empty })
      socket.disconnect()
    },
  }
})

export const selectMe = (s: GameStore): Player | undefined =>
  s.gameState?.players.find(p => p.id === s.myId)

export const selectIsGladiator = (s: GameStore): boolean =>
  s.myId !== null && s.gameState?.gladiatorId === s.myId
