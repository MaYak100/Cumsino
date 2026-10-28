import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'
import { StatQuestionPicker, gapOk, type StatsBank, type StatEntry } from '../statQuestions'

// детерминированный ГПСЧ (mulberry32) — чтобы проверки не зависели от удачи
function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const entries = (vals: number[]): StatEntry[] => vals.map((v, i) => [`H${i}`, v, `${v}`])

function bank(sub: Partial<StatsBank['subcategories'][number]> & Pick<StatsBank['subcategories'][number], 'pools'>): StatsBank {
  return {
    snapshot: 'test', patch: '7.41f',
    subcategories: [{ id: 's', mode: 'mc', topic: 'T', display: 'D', comment: 'C', weight: 1, gap: { rel: 0.1 }, ...sub }],
  }
}

describe('gapOk', () => {
  it('rel / abs, max / min', () => {
    expect(gapOk(110, 100, { rel: 0.1 }, 'max')).toBe(true)
    expect(gapOk(109, 100, { rel: 0.1 }, 'max')).toBe(false)
    expect(gapOk(100, 110, { rel: 0.1 }, 'min')).toBe(true)
    expect(gapOk(-7, -4.5, { abs: 2.5 }, 'min')).toBe(true)
    expect(gapOk(-7, -4.6, { abs: 2.5 }, 'min')).toBe(false)
  })
})

describe('StatQuestionPicker — MC', () => {
  it('ответ — лидер среди вариантов с отрывом от каждого; подписи по порядку вариантов', () => {
    const b = bank({ pools: [{ entries: entries([100, 95, 90, 80, 70, 60, 50, 40]), asks: [{ ask: 'max', text: 'Кто больше?' }] }] })
    for (let seed = 1; seed <= 30; seed++) {
      const q = new StatQuestionPicker(b, seeded(seed)).pick('all')!
      const val = (name: string) => b.subcategories[0].pools[0] && (b.subcategories[0].pools[0] as any).entries.find((e: StatEntry) => e[0] === name)[1]
      expect(q.options).toHaveLength(4)
      expect(new Set(q.options).size).toBe(4)
      const lead = val(q.answer!)
      for (const o of q.options!) if (o !== q.answer) expect(lead).toBeGreaterThanOrEqual(val(o) * 1.1)
      q.options!.forEach((o, i) => expect(q.optionNotes![i]).toBe(String(val(o))))
      expect(q.comment).toBe('C')
    }
  })

  it('ask min: ответ — наименьший', () => {
    const b = bank({ gap: { abs: 2.5 }, pools: [{ entries: entries([-7, -4, -1, 0, 1, 3]), asks: [{ ask: 'min', text: 'Реже?' }] }] })
    const q = new StatQuestionPicker(b, seeded(3)).pick('kerri')!
    const vals = Object.fromEntries(entries([-7, -4, -1, 0, 1, 3]))
    const min = Math.min(...q.options!.map(o => vals[o] as unknown as number))
    expect(vals[q.answer!]).toBe(min)
  })

  it('варианты и герой вопроса исключаются из подкатегории до конца игры', () => {
    const b = bank({
      pools: [
        { subject: 'Pudge', entries: entries([100, 80, 60, 40, 20, 10, 5, 2]), asks: [{ ask: 'max', text: 'q1' }] },
        { subject: 'Lion', entries: entries([100, 80, 60, 40, 20, 10, 5, 2]), asks: [{ ask: 'max', text: 'q2' }] },
      ],
    })
    const p = new StatQuestionPicker(b, seeded(7))
    const q1 = p.pick('all')!
    const q2 = p.pick('all')!
    expect(q1.displayTopic).not.toBe(q2.displayTopic)                       // другой герой вопроса
    expect(q1.options!.some(o => q2.options!.includes(o))).toBe(false)     // ни одного общего варианта
    expect(p.pick('all')).toBeNull()                                        // 8 вариантов — ровно на 2 вопроса
  })

  it('нет четвёрки с отрывом — гейт снимается, лидер единственный', () => {
    const b = bank({ pools: [{ entries: entries([100, 99, 98, 97, 96]), asks: [{ ask: 'max', text: 'q' }] }] })
    const q = new StatQuestionPicker(b, seeded(1)).pick('all')!
    const vals = Object.fromEntries(entries([100, 99, 98, 97, 96]))
    expect(vals[q.answer!]).toBe(Math.max(...q.options!.map(o => vals[o] as unknown as number)))
  })

  it('подкатегория без 4 свободных вариантов пропускается — берётся другая', () => {
    const b: StatsBank = {
      snapshot: 't', patch: 'p',
      subcategories: [
        { id: 'small', mode: 'mc', topic: 'T', display: 'small', comment: '', weight: 100, gap: { rel: 0.1 },
          pools: [{ entries: entries([3, 2, 1]), asks: [{ ask: 'max', text: 'q' }] }] },
        { id: 'big', mode: 'mc', topic: 'T', display: 'big', comment: '', weight: 1, gap: { rel: 0.1 },
          pools: [{ entries: entries([100, 50, 25, 12]), asks: [{ ask: 'max', text: 'q' }] }] },
      ],
    }
    expect(new StatQuestionPicker(b, seeded(2)).pick('all')!.displayTopic).toBe('big')
  })
})

