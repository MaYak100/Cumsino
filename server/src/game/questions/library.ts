// server/src/game/questions/library.ts
// Всё, из чего собираются вопросы, — читается один раз на процесс: готовые вопросы (scripts/data/bank/
// questions.json, scripts/build_question_bank.py), статистика (scripts/data/stats/bank.json,
// scripts/build_stats_bank.py), друзья (scripts/data/friends/metrics.json) и категории (categories.ts).
import * as fs from 'fs'
import * as path from 'path'
import { CATEGORIES, type CategoryDef } from './categories'
import type { StatsBank, StatSubcategory } from '../stats/statQuestions'
import { FRIEND_KINDS, type FriendsMetrics, type FriendKind } from './friends'

export interface NumberQuestion {
  id: string; sub: string; kind: 'number'; text: string; topic: string
  answer: number; step: number; unit: string; comment?: string
}
export interface ChoiceQuestion {
  id: string; sub: string; kind: 'choice'; text: string; topic: string
  options: string[]   // options[0] — правильный
  optionNotes?: string[]
  comment?: string
}
export type BankQuestion = NumberQuestion | ChoiceQuestion

export type QuestionKind = 'mc' | 'closest'

/** Подкатегория в сборе: откуда берутся вопросы и для каких типов раунда она годится. */
export type SubSource =
  | { type: 'bank'; questions: BankQuestion[] }
  | { type: 'stats'; sub: StatSubcategory }
  | { type: 'friends'; kind: FriendKind }

export interface Subcategory {
  id: string
  title: string
  weight: number
  category: Category
  kinds: Set<QuestionKind>
  source: SubSource
  /** сколько разных вопросов (шаблонов) и сочетаний — для таблицы соотношений */
  size: { templates: number; cards: number }
}

export interface Category {
  id: string
  title: string
  weight: number
  requires?: CategoryDef['requires']
  subs: Subcategory[]
}

export interface Library {
  categories: Category[]
  stats: StatsBank | null
  friends: FriendsMetrics | null
  heroNames: Record<number, string>
  warnings: string[]
}

const REPO = path.join(__dirname, '..', '..', '..', '..')
const DATA = path.join(REPO, 'scripts', 'data')

function readJson<T>(rel: string): T | null {
  const p = path.join(DATA, rel)
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf-8')) as T) : null
}

export function buildLibrary(input: {
  bank: BankQuestion[]
  stats: StatsBank | null
  friends: FriendsMetrics | null
  heroNames?: Record<number, string>
  categories?: CategoryDef[]
}): Library {
  const warnings: string[] = []
  const byBankSub = new Map<string, BankQuestion[]>()
  for (const q of input.bank) {
    if (!byBankSub.has(q.sub)) byBankSub.set(q.sub, [])
    byBankSub.get(q.sub)!.push(q)
  }
  const statSubs = new Map((input.stats?.subcategories ?? []).map(s => [s.id, s]))
  const known = new Set<string>()

  const categories: Category[] = []
  for (const def of input.categories ?? CATEGORIES) {
    const cat: Category = { id: def.id, title: def.title, weight: def.weight, requires: def.requires, subs: [] }
    for (const sd of def.subs) {
      known.add(sd.id)
      let source: SubSource | null = null
      let kinds = new Set<QuestionKind>()
      let size = { templates: 0, cards: 0 }
      const bankQs = byBankSub.get(sd.id)
      const stat = statSubs.get(sd.id)
      const friendKind = FRIEND_KINDS.find(k => `friends_${k.id}` === sd.id)
      if (bankQs?.length) {
        source = { type: 'bank', questions: bankQs }
        kinds = new Set(bankQs.some(q => q.kind === 'number') ? ['mc', 'closest'] : ['mc'])
        size = { templates: bankQs.length, cards: bankQs.length }
      } else if (stat) {
        source = { type: 'stats', sub: stat }
        kinds = new Set([stat.mode])
        size = statSize(stat)
      } else if (friendKind && input.friends) {
        source = { type: 'friends', kind: friendKind }
        kinds = new Set(friendKind.kinds)
        size = { templates: friendKind.templates, cards: 0 }
      }
      if (!source) {
        warnings.push(`подкатегория ${sd.id} пуста — нет данных`)
        continue
      }
      cat.subs.push({ id: sd.id, title: sd.title, weight: sd.weight ?? 1, category: cat, kinds, source, size })
    }
    if (cat.subs.length) categories.push(cat)
    else warnings.push(`категория ${def.id} пуста`)
  }
  for (const id of byBankSub.keys()) if (!known.has(id)) warnings.push(`вопросы подкатегории ${id} не в categories.ts`)
  for (const id of statSubs.keys()) if (!known.has(id)) warnings.push(`статистика ${id} не в categories.ts`)
  return { categories, stats: input.stats, friends: input.friends, heroNames: input.heroNames ?? {}, warnings }
}

function statSize(sub: StatSubcategory): { templates: number; cards: number } {
  if (sub.mode === 'closest') return { templates: sub.pools.length, cards: sub.pools.length }
  const pools = sub.pools as Array<{ subject?: string; entries: unknown[]; asks: Array<{ text: string }> }>
  if (pools.some(p => p.subject)) {
    return { templates: pools.reduce((s, p) => s + p.asks.length, 0), cards: pools.length }
  }
  const texts = new Set(pools.flatMap(p => p.asks.map(a => a.text)))
  const names = new Set(pools.flatMap(p => (p.entries as Array<[string]>).map(e => e[0])))
  return { templates: texts.size, cards: names.size }
}

let cached: Library | null = null

/** Читает файлы один раз; битый файл роняет сервер при старте, а не на первом вопросе. */
export function loadLibrary(): Library {
  if (cached) return cached
  const bank = readJson<{ questions: BankQuestion[] }>('bank/questions.json')
  if (!bank) throw new Error('нет scripts/data/bank/questions.json — python scripts/build_question_bank.py')
  const stats = readJson<StatsBank>('stats/bank.json')
  const friends = readJson<FriendsMetrics>('friends/metrics.json')
  const heroes = readJson<Record<string, { localized_name: string }>>('dota/heroes.json') ?? {}
  const heroNames = Object.fromEntries(Object.entries(heroes).map(([id, h]) => [Number(id), h.localized_name]))
  cached = buildLibrary({ bank: bank.questions, stats, friends, heroNames })
  for (const w of cached.warnings) console.warn(`[questions] ${w}`)
  return cached
}
