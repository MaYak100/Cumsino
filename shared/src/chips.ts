// shared/src/chips.ts
import type { ChipBreakdown } from './types'

export function decomposeToChips(amount: number): ChipBreakdown {
  if (amount <= 0) return { 500: 0, 100: 0, 50: 0, 20: 0, 10: 0 }
  const rounded = Math.round(amount / 10) * 10
  const chips: ChipBreakdown = { 500: 0, 100: 0, 50: 0, 20: 0, 10: 0 }
  let remaining = rounded

  if (remaining >= 200) {
    // ~20% суммы резервируем для мелких фишек, минимум 20
    const smallBudget = Math.max(20, Math.round(remaining * 0.2 / 10) * 10)

    // Greedy allocation of 500s from full amount first
    chips[500] = Math.floor(remaining / 500)
    remaining -= chips[500] * 500

    // Allocate 100s, but leave at least smallBudget for small chips
    const budgetFor100 = Math.max(0, remaining - smallBudget)
    chips[100] = Math.floor(budgetFor100 / 100)
    remaining -= chips[100] * 100
  }

  chips[50] = Math.floor(remaining / 50)
  remaining -= chips[50] * 50
  chips[20] = Math.floor(remaining / 20)
  remaining -= chips[20] * 20
  chips[10] = remaining / 10

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
