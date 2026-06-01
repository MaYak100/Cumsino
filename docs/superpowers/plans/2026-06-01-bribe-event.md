# Bribe Event Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a mid-round bribe auction in Kerri mode where crowd players pay chips to help/hinder the gladiator, potentially eliminating a wrong answer option from the gladiator's screen.

**Architecture:** Server-side auction state machine (GameRoom) manages the full lifecycle — trigger conditions, 7-second timers, chip deductions, and outcome effects. Clients receive targeted socket events and render role-specific UI (crowd gets bribe prompt, gladiator gets diagonal animated messages and optionally a struck-through option).

**Tech Stack:** Socket.IO targeted `sendToPlayer`, Zustand (3 new store fields), Framer Motion (diagonal message animation), React `useEffect` (7s client countdown mirror)

---

## File Map

| File | Changes |
|------|---------|
| `shared/src/types.ts` | +3 socket payload types |
| `server/src/game/GameRoom.ts` | +`BribeAuctionState` interface, +3 private fields, +7 private methods, +1 public method, hooks into `schedulePhase`/`advanceFromQuestion`/`destroy` |
| `server/src/socket/handlers.ts` | +`pay_bribe` handler |
| `client/src/store/gameStore.ts` | +3 state fields, +3 socket listeners, +2 actions, updated `game_state` handler |
| `client/src/components/screens/QuestionScreen.tsx` | +bribe prompt panel with 7s countdown (kerri crowd only) |
| `client/src/components/screens/GladiatorSelfScreen.tsx` | +eliminated option styling, +`DiagonalMessage` component, +`AnimatePresence` overlay |

---

### Task 1: Shared socket payload types

**Files:**
- Modify: `shared/src/types.ts`

- [ ] **Step 1: Append 3 bribe payload types** to the end of `shared/src/types.ts`, after `ChipStagedPayload`:

```typescript
export interface BribePromptPayload { amount: number }
export interface BribePromptCancelPayload { dummy?: never }
export interface BribeMsgPayload {
  type: 'helping' | 'betrayed' | 'helped'
  eliminatedOptionIndex?: number
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd shared && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add shared/src/types.ts
git commit -m "feat: bribe event socket payload types"
```

---

### Task 2: Server — GameRoom bribe auction logic

**Files:**
- Modify: `server/src/game/GameRoom.ts`

Read the file in full before starting. There are 10 sub-steps.

- [ ] **Step 1: Add `BribeAuctionState` interface** — insert after the `PlayerWithBankBet` interface (after line 13), before `export class GameRoom`:

```typescript
interface BribeAuctionState {
  price: number
  winQueue: string[]       // rotating Ответит (betTarget='win') player IDs
  loseQueue: string[]      // rotating Завалит (betTarget='lose') player IDs
  winIdx: number           // current position in winQueue (modular)
  loseIdx: number          // current position in loseQueue (modular)
  waitingFor: 'win' | 'lose'
  currentAsked: string
  timer: ReturnType<typeof setTimeout> | null
}
```

- [ ] **Step 2: Add bribe state fields** inside the class body — after `private bettingConfirmedIds = new Set<string>()`:

```typescript
  private bribeConditionCount = 0   // kerri rounds where both win+lose bettors existed
  private bribeEverFired = false
  private bribeAuction: BribeAuctionState | null = null
```

- [ ] **Step 3: Add `sendToPlayer` and `sendToGladiator` private helpers** — insert after the existing `private broadcastState()` method at the bottom of the class (before the closing `}`):

```typescript
  private sendToPlayer(playerId: string, event: string, data: unknown) {
    this.emit('sendToPlayer', { playerId, event, data })
  }

  private sendToGladiator(event: string, data: unknown) {
    if (this.gladiatorId) this.sendToPlayer(this.gladiatorId, event, data)
  }
```

- [ ] **Step 4: Add `clearBribeAuction()` private method** — after the helpers from Step 3:

```typescript
  private clearBribeAuction() {
    if (!this.bribeAuction) return
    if (this.bribeAuction.timer) clearTimeout(this.bribeAuction.timer)
    this.sendToPlayer(this.bribeAuction.currentAsked, 'bribe_prompt_cancel', {})
    this.bribeAuction = null
  }
```

- [ ] **Step 5: Add `askBribePlayer()` private method** — after `clearBribeAuction()`:

