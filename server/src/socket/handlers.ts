import type { Socket } from 'socket.io'
import type { GameEngine } from '../game/GameEngine'
import type {
  JoinGamePayload, PlaceBetPayload, StageChipPayload, ClientLogPayload,
  SubmitAnswerPayload, GladiatorHoverPayload,
  IdentifyPayload, RateQuestionPayload,
  BuyItemPayload, UseItemPayload, ShopReadyPayload, ItemId, JoinErrorPayload, RemoveBotPayload, SetFirstGamePayload,
} from '@cumsino/shared'
import type { GameRoom } from '../game/GameRoom'
import { ITEM_ORDER } from '@cumsino/shared'
import type { RatingVote } from '../game/questions/picker'

const VALID_CHIP_DENOMS = new Set([10, 20, 50, 100, 500])

export const isChips = (c: unknown): c is number[] =>
  Array.isArray(c) && c.length <= 40 && c.every(x => VALID_CHIP_DENOMS.has(x))
export const isItem = (i: unknown): i is ItemId => typeof i === 'string' && (ITEM_ORDER as string[]).includes(i)
/** Ставки — целые, кратные 10 (меньше фишки 10 нет): иначе дробные балансы и сломанный делёж пула */
export const isStake = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n % 10 === 0
/** вариант ответа керри — индекс (в вопросе их не больше десятка; есть ли такой — проверяет комната) */
export const isOption = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 16
/** токен сессии — случайная строка клиента */
export const isToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(t)

export const NAME_MAX = 24

/** Имя игрока: без управляющих и невидимых символов (zero-width, RTL-override, BOM, приватная зона), без «залго»
 *  (больше двух диакритик подряд), пробелы схлопнуты, не длиннее NAME_MAX символов. Пустое — null. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw
    .slice(0, 200)
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Cn}\p{Zl}\p{Zp}]/gu, '')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim()
  const short = Array.from(name).slice(0, NAME_MAX).join('').trim()
  return short ? short : null
}

/** Лимит событий на сокет: ведро на BURST, пополняется PER_SECOND в секунду; лишнее молча отбрасывается. */
export const EVENTS_BURST = 40
export const EVENTS_PER_SECOND = 20
/** оценка вопроса пишет в базу — не чаще раза в RATE_FLUSH_MS на сокет (последняя побеждает) */
export const RATE_FLUSH_MS = 1000

/** Что обработчикам нужно от сокета (для тестов хватает заглушки). */
export type HandlerSocket = Pick<Socket, 'id' | 'on' | 'emit'>
type Engine = Pick<GameEngine, 'joinRoom' | 'ctx' | 'leaveRoom' | 'disconnect'>

