import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'
import {
  StatQuestionBuilder, gameOnlyDeck, gapOk, capOk, formatNotes, talentTreeOrder, TALENT_FIRST_SLOT_SIDE, statKinds,
  type StatsBank, type StatEntry, type DeckAccess, type StatMcPool,
} from '../statQuestions'
import type { GameMode } from '@cumsino/shared'

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

/** Одна игра: подкатегории по порядку (выбор подкатегории — дело questions/picker.ts), колода только на игру. */
function picker(b: StatsBank, rng: () => number, deck: DeckAccess = gameOnlyDeck()) {
  const builder = new StatQuestionBuilder(b, rng)
  return {
    pick(mode: GameMode) {
      for (const s of b.subcategories) {
        const q = builder.build(s, mode, deck)
        if (q) return q
      }
      return null
    },
  }
}

const entries = (vals: number[]): StatEntry[] => vals.map((v, i) => [`H${i}`, v, `${v}`])

function bank(sub: Partial<StatsBank['subcategories'][number]> & Pick<StatsBank['subcategories'][number], 'pools'>): StatsBank {
  return {
    snapshot: 'test', patch: '7.41f',
    subcategories: [{ id: 's', comment: 'C', gap: { rel: 0.1 }, ...sub }],
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

describe('StatQuestionBuilder — MC', () => {
  it('ответ — лидер среди вариантов с отрывом от каждого; подписи по порядку вариантов', () => {
    const b = bank({ pools: [{ entries: entries([100, 95, 90, 80, 70, 60, 50, 40]), asks: [{ ask: 'max', text: 'Кто больше?' }] }] })
    for (let seed = 1; seed <= 30; seed++) {
      const q = picker(b, seeded(seed)).pick('all')!
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
    const q = picker(b, seeded(3)).pick('kerri')!
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
    const p = picker(b, seeded(7))
    const q1 = p.pick('all')!
    const q2 = p.pick('all')!
    expect(q1.displayTopic).not.toBe(q2.displayTopic)                       // другой герой вопроса
    expect(q1.options!.some(o => q2.options!.includes(o))).toBe(false)     // ни одного общего варианта
    expect(p.pick('all')).toBeNull()                                        // 8 вариантов — ровно на 2 вопроса
  })

  it('нет четвёрки с отрывом — гейт снимается, лидер единственный', () => {
    const b = bank({ pools: [{ entries: entries([100, 99, 98, 97, 96]), asks: [{ ask: 'max', text: 'q' }] }] })
    const q = picker(b, seeded(1)).pick('all')!
    const vals = Object.fromEntries(entries([100, 99, 98, 97, 96]))
    expect(vals[q.answer!]).toBe(Math.max(...q.options!.map(o => vals[o] as unknown as number)))
  })

  it('подкатегория без 4 свободных вариантов пропускается — берётся другая', () => {
    const b: StatsBank = {
      snapshot: 't', patch: 'p',
      subcategories: [
        { id: 'small', comment: '', gap: { rel: 0.1 },
          pools: [{ entries: entries([3, 2, 1]), asks: [{ ask: 'max', text: 'q' }] }] },
        { id: 'big', comment: '', gap: { rel: 0.1 },
          pools: [{ entries: entries([100, 50, 25, 12]), asks: [{ ask: 'max', text: 'q' }] }] },
      ],
    }
    expect(picker(b, seeded(2)).pick('all')!.id).toMatch(/^stat:big:/)
  })
})

describe('StatQuestionBuilder — несовместимые пары и ничьи', () => {
  it('компонент и его улучшение не попадают в одну четвёрку', () => {
    const b = bank({
      exclusive: [['Arcane Boots', 'Guardian Greaves'], ['Boots of Travel', 'Boots of Travel 2']],
      pools: [{ entries: [['Arcane Boots', 900, '900'], ['Guardian Greaves', 300, '300'], ['Boots of Travel', 500, '500'],
        ['Boots of Travel 2', 100, '100'], ['Phase Boots', 700, '700'], ['Power Treads', 400, '400']],
      asks: [{ ask: 'max', text: 'q' }] }],
    })
    for (let seed = 1; seed <= 60; seed++) {
      const o = picker(b, seeded(seed)).pick('all')!.options!
      expect(o.includes('Arcane Boots') && o.includes('Guardian Greaves')).toBe(false)
      expect(o.includes('Boots of Travel') && o.includes('Boots of Travel 2')).toBe(false)
    }
  })

  it('без гейта лидер отличается от второго и подписью', () => {
    const b = bank({ gap: { abs: 5 }, pools: [{ entries: [['A', 0.4983, '49.8%'], ['B', 0.4981, '49.8%'], ['C', 0.48, '48.0%'],
      ['D', 0.47, '47.0%'], ['E', 0.46, '46.0%']], asks: [{ ask: 'max', text: 'q' }] }] })
    for (let seed = 1; seed <= 30; seed++) {
      const q = picker(b, seeded(seed)).pick('all')
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

describe('верхний предел отрыва (maxRel)', () => {
  it('capOk: max / min, без предела — всегда да', () => {
    expect(capOk(250, 100, { maxRel: 2.5 }, 'max')).toBe(true)
    expect(capOk(251, 100, { maxRel: 2.5 }, 'max')).toBe(false)
    expect(capOk(100, 300, { maxRel: 3 }, 'min')).toBe(true)
    expect(capOk(100, 301, { maxRel: 3 }, 'min')).toBe(false)
    expect(capOk(1000, 1, {}, 'max')).toBe(true)
  })

  it('лидер не дальше ×maxRel от второго места; доминирующий вариант в варианты не попадает', () => {
    // 846к — Treads у Drow: с пределом ×2.5 её не с кем сравнить, ни ответом, ни соперником она не будет
    const vals = [846, 37, 20, 15, 5, 4.4, 1.1, 0.2]
    const b = bank({ gap: { rel: 0.15, maxRel: 2.5 }, pools: [{ entries: entries(vals), asks: [{ ask: 'max', text: 'q' }] }] })
    const val = Object.fromEntries(entries(vals).map(e => [e[0], e[1]]))
    for (let seed = 1; seed <= 60; seed++) {
      const q = picker(b, seeded(seed)).pick('all')!
      const vs = q.options!.map(o => val[o]).sort((a, c) => c - a)
      expect(vs[0]).toBe(val[q.answer!])
      expect(vs[0]).toBeLessThanOrEqual(vs[1] * 2.5)
      for (const v of vs.slice(1)) expect(vs[0]).toBeGreaterThanOrEqual(v * 1.15)
      expect(q.options).not.toContain('H0')
    }
  })

  it('ask min: второе место не дальше ×maxRel от лидера', () => {
    const vals = [1, 10, 12, 15, 30, 40, 80]
    const b = bank({ gap: { rel: 0.1, maxRel: 3 }, pools: [{ entries: entries(vals), asks: [{ ask: 'min', text: 'q' }] }] })
    const val = Object.fromEntries(entries(vals).map(e => [e[0], e[1]]))
    for (let seed = 1; seed <= 40; seed++) {
      const q = picker(b, seeded(seed)).pick('all')!
      const vs = q.options!.map(o => val[o]).sort((a, c) => a - c)
      expect(vs[0]).toBe(val[q.answer!])
      expect(vs[1]).toBeLessThanOrEqual(vs[0] * 3)
    }
  })
})

describe('formatNotes — одна точность и общий суффикс в четвёрке', () => {
  it('count: суффикс и точность по максимуму', () => {
    expect(formatNotes([37.4e6, 10e6, 7.3e6, 5.7e6], 'count')).toEqual(['37.4М', '10.0М', '7.3М', '5.7М'])
    expect(formatNotes([99_400, 437, 515, 7600], 'count')).toEqual(['99.4к', '0.4к', '0.5к', '7.6к'])
    expect(formatNotes([342_000, 269_000, 216_000, 162_000], 'count')).toEqual(['342к', '269к', '216к', '162к'])
    expect(formatNotes([4500, 1000, 2300, 1600], 'count')).toEqual(['4.5к', '1.0к', '2.3к', '1.6к'])
    expect(formatNotes([118, 60.1, 96.9, 103], 'count')).toEqual(['118', '60', '97', '103'])
    expect(formatNotes([6, 6.4, 7.7, 5.1], 'count')).toEqual(['6.0', '6.4', '7.7', '5.1'])
    expect(formatNotes([61_700, 30, 7600, 308], 'count')).toEqual(['61.7к', '<0.1к', '7.6к', '0.3к'])
  })

  it('pct / pct0 / pp', () => {
    expect(formatNotes([0.535, 0.513, 0.507, 0.5], 'pct')).toEqual(['53.5%', '51.3%', '50.7%', '50.0%'])
    expect(formatNotes([0.62, 0.38, 0.78, 0.22], 'pct0')).toEqual(['62%', '38%', '78%', '22%'])
    expect(formatNotes([-2.2, 0.8, -0.04, 0.03], 'pp')).toEqual(['−2.2', '+0.8', '0.0', '0.0'])
  })

  it('подпись лидера совпала с чужой — добавляется знак', () => {
    expect(formatNotes([0.4983, 0.4981, 0.47, 0.46], 'pct', 0)).toEqual(['49.83%', '49.81%', '47.00%', '46.00%'])
    expect(formatNotes([0.4983, 0.4981, 0.47, 0.46], 'pct')).toEqual(['49.8%', '49.8%', '47.0%', '46.0%'])
  })

  it('сборщик форматирует подписи по показанной четвёрке', () => {
    const b = bank({ note: 'count', pools: [{ entries: [['A', 99_400, '99к'], ['B', 437, '437'], ['C', 7600, '7.6к'],
      ['D', 515, '515']], asks: [{ ask: 'max', text: 'q' }] }] })
    const q = picker(b, seeded(1)).pick('all')!
    const want: Record<string, string> = { A: '99.4к', B: '0.4к', C: '7.6к', D: '0.5к' }
    q.options!.forEach((o, i) => expect(q.optionNotes![i]).toBe(want[o]))
  })
})

describe('таланты — раскладка как в игре', () => {
  // пул — в порядке слотов файла героя: [20 первый, 20 второй, 25 первый, 25 второй]
  const pool: StatMcPool = {
    subject: 'Anti-Mage',
    entries: [['20 ур.: +125 к дальности Blink', 0.688, '69%'], ['20 ур.: +0.8 сек. оглушения от Mana Void', 0.312, '31%'],
      ['25 ур.: –1 сек. перезарядки Blink', 0.1714, '17%'], ['25 ур.: –50 сек. перезарядки Mana Void', 0.8286, '83%']],
    asks: [{ ask: 'max', text: 'чаще?' }, { ask: 'min', text: 'реже?' }],
  }

  it('первый слот пары — справа (сверено в игре на Anti-Mage)', () => {
    expect(TALENT_FIRST_SLOT_SIDE).toBe('right')
    expect(talentTreeOrder('right')).toEqual([3, 2, 1, 0])
    expect(talentTreeOrder('left')).toEqual([2, 3, 0, 1])
  })

  it('варианты не перемешиваются: сверху 25 (лево, право), снизу 20 (лево, право); ответ и подписи на месте', () => {
    const b = bank({ gap: { abs: 0.1 }, note: 'pct0', layout: 'talent_tree', pools: [pool] })
    for (let seed = 1; seed <= 20; seed++) {
      const q = picker(b, seeded(seed)).pick('all')!
      expect(q.options).toEqual(['25 ур.: –50 сек. перезарядки Mana Void', '25 ур.: –1 сек. перезарядки Blink',
        '20 ур.: +0.8 сек. оглушения от Mana Void', '20 ур.: +125 к дальности Blink'])
      expect(q.optionNotes).toEqual(['83%', '17%', '31%', '69%'])
      expect(q.answer).toBe(q.text === 'чаще?' ? '25 ур.: –50 сек. перезарядки Mana Void' : '25 ур.: –1 сек. перезарядки Blink')
    }
  })
})

describe('StatQuestionBuilder — closest', () => {
  it('числовой ответ, герой не повторяется; единица — из подкатегории, тема — герой', () => {
    const b: StatsBank = {
      snapshot: 't', patch: 'p',
      subcategories: [{ id: 'c', comment: 'c', pools: [], closest: { unit: '%',
        pools: [{ subject: 'Pudge', text: 'Pudge?', answer: 59 }, { subject: 'Lion', text: 'Lion?', answer: 37 }] } }],
    }
    expect(statKinds(b.subcategories[0])).toEqual(['closest'])
    const p = picker(b, seeded(5))
    const a = p.pick('closest')!
    const c = p.pick('closest')!
    expect([a.numericAnswer, c.numericAnswer].sort()).toEqual([37, 59])
    expect(a.options).toBeUndefined()
    expect(a.unit).toBe('%')
    expect(a.displayTopic).toBe(a.text.slice(0, -1))
    expect(a.id).toBe(`stat:c:${a.displayTopic}`)
    expect(p.pick('closest')).toBeNull()
    expect(p.pick('all')).toBeNull()   // MC-пулов нет
  })

  it('без единицы — поля unit нет; свой комментарий главнее MC', () => {
    const b: StatsBank = { snapshot: 't', patch: 'p', subcategories: [{ id: 'k', comment: 'mc', pools: [],
      closest: { comment: 'near', pools: [{ subject: 'Ursa', text: 'Ursa?', answer: 10.4 }] } }] }
    const q = picker(b, seeded(1)).pick('closest')!
    expect(q.numericAnswer).toBe(10.4)
    expect('unit' in q).toBe(false)
    expect(q.comment).toBe('near')
  })

  it('одна подкатегория — и MC, и closest: общий «использованный» список героев', () => {
    const b = bank({
      pools: [{ entries: entries([100, 80, 60, 40]), asks: [{ ask: 'max', text: 'Кто больше?' }] }],
      closest: { unit: 'урона', pools: ['H0', 'H1', 'H2', 'H3', 'H4'].map((h, i) => ({ subject: h, text: `${h}?`, answer: i })) },
    })
    expect(statKinds(b.subcategories[0])).toEqual(['mc', 'closest'])
    const p = picker(b, seeded(4))
    const mc = p.pick('all')!
    expect(mc.options).toHaveLength(4)
    const near = p.pick('closest')!
    expect(near.displayTopic).toBe('H4')                // H0…H3 уже были вариантами
    expect(near.comment).toBe('C')                      // комментарий MC, если своего нет
    expect(p.pick('closest')).toBeNull()
  })

  it('несколько пулов у героя: сначала герой, потом пул — герой с 8 пулами не выпадает чаще', () => {
    const pools = [
      ...Array.from({ length: 8 }, (_, i) => ({ subject: 'Axe', text: `Axe ${i}?`, answer: i })),
      { subject: 'Lion', text: 'Lion?', answer: 50 },
    ]
    const b: StatsBank = { snapshot: 't', patch: 'p', subcategories: [{ id: 'ih', comment: '', pools: [], closest: { pools } }] }
    let axe = 0
    const N = 2000
    for (let seed = 1; seed <= N; seed++) if (picker(b, seeded(seed)).pick('closest')!.displayTopic === 'Axe') axe++
    expect(axe / N).toBeGreaterThan(0.45)
    expect(axe / N).toBeLessThan(0.55)
    const p = picker(b, seeded(9))
    const first = p.pick('closest')!
    const second = p.pick('closest')!
    expect(new Set([first.displayTopic, second.displayTopic])).toEqual(new Set(['Axe', 'Lion']))   // герой — раз за игру
    expect(p.pick('closest')).toBeNull()
  })
})

describe('StatQuestionBuilder — topLead (ботинки)', () => {
  const boots = (hero: string, vals: Array<[string, number]>): StatMcPool =>
    ({ subject: hero, entries: vals.map(([n, v]) => [n, v, `${v}`]), asks: [{ ask: 'max', text: `Ботинки ${hero}?` }] })

  it('ответ — лидер пула; варианты (ботинки) между героями повторяются, исключается только герой', () => {
    const b = bank({ topLead: true, gap: { rel: 0.1, maxRel: 2.5 }, note: 'pct', pools: [
      boots('Dark Willow', [['Tranquil Boots', 0.47], ['Arcane Boots', 0.38], ['Power Treads', 0.06], ['Boots of Travel', 0.03]]),
      boots('Tusk', [['Tranquil Boots', 0.40], ['Phase Boots', 0.28], ['Arcane Boots', 0.22], ['Power Treads', 0.04]]),
      boots('Earthshaker', [['Arcane Boots', 0.44], ['Power Treads', 0.25], ['Boots of Travel', 0.14], ['Phase Boots', 0.12]]),
    ] })
    for (let seed = 1; seed <= 20; seed++) {
      const p = picker(b, seeded(seed))
      const qs = [p.pick('all')!, p.pick('all')!, p.pick('all')!]
      expect(p.pick('all')).toBeNull()                       // герои кончились
      const answers = Object.fromEntries(qs.map(q => [q.displayTopic, q.answer]))
      expect(answers).toEqual({
        'Dark Willow': 'Tranquil Boots', 'Tusk': 'Tranquil Boots', 'Earthshaker': 'Arcane Boots',
      })
      for (const q of qs) expect(q.optionNotes![q.options!.indexOf(q.answer!)]).toMatch(/^4\d\.0%$/)
    }
  })

  it('лидер в вариантах, даже когда без него четвёрка проходит гейт (Drow: Treads ×22 от второго)', () => {
    const b = bank({ topLead: true, gap: { rel: 0.1, maxRel: 1.5 }, pools: [
      boots('Drow Ranger', [['Power Treads', 945], ['Boots of Travel', 42], ['Boots of Travel 2', 6], ['Phase Boots', 5],
        ['Tranquil Boots', 2], ['Arcane Boots', 1]]),
    ] })
    for (let seed = 1; seed <= 10; seed++) expect(picker(b, seeded(seed)).pick('all')!.answer).toBe('Power Treads')
  })
})

describe('настоящий bank.json', () => {
  const file = path.join(__dirname, '..', '..', '..', '..', '..', 'scripts', 'data', 'stats', 'bank.json')
  const real = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as StatsBank) : null

  it.skipIf(!real)('игра из 40 вопросов каждого режима собирается без повторов и с короткими подписями', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const p = picker(real!, seeded(seed))
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
            for (const n of q.optionNotes!) expect(n.length).toBeLessThanOrEqual(6)
          }
        }
      }
    }
  })

  it.skipIf(!real)('предел отрыва: ботинки ×2.5, предметы ×3 — у каждой собранной четвёрки', () => {
    for (const [id, cap] of [['boots_hero', 2.5], ['items_hero', 3], ['items', 3]] as const) {
      const sub = real!.subcategories.find(s => s.id === id)!
      expect(sub.gap?.maxRel).toBe(cap)
      for (let seed = 1; seed <= 40; seed++) {
        const q = new StatQuestionBuilder(real!, seeded(seed)).build(sub, 'all', gameOnlyDeck())!
        const pool = sub.pools.find(p => !p.subject || q.displayTopic === p.subject)!
        const val = Object.fromEntries(pool.entries.map(e => [e[0], e[1]]))
        const vs = q.options!.map(o => val[o]).sort((a, c) => c - a)
        expect(vs[0]).toBe(val[q.answer!])
        expect(vs[0]).toBeLessThanOrEqual(vs[1] * cap + 1e-6)
      }
    }
  })

  it.skipIf(!real)('ботинки: ответ — самые популярные ботинки героя, второе место ×1.1…×2.5, подписи в %', () => {
    const sub = real!.subcategories.find(s => s.id === 'boots_hero')!
    expect(sub.topLead).toBe(true)
    expect(sub.note).toBe('pct')
    expect(sub.pools.length).toBeGreaterThanOrEqual(20)
    for (const pool of sub.pools) {
      const vs = pool.entries.map(e => e[1])
      expect(vs).toHaveLength(4)
      expect([...vs].sort((a, c) => c - a)).toEqual(vs)       // по убыванию: [0] — лидер героя
      expect(vs[0] / vs[1]).toBeGreaterThanOrEqual(1.1 - 1e-9)
      expect(vs[0] / vs[1]).toBeLessThanOrEqual(2.5 + 1e-9)
    }
    const builder = new StatQuestionBuilder(real!, seeded(3))
    const deck = gameOnlyDeck()
    const heroes = new Set<string>()
    for (let i = 0; i < sub.pools.length; i++) {
      const q = builder.build(sub, 'all', deck)!
      const pool = sub.pools.find(p => q.displayTopic === p.subject)!
      heroes.add(pool.subject!)
      expect(q.answer).toBe(pool.entries[0][0])
      expect([...q.options!].sort()).toEqual(pool.entries.map(e => e[0]).sort())
      for (const n of q.optionNotes!) expect(n).toMatch(/^\d+\.\d%$/)
    }
    expect(heroes.size).toBe(sub.pools.length)                // за одну игру — все герои, ботинки не кончаются
  })

  it.skipIf(!real)('«кто ближе» средних: убийства с точностью 0.1, остальное целое; единицы; без самолечения', () => {
    const want: Record<string, { unit?: string; n: number }> = {
      avg_kills: { n: 127 }, avg_cs: { n: 127 }, avg_hero_damage: { unit: 'урона', n: 127 },
      avg_tower: { unit: 'урона', n: 127 }, avg_heal_allies: { unit: 'HP', n: 20 },
    }
    for (const [id, w] of Object.entries(want)) {
      const sub = real!.subcategories.find(s => s.id === id)!
      expect(statKinds(sub)).toEqual(['mc', 'closest'])
      expect(sub.closest!.unit).toBe(w.unit)
      expect(sub.closest!.pools).toHaveLength(w.n)
      for (const p of sub.closest!.pools) {
        const digits = id === 'avg_kills' ? 1 : 0
        expect(Math.round(p.answer * 10 ** digits) / 10 ** digits).toBe(p.answer)
        expect(p.text).toContain(p.subject)
      }
    }
    expect(real!.subcategories.find(s => s.id === 'avg_heal_self')!.closest).toBeUndefined()
  })

  it.skipIf(!real)('«кто ближе» предметов: доля 5…95%, целые, без ботинок; на герое — те же предметы, что в MC', () => {
    for (const id of ['items', 'items_hero']) {
      const sub = real!.subcategories.find(s => s.id === id)!
      expect(sub.closest!.unit).toBe('%')
      expect(sub.closest!.pools.length).toBeGreaterThan(id === 'items' ? 5 : 300)
      for (const p of sub.closest!.pools) {
        expect(Number.isInteger(p.answer)).toBe(true)
        expect(p.answer).toBeGreaterThanOrEqual(5)
        expect(p.answer).toBeLessThanOrEqual(95)
      }
    }
    const ih = real!.subcategories.find(s => s.id === 'items_hero')!
    for (const p of ih.closest!.pools) {
      const mc = ih.pools.find(x => x.subject === p.subject)   // MC-пул героя мог не пройти гейт — closest остаётся
      if (mc) expect(mc.entries.some(e => p.text.includes(` покупают ${e[0]} `))).toBe(true)
    }
    expect(real!.subcategories.find(s => s.id === 'boots_hero')!.closest).toBeUndefined()
  })

  it.skipIf(!real)('таланты: в банке layout talent_tree, сверху 25 уровень, снизу 20', () => {
    const sub = real!.subcategories.find(s => s.id === 'talents')!
    expect(sub.layout).toBe('talent_tree')
    const q = new StatQuestionBuilder(real!, seeded(1)).build(sub, 'all', gameOnlyDeck())!
    expect(q.options!.map(o => o.slice(0, 2))).toEqual(['25', '25', '20', '20'])
  })
})
