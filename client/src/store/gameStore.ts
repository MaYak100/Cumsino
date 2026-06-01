import { create } from 'zustand'
import { socket } from '../socket'
import type {
  GameState, Player, RoundResult, GameMode,
  BetUpdatedPayload, PlayerAnsweredPayload,
  GladiatorHoveringPayload, GameOverPayload,
  BankBetUpdatedPayload, RoundResultsPayload,
  ChipStagedPayload,
  BribePromptPayload, BribeMsgPayload,
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
  stagedBets: Record<string, number[]>
  isLateJoiner: boolean
  bribePrompt: { amount: number; startedAt: number } | null
  bribeEliminatedIdx: number | null
  gladiatorBribeMsg: { type: 'helping' | 'betrayed' | 'helped'; key: number } | null

  payBribe: () => void
  clearGladiatorBribeMsg: () => void

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
    set(prev => {
      const newRound =
        prev.gameState !== null && state.roundIndex !== prev.gameState.roundIndex
      const clearRound = state.phase === 'ANNOUNCE' || newRound
      const clearBribe = clearRound || state.phase !== 'QUESTION'
      return {
        gameState: state,
        answeredIds: new Set(),
        gladiatorHoverIndex: null,
        roundResults: clearRound ? [] : prev.roundResults,
        roundCorrectAnswer: clearRound ? null : prev.roundCorrectAnswer,
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
        gladiatorBribeMsg: clearRound ? null : prev.gladiatorBribeMsg,
      }
    })
  })

  socket.on('bet_updated', ({ playerId, amount, target, chips }: BetUpdatedPayload) => {
    set(prev => {
      if (!prev.gameState) return prev
      return {
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

  socket.on('chip_staged', ({ playerId, chips }: ChipStagedPayload) => {
    set(prev => ({ stagedBets: { ...prev.stagedBets, [playerId]: chips } }))
  })

  socket.on('bribe_prompt', ({ amount }: BribePromptPayload) => {
    set({ bribePrompt: { amount, startedAt: Date.now() } })
  })

  socket.on('bribe_prompt_cancel', () => {
    set({ bribePrompt: null })
  })

  socket.on('bribe_msg', ({ type, eliminatedOptionIndex }: BribeMsgPayload) => {
    set(prev => ({
      gladiatorBribeMsg: { type, key: Date.now() },
      bribeEliminatedIdx:
        eliminatedOptionIndex !== undefined ? eliminatedOptionIndex : prev.bribeEliminatedIdx,
    }))
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
    bribePrompt: null,
    bribeEliminatedIdx: null,
    gladiatorBribeMsg: null,

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

    payBribe() {
      socket.emit('pay_bribe')
      set({ bribePrompt: null })
    },

    clearGladiatorBribeMsg() {
      set({ gladiatorBribeMsg: null })
    },
  }
})

export const selectMe = (s: GameStore): Player | undefined =>
  s.gameState?.players.find(p => p.id === s.myId)

export const selectIsGladiator = (s: GameStore): boolean =>
  s.myId !== null && s.gameState?.gladiatorId === s.myId