```typescript
  private askBribePlayer() {
    const a = this.bribeAuction
    if (!a) return
    const queue = a.waitingFor === 'win' ? a.winQueue : a.loseQueue
    const idx = a.waitingFor === 'win' ? a.winIdx : a.loseIdx
    a.currentAsked = queue[idx % queue.length]
    this.sendToPlayer(a.currentAsked, 'bribe_prompt', { amount: a.price })
    a.timer = setTimeout(() => this.onBribeTimeout(), 7000)
  }
```

- [ ] **Step 6: Add `onBribeTimeout()` private method** — after `askBribePlayer()`:

```typescript
  private onBribeTimeout() {
    const a = this.bribeAuction
    if (!a) return
    this.bribeAuction = null  // null first to prevent double-cancel in clearBribeAuction
    this.sendToPlayer(a.currentAsked, 'bribe_prompt_cancel', {})

    if (a.waitingFor === 'win') {
      // Ответит didn't pay → gladiator betrayed
      this.sendToGladiator('bribe_msg', { type: 'betrayed' })
    } else {
      // Завалит didn't pay → eliminate a random wrong option for gladiator
      let eliminatedOptionIndex: number | undefined
      const q = this.currentQuestion
      if (q?.options && q.answer) {
        const correctIdx = q.options.indexOf(q.answer)
        const wrongIdxs = q.options.map((_, i) => i).filter(i => i !== correctIdx)
        if (wrongIdxs.length > 0) {
          eliminatedOptionIndex = wrongIdxs[Math.floor(Math.random() * wrongIdxs.length)]
        }
      }
      this.sendToGladiator('bribe_msg', { type: 'helped', eliminatedOptionIndex })
    }
  }
```

- [ ] **Step 7: Add `startBribeAuction()` private method** — after `onBribeTimeout()`:

```typescript
  private startBribeAuction(winIds: string[], loseIds: string[]) {
    const shuffle = (arr: string[]): string[] => {
      const a = [...arr]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]]
      }
      return a
    }
    this.bribeAuction = {
      price: 50,
      winQueue: shuffle(winIds),
      loseQueue: shuffle(loseIds),
      winIdx: 0,
      loseIdx: 0,
      waitingFor: 'win',
      currentAsked: '',
      timer: null,
    }
    this.askBribePlayer()
  }
```

- [ ] **Step 8: Add `checkAndStartBribeEvent()` private method** — after `startBribeAuction()`:

```typescript
  private checkAndStartBribeEvent() {
    if (!this.gladiatorId) return
    const players = Array.from(this.players.values())
    const winBettors = players.filter(p =>
      p.id !== this.gladiatorId && p.betTarget === 'win' && p.currentBet > 0
    )
    const loseBettors = players.filter(p =>
      p.id !== this.gladiatorId && p.betTarget === 'lose' && p.currentBet > 0
    )
    if (winBettors.length === 0 || loseBettors.length === 0) return

    this.bribeConditionCount++
    const shouldFire =
      (!this.bribeEverFired && this.bribeConditionCount >= 2) ||
      (this.bribeEverFired && Math.random() < 0.4)
    if (!shouldFire) return

    this.bribeEverFired = true
    this.startBribeAuction(winBettors.map(p => p.id), loseBettors.map(p => p.id))
  }
```

- [ ] **Step 9: Add public `payBribe()` method** — insert after the existing `relayHover()` method (around line 127):

```typescript
  payBribe(playerId: string) {
    const a = this.bribeAuction
    if (!a || this.phase !== 'QUESTION' || this.currentMode !== 'kerri') return
    if (a.currentAsked !== playerId) return
    const player = this.players.get(playerId)
    if (!player || player.chips < a.price) return

    player.chips -= a.price
    clearTimeout(a.timer!)
    a.timer = null

    if (a.waitingFor === 'win') {
      this.sendToGladiator('bribe_msg', { type: 'helping' })
      a.waitingFor = 'lose'
    } else {
      // Завалит paid → price escalates, move to next pair
      a.price += 25
      a.loseIdx++
      a.winIdx++
      a.waitingFor = 'win'
    }
    this.broadcastState()  // reflect chip deduction immediately
    this.askBribePlayer()
  }
```

- [ ] **Step 10: Hook into existing methods**

In `destroy()` — add `this.clearBribeAuction()` after `clearTimeout(this.phaseTimer)`:
```typescript
  destroy() {
    clearTimeout(this.phaseTimer)
    this.clearBribeAuction()
  }
```

