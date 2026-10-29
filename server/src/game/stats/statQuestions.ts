// server/src/game/stats/statQuestions.ts
// Вопросы на статистике (STRATZ + OpenDota): собираются из scripts/data/stats/bank.json при каждом показе.
// Сборщик банка и правила — scripts/build_stats_bank.py, docs/questions/stratz-research.md.
import type { GameMode, Question } from '@cumsino/shared'

export type StatEntry = [name: string, value: number, note: string]
export interface StatAsk { ask: 'max' | 'min'; text: string }
export interface StatMcPool { subject?: string; entries: StatEntry[]; asks: StatAsk[] }
export interface StatClosestPool { subject: string; text: string; answer: number }
/** Отрыв лидера: rel — во сколько раз, abs — на сколько единиц; maxRel — не дальше ×N от второго места. */
export interface StatGap { rel?: number; abs?: number; maxRel?: number }
/** Формат подписей: count — числа (к/М), pct — доля 0…1 → «53.5%», pct0 — «62%», pp — п.п. «+1.4». */
export type StatNoteFormat = 'count' | 'pct' | 'pct0' | 'pp'


export interface StatSubcategory {
  id: string
  mode: 'mc' | 'closest'
  topic: string
  display: string
  comment: string
  weight: number
  gap?: StatGap
  /** Подписи считаются по value показанной четвёрки; нет — берётся note из entries. */
  note?: StatNoteFormat
  /** talent_tree — варианты не перемешиваются, стоят как в дереве талантов игры. */
  layout?: 'talent_tree'
  /** Пары, которые не ставятся в одну четвёрку (компонент и его улучшение — ответ угадывается логикой). */
  exclusive?: Array<[string, string]>
  pools: Array<StatMcPool | StatClosestPool>
}

export interface StatsBank {
  snapshot: string
  patch: string
  subcategories: StatSubcategory[]
}

const OPTIONS = 4

/**
 * Таланты: на какой стороне дерева стоит первый слот пары (меньший AbilityN в файле героя) — справа.
 * Подтверждено в игре (Anti-Mage, 2026-10-29): 25 ур. слева «−50 сек. перезарядки Mana Void», справа «−1 сек.
 * перезарядки Blink»; 20 ур. слева «+0.8 сек. оглушения от Mana Void», справа «+125 к дальности Blink» — в пуле
 * первые слоты пар как раз Blink.
 */
export const TALENT_FIRST_SLOT_SIDE: 'left' | 'right' = 'right'

/**
 * Порядок показа для layout talent_tree: индексы entries пула ([20 первый, 20 второй, 25 первый, 25 второй]) в сетке
 * 2×2 (0, 1 — верхний ряд; 2, 3 — нижний): сверху 25 уровень (лево, право), снизу 20 уровень — как в игре.
 */
export function talentTreeOrder(firstSide: 'left' | 'right' = TALENT_FIRST_SLOT_SIDE): number[] {
  return firstSide === 'right' ? [3, 2, 1, 0] : [2, 3, 0, 1]
}

/** Лидер отрывается от соперника: abs — на столько единиц, rel — на такую долю (для min — от лидера). */
export function gapOk(lead: number, other: number, gap: StatGap, ask: 'max' | 'min'): boolean {
  const d = ask === 'max' ? lead - other : other - lead
  if (d <= 0) return false
  if (gap.abs !== undefined) return d >= gap.abs - 1e-9
  const base = Math.abs(ask === 'max' ? other : lead)
  return base > 0 && d >= (gap.rel ?? 0) * base - 1e-9
}

/** Лидер не дальше maxRel от соперника (проверяется для второго места — иначе ответ очевиден: ×170 у ботинок). */
export function capOk(lead: number, other: number, gap: StatGap, ask: 'max' | 'min'): boolean {
  if (gap.maxRel === undefined) return true
  const [hi, lo] = ask === 'max' ? [lead, other] : [other, lead]
  return lo > 0 && hi <= gap.maxRel * lo + 1e-9
}

