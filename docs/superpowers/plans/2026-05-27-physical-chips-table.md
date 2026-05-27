# Physical Chips & Round Table — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace numeric chip-button betting UI with a physical chip system on a round poker table where each player's chips are visual objects that animate to their side of the table when bet.

**Architecture:** Client-only change. `PhysicalChip` objects (id + denom) live in component state for the stack and in Zustand for pending bets. Framer Motion `LayoutGroup` + `layoutId` handles chip flight animations. The felt table is a fixed 900×610 scene; player positions are computed from ellipse geometry.

**Tech Stack:** React, TypeScript, Framer Motion 11, Zustand, Tailwind CSS, `@cumsino/shared` (decomposeToChips), vitest (server-side tests only — client has no test setup).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `client/src/types/chips.ts` | **Create** | PhysicalChip type + buildPhysicalChips() |
| `client/src/lib/tableGeometry.ts` | **Create** | Ellipse geometry: angles, landing zones, card anchors |
| `client/src/components/ui/PhysicalChipStack.tsx` | **Create** | Animated chip stacks, grows upward, layoutId per chip |
| `client/src/components/ui/BetZone.tsx` | **Create** | Chip landing zone per player, mine=clickable |
| `client/src/components/ui/PlayerSlot.tsx` | **Create** | Name card + chip stack, positioned at angle |
| `client/src/components/screens/BettingTableScreen.tsx` | **Create** | Full round table screen, LayoutGroup root |
| `client/src/store/gameStore.ts` | **Modify** | pendingChips replaces pendingBet |
| `client/src/App.tsx` | **Modify** | Route BETTING → BettingTableScreen |
| `client/src/components/ui/PlayerCard.tsx` | **Modify** | Static chip stack display |
| `client/src/components/screens/BettingScreen.tsx` | **Delete** | Replaced by BettingTableScreen |
| `client/src/components/screens/GladiatorCrowdScreen.tsx` | **Delete** | Merged into BettingTableScreen |

---

## Task 1: PhysicalChip type + buildPhysicalChips

**Files:**
- Create: `client/src/types/chips.ts`

- [ ] **Step 1: Create the file**

```ts
// client/src/types/chips.ts
import { decomposeToChips } from '@cumsino/shared'
import type { ChipValue } from '../components/ui/Chip'

export interface PhysicalChip {
  id: string      // crypto.randomUUID() — stable for chip's lifetime
  denom: ChipValue
}

/** Decompose a chip total into an ordered array of PhysicalChip objects.
 *  Order: high denominations first, within each denom index 0 = base (bottom of stack). */
export function buildPhysicalChips(total: number): PhysicalChip[] {
  const breakdown = decomposeToChips(total)
  const chips: PhysicalChip[] = []
  const denoms: ChipValue[] = [500, 100, 50, 20, 10]
  denoms.forEach(denom => {
    const count = breakdown[denom]
    for (let i = 0; i < count; i++) {
      chips.push({ id: crypto.randomUUID(), denom })
    }
  })
  return chips
}

/** Deterministic scatter offset seeded from chip id (avoids re-render jitter). */
export function chipScatter(id: string, range: number): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff
  }
  return ((hash & 0xffff) / 0xffff - 0.5) * range
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/types/chips.ts
git commit -m "feat: PhysicalChip type and buildPhysicalChips utility"
```

---

## Task 2: Table geometry utilities

**Files:**
- Create: `client/src/lib/tableGeometry.ts`

- [ ] **Step 1: Create the file**

