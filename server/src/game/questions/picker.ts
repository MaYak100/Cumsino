// server/src/game/questions/picker.ts
// Выбор вопроса на раунд. Режим (цикл RoundSelector) — первый фильтр: mc для all / kerri, closest для closest.
// Дальше категория по весу этого типа (MC / closest — categories.ts) среди тех, у кого есть подкатегории этого типа,
// внутри — подкатегория по весу, из её колоды — вопрос. Оба выбора сглажены (smooth.ts) и подстраиваются под оценки
// игроков. Тема вопроса («субъект\nаспект») склеивается здесь, в decorate.
//
// Колода подкатегории живёт между играми (history.ts): вопрос берётся из тех, что не выпадали в текущем круге;
// круг кончился — колода начинается заново, но вопросы этой и прошлой игры остаются заблокированы. В одной игре
// вопрос не повторяется никогда; не повторяется он и в соседней игре — если брать нечего, подкатегория в этот раз
// пропускается и выбирается следующая (маленькие колоды: у «Игры вместе» при двух опознанных две карточки).
// Комната помнит свои карточки сама: соседняя комната перезаписывает запись карточки в history.
import { withUnit, joinTopic, type GameMode, type Question } from '@cumsino/shared'
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

/** undefined — не менять, null — снять */
export interface RatingVote {
  score?: number | null
  difficulty?: number | null
}

/** Кто голосует: id — ключ голоса (у двух игроков с одним ником голоса разные), roomPlayers — делитель оценки
 *  команды, как в report этого показа. */
export interface Voter {
  id: string
  name: string
  roomPlayers: number
}

export interface QuestionSource {
  pick(mode: GameMode, ctx?: PickContext): Question
  report?(q: Question, r: RoundReport): void
  rate?(q: Question, voter: Voter, vote: RatingVote): void
}

// Оценки → веса. Точка — показанный вопрос, её значение — средняя оценка команды (history.ts). Оценка
// категории / подкатегории = сумма точек / (показов + RATING_PRIOR): пять показов форы, чтобы пара голосов не
// переворачивала вес. Одна оценка на id (`cat:<id>`, `sub:<id>`) — двигает вес и в MC, и в «кто ближе».
// Сырой множитель e^(RATING_BETA · оценка); итоговый — только ОТНОСИТЕЛЬНЫЙ (relativeMultipliers): среди соседей
// (категории между собой, подкатегории внутри категории) сумма весов не меняется. Всем всё нравится одинаково —
// веса базовые.
// Предел — ПРОИЗВЕДЕНИЕ множителей категории и подкатегории в [1/2, 2], т. е. доля подкатегории от базовой — не
// больше чем вдвое в любую сторону (раньше каждый множитель ограничивался отдельно и вместе доходили до ×4).
// Выбор двухступенчатый, поэтому у подкатегории свои пределы — [1/2 / c, 2 / c], где c — множитель её категории;
// раз сумма весов в каждой ступени сохраняется, доля подкатегории от базовой ровно c · m.
// Скорость (решение 2026-10-30, PRIOR 10 → 5, BETA 0.45 → 0.7): в компании из 6, где жмут все, 50 голосов
// «ахуенный» — это ~8 вопросов по +2: оценка 16.7 / (8.3 + 5) ≈ 1.25, e^(0.7 · 1.25) ≈ 2.4 против нейтральных
// соседей (было ×1.5); ×1.5 — уже с ~12 голосов (2 вопроса: 4 / (2 + 5) ≈ 0.58, e^0.4). Если жмёт половина, 50
// голосов дают ≈ ×1.7 (16.7 / 21.7 ≈ 0.77). Больше чем вдвое от базовой доли не уходит (предел выше).
export const RATING_MAX = 2
export const RATING_PRIOR = 5
export const RATING_BETA = 0.7

export function ratingScore(r: { n: number; sum: number }): number {
  return r.sum / (r.n + RATING_PRIOR)
}

/**
 * Относительные множители оценок среди соседей: m_i = clamp(k · e^(β·оценка_i), lo, hi), k подобран так, что
 * Σ w_i·m_i = Σ w_i (доля соседа от базовой — ровно m_i). outer — множитель уровня выше (категории — для её
 * подкатегорий): пределы [1/RATING_MAX / outer, RATING_MAX / outer], чтобы outer · m было в [1/2, 2].
 */
