// server/src/game/stats/statQuestions.ts
// Вопросы на статистике (STRATZ + OpenDota): собираются из scripts/data/stats/bank.json при каждом показе.
// Сборщик банка и правила — scripts/build_stats_bank.py, docs/questions/stratz-research.md.
import type { GameMode, Question } from '@cumsino/shared'

export type StatEntry = [name: string, value: number, note: string]
export interface StatAsk { ask: 'max' | 'min'; text: string }
export interface StatMcPool { subject?: string; entries: StatEntry[]; asks: StatAsk[] }
export interface StatClosestPool { subject: string; text: string; answer: number }
export interface StatGap { rel?: number; abs?: number }

export interface StatSubcategory {
  id: string
  mode: 'mc' | 'closest'
  topic: string
  display: string
  comment: string
  weight: number
  gap?: StatGap
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

/** Лидер отрывается от соперника: abs — на столько единиц, rel — на такую долю (для min — от лидера). */
export function gapOk(lead: number, other: number, gap: StatGap, ask: 'max' | 'min'): boolean {
  const d = ask === 'max' ? lead - other : other - lead
  if (d <= 0) return false
  if (gap.abs !== undefined) return d >= gap.abs - 1e-9
  const base = Math.abs(ask === 'max' ? other : lead)
  return base > 0 && d >= (gap.rel ?? 0) * base - 1e-9
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
          const picked = gated ? this.gatedSet(free, gap, ask.ask, clash, leadOk) : this.ungatedSet(free, ask.ask, clash, leadOk)
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

  /** Лидер — случайный из тех, у кого ≥ 3 совместимых соперника с отрывом; соперники — случайные из подходящих. */
  private gatedSet(free: StatEntry[], gap: StatGap, ask: 'max' | 'min', clash: Map<string, Set<string>>,
    leadOk: (e: StatEntry) => boolean): StatEntry[] | null {
    for (const lead of this.shuffle(free)) {
      if (!leadOk(lead)) continue
      const rivals = free.filter(o => o !== lead && gapOk(lead[1], o[1], gap, ask))
      const set = this.compatible([lead], rivals, clash)
      if (set) return set
    }
    return null
  }

  /** Без гейта: случайная совместимая четвёрка, где лидер отличается от второго и подписью (иначе «49.8%» против «49.8%»). */
  private ungatedSet(free: StatEntry[], ask: 'max' | 'min', clash: Map<string, Set<string>>,
    leadOk: (e: StatEntry) => boolean): StatEntry[] | null {
    for (let attempt = 0; attempt < 20; attempt++) {
      const set = this.compatible([], free, clash)
      if (!set) return null
      const sorted = set.sort((a, b) => (ask === 'max' ? b[1] - a[1] : a[1] - b[1]))
      if (sorted[0][1] !== sorted[1][1] && sorted[0][2] !== sorted[1][2] && leadOk(sorted[0])) return sorted
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
    const shown = this.shuffle(picked)
    return {
      id,
      mode,
      topic: sub.topic,
      displayTopic: pool.subject ? `${sub.display}: ${pool.subject}` : sub.display,
      comment: sub.comment,
      text: ask.text,
      options: shown.map(e => e[0]),
      optionNotes: shown.map(e => e[2]),
      answer: picked[0][0],
    }
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
