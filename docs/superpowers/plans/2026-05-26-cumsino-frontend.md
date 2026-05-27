# Cumsino Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Prerequisite:** Backend plan (`2026-05-26-cumsino-backend.md`) должен быть реализован и сервер должен быть запущен на `http://localhost:3001`.

**Goal:** Реализовать React-клиент в стиле казино со всеми игровыми экранами, анимацией фишек и WebSocket-подключением к серверу.

**Architecture:** Vite + React + TypeScript. Zustand хранит `GameState` и обновляет его при каждом событии `game_state`. `App.tsx` рендерит нужный экран на основе `phase`. Framer Motion анимирует фишки.

**Tech Stack:** Vite, React 18, TypeScript, TailwindCSS, Framer Motion, Socket.IO client, Zustand, @dnd-kit

---

## Файловая структура

```
client/
  package.json
  tsconfig.json
  vite.config.ts
  tailwind.config.ts
  postcss.config.js
  index.html
  src/
    main.tsx
    App.tsx                              ← роутинг phase → screen
    socket.ts                            ← Socket.IO singleton
    store/
      gameStore.ts                       ← Zustand store
    components/
      ui/
        Chip.tsx                         ← одна фишка (кликабельная или статичная)
        ChipStack.tsx                    ← стопка фишек игрока
        Timer.tsx                        ← обратный отсчёт с анимацией
        PlayerCard.tsx                   ← карточка игрока в лобби/сайдбаре
      screens/
        JoinScreen.tsx                   ← ввод имени + кода комнаты
        LobbyScreen.tsx                  ← список игроков + кнопка старта
        AnnounceScreen.tsx               ← тема и режим раунда
        BettingScreen.tsx                ← выбор фишек, подтверждение
        QuestionTextScreen.tsx           ← вопрос без вариантов
        QuestionScreen.tsx               ← вопрос + A/B/C/D
        GladiatorCrowdScreen.tsx         ← ставки в корзины + ховер гладиатора
        GladiatorSelfScreen.tsx          ← гладиатор видит вопрос + варианты
        ClosestScreen.tsx                ← числовой инпут
        Top5Screen.tsx                   ← drag-and-drop сортировка
        RevealScreen.tsx                 ← итоги раунда с дельтами
        LeaderboardScreen.tsx            ← таблица лидеров
        GameOverScreen.tsx               ← победитель
```

---

## Task 1: Client Scaffolding

**Files:**
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/tailwind.config.ts`
- Create: `client/postcss.config.js`
- Create: `client/index.html`
- Create: `client/src/main.tsx`

- [ ] **Step 1.1: Создать client/package.json**

```json
{
  "name": "@cumsino/client",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest",
    "deploy": "gh-pages -d dist"
  },
  "dependencies": {
    "@cumsino/shared": "*",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "framer-motion": "^11.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "socket.io-client": "^4.7.2",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "gh-pages": "^6.1.1",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.3",
    "vite": "^5.0.0",
    "vitest": "^1.2.0"
  }
}
```

- [ ] **Step 1.2: Создать client/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": {
      "@cumsino/shared": ["../shared/index.ts"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 1.3: Создать client/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@cumsino/shared': path.resolve(__dirname, '../shared/index.ts'),
    },
  },
  server: {
    port: 5173,
  },
  base: '/cumsino/', // для GitHub Pages
})
```

