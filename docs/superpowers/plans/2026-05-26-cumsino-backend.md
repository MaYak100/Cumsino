# Cumsino Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать полноценный WebSocket-сервер для мультиплеерной викторины — управление комнатами, фазовая машина состояний, вся игровая экономика.

**Architecture:** Монорепо с пакетом `shared` (общие TypeScript типы и утилиты) и пакетом `server` (Node.js + Express + Socket.IO). Игровое состояние хранится in-memory в `GameRoom`. Каждая фаза управляется `setTimeout`-таймером, который автоматически переходит к следующей.

**Tech Stack:** Node.js, TypeScript, Express, Socket.IO 4, Vitest

---

## Файловая структура

```
cumsino/
  package.json                        ← npm workspaces root
  shared/
    package.json
    src/
      types.ts                        ← все общие интерфейсы и enum-ы
      constants.ts                    ← STARTING_CHIPS, WIN_CHIPS, таймеры
      chips.ts                        ← decomposeToChips + ChipBreakdown
    index.ts
  server/
    package.json
    tsconfig.json
    vitest.config.ts
    questions.json                    ← банк вопросов (20+ штук)
    src/
      index.ts                        ← Express + Socket.IO точка входа
      game/
        GameEngine.ts                 ← Map<gameCode, GameRoom>, создание/поиск комнат
        GameRoom.ts                   ← один экземпляр игры, фазовая машина
        RoundSelector.ts              ← логика 70/30 выбора следующего режима
        economy/
          distributePool.ts           ← пропорциональный раздел пула (ВОПРОС и ГЛАДИАТОР)
          distributeClosest.ts        ← логика КТО БЛИЖЕ
          distributeTop5.ts           ← логика ТОП 5
      socket/
        handlers.ts                   ← обработчики Socket.IO событий
```

---

## Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json`
- Create: `shared/package.json`
- Create: `shared/index.ts`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`

- [ ] **Step 1.1: Создать корневой package.json с workspaces**

```json
// package.json
{
  "name": "cumsino",
  "private": true,
  "workspaces": ["shared", "server", "client"],
  "scripts": {
    "dev:server": "npm run dev --workspace=server",
    "test:server": "npm run test --workspace=server"
  }
}
```

- [ ] **Step 1.2: Создать shared/package.json**

```json
// shared/package.json
{
  "name": "@cumsino/shared",
  "version": "1.0.0",
  "main": "index.ts",
  "types": "index.ts"
}
```

- [ ] **Step 1.3: Создать shared/index.ts (пустой ре-экспорт, заполним в Task 2)**

```typescript
// shared/index.ts
export * from './src/types'
export * from './src/constants'
export * from './src/chips'
```

- [ ] **Step 1.4: Создать server/package.json**

```json
// server/package.json
{
  "name": "@cumsino/server",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@cumsino/shared": "*",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "socket.io": "^4.7.2"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0"
  }
}
```

- [ ] **Step 1.5: Создать server/tsconfig.json**

```json
// server/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": {
      "@cumsino/shared": ["../shared/index.ts"],
      "@cumsino/shared/*": ["../shared/src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 1.6: Создать server/vitest.config.ts**

```typescript
// server/vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@cumsino/shared': path.resolve(__dirname, '../shared/index.ts'),
    },
  },
})
```

- [ ] **Step 1.7: Установить зависимости**

```bash
cd C:/Dev/Cumsino && npm install
```

Ожидание: `added N packages` без ошибок.

- [ ] **Step 1.8: Commit**

```bash
git init && git add package.json shared/package.json shared/index.ts server/package.json server/tsconfig.json server/vitest.config.ts
git commit -m "chore: monorepo scaffolding with npm workspaces"
```

---

## Task 2: Shared — Types, Constants, Chips

**Files:**
- Create: `shared/src/types.ts`
- Create: `shared/src/constants.ts`
- Create: `shared/src/chips.ts`
- Create: `shared/src/__tests__/chips.test.ts`

- [ ] **Step 2.1: Написать тест для decomposeToChips**

```typescript
// shared/src/__tests__/chips.test.ts
import { describe, it, expect } from 'vitest'
import { decomposeToChips } from '../chips'

describe('decomposeToChips', () => {
  it('разбивает 500 на одну чёрную фишку', () => {
    const result = decomposeToChips(500)
    expect(result[500]).toBe(1)
    expect(result[100] + result[50] + result[20] + result[10]).toBe(0)
  })

  it('разбивает 200 на крупные + мелкие (всегда есть мелкие)', () => {
    const result = decomposeToChips(200)
    const total = result[500] * 500 + result[100] * 100 + result[50] * 50 + result[20] * 20 + result[10] * 10
    expect(total).toBe(200)
    // Должны быть хотя бы какие-то мелкие фишки
    const small = result[50] + result[20] + result[10]
    expect(small).toBeGreaterThan(0)
  })

  it('сумма фишек всегда равна входному значению', () => {
    for (const amount of [10, 30, 70, 150, 300, 750, 1000, 2500]) {
      const result = decomposeToChips(amount)
      const total = result[500] * 500 + result[100] * 100 + result[50] * 50 + result[20] * 20 + result[10] * 10
      expect(total).toBe(amount)
    }
  })

  it('округляет до кратного 10', () => {
    const result = decomposeToChips(155)
    const total = result[500] * 500 + result[100] * 100 + result[50] * 50 + result[20] * 20 + result[10] * 10
    expect(total % 10).toBe(0)
  })
})
```

- [ ] **Step 2.2: Запустить тест — убедиться что падает**

```bash
cd C:/Dev/Cumsino && npm run test --workspace=server -- shared/src/__tests__/chips.test.ts
```

Ожидание: FAIL — `Cannot find module '../chips'`

- [ ] **Step 2.3: Создать shared/src/types.ts**

```typescript
// shared/src/types.ts

export type GamePhase =
  | 'LOBBY'
  | 'ANNOUNCE'        // тема раунда, ~5 сек
  | 'BETTING'         // ставки фишками, ~30 сек
  | 'QUESTION_TEXT'   // вопрос без вариантов, ~5 сек
  | 'QUESTION'        // вопрос + варианты ответа, ~40 сек
  | 'REVEAL'          // итоги раунда, ~8 сек
  | 'LEADERBOARD'     // таблица лидеров, ~5 сек
  | 'GAME_OVER'

export type GameMode = 'all' | 'gladiator' | 'closest' | 'top5'

export type MainMode = 'all' | 'gladiator'

export interface ChipBreakdown {
  500: number
  100: number
  50: number
  20: number
  10: number
}

export interface Player {
  id: string
  name: string
  chips: number
  currentBet: number
  betTarget?: 'win' | 'lose'
  answer?: string | number | string[]
  hasAnswered: boolean
}

export interface Question {
  id: string
  mode: GameMode
  topic: string
  text: string
  options?: string[]
  answer?: string
  numericAnswer?: number
  items?: string[]
}

export interface GameState {
  id: string
  phase: GamePhase
  roundIndex: number
  lastMainMode: MainMode
  mode: GameMode
  currentQuestion: Omit<Question, 'answer' | 'numericAnswer'> | null
  gladiatorId?: string
  players: Player[]
  phaseTimeLeft: number
}

export interface RoundResult {
  playerId: string
  delta: number
  chipBreakdown: ChipBreakdown
}

// Socket event payloads — Client → Server
export interface JoinGamePayload { name: string; gameCode: string }
export interface PlaceBetPayload { amount: number; target?: 'win' | 'lose' }
export interface SubmitAnswerPayload { answer: string | number | string[] }
export interface GladiatorHoverPayload { optionIndex: number | null }

// Socket event payloads — Server → Client
export interface PhaseChangedPayload { phase: GamePhase; timeLeft: number }
export interface BetUpdatedPayload { playerId: string; amount: number; target?: 'win' | 'lose' }
export interface PlayerAnsweredPayload { playerId: string }
export interface GladiatorHoveringPayload { optionIndex: number | null }
export interface RoundResultsPayload { results: RoundResult[] }
export interface GameOverPayload { winner: Player }
```

- [ ] **Step 2.4: Создать shared/src/constants.ts**

```typescript
// shared/src/constants.ts
export const STARTING_CHIPS = 500
export const WIN_CHIPS = 3000
export const GLADIATOR_BONUS = 300
export const CLOSEST_WINNER_BONUS = 200
export const CLOSEST_EXACT_BONUS = 200
export const TOP5_SLOT_BONUS = 20
export const TOP5_PERFECT_BONUS = 150

export const PHASE_DURATIONS: Record<string, number> = {
  ANNOUNCE: 5,
  BETTING: 30,
  QUESTION_TEXT: 5,
  QUESTION: 40,
  REVEAL: 8,
  LEADERBOARD: 5,
}

export const SPECIAL_MODE_CHANCE = 0.3
```

- [ ] **Step 2.5: Создать shared/src/chips.ts**

```typescript
// shared/src/chips.ts
import type { ChipBreakdown } from './types'

const DENOMS = [500, 100, 50, 20, 10] as const

export function decomposeToChips(amount: number): ChipBreakdown {
  const rounded = Math.round(amount / 10) * 10
  const chips: ChipBreakdown = { 500: 0, 100: 0, 50: 0, 20: 0, 10: 0 }
  let remaining = rounded

  if (remaining >= 200) {
    // ~20% суммы резервируем для мелких фишек, минимум 20
    const smallBudget = Math.max(20, Math.round(remaining * 0.2 / 10) * 10)
    const largePart = remaining - smallBudget

    chips[500] = Math.floor(largePart / 500)
    remaining -= chips[500] * 500
    chips[100] = Math.floor(remaining / 100)
    remaining -= chips[100] * 100
  }

  chips[50] = Math.floor(remaining / 50)
  remaining -= chips[50] * 50
  chips[20] = Math.floor(remaining / 20)
  remaining -= chips[20] * 20
  chips[10] = Math.round(remaining / 10)

  return chips
}

export function totalChips(breakdown: ChipBreakdown): number {
  return (
    breakdown[500] * 500 +
    breakdown[100] * 100 +
    breakdown[50] * 50 +
    breakdown[20] * 20 +
    breakdown[10] * 10
  )
}
```

- [ ] **Step 2.6: Запустить тест — убедиться что проходит**

```bash
cd C:/Dev/Cumsino && npx vitest run --config server/vitest.config.ts shared/src/__tests__/chips.test.ts
```

Ожидание: PASS 4 tests

- [ ] **Step 2.7: Commit**

```bash
git add shared/src/
git commit -m "feat(shared): types, constants, decomposeToChips с тестами"
```

---

## Task 3: Server Economy — distributePool

**Files:**
- Create: `server/src/game/economy/distributePool.ts`
- Create: `server/src/game/economy/__tests__/distributePool.test.ts`

- [ ] **Step 3.1: Написать тест**

```typescript
// server/src/game/economy/__tests__/distributePool.test.ts
import { describe, it, expect } from 'vitest'
import { distributePool } from '../distributePool'

describe('distributePool', () => {
  it('победитель получает весь пул проигравших', () => {
    const result = distributePool(
      [{ id: 'w1', stake: 100 }],
      [{ id: 'l1', stake: 200 }, { id: 'l2', stake: 300 }]
    )
    expect(result.get('w1')).toBe(500) // получает 500 из пула
    expect(result.get('l1')).toBe(-200)
    expect(result.get('l2')).toBe(-300)
  })

  it('победители делят пул пропорционально ставкам', () => {
    const result = distributePool(
      [{ id: 'w1', stake: 100 }, { id: 'w2', stake: 400 }],
      [{ id: 'l1', stake: 500 }]
    )
    const w1 = result.get('w1')!
    const w2 = result.get('w2')!
    expect(w1).toBeGreaterThan(0)
    expect(w2).toBeGreaterThan(0)
    expect(w2 / w1).toBeCloseTo(4, 0) // w2 ставил в 4 раза больше
    expect(result.get('l1')).toBe(-500)
  })

  it('если все выиграли — никто ничего не получает и не теряет (ставки возвращаются)', () => {
    const result = distributePool(
      [{ id: 'w1', stake: 200 }, { id: 'w2', stake: 300 }],
      []
    )
    expect(result.get('w1')).toBe(0)
    expect(result.get('w2')).toBe(0)
  })

  it('если никто не ставил — нет делений на ноль', () => {
    const result = distributePool(
      [{ id: 'w1', stake: 0 }],
      [{ id: 'l1', stake: 0 }]
    )
    expect(result.get('w1')).toBe(0)
    expect(result.get('l1')).toBe(0)
  })

  it('сумма всех дельт равна нулю (деньги не создаются и не уничтожаются)', () => {
    const result = distributePool(
      [{ id: 'w1', stake: 100 }, { id: 'w2', stake: 200 }],
      [{ id: 'l1', stake: 150 }, { id: 'l2', stake: 250 }]
    )
    const sum = [...result.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBe(0)
  })
})
```

- [ ] **Step 3.2: Запустить тест — убедиться что падает**

```bash
cd C:/Dev/Cumsino && npx vitest run --config server/vitest.config.ts server/src/game/economy/__tests__/distributePool.test.ts
```

Ожидание: FAIL — `Cannot find module '../distributePool'`

- [ ] **Step 3.3: Реализовать distributePool**

```typescript
// server/src/game/economy/distributePool.ts

interface StakeEntry { id: string; stake: number }

export function distributePool(
  winners: StakeEntry[],
  losers: StakeEntry[]
): Map<string, number> {
  const result = new Map<string, number>()
  const pool = losers.reduce((sum, p) => sum + p.stake, 0)
  const totalWinnerStake = winners.reduce((sum, p) => sum + p.stake, 0)

  for (const loser of losers) {
    result.set(loser.id, -loser.stake)
  }

  for (const winner of winners) {
    if (pool === 0 || totalWinnerStake === 0) {
      result.set(winner.id, 0)
      continue
    }
    // Округляем до кратного 10
    const share = Math.floor((winner.stake / totalWinnerStake) * pool / 10) * 10
    result.set(winner.id, share)
  }

  // Корректируем остаток от округления: отдаём победителю с наибольшей ставкой
  if (winners.length > 0 && pool > 0 && totalWinnerStake > 0) {
    const distributed = winners.reduce((sum, w) => sum + (result.get(w.id) ?? 0), 0)
    const remainder = pool - distributed
    if (remainder !== 0) {
      const topWinner = winners.reduce((max, w) => w.stake > max.stake ? w : max, winners[0])
      result.set(topWinner.id, (result.get(topWinner.id) ?? 0) + remainder)
    }
  }

  return result
}
```

- [ ] **Step 3.4: Запустить тест — убедиться что проходит**

```bash
cd C:/Dev/Cumsino && npx vitest run --config server/vitest.config.ts server/src/game/economy/__tests__/distributePool.test.ts
```

Ожидание: PASS 5 tests

- [ ] **Step 3.5: Commit**

```bash
git add server/src/game/economy/
git commit -m "feat(server): distributePool с тестами"
```

---

## Task 4: Server Economy — distributeClosest + distributeTop5

**Files:**
- Create: `server/src/game/economy/distributeClosest.ts`
- Create: `server/src/game/economy/distributeTop5.ts`
- Create: `server/src/game/economy/__tests__/distributeClosest.test.ts`
- Create: `server/src/game/economy/__tests__/distributeTop5.test.ts`

- [ ] **Step 4.1: Тест для distributeClosest**

```typescript
// server/src/game/economy/__tests__/distributeClosest.test.ts
import { describe, it, expect } from 'vitest'
import { distributeClosest } from '../distributeClosest'

describe('distributeClosest', () => {
  it('победитель получает базовый бонус', () => {
    const result = distributeClosest(
      [{ id: 'p1', answer: 100 }, { id: 'p2', answer: 50 }],
      330
    )
    expect(result.get('p1')).toBe(200) // 100 ближе к 330
    expect(result.get('p2')).toBe(0)
  })

  it('точное попадание даёт двойной бонус', () => {
    const result = distributeClosest(
      [{ id: 'p1', answer: 330 }, { id: 'p2', answer: 100 }],
      330
    )
    expect(result.get('p1')).toBe(400) // 200 базовый + 200 за точность
    expect(result.get('p2')).toBe(0)
  })

  it('при ничьей бонус делится поровну', () => {
    const result = distributeClosest(
      [{ id: 'p1', answer: 100 }, { id: 'p2', answer: 560 }],
      330
    )
    // оба на расстоянии 230 — ничья
    expect(result.get('p1')).toBe(100)
    expect(result.get('p2')).toBe(100)
  })

  it('при точной ничьей бонус за точность тоже делится', () => {
    const result = distributeClosest(
      [{ id: 'p1', answer: 330 }, { id: 'p2', answer: 330 }],
      330
    )
    expect(result.get('p1')).toBe(200) // (200+200) / 2
    expect(result.get('p2')).toBe(200)
  })
})
```

- [ ] **Step 4.2: Тест для distributeTop5**

```typescript
// server/src/game/economy/__tests__/distributeTop5.test.ts
import { describe, it, expect } from 'vitest'
import { distributeTop5 } from '../distributeTop5'

const correct = ['A', 'B', 'C', 'D', 'E']

describe('distributeTop5', () => {
  it('все верно — 150 фишек', () => {
    const result = distributeTop5([{ id: 'p1', answer: ['A', 'B', 'C', 'D', 'E'] }], correct)
    expect(result.get('p1')).toBe(150)
  })

  it('3 верных слота — 60 фишек', () => {
    const result = distributeTop5([{ id: 'p1', answer: ['A', 'B', 'C', 'E', 'D'] }], correct)
    expect(result.get('p1')).toBe(60) // 3 × 20
  })

  it('ноль верных — 0 фишек', () => {
    const result = distributeTop5([{ id: 'p1', answer: ['E', 'D', 'C', 'B', 'A'] }], correct)
    // A на pos 0 не совпадает (E там), и т.д. — зависит от ответа
    // E на pos 0 — правильная pos E = 4, не совпадает → 0
    expect(result.get('p1')).toBe(0)
  })

  it('несколько игроков получают независимо', () => {
    const result = distributeTop5(
      [
        { id: 'p1', answer: ['A', 'B', 'C', 'D', 'E'] },
        { id: 'p2', answer: ['A', 'X', 'X', 'X', 'X'] },
      ],
      correct
    )
    expect(result.get('p1')).toBe(150)
    expect(result.get('p2')).toBe(20) // только первый слот верный
  })
})
```

- [ ] **Step 4.3: Запустить тесты — убедиться что падают**

```bash
cd C:/Dev/Cumsino && npx vitest run --config server/vitest.config.ts server/src/game/economy/__tests__/distributeClosest.test.ts server/src/game/economy/__tests__/distributeTop5.test.ts
```

Ожидание: FAIL

- [ ] **Step 4.4: Реализовать distributeClosest**

```typescript
// server/src/game/economy/distributeClosest.ts
import { CLOSEST_WINNER_BONUS, CLOSEST_EXACT_BONUS } from '@cumsino/shared'

interface AnswerEntry { id: string; answer: number }

export function distributeClosest(
  players: AnswerEntry[],
  correctAnswer: number
): Map<string, number> {
  const result = new Map<string, number>(players.map(p => [p.id, 0]))

  if (players.length === 0) return result

  const diffs = players.map(p => ({
    id: p.id,
    diff: Math.abs(p.answer - correctAnswer),
    exact: p.answer === correctAnswer,
  }))

  const minDiff = Math.min(...diffs.map(d => d.diff))
  const winners = diffs.filter(d => d.diff === minDiff)
  const isExact = winners.every(w => w.exact)

  const totalBonus = CLOSEST_WINNER_BONUS + (isExact ? CLOSEST_EXACT_BONUS : 0)
  const perWinner = Math.floor(totalBonus / winners.length / 10) * 10

  for (const winner of winners) {
    result.set(winner.id, perWinner)
  }

  return result
}
```

- [ ] **Step 4.5: Реализовать distributeTop5**

```typescript
// server/src/game/economy/distributeTop5.ts
import { TOP5_SLOT_BONUS, TOP5_PERFECT_BONUS } from '@cumsino/shared'

interface AnswerEntry { id: string; answer: string[] }

export function distributeTop5(
  players: AnswerEntry[],
  orderedItems: string[]
): Map<string, number> {
  const result = new Map<string, number>()

  for (const player of players) {
    const correctSlots = player.answer.filter(
      (item, idx) => item === orderedItems[idx]
    ).length

    const reward = correctSlots === 5
      ? TOP5_PERFECT_BONUS
      : correctSlots * TOP5_SLOT_BONUS

    result.set(player.id, reward)
  }

  return result
}
```

- [ ] **Step 4.6: Запустить тесты — убедиться что проходят**

```bash
cd C:/Dev/Cumsino && npx vitest run --config server/vitest.config.ts server/src/game/economy/__tests__/
```

Ожидание: PASS все тесты

- [ ] **Step 4.7: Commit**

```bash
git add server/src/game/economy/
git commit -m "feat(server): distributeClosest + distributeTop5 с тестами"
```

---

## Task 5: RoundSelector

**Files:**
- Create: `server/src/game/RoundSelector.ts`
- Create: `server/src/game/__tests__/RoundSelector.test.ts`

- [ ] **Step 5.1: Тест**

```typescript
// server/src/game/__tests__/RoundSelector.test.ts
import { describe, it, expect } from 'vitest'
import { RoundSelector } from '../RoundSelector'

describe('RoundSelector', () => {
  it('раунд 1 всегда "all"', () => {
    const selector = new RoundSelector(['closest', 'top5'])
    expect(selector.next()).toBe('all')
  })

  it('раунд 2 всегда "gladiator"', () => {
    const selector = new RoundSelector(['closest', 'top5'])
    selector.next()
    expect(selector.next()).toBe('gladiator')
  })

  it('после gladiator следующий основной — "all"', () => {
    const selector = new RoundSelector([]) // нет спец-режимов → всегда основной
    selector.next() // all
    selector.next() // gladiator
    // при отсутствии спец-режимов — всегда основной
    const next = selector.next()
    expect(next).toBe('all')
  })

  it('после all следующий основной — "gladiator"', () => {
    const selector = new RoundSelector([])
    selector.next() // all
    selector.next() // gladiator
    selector.next() // all (нет спец-режимов)
    const next = selector.next()
    expect(next).toBe('gladiator')
  })

  it('lastMainMode обновляется только для основных режимов', () => {
    const selector = new RoundSelector(['closest'])
    selector.next() // all
    selector.next() // gladiator
    // принудительно делаем спец-режим
    const mode = selector.nextForceSpecial()
    expect(mode).toBe('closest')
    // следующий основной должен быть all (т.к. последний основной = gladiator)
    selector.nextForceMain()
    expect(selector.lastMainMode).toBe('all')
  })
})
```

- [ ] **Step 5.2: Запустить тест — убедиться что падает**

```bash
cd C:/Dev/Cumsino && npx vitest run --config server/vitest.config.ts server/src/game/__tests__/RoundSelector.test.ts
```

Ожидание: FAIL

- [ ] **Step 5.3: Реализовать RoundSelector**

```typescript
// server/src/game/RoundSelector.ts
import type { GameMode, MainMode } from '@cumsino/shared'
import { SPECIAL_MODE_CHANCE } from '@cumsino/shared'

export class RoundSelector {
  private roundIndex = 0
  lastMainMode: MainMode = 'gladiator' // после gladiator → следующий основной = all

  constructor(private specialModes: GameMode[]) {}

  next(): GameMode {
    const mode = this.pickMode()
    this.roundIndex++
    return mode
  }

  nextForceSpecial(): GameMode {
    const mode = this.specialModes[Math.floor(Math.random() * this.specialModes.length)]
    this.roundIndex++
    return mode
  }

  nextForceMain(): GameMode {
    const mode: MainMode = this.lastMainMode === 'all' ? 'gladiator' : 'all'
    this.lastMainMode = mode
    this.roundIndex++
    return mode
  }

  private pickMode(): GameMode {
    if (this.roundIndex === 0) return 'all'
    if (this.roundIndex === 1) {
      this.lastMainMode = 'gladiator'
      return 'gladiator'
    }

    const useSpecial = this.specialModes.length > 0 && Math.random() < SPECIAL_MODE_CHANCE
    if (useSpecial) {
      return this.specialModes[Math.floor(Math.random() * this.specialModes.length)]
    }

    const next: MainMode = this.lastMainMode === 'all' ? 'gladiator' : 'all'
    this.lastMainMode = next
    return next
  }
}
```

- [ ] **Step 5.4: Запустить тест — убедиться что проходит**

```bash
cd C:/Dev/Cumsino && npx vitest run --config server/vitest.config.ts server/src/game/__tests__/RoundSelector.test.ts
```

Ожидание: PASS 5 tests

- [ ] **Step 5.5: Commit**

```bash
git add server/src/game/RoundSelector.ts server/src/game/__tests__/
git commit -m "feat(server): RoundSelector с тестами"
```

---

## Task 6: GameRoom — Фазовая машина состояний

**Files:**
- Create: `server/src/game/GameRoom.ts`

- [ ] **Step 6.1: Реализовать GameRoom**

```typescript
// server/src/game/GameRoom.ts
import { EventEmitter } from 'events'
import type { GameState, GamePhase, GameMode, Player, RoundResult } from '@cumsino/shared'
import {
  STARTING_CHIPS, WIN_CHIPS, GLADIATOR_BONUS,
  PHASE_DURATIONS
} from '@cumsino/shared'
import { decomposeToChips } from '@cumsino/shared'
import { distributePool } from './economy/distributePool'
import { distributeClosest } from './economy/distributeClosest'
import { distributeTop5 } from './economy/distributeTop5'
import { RoundSelector } from './RoundSelector'
import type { Question } from '@cumsino/shared'

export class GameRoom extends EventEmitter {
  readonly id: string
  private players: Map<string, Player> = new Map()
  private phase: GamePhase = 'LOBBY'
  private roundIndex = 0
  private currentMode: GameMode = 'all'
  private currentQuestion: Question | null = null
  private gladiatorId?: string
  private phaseTimer?: ReturnType<typeof setTimeout>
  private phaseEndTime = 0
  private selector: RoundSelector
  private questions: Question[]

  constructor(id: string, questions: Question[]) {
    super()
    this.id = id
    this.questions = questions
    this.selector = new RoundSelector(['closest', 'top5'])
  }

  addPlayer(id: string, name: string) {
    this.players.set(id, {
      id, name,
      chips: STARTING_CHIPS,
      currentBet: 0,
      hasAnswered: false,
    })
    this.broadcast('game_state', this.getPublicState())
  }

  removePlayer(id: string) {
    this.players.delete(id)
    this.broadcast('game_state', this.getPublicState())
  }

  start() {
    if (this.phase !== 'LOBBY') return
    this.nextRound()
  }

  placeBet(playerId: string, amount: number, target?: 'win' | 'lose') {
    const player = this.players.get(playerId)
    if (!player || this.phase !== 'BETTING') return
    if (amount > player.chips) return

    player.currentBet = amount
    if (target) player.betTarget = target

    this.broadcast('bet_updated', { playerId, amount, target })
  }

  submitAnswer(playerId: string, answer: string | number | string[]) {
    const player = this.players.get(playerId)
    if (!player || this.phase !== 'QUESTION') return
    if (player.hasAnswered) return

    player.answer = answer
    player.hasAnswered = true
    this.broadcast('player_answered', { playerId })

    if (this.allAnswered()) {
      clearTimeout(this.phaseTimer)
      this.advanceFromQuestion()
    }
  }

  relayHover(playerId: string, optionIndex: number | null) {
    if (playerId !== this.gladiatorId) return
    this.broadcastExcept(playerId, 'gladiator_hovering', { optionIndex })
  }

  getPublicState(): GameState {
    const timeLeft = Math.max(0, Math.ceil((this.phaseEndTime - Date.now()) / 1000))
    return {
      id: this.id,
      phase: this.phase,
      roundIndex: this.roundIndex,
      lastMainMode: this.selector.lastMainMode,
      mode: this.currentMode,
      currentQuestion: this.currentQuestion
        ? {
            id: this.currentQuestion.id,
            mode: this.currentQuestion.mode,
            topic: this.currentQuestion.topic,
            text: this.currentQuestion.text,
            options: this.currentQuestion.options,
            items: this.currentQuestion.items,
          }
        : null,
      gladiatorId: this.gladiatorId,
      players: Array.from(this.players.values()),
      phaseTimeLeft: timeLeft,
    }
  }

  get playerCount() { return this.players.size }

  private nextRound() {
    const mode = this.selector.next()
    this.currentMode = mode
    this.gladiatorId = undefined
    this.currentQuestion = this.pickQuestion(mode)
    this.roundIndex++

    // Сбросить ставки/ответы
    for (const p of this.players.values()) {
      p.currentBet = 0
      p.betTarget = undefined
      p.answer = undefined
      p.hasAnswered = false
    }

    this.schedulePhase('ANNOUNCE', PHASE_DURATIONS.ANNOUNCE)
  }

  private schedulePhase(phase: GamePhase, seconds: number) {
    clearTimeout(this.phaseTimer)
    this.phase = phase
    this.phaseEndTime = Date.now() + seconds * 1000
    this.broadcast('game_state', this.getPublicState())

    this.phaseTimer = setTimeout(() => this.onPhaseEnd(), seconds * 1000)
  }

  private onPhaseEnd() {
    switch (this.phase) {
      case 'ANNOUNCE':
        if (this.currentMode === 'all' || this.currentMode === 'gladiator') {
          if (this.currentMode === 'gladiator') this.selectGladiator()
          this.schedulePhase('BETTING', PHASE_DURATIONS.BETTING)
        } else {
          this.schedulePhase('QUESTION_TEXT', PHASE_DURATIONS.QUESTION_TEXT)
        }
        break

      case 'BETTING':
        this.schedulePhase('QUESTION_TEXT', PHASE_DURATIONS.QUESTION_TEXT)
        break

      case 'QUESTION_TEXT':
        this.schedulePhase('QUESTION', PHASE_DURATIONS.QUESTION)
        break

      case 'QUESTION':
        this.advanceFromQuestion()
        break

      case 'REVEAL':
        this.schedulePhase('LEADERBOARD', PHASE_DURATIONS.LEADERBOARD)
        break

      case 'LEADERBOARD':
        const winner = this.checkWinner()
        if (winner) {
          this.phase = 'GAME_OVER'
          this.broadcast('game_over', { winner })
          this.broadcast('game_state', this.getPublicState())
        } else {
          this.nextRound()
        }
        break
    }
  }

  private advanceFromQuestion() {
    const results = this.calculateResults()
    this.applyDeltas(results)
    this.broadcast('round_results', { results })
    this.schedulePhase('REVEAL', PHASE_DURATIONS.REVEAL)
  }

  private calculateResults(): RoundResult[] {
    const players = Array.from(this.players.values())

    if (this.currentMode === 'all') {
      const q = this.currentQuestion!
      const winners = players.filter(p => p.answer === q.answer && p.currentBet > 0)
        .map(p => ({ id: p.id, stake: p.currentBet }))
      const losers = players.filter(p => p.answer !== q.answer && p.currentBet > 0)
        .map(p => ({ id: p.id, stake: p.currentBet }))
      const deltas = distributePool(winners, losers)
      return this.buildResults(deltas)
    }

    if (this.currentMode === 'gladiator') {
      const gladiator = this.players.get(this.gladiatorId!)!
      const correct = gladiator.answer === this.currentQuestion!.answer
      const crowd = players.filter(p => p.id !== this.gladiatorId && p.currentBet > 0)
      const winners = crowd.filter(p => (correct ? p.betTarget === 'win' : p.betTarget === 'lose'))
        .map(p => ({ id: p.id, stake: p.currentBet }))
      const losers = crowd.filter(p => (correct ? p.betTarget === 'lose' : p.betTarget === 'win'))
        .map(p => ({ id: p.id, stake: p.currentBet }))
      const deltas = distributePool(winners, losers)
      if (correct) deltas.set(gladiator.id, GLADIATOR_BONUS)
      else deltas.set(gladiator.id, 0)
      return this.buildResults(deltas)
    }

    if (this.currentMode === 'closest') {
      const entries = players
        .filter(p => typeof p.answer === 'number')
        .map(p => ({ id: p.id, answer: p.answer as number }))
      const deltas = distributeClosest(entries, this.currentQuestion!.numericAnswer!)
      return this.buildResults(deltas)
    }

    if (this.currentMode === 'top5') {
      const entries = players
        .filter(p => Array.isArray(p.answer))
        .map(p => ({ id: p.id, answer: p.answer as string[] }))
      const deltas = distributeTop5(entries, this.currentQuestion!.items!)
      return this.buildResults(deltas)
    }

    return []
  }

  private buildResults(deltas: Map<string, number>): RoundResult[] {
    return Array.from(deltas.entries()).map(([playerId, delta]) => ({
      playerId,
      delta,
      chipBreakdown: decomposeToChips(Math.abs(delta)),
    }))
  }

  private applyDeltas(results: RoundResult[]) {
    for (const r of results) {
      const player = this.players.get(r.playerId)
      if (player) player.chips = Math.max(0, player.chips + r.delta)
    }
  }

  private selectGladiator() {
    const ids = Array.from(this.players.keys())
    this.gladiatorId = ids[Math.floor(Math.random() * ids.length)]
  }

  private allAnswered(): boolean {
    return Array.from(this.players.values()).every(p => p.hasAnswered)
  }

  private checkWinner(): Player | undefined {
    return Array.from(this.players.values()).find(p => p.chips >= WIN_CHIPS)
  }

  private pickQuestion(mode: GameMode): Question {
    const pool = this.questions.filter(q => q.mode === mode)
    return pool[Math.floor(Math.random() * pool.length)]
  }

  private broadcast(event: string, data: unknown) {
    this.emit('broadcast', { event, data })
  }

  private broadcastExcept(excludeId: string, event: string, data: unknown) {
    this.emit('broadcastExcept', { excludeId, event, data })
  }
}
```

- [ ] **Step 6.2: Commit**

```bash
git add server/src/game/GameRoom.ts
git commit -m "feat(server): GameRoom — фазовая машина состояний"
```

---

## Task 7: GameEngine + Socket.IO Handlers + Entry Point

**Files:**
- Create: `server/src/game/GameEngine.ts`
- Create: `server/src/socket/handlers.ts`
- Create: `server/src/index.ts`
- Create: `server/questions.json`

- [ ] **Step 7.1: Создать questions.json (20 вопросов)**

```json
[
  {
    "id": "a1", "mode": "all",
    "topic": "Кинематограф 90-х",
    "text": "Режиссёр «Криминального чтива» (1994)?",
    "options": ["Коэны", "Тарантино", "Финчер", "Линч"],
    "answer": "Тарантино"
  },
  {
    "id": "a2", "mode": "all",
    "topic": "Музыка",
    "text": "Как называется дебютный альбом Нирваны?",
    "options": ["Nevermind", "Bleach", "In Utero", "MTV Unplugged"],
    "answer": "Bleach"
  },
  {
    "id": "a3", "mode": "all",
    "topic": "География",
    "text": "Самая длинная река в мире?",
    "options": ["Амазонка", "Нил", "Янцзы", "Миссисипи"],
    "answer": "Нил"
  },
  {
    "id": "a4", "mode": "all",
    "topic": "Наука",
    "text": "Сколько планет в Солнечной системе?",
    "options": ["7", "8", "9", "10"],
    "answer": "8"
  },
  {
    "id": "a5", "mode": "all",
    "topic": "История",
    "text": "В каком году началась Вторая мировая война?",
    "options": ["1937", "1938", "1939", "1941"],
    "answer": "1939"
  },
  {
    "id": "g1", "mode": "gladiator",
    "topic": "Столицы мира",
    "text": "Столица Казахстана?",
    "options": ["Алматы", "Астана", "Шымкент", "Актобе"],
    "answer": "Астана"
  },
  {
    "id": "g2", "mode": "gladiator",
    "topic": "Биология",
    "text": "Сколько хромосом у человека?",
    "options": ["23", "44", "46", "48"],
    "answer": "46"
  },
  {
    "id": "g3", "mode": "gladiator",
    "topic": "Литература",
    "text": "Кто написал «Мастер и Маргарита»?",
    "options": ["Толстой", "Булгаков", "Достоевский", "Пастернак"],
    "answer": "Булгаков"
  },
  {
    "id": "g4", "mode": "gladiator",
    "topic": "Спорт",
    "text": "Сколько игроков в баскетбольной команде на площадке?",
    "options": ["4", "5", "6", "7"],
    "answer": "5"
  },
  {
    "id": "g5", "mode": "gladiator",
    "topic": "Математика",
    "text": "Чему равно число π с точностью до сотых?",
    "options": ["3.12", "3.14", "3.16", "3.18"],
    "answer": "3.14"
  },
  {
    "id": "c1", "mode": "closest",
    "topic": "Архитектура",
    "text": "Высота Эйфелевой башни в метрах?",
    "numericAnswer": 330
  },
  {
    "id": "c2", "mode": "closest",
    "topic": "История",
    "text": "В каком году была основана Москва?",
    "numericAnswer": 1147
  },
  {
    "id": "c3", "mode": "closest",
    "topic": "Наука",
    "text": "Скорость света в км/с (округлённо)?",
    "numericAnswer": 300000
  },
  {
    "id": "c4", "mode": "closest",
    "topic": "Кино",
    "text": "Сколько «Оскаров» получил фильм «Властелин колец: Возвращение короля»?",
    "numericAnswer": 11
  },
  {
    "id": "c5", "mode": "closest",
    "topic": "Спорт",
    "text": "Сколько стран участвовало в Олимпиаде 2020 (Токио)?",
    "numericAnswer": 206
  },
  {
    "id": "t1", "mode": "top5",
    "topic": "Кино",
    "text": "Расставь фильмы по мировым сборам (от большего к меньшему):",
    "items": ["Аватар", "Мстители: Финал", "Титаник", "Звёздные войны: Пробуждение силы", "Мстители: Война бесконечности"],
    "orderedItems": ["Мстители: Финал", "Аватар", "Титаник", "Звёздные войны: Пробуждение силы", "Мстители: Война бесконечности"]
  },
  {
    "id": "t2", "mode": "top5",
    "topic": "Химия",
    "text": "Расставь элементы по атомной массе (от меньшей к большей):",
    "items": ["Железо", "Углерод", "Золото", "Водород", "Кислород"],
    "orderedItems": ["Водород", "Углерод", "Кислород", "Железо", "Золото"]
  },
  {
    "id": "t3", "mode": "top5",
    "topic": "Страны",
    "text": "Расставь страны по численности населения (от большей к меньшей):",
    "items": ["США", "Индия", "Китай", "Индонезия", "Пакистан"],
    "orderedItems": ["Китай", "Индия", "США", "Индонезия", "Пакистан"]
  },
  {
    "id": "t4", "mode": "top5",
    "topic": "Музыка",
    "text": "Расставь альбомы Beatles по году выхода (от раннего к позднему):",
    "items": ["Abbey Road", "Please Please Me", "Revolver", "Sgt. Pepper", "Let It Be"],
    "orderedItems": ["Please Please Me", "Revolver", "Sgt. Pepper", "Abbey Road", "Let It Be"]
  },
  {
    "id": "t5", "mode": "top5",
    "topic": "Спорт",
    "text": "Расставь страны по количеству золотых медалей на ОИ 2020 (от большего к меньшему):",
    "items": ["Великобритания", "США", "Китай", "Австралия", "Япония"],
    "orderedItems": ["США", "Китай", "Великобритания", "Австралия", "Япония"]
  }
]
```

- [ ] **Step 7.2: Создать GameEngine**

```typescript
// server/src/game/GameEngine.ts
import type { Server, Socket } from 'socket.io'
import { GameRoom } from './GameRoom'
import type { Question } from '@cumsino/shared'
import questions from '../../questions.json'

function generateCode(): string {
  return Array.from({ length: 4 }, () =>
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
  ).join('')
}

export class GameEngine {
  private rooms: Map<string, GameRoom> = new Map()
  private playerRoom: Map<string, string> = new Map() // socketId → gameCode

  constructor(private io: Server) {}

  createRoom(): string {
    let code = generateCode()
    while (this.rooms.has(code)) code = generateCode()

    const room = new GameRoom(code, questions as Question[])

    room.on('broadcast', ({ event, data }: { event: string; data: unknown }) => {
      this.io.to(code).emit(event, data)
    })

    room.on('broadcastExcept', ({ excludeId, event, data }: { excludeId: string; event: string; data: unknown }) => {
      this.io.to(code).except(excludeId).emit(event, data)
    })

    this.rooms.set(code, room)
    return code
  }

  joinRoom(socket: Socket, name: string, gameCode: string): boolean {
    let room = this.rooms.get(gameCode)
    if (!room) {
      // Создать комнату если не существует
      this.rooms.set(gameCode, new GameRoom(gameCode, questions as Question[]))
      room = this.rooms.get(gameCode)!
      room.on('broadcast', ({ event, data }: { event: string; data: unknown }) => {
        this.io.to(gameCode).emit(event, data)
      })
      room.on('broadcastExcept', ({ excludeId, event, data }: { excludeId: string; event: string; data: unknown }) => {
        this.io.to(gameCode).except(excludeId).emit(event, data)
      })
    }

    socket.join(gameCode)
    this.playerRoom.set(socket.id, gameCode)
    room.addPlayer(socket.id, name)
    return true
  }

  leaveRoom(socketId: string) {
    const gameCode = this.playerRoom.get(socketId)
    if (!gameCode) return
    this.rooms.get(gameCode)?.removePlayer(socketId)
    this.playerRoom.delete(socketId)
  }

  getRoom(socketId: string): GameRoom | undefined {
    const code = this.playerRoom.get(socketId)
    return code ? this.rooms.get(code) : undefined
  }
}
```

- [ ] **Step 7.3: Создать socket handlers**

```typescript
// server/src/socket/handlers.ts
import type { Socket } from 'socket.io'
import type { GameEngine } from '../game/GameEngine'
import type {
  JoinGamePayload, PlaceBetPayload,
  SubmitAnswerPayload, GladiatorHoverPayload
} from '@cumsino/shared'

export function registerHandlers(socket: Socket, engine: GameEngine) {
  socket.on('join_game', ({ name, gameCode }: JoinGamePayload) => {
    if (!name?.trim() || !gameCode?.trim()) return
    engine.joinRoom(socket, name.trim(), gameCode.trim().toUpperCase())
  })

  socket.on('start_game', () => {
    engine.getRoom(socket.id)?.start()
  })

  socket.on('place_bet', ({ amount, target }: PlaceBetPayload) => {
    if (typeof amount !== 'number' || amount < 0) return
    engine.getRoom(socket.id)?.placeBet(socket.id, amount, target)
  })

  socket.on('submit_answer', ({ answer }: SubmitAnswerPayload) => {
    if (answer === undefined || answer === null) return
    engine.getRoom(socket.id)?.submitAnswer(socket.id, answer)
  })

  socket.on('gladiator_hover', ({ optionIndex }: GladiatorHoverPayload) => {
    engine.getRoom(socket.id)?.relayHover(socket.id, optionIndex)
  })

  socket.on('disconnect', () => {
    engine.leaveRoom(socket.id)
  })
}
```

- [ ] **Step 7.4: Создать server/src/index.ts**

```typescript
// server/src/index.ts
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { GameEngine } from './game/GameEngine'
import { registerHandlers } from './socket/handlers'

const app = express()
const httpServer = createServer(app)

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'

const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
})

app.use(cors({ origin: CLIENT_ORIGIN }))
app.get('/health', (_req, res) => res.json({ ok: true }))

const engine = new GameEngine(io)

io.on('connection', (socket) => {
  console.log('connected:', socket.id)
  registerHandlers(socket, engine)
})

const PORT = process.env.PORT ?? 3001
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
```

- [ ] **Step 7.5: Запустить сервер и убедиться что стартует без ошибок**

```bash
cd C:/Dev/Cumsino && npm run dev --workspace=server
```

Ожидание: `Server running on port 3001`

- [ ] **Step 7.6: Проверить health endpoint**

```bash
curl http://localhost:3001/health
```

Ожидание: `{"ok":true}`

- [ ] **Step 7.7: Commit**

```bash
git add server/src/ server/questions.json
git commit -m "feat(server): GameEngine + Socket.IO handlers + entry point"
```

---

## Task 8: Render.com Deployment Config

**Files:**
- Create: `server/render.yaml` (опционально — через UI Render.com)
- Create: `.env.example`

- [ ] **Step 8.1: Создать .env.example для сервера**

```bash
# server/.env.example
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
```

- [ ] **Step 8.2: Убедиться что server/package.json имеет корректный build+start**

Проверить что в `server/package.json`:
```json
"scripts": {
  "build": "tsc",
  "start": "node dist/index.js"
}
```

- [ ] **Step 8.3: Тест билда**

```bash
cd C:/Dev/Cumsino && npm run build --workspace=server
```

Ожидание: папка `server/dist/` создана без ошибок TypeScript.

- [ ] **Step 8.4: Запустить скомпилированный сервер**

```bash
cd C:/Dev/Cumsino/server && node dist/index.js
```

Ожидание: `Server running on port 3001`

- [ ] **Step 8.5: Commit**

```bash
git add server/.env.example
git commit -m "chore(server): deployment config и .env.example"
```

---

## Self-Review

### Покрытие спека

| Требование | Task |
|-----------|------|
| Монорепо shared + server | 1 |
| Типы GameState, Player, Question | 2 |
| decomposeToChips с мелкими фишками | 2 |
| distributePool (ВОПРОС + ГЛАДИАТОР) | 3 |
| distributeClosest (КТО БЛИЖЕ) | 4 |
| distributeTop5 (ТОП 5) | 4 |
| RoundSelector (70/30) | 5 |
| Фазовая машина: LOBBY→ANNOUNCE→BETTING→QUESTION_TEXT→QUESTION→REVEAL→LEADERBOARD | 6 |
| QUESTION_TEXT → QUESTION (5 сек задержка) | 6 |
| Гладиатор: рандомный выбор, +300 бонус | 6 |
| gladiator_hover relay | 6, 7 |
| Банк вопросов 4 режима × 5 вопросов | 7 |
| join_game, start_game, place_bet, submit_answer | 7 |
| Автодвижение по таймеру | 6 |
| Ранний выход из QUESTION (все ответили) | 6 |
| Деплой на Render.com | 8 |
