// client/src/dev/scenarios.ts
// Экраны вне раунда — лобби, конец игры, поздний вход. Раунд целиком (анонс → ставки → вопрос → ответ → итоги) с
// настоящими вопросами — в лаборатории (labState.ts), здесь его нет.
import type { GameState, Player, FriendProfile } from '@cumsino/shared'
import { PLAYER_POOL, MY_ID, type StoreState } from './labState'

export interface Scenario {
  id: string
  label: string
  /** count — игроков; roster — компания «кто ты» из каталога сервера (без сервера пусто) */
  build: (count: number, roster: FriendProfile[]) => StoreState
}

function state(phase: GameState['phase'], players: Player[], roster: FriendProfile[], extra: Partial<GameState> = {}): GameState {
  return {
    id: 'dev-room', phase, roundIndex: 0, mode: 'all', currentQuestion: null,
    hostId: MY_ID, players, phaseTimeLeft: 0, friendRoster: roster, ...extra,
  }
}

const base = (count: number, chips?: (i: number) => number): Player[] =>
  PLAYER_POOL.slice(0, count).map((p, i) => ({ ...p, chips: chips ? chips(i) : p.chips }))

const common: StoreState = {
  myId: MY_ID, isLateJoiner: false, winner: null, roundResults: [], answeredIds: new Set(),
  roundCorrectAnswer: null, roundComment: null, roundOptionNotes: null, 
}

export const SCENARIOS: Scenario[] = [
  { id: 'lobby-host', label: 'Лобби: я хост', build: (n, r) => ({ ...common, gameState: state('LOBBY', base(n), r) }) },
  {
    id: 'lobby-guest', label: 'Лобби: не хост',
    build: (n, r) => ({ ...common, gameState: state('LOBBY', base(n), r, { hostId: 'dev-2' }) }),
  },
  {
    id: 'lobby-friends', label: 'Лобби: двое назвались',
    build: (n, r) => ({
      ...common,
      gameState: state('LOBBY', base(n).map((p, i) => (i === 0 || i === 2) && r[i] ? { ...p, friendId: r[i].id } : p), r),
    }),
  },
  {
    id: 'over-win', label: 'Конец игры: победил',
    build: (n, r) => ({
      ...common, gameState: state('GAME_OVER', base(n, i => (i ? 400 + i * 130 : 3050)), r),
      winner: { ...PLAYER_POOL[0], chips: 3050 },
    }),
  },
  {
    id: 'over-lose', label: 'Конец игры: проиграл',
    build: (n, r) => ({
      ...common, gameState: state('GAME_OVER', base(n, i => (i === 1 ? 3100 : 400 + i * 130)), r),
      winner: { ...PLAYER_POOL[1], chips: 3100 },
    }),
  },
  {
    id: 'late-join', label: 'Вход посреди игры',
    build: (n, r) => ({
      ...common, isLateJoiner: true,
      gameState: state('QUESTION', base(n, i => 300 + i * 90), r, { roundIndex: 4 }),
    }),
  },
]