- [ ] **Step 1.4: Создать client/tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          900: '#0d1f0d',
          800: '#1a3a1a',
          700: '#2a4a2a',
          600: '#3a6a3a',
        },
        gold: {
          DEFAULT: '#ffd700',
          dark: '#cc9900',
        },
      },
      fontFamily: {
        casino: ['Georgia', 'serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 1.5: Создать client/postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 1.6: Создать client/index.html**

```html
<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cumsino ♠</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 1.7: Создать client/src/main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 1.8: Создать client/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #0d1f0d;
  color: #e8d9b0;
  font-family: Georgia, serif;
  min-height: 100vh;
  margin: 0;
}

* {
  box-sizing: border-box;
}
```

- [ ] **Step 1.9: Установить зависимости и убедиться что стартует**

```bash
cd C:/Dev/Cumsino && npm install
npm run dev --workspace=client
```

Ожидание: Vite стартует на `http://localhost:5173`

- [ ] **Step 1.10: Commit**

```bash
git add client/
git commit -m "chore(client): scaffolding Vite + React + Tailwind"
```

---

## Task 2: Socket Singleton + Zustand Store

**Files:**
- Create: `client/src/socket.ts`
- Create: `client/src/store/gameStore.ts`

- [ ] **Step 2.1: Создать socket.ts**

```typescript
// client/src/socket.ts
import { io, Socket } from 'socket.io-client'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export const socket: Socket = io(SERVER_URL, {
  autoConnect: false,
})
```

- [ ] **Step 2.2: Создать gameStore.ts**

```typescript
// client/src/store/gameStore.ts
import { create } from 'zustand'
import { socket } from '../socket'
import type {
  GameState, Player, RoundResult,
  BetUpdatedPayload, PlayerAnsweredPayload,
  GladiatorHoveringPayload, GameOverPayload,
} from '@cumsino/shared'

interface GameStore {
  // Состояние игры
  gameState: GameState | null
  myId: string | null
  roundResults: RoundResult[]
  winner: Player | null
  answeredIds: Set<string>
  gladiatorHoverIndex: number | null

  // Ставки (локальное состояние до подтверждения)
  pendingBet: number
  pendingTarget: 'win' | 'lose' | null

  // Действия
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
  // Подписки на Socket.IO
  socket.on('connect', () => {
    set({ myId: socket.id ?? null })
  })

  socket.on('game_state', (state: GameState) => {
    set({
      gameState: state,
      answeredIds: new Set(),
      roundResults: [],
      gladiatorHoverIndex: null,
    })
  })

  socket.on('bet_updated', (_payload: BetUpdatedPayload) => {
    // Обновление отображается через game_state; bet_updated только для анимаций
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

// Вычисляемые селекторы
export const selectMe = (s: GameStore): Player | undefined =>
  s.gameState?.players.find(p => p.id === s.myId)

export const selectIsGladiator = (s: GameStore): boolean =>
  s.myId !== null && s.gameState?.gladiatorId === s.myId
```

- [ ] **Step 2.3: Добавить VITE_SERVER_URL в .env.example**

```bash
# client/.env.example
VITE_SERVER_URL=http://localhost:3001
```

- [ ] **Step 2.4: Commit**

```bash
git add client/src/socket.ts client/src/store/ client/.env.example
git commit -m "feat(client): Socket.IO singleton + Zustand gameStore"
```

---

## Task 3: UI Атомы — Chip, Timer, PlayerCard

**Files:**
- Create: `client/src/components/ui/Chip.tsx`
- Create: `client/src/components/ui/Timer.tsx`
- Create: `client/src/components/ui/PlayerCard.tsx`

- [ ] **Step 3.1: Создать Chip.tsx**

```tsx
// client/src/components/ui/Chip.tsx
import { motion } from 'framer-motion'

export type ChipValue = 10 | 20 | 50 | 100 | 500

interface ChipProps {
  value: ChipValue
  onClick?: () => void
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  layoutId?: string
}

const CHIP_STYLES: Record<ChipValue, string> = {
  10: 'bg-gradient-to-br from-gray-200 to-gray-500 text-gray-900 border-gray-300',
  20: 'bg-gradient-to-br from-green-400 to-green-700 text-white border-green-300',
  50: 'bg-gradient-to-br from-blue-400 to-blue-700 text-white border-blue-300',
  100: 'bg-gradient-to-br from-red-400 to-red-700 text-white border-red-300',
  500: 'bg-gradient-to-br from-gray-700 to-black text-yellow-400 border-gray-600',
}

const SIZE_CLASSES = {
  sm: 'w-10 h-10 text-xs border-2',
  md: 'w-14 h-14 text-sm border-[3px]',
  lg: 'w-16 h-16 text-base border-4',
}

export function Chip({ value, onClick, size = 'md', disabled = false, layoutId }: ChipProps) {
  return (
    <motion.button
      layoutId={layoutId}
      whileHover={!disabled ? { scale: 1.1, y: -4 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={disabled ? undefined : onClick}
      className={`
        ${SIZE_CLASSES[size]}
        ${CHIP_STYLES[value]}
        rounded-full font-bold flex items-center justify-center
        shadow-[0_4px_8px_rgba(0,0,0,0.6)]
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        select-none
      `}
    >
      {value}
    </motion.button>
  )
}
```

- [ ] **Step 3.2: Создать Timer.tsx**

```tsx
// client/src/components/ui/Timer.tsx
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface TimerProps {
  seconds: number
}

export function Timer({ seconds }: TimerProps) {
  const [current, setCurrent] = useState(seconds)

  useEffect(() => {
    setCurrent(seconds)
    const id = setInterval(() => {
      setCurrent(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [seconds])

  const isUrgent = current <= 5

  return (
    <motion.div
      animate={isUrgent ? { scale: [1, 1.1, 1] } : {}}
      transition={{ repeat: Infinity, duration: 0.8 }}
      className={`
        inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold
        ${isUrgent ? 'bg-red-600 text-white' : 'bg-gold text-black'}
      `}
    >
      ⏱ {current} сек
    </motion.div>
  )
}
```

- [ ] **Step 3.3: Создать PlayerCard.tsx**

```tsx
// client/src/components/ui/PlayerCard.tsx
import type { Player } from '@cumsino/shared'
import { ChipValue } from './Chip'
import { decomposeToChips } from '@cumsino/shared'

interface PlayerCardProps {
  player: Player
  isMe?: boolean
  isGladiator?: boolean
  hasAnswered?: boolean
}

export function PlayerCard({ player, isMe, isGladiator, hasAnswered }: PlayerCardProps) {
  const breakdown = decomposeToChips(player.chips)

  return (
    <div className={`
      rounded-xl p-3 border
      ${isMe ? 'border-gold bg-felt-700' : 'border-felt-600 bg-felt-800'}
    `}>
      <div className="flex items-center gap-2 mb-1">
        {isGladiator && <span title="Гладиатор">⚔️</span>}
        {hasAnswered && <span title="Ответил">✓</span>}
        <span className="font-bold text-sm truncate">{player.name}</span>
        {isMe && <span className="text-xs text-gold ml-auto">(ты)</span>}
      </div>
      <div className="text-gold font-mono text-lg">{player.chips} 🪙</div>
      <div className="flex flex-wrap gap-1 mt-1">
        {(Object.entries(breakdown) as [string, number][])
          .filter(([, count]) => count > 0)
          .map(([denom, count]) => (
            <span key={denom} className="text-xs text-gray-400">
              {count}×{denom}
            </span>
          ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3.4: Commit**

```bash
git add client/src/components/ui/
git commit -m "feat(client): UI атомы — Chip, Timer, PlayerCard"
```

---

## Task 4: JoinScreen + LobbyScreen

**Files:**
- Create: `client/src/components/screens/JoinScreen.tsx`
- Create: `client/src/components/screens/LobbyScreen.tsx`

- [ ] **Step 4.1: Создать JoinScreen.tsx**

```tsx
// client/src/components/screens/JoinScreen.tsx
import { useState } from 'react'
import { useGameStore } from '../../store/gameStore'

export function JoinScreen() {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const connect = useGameStore(s => s.connect)

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !code.trim()) return
    connect(name.trim(), code.trim().toUpperCase())
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-5xl text-gold text-center mb-2 font-casino" style={{
          textShadow: '0 0 30px rgba(255,215,0,0.5)'
        }}>
          ♠ CUMSINO ♠
        </h1>
        <p className="text-center text-gray-400 mb-8 text-sm">Викторина со ставками</p>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-widest text-gray-400 mb-1">
              Твоё имя
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={20}
              placeholder="Введи имя"
              className="w-full bg-felt-700 border border-felt-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-gold"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-gray-400 mb-1">
              Код комнаты
            </label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder="XXXX"
              className="w-full bg-felt-700 border border-felt-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 font-mono text-center text-2xl tracking-widest focus:outline-none focus:border-gold"
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim() || code.length < 4}
            className="w-full bg-gradient-to-r from-gold to-yellow-600 text-black font-bold py-3 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
          >
            ВОЙТИ В ИГРУ
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4.2: Создать LobbyScreen.tsx**

