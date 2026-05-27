import { describe, it, expect } from 'vitest'
import { applyBankBets } from '../applyBankBets'

describe('applyBankBets', () => {
  it('x3 net на верный угаданный вариант', () => {
    const deltas = new Map([['p1', 0]])
    const players = [{ id: 'p1', bankBet: { optionIndex: 2, amount: 100 } }]
    const result = applyBankBets(deltas, players, 2)
    expect(result.get('p1')).toBe(300)
  })

  it('вычитает ставку при промахе', () => {
    const deltas = new Map([['p1', 0]])
    const players = [{ id: 'p1', bankBet: { optionIndex: 2, amount: 100 } }]
    const result = applyBankBets(deltas, players, 3)
    expect(result.get('p1')).toBe(-100)
  })

  it('не трогает игроков без bankBet', () => {
    const deltas = new Map([['p1', 50]])
    const players = [{ id: 'p1' }]
    const result = applyBankBets(deltas, players, 1)
    expect(result.get('p1')).toBe(50)
  })

  it('суммируется с существующей дельтой', () => {
    const deltas = new Map([['p1', 200]])
    const players = [{ id: 'p1', bankBet: { optionIndex: 1, amount: 50 } }]
    const result = applyBankBets(deltas, players, 1)
    expect(result.get('p1')).toBe(350)
  })

  it('gladiatorAnswerIndex === -1 считается промахом', () => {
    const deltas = new Map([['p1', 0]])
    const players = [{ id: 'p1', bankBet: { optionIndex: 0, amount: 80 } }]
    const result = applyBankBets(deltas, players, -1)
    expect(result.get('p1')).toBe(-80)
  })
})
