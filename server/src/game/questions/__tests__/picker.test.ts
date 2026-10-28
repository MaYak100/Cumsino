import { describe, it, expect } from 'vitest'
import { RoomQuestions, shuffleOptions, drawFromDeck, relativeMultipliers, ratingScore } from '../picker'
import { buildLibrary, loadLibrary, type BankQuestion } from '../library'
import { QuestionHistory } from '../history'
import { smoothOrder, commitChoice } from '../smooth'
import { makeStepOptions, formatNumber } from '../stepOptions'
import { gameOnlyDeck } from '../../stats/statQuestions'
import type { CategoryDef } from '../categories'

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
  it('ровно через шаг, все > 0, правильный на случайной позиции', () => {
    const positions = new Set<number>()
    for (let seed = 1; seed <= 40; seed++) {
      const { values, correct } = makeStepOptions(3.2, 0.4, seeded(seed))
      expect(values[correct]).toBe(3.2)
      for (let i = 1; i < 4; i++) expect(values[i] - values[i - 1]).toBeCloseTo(0.4, 9)
      expect(values[0]).toBeGreaterThan(0)
      positions.add(correct)
    }
    expect(positions.size).toBe(4)
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

  it('числовой вопрос в MC: варианты по шагу, правильный среди них', () => {
    const lib = buildLibrary({ bank: [num('n', 's', 850)], stats: null, friends: null, categories: cats })
    const q = new RoomQuestions(lib, new QuestionHistory(), seeded(5)).pick('kerri')
    expect(q.mode).toBe('kerri')
    expect(q.options).toHaveLength(4)
    expect(q.options).toContain('850')
    expect(q.answer).toBe('850')
    expect(q.subcategory).toBe('s')
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

  it('множители относительные: всем одинаково хорошо — веса базовые; сдвиг не больше чем в 1.5 раза', () => {
    const items = [{ key: 'a', weight: 1 }, { key: 'b', weight: 2 }, { key: 'c', weight: 1 }]
    const same = relativeMultipliers(items, () => 1.5)
    for (const m of same.values()) expect(m).toBeCloseTo(1)
    const scores: Record<string, number> = { a: 2, b: 0, c: -2 }
    const m = relativeMultipliers(items, k => scores[k])
    expect(m.get('a')!).toBeGreaterThan(1)
    expect(m.get('c')!).toBeLessThan(1)
    expect(m.get('a')!).toBeLessThanOrEqual(1.5)
    expect(m.get('c')!).toBeGreaterThanOrEqual(1 / 1.5)
  })

  it('фора: пара показов почти не сдвигает, сотня — сдвигает', () => {
    expect(ratingScore({ n: 2, sum: 2 })).toBeCloseTo(2 / 12)
    expect(ratingScore({ n: 100, sum: 100 })).toBeCloseTo(100 / 110)
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
