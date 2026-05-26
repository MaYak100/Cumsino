import { create } from 'zustand'
import { socket } from '../socket'
import type {
  GameState, Player, RoundResult,
  BetUpdatedPayload, PlayerAnsweredPayload,
  GladiatorHoveringPayload, GameOverPayload,
} from '@cumsino/shared'

interface GameStore {
  gameState: GameState | null
  myId: string | null
  roundResults: RoundResult[]
  winner: Player | null
  answeredIds: Set<string>
  gladiatorHoverIndex: number | null
  pendingBet: number
  pendingTarget: 'win' | 'lose' | null

  connect: (name: string, gameCode: string) => void
  addChipToBet: (value: number) => void
  removeLastChip: (value: number) => void
  confirmBet: () => void
  setPendingTarget: (target: 'win' | 'lose') => void
  submitAnswer: (answer: string | number | string[]) => void
  sendHover: (optionIndex: number | null) => void
  startGame: () => void
  reset: () => void
}

export const useGameStore = create<GameStore>((set, get) => {
  socket.on('connect', () => {
    set({ myId: socket.id ?? null })
  })

  socket.on('game_state', (state: GameState) => {
    set(prev => ({
      gameState: state,
      answeredIds: new Set(),
      gladiatorHoverIndex: null,
      roundResults: state.phase === 'ANNOUNCE' ? [] : prev.roundResults,
    }))
  })

  socket.on('bet_updated', (_payload: BetUpdatedPayload) => {
    // Updates come via game_state; bet_updated is for future animations
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
    pendingBet: 0,
    pendingTarget: null,

    connect(name, gameCode) {
      if (!socket.connected) socket.connect()
      socket.emit('join_game', { name, gameCode })
    },

    addChipToBet(value) {
      const { gameState, myId, pendingBet } = get()
      if (!gameState || !myId) return
      const me = gameState.players.find(p => p.id === myId)
      if (!me) return
      if (pendingBet + value > me.chips) return
      set({ pendingBet: pendingBet + value })
    },

    removeLastChip(value) {
      const { pendingBet } = get()
      set({ pendingBet: Math.max(0, pendingBet - value) })
    },

    confirmBet() {
      const { pendingBet, pendingTarget } = get()
      if (pendingBet <= 0) return
      socket.emit('place_bet', { amount: pendingBet, target: pendingTarget ?? undefined })
      set({ pendingBet: 0, pendingTarget: null })
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
        pendingBet: 0,
        pendingTarget: null,
      })
      socket.disconnect()
    },
  }
})

export const selectMe = (s: GameStore): Player | undefined =>
  s.gameState?.players.find(p => p.id === s.myId)

export const selectIsGladiator = (s: GameStore): boolean =>
  s.myId !== null && s.gameState?.gladiatorId === s.myId
