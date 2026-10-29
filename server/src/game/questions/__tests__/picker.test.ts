import { describe, it, expect } from 'vitest'
import { RoomQuestions, shuffleOptions, drawFromDeck, relativeMultipliers, ratingScore } from '../picker'
import { buildLibrary, loadLibrary, type BankQuestion } from '../library'
import { QuestionHistory } from '../history'
import { smoothOrder, commitChoice } from '../smooth'
import { makeStepOptions, formatNumber } from '../stepOptions'
import { gameOnlyDeck, type StatsBank } from '../../stats/statQuestions'
import type { CategoryDef } from '../categories'
import { FriendsGen, FRIEND_KINDS, selfWrStep, wrOptions } from '../friends'

function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const num = (id: string, sub: string, answer = 10): BankQuestion =>
  ({ id, sub, kind: 'number', text: `${id}?`, topic: 'T', answer, step: 2, unit: 'ед.' })
const choice = (id: string, sub: string): BankQuestion =>
  ({ id, sub, kind: 'choice', text: `${id}?`, topic: 'T', options: [`${id}-ok`, 'b', 'c', 'd'] })

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

describe('makeStepOptions', () => {
  it('соседи через один или два шага (50 / 50), все > 0, правильный на случайной позиции', () => {
    const positions = new Set<number>()
    const gaps = { 1: 0, 2: 0 }
    for (let seed = 1; seed <= 400; seed++) {
      const { values, correct } = makeStepOptions(3.2, 0.4, seeded(seed))
      expect(values[correct]).toBe(3.2)
      for (let i = 1; i < 4; i++) {
        const g = Math.round((values[i] - values[i - 1]) / 0.4)
        expect([1, 2]).toContain(g)
        expect(values[i] - values[i - 1]).toBeCloseTo(0.4 * g, 9)
        gaps[g as 1 | 2]++
      }
      expect(values[0]).toBeGreaterThan(0)
      positions.add(correct)
    }
    expect(positions.size).toBe(4)
    expect(gaps[1] / (gaps[1] + gaps[2])).toBeGreaterThan(0.4)
    expect(gaps[1] / (gaps[1] + gaps[2])).toBeLessThan(0.6)
  })

  it('верхняя граница: варианты строго ниже ceil', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { values } = makeStepOptions(97, 5, seeded(seed), 4, 0, 100)
      expect(Math.max(...values)).toBeLessThan(100)
      expect(values).toContain(97)
    }
  })

  it('маленький ответ: варианты не уходят в ноль', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { values, correct } = makeStepOptions(2, 1, seeded(seed))
      expect(values[0]).toBeGreaterThan(0)
      expect(correct).toBe(values.indexOf(2))
    }
  })

  it('formatNumber без хвостов плавающей точки', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
    expect(formatNumber(850)).toBe('850')
  })
})

describe('сглаженный выбор', () => {
  it('доли — по весам, серии короче, чем у чистого рандома', () => {
    const items = [{ key: 'a', weight: 3 }, { key: 'b', weight: 2 }, { key: 'c', weight: 1 }]
    const run = (lambda: number) => {
      const rng = seeded(11)
      const credits = new Map<string, number>()
      const counts: Record<string, number> = { a: 0, b: 0, c: 0 }
      let longestC = 0, sinceC = 0
      for (let i = 0; i < 6000; i++) {
        const k = smoothOrder(items, credits, rng, lambda)[0]
        commitChoice(items, k, credits)
        counts[k]++
        sinceC = k === 'c' ? 0 : sinceC + 1
        longestC = Math.max(longestC, sinceC)
      }
      return { counts, longestC }
    }
    const smooth = run(1.5)
    expect(Math.abs(smooth.counts.a - 3000)).toBeLessThan(15)
    expect(Math.abs(smooth.counts.c - 1000)).toBeLessThan(15)
    const random = run(0)
    expect(smooth.longestC).toBeLessThan(random.longestC)   // «c» не пропадает надолго
  })
})

