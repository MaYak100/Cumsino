// server/src/game/questions/picker.ts
// Выбор вопроса на раунд. Режим (цикл RoundSelector) — первый фильтр: mc для all / kerri, closest для closest.
// Дальше категория по весу среди тех, у кого есть подкатегории этого типа, внутри — подкатегория по весу,
// из её колоды — вопрос. Оба выбора сглажены (smooth.ts) и слабо подстраиваются под оценки игроков.
//
// Колода подкатегории живёт между играми (history.ts): вопрос берётся из тех, что не выпадали в текущем круге;
// круг кончился — колода начинается заново, но вопросы этой и прошлой игры остаются заблокированы. В одной игре
// вопрос не повторяется никогда.
import type { GameMode, Question } from '@cumsino/shared'
import type { Library, Category, Subcategory, BankQuestion, QuestionKind } from './library'
import { QuestionHistory } from './history'
import { smoothOrder, commitChoice, type Weighted } from './smooth'
import { makeStepOptions, formatNumber } from './stepOptions'
import { StatQuestionBuilder, type DeckAccess } from '../stats/statQuestions'
import { FriendsGen, MIN_IDENTIFIED_FRIENDS } from './friends'

export interface PickContext {
  /** account id опознанных в лобби людей из компании */
  friends?: number[]
}

export interface RoundReport {
  /** игроков в комнате — делитель оценки команды и порог «удалить» */
  roomPlayers: number
  players: number
  answered: number
  correct: number
  relErrors?: number[]
}

export interface RatingVote {
  score?: number | null
  difficulty?: number | null
}

export interface QuestionSource {
  pick(mode: GameMode, ctx?: PickContext): Question
  report?(q: Question, r: RoundReport): void
  rate?(q: Question, player: string, vote: RatingVote): void
}

// Оценки → веса. Точка — показанный вопрос, её значение — средняя оценка команды (history.ts). Оценка
// категории / подкатегории = сумма точек / (показов + RATING_PRIOR): десяток показов форы, чтобы пара голосов не
// переворачивала вес. Множитель только ОТНОСИТЕЛЬНЫЙ: среди соседей (категории между собой, подкатегории внутри
// категории) среднее множителей по базовым весам = 1. Если всем всё нравится одинаково — веса базовые; сдвиг не больше
// чем в RATING_EFFECT раз в любую сторону.
export const RATING_EFFECT = 1.5
export const RATING_PRIOR = 10
const RATING_BETA = Math.log(RATING_EFFECT)   // средняя «хороший» у всей команды (+1) → ×1.5 до нормализации

export function ratingScore(r: { n: number; sum: number }): number {
  return r.sum / (r.n + RATING_PRIOR)
}

export function relativeMultipliers(items: Weighted[], score: (key: string) => number): Map<string, number> {
  const live = items.filter(i => i.weight > 0)
  const raw = new Map(live.map(i => [i.key, Math.exp(RATING_BETA * score(i.key))]))
  const total = live.reduce((s, i) => s + i.weight, 0)
  const mean = total > 0 ? live.reduce((s, i) => s + i.weight * raw.get(i.key)!, 0) / total : 1
  const out = new Map<string, number>()
  for (const i of items) {
    const m = (raw.get(i.key) ?? 1) / mean
    out.set(i.key, Math.max(1 / RATING_EFFECT, Math.min(RATING_EFFECT, m)))
  }
  return out
}

function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Перемешать варианты вместе с подписями значений (подпись остаётся у своего варианта). */
export function shuffleOptions(options: string[], notes?: string[], rng: () => number = Math.random):
  { options: string[]; optionNotes?: string[] } {
  const order = shuffleArray(options.map((_, i) => i), rng)
  return {
    options: order.map(i => options[i]),
    optionNotes: notes && notes.length === options.length ? order.map(i => notes[i]) : undefined,
  }
}

/**
 * Вопрос из колоды: сначала свежие (не было в текущем круге), круг кончился — новый круг и снова свежие,
 * иначе любые, которых не было в этой игре. build может не собрать вопрос (статистика, друзья) — тогда следующий.
 */
export function drawFromDeck<T>(cands: T[], card: (t: T) => string, deck: DeckAccess, rng: () => number,
  build: (t: T) => Question | null): Question | null {
  const order = shuffleArray(cands, rng)
  const tryAll = (list: T[]) => {
    for (const t of list) {
      const q = build(t)
      if (q) return { t, q }
    }
    return null
  }
  let got = tryAll(order.filter(t => deck.fresh(card(t))))
  if (!got) {
    const stale = order.filter(t => !deck.fresh(card(t)) && deck.free(card(t)))
    if (stale.length) {
      deck.newCycle()
      got = tryAll(stale.filter(t => deck.fresh(card(t)))) ?? tryAll(stale)
    }
  }
  if (!got) return null
  deck.take(card(got.t))
  return got.q
}

export class RoomQuestions implements QuestionSource {
  private gameNo = 0
  private stats: StatQuestionBuilder | null
  private friends: FriendsGen | null