export function registerHandlers(rawSocket: HandlerSocket, engine: Engine): void {
  // лимит событий: token bucket
  let tokens = EVENTS_BURST
  let refilledAt = Date.now()
  let dropped = 0
  const allow = (event: string): boolean => {
    const now = Date.now()
    tokens = Math.min(EVENTS_BURST, tokens + (now - refilledAt) / 1000 * EVENTS_PER_SECOND)
    refilledAt = now
    if (tokens >= 1) {
      tokens -= 1
      return true
    }
    if (dropped++ % 200 === 0) console.warn(`[socket] ${rawSocket.id} шлёт слишком часто (${event}), отброшено: ${dropped}`)
    return false
  }

  // Событие без данных или с мусором не должно ронять процесс (все комнаты сразу): пустой payload → {},
  // исключение обработчика → лог.
  const socket = {
    id: rawSocket.id,
    on(event: string, handler: (payload: any) => void) {
      rawSocket.on(event, (payload: unknown) => {
        if (event !== 'disconnect' && !allow(event)) return
        try {
          handler(payload && typeof payload === 'object' ? payload : {})
        } catch (err) {
          console.error(`[socket] ${event} от ${rawSocket.id}:`, err)
        }
      })
    },
  }

  /** Игрок этого сокета (не socket.id: id игрока переживает переподключения) и его комната. */
  const act = (fn: (room: GameRoom, id: string) => void) => {
    const c = engine.ctx(socket.id)
    if (c) fn(c.room, c.id)
  }

  const joinError = (reason: JoinErrorPayload['reason'], message: string) => {
    const payload: JoinErrorPayload = { reason, message }
    rawSocket.emit('join_error', payload)
  }

  socket.on('join_game', ({ name, gameCode, token }: JoinGamePayload) => {
    const code = typeof gameCode === 'string' ? gameCode.trim().toUpperCase() : ''
    if (!/^[A-Z0-9]{2,8}$/.test(code)) return joinError('bad_code', 'Код комнаты — 2–8 латинских букв или цифр')
    const clean = cleanName(name)
    if (!clean) return joinError('bad_name', 'Введи имя')
    engine.joinRoom(rawSocket as Socket, clean, code, isToken(token) ? token : undefined)
  })

  // «Выйти»: уйти из комнаты совсем (обрыв связи — не уход: игрок ждёт возвращения «не в сети»)
  socket.on('leave_game', () => {
    flushRating()
    engine.leaveRoom(socket.id)
  })

  // журнал связи клиента: почему оборвалось и сколько не было — в лог (Render), чтобы видеть, кого и как рвёт
  socket.on('client_log', ({ reason, downMs, transport, hidden }: ClientLogPayload) => {
    if (typeof reason !== 'string' || typeof downMs !== 'number') return
    const who = engine.ctx(socket.id)
    console.log(`[conn] ${who ? `${who.room.id}/${who.id}` : socket.id} вернулся: ${reason.slice(0, 60)}, `
      + `не было ${Math.round(downMs / 100) / 10} с, ${String(transport ?? '?').slice(0, 20)}${hidden ? ', вкладка в фоне' : ''}`)
  })

  socket.on('start_game', () => {
    act((room, id) => room.start(id))
  })

  // боты для соло-тестов: только хост и только в лобби (проверяет комната)
  socket.on('add_bot', () => {
    act((room, id) => room.addBot(id))
  })

  socket.on('set_first_game', ({ on }: SetFirstGamePayload) => {
    if (typeof on !== 'boolean') return
    act((room, id) => room.setFirstGame(id, on))
  })

  socket.on('remove_bot', ({ id: botId }: RemoveBotPayload) => {
    if (typeof botId !== 'string' || !botId || botId.length > 64) return
    act((room, id) => room.removeBot(id, botId))
  })

  socket.on('place_bet', ({ amount, option, chips }: PlaceBetPayload) => {
    if (!isStake(amount)) return
    if (option !== undefined && !isOption(option)) return
    if (chips !== undefined && !isChips(chips)) return
    act((room, id) => room.placeBet(id, amount, option, chips))
  })

  socket.on('submit_answer', ({ answer, blink }: SubmitAnswerPayload) => {
    if (typeof answer !== 'string' && typeof answer !== 'number') return
    if (typeof answer === 'string' && answer.length > 300) return
    if (blink !== undefined && typeof blink !== 'boolean') return
    act((room, id) => room.submitAnswer(id, answer, blink === true))
  })

  socket.on('buy_item', ({ item }: BuyItemPayload) => {
    if (!isItem(item)) return
    act((room, id) => room.buyItem(id, item))
  })

  socket.on('use_item', ({ item, targetId }: UseItemPayload) => {
    if (!isItem(item)) return
    if (targetId !== undefined && (typeof targetId !== 'string' || targetId.length > 64)) return
    act((room, id) => room.useItem(id, item, targetId))
  })

  socket.on('shop_ready', ({ ready }: ShopReadyPayload) => {
    if (typeof ready !== 'boolean') return
    act((room, id) => room.setShopReady(id, ready))
  })

  socket.on('gladiator_hover', ({ optionIndex }: GladiatorHoverPayload) => {
    if (optionIndex !== null && !Number.isInteger(optionIndex)) return
    act((room, id) => room.relayHover(id, optionIndex))
  })

  socket.on('stage_chip', ({ chips, option }: StageChipPayload) => {
    if (!isChips(chips)) return
    act((room, id) => room.stageChip(id, chips, isOption(option) ? option : undefined))
  })

  socket.on('identify', ({ friendId }: IdentifyPayload) => {
    if (friendId !== null && !Number.isInteger(friendId)) return
    act((room, id) => room.identify(id, friendId))
  })

  // оценка: копится и уходит в комнату (и в базу) не чаще раза в RATE_FLUSH_MS; другой вопрос — прежняя сразу
  let rating: { questionId: string; vote: RatingVote } | null = null
  let ratingTimer: ReturnType<typeof setTimeout> | undefined
  const flushRating = () => {
    clearTimeout(ratingTimer)
    ratingTimer = undefined
    const r = rating
    rating = null
    if (r) act((room, id) => room.rateQuestion(id, r.questionId, r.vote))
  }

  socket.on('rate_question', ({ questionId, score, difficulty }: RateQuestionPayload) => {
    if (typeof questionId !== 'string' || questionId.length > 200) return
    if (score !== undefined && score !== null && ![-2, -1, 1, 2].includes(score)) return
    if (difficulty !== undefined && difficulty !== null && ![-1, 1].includes(difficulty)) return
    if (rating && rating.questionId !== questionId) flushRating()
    const vote: RatingVote = { ...rating?.vote }
    if (score !== undefined) vote.score = score
    if (difficulty !== undefined) vote.difficulty = difficulty
    rating = { questionId, vote }
    if (!ratingTimer) ratingTimer = setTimeout(flushRating, RATE_FLUSH_MS)
  })

  // напрямую, не через обёртку: причина обрыва — строка (обёртка заменила бы её на {})
  rawSocket.on('disconnect', (reason: unknown) => {
    try {
      flushRating()   // недосланная оценка — пока сокет ещё привязан к игроку
      const who = engine.ctx(socket.id)
      if (who) console.log(`[conn] ${who.room.id}/${who.id} отвалился: ${String(reason)}`)
      engine.disconnect(socket.id)
    } catch (err) {
      console.error(`[socket] disconnect от ${rawSocket.id}:`, err)
    }
  })
}