describe('колода', () => {
  const cats: CategoryDef[] = [{ id: 'cat', title: 'Кат', weight: 1, subs: [{ id: 's', title: 'Под' }] }]
  const five = ['q1', 'q2', 'q3', 'q4', 'q5'].map(id => num(id, 's'))

  it('между играми: все вопросы по кругу, только потом повторы; в игре — никогда', () => {
    const lib = buildLibrary({ bank: five, stats: null, friends: null, categories: cats })
    const history = new QuestionHistory()
    const shown: string[] = []
    for (let game = 0; game < 4; game++) {
      const room = new RoomQuestions(lib, history, seeded(game + 1))
      const inGame = [room.pick('closest').id, room.pick('closest').id]
      expect(new Set(inGame).size).toBe(2)
      shown.push(...inGame)
    }
    expect(new Set(shown.slice(0, 5)).size).toBe(5)   // первые 5 показов — все пять вопросов
    // после круга вопросы этой и прошлой игры заблокированы: игра 3 (q5 + первый нового круга) ≠ игра 2
    expect(shown.slice(6, 8).some(id => shown.slice(4, 6).includes(id))).toBe(false)
  })

  it('режим — первый фильтр: в «ближе всех» только числовые', () => {
    const lib = buildLibrary({
      bank: [num('n1', 'nums'), choice('c1', 'texts'), choice('c2', 'texts')], stats: null, friends: null,
      categories: [{ id: 'a', title: 'A', weight: 1, subs: [{ id: 'nums', title: 'N' }] },
        { id: 'b', title: 'B', weight: 100, subs: [{ id: 'texts', title: 'T' }] }],
    })
    const room = new RoomQuestions(lib, new QuestionHistory(), seeded(3))
    const q = room.pick('closest')
    expect(q.id).toBe('n1')
    expect(q.numericAnswer).toBe(10)
    expect(q.options).toBeUndefined()
    const mc = room.pick('all')   // числовой уже был — остаётся текст
    expect(mc.category).toBe('b')
    expect(mc.options).toContain(mc.answer)
  })

  it('числовой вопрос в MC: варианты по шагу с единицей, правильный среди них', () => {
    const lib = buildLibrary({ bank: [num('n', 's', 850)], stats: null, friends: null, categories: cats })
    const q = new RoomQuestions(lib, new QuestionHistory(), seeded(5)).pick('kerri')
    expect(q.mode).toBe('kerri')
    expect(q.options).toHaveLength(4)
    expect(q.options).toContain('850 ед.')
    expect(q.options!.every(o => o.endsWith(' ед.'))).toBe(true)
    expect(q.answer).toBe('850 ед.')
    expect(q.unit).toBe('ед.')
    expect(q.subcategory).toBe('s')
  })

  it('числовой вопрос в «ближе всех»: число без единицы, единица отдельным полем', () => {
    const lib = buildLibrary({ bank: [num('n', 's', 850)], stats: null, friends: null, categories: cats })
    const q = new RoomQuestions(lib, new QuestionHistory(), seeded(5)).pick('closest')
    expect(q.numericAnswer).toBe(850)
    expect(q.unit).toBe('ед.')
  })

  it('«удалить» — только когда нажали больше половины комнаты; потом вопрос не выпадает никогда', () => {
    const lib = buildLibrary({ bank: five, stats: null, friends: null, categories: cats })
    const history = new QuestionHistory()
    const room = new RoomQuestions(lib, history, seeded(1))
    const q = room.pick('closest')
    room.report(q, { roomPlayers: 4, players: 4, answered: 4, correct: 1 })
    room.rate(q, 'A', { score: -2 })
    room.rate(q, 'B', { score: -2 })
    expect(history.archived.has(q.id)).toBe(false)   // 2 из 4 — не больше половины
    room.rate(q, 'C', { score: -2 })
    expect(history.archived.has(q.id)).toBe(true)
    for (let game = 0; game < 10; game++) {
      const r = new RoomQuestions(lib, history, seeded(game + 10))
      for (let i = 0; i < 2; i++) expect(r.pick('closest').id).not.toBe(q.id)
    }
  })

  it('drawFromDeck: ничего свободного — null', () => {
    const deck = gameOnlyDeck()
    deck.take('a')
    expect(drawFromDeck(['a'], x => x, deck, seeded(1), () => ({ id: 'a', mode: 'all', topic: '', text: '' }))).toBeNull()
  })

  it('drawFromDeck с группами: группа выпадает поровну, сколько бы карточек у неё ни было', () => {
    // у A 10 карточек, у B одна: без групп B выпадал бы в 1/11 случаев
    const cards = [...Array.from({ length: 10 }, (_, i) => `A${i}`), 'B0']
    let b = 0
    for (let seed = 1; seed <= 400; seed++) {
      const q = drawFromDeck(cards, x => x, gameOnlyDeck(), seeded(seed), x => ({ id: x, mode: 'all', topic: '', text: '' }),
        x => x[0])
      if (q!.id === 'B0') b++
    }
    expect(b / 400).toBeGreaterThan(0.4)
    expect(b / 400).toBeLessThan(0.6)
  })

  it('drawFromDeck с группами: у группы нет свежих — берётся другая', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const deck = gameOnlyDeck()
      deck.take('B0')
      const q = drawFromDeck(['A0', 'B0'], x => x, deck, seeded(seed), x => ({ id: x, mode: 'all', topic: '', text: '' }), x => x[0])
      expect(q!.id).toBe('A0')
    }
  })
})