```tsx
// client/src/components/screens/LobbyScreen.tsx
import { useGameStore, selectMe } from '../../store/gameStore'
import { PlayerCard } from '../ui/PlayerCard'

export function LobbyScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const me = useGameStore(selectMe)
  const startGame = useGameStore(s => s.startGame)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl text-gold mb-2 font-casino" style={{
        textShadow: '0 0 20px rgba(255,215,0,0.4)'
      }}>
        ♠ CUMSINO ♠
      </h1>

      <div className="mb-6 text-center">
        <div className="text-xs uppercase tracking-widest text-gray-400">Код комнаты</div>
        <div className="text-5xl font-mono text-white tracking-[0.3em] mt-1">
          {gameState.id}
        </div>
      </div>

      <div className="w-full max-w-md mb-6">
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">
          Игроки ({gameState.players.length})
        </div>
        <div className="grid grid-cols-2 gap-3">
          {gameState.players.map(player => (
            <PlayerCard
              key={player.id}
              player={player}
              isMe={player.id === me?.id}
            />
          ))}
        </div>
      </div>

      <button
        onClick={startGame}
        className="px-10 py-4 bg-gradient-to-r from-gold to-yellow-600 text-black font-bold text-lg rounded-xl hover:brightness-110 transition-all shadow-lg"
      >
        ▶ НАЧАТЬ ИГРУ
      </button>

      <p className="text-gray-500 text-xs mt-4">
        Стартовый капитал: 500 фишек · Цель: 3000 фишек
      </p>
    </div>
  )
}
```

- [ ] **Step 4.3: Commit**

```bash
git add client/src/components/screens/JoinScreen.tsx client/src/components/screens/LobbyScreen.tsx
git commit -m "feat(client): JoinScreen + LobbyScreen"
```

---

## Task 5: AnnounceScreen + BettingScreen

**Files:**
- Create: `client/src/components/screens/AnnounceScreen.tsx`
- Create: `client/src/components/screens/BettingScreen.tsx`

- [ ] **Step 5.1: Создать AnnounceScreen.tsx**

```tsx
// client/src/components/screens/AnnounceScreen.tsx
import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { Timer } from '../ui/Timer'

const MODE_LABELS: Record<string, string> = {
  all: '🧠 ВОПРОС ДЛЯ ВСЕХ',
  gladiator: '⚔️ ГЛАДИАТОР',
  closest: '🎯 КТО БЛИЖЕ',
  top5: '📊 ТОП 5',
}

export function AnnounceScreen() {
  const gameState = useGameStore(s => s.gameState)!

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <Timer seconds={gameState.phaseTimeLeft} />

      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8"
      >
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-2">Режим раунда</div>
        <div className="text-4xl font-bold text-gold mb-6">
          {MODE_LABELS[gameState.mode] ?? gameState.mode}
        </div>

        {gameState.currentQuestion && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="bg-felt-700 border border-felt-600 rounded-2xl px-8 py-4"
          >
            <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">Тема</div>
            <div className="text-2xl text-white">{gameState.currentQuestion.topic}</div>
          </motion.div>
        )}
      </motion.div>

      {(gameState.mode === 'all' || gameState.mode === 'gladiator') && (
        <p className="mt-8 text-gray-400 text-sm">Готовься к ставкам…</p>
      )}
    </div>
  )
}
```

- [ ] **Step 5.2: Создать BettingScreen.tsx**