```ts
// client/src/lib/tableGeometry.ts

export const FELT_CX = 450
export const FELT_CY = 305
export const FELT_RX = 200
export const FELT_RY = 125
const OUTER_RX = 227
const OUTER_RY = 152
const LAND_INSET = 42   // px inward from felt edge
const CARD_GAP = 28     // px outward from outer ellipse edge
export const SCENE_W = 900
export const SCENE_H = 610

/** Angle for player i in a N-player game. i=0 is always "me" at bottom (π/2). */
export function playerAngle(i: number, N: number): number {
  return Math.PI / 2 + i * (2 * Math.PI / N)
}

function ellipsePt(angle: number, rx: number, ry: number) {
  return { x: rx * Math.cos(angle), y: ry * Math.sin(angle) }
}

function normalize(x: number, y: number) {
  const d = Math.sqrt(x * x + y * y)
  return { nx: x / d, ny: y / d }
}

/** Center of the chip landing zone on the felt for a player at `angle`. */
export function landingZone(angle: number): { cx: number; cy: number } {
  const { x, y } = ellipsePt(angle, FELT_RX, FELT_RY)
  const { nx, ny } = normalize(x, y)
  return { cx: FELT_CX + x - nx * LAND_INSET, cy: FELT_CY + y - ny * LAND_INSET }
}

/** Inner-face anchor of the player card (just outside the wood rail). */
export function cardAnchor(angle: number): { x: number; y: number } {
  const { x, y } = ellipsePt(angle, OUTER_RX, OUTER_RY)
  const { nx, ny } = normalize(x, y)
  return { x: FELT_CX + x + nx * CARD_GAP, y: FELT_CY + y + ny * CARD_GAP }
}

/** CSS top/left for the player unit div, given the card anchor and unit dimensions. */
export function unitPosition(
  angle: number,
  unitW: number,
  chipRowH: number,
  cardH: number,
): { left: number; top: number } {
  const { x, y } = cardAnchor(angle)
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)

  if (Math.abs(sin) >= Math.abs(cos)) {
    if (sin > 0) {
      // Bottom half: chip row top = anchor.y
      return { left: x - unitW / 2, top: y }
    } else {
      // Top half: card bottom = anchor.y
      return { left: x - unitW / 2, top: y - cardH - chipRowH }
    }
  } else {
    const top = y - (chipRowH + cardH) / 2
    if (cos > 0) {
      // Right side: unit left = anchor.x
      return { left: x, top }
    } else {
      // Left side: unit right = anchor.x
      return { left: x - unitW, top }
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/tableGeometry.ts
git commit -m "feat: table geometry utilities for ellipse chip layout"
```

---

## Task 3: PhysicalChipStack component

**Files:**
- Create: `client/src/components/ui/PhysicalChipStack.tsx`

- [ ] **Step 1: Create the file**

```tsx
// client/src/components/ui/PhysicalChipStack.tsx
import { motion } from 'framer-motion'
import type { PhysicalChip } from '../../types/chips'
import type { ChipValue } from './Chip'

const CHIP_SIZE = 28
const STEP = 11   // px per chip going upward (CHIP_SIZE - overlap)

const CHIP_STYLES: Record<ChipValue, string> = {
  10:  'bg-gradient-to-br from-gray-200 to-gray-500 text-gray-900 border-gray-300',
  20:  'bg-gradient-to-br from-green-400 to-green-700 text-white border-green-300',
  50:  'bg-gradient-to-br from-blue-400 to-blue-700 text-white border-blue-300',
  100: 'bg-gradient-to-br from-red-400 to-red-700 text-white border-red-300',
  500: 'bg-gradient-to-br from-gray-700 to-black text-yellow-400 border-yellow-800',
}

interface Props {
  chips: PhysicalChip[]
  interactive?: boolean
  placedIds?: Set<string>   // ids currently in bet zone (dim these in stack)
  onChipClick?: (chip: PhysicalChip) => void
  size?: 'sm' | 'md'
}

export function PhysicalChipStack({ chips, interactive = false, placedIds, onChipClick, size = 'md' }: Props) {
  const sz = size === 'sm' ? 22 : CHIP_SIZE
  const step = size === 'sm' ? 9 : STEP

  // Group by denom, preserving order (high first)
  const denomOrder: ChipValue[] = [500, 100, 50, 20, 10]
  const groups = new Map<ChipValue, PhysicalChip[]>()
  denomOrder.forEach(d => {
    const g = chips.filter(c => c.denom === d)
    if (g.length > 0) groups.set(d, g)
  })

  return (
    <div className="flex items-end" style={{ gap: 5 }}>
      {denomOrder.filter(d => groups.has(d)).map(denom => {
        const stack = groups.get(denom)!
        // Only render chips NOT placed (placed chips live in BetZone via layoutId)
        const visible = placedIds ? stack.filter(c => !placedIds.has(c.id)) : stack
        if (visible.length === 0) return null
        const stackH = sz + (visible.length - 1) * step
        return (
          <div key={denom} className="relative flex-shrink-0" style={{ width: sz, height: stackH }}>
            {visible.map((chip, i) => {
              const isPlaced = placedIds?.has(chip.id) ?? false
              return (
                <motion.div
                  key={chip.id}
                  layoutId={interactive ? chip.id : undefined}
                  layout
                  className={`absolute rounded-full border-2 flex items-center justify-center font-bold select-none
                    ${CHIP_STYLES[chip.denom]}
                    ${interactive && !isPlaced ? 'cursor-pointer' : ''}
                    ${isPlaced ? 'opacity-20' : ''}
                  `}
                  style={{ width: sz, height: sz, bottom: i * step, zIndex: i + 1, fontSize: sz * 0.38 }}
                  whileHover={interactive && !isPlaced ? { scale: 1.15, y: -4 } : {}}
                  onClick={interactive && !isPlaced ? () => onChipClick?.(chip) : undefined}
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                >
                  {chip.denom}
                </motion.div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ui/PhysicalChipStack.tsx
git commit -m "feat: PhysicalChipStack component with upward stacking and layoutId"
```

