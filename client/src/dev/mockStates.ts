// client/src/dev/mockStates.ts
import type { FC } from 'react'
import type { GameState, GamePhase, GameMode, Player, RoundResult } from '@cumsino/shared'
import { LobbyScreen } from '../components/screens/LobbyScreen'
import { AnnounceScreen } from '../components/screens/AnnounceScreen'
import { BettingTableScreen } from '../components/screens/BettingTableScreen'
import { QuestionTextScreen } from '../components/screens/QuestionTextScreen'
import { QuestionScreen } from '../components/screens/QuestionScreen'
import { GladiatorSelfScreen } from '../components/screens/GladiatorSelfScreen'
import { ClosestScreen } from '../components/screens/ClosestScreen'
import { RevealScreen } from '../components/screens/RevealScreen'
import { LeaderboardScreen } from '../components/screens/LeaderboardScreen'
import { GameOverScreen } from '../components/screens/GameOverScreen'
import { LateJoinScreen } from '../components/screens/LateJoinScreen'
import { useGameStore } from '../store/gameStore'

type GameStoreState = ReturnType<typeof useGameStore.getState>
export type ScenarioState = Partial<Omit<GameStoreState,
  'connect' | 'setPendingTarget' | 'submitAnswer' | 'sendHover' | 'startGame' | 'reset'
>>

export interface Scenario {
  id: string
  group: string
  label: string
  state: ScenarioState
  Screen: FC
  withFelt?: boolean
}

// ── shared mock data ──────────────────────────────────────────────────────────

const MY_ID = 'dev-1'

export const PLAYER_POOL: Player[] = [
  { id: 'dev-1',  name: 'Ты',      chips: 500, currentBet: 0, hasAnswered: false },
  { id: 'dev-2',  name: 'Артём',   chips: 500, currentBet: 0, hasAnswered: false },
  { id: 'dev-3',  name: 'Света',   chips: 500, currentBet: 0, hasAnswered: false },
  { id: 'dev-4',  name: 'Никита',  chips: 500, currentBet: 0, hasAnswered: false },
  { id: 'dev-5',  name: 'Даша',    chips: 500, currentBet: 0, hasAnswered: false },
  { id: 'dev-6',  name: 'Костя',   chips: 500, currentBet: 0, hasAnswered: false },
  { id: 'dev-7',  name: 'Лена',    chips: 500, currentBet: 0, hasAnswered: false },
  { id: 'dev-8',  name: 'Паша',    chips: 500, currentBet: 0, hasAnswered: false },
  { id: 'dev-9',  name: 'Маша',    chips: 500, currentBet: 0, hasAnswered: false },
  { id: 'dev-10', name: 'Женя',    chips: 500, currentBet: 0, hasAnswered: false },
]

const BASE_PLAYERS: Player[] = [
  { id: 'dev-1', name: 'Ты',    chips: 580, currentBet: 0, hasAnswered: false },
  { id: 'dev-2', name: 'Артём', chips: 350, currentBet: 0, hasAnswered: false },
  { id: 'dev-3', name: 'Света', chips: 740, currentBet: 0, hasAnswered: false },
  { id: 'dev-4', name: 'Никита',chips: 420, currentBet: 0, hasAnswered: false },
]

const MC_QUESTION = {
  id: 'q-mc-1',
  mode: 'all' as GameMode,
  topic: 'Способность',
  text: 'Как работает врожденная способность Bone Chill при наличии нескольких стаков на одной цели?',
  options: [
    'Стаки имеют независимые длительности и суммируются',
    'Каждый новый стак перезагружает длительность предыдущего',
    'Максимум 2 стака действует одновременно',
    'Эффект не суммируется, только один стак может быть активен',
  ],
}

const CN_QUESTION = {
  id: 'q-cn-1',
  mode: 'closest' as GameMode,
  topic: 'Цена',
  text: 'Сколько стоит Blink Dagger?',
}

const BET_PLAYERS: Player[] = [
  { id: 'dev-1', name: 'Ты',     chips: 480, currentBet: 100, betChips: [100],     hasAnswered: false },
  { id: 'dev-2', name: 'Артём',  chips: 250, currentBet: 100, betChips: [50, 50],  hasAnswered: false },
  { id: 'dev-3', name: 'Света',  chips: 590, currentBet: 150, betChips: [100, 50], hasAnswered: false },
  { id: 'dev-4', name: 'Никита', chips: 370, currentBet: 50,  betChips: [50],      hasAnswered: false },
]

