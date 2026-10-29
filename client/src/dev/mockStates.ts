// client/src/dev/mockStates.ts
import type { FC } from 'react'
import type { GameState, GamePhase, GameMode, Player, RoundResult } from '@cumsino/shared'
import { ITEM_ORDER, itemPrice } from '@cumsino/shared'
import { LobbyScreen } from '../components/screens/LobbyScreen'
import { ShopScreen } from '../components/screens/ShopScreen'
import { AnnounceScreen } from '../components/screens/AnnounceScreen'
import { BettingTableScreen } from '../components/screens/BettingTableScreen'
import { QuestionScreen } from '../components/screens/QuestionScreen'
import { GladiatorSelfScreen } from '../components/screens/GladiatorSelfScreen'
import { ClosestScreen } from '../components/screens/ClosestScreen'
import { RoundResultsScreen } from '../components/screens/RoundResultsScreen'
import { GameOverScreen } from '../components/screens/GameOverScreen'
import { LateJoinScreen } from '../components/screens/LateJoinScreen'
import { useGameStore } from '../store/gameStore'

type GameStoreState = ReturnType<typeof useGameStore.getState>
export type ScenarioState = Partial<Omit<GameStoreState,
  'connect' | 'setPendingTarget' | 'submitAnswer' | 'sendHover' | 'startGame' | 'reset'
  | 'payBribe'
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
  { id: 'dev-1', name: 'Ты',     chips: 580, currentBet: 0, hasAnswered: false },
  { id: 'dev-2', name: 'Артём',  chips: 350, currentBet: 0, hasAnswered: false },
  { id: 'dev-3', name: 'Света',  chips: 740, currentBet: 0, hasAnswered: false },
  { id: 'dev-4', name: 'Никита', chips: 420, currentBet: 0, hasAnswered: false },
]

// MC question — abilities-style, heroName → displayTopic
const MC_QUESTION = {
  id: 'q-mc-1',
  mode: 'all' as GameMode,
  topic: 'Способность',
  displayTopic: 'Bone Chill',
  text: 'Как работает врожденная способность Bone Chill при наличии нескольких стаков на одной цели?',
  options: [
    'Стаки имеют независимые длительности и суммируются',
    'Каждый новый стак перезагружает длительность предыдущего',
    'Максимум 2 стака действует одновременно',
    'Эффект не суммируется, только один стак может быть активен',
  ],
}

// General question — has displayTopic; comment приходит в round_results (roundComment)
const POPULAR_QUESTION = {
  id: 'q-mc-popular',
  mode: 'all' as GameMode,
  topic: 'Общие вопросы',
  displayTopic: 'Популярность героев',
  text: 'Какой из следующих героев обладает наибольшим количеством сыгранных матчей?',
  options: ['Axe', 'Rubick', 'Earthshaker', 'Anti-Mage'],
}
const POPULAR_COMMENT = 'Axe: 55 201 608 | Rubick: 52 902 622 | Earthshaker: 46 783 120 | Anti-Mage: 43 359 528'

// Вопросы с подписями значений вариантов (roundOptionNotes — по индексу options, options[0] правильный)
const HEAL_QUESTION = {
  id: 'q-mc-heal',
  mode: 'all' as GameMode,
  topic: 'Средние за матч',
  displayTopic: 'Хил союзникам',
  text: 'Кто из героев в среднем лечит союзников больше всех за матч?',
  options: ['Oracle', 'Dazzle', 'Warlock', 'Keeper of the Light'],
}
const HEAL_NOTES = ['10.1к', '7.4к', '5.8к', '4.9к']
const COUNTER_QUESTION = {
  id: 'q-mc-counter',
  mode: 'kerri' as GameMode,
  topic: 'Контрпики',
  displayTopic: 'Anti-Mage',
  text: 'Против кого Anti-Mage выигрывает реже всего?',
  options: ['Meepo', 'Slardar', 'Troll Warlord', 'Bristleback'],
}
const COUNTER_NOTES = ['−7.0', '−4.3', '−4.3', '+3.7']
const TALENT_QUESTION = {
  id: 'q-mc-talent',
  mode: 'all' as GameMode,
  topic: 'Таланты',
  displayTopic: 'Таланты: Shadow Shaman',
  text: 'Какой из талантов Shadow Shaman на 20 и 25 уровне берут чаще всего?',
  options: [
    '20 ур.: +1.5 сек. действия Shackles',
    '20 ур.: +50% к атакам для убийства тотема от Mass Serpent Ward',
    '25 ур.: +250 к урону от Ether Shock',
    '25 ур.: +1 цель атаки тотемов от Mass Serpent Ward',
  ],
}
const TALENT_NOTES = ['73%', '27%', '37%', '63%']

