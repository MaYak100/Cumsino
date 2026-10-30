import type { Socket } from 'socket.io'
import type { GameEngine } from '../game/GameEngine'
import type {
  JoinGamePayload, PlaceBetPayload,
  SubmitAnswerPayload, GladiatorHoverPayload,
  IdentifyPayload, RateQuestionPayload,
  BuyItemPayload, UseItemPayload, ShopReadyPayload, ItemId, JoinErrorPayload, RemoveBotPayload,
} from '@cumsino/shared'
import { ITEM_ORDER } from '@cumsino/shared'
import type { RatingVote } from '../game/questions/picker'

const VALID_CHIP_DENOMS = new Set([10, 20, 50, 100, 500])

export const isChips = (c: unknown): c is number[] =>
  Array.isArray(c) && c.length <= 40 && c.every(x => VALID_CHIP_DENOMS.has(x))
export const isItem = (i: unknown): i is ItemId => typeof i === 'string' && (ITEM_ORDER as string[]).includes(i)
/** Ставки — целые, кратные 10 (меньше фишки 10 нет): иначе дробные балансы и сломанный делёж пула */
export const isStake = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n % 10 === 0

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
type Engine = Pick<GameEngine, 'joinRoom' | 'getRoom' | 'leaveRoom'>

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

  const joinError = (reason: JoinErrorPayload['reason'], message: string) => {
    const payload: JoinErrorPayload = { reason, message }
    rawSocket.emit('join_error', payload)
  }

  socket.on('join_game', ({ name, gameCode }: JoinGamePayload) => {
    const code = typeof gameCode === 'string' ? gameCode.trim().toUpperCase() : ''
    if (!/^[A-Z0-9]{2,8}$/.test(code)) return joinError('bad_code', 'Код комнаты — 2–8 латинских букв или цифр')
    const clean = cleanName(name)
    if (!clean) return joinError('bad_name', 'Введи имя')
    engine.joinRoom(rawSocket as Socket, clean, code)
  })

  socket.on('start_game', () => {
    engine.getRoom(socket.id)?.start(socket.id)
  })

  // боты для соло-тестов: только хост и только в лобби (проверяет комната)
  socket.on('add_bot', () => {
    engine.getRoom(socket.id)?.addBot(socket.id)
  })

  socket.on('remove_bot', ({ id }: RemoveBotPayload) => {
    if (typeof id !== 'string' || !id || id.length > 64) return
    engine.getRoom(socket.id)?.removeBot(socket.id, id)
  })

  socket.on('place_bet', ({ amount, target, chips, bankBet }: PlaceBetPayload) => {
    if (!isStake(amount)) return
    if (target !== undefined && target !== 'win' && target !== 'lose') return
    if (chips !== undefined && !isChips(chips)) return
    if (bankBet !== undefined && (typeof bankBet !== 'object' || !bankBet || !isStake(bankBet.amount)
      || !Number.isInteger(bankBet.optionIndex))) return
    engine.getRoom(socket.id)?.placeBet(socket.id, amount, target, chips, bankBet)
  })

  socket.on('submit_answer', ({ answer, blink }: SubmitAnswerPayload) => {
    if (typeof answer !== 'string' && typeof answer !== 'number') return
    if (typeof answer === 'string' && answer.length > 300) return
    if (blink !== undefined && typeof blink !== 'boolean') return
    engine.getRoom(socket.id)?.submitAnswer(socket.id, answer, blink === true)
  })

  socket.on('buy_item', ({ item }: BuyItemPayload) => {
    if (!isItem(item)) return
    engine.getRoom(socket.id)?.buyItem(socket.id, item)
  })

  socket.on('use_item', ({ item, targetId }: UseItemPayload) => {
    if (!isItem(item)) return
    if (targetId !== undefined && (typeof targetId !== 'string' || targetId.length > 64)) return
    engine.getRoom(socket.id)?.useItem(socket.id, item, targetId)
  })

  socket.on('shop_ready', ({ ready }: ShopReadyPayload) => {
    if (typeof ready !== 'boolean') return
    engine.getRoom(socket.id)?.setShopReady(socket.id, ready)
  })

  socket.on('gladiator_hover', ({ optionIndex }: GladiatorHoverPayload) => {
    if (optionIndex !== null && !Number.isInteger(optionIndex)) return
    engine.getRoom(socket.id)?.relayHover(socket.id, optionIndex)
  })

  socket.on('stage_chip', ({ chips, target }: { chips: number[]; target?: 'win' | 'lose' }) => {
    if (!isChips(chips)) return
    engine.getRoom(socket.id)?.stageChip(socket.id, chips, target === 'win' || target === 'lose' ? target : undefined)
  })

  socket.on('identify', ({ friendId }: IdentifyPayload) => {
    if (friendId !== null && !Number.isInteger(friendId)) return
    engine.getRoom(socket.id)?.identify(socket.id, friendId)
  })

  // оценка: копится и уходит в комнату (и в базу) не чаще раза в RATE_FLUSH_MS; другой вопрос — прежняя сразу
  let rating: { questionId: string; vote: RatingVote } | null = null
  let ratingTimer: ReturnType<typeof setTimeout> | undefined
  const flushRating = () => {
    clearTimeout(ratingTimer)
    ratingTimer = undefined
    const r = rating
    rating = null
    if (r) engine.getRoom(socket.id)?.rateQuestion(socket.id, r.questionId, r.vote)
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

  socket.on('pay_bribe', () => {
    engine.getRoom(socket.id)?.payBribe(socket.id)
  })

  socket.on('disconnect', () => {
    flushRating()   // недосланная оценка — до выхода из комнаты
    engine.leaveRoom(socket.id)
  })
}