```tsx
// client/src/components/screens/BettingScreen.tsx
import { useGameStore, selectMe, selectIsGladiator } from '../../store/gameStore'
import { Chip, ChipValue } from '../ui/Chip'
import { Timer } from '../ui/Timer'

const CHIP_VALUES: ChipValue[] = [10, 20, 50, 100, 500]

export function BettingScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const me = useGameStore(selectMe)
  const isGladiator = useGameStore(selectIsGladiator)
  const pendingBet = useGameStore(s => s.pendingBet)
  const pendingTarget = useGameStore(s => s.pendingTarget)
  const addChip = useGameStore(s => s.addChipToBet)
  const removeChip = useGameStore(s => s.removeLastChip)
  const confirm = useGameStore(s => s.confirmBet)
  const setTarget = useGameStore(s => s.setPendingTarget)

  // Гладиатор видит заглушку во время ставок толпы
  if (isGladiator && gameState.mode === 'gladiator') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Timer seconds={gameState.phaseTimeLeft} />
        <div className="mt-8 text-6xl mb-4">⚔️</div>
        <div className="text-3xl text-gold font-bold mb-2">Ты — Гладиатор!</div>
        <div className="text-gray-400">Толпа делает ставки на тебя…</div>
        <div className="mt-4 text-sm text-gray-500 animate-pulse">Жди вопроса</div>
      </div>
    )
  }

  const isGladiatorMode = gameState.mode === 'gladiator'
  const gladiatorName = gameState.players.find(p => p.id === gameState.gladiatorId)?.name

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <Timer seconds={gameState.phaseTimeLeft} />

      <div className="w-full max-w-md mt-4">
        {gameState.currentQuestion && (
          <div className="bg-felt-700 border border-felt-600 rounded-xl px-6 py-3 text-center mb-4">
            <div className="text-xs uppercase tracking-widest text-gray-400">Тема</div>
            <div className="text-xl text-white">{gameState.currentQuestion.topic}</div>
            {isGladiatorMode && gladiatorName && (
              <div className="mt-2 text-gold text-sm">Гладиатор: <strong>{gladiatorName}</strong></div>
            )}
          </div>
        )}

        {/* Корзины для режима ГЛАДИАТОР */}
        {isGladiatorMode && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {(['win', 'lose'] as const).map(target => (
              <button
                key={target}
                onClick={() => setTarget(target)}
                className={`
                  rounded-xl py-4 text-center border-2 transition-all
                  ${pendingTarget === target
                    ? target === 'win'
                      ? 'border-green-400 bg-green-900'
                      : 'border-red-400 bg-red-900'
                    : 'border-felt-600 bg-felt-800'
                  }
                `}
              >
                <div className="text-2xl">{target === 'win' ? '👍' : '💀'}</div>
                <div className="text-xs font-bold mt-1">
                  {target === 'win' ? 'ОН ОТВЕТИТ' : 'ОН ЗАВАЛИТ'}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Фишки */}
        <div className="text-xs uppercase tracking-widest text-gray-400 text-center mb-2">
          Выбери фишки
        </div>
        <div className="flex justify-center gap-2 mb-4 flex-wrap">
          {CHIP_VALUES.map(v => (
            <div key={v} className="flex flex-col items-center gap-1">
              <Chip
                value={v}
                size="md"
                onClick={() => addChip(v)}
                disabled={!me || pendingBet + v > me.chips}
              />
              <button
                onClick={() => removeChip(v)}
                className="text-xs text-gray-500 hover:text-gray-300"
                title={`Убрать ${v}`}
              >
                −
              </button>
            </div>
          ))}
        </div>

        {/* Текущая ставка */}
        <div className="bg-felt-900 border border-felt-600 rounded-xl p-4 text-center mb-4">
          <div className="text-xs uppercase tracking-widest text-gray-400">Твоя ставка</div>
          <div className="text-4xl font-mono text-gold mt-1">{pendingBet} 🪙</div>
          <div className="text-xs text-gray-500 mt-1">
            Баланс: {me?.chips ?? 0} фишек
          </div>
        </div>

        <button
          onClick={confirm}
          disabled={pendingBet <= 0 || (isGladiatorMode && !pendingTarget)}
          className="w-full py-3 bg-gradient-to-r from-gold to-yellow-600 text-black font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
        >
          ✓ ПОДТВЕРДИТЬ СТАВКУ
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5.3: Commit**

```bash
git add client/src/components/screens/AnnounceScreen.tsx client/src/components/screens/BettingScreen.tsx
git commit -m "feat(client): AnnounceScreen + BettingScreen с фишками"
```

---

## Task 6: QuestionTextScreen + QuestionScreen

**Files:**
- Create: `client/src/components/screens/QuestionTextScreen.tsx`
- Create: `client/src/components/screens/QuestionScreen.tsx`

- [ ] **Step 6.1: Создать QuestionTextScreen.tsx**

```tsx
// client/src/components/screens/QuestionTextScreen.tsx
import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { Timer } from '../ui/Timer'

export function QuestionTextScreen() {
  const gameState = useGameStore(s => s.gameState)!

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <Timer seconds={gameState.phaseTimeLeft} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="mt-8 max-w-lg"
      >
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-4">Вопрос</div>
        <div className="text-2xl text-white leading-relaxed">
          {gameState.currentQuestion?.text}
        </div>
        <motion.div
          className="mt-6 text-gray-500 text-sm animate-pulse"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          Варианты ответов появятся через несколько секунд…
        </motion.div>
      </motion.div>
    </div>
  )
}
```

- [ ] **Step 6.2: Создать QuestionScreen.tsx**

```tsx
// client/src/components/screens/QuestionScreen.tsx
import { motion } from 'framer-motion'
import { useGameStore, selectIsGladiator } from '../../store/gameStore'
import { Timer } from '../ui/Timer'

const OPTION_LABELS = ['A', 'B', 'C', 'D']
const OPTION_COLORS = [
  'border-blue-500 hover:bg-blue-900',
  'border-green-500 hover:bg-green-900',
  'border-yellow-500 hover:bg-yellow-900',
  'border-red-500 hover:bg-red-900',
]

