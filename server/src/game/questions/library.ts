// server/src/game/questions/library.ts
// Всё, из чего собираются вопросы, — читается один раз на процесс: готовые вопросы (scripts/data/bank/
// questions.json, scripts/build_question_bank.py), статистика (scripts/data/stats/bank.json,
// scripts/build_stats_bank.py), друзья (scripts/data/friends/metrics.json) и категории (categories.ts).
import * as fs from 'fs'
import * as path from 'path'
import { CATEGORIES, type CategoryDef } from './categories'
import { statKinds, type StatsBank, type StatSubcategory } from '../stats/statQuestions'
import { FRIEND_KINDS, type FriendsMetrics, type FriendKind } from './friends'

/** topic — субъект темы (герой, предмет); aspect — вторая строка темы, если не как у подкатегории (чара у нейтралок) */
export interface NumberQuestion {
  id: string; sub: string; kind: 'number'; text: string; topic: string; aspect?: string
  answer: number; step: number; unit: string; comment?: string
}
export interface ChoiceQuestion {
  id: string; sub: string; kind: 'choice'; text: string; topic: string; aspect?: string
  options: string[]   // options[0] — правильный
  optionNotes?: string[]
  comment?: string
}
export type BankQuestion = NumberQuestion | ChoiceQuestion

export type QuestionKind = 'mc' | 'closest'

/** Вес по типу раунда: closest — свой, если задан в categories.ts, иначе базовый. */
export type KindWeights = Record<QuestionKind, number>

/** Подкатегория в сборе: откуда берутся вопросы и для каких типов раунда она годится. */
export type SubSource =
  | { type: 'bank'; questions: BankQuestion[] }
  | { type: 'stats'; sub: StatSubcategory }
  | { type: 'friends'; kind: FriendKind }

export interface Subcategory {
  id: string
  title: string
  weights: KindWeights
  /** постоянный субъект темы (главнее источника) и аспект — categories.ts */
  subject?: string
  aspect?: string
  category: Category
  kinds: Set<QuestionKind>
  source: SubSource
  /** сколько разных вопросов (шаблонов) и сочетаний — для таблицы соотношений */
  size: { templates: number; cards: number }
}

export interface Category {
  id: string
  title: string
  weights: KindWeights
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
    const cat: Category = {
      id: def.id, title: def.title, weights: { mc: def.weight, closest: def.closest ?? def.weight },
      requires: def.requires, subs: [],
    }
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
        kinds = new Set(statKinds(stat))
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
      const weight = sd.weight ?? 1
      cat.subs.push({
        id: sd.id, title: sd.title, weights: { mc: weight, closest: sd.closest ?? weight },
        subject: sd.subject, aspect: sd.aspect, category: cat, kinds, source, size,
      })
    }
    if (cat.subs.length) categories.push(cat)
    else warnings.push(`категория ${def.id} пуста`)
  }
  for (const id of byBankSub.keys()) if (!known.has(id)) warnings.push(`вопросы подкатегории ${id} не в categories.ts`)
  for (const id of statSubs.keys()) if (!known.has(id)) warnings.push(`статистика ${id} не в categories.ts`)
  return { categories, stats: input.stats, friends: input.friends, heroNames: input.heroNames ?? {}, warnings }
}

/** Шаблоны (тексты) и карточки колоды — MC и «кто ближе» вместе: карточки у них общие (герой / ответ). */
function statSize(sub: StatSubcategory): { templates: number; cards: number } {
  const pools = sub.pools
  const near = sub.closest?.pools ?? []
  const cards = new Set(near.map(p => p.subject))
  let templates = near.length
  if (pools.some(p => p.subject)) {
    templates += pools.reduce((s, p) => s + p.asks.length, 0)
    for (const p of pools) cards.add(p.subject!)
  } else {
    templates += new Set(pools.flatMap(p => p.asks.map(a => a.text))).size
    for (const p of pools) for (const e of p.entries) cards.add(e[0])
  }
  return { templates, cards: cards.size }
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
