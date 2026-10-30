import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { RoomQuestions } from '../picker'
import { buildLibrary, type BankQuestion } from '../library'
import { QuestionHistory, REAL_GAME_SHOWINGS, type HistoryBackend, type RatingRow, type HistorySnapshot } from '../history'
import { findDotEnv, loadDotEnv, createHistory } from '../setup'
import { StatQuestionBuilder, type StatsBank } from '../../stats/statQuestions'
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

/** Хранилище, которое только записывает вызовы. */
function recorder(snap: HistorySnapshot | null = null) {
  const ratings: RatingRow[] = []
  const archived: string[] = []
  const backend: HistoryBackend = {
    load: async () => snap, gameStarted() {}, seen() {}, cycle() {}, credits() {}, showing() {},
    archive: id => { archived.push(id) },
    rating: row => { ratings.push(row) },
  }
  return { backend, ratings, archived }
}

describe('.env', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cumsino-env-'))

  it('ищется вверх по родительским папкам: worktree → основной checkout', () => {
    const root = tmp()
    const wt = path.join(root, '.claude', 'worktrees', 'redesign')
    fs.mkdirSync(wt, { recursive: true })
    fs.writeFileSync(path.join(root, '.env'), 'DATABASE_URL=postgres://main\n')
    expect(findDotEnv(wt)).toBe(path.join(root, '.env'))
    // свой .env у worktree — ближайший главнее
    fs.writeFileSync(path.join(wt, '.env'), 'DATABASE_URL=postgres://wt\n')
    expect(findDotEnv(wt)).toBe(path.join(wt, '.env'))
  })

  it('нигде нет — null; папка с именем .env не считается', () => {
    const root = tmp()
    const deep = path.join(root, 'a', 'b')
    fs.mkdirSync(path.join(deep, '.env'), { recursive: true })
    const found = findDotEnv(deep)
    // выше tmp может лежать чужой .env — главное, что не наша папка и не что-то внутри root
    expect(found === null || !found.startsWith(root)).toBe(true)
  })

  it('не выше корня основного checkout (там .git — папка) и не дальше заданного числа уровней', () => {
    const root = tmp()
    fs.writeFileSync(path.join(root, '.env'), 'X=outside\n')        // чужой .env над репозиторием
    const repo = path.join(root, 'repo')
    const wt = path.join(repo, '.claude', 'worktrees', 'w')
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true })
    fs.mkdirSync(wt, { recursive: true })
    fs.writeFileSync(path.join(wt, '.git'), 'gitdir: ../../../.git/worktrees/w\n')   // у worktree .git — файл
    expect(findDotEnv(wt)).toBeNull()                                 // дошёл до repo/.git и остановился
    fs.writeFileSync(path.join(repo, '.env'), 'X=main\n')
    expect(findDotEnv(wt)).toBe(path.join(repo, '.env'))
    const deep = path.join(root, 'a', 'b', 'c', 'd', 'e', 'f')
    fs.mkdirSync(deep, { recursive: true })
    expect(findDotEnv(deep, 2)).toBeNull()                            // root/.env — шесть уровней вверх
    expect(findDotEnv(deep, 6)).toBe(path.join(root, '.env'))
  })

  it('явно заданная переменная побеждает, даже пустая; остальные загружаются', () => {
    const file = path.join(tmp(), '.env')
    fs.writeFileSync(file, 'DATABASE_URL=postgres://file\nSTRATZ_API_KEY=abc\nOTHER=1\n')
    const env: NodeJS.ProcessEnv = { DATABASE_URL: '', OTHER: 'mine' }
    expect(loadDotEnv(file, env)).toEqual(['STRATZ_API_KEY'])
    expect(env).toEqual({ DATABASE_URL: '', OTHER: 'mine', STRATZ_API_KEY: 'abc' })
    const clean: NodeJS.ProcessEnv = {}
    loadDotEnv(file, clean)
    expect(clean.DATABASE_URL).toBe('postgres://file')
  })
})