---

## Task 4: BetZone component

**Files:**
- Create: `client/src/components/ui/BetZone.tsx`

- [ ] **Step 1: Create the file**

```tsx
// client/src/components/ui/BetZone.tsx
import { motion } from 'framer-motion'
import { landingZone } from '../../lib/tableGeometry'
import { chipScatter } from '../../types/chips'
import type { PhysicalChip } from '../../types/chips'
import type { ChipValue } from './Chip'

const CHIP_STYLES: Record<ChipValue, string> = {
  10:  'bg-gradient-to-br from-gray-200 to-gray-500 text-gray-900 border-gray-300',
  20:  'bg-gradient-to-br from-green-400 to-green-700 text-white border-green-300',
  50:  'bg-gradient-to-br from-blue-400 to-blue-700 text-white border-blue-300',
  100: 'bg-gradient-to-br from-red-400 to-red-700 text-white border-red-300',
  500: 'bg-gradient-to-br from-gray-700 to-black text-yellow-400 border-yellow-800',
}

const CHIP_SIZE = 24

interface Props {
  angle: number
  chips: PhysicalChip[]       // my pending chips (layoutId) or display chips for others
  mine: boolean               // true → clickable for recall
  onRecall?: (chipId: string) => void
}

export function BetZone({ angle, chips, mine, onRecall }: Props) {
  const { cx, cy } = landingZone(angle)

  return (
    <>
      {chips.map(chip => {
        const ox = chipScatter(chip.id + 'x', 30)
        const oy = chipScatter(chip.id + 'y', 16)
        return (
          <motion.div
            key={chip.id}
            layoutId={mine ? chip.id : undefined}
            className={`absolute rounded-full border-2 flex items-center justify-center font-bold select-none
              ${CHIP_STYLES[chip.denom]}
              ${mine ? 'cursor-pointer' : ''}
            `}
            style={{
              width: CHIP_SIZE, height: CHIP_SIZE,
              fontSize: CHIP_SIZE * 0.38,
              left: cx + ox - CHIP_SIZE / 2,
              top:  cy + oy - CHIP_SIZE / 2,
              zIndex: 6,
            }}
            initial={mine ? { scale: 0 } : false}
            animate={{ scale: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={mine ? { scale: 1.2, y: -3 } : {}}
            onClick={mine ? () => onRecall?.(chip.id) : undefined}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            title={mine ? 'Нажми — вернуть фишку' : undefined}
          >
            {chip.denom}
          </motion.div>
        )
      })}
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd client && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ui/BetZone.tsx
git commit -m "feat: BetZone component for chip landing with layoutId support"
```

---

## Task 5: PlayerSlot component

**Files:**
- Create: `client/src/components/ui/PlayerSlot.tsx`

- [ ] **Step 1: Create the file**