In `advanceFromQuestion()` — add `this.clearBribeAuction()` as the **first line** of the method body:
```typescript
  private advanceFromQuestion() {
    this.clearBribeAuction()
    const results = this.calculateResults()
    // ...rest unchanged
```

In `schedulePhase()` — add at the very end of the method, after `this.phaseTimer = setTimeout(...)`:
```typescript
    if (phase === 'QUESTION' && this.currentMode === 'kerri') {
      this.checkAndStartBribeEvent()
    }
```

- [ ] **Step 11: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add server/src/game/GameRoom.ts
git commit -m "feat: bribe auction state machine in GameRoom"
```

---

### Task 3: Server — `pay_bribe` socket handler

**Files:**
- Modify: `server/src/socket/handlers.ts`

- [ ] **Step 1: Add handler** — insert before the `disconnect` handler:

```typescript
  socket.on('pay_bribe', () => {
    engine.getRoom(socket.id)?.payBribe(socket.id)
  })
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add server/src/socket/handlers.ts
git commit -m "feat: pay_bribe socket handler"
```

---

### Task 4: Client — gameStore new state, listeners, and actions

**Files:**
- Modify: `client/src/store/gameStore.ts`

- [ ] **Step 1: Extend imports** — add bribe types to the import from `@cumsino/shared`:

```typescript
import type {
  GameState, Player, RoundResult, GameMode,
  BetUpdatedPayload, PlayerAnsweredPayload,
  GladiatorHoveringPayload, GameOverPayload,
  BankBetUpdatedPayload, RoundResultsPayload,
  ChipStagedPayload,
  BribePromptPayload, BribeMsgPayload,
} from '@cumsino/shared'
```

- [ ] **Step 2: Add 5 new members to the `GameStore` interface** — after `isLateJoiner: boolean`:

```typescript
  bribePrompt: { amount: number; startedAt: number } | null
  bribeEliminatedIdx: number | null
  gladiatorBribeMsg: { type: 'helping' | 'betrayed' | 'helped'; key: number } | null

  payBribe: () => void
  clearGladiatorBribeMsg: () => void
```

- [ ] **Step 3: Add 3 socket listeners** — insert after the `chip_staged` listener:

```typescript
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
```

- [ ] **Step 4: Update `game_state` handler** — replace the existing handler with this version that clears bribe state when phase exits QUESTION:

```typescript
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
```

- [ ] **Step 5: Add initial state values** — in the `return { ... }` object at the bottom of `create`, after `isLateJoiner: false`:

```typescript
    bribePrompt: null,
    bribeEliminatedIdx: null,
    gladiatorBribeMsg: null,
```

- [ ] **Step 6: Add `payBribe` and `clearGladiatorBribeMsg` actions** — in the same return object, after `reset()`:

```typescript
    payBribe() {
      socket.emit('pay_bribe')
      set({ bribePrompt: null })
    },

    clearGladiatorBribeMsg() {
      set({ gladiatorBribeMsg: null })
    },
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add client/src/store/gameStore.ts
git commit -m "feat: bribe event store — state, listeners, actions"
```

---

### Task 5: Client — QuestionScreen bribe prompt panel

**Files:**
- Modify: `client/src/components/screens/QuestionScreen.tsx`

The bribe prompt appears below the options grid only in kerri crowd mode (`isGladiatorMode && !isGladiator`) and only when `bribePrompt` is set. The text differs based on whether the player bet WIN or LOSE.

- [ ] **Step 1: Update imports** — replace the existing imports at the top of the file:

```typescript
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore, selectIsGladiator, selectMe } from '../../store/gameStore'
import { Timer } from '../ui/Timer'
```

(`selectMe` already exists in gameStore.ts — verify it's exported there. If not, add `export const selectMe = (s: GameStore): Player | undefined => s.gameState?.players.find(p => p.id === s.myId)` to gameStore.ts)

- [ ] **Step 2: Add new store reads** inside `QuestionScreen()`, after `const roundCorrectAnswer = ...`:

```typescript
  const bribePrompt = useGameStore(s => s.bribePrompt)
  const payBribe = useGameStore(s => s.payBribe)
  const me = useGameStore(selectMe)
