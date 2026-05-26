import { describe, it, expect } from 'vitest'
import { distributeClosest } from '../distributeClosest'

describe('distributeClosest', () => {
  it('победитель получает базовый бонус', () => {
    const result = distributeClosest(
      [{ id: 'p1', answer: 100 }, { id: 'p2', answer: 50 }],
      330
    )
    expect(result.get('p1')).toBe(200) // 100 ближе к 330
    expect(result.get('p2')).toBe(0)
  })

  it('точное попадание даёт двойной бонус', () => {
    const result = distributeClosest(
      [{ id: 'p1', answer: 330 }, { id: 'p2', answer: 100 }],
      330
    )
    expect(result.get('p1')).toBe(400) // 200 базовый + 200 за точность
    expect(result.get('p2')).toBe(0)
  })

  it('при ничьей бонус делится поровну', () => {
    const result = distributeClosest(
      [{ id: 'p1', answer: 100 }, { id: 'p2', answer: 560 }],
      330
    )
    // оба на расстоянии 230 — ничья
    expect(result.get('p1')).toBe(100)
    expect(result.get('p2')).toBe(100)
  })

  it('при точной ничьей бонус за точность тоже делится', () => {
    const result = distributeClosest(
      [{ id: 'p1', answer: 330 }, { id: 'p2', answer: 330 }],
      330
    )
    expect(result.get('p1')).toBe(200) // (200+200) / 2
    expect(result.get('p2')).toBe(200)
  })
})
