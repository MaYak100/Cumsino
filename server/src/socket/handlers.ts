import type { Socket } from 'socket.io'
import type { GameEngine } from '../game/GameEngine'
import type {
  JoinGamePayload, PlaceBetPayload,
  SubmitAnswerPayload, GladiatorHoverPayload,
  PlaceBankBetPayload,
} from '@cumsino/shared'

export function registerHandlers(socket: Socket, engine: GameEngine): void {
  socket.on('join_game', ({ name, gameCode }: JoinGamePayload) => {
    if (!name?.trim() || !gameCode?.trim()) return
    engine.joinRoom(socket, name.trim(), gameCode.trim().toUpperCase())
  })

  socket.on('start_game', () => {
    engine.getRoom(socket.id)?.start(socket.id)
  })

  socket.on('place_bet', ({ amount, target }: PlaceBetPayload) => {
    if (typeof amount !== 'number' || amount < 0) return
    if (target !== undefined && target !== 'win' && target !== 'lose') return
    engine.getRoom(socket.id)?.placeBet(socket.id, amount, target)
  })

  socket.on('submit_answer', ({ answer }: SubmitAnswerPayload) => {
    if (answer === undefined || answer === null) return
    engine.getRoom(socket.id)?.submitAnswer(socket.id, answer)
  })

  socket.on('gladiator_hover', ({ optionIndex }: GladiatorHoverPayload) => {
    if (optionIndex !== null && typeof optionIndex !== 'number') return
    engine.getRoom(socket.id)?.relayHover(socket.id, optionIndex)
  })

  socket.on('place_bank_bet', ({ optionIndex, amount }: PlaceBankBetPayload) => {
    if (typeof optionIndex !== 'number' || typeof amount !== 'number' || amount <= 0) return
    engine.getRoom(socket.id)?.placeBankBet(socket.id, optionIndex, amount)
  })

  socket.on('stage_chip', ({ amount }: { amount: number }) => {
    if (typeof amount !== 'number' || amount < 0) return
    engine.getRoom(socket.id)?.stageChip(socket.id, amount)
  })

  socket.on('disconnect', () => {
    engine.leaveRoom(socket.id)
  })
}