describe('веса по типу раунда', () => {
  it('вес closest у категории и подкатегории — свой, у MC — базовый', () => {
    const cats: CategoryDef[] = [
      { id: 'a', title: 'A', weight: 1, closest: 3, subs: [{ id: 'a1', title: 'a1', closest: 2 }, { id: 'a2', title: 'a2' }] },
      { id: 'b', title: 'B', weight: 1, subs: [{ id: 'b1', title: 'b1' }] },
    ]
    const bank = ['a1', 'a2', 'b1'].flatMap(sub => Array.from({ length: 40 }, (_, i) => num(`${sub}-${i}`, sub)))
    const lib = buildLibrary({ bank, stats: null, friends: null, categories: cats })
    expect(lib.categories[0].weights).toEqual({ mc: 1, closest: 3 })
    expect(lib.categories[0].subs[0].weights).toEqual({ mc: 1, closest: 2 })
    const count = (mode: 'all' | 'closest') => {
      const history = new QuestionHistory()
      const n = new Map<string, number>()
      let room = new RoomQuestions(lib, history, seeded(3))
      for (let i = 0; i < 1200; i++) {
        if (i % 20 === 0) room = new RoomQuestions(lib, history, seeded(50 + i))
        const s = room.pick(mode).subcategory!
        n.set(s, (n.get(s) ?? 0) + 1)
      }
      return (s: string) => (n.get(s) ?? 0) / 1200
    }
    const near = count('closest')
    expect(near('a1')).toBeCloseTo(0.75 * 2 / 3, 1)   // категория 3 из 4, внутри 2 из 3
    expect(near('b1')).toBeCloseTo(0.25, 1)
    const mc = count('all')
    expect(mc('a1')).toBeCloseTo(0.25, 1)
    expect(mc('b1')).toBeCloseTo(0.5, 1)
  })

  it('categories.ts: механики 1.5, «Таланты героя» 1.5; пики MC 1 / 0.5 / 0.5; цены в closest 2', () => {
    const lib = loadLibrary()
    const cat = (id: string) => lib.categories.find(c => c.id === id)!
    const sub = (id: string) => lib.categories.flatMap(c => c.subs).find(s => s.id === id)!
    expect(cat('mechanics').weights.mc).toBe(1.5)
    expect(sub('talents_has').weights.mc).toBe(1.5)
    expect(sub('mech_how').weights.mc).toBe(1)
    expect([sub('hero_pick'), sub('hero_pick_year'), sub('hero_pick_all')].map(s => s.weights.mc)).toEqual([1, 0.5, 0.5])
    expect([sub('costs'), sub('item_numbers'), sub('neutrals')].map(s => s.weights)).toEqual([
      { mc: 1, closest: 2 }, { mc: 1, closest: 1 }, { mc: 1, closest: 1 }])
    // новые closest — в тех же подкатегориях, что и MC
    for (const id of ['avg_kills', 'avg_cs', 'avg_hero_damage', 'avg_tower', 'avg_heal_allies', 'items', 'items_hero']) {
      expect([...sub(id).kinds].sort()).toEqual(['closest', 'mc'])
    }
    expect([...sub('avg_heal_self').kinds]).toEqual(['mc'])
    expect([...sub('boots_hero').kinds]).toEqual(['mc'])
  })
})

