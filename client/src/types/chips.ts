import { decomposeToChips } from '@cumsino/shared'
import type { ChipValue } from '../components/ui/Chip'

export interface PhysicalChip {
  id: string // crypto.randomUUID() — stable for chip's lifetime
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

/** Стабильные ID на основе playerId — для BetZone чужих игроков, чтобы chipScatter не прыгал при каждом re-render. */
export function buildChipsForPlayer(playerId: string, amount: number): PhysicalChip[] {
  const breakdown = decomposeToChips(amount)
  const chips: PhysicalChip[] = []
  const denoms: ChipValue[] = [500, 100, 50, 20, 10]
  denoms.forEach(denom => {
    const count = breakdown[denom]
    for (let i = 0; i < count; i++) {
      chips.push({ id: `${playerId}-${denom}-${i}`, denom })
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
