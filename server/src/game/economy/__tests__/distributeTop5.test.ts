import { describe, it, expect } from 'vitest'
import { distributeTop5 } from '../distributeTop5'

const correct = ['A', 'B', 'C', 'D', 'E']

describe('distributeTop5', () => {
  it('все верно — 150 фишек', () => {
    const result = distributeTop5([{ id: 'p1', answer: ['A', 'B', 'C', 'D', 'E'] }], correct)
    expect(result.get('p1')).toBe(150)
  })

  it('3 верных слота — 60 фишек', () => {
    const result = distributeTop5([{ id: 'p1', answer: ['A', 'B', 'C', 'E', 'D'] }], correct)
    expect(result.get('p1')).toBe(60) // 3 × 20
  })

  it('ноль верных — 0 фишек', () => {
    const result3 = distributeTop5([{ id: 'p1', answer: ['E', 'C', 'D', 'A', 'B'] }], correct)
    // E at 0 ❌, C at 1 ❌, D at 2 ❌, A at 3 ❌, B at 4 ❌ → 0
    expect(result3.get('p1')).toBe(0)
  })

  it('несколько игроков получают независимо', () => {
    const result = distributeTop5(
      [
        { id: 'p1', answer: ['A', 'B', 'C', 'D', 'E'] },
        { id: 'p2', answer: ['A', 'X', 'X', 'X', 'X'] },
      ],
      correct
    )
    expect(result.get('p1')).toBe(150)
    expect(result.get('p2')).toBe(20) // только первый слот верный
  })
})