describe('тема: «субъект\\nаспект»', () => {
  const cats: CategoryDef[] = [
    { id: 'h', title: 'H', weight: 1, subs: [{ id: 'hero_damage', title: 'Урон', aspect: 'способности' }] },
    { id: 'i', title: 'I', weight: 1, subs: [{ id: 'costs', title: 'Цены' }, { id: 'neutrals', title: 'N', aspect: 'нейтралка' }] },
  ]
  const pickOne = (bank: BankQuestion[], categories = cats, stats: StatsBank | null = null, mode: 'all' | 'closest' = 'all') =>
    new RoomQuestions(buildLibrary({ bank, stats, friends: null, categories }), new QuestionHistory(), seeded(1)).pick(mode)

  it('банк: субъект — topic вопроса, аспект — подкатегории; у предметов аспекта нет; topic — заголовок', () => {
    const q = pickOne([{ ...num('n', 'hero_damage'), topic: 'Lion' }])
    expect(q.displayTopic).toBe('Lion\nспособности')
    expect(q.topic).toBe('Урон')
    expect('aspect' in q).toBe(false)
    expect(pickOne([{ ...num('c', 'costs'), topic: 'Heart of Tarrasque' }]).displayTopic).toBe('Heart of Tarrasque')
  })

  it('аспект вопроса банка главнее подкатегории (чары)', () => {
    expect(pickOne([{ ...num('g', 'neutrals'), topic: 'Greedy', aspect: 'чара' }]).displayTopic).toBe('Greedy\nчара')
    expect(pickOne([{ ...num('f', 'neutrals'), topic: 'Fallen Sky' }]).displayTopic).toBe('Fallen Sky\nнейтралка')
  })

  it('статистика: постоянный субъект подкатегории главнее героя вопроса (в closest герой не раскрывается)', () => {
    const stats: StatsBank = { snapshot: 't', patch: 'p', subcategories: [
      { id: 'kills', comment: '', gap: { rel: 0.1 }, pools: [{ entries: [['A', 10, ''], ['B', 5, ''], ['C', 3, ''], ['D', 1, '']],
        asks: [{ ask: 'max', text: 'Кто?' }] }], closest: { pools: [{ subject: 'Ursa', text: 'Ursa?', answer: 10.4 }] } },
      { id: 'counter', comment: '', gap: { abs: 1 }, pools: [{ subject: 'Anti-Mage', entries: [['A', 5, ''], ['B', 1, ''], ['C', 0, ''], ['D', -1, '']],
        asks: [{ ask: 'max', text: 'Против кого?' }] }] },
    ] }
    const statCats: CategoryDef[] = [
      { id: 'avg', title: 'Средние', weight: 1, subs: [{ id: 'kills', title: 'Убийства', subject: 'Герои', aspect: 'убийства' }] },
    ]
    expect(pickOne([], statCats, stats).displayTopic).toBe('Герои\nубийства')
    expect(pickOne([], statCats, stats, 'closest').displayTopic).toBe('Герои\nубийства')
    const meta: CategoryDef[] = [{ id: 'meta', title: 'Мета', weight: 1, subs: [{ id: 'counter', title: 'Контрпики', aspect: 'контрпики' }] }]
    expect(pickOne([], meta, stats).displayTopic).toBe('Anti-Mage\nконтрпики')
  })

  it('настоящий банк: у каждой подкатегории тема из 1–2 строк, без патча, аспект строчными', () => {
    const lib = loadLibrary()
    const history = new QuestionHistory()
    const seen = new Map<string, string>()
    for (let game = 0; game < 6; game++) {
      const room = new RoomQuestions(lib, history, seeded(game + 7))
      for (let r = 0; r < 30; r++) {
        const mode = (['all', 'kerri', 'closest'] as const)[r % 3]
        const q = room.pick(mode, { friends: [1101588971, 910030283, 841374410] })
        const lines = q.displayTopic!.split('\n')
        expect(lines.length).toBeLessThanOrEqual(2)
        expect(lines[0].length).toBeGreaterThan(0)
        expect(q.displayTopic).not.toMatch(/7\.\d|Цена|:/)
        if (lines[1]) expect(lines[1]).toBe(lines[1].toLowerCase())
        seen.set(q.subcategory!, q.displayTopic!)
      }
    }
    if (seen.has('costs')) expect(seen.get('costs')).not.toContain('\n')
    if (seen.has('hero_pick_closest')) expect(seen.get('hero_pick_closest')).toBe('Герои\nпики')
  })
})

