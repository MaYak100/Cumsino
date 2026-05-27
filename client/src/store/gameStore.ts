import { create } from 'zustand'
import { socket } from '../socket'
import type {
  GameState, Player, RoundResult, GameMode,
  BetUpdatedPayload, PlayerAnsweredPayload,
  GladiatorHoveringPayload, GameOverPayload,
  BankBetUpdatedPayload, RoundResultsPayload,
  ChipStagedPayload,
} from '@cumsino/shared'

interface GameStore {
  gameState: GameState | null
  myId: string | null
  roundResults: RoundResult[]
  roundCorrectAnswer: string | number | null
  roundMode: GameMode | null
  roundGladiatorId: string | null
  winner: Player | null
  answeredIds: Set<string>
  gladiatorHoverIndex: number | null
  pendingTarget: 'win' | 'lose' | null
  bankBets: Record<string, { optionIndex: number; amount: number }>
  stagedBets: Record<string, number>
  isLateJoiner: boolean

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
      stagedBets: state.phase === 'ANNOUNCE' ? {} : prev.stagedBets,
      isLateJoiner: prev.gameState === null
        ? state.phase !== 'LOBBY'          // first state: late if not in lobby
        : state.phase === 'ANNOUNCE'
          ? false                           // new round starting: no longer late
          : prev.isLateJoiner,              // keep existing value
    }))
  })

  socket.on('bet_updated', ({ playerId, amount, target }: BetUpdatedPayload) => {
    set(prev => {
      if (!prev.gameState) return prev
      const { [playerId]: _, ...restStaged } = prev.stagedBets
      return {
        gameState: {
          ...prev.gameState,
          players: prev.gameState.players.map(p =>
            p.id === playerId
              ? { ...p, currentBet: amount, ...(target ? { betTarget: target } : {}) }
              : p
          ),
        },
        stagedBets: restStaged,
      }
    })
  })

  socket.on('player_answered', ({ playerId }: PlayerAnsweredPayload) => {
    set(s => ({ answeredIds: new Set([...s.answeredIds, playerId]) }))
  })

  socket.on('gladiator_hovering', ({ optionIndex }: GladiatorHoveringPayload) => {
    set({ gladiatorHoverIndex: optionIndex })
  })

  socket.on('round_results', ({ results, correctAnswer, correctNumericAnswer, mode, gladiatorId }: RoundResultsPayload) => {
    set({
      roundResults: results,
      roundCorrectAnswer: correctAnswer ?? correctNumericAnswer ?? null,
      roundMode: mode ?? null,
      roundGladiatorId: gladiatorId ?? null,
    })
  })

  socket.on('bank_bet_updated', ({ playerId, optionIndex, amount }: BankBetUpdatedPayload) => {
    set(prev => ({
      bankBets: { ...prev.bankBets, [playerId]: { optionIndex, amount } },
    }))
  })

  socket.on('chip_staged', ({ playerId, amount }: ChipStagedPayload) => {
    set(prev => ({ stagedBets: { ...prev.stagedBets, [playerId]: amount } }))
  })

  socket.on('game_over', ({ winner }: GameOverPayload) => {
    set({ winner })
  })

  return {
    gameState: null,
    myId: null,
    roundResults: [],
    roundCorrectAnswer: null,
    roundMode: null,
    roundGladiatorId: null,
    winner: null,
    answeredIds: new Set(),
    gladiatorHoverIndex: null,
    pendingTarget: null,
    bankBets: {},
    stagedBets: {},
    isLateJoiner: false,

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
        roundCorrectAnswer: null,
        roundMode: null,
        roundGladiatorId: null,
        winner: null,
        answeredIds: new Set(),
        gladiatorHoverIndex: null,
        pendingTarget: null,
        bankBets: {},
        stagedBets: {},
        isLateJoiner: false,
      })
      socket.disconnect()
    },
  }
})

export const selectMe = (s: GameStore): Player | undefined =>
  s.gameState?.players.find(p => p.id === s.myId)

export const selectIsGladiator = (s: GameStore): boolean =>
  s.myId !== null && s.gameState?.gladiatorId === s.myId