describe('загрузка базы', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  /** Хранилище без сети: load ведёт себя, как скажут (ошибка / зависание / снимок). */
  function fakeBackends(load: (n: number) => Promise<HistorySnapshot | null>) {
    let made = 0
    let closed = 0
    const make = () => {
      const n = ++made
      return { ...recorder().backend, load: () => load(n), close: async () => { closed++ } }
    }
    return { make, made: () => made, closed: () => closed }
  }

  async function quietly<T>(run: () => Promise<T>) {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const result = await run()
      return {
        result,
        tries: warn.mock.calls.filter(c => String(c[0]).includes('попытка')).length,
        banner: error.mock.calls.map(c => String(c[0])).join('\n'),
      }
    } finally {
      warn.mockRestore()
      error.mockRestore()
      log.mockRestore()
    }
  }

  it('несколько попыток (ошибка и зависание), потом громкий лог и работа в памяти — без сети', async () => {
    vi.stubEnv('NODE_ENV', 'production')   // .env не читать
    vi.stubEnv('DATABASE_URL', 'postgres://fake')
    // 1-я попытка — ошибка подключения, 2-я и 3-я — висят дольше таймаута
    const fake = fakeBackends(n => (n === 1 ? Promise.reject(new Error('ECONNREFUSED')) : new Promise(() => {})))
    const { result, tries, banner } = await quietly(() =>
      createHistory({ attempts: 3, timeoutMs: 30, pauseMs: 1, makeBackend: fake.make }))
    expect(result.gameNo).toBe(0)
    expect(tries).toBe(3)
    expect(fake.made()).toBe(3)
    expect(fake.closed()).toBe(3)   // брошенные попытки закрывают свой пул
    expect(banner).toMatch(/БЕЗ NEON/)
    expect(banner).toMatch(/таймаут/)
  })

  it('со второй попытки — история из базы', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DATABASE_URL', 'postgres://fake')
    const snap: HistorySnapshot = { gameNo: 41, cycles: {}, seen: [], archived: ['x'], credits: [], ratings: [] }
    const fake = fakeBackends(n => (n === 1 ? Promise.reject(new Error('спит')) : Promise.resolve(snap)))
    const { result, tries, banner } = await quietly(() =>
      createHistory({ attempts: 3, timeoutMs: 100, pauseMs: 1, makeBackend: fake.make }))
    expect(result.gameNo).toBe(41)
    expect(result.archived.has('x')).toBe(true)
    expect(tries).toBe(1)
    expect(banner).toBe('')
  })
})