describe('оценки', () => {
  const show = { questionId: 'q', category: 'c', sub: 's', mode: 'all', gameNo: 1, roomPlayers: 6, players: 6, answered: 6, correct: 3 }
  const vote = { questionId: 'q', category: 'c', sub: 's', gameNo: 1 }

  it('точка — показ, значение — средняя оценка команды (не нажал = «нормально»)', () => {
    const history = new QuestionHistory()
    history.showing(show)
    history.rate({ ...vote, player: 'A', score: 2 })
    history.rate({ ...vote, player: 'B', score: 1 })
    expect(history.ratingOf('sub:s')).toEqual({ n: 1, sum: 0.5 })   // (2 + 1) / 6 игроков
    history.rate({ ...vote, player: 'A', score: -1 })                   // переоценка заменяет
    expect(history.ratingOf('cat:c').sum).toBeCloseTo(0)
    history.rate({ ...vote, player: 'C', difficulty: 1 })               // только сложность — оценка не меняется
    expect(history.ratingOf('cat:c').sum).toBeCloseTo(0)
  })

  const total = (items: Array<{ key: string; weight: number }>, m: Map<string, number>) =>
    items.reduce((s, i) => s + i.weight * m.get(i.key)!, 0)

  it('множители относительные: всем одинаково хорошо — веса базовые; сумма весов не меняется; пределы ×0.5…×2', () => {
    const items = [{ key: 'a', weight: 1 }, { key: 'b', weight: 2 }, { key: 'c', weight: 1 }]
    const same = relativeMultipliers(items, () => 1.5)
    for (const m of same.values()) expect(m).toBeCloseTo(1)
    const scores: Record<string, number> = { a: 2, b: 0, c: -2 }
    const m = relativeMultipliers(items, k => scores[k])
    expect(m.get('a')!).toBeGreaterThan(1)
    expect(m.get('c')!).toBeLessThan(1)
    expect(total(items, m)).toBeCloseTo(4)
    const many = [{ key: 'x', weight: 1 }, ...Array.from({ length: 5 }, (_, i) => ({ key: `n${i}`, weight: 1 }))]
    const top = relativeMultipliers(many, k => (k === 'x' ? 20 : 0))
    expect(top.get('x')).toBeCloseTo(2, 6)               // упёрся в потолок, остальные делят остаток
    expect(top.get('n0')).toBeCloseTo(0.8, 6)
    // двое соседей: ×2 и ×0.5 одновременно невозможны (сумма весов сохраняется) — 75% / 25%
    const pair = relativeMultipliers([{ key: 'x', weight: 1 }, { key: 'y', weight: 1 }], k => (k === 'x' ? 20 : -20))
    expect(pair.get('x')).toBeCloseTo(1.5, 6)
    expect(pair.get('y')).toBeCloseTo(0.5, 6)
  })

  it('предел произведения: у подкатегории пределы [0.5 / c, 2 / c], c — множитель категории', () => {
    const subs = [{ key: 'h', weight: 1 }, { key: 'o', weight: 1 }, { key: 'p', weight: 1 }]
    const hot = relativeMultipliers(subs, k => (k === 'h' ? 20 : 0), 2)        // категория уже ×2
    expect(hot.get('h')).toBeCloseTo(1, 6)                                       // выше базовой доли не растёт
    expect(total(subs, hot)).toBeCloseTo(3)
    const cold = relativeMultipliers(subs, k => (k === 'h' ? -20 : 0), 0.5)     // категория ×0.5
    expect(cold.get('h')).toBeCloseTo(1, 6)                                      // ниже ×0.5 не падает
    const mid = relativeMultipliers(subs, k => (k === 'h' ? 20 : 0), 1.25)
    expect(1.25 * mid.get('h')!).toBeCloseTo(2, 6)
    expect(total(subs, mid)).toBeCloseTo(3)
  })

  it('доля подкатегории в игре — не больше ×2 от базовой, даже если любимы и она, и её категория', () => {
    const cats: CategoryDef[] = [
      { id: 'hot', title: 'H', weight: 1, subs: [{ id: 'h1', title: 'h1' }, { id: 'h2', title: 'h2' }] },
      { id: 'cold', title: 'C', weight: 1, subs: [{ id: 'c1', title: 'c1' }, { id: 'c2', title: 'c2' }] },
    ]
    const bank = cats.flatMap(c => c.subs.flatMap(sd => Array.from({ length: 40 }, (_, i) => num(`${sd.id}-${i}`, sd.id))))
    const lib = buildLibrary({ bank, stats: null, friends: null, categories: cats })
    const history = new QuestionHistory()
    for (let g = 1; g <= 30; g++) {
      history.showing({ questionId: `x${g}`, category: 'hot', sub: 'h1', mode: 'all', gameNo: g, roomPlayers: 1, players: 1, answered: 1, correct: 1 })
      history.rate({ questionId: `x${g}`, category: 'hot', sub: 'h1', gameNo: g, player: 'A', score: 2 })
    }
    // по отдельности: категория ×1.5 (соседка не ниже ×0.5), подкатегория ×1.5 — вместе было бы ×2.25
    const shown = new Map<string, number>()
    const N = 4000
    let room = new RoomQuestions(lib, history, seeded(11))
    for (let i = 0; i < N; i++) {
      if (i % 20 === 0) room = new RoomQuestions(lib, history, seeded(100 + i))
      const q = room.pick('all')
      shown.set(q.subcategory!, (shown.get(q.subcategory!) ?? 0) + 1)
    }
    const share = shown.get('h1')! / N
    expect(share).toBeGreaterThan(0.47)
    expect(share).toBeLessThan(0.53)   // база 0.25 → ровно ×2
    expect(shown.get('h2')! / N).toBeCloseTo(0.25, 1)
  })

  it('50 голосов «ахуенный» в компании из 6 → ≈ ×2.4 против нейтральных соседей; ×1.5 — с 12 голосов', () => {
    const ratio = (questions: number) => {
      const history = new QuestionHistory()
      for (let g = 1; g <= questions; g++) {
        const sh = { questionId: `q${g}`, category: 'c', sub: 'hot', mode: 'all', gameNo: g, roomPlayers: 6, players: 6, answered: 6, correct: 3 }
        history.showing(sh)
        for (const p of ['A', 'B', 'C', 'D', 'E', 'F']) history.rate({ questionId: `q${g}`, category: 'c', sub: 'hot', gameNo: g, player: p, score: 2 })
      }
      const neutral = { n: 9, sum: 0 }
      const m = relativeMultipliers([{ key: 'hot', weight: 1 }, ...Array.from({ length: 6 }, (_, i) => ({ key: `n${i}`, weight: 1 }))],
        k => ratingScore(k === 'hot' ? history.ratingOf('sub:hot') : neutral))
      return m.get('hot')! / m.get('n0')!
    }
    expect(ratio(8)).toBeGreaterThan(2.2)    // 48 голосов
    expect(ratio(8)).toBeLessThan(2.6)
    expect(ratio(2)).toBeGreaterThan(1.4)    // 12 голосов
    expect(ratio(2)).toBeLessThan(1.6)
  })

  it('фора — пять показов: пара показов сдвигает слабо, сотня — почти полностью', () => {
    expect(ratingScore({ n: 2, sum: 2 })).toBeCloseTo(2 / 7)
    expect(ratingScore({ n: 100, sum: 100 })).toBeCloseTo(100 / 105)
  })
})