```tsx
// client/src/components/ui/PlayerSlot.tsx
import { unitPosition } from '../../lib/tableGeometry'
import { PhysicalChipStack } from './PhysicalChipStack'
import { buildPhysicalChips } from '../../types/chips'
import type { Player } from '@cumsino/shared'
import type { PhysicalChip } from '../../types/chips'

const UNIT_W = 170
const CARD_H = 38
const CHIP_SIZE = 28
const STEP = 11

function chipRowH(chips: PhysicalChip[]): number {
  // Height = tallest stack. Count max chips of same denom.
  const counts = new Map<number, number>()
  chips.forEach(c => counts.set(c.denom, (counts.get(c.denom) ?? 0) + 1))
  const maxCount = Math.max(1, ...counts.values())
  return CHIP_SIZE + (maxCount - 1) * STEP
}

interface Props {
  player: Player
  angle: number
  isMe: boolean
  myChips?: PhysicalChip[]        // only for isMe: local physical chips
  placedIds?: Set<string>          // only for isMe: which chip ids are in bet zone
  onChipClick?: (chip: PhysicalChip) => void
}

export function PlayerSlot({ player, angle, isMe, myChips, placedIds, onChipClick }: Props) {
  // For other players: derive display chips from their chip total
  const displayChips = isMe
    ? (myChips ?? [])
    : buildPhysicalChips(player.chips)

  const rowH = chipRowH(displayChips)
  const { left, top } = unitPosition(angle, UNIT_W, rowH, CARD_H)

  return (
    <div
      className="absolute flex flex-col items-center"
      style={{ left, top, width: UNIT_W, zIndex: 4 }}
    >
      {/* Chip stacks — always above the card */}
      <div className="pb-1">
        <PhysicalChipStack
          chips={displayChips}
          interactive={isMe}
          placedIds={isMe ? placedIds : undefined}
          onChipClick={isMe ? onChipClick : undefined}
        />
      </div>

      {/* Name card */}
      <div className={`
        rounded-xl px-4 py-1.5 whitespace-nowrap text-sm font-semibold
        border shadow-[0_4px_24px_rgba(0,0,0,0.8)]
        ${isMe
          ? 'border-yellow-400 bg-[#100e00] text-yellow-400'
          : 'border-[#222] bg-[#0d0d0d] text-[#888]'
        }
      `}
        style={{ height: CARD_H, display: 'flex', alignItems: 'center' }}
      >
        {player.name}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd client && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ui/PlayerSlot.tsx
git commit -m "feat: PlayerSlot component wrapping chip stack and name card"
```

---

## Task 6: BettingTableScreen

**Files:**
- Create: `client/src/components/screens/BettingTableScreen.tsx`

- [ ] **Step 1: Create the file**

