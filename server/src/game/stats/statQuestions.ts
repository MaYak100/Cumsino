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

/**
 * Генератор на одну игру. Внутри подкатегории герой / предмет, попавший в варианты (и герой вопроса),
 * больше не появляется. Порядок: подкатегория по весу → пул, где осталось ≥ 4 свободных вариантов →
 * четвёрка с отрывом лидера (лидер случайный среди возможных) → если ни в одном пуле подкатегории четвёрки
 * нет — та же сборка без гейта. Подкатегория без свободного пула пропускается.
 */
export class StatQuestionPicker {
  private used = new Map<string, Set<string>>()
  private asked = new Map<string, number>()   // сколько раз подкатегория уже была в этой игре
  private conflicts = new Map<string, Map<string, Set<string>>>()
  private counter = 0

  constructor(private bank: StatsBank, private rng: () => number = Math.random) {}

  pick(mode: GameMode): Question | null {
    const kind = mode === 'closest' ? 'closest' : 'mc'
    for (const sub of this.weightedOrder(this.bank.subcategories.filter(s => s.mode === kind))) {
      const q = kind === 'mc' ? this.buildMc(sub, mode) : this.buildClosest(sub)
      if (q) {
        this.asked.set(sub.id, (this.asked.get(sub.id) ?? 0) + 1)
        return q
      }
    }
    return null
  }

  private usedOf(sub: StatSubcategory): Set<string> {
    let set = this.used.get(sub.id)
    if (!set) this.used.set(sub.id, (set = new Set()))
    return set
  }

  private buildMc(sub: StatSubcategory, mode: GameMode): Question | null {
    const used = this.usedOf(sub)
    const pools = this.shuffle((sub.pools as StatMcPool[])
      .filter(p => !(p.subject && used.has(p.subject)))
      .map(p => ({ pool: p, free: p.entries.filter(e => !used.has(e[0])) }))
      .filter(({ free }) => free.length >= OPTIONS))
    if (!pools.length) return null

    const gap = sub.gap ?? {}
    const clash = this.conflictsOf(sub)
    for (const gated of [true, false]) {
      for (const { pool, free } of pools) {
        for (const ask of this.shuffle(pool.asks)) {
          const picked = gated ? this.gatedSet(free, gap, ask.ask, clash) : this.ungatedSet(free, ask.ask, clash)
          if (picked) return this.mcQuestion(sub, mode, pool, ask, picked)
        }
      }
    }
    return null
  }

  /** Лидер — случайный из тех, у кого ≥ 3 совместимых соперника с отрывом; соперники — случайные из подходящих. */
  private gatedSet(free: StatEntry[], gap: StatGap, ask: 'max' | 'min', clash: Map<string, Set<string>>): StatEntry[] | null {
    for (const lead of this.shuffle(free)) {
      const rivals = free.filter(o => o !== lead && gapOk(lead[1], o[1], gap, ask))
      const set = this.compatible([lead], rivals, clash)
      if (set) return set
    }
    return null
  }

  /** Без гейта: случайная совместимая четвёрка, где лидер отличается от второго и подписью (иначе «49.8%» против «49.8%»). */
  private ungatedSet(free: StatEntry[], ask: 'max' | 'min', clash: Map<string, Set<string>>): StatEntry[] | null {
    for (let attempt = 0; attempt < 20; attempt++) {
      const set = this.compatible([], free, clash)
      if (!set) return null
      const sorted = set.sort((a, b) => (ask === 'max' ? b[1] - a[1] : a[1] - b[1]))
      if (sorted[0][1] !== sorted[1][1] && sorted[0][2] !== sorted[1][2]) return sorted
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

  private mcQuestion(sub: StatSubcategory, mode: GameMode, pool: StatMcPool, ask: StatAsk, picked: StatEntry[]): Question {
    const used = this.usedOf(sub)
    if (pool.subject) used.add(pool.subject)
    for (const e of picked) used.add(e[0])
    const shown = this.shuffle(picked)
    return {
      id: `stat_${sub.id}_${this.counter++}`,
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

  private buildClosest(sub: StatSubcategory): Question | null {
    const used = this.usedOf(sub)
    const free = (sub.pools as StatClosestPool[]).filter(p => !used.has(p.subject))
    if (!free.length) return null
    const pool = free[Math.floor(this.rng() * free.length)]
    used.add(pool.subject)
    return {
      id: `stat_${sub.id}_${this.counter++}`,
      mode: 'closest',
      topic: sub.topic,
      displayTopic: `${sub.display}: ${pool.subject}`,
      comment: sub.comment,
      text: pool.text,
      numericAnswer: pool.answer,
    }
  }

  /** Подкатегории в случайном порядке с учётом веса (выбор без возвращения); каждый показ подкатегории
   *  в этой игре делит её вес — чтобы одна тема не шла подряд. */
  private weightedOrder(subs: StatSubcategory[]): StatSubcategory[] {
    const weight = (s: StatSubcategory) => s.weight / (1 + 2 * (this.asked.get(s.id) ?? 0))
    const rest = [...subs]
    const out: StatSubcategory[] = []
    while (rest.length) {
      const total = rest.reduce((s, x) => s + weight(x), 0)
      let r = this.rng() * total
      const i = rest.findIndex(x => (r -= weight(x)) <= 0)
      out.push(...rest.splice(i < 0 ? rest.length - 1 : i, 1))
    }
    return out
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