const SUFFIXES: Array<[number, string]> = [[1e6, 'М'], [1e3, 'к']]

/**
 * Подписи четвёрки в одном формате: одна точность и общий суффикс по максимуму («37.4М, 10.0М, 5.7М»,
 * а не «37.4М, 10М»; «99.4к, 0.4к, 7.6к», а не «99к, 437, 7.6к»). lead — индекс ответа: если его подпись совпала с
 * чужой, добавляется знак после точки (до двух).
 */
export function formatNotes(values: number[], fmt: StatNoteFormat, lead?: number): string[] {
  const top = Math.max(...values.map(Math.abs))
  const [div, suf] = fmt === 'count' ? SUFFIXES.find(([d]) => top >= d) ?? [1, ''] : [1, '']
  const base = fmt === 'pct0' ? 0 : fmt === 'count' && top / div >= 100 ? 0 : 1
  const one = (v: number, digits: number): string => {
    if (fmt === 'pct' || fmt === 'pct0') return `${(100 * v).toFixed(digits)}%`
    if (fmt === 'pp') {
      const t = Math.abs(v).toFixed(digits)
      return Number(t) === 0 ? t : `${v > 0 ? '+' : '−'}${t}`
    }
    const t = (v / div).toFixed(digits)
    if (Number(t) === 0 && v !== 0) return `<${(10 ** -digits).toFixed(digits)}${suf}`
    return `${t}${suf}`
  }
  let digits = base
  let notes = values.map(v => one(v, digits))
  while (lead !== undefined && digits < base + 2 && notes.some((n, i) => i !== lead && n === notes[lead])) {
    digits++
    notes = values.map(v => one(v, digits))
  }
  return notes
}

/** Доступ к колоде подкатегории (questions/deck.ts): карточка — id вопроса (`stat:<подкатегория>:<имя>`). */
export interface DeckAccess {
  /** не выпадала в текущем круге колоды (и не в этой / прошлой игре) */
  fresh(card: string): boolean
  /** не выпадала в этой игре */
  free(card: string): boolean
  take(card: string): void
  newCycle(): void
}

/** Колода без памяти между играми — для тестов и отладки. */
export function gameOnlyDeck(): DeckAccess {
  const taken = new Set<string>()
  return {
    fresh: c => !taken.has(c), free: c => !taken.has(c), take: c => { taken.add(c) }, newCycle() {},
  }
}

/**
 * Сборщик на одну игру (подкатегорию выбирает questions/picker.ts). Вопрос комбинаторный: шаблон (текст) +
 * сочетание вариантов. Поэтому:
 *  - колода между играми идёт по карточкам: у пулов с героем вопроса (контрпики, предметы героя) — по герою
 *    вопроса, у общих пулов (средние, винрейт) — по ответу (лидеру), чтобы ответом по кругу побывал каждый;
 *  - в одной игре шаблон без героя вопроса (`Кто больше всех лечит союзников?`) — не больше одного раза;
 *  - герой / предмет, попавший в варианты (и герой вопроса), до конца игры в подкатегории не появляется.
 * Порядок: четвёрка с отрывом лидера и свежей карточкой → (колода кончилась) новый круг → с отрывом, но
 * карточка не свежая → без гейта. Без гейта лидер отличается от второго и подписью.
 */
export class StatQuestionBuilder {
  private used = new Map<string, Set<string>>()
  private templates = new Set<string>()
  private conflicts = new Map<string, Map<string, Set<string>>>()

  constructor(private bank: StatsBank, private rng: () => number = Math.random) {}

  subcategory(id: string): StatSubcategory | undefined {
    return this.bank.subcategories.find(s => s.id === id)
  }

  build(sub: StatSubcategory, mode: GameMode, deck: DeckAccess): Question | null {
    if ((sub.mode === 'closest') !== (mode === 'closest')) return null
    return sub.mode === 'mc' ? this.buildMc(sub, mode, deck) : this.buildClosest(sub, deck)
  }

