import { describe, it, expect } from 'vitest'
import { withUnit } from '../units'

describe('withUnit', () => {
  it('% и × — слитно', () => {
    expect(withUnit('175', '%')).toBe('175%')
    expect(withUnit(1.5, '×')).toBe('1.5×')
  })

  it("'x' из банка — тот же множитель ×", () => {
    expect(withUnit('2', 'x')).toBe('2×')
  })

  it('остальное — через пробел', () => {
    expect(withUnit('12', 'сек.')).toBe('12 сек.')
    expect(withUnit(2250, 'золота')).toBe('2250 золота')
  })

  it('без единицы — просто число', () => {
    expect(withUnit(850)).toBe('850')
    expect(withUnit('850', '')).toBe('850')
    expect(withUnit('850', null)).toBe('850')
  })
})
