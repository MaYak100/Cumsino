// server/src/dev/questionLab.ts
// Лаборатория вопросов для клиентской страницы /dev: каталог категорий и вопросы вместе с ответом, комментарием и
// подписями вариантов. Подключается только вне production (index.ts) — на Render этих адресов нет.
//
// Вопросы собирает тот же RoomQuestions, что и в игре (picker.ts → банк / статистика / друзья), — параллельной логики
// нет. Разница только в памяти: у каждой сессии лаборатории свой QuestionHistory без хранилища, поэтому колоды,
// кредиты, показы и оценки в Neon лаборатория не пишет. Конкретная подкатегория — это библиотека, урезанная до неё
// одной; конкретный id — история, у которой «свежая» только эта карточка.
import { Router, type Request, type Response } from 'express'
import type { GameMode, Question } from '@cumsino/shared'
import { loadLibrary, type Library, type Category, type Subcategory, type QuestionKind } from '../game/questions/library'
import { RoomQuestions } from '../game/questions/picker'
import { QuestionHistory } from '../game/questions/history'
import { FriendsGen, MIN_IDENTIFIED_FRIENDS } from '../game/questions/friends'

const MODES: GameMode[] = ['all', 'kerri', 'closest']
const MAX_SESSIONS = 50

interface LabSession {
  history: QuestionHistory
  /** пикер на «игру» лаборатории: свой на каждый срез (категория | подкатегория | друзья) */
  rooms: Map<string, RoomQuestions>
  usedAt: number
}

const sessions = new Map<string, LabSession>()

function sessionOf(id: string): LabSession {
  let s = sessions.get(id)
  if (!s) {
    if (sessions.size >= MAX_SESSIONS) {
      const oldest = [...sessions.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt)[0]
      sessions.delete(oldest[0])
    }
    s = { history: new QuestionHistory(), rooms: new Map(), usedAt: 0 }
    sessions.set(id, s)
  }
  s.usedAt = Date.now()
  return s
}

/** История, в которой свежая и свободная только одна карточка: пикер соберёт ровно этот вопрос (или ничего). */
class OneCardHistory extends QuestionHistory {
  constructor(private card: string) { super() }
  override isFresh(_deck: string, card: string): boolean { return card === this.card }
  override usedInGame(_deck: string, card: string): boolean { return card !== this.card }
}

/** Библиотека, урезанная до одной категории (и, если задана, одной подкатегории). */
function scoped(lib: Library, cat: Category, sub?: Subcategory): Library {
  return { ...lib, categories: [{ ...cat, subs: sub ? [sub] : cat.subs }] }
}

const kindOf = (mode: GameMode): QuestionKind => (mode === 'closest' ? 'closest' : 'mc')

function allFriends(lib: Library): number[] {
  return Object.keys(lib.friends?.people ?? {}).map(Number)
}

/** Где искать карточку по id: статистика и друзья — по префиксу, банк — по списку вопросов. */
function subsForId(lib: Library, id: string): Array<{ cat: Category; sub: Subcategory }> {
  const all = lib.categories.flatMap(cat => cat.subs.map(sub => ({ cat, sub })))
  const stat = id.match(/^stat:([^:]+):/)
  if (stat) return all.filter(x => x.sub.id === stat[1])
  const fr = id.match(/^fr:([^:]+):/)
  if (fr) return all.filter(x => x.sub.id === `friends_${fr[1]}`)
  return all.filter(x => x.sub.source.type === 'bank' && x.sub.source.questions.some(q => q.id === id))
}

export interface QuestionMeta {
  id: string
  category: string
  categoryTitle: string
  sub: string
  subTitle: string
  source: 'bank' | 'stats' | 'friends'
  /** number — числовой факт (в MC варианты по шагу), choice — готовые варианты */
  bankKind?: 'number' | 'choice'
  step?: number
  unit?: string
  /** числовой ответ факта (в MC он же среди вариантов) */
  numberAnswer?: number
  /** тема банка (поле topic в questions.json) */
  bankTopic?: string
}

function metaOf(lib: Library, q: Question): QuestionMeta {
  const cat = lib.categories.find(c => c.id === q.category)
  const sub = cat?.subs.find(s => s.id === q.subcategory)
  const meta: QuestionMeta = {
    id: q.id,
    category: cat?.id ?? '?', categoryTitle: cat?.title ?? '?',
    sub: sub?.id ?? '?', subTitle: sub?.title ?? '?',
    source: sub?.source.type ?? 'bank',
  }
  if (sub?.source.type === 'bank') {
    const b = sub.source.questions.find(x => x.id === q.id)
    if (b) {
      meta.bankKind = b.kind
      meta.bankTopic = b.topic
      if (b.kind === 'number') {
        meta.step = b.step
        meta.unit = b.unit
        meta.numberAnswer = b.answer
      }
    }
  }
  return meta
}