describe('колоды: соседние игры и комнаты', () => {
  const cats: CategoryDef[] = [
    { id: 'small', title: 'S', weight: 100, subs: [{ id: 'pair', title: 'Пара' }] },
    { id: 'big', title: 'B', weight: 1, subs: [{ id: 'many', title: 'Много' }] },
  ]
  const bank = [num('p1', 'pair'), num('p2', 'pair'),
    ...Array.from({ length: 60 }, (_, i) => num(`m${i}`, 'many'))]
  const lib = buildLibrary({ bank, stats: null, friends: null, categories: cats })

  it('маленькая колода: карточки прошлой игры не берутся — подкатегория пропускается, через игру снова есть', () => {
    const history = new QuestionHistory()
    const subsOf = (seed: number) => {
      const room = new RoomQuestions(lib, history, seeded(seed))
      return Array.from({ length: 4 }, () => room.pick('closest')).map(q => q.id)
    }
    const g1 = subsOf(1)
    expect(g1.filter(id => id.startsWith('p')).sort()).toEqual(['p1', 'p2'])   // вес 100: пара уходит первой
    const g2 = subsOf(2)
    expect(g2.some(id => id.startsWith('p'))).toBe(false)   // обе были в прошлой игре — только «Много»
    const g3 = subsOf(3)
    expect(g3.filter(id => id.startsWith('p')).sort()).toEqual(['p1', 'p2'])   // новый круг
  })

  it('history.blockedFor: эта, прошлая и более поздняя игра (соседняя комната) — нельзя; позапрошлая — можно', () => {
    const h = new QuestionHistory()
    h.take('d', 'c', 5)
    expect([3, 4, 5, 6, 7].map(g => h.blockedFor('d', 'c', g))).toEqual([true, true, true, true, false])
    expect(h.blockedFor('d', 'other', 5)).toBe(false)
  })

  it('две комнаты одновременно: ни одна не берёт свою карточку второй раз, даже если запись перезаписали', () => {
    const one: CategoryDef[] = [{ id: 'c', title: 'C', weight: 1, subs: [{ id: 's', title: 'S' }] }]
    const deck = Array.from({ length: 12 }, (_, i) => num(`q${i}`, 's'))
    const small = buildLibrary({ bank: deck, stats: null, friends: null, categories: one })
    const history = new QuestionHistory()
    const a = new RoomQuestions(small, history, seeded(1))
    const b = new RoomQuestions(small, history, seeded(2))
    const seenA: string[] = []
    const seenB: string[] = []
    for (let i = 0; i < 6; i++) {
      seenA.push(a.pick('closest').id)
      seenB.push(b.pick('closest').id)
    }
    expect(new Set(seenA).size).toBe(6)
    expect(new Set(seenB).size).toBe(6)
    expect(seenA.some(id => seenB.includes(id))).toBe(false)   // соседние игры колоду не делят
    // запись карточки комнаты A (игра 1) перезаписана игрой с меньшим номером — по history она снова свободна
    for (const id of seenA) history.take('s', id, -1)
    expect(seenA.every(id => !history.blockedFor('s', id, 1))).toBe(true)
    expect(() => { for (let i = 0; i < 6; i++) expect(seenA).not.toContain(a.pick('closest').id) })
      .toThrow(/нет ни одного вопроса/)   // A помнит свои: свободных у неё больше нет
  })

  it('статистика: прошлая игра заблокирована и в своём пути сборки', () => {
    const stats: StatsBank = {
      snapshot: 't', patch: 't', subcategories: [{
        id: 'st', comment: '', pools: [],
        closest: { pools: [{ subject: 'A', text: 'A?', answer: 1 }, { subject: 'B', text: 'B?', answer: 2 }] },
      }],
    }
    const statCats: CategoryDef[] = [
      { id: 'stat', title: 'St', weight: 100, subs: [{ id: 'st', title: 'St' }] },
      { id: 'big', title: 'B', weight: 1, subs: [{ id: 'many', title: 'Много' }] },
    ]
    const sl = buildLibrary({ bank: bank.filter(q => q.sub === 'many'), stats, friends: null, categories: statCats })
    const history = new QuestionHistory()
    const game = (seed: number) => {
      const room = new RoomQuestions(sl, history, seeded(seed))
      return Array.from({ length: 3 }, () => room.pick('closest').id)
    }
    expect(game(1).filter(id => id.startsWith('stat:')).sort()).toEqual(['stat:st:A', 'stat:st:B'])
    expect(game(2).some(id => id.startsWith('stat:'))).toBe(false)
    expect(game(3).filter(id => id.startsWith('stat:')).sort()).toEqual(['stat:st:A', 'stat:st:B'])
    expect(StatQuestionBuilder.card(stats.subcategories[0], 'A')).toBe('stat:st:A')
  })
})

