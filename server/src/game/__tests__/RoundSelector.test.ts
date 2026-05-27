// server/src/game/__tests__/RoundSelector.test.ts
import { describe, it, expect } from 'vitest'
import { RoundSelector } from '../RoundSelector'

describe('RoundSelector', () => {
  it('3-mode cycle: all → kerri → closest → all', () => {
    const selector = new RoundSelector()
    expect(selector.next()).toBe('all')
    expect(selector.next()).toBe('kerri')
    expect(selector.next()).toBe('closest')
    expect(selector.next()).toBe('all')
    expect(selector.next()).toBe('kerri')
  })

  it('lastMainMode is "all" initially', () => {
    const selector = new RoundSelector()
    expect(selector.lastMainMode).toBe('all')
  })

  it('lastMainMode updates after all', () => {
    const selector = new RoundSelector()
    selector.next() // all
    expect(selector.lastMainMode).toBe('all')
  })

  it('lastMainMode updates after kerri', () => {
    const selector = new RoundSelector()
    selector.next() // all
    selector.next() // kerri
    expect(selector.lastMainMode).toBe('kerri')
  })

  it('lastMainMode does not update after closest', () => {
    const selector = new RoundSelector()
    selector.next() // all
    selector.next() // kerri
    selector.next() // closest
    expect(selector.lastMainMode).toBe('kerri')
  })
})