  constructor(private lib: Library, private history: QuestionHistory, private rng: () => number = Math.random) {
    this.stats = lib.stats ? new StatQuestionBuilder(lib.stats, rng) : null
    this.friends = lib.friends ? new FriendsGen(lib.friends, lib.heroNames, rng) : null
  }

  pick(mode: GameMode, ctx: PickContext = {}): Question {
    if (!this.gameNo) this.gameNo = this.history.startGame()
    const kind: QuestionKind = mode === 'closest' ? 'closest' : 'mc'
    const present = [...new Set(ctx.friends ?? [])]
    const cats = this.lib.categories.filter(c =>
      (c.requires !== 'friends' || present.length >= MIN_IDENTIFIED_FRIENDS) && c.subs.some(s => s.kinds.has(kind)))
    const catItems = this.rated(cats.map(c => ({ key: c.id, weight: c.weight })), 'cat')
    const catScope = `cat:${kind}`
    const catCredits = this.history.creditsOf(catScope)

    for (const catId of smoothOrder(catItems, catCredits, this.rng)) {
      const cat = cats.find(c => c.id === catId)!
      const subs = cat.subs.filter(s => s.kinds.has(kind))
      const subItems = this.rated(subs.map(s => ({ key: s.id, weight: s.weight })), 'sub')
      const subScope = `sub:${kind}:${cat.id}`
      const subCredits = this.history.creditsOf(subScope)
      for (const subId of smoothOrder(subItems, subCredits, this.rng)) {
        const sub = subs.find(s => s.id === subId)!
        const q = this.build(sub, mode, kind, present)
        if (!q) continue
        commitChoice(catItems, catId, catCredits)
        commitChoice(subItems, subId, subCredits)
        this.history.saveCredits(catScope)
        this.history.saveCredits(subScope)
        return this.decorate(q, mode, cat, sub)
      }
    }
    throw new Error(`нет ни одного вопроса для режима ${mode}`)
  }

  report(q: Question, r: RoundReport): void {
    if (!q.category || !q.subcategory) return
    this.history.showing({
      questionId: q.id, category: q.category, sub: q.subcategory, mode: q.mode, gameNo: this.gameNo, ...r,
    })
  }

  rate(q: Question, player: string, vote: RatingVote): void {
    if (!q.category || !q.subcategory) return
    this.history.rate({
      questionId: q.id, category: q.category, sub: q.subcategory, gameNo: this.gameNo, player,
      score: vote.score ?? null, difficulty: vote.difficulty ?? null,
    }, { text: q.text })
  }

  /** Базовые веса × относительный множитель оценок среди этих соседей. */
  private rated(items: Weighted[], prefix: 'cat' | 'sub'): Weighted[] {
    const mult = relativeMultipliers(items, key => ratingScore(this.history.ratingOf(`${prefix}:${key}`)))
    return items.map(i => ({ key: i.key, weight: i.weight * mult.get(i.key)! }))
  }

  private deck(sub: Subcategory): DeckAccess {
    const h = this.history
    return {
      fresh: c => h.isFresh(sub.id, c, this.gameNo),
      free: c => !h.archived.has(c) && !h.usedInGame(sub.id, c, this.gameNo),
      take: c => h.take(sub.id, c, this.gameNo),
      newCycle: () => h.newCycle(sub.id),
    }
  }

  private build(sub: Subcategory, mode: GameMode, kind: QuestionKind, present: number[]): Question | null {
    const src = sub.source
    if (src.type === 'bank') {
      const cands = src.questions.filter(q => kind === 'mc' || q.kind === 'number')
      return drawFromDeck(cands, q => q.id, this.deck(sub), this.rng, q => this.fromBank(q, kind))
    }
    if (src.type === 'stats') return this.stats?.build(src.sub, mode, this.deck(sub)) ?? null
    if (!this.friends) return null
    const cands = src.kind.candidates(this.friends, present)
    return drawFromDeck(cands, c => c.card, this.deck(sub), this.rng, c => c.build())
  }

  private fromBank(q: BankQuestion, kind: QuestionKind): Question {
    const base = { id: q.id, topic: '', displayTopic: q.topic, comment: q.comment, text: q.text }
    if (q.kind === 'number') {
      if (kind === 'closest') return { ...base, mode: 'closest', numericAnswer: q.answer }
      const { values, correct } = makeStepOptions(q.answer, q.step, this.rng)
      const labels = values.map(formatNumber)
      return { ...base, mode: 'all', options: shuffleArray(labels, this.rng), answer: labels[correct] }
    }
    const { options, optionNotes } = shuffleOptions(q.options, q.optionNotes, this.rng)
    return { ...base, mode: 'all', options, optionNotes, answer: q.options[0] }
  }

  private decorate(q: Question, mode: GameMode, cat: Category, sub: Subcategory): Question {
    return {
      ...q,
      mode,
      topic: q.topic || sub.title,
      displayTopic: q.displayTopic ?? sub.title,
      category: cat.id,
      subcategory: sub.id,
    }
  }
}