  static card(sub: StatSubcategory, name: string): string {
    return `stat:${sub.id}:${name}`
  }

  private usedOf(sub: StatSubcategory): Set<string> {
    let set = this.used.get(sub.id)
    if (!set) this.used.set(sub.id, (set = new Set()))
    return set
  }

  private buildMc(sub: StatSubcategory, mode: GameMode, deck: DeckAccess): Question | null {
    const used = this.usedOf(sub)
    const pools = this.shuffle((sub.pools as StatMcPool[])
      .filter(p => !(p.subject && used.has(p.subject)))
      .map(p => ({ pool: p, free: p.entries.filter(e => !used.has(e[0])) }))
      .filter(({ free }) => free.length >= OPTIONS))
    if (!pools.length) return null

    const gap = sub.gap ?? {}
    const clash = this.conflictsOf(sub)
    const card = (pool: StatMcPool, lead: StatEntry) => StatQuestionBuilder.card(sub, pool.subject ?? lead[0])
    const attempt = (gated: boolean, ok: (c: string) => boolean) => {
      for (const { pool, free } of pools) {
        if (pool.subject && !ok(StatQuestionBuilder.card(sub, pool.subject))) continue
        for (const ask of this.shuffle(pool.asks)) {
          if (!pool.subject && this.templates.has(`${sub.id}|${ask.text}`)) continue
          const leadOk = pool.subject ? () => true : (e: StatEntry) => ok(card(pool, e))
          const picked = gated ? this.gatedSet(free, gap, ask.ask, clash, leadOk) : this.ungatedSet(sub, free, ask.ask, clash, leadOk)
          if (picked) return { pool, ask, picked }
        }
      }
      return null
    }
    let found = attempt(true, c => deck.fresh(c))
    if (!found) {
      const stale = attempt(true, c => deck.free(c))
      if (stale) {
        deck.newCycle()
        found = attempt(true, c => deck.fresh(c)) ?? stale
      }
    }
    found ??= attempt(false, c => deck.fresh(c)) ?? attempt(false, c => deck.free(c))
    if (!found) return null
    const { pool, ask, picked } = found
    const id = card(pool, picked[0])
    deck.take(id)
    if (!pool.subject) this.templates.add(`${sub.id}|${ask.text}`)
    return this.mcQuestion(sub, mode, pool, ask, picked, id)
  }

  /** Лидер — случайный из тех, у кого ≥ 3 совместимых соперника с отрывом (и с maxRel — один из них в пределе:
   *  он и будет вторым местом); соперники — случайные из подходящих. */
  private gatedSet(free: StatEntry[], gap: StatGap, ask: 'max' | 'min', clash: Map<string, Set<string>>,
    leadOk: (e: StatEntry) => boolean): StatEntry[] | null {
    for (const lead of this.shuffle(free)) {
      if (!leadOk(lead)) continue
      const rivals = free.filter(o => o !== lead && gapOk(lead[1], o[1], gap, ask))
      if (gap.maxRel === undefined) {
        const set = this.compatible([lead], rivals, clash)
        if (set) return set
        continue
      }
      // второе место — в пределах maxRel, остальные — любые с отрывом (они ниже второго места не обязаны быть)
      for (const near of this.shuffle(rivals.filter(o => capOk(lead[1], o[1], gap, ask)))) {
        if (clash.get(lead[0])?.has(near[0])) continue
        const set = this.compatible([lead, near], rivals, clash)
        if (set) return set
      }
    }
    return null
  }

