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
})