```

- [ ] **Step 3: Add 7-second countdown hook** — inside `QuestionScreen()`, after the store reads:

```typescript
  const [bribeTimeLeft, setBribeTimeLeft] = useState(7)
  useEffect(() => {
    if (!bribePrompt) { setBribeTimeLeft(7); return }
    const startedAt = bribePrompt.startedAt
    const tick = () => setBribeTimeLeft(Math.max(0, 7 - (Date.now() - startedAt) / 1000))
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [bribePrompt])
```

- [ ] **Step 4: Add bribe prompt JSX** — insert it after the closing `</div>` of the `options.map(...)` grid and before `{showingCorrect ? (`. The complete block:

```tsx
        <AnimatePresence>
          {bribePrompt && isGladiatorMode && !isGladiator && (
            <motion.div
              key="bribe-prompt"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.3 }}
              className="mt-4 rounded-xl border border-red-500/60 bg-red-950/80 p-4 text-center"
            >
              <div className="mb-1 text-base font-bold text-red-300">⚡ Срочно!</div>
              <div className="mb-1 text-sm text-white">
                {me?.betTarget === 'lose'
                  ? <><b>Заплати {bribePrompt.amount}₽</b>, чтобы не упрощать жизнь керри!</>
                  : <><b>Заплати {bribePrompt.amount}₽</b>, чтобы упростить жизнь керри!</>}
              </div>
              <div className="mb-3 text-xs" style={{ color: '#c4c9d4' }}>
                {me?.betTarget === 'lose'
                  ? 'и мы не уберём 1 неправильный ответ для него, он будет страдать'
                  : 'и мы уберём 1 неправильный ответ'}
              </div>
              <div className="flex items-center justify-center gap-3">
                <span
                  className="font-mono text-xl font-bold w-8 text-right"
                  style={{ color: bribeTimeLeft <= 2 ? '#f87171' : '#fbbf24' }}
                >
                  {Math.ceil(bribeTimeLeft)}
                </span>
                <button
                  onClick={payBribe}
                  disabled={(me?.chips ?? 0) < bribePrompt.amount || bribeTimeLeft <= 0}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Заплатить {bribePrompt.amount}₽
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add client/src/components/screens/QuestionScreen.tsx
git commit -m "feat: bribe prompt panel in QuestionScreen (kerri crowd)"
```

---

### Task 6: Client — GladiatorSelfScreen: eliminated option + diagonal messages

**Files:**
- Modify: `client/src/components/screens/GladiatorSelfScreen.tsx`

Two additions:
1. `bribeEliminatedIdx` → one option is dimmed, struck through, and disabled
2. `gladiatorBribeMsg` → `DiagonalMessage` component overlaid above the question, auto-dismisses after 2.5s

- [ ] **Step 1: Update imports**

```typescript
import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { Timer } from '../ui/Timer'
```

- [ ] **Step 2: Add store reads** inside `GladiatorSelfScreen()`, after `const roundCorrectAnswer = ...`:

```typescript
  const bribeEliminatedIdx = useGameStore(s => s.bribeEliminatedIdx)
  const gladiatorBribeMsg = useGameStore(s => s.gladiatorBribeMsg)
  const clearGladiatorBribeMsg = useGameStore(s => s.clearGladiatorBribeMsg)
```

- [ ] **Step 3: Replace the options `.map(...)` block** with a version that handles the eliminated option. Replace the entire `{options.map((option, idx) => { ... })}` section:

```tsx
          {options.map((option, idx) => {
            const isCorrect = showingCorrect && option === roundCorrectAnswer
            const isEliminated = !showingCorrect && bribeEliminatedIdx === idx
            return (
              <motion.button
                key={idx}
                onMouseEnter={() => { if (!showingCorrect && !isEliminated) sendHover(idx) }}
                onMouseLeave={() => sendHover(null)}
                onClick={() => !myAnswered && !showingCorrect && !isEliminated && submitAnswer(option)}
                disabled={myAnswered || showingCorrect || isEliminated}
                whileHover={!myAnswered && !showingCorrect && !isEliminated ? { scale: 1.02 } : {}}
                className={`
                  p-4 rounded-xl border-2 text-left transition-colors
                  ${isCorrect
                    ? 'border-green-400 bg-[#0a3a1a] shadow-[0_0_20px_rgba(74,222,128,0.4)]'
                    : `bg-[#1a3a1a] ${OPTION_BORDER_COLORS[idx]}`
                  }
                  ${isEliminated ? 'opacity-30 cursor-not-allowed line-through' : ''}
                  ${showingCorrect && !isCorrect ? 'opacity-40 cursor-not-allowed' : ''}
                  ${!showingCorrect && !isEliminated && (myAnswered ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[#2a4a2a]')}
                `}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex items-center justify-center text-xs font-bold bg-[#2a4a2a]"
                    style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      border: `1.5px solid ${isCorrect ? '#4ade80' : OPTION_BORDER_HEX[idx]}`,
                    }}
                  >
                    {OPTION_LABELS[idx]}
                  </span>
                  <span className="text-sm">{option}</span>
                </div>
              </motion.button>
            )
          })}
```

- [ ] **Step 4: Add `DiagonalMessage` component** — define it **outside** (below) the `GladiatorSelfScreen` function, at the bottom of the file:

```typescript
const BRIBE_MSG_TEXTS: Record<string, string> = {
  helping: 'Не торопись, тебе пытаются помочь',
  betrayed: 'Тебя кинули, решай сам',
  helped: 'Тебе помогли!',
}

function DiagonalMessage({ type, onDone }: { type: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <motion.div
      initial={{ opacity: 0, x: -24, scale: 0.85 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.7 }}
      transition={{ duration: 0.35 }}
      style={{
        position: 'absolute',
        top: '20%',
        left: '50%',
        transform: 'translateX(-50%) rotate(-8deg)',
        transformOrigin: 'center center',
        pointerEvents: 'none',
        zIndex: 10,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: 'white', fontWeight: 700, fontSize: '1.2rem', textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>
        {BRIBE_MSG_TEXTS[type] ?? type}
      </span>
    </motion.div>
  )
}
```

- [ ] **Step 5: Update outer container and add AnimatePresence overlay** — change the outer `<div>` to have `position: 'relative'` and add the `AnimatePresence` block as the **first child** inside it:

```tsx
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ position: 'relative' }}>
      <AnimatePresence>
        {gladiatorBribeMsg && (
          <DiagonalMessage
            key={gladiatorBribeMsg.key}
            type={gladiatorBribeMsg.type}
            onDone={clearGladiatorBribeMsg}
          />
        )}
      </AnimatePresence>

      <Timer seconds={gameState.phaseTimeLeft} />
      {/* ...rest of existing content unchanged */}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add client/src/components/screens/GladiatorSelfScreen.tsx
git commit -m "feat: eliminated option + diagonal bribe messages in GladiatorSelfScreen"
```

---

### Task 7: Manual testing checklist

Start both servers:

```bash
# Terminal 1
npm run dev:server

# Terminal 2
npm run dev --workspace=client
```

Open 4 browser tabs. All join the same game code.

- [ ] **Test: No trigger on 1st qualifying kerri round** — Play round 1 (all mode). In round 2 (kerri mode), have tabs 2+3 bet WIN (Ответит), tab 4 bet LOSE (Завалит). Confirm bribe event does NOT fire (first qualifying round → conditionCount=1, needs ≥2).

- [ ] **Test: Guaranteed trigger on 2nd qualifying kerri round** — Play to round 5 (second kerri round), same bet setup. When QUESTION starts, bribe prompt MUST appear on one of the Ответит players. Timer counts from 7.

- [ ] **Test: Ответит pays, Завалит declines** — Ответит player clicks pay button → their chips decrease → gladiator sees "Не торопись, тебе пытаются помочь" diagonal (fades after 2.5s) → Завалит player gets their prompt. Завалит timer expires → gladiator sees "Тебе помогли!" diagonal + one wrong option struck through.

- [ ] **Test: Ответит pays, Завалит pays, escalation** — Both pay. Next Ответит player is asked for 75₽ (not 50). Timer and text correct.

- [ ] **Test: Ответит declines** — Let Ответит timer expire. Gladiator sees "Тебя кинули, решай сам". No option eliminated.

- [ ] **Test: Gladiator answers during bribe** — Start bribe. Before 7s expires, have gladiator submit answer. Bribe prompt disappears from crowd player immediately (phase changes → client clears bribePrompt). No crash.

- [ ] **Test: Insufficient chips** — If player has 30₽ and bribe costs 50₽, pay button is disabled.

- [ ] **Final commit** if all tests pass:

```bash
git add -A
git commit -m "chore: bribe event feature complete"
```