describe('StatQuestionPicker — несовместимые пары и ничьи', () => {
  it('компонент и его улучшение не попадают в одну четвёрку', () => {
    const b = bank({
      exclusive: [['Arcane Boots', 'Guardian Greaves'], ['Boots of Travel', 'Boots of Travel 2']],
      pools: [{ entries: [['Arcane Boots', 900, '900'], ['Guardian Greaves', 300, '300'], ['Boots of Travel', 500, '500'],
        ['Boots of Travel 2', 100, '100'], ['Phase Boots', 700, '700'], ['Power Treads', 400, '400']],
      asks: [{ ask: 'max', text: 'q' }] }],
    })
    for (let seed = 1; seed <= 60; seed++) {
      const o = new StatQuestionPicker(b, seeded(seed)).pick('all')!.options!
      expect(o.includes('Arcane Boots') && o.includes('Guardian Greaves')).toBe(false)
      expect(o.includes('Boots of Travel') && o.includes('Boots of Travel 2')).toBe(false)
    }
  })

  it('без гейта лидер отличается от второго и подписью', () => {
    const b = bank({ gap: { abs: 5 }, pools: [{ entries: [['A', 0.4983, '49.8%'], ['B', 0.4981, '49.8%'], ['C', 0.48, '48.0%'],
      ['D', 0.47, '47.0%'], ['E', 0.46, '46.0%']], asks: [{ ask: 'max', text: 'q' }] }] })
    for (let seed = 1; seed <= 30; seed++) {
      const q = new StatQuestionPicker(b, seeded(seed)).pick('all')
      if (!q) continue
      const notes = q.optionNotes!
      const top = notes[q.options!.indexOf(q.answer!)]
      expect(notes.filter(n => n === top)).toHaveLength(1)
    }
  })

  it('gapOk: ничья не проходит даже с нулевым гейтом', () => {
    expect(gapOk(5, 5, { rel: 0 }, 'max')).toBe(false)
    expect(gapOk(5, 5, {}, 'min')).toBe(false)
  })
})

describe('StatQuestionPicker — closest', () => {
  it('числовой ответ, герой не повторяется', () => {
    const b: StatsBank = {
      snapshot: 't', patch: 'p',
      subcategories: [{ id: 'c', mode: 'closest', topic: 'Баны', display: 'Баны', comment: 'c', weight: 1,
        pools: [{ subject: 'Pudge', text: 'Pudge?', answer: 59 }, { subject: 'Lion', text: 'Lion?', answer: 37 }] }],
    }
    const p = new StatQuestionPicker(b, seeded(5))
    const a = p.pick('closest')!
    const c = p.pick('closest')!
    expect([a.numericAnswer, c.numericAnswer].sort()).toEqual([37, 59])
    expect(a.options).toBeUndefined()
    expect(p.pick('closest')).toBeNull()
    expect(p.pick('all')).toBeNull()   // MC-подкатегорий нет
  })
})

describe('настоящий bank.json', () => {
  const file = path.join(__dirname, '..', '..', '..', '..', '..', 'scripts', 'data', 'stats', 'bank.json')
  const real = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as StatsBank) : null

  it.skipIf(!real)('игра из 40 вопросов каждого режима собирается без повторов и с короткими подписями', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const p = new StatQuestionPicker(real!, seeded(seed))
      const seen = new Set<string>()
      for (let i = 0; i < 40; i++) {
        for (const mode of ['all', 'kerri', 'closest'] as const) {
          const q = p.pick(mode)
          if (!q) continue
          const key = `${q.text}|${(q.options ?? []).join(',')}`
          expect(seen.has(key)).toBe(false)
          seen.add(key)
          if (mode === 'closest') {
            expect(typeof q.numericAnswer).toBe('number')
          } else {
            expect(q.options).toHaveLength(4)
            expect(new Set(q.options).size).toBe(4)
            expect(q.options).toContain(q.answer)
            expect(q.optionNotes).toHaveLength(4)
            for (const n of q.optionNotes!) expect(n.length).toBeLessThanOrEqual(8)
          }
        }
      }
    }
  })
})
