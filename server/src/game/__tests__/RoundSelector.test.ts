// server/src/game/__tests__/RoundSelector.test.ts
import { describe, it, expect } from 'vitest'
import { RoundSelector } from '../RoundSelector'

describe('RoundSelector', () => {
  it('раунд 1 всегда "all"', () => {
    const selector = new RoundSelector(['closest', 'top5'])
    expect(selector.next()).toBe('all')
  })

  it('раунд 2 всегда "gladiator"', () => {
    const selector = new RoundSelector(['closest', 'top5'])
    selector.next()
    expect(selector.next()).toBe('gladiator')
  })

  it('после gladiator следующий основной — "all"', () => {
    const selector = new RoundSelector([]) // нет спец-режимов → всегда основной
    selector.next() // all
    selector.next() // gladiator
    // при отсутствии спец-режимов — всегда основной
    const next = selector.next()
    expect(next).toBe('all')
  })

  it('после all следующий основной — "gladiator"', () => {
    const selector = new RoundSelector([])
    selector.next() // all
    selector.next() // gladiator
    selector.next() // all (нет спец-режимов)
    const next = selector.next()
    expect(next).toBe('gladiator')
  })

  it('lastMainMode обновляется только для основных режимов', () => {
    const selector = new RoundSelector(['closest'])
    selector.next() // all
    selector.next() // gladiator
    // принудительно делаем спец-режим
    const mode = selector.nextForceSpecial()
    expect(mode).toBe('closest')
    // следующий основной должен быть all (т.к. последний основной = gladiator)
    selector.nextForceMain()
    expect(selector.lastMainMode).toBe('all')
  })
})