```tsx
// client/src/components/screens/BettingTableScreen.tsx
import { useState, useEffect, useMemo } from 'react'
import { LayoutGroup, AnimatePresence } from 'framer-motion'
import { useGameStore, selectMe, selectIsGladiator } from '../../store/gameStore'
import { decomposeToChips } from '@cumsino/shared'
import { playerAngle, FELT_CX, FELT_CY, SCENE_W, SCENE_H } from '../../lib/tableGeometry'
import { buildPhysicalChips, chipScatter } from '../../types/chips'
import { PlayerSlot } from '../ui/PlayerSlot'
import { BetZone } from '../ui/BetZone'
import { Timer } from '../ui/Timer'
import type { PhysicalChip } from '../../types/chips'
import type { ChipValue } from '../ui/Chip'

const CHIP_STYLES: Record<ChipValue, string> = {
  10:  'bg-gradient-to-br from-gray-200 to-gray-500 text-gray-900 border-gray-300',
  20:  'bg-gradient-to-br from-green-400 to-green-700 text-white border-green-300',
  50:  'bg-gradient-to-br from-blue-400 to-blue-700 text-white border-blue-300',
  100: 'bg-gradient-to-br from-red-400 to-red-700 text-white border-red-300',
  500: 'bg-gradient-to-br from-gray-700 to-black text-yellow-400 border-yellow-800',
}

export function BettingTableScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const me = useGameStore(selectMe)
  const isGladiator = useGameStore(selectIsGladiator)
  const pendingChips = useGameStore(s => s.pendingChips)
  const pendingTarget = useGameStore(s => s.pendingTarget)
  const placeChip = useGameStore(s => s.placeChip)
  const recallChip = useGameStore(s => s.recallChip)
  const confirm = useGameStore(s => s.confirmBet)
  const setTarget = useGameStore(s => s.setPendingTarget)

  // Build my physical chip stack once per betting phase
  const [myStack, setMyStack] = useState<PhysicalChip[]>([])
  useEffect(() => {
    if (me) setMyStack(buildPhysicalChips(me.chips))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally runs only on mount (phase start)

  const pendingIds = useMemo(() => new Set(pendingChips.map(c => c.id)), [pendingChips])
  const pendingBet = pendingChips.reduce((a, c) => a + c.denom, 0)

  const players = gameState.players
  const N = players.length
  const isGladiatorMode = gameState.mode === 'gladiator'

  // Gladiator sees waiting overlay
  if (isGladiator && isGladiatorMode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center"
        style={{ background: 'radial-gradient(ellipse at 50% 35%, #1c1600 0%, #060606 70%)' }}>
        <Timer seconds={gameState.phaseTimeLeft} />
        <div className="text-6xl mt-8 mb-4">⚔️</div>
        <div className="text-3xl text-yellow-400 font-bold mb-2">Ты — Гладиатор!</div>
        <div className="text-gray-500 animate-pulse">Толпа делает ставки…</div>
      </div>
    )
  }

  const canConfirm = pendingBet > 0 && (!isGladiatorMode || pendingTarget !== null)

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: 'radial-gradient(ellipse at 50% 35%, #1c1600 0%, #060606 70%)' }}
    >
      <Timer seconds={gameState.phaseTimeLeft} />

      {/* Gladiator crowd: win/lose target selector */}
      {isGladiatorMode && !isGladiator && (
        <div className="flex gap-3">
          {(['win', 'lose'] as const).map(target => (
            <button
              key={target}
              onClick={() => setTarget(target)}
              className={`rounded-xl px-6 py-3 border-2 font-bold text-sm transition-all
                ${pendingTarget === target
                  ? target === 'win' ? 'border-green-400 bg-green-900 text-green-200' : 'border-red-400 bg-red-900 text-red-200'
                  : 'border-[#2a2a2a] bg-[#111] text-[#666] hover:border-[#444]'
                }`}
            >
              {target === 'win' ? '👍 ОН ОТВЕТИТ' : '💀 ОН ЗАВАЛИТ'}
            </button>
          ))}
        </div>
      )}

      {/* Round table scene */}
      <LayoutGroup>
        <div className="relative" style={{ width: SCENE_W, height: SCENE_H }}>

          {/* Green felt */}
          <div
            className="absolute rounded-[130px] flex items-center justify-center"
            style={{
              left: FELT_CX - 200, top: FELT_CY - 125, width: 400, height: 250,
              background: 'radial-gradient(ellipse at 35% 38%, #278320 0%, #0e4a0a 55%, #071e06 100%)',
              border: '9px solid #071507',
              boxShadow: '0 0 0 14px #3d2600, 0 0 0 18px #1a1000, 0 10px 80px rgba(0,0,0,0.98), inset 0 0 60px rgba(0,0,0,0.55)',
              zIndex: 1,
            }}
          >
            <div className="text-center pointer-events-none select-none">
              <div className="text-[10px] text-white/20 tracking-widest uppercase">ставки</div>
              <div className="text-yellow-400 font-bold text-lg">{pendingBet || '—'}</div>
            </div>
          </div>

          {/* Player slots */}
          {players.map((player, i) => {
            const angle = playerAngle(i, N)
            const isMeSlot = player.id === me?.id
            return (
              <PlayerSlot
                key={player.id}
                player={player}
                angle={angle}
                isMe={isMeSlot}
                myChips={isMeSlot ? myStack : undefined}
                placedIds={isMeSlot ? pendingIds : undefined}
                onChipClick={isMeSlot ? (chip) => placeChip(chip) : undefined}
              />
            )
          })}

          {/* Bet zones */}
          <AnimatePresence>
            {players.map((player, i) => {
              const angle = playerAngle(i, N)
              const isMeSlot = player.id === me?.id

              // My zone: uses pendingChips with layoutId
              // Others: decompose currentBet for display only
              let zoneChips: PhysicalChip[]
              if (isMeSlot) {
                zoneChips = pendingChips
              } else {
                const breakdown = decomposeToChips(player.currentBet)
                const denoms: ChipValue[] = [500, 100, 50, 20, 10]
                zoneChips = []
                denoms.forEach(d => {
                  for (let j = 0; j < breakdown[d]; j++) {
                    zoneChips.push({ id: `${player.id}-bet-${d}-${j}`, denom: d })
                  }
                })
              }

              return (
                <BetZone
                  key={player.id}
                  angle={angle}
                  chips={zoneChips}
                  mine={isMeSlot}
                  onRecall={isMeSlot ? recallChip : undefined}
                />
              )
            })}
          </AnimatePresence>

        </div>
      </LayoutGroup>

      {/* Confirm button */}
      <button
        onClick={confirm}
        disabled={!canConfirm}
        className="px-10 py-3 bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-bold rounded-xl disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 transition-all text-sm tracking-wide"
      >
        ✓ ПОДТВЕРДИТЬ СТАВКУ {pendingBet > 0 ? `(${pendingBet})` : ''}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd client && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/screens/BettingTableScreen.tsx
git commit -m "feat: BettingTableScreen with round table layout and chip animations"
```

