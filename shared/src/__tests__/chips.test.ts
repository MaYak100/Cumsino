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
