// shared/src/__tests__/chips.test.ts
import { describe, it, expect } from 'vitest'
import { decomposeToChips, decomposeStartingChips } from '../chips'

describe('decomposeToChips', () => {
  it('разбивает 500 без чёрной фишки (резервирует мелкие)', () => {
    const result = decomposeToChips(500)
    // Алгоритм резервирует мелкий бюджет до 500-х → 500 не хватает в largeBudget
    expect(result[500]).toBe(0)
    const total = result[100] * 100 + result[50] * 50 + result[20] * 20 + result[10] * 10
    expect(total).toBe(500)
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

  it('ни одна стопка не превышает 7 фишек после нормализации', () => {
    for (const amount of [500, 750, 1000, 1500, 2000, 2500, 3000]) {
      const r = decomposeToChips(amount)
      expect(r[10]).toBeLessThanOrEqual(7)
      expect(r[20]).toBeLessThanOrEqual(7)
      expect(r[50]).toBeLessThanOrEqual(7)
      expect(r[100]).toBeLessThanOrEqual(7)
    }
  })

  it('decomposeToChips(500) содержит мелкие фишки', () => {
    const r = decomposeToChips(500)
    expect(r[500]).toBe(0)
    expect(r[10] + r[20]).toBeGreaterThan(0)
  })
})

describe('decomposeStartingChips', () => {
  it('даёт ровно 500 фишек с мелкими номиналами', () => {
    const r = decomposeStartingChips()
    const total = r[500]*500 + r[100]*100 + r[50]*50 + r[20]*20 + r[10]*10
    expect(total).toBe(500)
    expect(r[10]).toBeGreaterThan(0)
    expect(r[20]).toBeGreaterThan(0)
  })
})