export function QuestionScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)
  const answeredIds = useGameStore(s => s.answeredIds)
  const gladiatorHoverIndex = useGameStore(s => s.gladiatorHoverIndex)
  const isGladiator = useGameStore(selectIsGladiator)
  const submitAnswer = useGameStore(s => s.submitAnswer)
  const sendHover = useGameStore(s => s.sendHover)

  const me = gameState.players.find(p => p.id === myId)
  const myAnswered = me ? answeredIds.has(me.id) : false
  const options = gameState.currentQuestion?.options ?? []
  const isGladiatorMode = gameState.mode === 'gladiator'

  function handleMouseEnter(idx: number) {
    if (isGladiator && isGladiatorMode) sendHover(idx)
  }

  function handleMouseLeave() {
    if (isGladiator && isGladiatorMode) sendHover(null)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <Timer seconds={gameState.phaseTimeLeft} />

      <div className="w-full max-w-lg mt-4">
        <div className="text-center mb-6">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Вопрос</div>
          <div className="text-xl text-white leading-relaxed">
            {gameState.currentQuestion?.text}
          </div>
        </div>

        {/* Счётчик ответивших */}
        <div className="flex justify-center gap-2 mb-4">
          {gameState.players.map(p => (
            <span
              key={p.id}
              className={`w-2 h-2 rounded-full ${answeredIds.has(p.id) ? 'bg-green-400' : 'bg-gray-600'}`}
              title={p.name}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {options.map((option, idx) => {
            const isHovered = !isGladiator && gladiatorHoverIndex === idx && isGladiatorMode
            return (
              <motion.button
                key={idx}
                onMouseEnter={() => handleMouseEnter(idx)}
                onMouseLeave={handleMouseLeave}
                onClick={() => !myAnswered && submitAnswer(option)}
                disabled={myAnswered}
                animate={isHovered ? { scale: 1.03, boxShadow: '0 0 20px rgba(255,215,0,0.5)' } : {}}
                className={`
                  p-4 rounded-xl border-2 text-left transition-colors
                  ${OPTION_COLORS[idx]}
                  ${myAnswered ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  ${isHovered ? 'border-gold bg-yellow-900/30' : ''}
                  bg-felt-800
                `}
              >
                <div className="flex items-center gap-3">
                  <span className={`
                    w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                    bg-felt-700 border ${OPTION_COLORS[idx].split(' ')[0]}
                  `}>
                    {OPTION_LABELS[idx]}
                  </span>
                  <span className="text-sm">{option}</span>
                </div>
              </motion.button>
            )
          })}
        </div>

        {myAnswered && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-green-400 mt-4 text-sm"
          >
            ✓ Ответ принят, ждём остальных…
          </motion.p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6.3: Commit**

```bash
git add client/src/components/screens/QuestionTextScreen.tsx client/src/components/screens/QuestionScreen.tsx
git commit -m "feat(client): QuestionTextScreen + QuestionScreen с ховером гладиатора"
```

---

## Task 7: GladiatorCrowdScreen + GladiatorSelfScreen

**Files:**
- Create: `client/src/components/screens/GladiatorCrowdScreen.tsx`
- Create: `client/src/components/screens/GladiatorSelfScreen.tsx`

- [ ] **Step 7.1: Создать GladiatorCrowdScreen.tsx**

Этот экран показывается ТОЛПЕ в режиме ГЛАДИАТОР во время фазы BETTING. Толпа видит вопрос, правильный ответ (получает через отдельное событие — сервер шлёт его только в `game_state` для толпы, но не для гладиатора), и делает ставки.

**Важно:** В `GameRoom.ts` при переходе в BETTING для режима gladiator, сервер должен шлать `game_state` с правильным ответом только толпе. Для этого метод `getPublicState()` нужно расширить — добавить параметр `forPlayerId` и включать `answer` только если `forPlayerId !== gladiatorId`.

Для простоты на первом этапе: ответ включается в `game_state` только если игрок не гладиатор. Добавь в `GameRoom.ts`:

```typescript
// В GameRoom.ts — заменить метод broadcast для фазы BETTING/QUESTION_TEXT/QUESTION в режиме gladiator
private broadcastGameState() {
  if (this.currentMode === 'gladiator' && this.gladiatorId) {
    for (const [playerId] of this.players) {
      const forGladiator = playerId === this.gladiatorId
      const state = this.getPublicState(forGladiator)
      this.emit('broadcastToPlayer', { playerId, event: 'game_state', data: state })
    }
  } else {
    this.broadcast('game_state', this.getPublicState(false))
  }
}
```

И добавь параметр в `getPublicState`:
```typescript
getPublicState(hideAnswer = false): GameState {
  // ...
  currentQuestion: this.currentQuestion ? {
    ...
    // Для гладиатора скрываем answer (он его не должен видеть в BETTING)
    // answer не входит в GameState.currentQuestion по типу — ок
  } : null,
  // Добавить поле gladiatorAnswer для толпы:
  gladiatorAnswer: (!hideAnswer && this.currentMode === 'gladiator' && this.phase === 'BETTING')
    ? this.currentQuestion?.answer
    : undefined,
}
```

Обнови `GameState` в `shared/src/types.ts`:
```typescript
interface GameState {
  // ...существующие поля...
  gladiatorAnswer?: string // ответ для толпы в режиме ГЛАДИАТОР
}
```

Теперь создай экран:

```tsx
// client/src/components/screens/GladiatorCrowdScreen.tsx
import { useGameStore, selectMe } from '../../store/gameStore'
import { Chip, ChipValue } from '../ui/Chip'
import { Timer } from '../ui/Timer'

const CHIP_VALUES: ChipValue[] = [10, 20, 50, 100, 500]

export function GladiatorCrowdScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const me = useGameStore(selectMe)
  const pendingBet = useGameStore(s => s.pendingBet)
  const pendingTarget = useGameStore(s => s.pendingTarget)
  const addChip = useGameStore(s => s.addChipToBet)
  const removeChip = useGameStore(s => s.removeLastChip)
  const confirm = useGameStore(s => s.confirmBet)
  const setTarget = useGameStore(s => s.setPendingTarget)

  const gladiatorName = gameState.players.find(p => p.id === gameState.gladiatorId)?.name
  const gladiatorAnswer = (gameState as GameState & { gladiatorAnswer?: string }).gladiatorAnswer

  return (
    <div className="min-h-screen flex flex-col items-center p-4 pt-6">
      <Timer seconds={gameState.phaseTimeLeft} />

      <div className="text-center mt-4 mb-4">
        <div className="text-xs uppercase tracking-widest text-gray-400">Гладиатор</div>
        <div className="text-3xl font-bold text-gold">⚔️ {gladiatorName}</div>
      </div>

      {gameState.currentQuestion && (
        <div className="w-full max-w-md bg-felt-700 border border-felt-600 rounded-xl p-4 mb-4 text-center">
          <div className="text-sm text-white mb-2">{gameState.currentQuestion.text}</div>
          {gladiatorAnswer && (
            <div className="text-xs text-gray-400">
              Правильный ответ: <strong className="text-gold">{gladiatorAnswer}</strong>
            </div>
          )}
        </div>
      )}

      <div className="w-full max-w-md">
        <div className="grid grid-cols-2 gap-3 mb-4">
          {(['win', 'lose'] as const).map(target => (
            <button
              key={target}
              onClick={() => setTarget(target)}
              className={`
                rounded-xl py-5 text-center border-2 transition-all
                ${pendingTarget === target
                  ? target === 'win' ? 'border-green-400 bg-green-900' : 'border-red-400 bg-red-900'
                  : 'border-felt-600 bg-felt-800 hover:border-gray-500'
                }
              `}
            >
              <div className="text-3xl">{target === 'win' ? '👍' : '💀'}</div>
              <div className="text-xs font-bold mt-2">
                {target === 'win' ? 'ОН ОТВЕТИТ' : 'ОН ЗАВАЛИТ'}
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-center gap-2 mb-4 flex-wrap">
          {CHIP_VALUES.map(v => (
            <div key={v} className="flex flex-col items-center gap-1">
              <Chip value={v} onClick={() => addChip(v)} disabled={!me || pendingBet + v > me.chips} />
              <button onClick={() => removeChip(v)} className="text-xs text-gray-500 hover:text-gray-300">−</button>
            </div>
          ))}
        </div>

        <div className="bg-felt-900 border border-felt-600 rounded-xl p-3 text-center mb-4">
          <div className="text-xs text-gray-400">Ставка</div>
          <div className="text-3xl font-mono text-gold">{pendingBet} 🪙</div>
        </div>

        <button
          onClick={confirm}
          disabled={pendingBet <= 0 || !pendingTarget}
          className="w-full py-3 bg-gradient-to-r from-gold to-yellow-600 text-black font-bold rounded-xl disabled:opacity-40"
        >
          ✓ ПОДТВЕРДИТЬ
        </button>
      </div>
    </div>
  )
}

// Добавить импорт типа
import type { GameState } from '@cumsino/shared'
```

- [ ] **Step 7.2: Создать GladiatorSelfScreen.tsx**

Этот экран гладиатор видит во время QUESTION — полноэкранный вопрос с вариантами, без информации о ставках толпы. Логика идентична QuestionScreen, но без ховер-индикаторов от других игроков (гладиатор сам отправляет hover, не получает).

```tsx
// client/src/components/screens/GladiatorSelfScreen.tsx
import { useGameStore } from '../../store/gameStore'
import { Timer } from '../ui/Timer'

const OPTION_LABELS = ['A', 'B', 'C', 'D']
const OPTION_COLORS = [
  'border-blue-500 hover:bg-blue-900',
  'border-green-500 hover:bg-green-900',
  'border-yellow-500 hover:bg-yellow-900',
  'border-red-500 hover:bg-red-900',
]

export function GladiatorSelfScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)
  const answeredIds = useGameStore(s => s.answeredIds)
  const submitAnswer = useGameStore(s => s.submitAnswer)
  const sendHover = useGameStore(s => s.sendHover)

  const myAnswered = myId ? answeredIds.has(myId) : false
  const options = gameState.currentQuestion?.options ?? []

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="text-center mb-4">
        <div className="text-2xl text-gold mb-1">⚔️ Ты — Гладиатор!</div>
        <div className="text-xs text-gray-400">Толпа наблюдает за твоим выбором</div>
      </div>

      <Timer seconds={gameState.phaseTimeLeft} />

      <div className="w-full max-w-lg mt-6">
        <div className="text-center text-white text-xl mb-6 leading-relaxed">
          {gameState.currentQuestion?.text}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {options.map((option, idx) => (
            <button
              key={idx}
              onMouseEnter={() => sendHover(idx)}
              onMouseLeave={() => sendHover(null)}
              onClick={() => !myAnswered && submitAnswer(option)}
              disabled={myAnswered}
              className={`
                p-4 rounded-xl border-2 text-left transition-colors bg-felt-800
                ${OPTION_COLORS[idx]}
                ${myAnswered ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-felt-700">
                  {OPTION_LABELS[idx]}
                </span>
                <span className="text-sm">{option}</span>
              </div>
            </button>
          ))}
        </div>

        {myAnswered && (
          <p className="text-center text-green-400 mt-4 text-sm">
            ✓ Ответ отправлен
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 7.3: Commit**

```bash
git add client/src/components/screens/GladiatorCrowdScreen.tsx client/src/components/screens/GladiatorSelfScreen.tsx
git commit -m "feat(client): GladiatorCrowdScreen + GladiatorSelfScreen"
```

---

## Task 8: ClosestScreen + Top5Screen

**Files:**
- Create: `client/src/components/screens/ClosestScreen.tsx`
- Create: `client/src/components/screens/Top5Screen.tsx`

- [ ] **Step 8.1: Создать ClosestScreen.tsx**

```tsx
// client/src/components/screens/ClosestScreen.tsx
import { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { Timer } from '../ui/Timer'

export function ClosestScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)
  const answeredIds = useGameStore(s => s.answeredIds)
  const submitAnswer = useGameStore(s => s.submitAnswer)
  const [value, setValue] = useState('')

  const myAnswered = myId ? answeredIds.has(myId) : false

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = parseFloat(value)
    if (isNaN(num)) return
    submitAnswer(num)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <Timer seconds={gameState.phaseTimeLeft} />

      <div className="w-full max-w-md mt-6 text-center">
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-2">🎯 КТО БЛИЖЕ</div>
        <div className="text-xl text-white leading-relaxed mb-8">
          {gameState.currentQuestion?.text}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="number"
            value={value}
            onChange={e => setValue(e.target.value)}
            disabled={myAnswered}
            placeholder="Введи число"
            className="w-full bg-felt-700 border border-felt-600 rounded-xl px-6 py-4 text-white text-center text-3xl font-mono focus:outline-none focus:border-gold disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={myAnswered || !value}
            className="w-full py-3 bg-gradient-to-r from-gold to-yellow-600 text-black font-bold rounded-xl disabled:opacity-40"
          >
            {myAnswered ? '✓ Ответ принят' : 'ОТВЕТИТЬ'}
          </button>
        </form>

        <div className="mt-4 flex justify-center gap-1">
          {gameState.players.map(p => (
            <span
              key={p.id}
              className={`w-2 h-2 rounded-full ${answeredIds.has(p.id) ? 'bg-green-400' : 'bg-gray-600'}`}
              title={p.name}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 8.2: Создать Top5Screen.tsx**

```tsx
// client/src/components/screens/Top5Screen.tsx
import { useState } from 'react'
import {
  DndContext, closestCenter, DragEndEvent,
  PointerSensor, useSensor, useSensors
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useGameStore } from '../../store/gameStore'
import { Timer } from '../ui/Timer'

function SortableItem({ id, index }: { id: string; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`
        flex items-center gap-3 p-3 rounded-xl border cursor-grab active:cursor-grabbing select-none
        ${isDragging ? 'border-gold bg-felt-700 shadow-lg shadow-gold/20 z-50' : 'border-felt-600 bg-felt-800'}
      `}
    >
      <span className="w-7 h-7 rounded-full bg-felt-700 border border-felt-600 flex items-center justify-center text-sm font-mono text-gold">
        {index + 1}
      </span>
      <span className="text-sm text-white">{id}</span>
      <span className="ml-auto text-gray-600">⠿</span>
    </div>
  )
}

export function Top5Screen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)
  const answeredIds = useGameStore(s => s.answeredIds)
  const submitAnswer = useGameStore(s => s.submitAnswer)

  const initialItems = gameState.currentQuestion?.items ?? []
  const [items, setItems] = useState<string[]>(initialItems)

  const myAnswered = myId ? answeredIds.has(myId) : false
  const sensors = useSensors(useSensor(PointerSensor))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setItems(prev => arrayMove(
      prev,
      prev.indexOf(active.id as string),
      prev.indexOf(over.id as string)
    ))
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <Timer seconds={gameState.phaseTimeLeft} />

      <div className="w-full max-w-md mt-4">
        <div className="text-xs uppercase tracking-widest text-gray-400 text-center mb-2">📊 ТОП 5</div>
        <div className="text-center text-white mb-6 leading-relaxed">
          {gameState.currentQuestion?.text}
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            <div className="space-y-2 mb-6">
              {items.map((item, idx) => (
                <SortableItem key={item} id={item} index={idx} />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <button
          onClick={() => submitAnswer(items)}
          disabled={myAnswered}
          className="w-full py-3 bg-gradient-to-r from-gold to-yellow-600 text-black font-bold rounded-xl disabled:opacity-40"
        >
          {myAnswered ? '✓ Ответ принят' : 'ПОДТВЕРДИТЬ ПОРЯДОК'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 8.3: Commit**

```bash
git add client/src/components/screens/ClosestScreen.tsx client/src/components/screens/Top5Screen.tsx
git commit -m "feat(client): ClosestScreen + Top5Screen с drag-and-drop"
```

---

## Task 9: RevealScreen + LeaderboardScreen + GameOverScreen

**Files:**
- Create: `client/src/components/screens/RevealScreen.tsx`
- Create: `client/src/components/screens/LeaderboardScreen.tsx`
- Create: `client/src/components/screens/GameOverScreen.tsx`

- [ ] **Step 9.1: Создать RevealScreen.tsx**

```tsx
// client/src/components/screens/RevealScreen.tsx
import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'

export function RevealScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const roundResults = useGameStore(s => s.roundResults)
  const myId = useGameStore(s => s.myId)

  const playerMap = new Map(gameState.players.map(p => [p.id, p]))

  const sorted = [...roundResults].sort((a, b) => b.delta - a.delta)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl text-gold mb-6"
      >
        🏆 Итоги раунда
      </motion.div>

      <div className="w-full max-w-md space-y-3">
        {sorted.map((result, i) => {
          const player = playerMap.get(result.playerId)
          if (!player) return null
          const isMe = result.playerId === myId
          const isPos = result.delta > 0
          const isNeg = result.delta < 0

          return (
            <motion.div
              key={result.playerId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`
                flex items-center justify-between p-4 rounded-xl border
                ${isMe ? 'border-gold bg-felt-700' : 'border-felt-600 bg-felt-800'}
              `}
            >
              <div>
                <div className="font-bold">{player.name} {isMe && '(ты)'}</div>
                <div className="text-xs text-gray-400">Баланс: {player.chips} 🪙</div>
              </div>
              <div className={`text-2xl font-mono font-bold ${isPos ? 'text-green-400' : isNeg ? 'text-red-400' : 'text-gray-400'}`}>
                {isPos ? '+' : ''}{result.delta}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 9.2: Создать LeaderboardScreen.tsx**

```tsx
// client/src/components/screens/LeaderboardScreen.tsx
import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { WIN_CHIPS } from '@cumsino/shared'

export function LeaderboardScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)

  const sorted = [...gameState.players].sort((a, b) => b.chips - a.chips)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="text-3xl text-gold mb-2">📊 Таблица лидеров</div>
      <div className="text-xs text-gray-400 mb-6">Раунд {gameState.roundIndex}</div>

      <div className="w-full max-w-md space-y-2">
        {sorted.map((player, i) => {
          const isMe = player.id === myId
          const progress = Math.min(100, (player.chips / WIN_CHIPS) * 100)

          return (
            <motion.div
              key={player.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`p-4 rounded-xl border ${isMe ? 'border-gold bg-felt-700' : 'border-felt-600 bg-felt-800'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg text-gray-400">{i + 1}.</span>
                  <span className="font-bold">{player.name}</span>
                  {isMe && <span className="text-xs text-gold">(ты)</span>}
                </div>
                <span className="font-mono text-gold">{player.chips} 🪙</span>
              </div>
              <div className="h-1.5 bg-felt-900 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.8, delay: i * 0.08 }}
                  className="h-full bg-gradient-to-r from-gold to-yellow-600 rounded-full"
                />
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {progress.toFixed(0)}% до победы ({WIN_CHIPS} 🪙)
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 9.3: Создать GameOverScreen.tsx**

```tsx
// client/src/components/screens/GameOverScreen.tsx
import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'

export function GameOverScreen() {
  const winner = useGameStore(s => s.winner)
  const myId = useGameStore(s => s.myId)
  const reset = useGameStore(s => s.reset)

  const isWinner = winner?.id === myId

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', duration: 0.6 }}
        className="text-8xl mb-4"
      >
        {isWinner ? '🏆' : '💀'}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <div className="text-4xl text-gold font-bold mb-2">
          {isWinner ? 'ТЫ ПОБЕДИЛ!' : 'ИГРА ОКОНЧЕНА'}
        </div>
        {winner && (
          <div className="text-xl text-white mb-2">
            {isWinner ? '' : `Победитель: `}
            <strong className="text-gold">{winner.name}</strong>
          </div>
        )}
        {winner && (
          <div className="text-gray-400">
            Итоговый баланс: {winner.chips} 🪙
          </div>
        )}
      </motion.div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        onClick={reset}
        className="mt-10 px-8 py-3 bg-gradient-to-r from-gold to-yellow-600 text-black font-bold rounded-xl hover:brightness-110"
      >
        НОВАЯ ИГРА
      </motion.button>
    </div>
  )
}
```

- [ ] **Step 9.4: Commit**

```bash
git add client/src/components/screens/RevealScreen.tsx client/src/components/screens/LeaderboardScreen.tsx client/src/components/screens/GameOverScreen.tsx
git commit -m "feat(client): RevealScreen + LeaderboardScreen + GameOverScreen"
```

---

## Task 10: App.tsx — Роутинг экранов

**Files:**
- Create: `client/src/App.tsx`

- [ ] **Step 10.1: Создать App.tsx**

```tsx
// client/src/App.tsx
import { useGameStore, selectIsGladiator } from './store/gameStore'
import { JoinScreen } from './components/screens/JoinScreen'
import { LobbyScreen } from './components/screens/LobbyScreen'
import { AnnounceScreen } from './components/screens/AnnounceScreen'
import { BettingScreen } from './components/screens/BettingScreen'
import { GladiatorCrowdScreen } from './components/screens/GladiatorCrowdScreen'
import { QuestionTextScreen } from './components/screens/QuestionTextScreen'
import { QuestionScreen } from './components/screens/QuestionScreen'
import { GladiatorSelfScreen } from './components/screens/GladiatorSelfScreen'
import { ClosestScreen } from './components/screens/ClosestScreen'
import { Top5Screen } from './components/screens/Top5Screen'
import { RevealScreen } from './components/screens/RevealScreen'
import { LeaderboardScreen } from './components/screens/LeaderboardScreen'
import { GameOverScreen } from './components/screens/GameOverScreen'
import { AnimatePresence, motion } from 'framer-motion'

export default function App() {
  const gameState = useGameStore(s => s.gameState)
  const isGladiator = useGameStore(selectIsGladiator)

  if (!gameState) return <JoinScreen />

  const phase = gameState.phase
  const mode = gameState.mode

  let Screen: React.FC

  switch (phase) {
    case 'LOBBY':
      Screen = LobbyScreen
      break
    case 'ANNOUNCE':
      Screen = AnnounceScreen
      break
    case 'BETTING':
      // В режиме ГЛАДИАТОР — толпа видит GladiatorCrowdScreen, гладиатор — BettingScreen (заглушку внутри)
      Screen = (mode === 'gladiator' && !isGladiator) ? GladiatorCrowdScreen : BettingScreen
      break
    case 'QUESTION_TEXT':
      Screen = QuestionTextScreen
      break
    case 'QUESTION':
      if (mode === 'closest') Screen = ClosestScreen
      else if (mode === 'top5') Screen = Top5Screen
      else if (mode === 'gladiator' && isGladiator) Screen = GladiatorSelfScreen
      else Screen = QuestionScreen
      break
    case 'REVEAL':
      Screen = RevealScreen
      break
    case 'LEADERBOARD':
      Screen = LeaderboardScreen
      break
    case 'GAME_OVER':
      Screen = GameOverScreen
      break
    default:
      Screen = LobbyScreen
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={phase}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Screen />
      </motion.div>
    </AnimatePresence>
  )
}
```

- [ ] **Step 10.2: Запустить клиент и убедиться что JoinScreen отображается**

```bash
cd C:/Dev/Cumsino && npm run dev --workspace=client
```

Открыть `http://localhost:5173` — должен появиться экран входа с заголовком ♠ CUMSINO ♠

- [ ] **Step 10.3: Проверить подключение к серверу**

В отдельном терминале убедиться что сервер запущен:
```bash
npm run dev --workspace=server
```

Ввести имя и код комнаты в клиенте → нажать «ВОЙТИ» → должен появиться LobbyScreen.

- [ ] **Step 10.4: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat(client): App.tsx — роутинг экранов по GamePhase"
```

---

## Task 11: GitHub Pages Deployment

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `client/vite.config.ts` (проверить base)

- [ ] **Step 11.1: Создать GitHub Actions workflow**

```yaml
# .github/workflows/deploy.yml
name: Deploy Client to GitHub Pages

on:
  push:
    branches: [main]
    paths: ['client/**', 'shared/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm install

      - run: npm run build --workspace=client
        env:
          VITE_SERVER_URL: ${{ secrets.VITE_SERVER_URL }}

      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./client/dist
```

- [ ] **Step 11.2: Убедиться что `base` в vite.config.ts совпадает с именем репозитория**

Если репозиторий называется `cumsino`, в `client/vite.config.ts` должно быть:
```typescript
base: '/cumsino/',
```

- [ ] **Step 11.3: Добавить секрет в GitHub**

В GitHub → Settings → Secrets → Actions добавить:
- `VITE_SERVER_URL` = URL Render.com сервера (после деплоя сервера)

- [ ] **Step 11.4: Commit и push**

```bash
git add .github/ client/vite.config.ts
git commit -m "chore: GitHub Actions deploy to GitHub Pages"
git remote add origin https://github.com/<username>/cumsino.git
git push -u origin main
```

---

## Self-Review

### Покрытие спека

| Требование | Task |
|-----------|------|
| Vite + React + TypeScript + Tailwind | 1 |
| Socket.IO client + Zustand | 2 |
| Фишки 5 номиналов (10/20/50/100/500) | 3, 5 |
| Анимации фишек Framer Motion | 3, 5 |
| JoinScreen + LobbyScreen | 4 |
| AnnounceScreen (тема раунда) | 5 |
| BettingScreen с фишками и подтверждением | 5 |
| QUESTION_TEXT (вопрос без вариантов 5 сек) | 6 |
| QuestionScreen A/B/C/D | 6 |
| Hover гладиатора виден толпе | 6 |
| GladiatorCrowdScreen (корзины + ответ) | 7 |
| GladiatorSelfScreen (гладиатор видит вопрос) | 7 |
| ClosestScreen (числовой инпут) | 8 |
| Top5Screen (drag-and-drop) | 8 |
| RevealScreen (дельты с анимацией) | 9 |
| LeaderboardScreen (прогресс-бары) | 9 |
| GameOverScreen | 9 |
| App.tsx роутинг phase→screen | 10 |
| Деплой GitHub Pages | 11 |
