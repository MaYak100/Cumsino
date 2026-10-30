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
  /** id игроков в комнате при показе: голосовать за этот вопрос смогут только они (нет — кто угодно) */
  present?: string[]
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

/**
 * Источник вопросов комнаты. Жизненный цикл показа: pick → report (раунд посчитан, показ открыт, можно голосовать)
 * → rate (сколько угодно раз, голос сразу в весах) → settle (показ закрыт: по итоговым голосам решается «удалить»).
 * report следующего вопроса сам закрывает прошлый показ; settle() без аргумента закрывает открытый — его зовут, когда
 * комната закрывается (GameRoom.destroy).
 */
export interface QuestionSource {
  pick(mode: GameMode, ctx?: PickContext): Question
  report?(q: Question, r: RoundReport): void
  rate?(q: Question, voter: Voter, vote: RatingVote): void
  settle?(q?: Question): void
}

// Оценки → веса. Точка — показанный вопрос, её значение — средняя оценка команды (history.ts). Оценка
// категории / подкатегории = сумма точек / (показов + RATING_PRIOR): пять показов форы, чтобы пара голосов не
// переворачивала вес. Одна оценка на id (`cat:<id>`, `sub:<id>`) — двигает вес и в MC, и в «кто ближе».
// Сырой множитель e^(RATING_BETA · оценка); итоговый — только ОТНОСИТЕЛЬНЫЙ (relativeMultipliers): среди соседей
// (категории между собой, подкатегории внутри категории) сумма весов не меняется. Всем всё нравится одинаково —
// веса базовые.
// Предел — ПРОИЗВЕДЕНИЕ множителей категории и подкатегории в [1/2, 2], т. е. доля подкатегории от базовой — не
// больше чем вдвое в любую сторону (раньше каждый множитель ограничивался отдельно и вместе доходили до ×4).
// Раз сумма весов в каждой ступени сохраняется, доля подкатегории от базовой ровно c · m (c — категории, m —
// подкатегории). Лимит делится так (2026-10-30): сначала подкатегории внутри категории — m в [1/2, 2] сами по себе,
// потом категория — в пределах, которые оставляют её подкатегории: c ∈ [1/2 / min m, 2 / max m]. Раньше было
// наоборот (c сначала, у подкатегорий [1/2 / c, 2 / c]), и на пределе категории (c = 2) у подкатегорий не
// оставалось места: сумма весов сохраняется, все m ≤ 1 — значит все ровно 1, порядок подкатегорий терялся.
// Теперь любимая подкатегория забирает свою долю внутри категории, а категория растёт, сколько осталось.
// Скорость (PRIOR 5, BETA 0.47 — в полтора раза медленнее, чем 0.7, решение 2026-10-30): один вопрос, который вся
// команда оценила +2, — оценка 2 / (1 + 5) ≈ 0.33, сырой e^(0.47 · 0.33) ≈ ×1.17. ×1.5 — с ~4 таких вопросов
// (8 / 9 ≈ 0.89, e^0.42). В компании из 6, где жмут все, 50 голосов «ахуенный» (~8 вопросов по +2) — оценка
// 16.7 / 13.3 ≈ 1.25, e^0.59 ≈ ×1.8; жмёт половина — ≈ ×1.4. Размер лобби скорость не меняет: точка — среднее по
// комнате. Больше чем вдвое от базовой доли не уходит (предел выше).
export const RATING_MAX = 2
export const RATING_PRIOR = 5
export const RATING_BETA = 0.47

export function ratingScore(r: { n: number; sum: number }): number {
  return r.sum / (r.n + RATING_PRIOR)
}

/**
 * Относительные множители оценок среди соседей: m_i = clamp(k · e^(β·оценка_i), lo, hi), k подобран так, что
 * Σ w_i·m_i = Σ w_i (доля соседа от базовой — ровно m_i). bounds — пределы: число outer (множитель уровня выше) —
 * общие [1/RATING_MAX / outer, RATING_MAX / outer]; функция — свои у каждого ключа (категории — по разбросу её
 * подкатегорий, см. RoomQuestions.pick). Пределы должны охватывать 1 (lo ≤ 1 ≤ hi), иначе сумма не сохранится.
 */
