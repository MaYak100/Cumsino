// shared/src/chips.ts
import type { ChipBreakdown } from './types'

function normalizeMax7(chips: ChipBreakdown): ChipBreakdown {
  const r = { ...chips }
  while (r[10] > 7) { const up = Math.floor(r[10] / 2); r[10] %= 2; r[20] += up }
  while (r[20] > 7) { const up = Math.floor(r[20] / 5); r[20] %= 5; r[100] += up }
  while (r[50] > 7) { const up = Math.floor(r[50] / 2); r[50] %= 2; r[100] += up }
  while (r[100] > 7) { const up = Math.floor(r[100] / 5); r[100] %= 5; r[500] += up }
  return r
}

export function decomposeToChips(amount: number): ChipBreakdown {
  if (amount <= 0) return { 500: 0, 100: 0, 50: 0, 20: 0, 10: 0 }
  const rounded = Math.round(amount / 10) * 10
  const chips: ChipBreakdown = { 500: 0, 100: 0, 50: 0, 20: 0, 10: 0 }
  let remaining = rounded

  if (rounded >= 200) {
    const smallBudget = Math.max(60, Math.round(rounded * 0.2 / 10) * 10)
    const largeBudget = Math.max(0, rounded - smallBudget)

    chips[500] = Math.floor(largeBudget / 500)
    remaining -= chips[500] * 500

    const budgetFor100 = Math.max(0, remaining - smallBudget)
    chips[100] = Math.floor(budgetFor100 / 100)
    remaining -= chips[100] * 100

    // Reserve a portion specifically for 10s and 20s
    const tiny = Math.min(remaining, Math.max(30, Math.round(remaining * 0.3 / 10) * 10))
    const midBudget = Math.max(0, remaining - tiny)
    chips[50] = Math.floor(midBudget / 50)
    remaining -= chips[50] * 50
  }

  chips[20] = Math.floor(remaining / 20)
  remaining -= chips[20] * 20
  chips[10] = remaining / 10

  return normalizeMax7(chips)
}

export function decomposeStartingChips(): ChipBreakdown {
  return { 500: 0, 100: 4, 50: 1, 20: 1, 10: 3 }
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
