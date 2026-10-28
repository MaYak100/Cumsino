import { describe, it, expect } from 'vitest'
import { shuffleOptions, createQuestionPicker } from '../loadQuestions'

describe('shuffleOptions', () => {
  it('подпись остаётся у своего варианта', () => {
    const options = ['Leshrac', 'Kez', 'Storm Spirit', 'Lina']
    const notes = ['610', '340', '163', '176']
    for (let i = 0; i < 50; i++) {
      const r = shuffleOptions(options, notes)
      expect([...r.options].sort()).toEqual([...options].sort())
      r.options.forEach((o, j) => expect(r.optionNotes![j]).toBe(notes[options.indexOf(o)]))
    }
  })

  it('без подписей или с неполными подписями — optionNotes нет', () => {
    expect(shuffleOptions(['a', 'b']).optionNotes).toBeUndefined()
    expect(shuffleOptions(['a', 'b', 'c'], ['1', '2']).optionNotes).toBeUndefined()
  })
})

describe('createQuestionPicker (пикер на игру)', () => {
  it('вопросы не повторяются, статистика попадает в игру', () => {
    const pick = createQuestionPicker()
    const seen = new Set<string>()
    let stats = 0
    for (let i = 0; i < 60; i++) {
      for (const mode of ['all', 'kerri', 'closest'] as const) {
        const q = pick(mode)
        const key = `${q.text}|${[...(q.options ?? [])].sort().join(',')}`
        expect(seen.has(key)).toBe(false)
        seen.add(key)
        if (q.id.startsWith('stat_')) stats++
        if (q.options) {
          expect(q.options).toContain(q.answer)
          if (q.optionNotes) expect(q.optionNotes).toHaveLength(q.options.length)
        } else {
          expect(typeof q.numericAnswer).toBe('number')
        }
      }
    }
    expect(stats).toBeGreaterThan(20)   // ожидание ~45 из 180 при весах 40 / 20
  })

  it('у разных комнат своя история вопросов', () => {
    const a = createQuestionPicker()
    const b = createQuestionPicker()
    for (let i = 0; i < 20; i++) a('all')
    expect(() => b('all')).not.toThrow()
  })
})