function base(phase: GamePhase, mode: GameMode, overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'dev-room',
    phase,
    roundIndex: 2,
    lastMainMode: 'all',
    mode,
    currentQuestion: null,
    hostId: 'dev-1',
    players: BASE_PLAYERS,
    phaseTimeLeft: 25,
    ...overrides,
  }
}

// ── scenarios ─────────────────────────────────────────────────────────────────

export const SCENARIOS: Scenario[] = [
  // ── LOBBY ──
  {
    id: 'lobby-host',
    group: 'LOBBY',
    label: 'host',
    Screen: LobbyScreen,
    state: { myId: MY_ID, gameState: base('LOBBY', 'all', { hostId: 'dev-1' }) },
  },
  {
    id: 'lobby-nonhost',
    group: 'LOBBY',
    label: 'non-host',
    Screen: LobbyScreen,
    state: { myId: MY_ID, gameState: base('LOBBY', 'all', { hostId: 'dev-2' }) },
  },

  // ── ANNOUNCE ──
  {
    id: 'announce-all',
    group: 'ANNOUNCE',
    label: 'all',
    Screen: AnnounceScreen,
    state: { myId: MY_ID, gameState: base('ANNOUNCE', 'all', { currentQuestion: MC_QUESTION }) },
  },
  {
    id: 'announce-kerri',
    group: 'ANNOUNCE',
    label: 'kerri',
    Screen: AnnounceScreen,
    state: { myId: MY_ID, gameState: base('ANNOUNCE', 'kerri', { currentQuestion: MC_QUESTION, gladiatorId: 'dev-2' }) },
  },
  {
    id: 'announce-closest',
    group: 'ANNOUNCE',
    label: 'closest',
    Screen: AnnounceScreen,
    state: { myId: MY_ID, gameState: base('ANNOUNCE', 'closest', { currentQuestion: CN_QUESTION }) },
  },

  // ── BETTING ──
  {
    id: 'betting-all',
    group: 'BETTING',
    label: 'all',
    Screen: BettingTableScreen,
    withFelt: true,
    state: {
      myId: MY_ID,
      gameState: base('BETTING', 'all', {
        currentQuestion: MC_QUESTION,
        players: [
          { id: 'dev-1', name: 'Ты',     chips: 580, currentBet: 0,   hasAnswered: false },
          { id: 'dev-2', name: 'Артём',  chips: 250, currentBet: 100, betChips: [50, 50],   hasAnswered: false },
          { id: 'dev-3', name: 'Света',  chips: 540, currentBet: 200, betChips: [100, 100], hasAnswered: false },
          { id: 'dev-4', name: 'Никита', chips: 420, currentBet: 0,   hasAnswered: false },
        ],
      }),
      bankBets: {},
      stagedBets: {},
    },
  },
  {
    id: 'betting-kerri-crowd',
    group: 'BETTING',
    label: 'kerri — crowd',
    Screen: BettingTableScreen,
    withFelt: true,
    state: {
      myId: MY_ID,
      pendingTarget: 'win',
      gameState: base('BETTING', 'kerri', {
        currentQuestion: MC_QUESTION,
        gladiatorId: 'dev-2',
        gladiatorAnswer: MC_QUESTION.options[0],
        players: [
          { id: 'dev-1', name: 'Ты',     chips: 580, currentBet: 0,   betTarget: 'win', hasAnswered: false },
          { id: 'dev-2', name: 'Артём',  chips: 250, currentBet: 100, betChips: [100],  hasAnswered: false },
          { id: 'dev-3', name: 'Света',  chips: 540, currentBet: 0,                     hasAnswered: false },
          { id: 'dev-4', name: 'Никита', chips: 370, currentBet: 150, betChips: [100, 50], betTarget: 'lose', hasAnswered: false },
        ],
      }),
      bankBets: { 'dev-4': { optionIndex: 2, amount: 50 } },
      stagedBets: {},
    },
  },
  {
    id: 'betting-kerri-gladiator',
    group: 'BETTING',
    label: 'kerri — гладиатор',
    Screen: BettingTableScreen,
    withFelt: true,
    state: {
      myId: MY_ID,
      gameState: base('BETTING', 'kerri', {
        currentQuestion: MC_QUESTION,
        gladiatorId: 'dev-1',
        players: BASE_PLAYERS,
      }),
      bankBets: {},
      stagedBets: {},
    },
  },

  // ── QUESTION_TEXT ──
  {
    id: 'question-text',
    group: 'QUESTION_TEXT',
    label: 'universal',
    Screen: QuestionTextScreen,
    state: { myId: MY_ID, gameState: base('QUESTION_TEXT', 'all', { currentQuestion: MC_QUESTION }) },
  },

  // ── QUESTION ──
  {
    id: 'question-all',
    group: 'QUESTION',
    label: 'all',
    Screen: QuestionScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'all', { currentQuestion: MC_QUESTION, players: BET_PLAYERS }),
      roundCorrectAnswer: null,
      answeredIds: new Set<string>(['dev-2', 'dev-3']),
    },
  },
  {
    id: 'question-all-reveal',
    group: 'QUESTION',
    label: 'all + ответ',
    Screen: QuestionScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'all', { currentQuestion: MC_QUESTION, players: BET_PLAYERS }),
      roundCorrectAnswer: MC_QUESTION.options[0],
      answeredIds: new Set<string>(['dev-1', 'dev-2', 'dev-3', 'dev-4']),
    },
  },
  {
    id: 'question-kerri-crowd',
    group: 'QUESTION',
    label: 'kerri — crowd',
    Screen: QuestionScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'kerri', {
        currentQuestion: MC_QUESTION,
        gladiatorId: 'dev-2',
        gladiatorAnswer: MC_QUESTION.options[0],
        players: BET_PLAYERS,
      }),
      roundCorrectAnswer: null,
      gladiatorHoverIndex: 0,
    },
  },
  {
    id: 'question-kerri-gladiator',
    group: 'QUESTION',
    label: 'керри — гладиатор',
    Screen: GladiatorSelfScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'kerri', {
        currentQuestion: MC_QUESTION,
        gladiatorId: 'dev-1',
        players: BET_PLAYERS,
      }),
      roundCorrectAnswer: null,
    },
  },
  {
    id: 'question-closest',
    group: 'QUESTION',
    label: 'closest',
    Screen: ClosestScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'closest', { currentQuestion: CN_QUESTION, players: BET_PLAYERS }),
      roundCorrectAnswer: null,
    },
  },
  {
    id: 'question-closest-reveal',
    group: 'QUESTION',
    label: 'closest + ответ',
    Screen: ClosestScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'closest', { currentQuestion: CN_QUESTION, players: BET_PLAYERS }),
      roundCorrectAnswer: 2250,
    },
  },

  // ── REVEAL ──
  {
    id: 'reveal-all',
    group: 'REVEAL',
    label: 'all',
    Screen: RevealScreen,
    state: {
      myId: MY_ID,
      gameState: base('REVEAL', 'all', {
        players: [
          { id: 'dev-1', name: 'Ты',     chips: 780, currentBet: 100, betChips: [100],     hasAnswered: true, answer: 'Anti-Mage' },
          { id: 'dev-2', name: 'Артём',  chips: 250, currentBet: 100, betChips: [50, 50],  hasAnswered: true, answer: 'Invoker'   },
          { id: 'dev-3', name: 'Света',  chips: 890, currentBet: 150, betChips: [100, 50], hasAnswered: true, answer: 'Anti-Mage' },
          { id: 'dev-4', name: 'Никита', chips: 370, currentBet: 50,  betChips: [50],      hasAnswered: true, answer: 'Pugna'     },
        ],
      }),
      roundResults: [
        { playerId: 'dev-1', delta: 200, chipBreakdown: { 500: 0, 100: 2, 50: 0, 20: 0, 10: 0 } },
        { playerId: 'dev-2', delta: -100, chipBreakdown: { 500: 0, 100: 0, 50: 0, 20: 0, 10: 0 } },
        { playerId: 'dev-3', delta: 150, chipBreakdown: { 500: 0, 100: 1, 50: 1, 20: 0, 10: 0 } },
        { playerId: 'dev-4', delta: -50, chipBreakdown: { 500: 0, 100: 0, 50: 0, 20: 0, 10: 0 } },
      ] as RoundResult[],
      roundCorrectAnswer: MC_QUESTION.options[0],
      roundMode: 'all',
      roundGladiatorId: null,
    },
  },
  {
    id: 'reveal-kerri',
    group: 'REVEAL',
    label: 'kerri',
    Screen: RevealScreen,
    state: {
      myId: MY_ID,
      gameState: base('REVEAL', 'kerri', {
        gladiatorId: 'dev-2',
        players: [
          { id: 'dev-1', name: 'Ты',     chips: 680, currentBet: 100, betChips: [100],     hasAnswered: true, betTarget: 'win'  },
          { id: 'dev-2', name: 'Артём',  chips: 200, currentBet: 100, betChips: [50, 50],  hasAnswered: true, answer: 'Invoker' },
          { id: 'dev-3', name: 'Света',  chips: 690, currentBet: 150, betChips: [100, 50], hasAnswered: true, betTarget: 'lose' },
          { id: 'dev-4', name: 'Никита', chips: 470, currentBet: 50,  betChips: [50],      hasAnswered: true, betTarget: 'win'  },
        ],
      }),
      roundResults: [
        { playerId: 'dev-1', delta: 100,  chipBreakdown: { 500: 0, 100: 1, 50: 0, 20: 0, 10: 0 } },
        { playerId: 'dev-2', delta: -100, chipBreakdown: { 500: 0, 100: 0, 50: 0, 20: 0, 10: 0 } },
        { playerId: 'dev-3', delta: -150, chipBreakdown: { 500: 0, 100: 0, 50: 0, 20: 0, 10: 0 } },
        { playerId: 'dev-4', delta: 50,   chipBreakdown: { 500: 0, 100: 0, 50: 1, 20: 0, 10: 0 } },
      ] as RoundResult[],
      roundCorrectAnswer: MC_QUESTION.options[0],
      roundMode: 'kerri',
      roundGladiatorId: 'dev-2',
    },
  },
  {
    id: 'reveal-closest',
    group: 'REVEAL',
    label: 'closest',
    Screen: RevealScreen,
    state: {
      myId: MY_ID,
      gameState: base('REVEAL', 'closest', {
        players: [
          { id: 'dev-1', name: 'Ты',     chips: 580, currentBet: 0, hasAnswered: true, answer: 2300 },
          { id: 'dev-2', name: 'Артём',  chips: 350, currentBet: 0, hasAnswered: true, answer: 2100 },
          { id: 'dev-3', name: 'Света',  chips: 990, currentBet: 0, hasAnswered: true, answer: 2250 },
          { id: 'dev-4', name: 'Никита', chips: 370, currentBet: 0, hasAnswered: true, answer: 1800 },
        ],
      }),
      roundResults: [
        { playerId: 'dev-3', delta: 250, chipBreakdown: { 500: 0, 100: 2, 50: 1, 20: 0, 10: 0 } },
        { playerId: 'dev-1', delta: 0,   chipBreakdown: { 500: 0, 100: 0, 50: 0, 20: 0, 10: 0 } },
        { playerId: 'dev-2', delta: 0,   chipBreakdown: { 500: 0, 100: 0, 50: 0, 20: 0, 10: 0 } },
        { playerId: 'dev-4', delta: 0,   chipBreakdown: { 500: 0, 100: 0, 50: 0, 20: 0, 10: 0 } },
      ] as RoundResult[],
      roundCorrectAnswer: 2250,
      roundMode: 'closest',
      roundGladiatorId: null,
    },
  },

  // ── LEADERBOARD ──
  {
    id: 'leaderboard',
    group: 'LEADERBOARD',
    label: 'leaderboard',
    Screen: LeaderboardScreen,
    state: {
      myId: MY_ID,
      gameState: base('LEADERBOARD', 'all', {
        roundIndex: 3,
        players: [
          { id: 'dev-1', name: 'Ты',     chips: 780, currentBet: 0, hasAnswered: false },
          { id: 'dev-2', name: 'Артём',  chips: 250, currentBet: 0, hasAnswered: false },
          { id: 'dev-3', name: 'Света',  chips: 990, currentBet: 0, hasAnswered: false },
          { id: 'dev-4', name: 'Никита', chips: 370, currentBet: 0, hasAnswered: false },
        ],
      }),
    },
  },

  // ── GAME_OVER ──
  {
    id: 'game-over-lose',
    group: 'GAME_OVER',
    label: 'проиграл',
    Screen: GameOverScreen,
    state: {
      myId: MY_ID,
      gameState: base('GAME_OVER', 'all'),
      winner: { id: 'dev-3', name: 'Света', chips: 3100, currentBet: 0, hasAnswered: false },
    },
  },
  {
    id: 'game-over-win',
    group: 'GAME_OVER',
    label: 'победил',
    Screen: GameOverScreen,
    state: {
      myId: MY_ID,
      gameState: base('GAME_OVER', 'all'),
      winner: { id: 'dev-1', name: 'Ты', chips: 3050, currentBet: 0, hasAnswered: false },
    },
  },

  // ── LATE JOIN ──
  {
    id: 'late-join',
    group: 'LATE JOIN',
    label: 'late join',
    Screen: LateJoinScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'all', { currentQuestion: MC_QUESTION }),
      isLateJoiner: true,
    },
  },
]