// CN question — closest mode
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

const FRIEND_ROSTER = [
  { id: 1101588971, name: 'выбрудок' }, { id: 910030283, name: 'Блох Иглы' }, { id: 841374410, name: 'ональный трахадоr' },
  { id: 1023791464, name: 'DUPEHb' }, { id: 875585992, name: 'Питахайль' }, { id: 1259367416, name: 'гнилой кулич' },
  { id: 1548018309, name: 'Rocinante' },
]

function base(phase: GamePhase, mode: GameMode, overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'KX7Q',
    phase,
    roundIndex: 2,
    lastMainMode: 'all',
    mode,
    currentQuestion: null,
    hostId: 'dev-1',
    players: BASE_PLAYERS,
    phaseTimeLeft: 25,
    friendRoster: FRIEND_ROSTER,
    // свой запас и цены — чтобы в сценариях была видна панель предметов
    inventory: { blink: 2, gem: 1, manta: 1, hex: 1 },
    prices: Object.fromEntries(ITEM_ORDER.map(id => [id, itemPrice(id, 580)])) as GameState['prices'],
    ...overrides,
  }
}

// ── scenarios ─────────────────────────────────────────────────────────────────

export const SCENARIOS: Scenario[] = [

  // ── SHOP ──
  {
    id: 'shop',
    group: 'SHOP',
    label: 'лавка перед «для всех»',
    Screen: ShopScreen,
    state: {
      myId: MY_ID,
      gameState: base('SHOP', 'all', {
        phaseTimeLeft: 25,
        players: [
          { id: 'dev-1', name: 'Ты',     chips: 580, currentBet: 0, hasAnswered: false },
          { id: 'dev-2', name: 'Артём',  chips: 350, currentBet: 0, hasAnswered: false, shopReady: true },
          { id: 'dev-3', name: 'Света',  chips: 740, currentBet: 0, hasAnswered: false },
          { id: 'dev-4', name: 'Никита', chips: 420, currentBet: 0, hasAnswered: false, shopReady: true },
        ],
      }),
    },
  },

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
  {
    id: 'lobby-friends',
    group: 'LOBBY',
    label: '«кто ты» — двое назвались',
    Screen: LobbyScreen,
    state: {
      myId: MY_ID,
      gameState: base('LOBBY', 'all', {
        players: BASE_PLAYERS.map((p, i) => (i === 0 ? { ...p, friendId: 1101588971 } : i === 2 ? { ...p, friendId: 1023791464 } : p)),
      }),
    },
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
    state: { myId: MY_ID, gameState: base('ANNOUNCE', 'kerri', { currentQuestion: MC_QUESTION }) },
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
      gameState: base('BETTING', 'kerri', {
        currentQuestion: MC_QUESTION,
        gladiatorId: 'dev-2',
        gladiatorAnswer: MC_QUESTION.options[0],
        players: [
          { id: 'dev-1', name: 'Ты',     chips: 580, currentBet: 0,   hasAnswered: false },
          { id: 'dev-2', name: 'Артём',  chips: 250, currentBet: 100, betChips: [100],         hasAnswered: false },
          { id: 'dev-3', name: 'Света',  chips: 540, currentBet: 0,                            hasAnswered: false },
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

  // ── QUESTION ──
  {
    id: 'betting-all-items',
    group: 'BETTING',
    label: 'all + блайнды, хекс, серии',
    Screen: BettingTableScreen,
    withFelt: true,
    state: {
      myId: MY_ID,
      gameState: base('BETTING', 'all', {
        currentQuestion: MC_QUESTION,
        players: [
          { id: 'dev-1', name: 'Ты',     chips: 580, currentBet: 0,   hasAnswered: false, blind: 30, streak: 2, effects: ['aegis'] },
          { id: 'dev-2', name: 'Артём',  chips: 250, currentBet: 100, betChips: [50, 50], hasAnswered: false, blind: 20, effects: ['hex'] },
          { id: 'dev-3', name: 'Света',  chips: 740, currentBet: 200, betChips: [100, 100], hasAnswered: false, blind: 80, bigBlind: true, streak: 4, effects: ['bkb'] },
          { id: 'dev-4', name: 'Никита', chips: 420, currentBet: 0,   hasAnswered: false, blind: 30 },
        ],
      }),
      bankBets: {},
      stagedBets: {},
      // как в игре: бирка «только что применили» живёт ~3 с после открытия сценария
      itemFeed: [{ playerId: 'dev-3', item: 'hex', targetId: 'dev-2', at: Date.now() }],
    },
  },
  {
    id: 'question-all-items',
    group: 'QUESTION',
    label: 'all + гем, блинк, смок, хекс',
    Screen: QuestionScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'all', {
        currentQuestion: MC_QUESTION,
        hexTimeLeft: 9,
        removedOptions: [3],
        players: [
          { id: 'dev-1', name: 'Ты',     chips: 480, currentBet: 100, hasAnswered: true, streak: 2, effects: ['hex'] },
          { id: 'dev-2', name: 'Артём',  chips: 250, currentBet: 100, hasAnswered: true, effects: ['bkb'] },
          { id: 'dev-3', name: 'Света',  chips: 590, currentBet: 150, hasAnswered: false, streak: 3 },
          { id: 'dev-4', name: 'Никита', chips: 370, currentBet: 50,  hasAnswered: false, effects: ['smoke'] },
        ],
      }),
      roundCorrectAnswer: null,
      answeredIds: new Set<string>(['dev-1', 'dev-2']),
      gemResults: { 'dev-2': { answer: MC_QUESTION.options[1], smoked: false } },
      gemmedOnMe: 1,
      itemFeed: [{ playerId: 'dev-2', item: 'blink', at: Date.now() }],
    },
  },
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
    label: 'all + раскрытие',
    Screen: QuestionScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'all', { currentQuestion: POPULAR_QUESTION, players: BET_PLAYERS }),
      roundCorrectAnswer: POPULAR_QUESTION.options[0],
      roundComment: POPULAR_COMMENT,
      roundOptionNotes: null,
      answeredIds: new Set<string>(['dev-1', 'dev-2', 'dev-3', 'dev-4']),
    },
  },
  {
    id: 'question-all-reveal-notes',
    group: 'QUESTION',
    label: 'all + раскрытие + значения',
    Screen: QuestionScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'all', { currentQuestion: HEAL_QUESTION, players: BET_PLAYERS }),
      roundCorrectAnswer: HEAL_QUESTION.options[0],
      roundComment: null,
      roundOptionNotes: HEAL_NOTES,
      answeredIds: new Set<string>(['dev-1', 'dev-2', 'dev-3', 'dev-4']),
    },
  },
  {
    id: 'question-all-reveal-long',
    group: 'QUESTION',
    label: 'all + значения + длинные варианты',
    Screen: QuestionScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'all', { currentQuestion: TALENT_QUESTION, players: BET_PLAYERS }),
      roundCorrectAnswer: TALENT_QUESTION.options[0],
      roundComment: 'Доля внутри пары талантов одного уровня (STRATZ, 7.41f, все ранги).',
      roundOptionNotes: TALENT_NOTES,
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
    label: 'kerri — гладиатор',
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
    id: 'question-kerri-gladiator-reveal',
    group: 'QUESTION',
    label: 'kerri — гладиатор + раскрытие',
    Screen: GladiatorSelfScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'kerri', {
        currentQuestion: POPULAR_QUESTION,
        gladiatorId: 'dev-1',
        players: BET_PLAYERS,
      }),
      roundCorrectAnswer: POPULAR_QUESTION.options[0],
      roundComment: POPULAR_COMMENT,
      roundOptionNotes: null,
    },
  },
  {
    id: 'question-kerri-gladiator-reveal-notes',
    group: 'QUESTION',
    label: 'kerri — гладиатор + значения',
    Screen: GladiatorSelfScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'kerri', {
        currentQuestion: COUNTER_QUESTION,
        gladiatorId: 'dev-1',
        players: BET_PLAYERS,
      }),
      roundCorrectAnswer: COUNTER_QUESTION.options[0],
      roundComment: 'Преимущество Anti-Mage против героя, п.п.',
      roundOptionNotes: COUNTER_NOTES,
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
    label: 'closest + раскрытие',
    Screen: ClosestScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'closest', {
        currentQuestion: CN_QUESTION,
        players: BET_PLAYERS.map((p, i) => ({ ...p, hasAnswered: true, answer: [2400, 1900, 2250, 3100][i] })),
      }),
      roundCorrectAnswer: 2250,
    },
  },

  // ── QUESTION — bribe event ──
  {
    id: 'question-kerri-crowd-bribe-win',
    group: 'QUESTION',
    label: 'kerri — взятка (Ответит)',
    Screen: QuestionScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'kerri', {
        currentQuestion: MC_QUESTION,
        gladiatorId: 'dev-2',
        gladiatorAnswer: MC_QUESTION.options[0],
        players: [
          { id: 'dev-1', name: 'Ты',     chips: 480, currentBet: 100, betTarget: 'win',  hasAnswered: false },
          { id: 'dev-2', name: 'Артём',  chips: 250, currentBet: 0,   hasAnswered: false },
          { id: 'dev-3', name: 'Света',  chips: 590, currentBet: 150, betTarget: 'lose', hasAnswered: false },
          { id: 'dev-4', name: 'Никита', chips: 370, currentBet: 100, betTarget: 'win',  hasAnswered: false },
        ],
      }),
      bribePrompt: { amount: 50, startedAt: 0, cycleIndex: 0 },
      roundCorrectAnswer: null,
    },
  },
  {
    id: 'question-kerri-crowd-bribe-win-cycle2',
    group: 'QUESTION',
    label: 'kerri — взятка (Ответит, 2й круг)',
    Screen: QuestionScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'kerri', {
        currentQuestion: MC_QUESTION,
        gladiatorId: 'dev-2',
        gladiatorAnswer: MC_QUESTION.options[0],
        players: [
          { id: 'dev-1', name: 'Ты',     chips: 480, currentBet: 100, betTarget: 'win',  hasAnswered: false },
          { id: 'dev-2', name: 'Артём',  chips: 250, currentBet: 0,   hasAnswered: false },
          { id: 'dev-3', name: 'Света',  chips: 590, currentBet: 150, betTarget: 'lose', hasAnswered: false },
          { id: 'dev-4', name: 'Никита', chips: 370, currentBet: 100, betTarget: 'win',  hasAnswered: false },
        ],
      }),
      bribePrompt: { amount: 75, startedAt: 0, cycleIndex: 1 },
      roundCorrectAnswer: null,
    },
  },
  {
    id: 'question-kerri-crowd-bribe-lose',
    group: 'QUESTION',
    label: 'kerri — взятка (Завалит)',
    Screen: QuestionScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'kerri', {
        currentQuestion: MC_QUESTION,
        gladiatorId: 'dev-2',
        gladiatorAnswer: MC_QUESTION.options[0],
        players: [
          { id: 'dev-1', name: 'Ты',     chips: 480, currentBet: 100, betTarget: 'lose', hasAnswered: false },
          { id: 'dev-2', name: 'Артём',  chips: 250, currentBet: 0,   hasAnswered: false },
          { id: 'dev-3', name: 'Света',  chips: 590, currentBet: 150, betTarget: 'win',  hasAnswered: false },
          { id: 'dev-4', name: 'Никита', chips: 370, currentBet: 100, betTarget: 'lose', hasAnswered: false },
        ],
      }),
      bribePrompt: { amount: 75, startedAt: 0, cycleIndex: 0 },
      roundCorrectAnswer: null,
    },
  },
  {
    id: 'question-kerri-gladiator-eliminated',
    group: 'QUESTION',
    label: 'керри — гладиатор + убранный вариант',
    Screen: GladiatorSelfScreen,
    state: {
      myId: MY_ID,
      gameState: base('QUESTION', 'kerri', {
        currentQuestion: MC_QUESTION,
        gladiatorId: 'dev-1',
        players: BET_PLAYERS,
      }),
      bribeEliminatedIdx: 2,
      roundCorrectAnswer: null,
    },
  },
  // ── REVEAL ──
  {
    id: 'reveal-all',
    group: 'REVEAL',
    label: 'all',
    Screen: RoundResultsScreen,
    state: {
      myId: MY_ID,
      gameState: base('REVEAL', 'all', {
        currentQuestion: MC_QUESTION,
        players: [
          { id: 'dev-1', name: 'Ты',     chips: 780, currentBet: 100, hasAnswered: true, answer: MC_QUESTION.options[0] },
          { id: 'dev-2', name: 'Артём',  chips: 250, currentBet: 100, hasAnswered: true, answer: MC_QUESTION.options[1] },
          { id: 'dev-3', name: 'Света',  chips: 890, currentBet: 150, hasAnswered: true, answer: MC_QUESTION.options[0] },
          { id: 'dev-4', name: 'Никита', chips: 370, currentBet: 50,  hasAnswered: true, answer: MC_QUESTION.options[2] },
        ],
      }),
      roundResults: [
        { playerId: 'dev-1', delta: 200,  chipBreakdown: { 500:0,100:2,50:0,20:0,10:0 }, sources: [{ label: 'Ответил верно',   delta: 200  }] },
        { playerId: 'dev-2', delta: -100, chipBreakdown: { 500:0,100:0,50:0,20:0,10:0 }, sources: [{ label: 'Ответил неверно', delta: -100 }] },
        { playerId: 'dev-3', delta: 150,  chipBreakdown: { 500:0,100:1,50:1,20:0,10:0 }, sources: [{ label: 'Ответил верно',   delta: 150  }] },
        { playerId: 'dev-4', delta: -50,  chipBreakdown: { 500:0,100:0,50:0,20:0,10:0 }, sources: [{ label: 'Ответил неверно', delta: -50  }] },
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
    Screen: RoundResultsScreen,
    state: {
      myId: MY_ID,
      gameState: base('REVEAL', 'kerri', {
        gladiatorId: 'dev-2',
        currentQuestion: MC_QUESTION,
        players: [
          { id: 'dev-1', name: 'Ты',     chips: 880, currentBet: 100, hasAnswered: true, betTarget: 'win', streak: 2 },
          { id: 'dev-2', name: 'Артём',  chips: 800, currentBet: 0,   hasAnswered: true, answer: MC_QUESTION.options[0], streak: 4 },
          { id: 'dev-3', name: 'Света',  chips: 390, currentBet: 150, hasAnswered: true, betTarget: 'lose' },
          { id: 'dev-4', name: 'Никита', chips: 430, currentBet: 50,  hasAnswered: true, betTarget: 'win'  },
        ],
      }),
      roundResults: [
        { playerId: 'dev-1', delta: 280,  chipBreakdown: { 500:0,100:2,50:1,20:1,10:1 }, sources: [{ label: 'Угадал исход',    delta: 130 }, { label: 'Прочитал ошибку',    delta: 150 }] },
        { playerId: 'dev-2', delta: 300,  chipBreakdown: { 500:0,100:3,50:0,20:0,10:0 }, sources: [{ label: 'Закеррил',        delta: 300 }] },
        { playerId: 'dev-3', delta: -150, chipBreakdown: { 500:0,100:0,50:0,20:0,10:0 }, sources: [{ label: 'Ошибся с исходом', delta: -150 }] },
        { playerId: 'dev-4', delta: -30,  chipBreakdown: { 500:0,100:0,50:0,20:0,10:0 }, sources: [{ label: 'Угадал исход',    delta: 20  }, { label: 'Был слишком уверен', delta: -50  }] },
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
    Screen: RoundResultsScreen,
    state: {
      myId: MY_ID,
      gameState: base('REVEAL', 'closest', {
        currentQuestion: CN_QUESTION,
        players: [
          { id: 'dev-1', name: 'Ты',     chips: 580, currentBet: 0, hasAnswered: true, answer: 2300 },
          { id: 'dev-2', name: 'Артём',  chips: 350, currentBet: 0, hasAnswered: true, answer: 2100 },
          { id: 'dev-3', name: 'Света',  chips: 990, currentBet: 0, hasAnswered: true, answer: 2250 },
          { id: 'dev-4', name: 'Никита', chips: 370, currentBet: 0, hasAnswered: true, answer: 1800 },
        ],
      }),
      roundResults: [
        { playerId: 'dev-3', delta: 250, chipBreakdown: { 500:0,100:2,50:1,20:0,10:0 }, sources: [{ label: 'Ближайший ответ', delta: 250 }] },
        { playerId: 'dev-1', delta: 0,   chipBreakdown: { 500:0,100:0,50:0,20:0,10:0 }, sources: [] },
        { playerId: 'dev-2', delta: 0,   chipBreakdown: { 500:0,100:0,50:0,20:0,10:0 }, sources: [] },
        { playerId: 'dev-4', delta: 0,   chipBreakdown: { 500:0,100:0,50:0,20:0,10:0 }, sources: [] },
      ] as RoundResult[],
      roundCorrectAnswer: 2250,
      roundMode: 'closest',
      roundGladiatorId: null,
    },
  },
  {
    id: 'reveal-10p',
    group: 'REVEAL',
    label: '10 игроков',
    Screen: RoundResultsScreen,
    state: {
      myId: MY_ID,
      gameState: base('REVEAL', 'all', {
        currentQuestion: MC_QUESTION,
        players: [
          { id: 'dev-1',  name: 'Ты',     chips: 780, currentBet: 100, hasAnswered: true },
          { id: 'dev-2',  name: 'Артём',  chips: 250, currentBet: 100, hasAnswered: true },
          { id: 'dev-3',  name: 'Света',  chips: 890, currentBet: 150, hasAnswered: true },
          { id: 'dev-4',  name: 'Никита', chips: 370, currentBet: 50,  hasAnswered: true },
          { id: 'dev-5',  name: 'Даша',   chips: 620, currentBet: 80,  hasAnswered: true },
          { id: 'dev-6',  name: 'Костя',  chips: 480, currentBet: 100, hasAnswered: true },
          { id: 'dev-7',  name: 'Лена',   chips: 310, currentBet: 60,  hasAnswered: true },
          { id: 'dev-8',  name: 'Паша',   chips: 550, currentBet: 90,  hasAnswered: true },
          { id: 'dev-9',  name: 'Маша',   chips: 430, currentBet: 70,  hasAnswered: true },
          { id: 'dev-10', name: 'Женя',   chips: 700, currentBet: 120, hasAnswered: true },
        ],
      }),
      roundResults: [
        { playerId: 'dev-1',  delta: 200,  chipBreakdown: { 500:0,100:2,50:0,20:0,10:0 }, sources: [{ label: 'Ответил верно',   delta: 200  }] },
        { playerId: 'dev-2',  delta: -100, chipBreakdown: { 500:0,100:0,50:0,20:0,10:0 }, sources: [{ label: 'Ответил неверно', delta: -100 }] },
        { playerId: 'dev-3',  delta: 150,  chipBreakdown: { 500:0,100:1,50:1,20:0,10:0 }, sources: [{ label: 'Ответил верно',   delta: 150  }] },
        { playerId: 'dev-4',  delta: -50,  chipBreakdown: { 500:0,100:0,50:0,20:0,10:0 }, sources: [{ label: 'Ответил неверно', delta: -50  }] },
        { playerId: 'dev-5',  delta: 120,  chipBreakdown: { 500:0,100:1,50:0,20:1,10:0 }, sources: [{ label: 'Ответил верно',   delta: 120  }] },
        { playerId: 'dev-6',  delta: -100, chipBreakdown: { 500:0,100:0,50:0,20:0,10:0 }, sources: [{ label: 'Ответил неверно', delta: -100 }] },
        { playerId: 'dev-7',  delta: -60,  chipBreakdown: { 500:0,100:0,50:0,20:0,10:0 }, sources: [{ label: 'Ответил неверно', delta: -60  }] },
        { playerId: 'dev-8',  delta: 90,   chipBreakdown: { 500:0,100:0,50:1,20:2,10:0 }, sources: [{ label: 'Ответил верно',   delta: 90   }] },
        { playerId: 'dev-9',  delta: -70,  chipBreakdown: { 500:0,100:0,50:0,20:0,10:0 }, sources: [{ label: 'Ответил неверно', delta: -70  }] },
        { playerId: 'dev-10', delta: 180,  chipBreakdown: { 500:0,100:1,50:1,20:1,10:1 }, sources: [{ label: 'Ответил верно',   delta: 180  }] },
      ] as RoundResult[],
      roundCorrectAnswer: MC_QUESTION.options[0],
      roundMode: 'all',
      roundGladiatorId: null,
    },
  },

  // ── GAME_OVER ──
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
