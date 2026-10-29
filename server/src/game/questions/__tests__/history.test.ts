import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { RoomQuestions } from '../picker'
import { buildLibrary, type BankQuestion } from '../library'
import { QuestionHistory, type HistoryBackend, type RatingRow, type HistorySnapshot } from '../history'
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

  it('несколько попыток, потом громкий лог и работа в памяти', async () => {
    vi.stubEnv('NODE_ENV', 'production')   // .env не читать
    vi.stubEnv('DATABASE_URL', 'postgres://nobody:x@127.0.0.1:1/none')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const history = await createHistory({ attempts: 3, timeoutMs: 2_000, pauseMs: 10 })
    const tries = warn.mock.calls.filter(c => String(c[0]).includes('попытка'))
    const banner = error.mock.calls.map(c => String(c[0])).join('\n')
    warn.mockRestore()
    error.mockRestore()
    expect(history.gameNo).toBe(0)
    // без модуля pg — одна громкая строка вместо попыток; с модулем — 3 попытки и баннер
    expect(banner).toMatch(/БЕЗ NEON/)
    if (!banner.includes('Модуль pg')) expect(tries).toHaveLength(3)
  }, 20_000)
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
    expect(history.archived.has(q.id)).toBe(false)
    room.rate(q, { id: '2', name: 'Петя', roomPlayers: 3 }, { score: -2 })
    expect(archived).toEqual([q.id])   // 2 из 3
  })
})