describe('кредиты сглаживания', () => {
  it('не собравшая вопрос категория и подкатегория до конца игры не копят кредит', () => {
    const cats: CategoryDef[] = [
      { id: 'one', title: 'O', weight: 1, subs: [{ id: 'single', title: 'S' }, { id: 'single2', title: 'S2' }] },
      { id: 'big', title: 'B', weight: 1, subs: [{ id: 'many', title: 'M' }] },
    ]
    const bank = [num('s1', 'single'), num('s2', 'single2'), ...Array.from({ length: 80 }, (_, i) => num(`m${i}`, 'many'))]
    const lib = buildLibrary({ bank, stats: null, friends: null, categories: cats })
    const history = new QuestionHistory()
    const room = new RoomQuestions(lib, history, seeded(4))
    const cat = history.creditsOf('cat:closest')
    const sub = history.creditsOf('sub:closest:one')
    const trace: Array<[number, number]> = []
    for (let i = 0; i < 30; i++) {
      room.pick('closest')
      trace.push([cat.get('one') ?? 0, sub.get('single') ?? 0])
    }
    // обе карточки «one» ушли в первых раундах; дальше её кредит заморожен, а не растёт до +3
    const last = trace[trace.length - 1]
    expect(trace.slice(15).every(([c, s]) => c === last[0] && s === last[1])).toBe(true)
    expect(last[0]).toBeLessThan(1.5)
    // без исключения «one» получала бы +0.5 за каждый из ~28 выборов «big» и упёрлась бы в предел +3
  })

  it('в следующей игре, где карточки снова свободны, — опять кандидат', () => {
    const cats: CategoryDef[] = [
      { id: 'one', title: 'O', weight: 1, subs: [{ id: 'single', title: 'S' }] },
      { id: 'big', title: 'B', weight: 1, subs: [{ id: 'many', title: 'M' }] },
    ]
    const bank = [num('s1', 'single'), num('s2', 'single'), num('s3', 'single'), num('s4', 'single'),
      ...Array.from({ length: 80 }, (_, i) => num(`m${i}`, 'many'))]
    const lib = buildLibrary({ bank, stats: null, friends: null, categories: cats })
    const history = new QuestionHistory()
    const r1 = new RoomQuestions(lib, history, seeded(5))
    for (let i = 0; i < 10; i++) r1.pick('closest')
    expect(history.creditsOf('cat:closest').get('one')).toBeLessThan(1.5)
    const r2 = new RoomQuestions(lib, history, seeded(6))   // игра 2: карточки игры 1 заблокированы
    expect(Array.from({ length: 6 }, () => r2.pick('closest').category)).not.toContain('one')
    const r3 = new RoomQuestions(lib, history, seeded(7))
    expect(Array.from({ length: 6 }, () => r3.pick('closest').category)).toContain('one')
  })
})

describe('оценка: сразу, по id игрока, без показа в памяти', () => {
  const cats: CategoryDef[] = [{ id: 'c', title: 'C', weight: 1, subs: [{ id: 's', title: 'S' }] }]
  const lib = buildLibrary({ bank: Array.from({ length: 5 }, (_, i) => num(`q${i}`, 's')), stats: null, friends: null, categories: cats })

  it('ключ голоса — id: два игрока с одним ником голосуют отдельно', () => {
    const { backend, ratings } = recorder()
    const history = new QuestionHistory(backend)
    const room = new RoomQuestions(lib, history, seeded(1))
    const q = room.pick('closest')
    room.report(q, { roomPlayers: 4, players: 4, answered: 4, correct: 1 })
    room.rate(q, { id: 'sock-1', name: 'Вася', roomPlayers: 4 }, { score: 2 })
    room.rate(q, { id: 'sock-2', name: 'Вася', roomPlayers: 4 }, { score: 2 })
    expect(history.ratingOf('sub:s')).toEqual({ n: 1, sum: 1 })   // (2 + 2) / 4
    expect(ratings.map(r => [r.player, r.name, r.score])).toEqual([['sock-1', 'Вася', 2], ['sock-2', 'Вася', 2]])
  })

  it('каждое изменение сразу в суммах и в базе; снятие (null) убирает голос; сложность не трогает оценку', () => {
    const { backend, ratings } = recorder()
    const history = new QuestionHistory(backend)
    const room = new RoomQuestions(lib, history, seeded(2))
    const q = room.pick('closest')
    room.report(q, { roomPlayers: 2, players: 2, answered: 2, correct: 0 })
    const me = { id: 'a', name: 'A', roomPlayers: 2 }
    room.rate(q, me, { score: 2, difficulty: null })
    expect(history.ratingOf('cat:c').sum).toBeCloseTo(1)
    room.rate(q, me, { score: -1, difficulty: 1 })
    expect(history.ratingOf('cat:c').sum).toBeCloseTo(-0.5)
    room.rate(q, me, { difficulty: null })               // только сложность: оценка остаётся −1
    expect(history.ratingOf('cat:c').sum).toBeCloseTo(-0.5)
    room.rate(q, me, { score: null, difficulty: null })  // сняли всё
    expect(history.ratingOf('cat:c')).toEqual({ n: 1, sum: 0 })
    // в базу — голос целиком, без «не менять»
    expect(ratings.map(r => [r.score, r.difficulty])).toEqual([[2, null], [-1, 1], [-1, null], [null, null]])
  })

  it('показа в памяти нет (перезапуск) — делитель из события, показ второй раз не считается', () => {
    const history = new QuestionHistory()
    const row = { questionId: 'q', category: 'c', sub: 's', gameNo: 7, player: 'a', name: 'A' }
    history.rate({ ...row, score: 2 }, { text: 'q?', roomPlayers: 4 })
    expect(history.ratingOf('sub:s')).toEqual({ n: 0, sum: 0.5 })
    history.rate({ ...row, score: 1 }, { text: 'q?', roomPlayers: 4 })   // переоценка заменяет
    expect(history.ratingOf('sub:s').sum).toBeCloseTo(0.25)
  })

  it('после перезапуска голоса последних показов из базы: переоценка заменяет, а не добавляет', async () => {
    const snap: HistorySnapshot = {
      gameNo: 7, cycles: {}, seen: [], archived: [], credits: [],
      ratings: [{ key: 'cat:c', n: 1, sum: 0.5 }, { key: 'sub:s', n: 1, sum: 0.5 }],
      shows: [{ questionId: 'q', gameNo: 7, category: 'c', sub: 's', roomPlayers: 4,
        votes: [{ player: 'a', name: 'A', score: 2, difficulty: null }] }],
    }
    const history = new QuestionHistory(recorder(snap).backend)
    await history.init()
    history.rate({ questionId: 'q', category: 'c', sub: 's', gameNo: 7, player: 'a', score: -2 },
      { text: 'q?', roomPlayers: 4 })
    expect(history.ratingOf('sub:s')).toEqual({ n: 1, sum: -0.5 })   // 0.5 + (−2 − 2) / 4
  })

  it('«удалить» по id: двое с одним ником — два голоса; в архиве ники', () => {
    const { backend, archived } = recorder()
    const history = new QuestionHistory(backend)
    const room = new RoomQuestions(lib, history, seeded(3))
    const q = room.pick('closest')
    room.report(q, { roomPlayers: 3, players: 3, answered: 3, correct: 0 })
    room.rate(q, { id: '1', name: 'Петя', roomPlayers: 3 }, { score: -2 })
    room.rate(q, { id: '2', name: 'Петя', roomPlayers: 3 }, { score: -2 })
    expect(archived).toEqual([])        // архив — при закрытии показа, не в момент голоса
    room.settle()
    expect(archived).toEqual([q.id])   // 2 из 3
  })
})

