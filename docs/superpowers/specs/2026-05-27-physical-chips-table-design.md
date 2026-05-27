# Physical Chips & Round Table — Design Spec
**Date:** 2026-05-27  
**Scope:** Client only. Server API unchanged.

---

## Overview

Replace the current numeric chip-button betting UI with a physical chip system rendered on a round poker table. Each player's chip stack is a real visual object; clicking a chip moves it to your side of the table as a bet; chips animate in/out on round results and bonuses.

---

## 1. State — `gameStore.ts`

### New type (client-only)
```ts
interface PhysicalChip {
  id: string       // nanoid(), stable for the chip's lifetime
  denom: ChipValue // 10 | 20 | 50 | 100 | 500
}
```

### Store changes

| Remove | Add |
|---|---|
| `pendingBet: number` | `pendingChips: PhysicalChip[]` |
| `addChipToBet(value)` | `placeChip(chipId: string)` |
| `removeLastChip(value)` | `recallChip(chipId: string)` |

`pendingBet` becomes a derived selector: `selectPendingBet = s => s.pendingChips.reduce((a,c) => a+c.denom, 0)`.

### Chip stack lifecycle

- **BETTING phase start**: build `myStack: PhysicalChip[]` from `decomposeToChips(me.chips)` — one `PhysicalChip` per chip in the breakdown. Stored in the component (not in Zustand — ephemeral per phase).
- **`placeChip(id)`**: mark chip as 'bet' → it moves to the bet zone via layoutId animation.
- **`recallChip(id)`**: mark chip as 'stack' → flies back.
- **`confirmBet()`**: emits `place_bet { amount: sum(pendingChips) }`, clears pendingChips. Stack rebuilds from next `game_state`.

### Round-end chip distribution

On `round_results` event, for the local player:
- `delta > 0` (win): `decomposeToChips(delta)` → animate those chips flying from the center of the felt onto my stack, staggered.
- `delta < 0` (loss): bet chips already on table animate into center pot, disappear.
- `GLADIATOR_BONUS` (+300): materialize chips directly on stack with a scale-up stagger (no flight path needed).

---

## 2. Table Layout — `BettingTableScreen.tsx`

Replaces both `BettingScreen` and `GladiatorCrowdScreen` for the BETTING phase.

### Geometry (desktop, fixed 900×610 scene)

```
FELT_CX = 450, FELT_CY = 305
FELT_RX = 200, FELT_RY = 125   (inner felt, for chip landing)
OUTER_RX = 227, OUTER_RY = 152 (outer edge incl. border + wood rail)
LAND_INSET = 42                 (px from inner felt edge inward, chip landing zone)
CARD_GAP = 28                   (px from outer edge outward, card inner face)
```

### Player angle distribution

```
angle(i) = π/2 + i × (2π/N)   for i = 0..N-1
i=0 → me (bottom, π/2)
i=1..N-1 → others, distributed clockwise
```

### Card positioning

For each player at angle θ:
```
edgePt = (OUTER_RX·cos θ, OUTER_RY·sin θ)   // from center
norm   = edgePt / |edgePt|
cardInnerFace = feltCenter + edgePt + norm·CARD_GAP
```
Unit anchor (inner face of chip row for bottom half, inner face of card for top half):
- `sin θ > 0` (bottom): top of chip row sits at `cardInnerFace.y`
- `sin θ < 0` (top): bottom of card sits at `cardInnerFace.y`
- `|cos θ| > |sin θ|` (sides): near edge of unit at `cardInnerFace.x`

### Chip landing zone

```
feltEdgePt = (FELT_RX·cos θ, FELT_RY·sin θ)
norm = feltEdgePt / |feltEdgePt|
landCenter = feltCenter + feltEdgePt - norm·LAND_INSET
```
Chips land within `±15px` random scatter around `landCenter`.

---

## 3. Components

### `PhysicalChipStack` (new)
Props: `chips: PhysicalChip[], interactive: boolean, onChipClick?: (id) => void`

- Renders chips grouped by denom, one stack per denom.
- Each stack: `position: relative`, chips `position: absolute`, `bottom: i × (CHIP_SIZE - OVERLAP)`.
- Chips grow **upward** from `bottom: 0` (base) to `bottom: (count-1)×10px` (top).
- `interactive=true` → my chips, hover glow + click handler. `placed` chips dim to 20% opacity.
- Each chip: `<motion.div layoutId={chip.id}>` — Framer Motion handles the flight to BetZone.