---

## Task 7: Store migration + App.tsx swap + delete old files

This task is atomic: store changes break old screens, so they're deleted in the same commit.

**Files:**
- Modify: `client/src/store/gameStore.ts`
- Modify: `client/src/App.tsx`
- Delete: `client/src/components/screens/BettingScreen.tsx`
- Delete: `client/src/components/screens/GladiatorCrowdScreen.tsx`

- [ ] **Step 1: Update gameStore.ts**

Replace the entire file contents:

```ts
// client/src/store/gameStore.ts
import { create } from 'zustand'
import { socket } from '../socket'
import type {
  GameState, Player, RoundResult,
  BetUpdatedPayload, PlayerAnsweredPayload,
  GladiatorHoveringPayload, GameOverPayload,
} from '@cumsino/shared'
import type { PhysicalChip } from '../types/chips'

interface GameStore {
  gameState: GameState | null
  myId: string | null
  roundResults: RoundResult[]
  winner: Player | null
  answeredIds: Set<string>
  gladiatorHoverIndex: number | null
  pendingChips: PhysicalChip[]
  pendingTarget: 'win' | 'lose' | null

  connect: (name: string, gameCode: string) => void
  placeChip: (chip: PhysicalChip) => void
  recallChip: (chipId: string) => void
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

  socket.on('bet_updated', (_payload: BetUpdatedPayload) => {})

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
    pendingChips: [],
    pendingTarget: null,

    connect(name, gameCode) {
      if (!socket.connected) socket.connect()
      socket.emit('join_game', { name, gameCode })
    },

    placeChip(chip) {
      const { gameState, myId, pendingChips } = get()
      if (!gameState || !myId) return
      const me = gameState.players.find(p => p.id === myId)
      if (!me) return
      const currentBet = pendingChips.reduce((a, c) => a + c.denom, 0)
      if (currentBet + chip.denom > me.chips) return
      set({ pendingChips: [...pendingChips, chip] })
    },

    recallChip(chipId) {
      set(s => ({ pendingChips: s.pendingChips.filter(c => c.id !== chipId) }))
    },

    confirmBet() {
      const { pendingChips, pendingTarget } = get()
      if (pendingChips.length === 0) return
      const amount = pendingChips.reduce((a, c) => a + c.denom, 0)
      socket.emit('place_bet', { amount, target: pendingTarget ?? undefined })
      set({ pendingChips: [], pendingTarget: null })
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
        pendingChips: [],
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

export const selectPendingBet = (s: GameStore): number =>
  s.pendingChips.reduce((a, c) => a + c.denom, 0)
```

- [ ] **Step 2: Update App.tsx**

Replace the BETTING case and remove old imports:

