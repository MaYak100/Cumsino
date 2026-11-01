import { buildPhysicalChips } from '../types/chips'
import type { PhysicalChip } from '../types/chips'

/**
 * Фишки быстрой ставки (min / 25% / 50% / all-in) на ровно `target`.
 * Сначала — из того, что лежит в стопке (жадно от крупных). Ровно не сложилось (в стопке $500 и мало мелочи) —
 * размен, как у крупье: стопка перекладывается на «ставка + сдача», и ставка берётся целиком из первой части.
 * Раньше недостающее добиралось одной крупной фишкой сверху — 50% от $580 (500 + 50 + 20 + 10) становились all-in.
 */
export function quickChips(stack: PhysicalChip[], target: number): { stack: PhysicalChip[]; pick: PhysicalChip[] } {
  const pool = [...stack].sort((a, b) => b.denom - a.denom)
  let rest = target
  const pick: PhysicalChip[] = []
  for (const c of pool) if (c.denom <= rest) { pick.push(c); rest -= c.denom }
  if (rest === 0) return { stack, pick }

  const total = stack.reduce((a, c) => a + c.denom, 0)
  const bet = buildPhysicalChips(target)
  const change = buildPhysicalChips(total - target)
  return { stack: [...bet, ...change], pick: bet }
}