### `BetZone` (new)
Props: `angle: number, chips: PhysicalChip[], mine: boolean`

- Absolutely positioned div at `landCenter` coordinates.
- Renders each chip as `<motion.div layoutId={chip.id}>` — when a chip's layoutId appears here after disappearing from the stack, Framer Motion animates it across.
- `mine=true` → chips are clickable for recall. Others' chips are display-only.
- Small random positional scatter per chip (seeded by chip.id for stability).

### `PlayerSlot` (new)
Props: `player: Player, angle: number, isMe: boolean, myChips?: PhysicalChip[]`

- Wraps `PhysicalChipStack` + player name card.
- For `isMe`: uses `myChips` (local physical state). For others: uses `decomposeToChips(player.chips)` as read-only display.
- Name card: rounded rect, full name, gold border if `isMe`.

### Updated: `PlayerCard.tsx`
- Replace text chip breakdown with `PhysicalChipStack` (non-interactive, small size).
- Used in leaderboard, question screens.

### Updated: `Chip.tsx`
- Add `layoutId` prop (pass-through to `motion.div`) — already has it, just ensure it's used.

---

## 4. Animation Plan

| Event | Animation |
|---|---|
| Place chip | layoutId flight: stack → bet zone (Framer Motion LayoutGroup) |
| Recall chip | layoutId flight: bet zone → stack |
| Confirm bet | bet chips stay on table; stack refreshes from next game_state |
| Win (delta>0) | chips fly from felt center → my stack, staggered 60ms each |
| Loss (delta<0) | bet chips on table scale down + dissolve into center |
| Gladiator bonus | chips scale up from 0 on stack, staggered 80ms each |
| LOBBY → first BETTING | initial 500 chips materialize on stack with stagger |

All transitions use `spring` with `stiffness: 300, damping: 28` for a bouncy-but-controlled feel.

---

## 5. Gladiator Mode Adaptations

`BettingTableScreen` handles both `all` and `gladiator` modes:
- **Gladiator (the gladiator)**: no chip row shown, displays "Ты — Гладиатор / Жди вопроса" overlay.
- **Gladiator (crowd)**: shows `win/lose` target selector above their name card (same two-button UI), then chip placement as normal.
- Gladiator's bet zone stays empty; other zones fill as crowd bets.

---

## 6. Files to Create / Modify

| File | Action |
|---|---|
| `client/src/components/screens/BettingTableScreen.tsx` | **Create** — main round table screen |
| `client/src/components/ui/PhysicalChipStack.tsx` | **Create** |
| `client/src/components/ui/BetZone.tsx` | **Create** |
| `client/src/components/ui/PlayerSlot.tsx` | **Create** |
| `client/src/store/gameStore.ts` | **Modify** — pendingChips, selectors |
| `client/src/components/ui/Chip.tsx` | **Modify** — ensure layoutId works cleanly |
| `client/src/components/ui/PlayerCard.tsx` | **Modify** — physical chip stacks |
| `client/src/App.tsx` | **Modify** — route BETTING → BettingTableScreen |
| `client/src/components/screens/BettingScreen.tsx` | **Delete** (replaced) |
| `client/src/components/screens/GladiatorCrowdScreen.tsx` | **Delete** (merged into BettingTableScreen) |

---

## 7. Out of Scope

- Server changes (no new socket events, no new payload fields).
- Mobile layout (desktop only).
- Top-5 special mode chip handling (no questions in DB, mode unused).
- Chip "change-making" (если у игрока нет нужного номинала — просто нельзя поставить эту фишку; логика `decomposeToChips` даёт ему правильный набор).

---

## 8. Open Questions (resolved)

- **Theme**: Noir Gold (black + gold accents), green felt always.
- **Chip stack direction**: grows upward, base at bottom.
- **Landing distance**: LAND_INSET = 42px from inner felt edge.
- **Other players' chips visible**: yes, real-time via `game_state` updates.
- **N players**: 4–7, evenly distributed around ellipse, me always at bottom.