  /** Без гейта: случайная совместимая четвёрка, где лидер отличается от второго и подписью (иначе «49.8%» против «49.8%»). */
  private ungatedSet(sub: StatSubcategory, free: StatEntry[], ask: 'max' | 'min', clash: Map<string, Set<string>>,
    leadOk: (e: StatEntry) => boolean): StatEntry[] | null {
    for (let attempt = 0; attempt < 20; attempt++) {
      const set = this.compatible([], free, clash)
      if (!set) return null
      const sorted = set.sort((a, b) => (ask === 'max' ? b[1] - a[1] : a[1] - b[1]))
      // подписи — в обычной точности, без добавочных знаков: «49.8%» против «49.8%» не годится
      const notes = sub.note ? formatNotes(sorted.map(e => e[1]), sub.note) : sorted.map(e => e[2])
      if (sorted[0][1] !== sorted[1][1] && notes[0] !== notes[1] && leadOk(sorted[0])) return sorted
    }
    return null
  }

  /** Дополнить start до 4 вариантов случайными из pool, не ставя рядом несовместимые; не вышло — null. */
  private compatible(start: StatEntry[], pool: StatEntry[], clash: Map<string, Set<string>>): StatEntry[] | null {
    const set = [...start]
    for (const e of this.shuffle(pool)) {
      if (set.length === OPTIONS) break
      if (!set.some(s => s === e || clash.get(s[0])?.has(e[0]))) set.push(e)
    }
    return set.length === OPTIONS ? set : null
  }

  private conflictsOf(sub: StatSubcategory): Map<string, Set<string>> {
    let map = this.conflicts.get(sub.id)
    if (!map) {
      map = new Map()
      for (const [a, b] of sub.exclusive ?? []) {
        if (!map.has(a)) map.set(a, new Set())
        if (!map.has(b)) map.set(b, new Set())
        map.get(a)!.add(b)
        map.get(b)!.add(a)
      }
      this.conflicts.set(sub.id, map)
    }
    return map
  }

  private mcQuestion(sub: StatSubcategory, mode: GameMode, pool: StatMcPool, ask: StatAsk, picked: StatEntry[],
    id: string): Question {
    const used = this.usedOf(sub)
    if (pool.subject) used.add(pool.subject)
    for (const e of picked) used.add(e[0])
    const shown = this.arrange(sub, pool, picked)
    const notes = sub.note
      ? formatNotes(shown.map(e => e[1]), sub.note, shown.indexOf(picked[0]))
      : shown.map(e => e[2])
    return {
      id,
      mode,
      topic: sub.topic,
      displayTopic: pool.subject ? `${sub.display}: ${pool.subject}` : sub.display,
      comment: sub.comment,
      text: ask.text,
      options: shown.map(e => e[0]),
      optionNotes: notes,
      answer: picked[0][0],
    }
  }

  /** Порядок вариантов: обычно случайный; talent_tree — как в дереве талантов (весь пул из 4 талантов героя). */
  private arrange(sub: StatSubcategory, pool: StatMcPool, picked: StatEntry[]): StatEntry[] {
    if (sub.layout === 'talent_tree' && pool.entries.length === OPTIONS && picked.length === OPTIONS) {
      return talentTreeOrder().map(i => pool.entries[i])
    }
    return this.shuffle(picked)
  }

  private buildClosest(sub: StatSubcategory, deck: DeckAccess): Question | null {
    const used = this.usedOf(sub)
    const free = (sub.pools as StatClosestPool[]).filter(p => !used.has(p.subject))
    const card = (p: StatClosestPool) => StatQuestionBuilder.card(sub, p.subject)
    let cands = free.filter(p => deck.fresh(card(p)))
    if (!cands.length) {
      cands = free.filter(p => deck.free(card(p)))
      if (!cands.length) return null
      deck.newCycle()
      const fresh = cands.filter(p => deck.fresh(card(p)))
      if (fresh.length) cands = fresh
    }
    const pool = cands[Math.floor(this.rng() * cands.length)]
    used.add(pool.subject)
    deck.take(card(pool))
    return {
      id: card(pool),
      mode: 'closest',
      topic: sub.topic,
      displayTopic: `${sub.display}: ${pool.subject}`,
      comment: sub.comment,
      text: pool.text,
      numericAnswer: pool.answer,
      unit: '%',   // closest-пулы статистики — доли матчей в процентах (пики, баны)
    }
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
}