export function relativeMultipliers(items: Weighted[], score: (key: string) => number, outer = 1):
  Map<string, number> {
  const live = items.filter(i => i.weight > 0)
  const raw = new Map(live.map(i => [i.key, Math.exp(RATING_BETA * score(i.key))]))
  const lo = 1 / RATING_MAX / outer
  const hi = RATING_MAX / outer
  const total = live.reduce((s, i) => s + i.weight, 0)
  const at = (k: number, key: string) => Math.max(lo, Math.min(hi, k * raw.get(key)!))
  // Σ w·clamp(k·r) не убывает по k: от Σw·lo (≤ Σw) до Σw·hi (≥ Σw) — корень бисекцией по log k
  let k = 1
  if (total > 0) {
    const sum = (k: number) => live.reduce((s, i) => s + i.weight * at(k, i.key), 0)
    let a = Math.log(lo) - Math.log(Math.max(...raw.values()))
    let b = Math.log(hi) - Math.log(Math.min(...raw.values()))
    for (let n = 0; n < 60; n++) {
      const mid = (a + b) / 2
      if (sum(Math.exp(mid)) < total) a = mid
      else b = mid
    }
    k = Math.exp((a + b) / 2)
  }
  const out = new Map<string, number>()
  for (const i of items) out.set(i.key, raw.has(i.key) ? at(k, i.key) : 1)
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
 * иначе любые свободные (deck.free: в игре — не было ни в этой, ни в прошлой игре). Свободных нет — null, picker
 * берёт другую подкатегорию. build может не собрать вопрос (статистика, друзья) — тогда следующий.
 * group — выбор сначала группы, потом карточки (друзья: человек, у которого больше карточек, не выпадает чаще).
 */
export function drawFromDeck<T, Q extends Question = Question>(cands: T[], card: (t: T) => string, deck: DeckAccess,
  rng: () => number, build: (t: T) => Q | null, group?: (t: T) => string): Q | null {
  const order = group ? interleaveGroups(shuffleArray(cands, rng), group, rng) : shuffleArray(cands, rng)
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

/** Группы в случайном порядке, карточки по кругу: первые карточки всех групп, потом вторые… После фильтра
 *  свежести первой оказывается карточка случайной группы среди тех, у кого свежие остались. */
export function interleaveGroups<T>(shuffled: T[], group: (t: T) => string, rng: () => number): T[] {
  const byGroup = new Map<string, T[]>()
  for (const t of shuffled) {
    const g = group(t)
    let list = byGroup.get(g)
    if (!list) byGroup.set(g, (list = []))
    list.push(t)
  }
  const lists = shuffleArray([...byGroup.values()], rng)
  const out: T[] = []
  for (let i = 0; out.length < shuffled.length; i++) for (const list of lists) if (i < list.length) out.push(list[i])
  return out
}

/** Вопрос от источника до decorate: displayTopic — только субъект, aspect — своя вторая строка темы (банк). */
type Drafted = Question & { aspect?: string }

export class RoomQuestions implements QuestionSource {
  private gameNo = 0
  /** свои карточки этой игры (`колода|карточка`): history хранит одну запись на карточку, и соседняя комната
   *  её перезаписывает — по ней одной комната могла бы взять свою же карточку второй раз */
  private taken = new Set<string>()
  /**
   * Не собравшие вопрос в этой игре (`тип|cat|id`, `тип|sub|id`) — до конца игры не кандидаты: ни в выборе, ни
   * в начислении кредита. Иначе неспособная подкатегория копит кредит (до +3) и в следующей игре идёт серией.
   * Расход в игре только растёт (колода, исключения статистики), поэтому раз не собралась — не соберётся.
   */
  private exhausted = new Set<string>()
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
    const live = (level: 'cat' | 'sub', id: string) => !this.exhausted.has(`${kind}|${level}|${id}`)
    const cats = this.lib.categories.filter(c =>
      (c.requires !== 'friends' || present.length >= MIN_IDENTIFIED_FRIENDS) && live('cat', c.id) &&
      c.subs.some(s => s.kinds.has(kind)))
    const catMult = this.multipliers(cats.map(c => ({ key: c.id, weight: c.weights[kind] })), 'cat')
    const catItems = cats.map(c => ({ key: c.id, weight: c.weights[kind] * catMult.get(c.id)! }))
    const catScope = `cat:${kind}`
    const catCredits = this.history.creditsOf(catScope)

    const failedCats = new Set<string>()
    for (const catId of smoothOrder(catItems, catCredits, this.rng)) {
      const cat = cats.find(c => c.id === catId)!
      const subs = cat.subs.filter(s => s.kinds.has(kind) && live('sub', s.id))
      const subBase = subs.map(s => ({ key: s.id, weight: s.weights[kind] }))
      const subMult = this.multipliers(subBase, 'sub', catMult.get(cat.id)!)
      const subItems = subBase.map(s => ({ key: s.key, weight: s.weight * subMult.get(s.key)! }))
      const subScope = `sub:${kind}:${cat.id}`
      const subCredits = this.history.creditsOf(subScope)
      const failedSubs = new Set<string>()
      for (const subId of smoothOrder(subItems, subCredits, this.rng)) {
        const sub = subs.find(s => s.id === subId)!
        const q = this.build(sub, mode, kind, present)
        if (!q) {
          failedSubs.add(subId)
          this.exhausted.add(`${kind}|sub|${subId}`)
          continue
        }
        commitChoice(catItems.filter(c => !failedCats.has(c.key)), catId, catCredits)
        commitChoice(subItems.filter(s => !failedSubs.has(s.key)), subId, subCredits)
        this.history.saveCredits(catScope)
        this.history.saveCredits(subScope)
        return this.decorate(q, mode, cat, sub)
      }
      failedCats.add(catId)
      this.exhausted.add(`${kind}|cat|${catId}`)
    }
    throw new Error(`нет ни одного вопроса для режима ${mode}`)
  }

  report(q: Question, r: RoundReport): void {
    if (!q.category || !q.subcategory) return
    this.history.showing({
      questionId: q.id, category: q.category, sub: q.subcategory, mode: q.mode, gameNo: this.gameNo, ...r,
    })
  }

  rate(q: Question, voter: Voter, vote: RatingVote): void {
    if (!q.category || !q.subcategory) return
    this.history.rate({
      questionId: q.id, category: q.category, sub: q.subcategory, gameNo: this.gameNo,
      player: voter.id, name: voter.name, score: vote.score, difficulty: vote.difficulty,
    }, { text: q.text, roomPlayers: voter.roomPlayers })
  }

  /** Относительный множитель оценок среди этих соседей (outer — множитель категории для её подкатегорий). */
  private multipliers(items: Weighted[], prefix: 'cat' | 'sub', outer = 1): Map<string, number> {
    return relativeMultipliers(items, key => ratingScore(this.history.ratingOf(`${prefix}:${key}`)), outer)
  }

  private deck(sub: Subcategory): DeckAccess {
    const h = this.history
    const mine = (c: string) => this.taken.has(`${sub.id}|${c}`)
    return {
      fresh: c => !mine(c) && h.isFresh(sub.id, c, this.gameNo),
      free: c => !mine(c) && !h.archived.has(c) && !h.blockedFor(sub.id, c, this.gameNo),
      take: c => {
        this.taken.add(`${sub.id}|${c}`)
        h.take(sub.id, c, this.gameNo)
      },
      newCycle: () => h.newCycle(sub.id),
    }
  }

  private build(sub: Subcategory, mode: GameMode, kind: QuestionKind, present: number[]): Drafted | null {
    const src = sub.source
    if (src.type === 'bank') {
      const cands = src.questions.filter(q => kind === 'mc' || q.kind === 'number')
      return drawFromDeck(cands, q => q.id, this.deck(sub), this.rng, q => this.fromBank(q, kind))
    }
    if (src.type === 'stats') return this.stats?.build(src.sub, mode, this.deck(sub)) ?? null
    if (!this.friends) return null
    const cands = src.kind.candidates(this.friends, present)
    return drawFromDeck(cands, c => c.card, this.deck(sub), this.rng, c => c.build(), c => c.group)
  }

  private fromBank(q: BankQuestion, kind: QuestionKind): Drafted {
    const base = { id: q.id, topic: '', displayTopic: q.topic, aspect: q.aspect, comment: q.comment, text: q.text }
    if (q.kind === 'number') {
      if (kind === 'closest') return { ...base, mode: 'closest', numericAnswer: q.answer, unit: q.unit }
      const { values, correct } = makeStepOptions(q.answer, q.step, this.rng)
      // единица прямо в варианте («175%», «12 сек.»): ответ сравнивается по тексту варианта
      const labels = values.map(v => withUnit(formatNumber(v), q.unit))
      return { ...base, mode: 'all', options: shuffleArray(labels, this.rng), answer: labels[correct], unit: q.unit }
    }
    const { options, optionNotes } = shuffleOptions(q.options, q.optionNotes, this.rng)
    return { ...base, mode: 'all', options, optionNotes, answer: q.options[0] }
  }

  /**
   * Тема — единственное место склейки: субъект (постоянный у подкатегории, иначе от источника — displayTopic
   * черновика) + аспект (вопроса банка, иначе подкатегории). topic — заголовок подкатегории (для /dev и логов).
   */
  private decorate(q: Drafted, mode: GameMode, cat: Category, sub: Subcategory): Question {
    const { aspect, ...rest } = q
    return {
      ...rest,
      mode,
      topic: sub.title,
      displayTopic: joinTopic(sub.subject ?? q.displayTopic ?? sub.title, aspect ?? sub.aspect),
      category: cat.id,
      subcategory: sub.id,
    }
  }
}
