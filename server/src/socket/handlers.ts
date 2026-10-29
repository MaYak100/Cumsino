import type { Socket } from 'socket.io'
import type { GameEngine } from '../game/GameEngine'
import type {
  JoinGamePayload, PlaceBetPayload,
  SubmitAnswerPayload, GladiatorHoverPayload,
  PlaceBankBetPayload, IdentifyPayload, RateQuestionPayload,
  BuyItemPayload, UseItemPayload, ItemId,
} from '@cumsino/shared'
import { ITEM_ORDER } from '@cumsino/shared'

const VALID_CHIP_DENOMS = new Set([10, 20, 50, 100, 500])

const isChips = (c: unknown): c is number[] =>
  Array.isArray(c) && c.length <= 40 && c.every(x => VALID_CHIP_DENOMS.has(x))
/** Ставки — целые, кратные 10 (меньше фишки 10 нет): иначе дробные балансы и сломанный делёж пула */
const isItem = (i: unknown): i is ItemId => typeof i === 'string' && (ITEM_ORDER as string[]).includes(i)
const isStake = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n % 10 === 0

export function registerHandlers(rawSocket: Socket, engine: GameEngine): void {
  // Событие без данных или с мусором не должно ронять процесс (все комнаты сразу): пустой payload → {},
  // исключение обработчика → лог.
  const socket = {
    id: rawSocket.id,
    on(event: string, handler: (payload: any) => void) {
      rawSocket.on(event, (payload: unknown) => {
        try {
          handler(payload && typeof payload === 'object' ? payload : {})
        } catch (err) {
          console.error(`[socket] ${event} от ${rawSocket.id}:`, err)
        }
      })
    },
  }

  socket.on('join_game', ({ name, gameCode }: JoinGamePayload) => {
    if (typeof name !== 'string' || typeof gameCode !== 'string') return
    if (!name.trim() || !gameCode.trim()) return
    const code = gameCode.trim().toUpperCase()
    if (!/^[A-Z0-9]{2,8}$/.test(code)) return
    engine.joinRoom(rawSocket, name.trim().slice(0, 32), code)
  })

  socket.on('start_game', () => {
    engine.getRoom(socket.id)?.start(socket.id)
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
    if (answer === undefined || answer === null) return
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

  socket.on('gladiator_hover', ({ optionIndex }: GladiatorHoverPayload) => {
    if (optionIndex !== null && typeof optionIndex !== 'number') return
    engine.getRoom(socket.id)?.relayHover(socket.id, optionIndex)
  })

  socket.on('place_bank_bet', ({ optionIndex, amount }: PlaceBankBetPayload) => {
    if (!Number.isInteger(optionIndex) || !isStake(amount) || amount <= 0) return
    engine.getRoom(socket.id)?.placeBankBet(socket.id, optionIndex, amount)
  })

  socket.on('stage_chip', ({ chips }: { chips: number[] }) => {
    if (!isChips(chips)) return
    engine.getRoom(socket.id)?.stageChip(socket.id, chips)
  })

  socket.on('identify', ({ friendId }: IdentifyPayload) => {
    if (friendId !== null && !Number.isInteger(friendId)) return
    engine.getRoom(socket.id)?.identify(socket.id, friendId)
  })

  socket.on('rate_question', ({ questionId, score, difficulty }: RateQuestionPayload) => {
    if (typeof questionId !== 'string' || questionId.length > 200) return
    if (score !== undefined && score !== null && ![-2, -1, 1, 2].includes(score)) return
    if (difficulty !== undefined && difficulty !== null && ![-1, 1].includes(difficulty)) return
    engine.getRoom(socket.id)?.rateQuestion(socket.id, questionId, { score, difficulty })
  })

  socket.on('pay_bribe', () => {
    engine.getRoom(socket.id)?.payBribe(socket.id)
  })

  socket.on('disconnect', () => {
    engine.leaveRoom(socket.id)
  })
}