function catalog(lib: Library) {
  const friendsGen = lib.friends ? new FriendsGen(lib.friends, lib.heroNames) : null
  const everyone = allFriends(lib)
  return {
    stats: lib.stats ? { snapshot: lib.stats.snapshot, patch: lib.stats.patch } : null,
    friends: Object.entries(lib.friends?.people ?? {}).map(([id, p]) => ({ id: Number(id), name: p.name, open: p.open })),
    minFriends: MIN_IDENTIFIED_FRIENDS,
    warnings: lib.warnings,
    categories: lib.categories.map(cat => ({
      id: cat.id, title: cat.title, weight: cat.weight, requires: cat.requires ?? null,
      subs: cat.subs.map(sub => {
        const src = sub.source
        let counts: { mc: number; closest: number; number?: number; choice?: number }
        if (src.type === 'bank') {
          const number = src.questions.filter(q => q.kind === 'number').length
          counts = { mc: src.questions.length, closest: number, number, choice: src.questions.length - number }
        } else if (src.type === 'stats') {
          counts = { mc: src.sub.mode === 'mc' ? sub.size.cards : 0, closest: src.sub.mode === 'closest' ? sub.size.cards : 0 }
        } else {
          // карточек столько, сколько сочетаний при всех опознанных
          const cards = friendsGen ? src.kind.candidates(friendsGen, everyone).length : 0
          counts = { mc: sub.kinds.has('mc') ? cards : 0, closest: sub.kinds.has('closest') ? cards : 0 }
        }
        return {
          id: sub.id, title: sub.title, weight: sub.weight, source: src.type,
          kinds: [...sub.kinds], counts, templates: sub.size.templates,
        }
      }),
    })),
  }
}

function parseFriends(raw: unknown): number[] {
  if (typeof raw !== 'string' || !raw) return []
  return [...new Set(raw.split(',').map(Number).filter(n => Number.isFinite(n) && n > 0))].sort((a, b) => a - b)
}

function fail(res: Response, status: number, error: string) {
  res.status(status).json({ error })
}

export function createQuestionLabRouter(): Router {
  const lib = loadLibrary()
  const router = Router()

  router.get('/catalog', (_req, res) => {
    res.json(catalog(lib))
  })

  // ?session=…&mode=all|kerri|closest[&cat=…][&sub=…][&id=…][&friends=1,2]
  router.get('/question', (req: Request, res: Response) => {
    const mode = String(req.query.mode ?? 'all') as GameMode
    if (!MODES.includes(mode)) return fail(res, 400, `режим ${mode}? нужен all, kerri или closest`)
    const kind = kindOf(mode)
    const friends = parseFriends(req.query.friends)
    const id = typeof req.query.id === 'string' ? req.query.id.trim() : ''

    try {
      if (id) {
        // конкретный вопрос: каждый раз заново, колоды сессии не трогает
        const places = subsForId(lib, id).filter(x => x.sub.kinds.has(kind))
        if (!places.length) return fail(res, 404, `вопроса ${id} нет или он не годится для режима ${mode}`)
        const present = id.startsWith('fr:') ? allFriends(lib) : friends
        for (const { cat, sub } of places) {
          try {
            const q = new RoomQuestions(scoped(lib, cat, sub), new OneCardHistory(id)).pick(mode, { friends: present })
            if (q.id === id) return res.json({ question: q, meta: metaOf(lib, q), wrapped: false })
          } catch { /* в этой подкатегории не собрался — следующая */ }
        }
        return fail(res, 404, `вопрос ${id} не собирается в режиме ${mode} (статистике не хватило вариантов?)`)
      }

      const catId = typeof req.query.cat === 'string' && req.query.cat ? req.query.cat : null
      const subId = typeof req.query.sub === 'string' && req.query.sub ? req.query.sub : null
      const cat = catId ? lib.categories.find(c => c.id === catId) : null
      if (catId && !cat) return fail(res, 404, `категории ${catId} нет`)
      const sub = subId ? (cat?.subs ?? lib.categories.flatMap(c => c.subs)).find(s => s.id === subId) ?? null : null
      if (subId && !sub) return fail(res, 404, `подкатегории ${subId} нет`)
      const theCat = sub ? lib.categories.find(c => c.subs.includes(sub))! : cat
      if (sub && !sub.kinds.has(kind)) {
        return fail(res, 400, `«${sub.title}» не бывает в режиме ${mode} (типы: ${[...sub.kinds].join(', ')})`)
      }
      if (theCat?.requires === 'friends' && friends.length < MIN_IDENTIFIED_FRIENDS) {
        return fail(res, 400, `«${theCat.title}»: опознай хотя бы ${MIN_IDENTIFIED_FRIENDS} человек`)
      }

      const session = sessionOf(String(req.query.session ?? 'default'))
      const scopeLib = theCat ? scoped(lib, theCat, sub ?? undefined) : lib
      const key = `${theCat?.id ?? '*'}|${sub?.id ?? '*'}|${friends.join(',')}`
      let room = session.rooms.get(key)
      if (!room) session.rooms.set(key, (room = new RoomQuestions(scopeLib, session.history)))
      let wrapped = false
      let q: Question
      try {
        q = room.pick(mode, { friends })
      } catch {
        // всё из среза уже было в этой «игре» лаборатории — новая игра, колода идёт по новому кругу
        session.rooms.set(key, (room = new RoomQuestions(scopeLib, session.history)))
        q = room.pick(mode, { friends })
        wrapped = true
      }
      res.json({ question: q, meta: metaOf(lib, q), wrapped })
    } catch (err) {
      fail(res, 404, (err as Error).message)
    }
  })

  // колоды сессии с нуля
  router.post('/reset', (req, res) => {
    sessions.delete(String(req.query.session ?? 'default'))
    res.json({ ok: true })
  })

  return router
}