describe('«удалить»: решается при закрытии показа по итоговым голосам', () => {
  const cats: CategoryDef[] = [{ id: 'c', title: 'C', weight: 1, subs: [{ id: 's', title: 'S' }] }]
  const lib = buildLibrary({ bank: Array.from({ length: 8 }, (_, i) => num(`q${i}`, 's')), stats: null, friends: null, categories: cats })
  const voter = (id: string, roomPlayers: number) => ({ id, name: id, roomPlayers })
  const setup = (seed: number) => {
    const rec = recorder()
    const history = new QuestionHistory(rec.backend)
    const room = new RoomQuestions(lib, history, seeded(seed))
    return { ...rec, history, room }
  }

  it('снятый голос «удалить» не архивирует: важны итоговые голоса', () => {
    const { history, room } = setup(1)
    const q = room.pick('closest')
    room.report(q, { roomPlayers: 2, present: ['a', 'b'], players: 2, answered: 2, correct: 0 })
    room.rate(q, voter('a', 2), { score: -2 })
    room.rate(q, voter('b', 2), { score: -2 })
    room.rate(q, voter('b', 2), { score: null })   // передумал
    room.settle()
    expect(history.archived.has(q.id)).toBe(false)
  })

  it('соло (один игрок) вопрос навсегда не удаляет: нужно не меньше двух голосов', () => {
    const { history, room } = setup(2)
    const q = room.pick('closest')
    room.report(q, { roomPlayers: 1, present: ['solo'], players: 1, answered: 1, correct: 0 })
    room.rate(q, voter('solo', 1), { score: -2 })
    room.settle()
    expect(history.archived.has(q.id)).toBe(false)
    expect(history.ratingOf('sub:s').sum).toBeCloseTo(-2)   // в весах голос есть
  })

  it('голосуют только бывшие в комнате при показе; делитель — их число', () => {
    const { history, room, ratings } = setup(3)
    const q = room.pick('closest')
    room.report(q, { roomPlayers: 3, present: ['a', 'b', 'c'], players: 3, answered: 3, correct: 0 })
    room.rate(q, voter('late', 4), { score: -2 })   // вошёл после показа
    room.rate(q, voter('late2', 4), { score: -2 })
    room.rate(q, voter('a', 3), { score: -2 })
    expect(ratings.map(r => r.player)).toEqual(['a'])
    expect(history.ratingOf('sub:s').sum).toBeCloseTo(-2 / 3)
    room.settle()
    expect(history.archived.has(q.id)).toBe(false)   // 1 из 3, поздние не считаются
  })

  it('следующий показ комнаты закрывает прошлый; settle повторно ничего не делает', () => {
    const { history, room, archived } = setup(4)
    const q1 = room.pick('closest')
    room.report(q1, { roomPlayers: 3, present: ['a', 'b', 'c'], players: 3, answered: 3, correct: 0 })
    room.rate(q1, voter('a', 3), { score: -2 })
    room.rate(q1, voter('b', 3), { score: -2 })
    expect(history.archived.has(q1.id)).toBe(false)
    const q2 = room.pick('closest')
    room.report(q2, { roomPlayers: 3, present: ['a', 'b', 'c'], players: 3, answered: 3, correct: 0 })
    expect(archived).toEqual([q1.id])                 // закрылся с показом q2
    room.rate(q2, voter('a', 3), { score: -2 })
    room.settle()                                     // комната закрылась: q2 — 1 из 3
    room.settle()
    room.settle(q1)
    expect(archived).toEqual([q1.id])
  })
})