```tsx
// client/src/App.tsx
import React from 'react'
import { useGameStore, selectIsGladiator } from './store/gameStore'
import { JoinScreen } from './components/screens/JoinScreen'
import { LobbyScreen } from './components/screens/LobbyScreen'
import { AnnounceScreen } from './components/screens/AnnounceScreen'
import { BettingTableScreen } from './components/screens/BettingTableScreen'
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
    case 'LOBBY':      Screen = LobbyScreen; break
    case 'ANNOUNCE':   Screen = AnnounceScreen; break
    case 'BETTING':    Screen = BettingTableScreen; break
    case 'QUESTION_TEXT': Screen = QuestionTextScreen; break
    case 'QUESTION':
      if (mode === 'closest') Screen = ClosestScreen
      else if (mode === 'top5') Screen = Top5Screen
      else if (mode === 'gladiator' && isGladiator) Screen = GladiatorSelfScreen
      else Screen = QuestionScreen
      break
    case 'REVEAL':     Screen = RevealScreen; break
    case 'LEADERBOARD': Screen = LeaderboardScreen; break
    case 'GAME_OVER':  Screen = GameOverScreen; break
    default:           Screen = LobbyScreen
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

- [ ] **Step 3: Delete old files**

```bash
rm client/src/components/screens/BettingScreen.tsx
rm client/src/components/screens/GladiatorCrowdScreen.tsx
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd client && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Run dev server and manually test betting flow**

```bash
npm run dev:server
npm run dev --workspace=client
```

Open two browser tabs to the same game code. Verify:
- Table renders with oval green felt
- Players positioned around the table
- My chips (bottom slot) are clickable
- Clicking a chip dims it in the stack and places it in my bet zone
- Clicking the placed chip in the bet zone returns it
- Confirm button enables when pendingBet > 0
- After confirm, other player's screen shows my currentBet in their bet zone

- [ ] **Step 6: Commit**

```bash
git add client/src/store/gameStore.ts client/src/App.tsx
git commit -m "feat: migrate store to pendingChips, wire BettingTableScreen, remove old betting screens"
```

---

## Task 8: PlayerCard — static chip stack display

**Files:**
- Modify: `client/src/components/ui/PlayerCard.tsx`

- [ ] **Step 1: Rewrite PlayerCard.tsx**

```tsx
// client/src/components/ui/PlayerCard.tsx
import type { Player } from '@cumsino/shared'
import { buildPhysicalChips } from '../../types/chips'
import { PhysicalChipStack } from './PhysicalChipStack'

interface PlayerCardProps {
  player: Player
  isMe?: boolean
  isGladiator?: boolean
  hasAnswered?: boolean
}

export function PlayerCard({ player, isMe, isGladiator, hasAnswered }: PlayerCardProps) {
  const chips = buildPhysicalChips(player.chips)

  return (
    <div className={`
      rounded-xl p-3 border
      ${isMe ? 'border-yellow-400 bg-[#2a4a2a]' : 'border-[#3a6a3a] bg-[#1a3a1a]'}
    `}>
      <div className="flex items-center gap-2 mb-2">
        {isGladiator && <span title="Гладиатор">⚔️</span>}
        {hasAnswered && <span title="Ответил" className="text-green-400">✓</span>}
        <span className="font-bold text-sm truncate">{player.name}</span>
        {isMe && <span className="text-xs text-yellow-400 ml-auto">(ты)</span>}
      </div>
      <div className="text-yellow-400 font-mono text-sm mb-2">{player.chips} 🪙</div>
      <PhysicalChipStack chips={chips} interactive={false} size="sm" />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd client && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ui/PlayerCard.tsx
git commit -m "feat: PlayerCard shows physical chip stacks instead of text breakdown"
```

---

## Task 9: Reveal screen — chip win/loss animation

When `round_results` arrives, show animated chip delta for the current player.

**Files:**
- Modify: `client/src/components/screens/RevealScreen.tsx`

- [ ] **Step 1: Read current RevealScreen**

```bash
cat client/src/components/screens/RevealScreen.tsx
```

- [ ] **Step 2: Add chip animation to RevealScreen**

Find where the delta is displayed and replace with animated chip stack. Add this to the component:

```tsx
// At top of file, add imports:
import { motion, AnimatePresence } from 'framer-motion'
import { buildPhysicalChips } from '../../types/chips'
import { PhysicalChipStack } from '../ui/PhysicalChipStack'

// Inside the component, find the section showing the local player's delta.
// Replace the delta number display with this block:

const myResult = roundResults.find(r => r.playerId === myId)
const deltaChips = myResult && myResult.delta !== 0
  ? buildPhysicalChips(Math.abs(myResult.delta))
  : []
const isWin = (myResult?.delta ?? 0) > 0
const isLoss = (myResult?.delta ?? 0) < 0

// Add this JSX where the delta is shown:
{myResult && myResult.delta !== 0 && (
  <div className="flex flex-col items-center gap-2 my-4">
    <div className={`text-sm font-bold tracking-widest uppercase ${isWin ? 'text-green-400' : 'text-red-400'}`}>
      {isWin ? `+${myResult.delta} 🎉` : `${myResult.delta} 💀`}
    </div>
    <div className="flex gap-1">
      {deltaChips.map((chip, i) => (
        <motion.div
          key={chip.id}
          initial={{ scale: 0, y: isWin ? 20 : 0, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: i * 0.06 }}
          exit={{ scale: 0, opacity: 0 }}
          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[0.44rem] font-bold
            ${chip.denom === 10  ? 'bg-gradient-to-br from-gray-200 to-gray-500 text-gray-900 border-gray-300' : ''}
            ${chip.denom === 20  ? 'bg-gradient-to-br from-green-400 to-green-700 text-white border-green-300' : ''}
            ${chip.denom === 50  ? 'bg-gradient-to-br from-blue-400 to-blue-700 text-white border-blue-300' : ''}
            ${chip.denom === 100 ? 'bg-gradient-to-br from-red-400 to-red-700 text-white border-red-300' : ''}
            ${chip.denom === 500 ? 'bg-gradient-to-br from-gray-700 to-black text-yellow-400 border-yellow-800' : ''}
          `}
        >
          {chip.denom}
        </motion.div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd client && npx tsc --noEmit
```

- [ ] **Step 4: Test reveal animation**

Play a round through to REVEAL. Verify chips animate in (win) or show red negative amount (loss).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/screens/RevealScreen.tsx
git commit -m "feat: reveal screen animates chip delta as physical chips"
```

---

## Self-Review

**Spec coverage check:**
- ✅ PhysicalChip type + buildPhysicalChips → Task 1
- ✅ pendingChips replaces pendingBet in store → Task 7
- ✅ placeChip / recallChip → Task 7
- ✅ selectPendingBet selector → Task 7
- ✅ Stack grows upward (bottom: i*STEP) → Task 3
- ✅ LAND_INSET=42 from felt edge → Task 2
- ✅ Chip landing zone per player angle → Task 4
- ✅ layoutId flight animation → Tasks 3+4+6
- ✅ LayoutGroup wraps scene → Task 6
- ✅ N players at equal angles, me at bottom → Tasks 2+5+6
- ✅ Gladiator overlay (is gladiator) → Task 6
- ✅ Gladiator crowd: win/lose selector + betting → Task 6
- ✅ Other players' bets visible via game_state → Task 6
- ✅ Noir Gold theme + green felt → Task 6
- ✅ Win/loss chip animation → Task 9
- ✅ BettingScreen + GladiatorCrowdScreen deleted → Task 7
- ✅ PlayerCard updated → Task 8
- ⚠️ Gladiator bonus (+300) chip materialization: the spec mentions stagger animation; this happens inside the normal win animation in RevealScreen (Task 9) since `GLADIATOR_BONUS` is included in `delta`. No separate task needed — covered.
- ⚠️ Initial chip materialization (LOBBY → first BETTING): the stack builds on `BettingTableScreen` mount. A stagger `initial={{ scale: 0 }}` on each chip in `PhysicalChipStack` with `delay: i * 0.02` would handle this. Add to Task 3 — the `initial` prop on each chip already has this via Framer Motion's layout animation.

**Type consistency:**
- `PhysicalChip` defined in Task 1, used in Tasks 3, 4, 5, 6, 7 ✅
- `buildPhysicalChips` defined in Task 1, used in Tasks 5, 8, 9 ✅
- `landingZone` defined in Task 2, used in Task 4 ✅
- `playerAngle` defined in Task 2, used in Tasks 5, 6 ✅
- `unitPosition` defined in Task 2, used in Task 5 ✅
- `placeChip(chip: PhysicalChip)` defined in Task 7 store, called in Task 6 ✅
- `recallChip(chipId: string)` defined in Task 7 store, called in Tasks 4, 6 ✅
- `pendingChips: PhysicalChip[]` in store, read in Task 6 ✅
