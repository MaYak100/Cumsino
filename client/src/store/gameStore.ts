import { create } from 'zustand'
import { socket } from '../socket'
import type {
  GameState, Player, RoundResult,
  BetUpdatedPayload, PlayerAnsweredPayload,
  GladiatorHoveringPayload, GameOverPayload,
  BankBetUpdatedPayload,
} from '@cumsino/shared'

interface GameStore {
  gameState: GameState | null
  myId: string | null
  roundResults: RoundResult[]
  winner: Player | null
  answeredIds: Set<string>
  gladiatorHoverIndex: number | null
  pendingTarget: 'win' | 'lose' | null
  bankBets: Record<string, { optionIndex: number; amount: number }>

  connect: (name: string, gameCode: string) => void
  setPendingTarget: (target: 'win' | 'lose' | null) => void
  submitAnswer: (answer: string | number | string[]) => void
  sendHover: (optionIndex: number | null) => void
  startGame: () => void
  reset: () => void
}

export const useGameStore = create<GameStore>((set) => {
  socket.on('connect', () => {
    set({ myId: socket.id ?? null })
  })

  socket.on('game_state', (state: GameState) => {
    set(prev => ({
      gameState: state,
      answeredIds: new Set(),
      gladiatorHoverIndex: null,
      roundResults: state.phase === 'ANNOUNCE' ? [] : prev.roundResults,
      bankBets: state.phase === 'ANNOUNCE' ? {} : prev.bankBets,
    }))
  })

  socket.on('bet_updated', ({ playerId, amount, target }: BetUpdatedPayload) => {
    set(prev => {
      if (!prev.gameState) return prev
      return {
        gameState: {
          ...prev.gameState,
          players: prev.gameState.players.map(p =>
            p.id === playerId
              ? { ...p, currentBet: amount, ...(target ? { betTarget: target } : {}) }
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

  socket.on('round_results', ({ results }: { results: RoundResult[] }) => {
    set({ roundResults: results })
  })

  socket.on('bank_bet_updated', ({ playerId, optionIndex, amount }: BankBetUpdatedPayload) => {
    set(prev => ({
      bankBets: { ...prev.bankBets, [playerId]: { optionIndex, amount } },
    }))
  })

  socket.on('game_over', ({ winner }: GameOverPayload) => {
    set({ winner })
  })

  return {
    gameState: null,
    myId: null,
    roundResults: [],
    winner: null,
    answeredIds: new Set(),
    gladiatorHoverIndex: null,
    pendingTarget: null,
    bankBets: {},

    connect(name, gameCode) {
      if (!socket.connected) socket.connect()
      socket.emit('join_game', { name, gameCode })
    },

    setPendingTarget(target) {
      set({ pendingTarget: target })
    },

    submitAnswer(answer) {
      socket.emit('submit_answer', { answer })
    },

    sendHover(optionIndex) {
      socket.emit('gladiator_hover', { optionIndex })
    },

    startGame() {
      socket.emit('start_game')
    },

    reset() {
      set({
        gameState: null,
        myId: null,
        roundResults: [],
        winner: null,
        answeredIds: new Set(),
        gladiatorHoverIndex: null,
        pendingTarget: null,
        bankBets: {},
      })
      socket.disconnect()
    },
  }
})

export const selectMe = (s: GameStore): Player | undefined =>
  s.gameState?.players.find(p => p.id === s.myId)

export const selectIsGladiator = (s: GameStore): boolean =>
  s.myId !== null && s.gameState?.gladiatorId === s.myId
