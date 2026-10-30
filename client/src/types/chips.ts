import { decomposeToChips, decomposeStartingChips, STARTING_CHIPS } from '@cumsino/shared'
import type { ChipValue } from '../components/ui/Chip'

export interface PhysicalChip {
  id: string // постоянный на всю жизнь фишки (layoutId перелёта, место в кучке)
  denom: ChipValue
}

/** Уникальные id без crypto.randomUUID: его нет вне secure context (игра по LAN — http://192.168…). */
let chipSeq = 0
const sessionTag = Math.random().toString(36).slice(2, 7)

/** Разложить сумму на фишки по порядку: крупные первыми, внутри номинала индекс 0 — низ стопки.
 *  prefix — стабильные id (стопка соперника: один и тот же набор на каждый рендер, узлы не пересоздаются);
 *  без него — новые уникальные id (своя стопка: собирается заново на каждые ставки). */
export function buildPhysicalChips(total: number, prefix?: string): PhysicalChip[] {
  const breakdown = total === STARTING_CHIPS ? decomposeStartingChips() : decomposeToChips(total)
  const chips: PhysicalChip[] = []
  const denoms: ChipValue[] = [500, 100, 50, 20, 10]
  denoms.forEach(denom => {
    const count = breakdown[denom]
    for (let i = 0; i < count; i++) {
      chips.push({ id: prefix ? `${prefix}-${denom}-${i}` : `c${sessionTag}${++chipSeq}`, denom })
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

/** Место фишки в кучке по порядку выкладки: спираль по золотому углу + лёгкий разброс от id.
 *  Соседние фишки ложатся краем друг на друга, а не стопкой; позиция не зависит от того, сколько фишек после. */
export function pileOffset(i: number, id: string, spread = 16): { x: number; y: number } {
  if (i === 0) return { x: chipScatter('x' + id, 4), y: chipScatter('y' + id, 4) }
  const r = spread * Math.sqrt(i) + chipScatter(id + 'pr', 4)
  const a = i * 2.39996 + chipScatter(id + 'pa', 0.6)
  return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.8 }
}