describe('блок «прошлой игры»: по последней настоящей игре, а не по номеру', () => {
  const report = (h: QuestionHistory, gameNo: number, n: number) => {
    for (let i = 0; i < n; i++) {
      h.showing({ questionId: `g${gameNo}-${i}`, category: 'c', sub: 's', mode: 'all', gameNo, roomPlayers: 2, players: 2, answered: 2, correct: 1 })
    }
  }

  it('брошенная комната между двумя играми не снимает блок с карточек прошлой игры', () => {
    const h = new QuestionHistory()
    const g1 = h.startGame()
    h.take('d', 'card', g1)
    report(h, g1, REAL_GAME_SHOWINGS)            // настоящая игра
    const g2 = h.startGame()                     // брошенная: пара раундов
    report(h, g2, 2)
    const g3 = h.startGame()
    expect(h.blockedFor('d', 'card', g3)).toBe(true)      // по номеру g3 − 1 = g2 карточка g1 была бы свободна
    report(h, g3, REAL_GAME_SHOWINGS)
    const g4 = h.startGame()
    expect(h.blockedFor('d', 'card', g4)).toBe(false)     // прошлая настоящая — g3
  })

  it('настоящие игры из базы: после перезапуска то же', async () => {
    const snap: HistorySnapshot = {
      gameNo: 12, cycles: {}, seen: [{ deck: 'd', card: 'card', cycle: 0, gameNo: 10 }], archived: [], credits: [],
      ratings: [], played: [10, 9],
    }
    const h = new QuestionHistory(recorder(snap).backend)
    await h.init()
    const g = h.startGame()                       // 13; 11 и 12 — брошенные
    expect(h.blockedFor('d', 'card', g)).toBe(true)
    expect(h.isFresh('d', 'card', g)).toBe(false)
  })
})

describe('колода комнаты: свои карточки', () => {
  it('fresh не берёт свою карточку, даже если history считает её свежей (запись перезаписана)', () => {
    const one: CategoryDef[] = [{ id: 'c', title: 'C', weight: 1, subs: [{ id: 's', title: 'S' }] }]
    const deck = Array.from({ length: 4 }, (_, i) => num(`q${i}`, 's'))
    const lib = buildLibrary({ bank: deck, stats: null, friends: null, categories: one })
    const history = new QuestionHistory()
    const room = new RoomQuestions(lib, history, seeded(9))
    const mine = Array.from({ length: 4 }, () => room.pick('closest').id)
    // соседняя комната перезаписала записи старой игрой и начала новый круг: по history все четыре свежие
    for (const id of mine) history.take('s', id, -5)
    history.newCycle('s')
    expect(mine.every(id => history.isFresh('s', id, 1))).toBe(true)
    expect(() => room.pick('closest')).toThrow(/нет ни одного вопроса/)
  })
})