export function relativeMultipliers(items: Weighted[], score: (key: string) => number,
  bounds: number | ((key: string) => [number, number]) = 1): Map<string, number> {
  const live = items.filter(i => i.weight > 0)
  const raw = new Map(live.map(i => [i.key, Math.exp(RATING_BETA * score(i.key))]))
  const range = typeof bounds === 'function' ? bounds
    : (): [number, number] => [1 / RATING_MAX / bounds, RATING_MAX / bounds]
  const lim = new Map(live.map(i => [i.key, range(i.key)]))
  const total = live.reduce((s, i) => s + i.weight, 0)
  const at = (k: number, key: string) => {
    const [lo, hi] = lim.get(key)!
    return Math.max(lo, Math.min(hi, k * raw.get(key)!))
  }
  // Σ w·clamp(k·r) не убывает по k: от Σw·lo (≤ Σw) до Σw·hi (≥ Σw) — корень бисекцией по log k
  let k = 1
  if (total > 0) {
    const sum = (k: number) => live.reduce((s, i) => s + i.weight * at(k, i.key), 0)
    let a = Math.min(...live.map(i => Math.log(lim.get(i.key)![0]) - Math.log(raw.get(i.key)!)))
    let b = Math.max(...live.map(i => Math.log(lim.get(i.key)![1]) - Math.log(raw.get(i.key)!)))
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
 * weight — у групп веса (drawWeighted): опознанные друзья выпадают чаще.
 */
export function drawFromDeck<T, Q extends Question = Question>(cands: T[], card: (t: T) => string, deck: DeckAccess,
  rng: () => number, build: (t: T) => Q | null, group?: (t: T) => string, weight?: (t: T) => number): Q | null {
  if (group && weight) return drawWeighted(cands, card, deck, rng, build, group, weight)
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

/**
 * Группа по весу, потом её карточка. Вес действует на частоту, а не только на порядок внутри круга: группа
 * выбирается среди всех, у кого есть свободные карточки (не было в этой и прошлой игре), с вероятностью ∝ весу;
 * внутри группы — сначала свежие (не было в текущем круге), потом свободные. Свежих нет ни у кого — новый круг.
 * (Обычный путь — первая группа со свежими — за круг показывает каждую карточку по разу, и вес бы выровнялся.)
 */
export function drawWeighted<T, Q extends Question = Question>(cands: T[], card: (t: T) => string, deck: DeckAccess,
  rng: () => number, build: (t: T) => Q | null, group: (t: T) => string, weight: (t: T) => number): Q | null {
  const free = cands.filter(t => deck.free(card(t)))
  if (!free.length) return null
  if (!free.some(t => deck.fresh(card(t)))) deck.newCycle()
  const byGroup = new Map<string, { w: number; list: T[] }>()
  for (const t of shuffleArray(free, rng)) {
    const g = group(t)
    let rec = byGroup.get(g)
    if (!rec) byGroup.set(g, (rec = { w: Math.max(1e-9, weight(t)), list: [] }))
    rec.list.push(t)
  }
  // взвешенный порядок без возвращения (Efraimidis–Spirakis): ключ u^(1/w), по убыванию
  const order = [...byGroup.values()].map(r => ({ r, key: Math.pow(rng(), 1 / r.w) })).sort((a, b) => b.key - a.key)
  for (const { r } of order) {
    const list = [...r.list.filter(t => deck.fresh(card(t))), ...r.list.filter(t => !deck.fresh(card(t)))]
    for (const t of list) {
      const q = build(t)
      if (!q) continue
      deck.take(card(t))
      return q
    }
  }
  return null
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

/** Попыток собрать вопрос статистики / друзей, прежде чем подкатегория выбудет до конца игры. */
export const BUILD_TRIES = 3

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
  /** показ, открытый для оценок (последний report): закрывается следующим report или settle() */
  private open: Question | null = null
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
      c.subs.some(s => s.kinds.has(kind) && live('sub', s.id)))
    // лимит произведения [1/2, 2]: сначала подкатегории внутри категории, категории — сколько они оставили
    const subsOf = new Map(cats.map(c => {
      const subs = c.subs.filter(s => s.kinds.has(kind) && live('sub', s.id))
      const base = subs.map(s => ({ key: s.id, weight: s.weights[kind] }))
      return [c.id, { subs, base, mult: this.multipliers(base, 'sub') }]
    }))
    const catBounds = (id: string): [number, number] => {
      const m = [...subsOf.get(id)!.mult.values()]
      return [1 / RATING_MAX / Math.min(...m), RATING_MAX / Math.max(...m)]
    }
    const catMult = this.multipliers(cats.map(c => ({ key: c.id, weight: c.weights[kind] })), 'cat', catBounds)
    const catItems = cats.map(c => ({ key: c.id, weight: c.weights[kind] * catMult.get(c.id)! }))
    const catScope = `cat:${kind}`
    const catCredits = this.history.creditsOf(catScope)

    const failedCats = new Set<string>()
    for (const catId of smoothOrder(catItems, catCredits, this.rng)) {
      const cat = cats.find(c => c.id === catId)!
      const { subs, base: subBase, mult: subMult } = subsOf.get(catId)!
      const subItems = subBase.map(s => ({ key: s.key, weight: s.weight * subMult.get(s.key)! }))
      const subScope = `sub:${kind}:${cat.id}`
      const subCredits = this.history.creditsOf(subScope)
      const failedSubs = new Set<string>()
      for (const subId of smoothOrder(subItems, subCredits, this.rng)) {
        const sub = subs.find(s => s.id === subId)!
        const q = this.buildTries(sub, mode, kind, present)
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

  /** Раунд посчитан: показ открыт для оценок. Прошлый открытый показ комнаты закрывается (settle). */
  report(q: Question, r: RoundReport): void {
    if (!q.category || !q.subcategory) return
    if (this.open && this.open.id !== q.id) this.settle(this.open)
    const { present, ...row } = r
    this.history.showing({
      questionId: q.id, category: q.category, sub: q.subcategory, mode: q.mode, gameNo: this.gameNo, ...row,
    }, present)
    this.open = q
  }

  /** Голос: сразу в весах. Не бывшего в комнате при показе (RoundReport.present) history не примет. */
  rate(q: Question, voter: Voter, vote: RatingVote): void {
    if (!q.category || !q.subcategory) return
    this.history.rate({
      questionId: q.id, category: q.category, sub: q.subcategory, gameNo: this.gameNo,
      player: voter.id, name: voter.name, score: vote.score, difficulty: vote.difficulty,
    }, { text: q.text, roomPlayers: voter.roomPlayers })
  }

  /** Показ закрыт — по итоговым голосам решается «удалить» (history.closeShowing). Без аргумента — открытый показ
   *  комнаты (комната закрывается). Повторный вызов ничего не делает. */
  settle(q: Question | null = this.open): void {
    if (!q) return
    if (q === this.open || q.id === this.open?.id) this.open = null
    if (this.gameNo) this.history.closeShowing(this.gameNo, q.id, q.text)
  }

  /** Относительный множитель оценок среди этих соседей (bounds — пределы, см. relativeMultipliers). */
  private multipliers(items: Weighted[], prefix: 'cat' | 'sub',
    bounds: number | ((key: string) => [number, number]) = 1): Map<string, number> {
    return relativeMultipliers(items, key => ratingScore(this.history.ratingOf(`${prefix}:${key}`)), bounds)
  }

  /**
   * Сборка с несколькими попытками: у статистики и друзей сборка случайная (четвёрка с отрывом, совместимые пары) и
   * может не выйти, когда вопрос есть. Подкатегория выбывает до конца игры (exhausted), только если не вышло
   * BUILD_TRIES раз подряд. Банк детерминирован — одна попытка.
   */
  private buildTries(sub: Subcategory, mode: GameMode, kind: QuestionKind, present: number[]): Drafted | null {
    const tries = sub.source.type === 'bank' ? 1 : BUILD_TRIES
    for (let n = 0; n < tries; n++) {
      const q = this.build(sub, mode, kind, present)
      if (q) return q
    }
    return null
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
    const weighted = cands.some(c => c.weight !== undefined)
    return drawFromDeck(cands, c => c.card, this.deck(sub), this.rng, c => c.build(), c => c.group,
      weighted ? c => c.weight ?? 1 : undefined)
  }

  private fromBank(q: BankQuestion, kind: QuestionKind): Drafted {
    const base = { id: q.id, topic: '', displayTopic: q.topic, aspect: q.aspect, comment: q.comment, text: q.text }
    if (q.kind === 'number') {
      if (kind === 'closest') return { ...base, mode: 'closest', numericAnswer: q.answer, unit: q.unit }
      const { values, correct } = makeStepOptions(q.answer, q.step, this.rng, 4, 0, q.ceil ?? Infinity)
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