describe('друзья', () => {
  const metrics = {
    people: { 1: { name: 'Аня', open: true }, 2: { name: 'Боря', open: true }, 3: { name: 'Вова', open: false } },
    heroes: {
      ranked: {
        1: { own: { 10: [200, 110], 11: [100, 40], 12: [60, 40], 13: [40, 20], 14: [35, 10] }, company: {} },
        2: { own: { 10: [80, 40], 20: [300, 160], 21: [100, 50], 22: [50, 25], 23: [30, 15] }, company: {} },
        3: { own: {}, company: { 30: [90, 50] } },
      },
      turbo: { 1: { own: {}, company: {} }, 2: { own: {}, company: {} }, 3: { own: {}, company: {} } },
    },
    pairs: { ranked: { '1-2': 120, '1-3': 300, '2-3': 60 }, turbo: {} },
  } as any
  const cats: CategoryDef[] = [
    { id: 'base', title: 'База', weight: 1, subs: [{ id: 's', title: 'S' }] },
    { id: 'friends', title: 'Друзья', weight: 1000, requires: 'friends', subs: [
      { id: 'friends_hero_main', title: 'Мейн' }, { id: 'friends_pair_games', title: 'Вместе' }] },
  ]
  const lib = buildLibrary({
    bank: Array.from({ length: 30 }, (_, i) => num(`q${i}`, 's')), stats: null, friends: metrics,
    heroNames: { 10: 'Pudge', 11: 'Lion', 12: 'Lina', 13: 'Zeus', 14: 'Tiny', 20: 'Axe', 21: 'Sven', 22: 'Lich', 23: 'Ursa', 30: 'Io' },
    categories: cats,
  })

  it('меньше двух опознанных — категории нет', () => {
    const room = new RoomQuestions(lib, new QuestionHistory(), seeded(1))
    for (let i = 0; i < 10; i++) expect(room.pick('all', { friends: [1] }).category).toBe('base')
  })

  it('двое опознанных — вопросы только про них', () => {
    const room = new RoomQuestions(lib, new QuestionHistory(), seeded(2))
    const q = room.pick('all', { friends: [1, 2] })
    expect(q.category).toBe('friends')
    expect(['Аня', 'Боря']).toContain(q.displayTopic)
    expect(q.options).toContain(q.answer)
    expect(q.optionNotes).toHaveLength(4)
    const c = room.pick('closest', { friends: [1, 2] })
    expect(c.text).toBe('Сколько игр Аня и Боря сыграли вместе в рейтинге?')
    expect(c.numericAnswer).toBe(120)
    expect(c.unit).toBe('игр')
  })

  const names = { 10: 'Pudge', 11: 'Lion', 12: 'Lina', 13: 'Zeus', 14: 'Tiny', 20: 'Axe', 21: 'Sven', 22: 'Lich', 23: 'Ursa', 30: 'Io' }
  const kind = (id: string) => FRIEND_KINDS.find(k => k.id === id)!
  const withTurbo = {
    ...metrics,
    heroes: { ...metrics.heroes, turbo: { ...metrics.heroes.turbo, 1: { own: { 14: [300, 150] }, company: {} } } },
    spans: { ranked: { 1: { own: ['2022-10', '2026-10'] } }, turbo: {} },
  }

  it('ник компании — в родительном падеже по таблице GENITIVE', () => {
    const g = new FriendsGen({ people: { 1101588971: { name: 'выбрудок', open: true }, 1548018309: { name: 'Rocinante', open: true } },
      heroes: { ranked: {}, turbo: {} }, pairs: { ranked: {}, turbo: {} } } as never, {})
    expect(g.whose(1101588971)).toBe('выбрудка')
    expect(g.whose(1548018309)).toBe('Rocinante')
  })

  it('мейн: ник в родительном (нет в таблице — как есть), ловушка — мейн другого режима на месте соперника', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = new FriendsGen(withTurbo, names, seeded(seed))
      const cands = kind('hero_main').candidates(g, [1, 3])
      // у Вовы и у Ани в Турбо меньше 4 героев от 20 игр — карточек нет
      expect(cands.map(c => c.card)).toEqual(['fr:hero_main:1:ranked'])
      const q = cands[0].build()!
      expect(q.text).toBe('На каком из героев у Аня больше всего игр в рейтинге?')
      expect(q.answer).toBe('Pudge')
      expect(q.options).toContain('Tiny')
      expect(q.optionNotes![q.options!.indexOf('Tiny')]).toBe('35 игр')
      expect(q.comment).toBe('Tiny — мейн Аня в Турбо, а не в рейтинге. Вся история STRATZ — с октября 2022.')
    }
  })

  it('мейн без ловушки — только окно выборки', () => {
    const g = new FriendsGen(metrics, names, seeded(3))
    const q = kind('hero_main').candidates(g, [2])[0].build()!
    expect(q.answer).toBe('Axe')
    expect(q.comment).toBe('Вся история STRATZ.')
  })

  it('винрейт героя: лидер от 50 игр, более редкий экстремум в варианты не попадает', () => {
    const wr = { ...metrics, heroes: { ...metrics.heroes, ranked: { ...metrics.heroes.ranked,
      1: { own: { 10: [200, 110], 11: [100, 40], 12: [60, 40], 13: [40, 22], 14: [35, 10] }, company: {} } } } }
    const best = kind('hero_wr').candidates(new FriendsGen(wr, names, seeded(4)), [1])[0].build()!
    expect(best.text).toBe('На ком у Аня лучший винрейт в рейтинге?')
    expect(best.answer).toBe('Lina')
    expect(best.comment).toBe('Lina — 67% за 60 игр; в вариантах — герои от 30 игр. Вся история STRATZ.')
    // Tiny — 29% на 35 играх: хуже всех, но лидером быть не может (< 50 игр) — и в вариантах его нет
    const worst = kind('hero_wr').candidates(new FriendsGen(wr, names, seeded(5)), [1])[1].build()!
    expect(worst.answer).toBe('Lion')
    expect(worst.options).not.toContain('Tiny')
  })

  it('свой винрейт: шаг от выборки, варианты в (0, 100), карточки — только топ героев', () => {
    expect(selfWrStep(40)).toBe(8)
    expect(selfWrStep(100)).toBe(5)
    expect(selfWrStep(600)).toBe(5)
    for (let seed = 1; seed <= 50; seed++) {
      for (const answer of [3, 50, 97]) {
        const v = wrOptions(answer, 8, seeded(seed))
        expect(v).toContain(answer)
        expect(Math.min(...v)).toBeGreaterThan(0)
        expect(Math.max(...v)).toBeLessThan(100)
        expect([8, 16]).toContain(v[1] - v[0])
      }
    }
    const many = { ...metrics, heroes: { ...metrics.heroes, ranked: { ...metrics.heroes.ranked,
      1: { own: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(40 + i), [100 + i, 50]])), company: {} } } } }
    const g = new FriendsGen(many, names, seeded(6))
    const cards = kind('self_wr').candidates(g, [1])
    expect(cards.map(c => c.card).sort()).toEqual([44, 45, 46, 47, 48, 49].map(h => `fr:self_wr:1:ranked:${h}`))
    const q = cards[0].build()!
    expect(q.text).toMatch(/^Какой винрейт у Аня на #4\d в рейтинге\?$/)
    expect(q.options).toContain(q.answer)
    expect(q.comment).toMatch(/^10\d игр.?, 50 побед\. Вся история STRATZ\.$/)
  })

  it('игры на герое: единица «игр», аноним — «в пати», окно в comment', () => {
    const g = new FriendsGen(metrics, names, seeded(7))
    const [q] = kind('hero_games').candidates(g, [3]).map(c => c.build()!)
    expect(q.text).toBe('Сколько игр у Вова на Io в пати рейтинге?')
    expect(q.numericAnswer).toBe(90)
    expect(q.unit).toBe('игр')
    expect(q.comment).toBe('Профиль скрыт: только игры в пати с открытыми профилями.')
  })
})

describe('настоящий банк', () => {
  it('10 игр по 24 раунда: без повторов в игре, все категории без друзей встречаются', () => {
    const lib = loadLibrary()
    expect(lib.warnings).toEqual([])
    const history = new QuestionHistory()
    const cats = new Set<string>()
    for (let game = 0; game < 10; game++) {
      const room = new RoomQuestions(lib, history, seeded(game + 1))
      const ids = new Set<string>()
      for (let r = 0; r < 8; r++) {
        for (const mode of ['all', 'kerri', 'closest'] as const) {
          const q = room.pick(mode)
          expect(ids.has(q.id)).toBe(false)
          ids.add(q.id)
          cats.add(q.category!)
          if (mode === 'closest') expect(typeof q.numericAnswer).toBe('number')
          else {
            expect(q.options).toHaveLength(4)
            expect(new Set(q.options).size).toBe(4)
            expect(q.options).toContain(q.answer)
          }
        }
      }
    }
    expect([...cats].sort()).toEqual(lib.categories.filter(c => !c.requires).map(c => c.id).sort())
  })
})
