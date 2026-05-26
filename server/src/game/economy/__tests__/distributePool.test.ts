import { describe, it, expect } from 'vitest'
import { distributePool } from '../distributePool'

describe('distributePool', () => {
  it('победитель получает весь пул проигравших', () => {
    const result = distributePool(
      [{ id: 'w1', stake: 100 }],
      [{ id: 'l1', stake: 200 }, { id: 'l2', stake: 300 }]
    )
    expect(result.get('w1')).toBe(500) // получает 500 из пула
    expect(result.get('l1')).toBe(-200)
    expect(result.get('l2')).toBe(-300)
  })

  it('победители делят пул пропорционально ставкам', () => {
    const result = distributePool(
      [{ id: 'w1', stake: 100 }, { id: 'w2', stake: 400 }],
      [{ id: 'l1', stake: 500 }]
    )
    const w1 = result.get('w1')!
    const w2 = result.get('w2')!
    expect(w1).toBeGreaterThan(0)
    expect(w2).toBeGreaterThan(0)
    expect(w2 / w1).toBeCloseTo(4, 0) // w2 ставил в 4 раза больше
    expect(result.get('l1')).toBe(-500)
  })

  it('если все выиграли — никто ничего не получает и не теряет (ставки возвращаются)', () => {
    const result = distributePool(
      [{ id: 'w1', stake: 200 }, { id: 'w2', stake: 300 }],
      []
    )
    expect(result.get('w1')).toBe(0)
    expect(result.get('w2')).toBe(0)
  })

  it('если никто не ставил — нет делений на ноль', () => {
    const result = distributePool(
      [{ id: 'w1', stake: 0 }],
      [{ id: 'l1', stake: 0 }]
    )
    expect(result.get('w1')).toBe(0)
    expect(result.get('l1')).toBe(0)
  })

  it('сумма всех дельт равна нулю (деньги не создаются и не уничтожаются)', () => {
    const result = distributePool(
      [{ id: 'w1', stake: 100 }, { id: 'w2', stake: 200 }],
      [{ id: 'l1', stake: 150 }, { id: 'l2', stake: 250 }]
    )
    const sum = [...result.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBe(0)
  })

  it('пустой массив победителей — проигравшие теряют ставки (pool уходит в никуда)', () => {
    const result = distributePool(
      [],
      [{ id: 'l1', stake: 100 }]
    )
    // Нет победителей — деньги не распределяются (особый случай гладиатора когда никто не угадал)
    expect(result.get('l1')).toBe(-100)
    expect(result.size).toBe(1)
  })

  it('победители с нулевыми ставками при ненулевом пуле — пул не распределяется', () => {
    const result = distributePool(
      [{ id: 'w1', stake: 0 }],
      [{ id: 'l1', stake: 100 }]
    )
    expect(result.get('w1')).toBe(0)
    expect(result.get('l1')).toBe(-100)
    // Деньги сгорают — это задокументированное поведение когда нет реальных ставок у победителей
  })
})
