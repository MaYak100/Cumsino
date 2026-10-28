import * as fs from 'fs'
import * as path from 'path'
import type { Question, GameMode } from '@cumsino/shared'
import { StatQuestionPicker, type StatsBank } from './stats/statQuestions'

interface RawMCQuestion {
  type: 'multiple_choice'
  topic: string
  question: string
  options: string[]
  optionNotes?: string[]   // по индексу options (options[0] — правильный)
  heroName?: string
  source?: string
  subcategory?: string
  comment?: string
}

interface RawCNQuestion {
  type: 'closest_number'
  topic: string
  question: string
  answer: number
  heroName?: string
  source?: string
  comment?: string
}

let idCounter = 0

function toTitleCase(s: string): string {
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function computeDisplayTopic(raw: RawMCQuestion | RawCNQuestion): string {
  if (raw.heroName) return raw.heroName
  if ('subcategory' in raw && raw.subcategory) return raw.subcategory
  if (raw.source && raw.topic !== 'Цена') return toTitleCase(raw.source)
  return raw.topic
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Перемешать варианты вместе с подписями значений (подпись остаётся у своего варианта). */
export function shuffleOptions(options: string[], notes?: string[]): { options: string[]; optionNotes?: string[] } {
  const order = shuffleArray(options.map((_, i) => i))
  return {
    options: order.map(i => options[i]),
    optionNotes: notes && notes.length === options.length ? order.map(i => notes[i]) : undefined,
  }
}

const REPO = path.join(__dirname, '..', '..', '..')
const STATS_BANK = path.join(REPO, 'scripts', 'data', 'stats', 'bank.json')
// Вес вопросов на статистике против старых пулов (у MC старые веса в сумме 100, у CN — 100)
export const STATS_MC_WEIGHT = 40
export const STATS_CN_WEIGHT = 20

function loadFile(filename: string): unknown[] {
  const p = path.join(REPO, 'scripts', 'data', 'generated', filename)
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

function loadStatsBank(): StatsBank | null {
  if (!fs.existsSync(STATS_BANK)) {
    console.warn(`[questions] нет ${STATS_BANK} — вопросы на статистике выключены`)
    return null
  }
  return JSON.parse(fs.readFileSync(STATS_BANK, 'utf-8')) as StatsBank
}

export interface Sources {
  mcPools: Array<{ items: RawMCQuestion[]; weight: number }>
  cnPools: Array<{ items: RawCNQuestion[]; weight: number }>
  stats: StatsBank | null
}

let sources: Sources | null = null

/** Файлы читаются один раз на процесс; пикеры комнат делят их. GameEngine вызывает это при старте,
 *  чтобы битый файл ронял сервер сразу, а не первый join_game. */
export function loadSources(): Sources {
  if (sources) return sources
  const abilitiesAll = loadFile('abilities_main.json') as Array<RawMCQuestion | RawCNQuestion>
  const itemsAll = loadFile('items_main.json') as Array<RawMCQuestion | RawCNQuestion>
  const general = loadFile('general_main.json') as RawMCQuestion[]
  const costs = loadFile('costs_main.json') as RawCNQuestion[]
  const mc = (q: RawMCQuestion | RawCNQuestion): q is RawMCQuestion => q.type === 'multiple_choice'
  const cn = (q: RawMCQuestion | RawCNQuestion): q is RawCNQuestion => q.type === 'closest_number'
  sources = {
    mcPools: [
      { items: general, weight: 7 },
      { items: abilitiesAll.filter(mc), weight: 55 },
      { items: itemsAll.filter(mc), weight: 38 },
    ],
    cnPools: [
      { items: costs, weight: 30 },
      { items: abilitiesAll.filter(cn), weight: 35 },
      { items: itemsAll.filter(cn), weight: 35 },
    ],
    stats: loadStatsBank(),
  }
  return sources
}

/** Пул по весу, из него — вопрос, ещё не заданный в этой игре; исчерпанные пулы пропускаются. */
function pickUnused<T extends object>(pools: Array<{ items: T[]; weight: number }>, used: Set<object>): T {
  const live = pools
    .map(p => ({ weight: p.weight, items: p.items.filter(q => !used.has(q)) }))
    .filter(p => p.items.length > 0)
  if (!live.length) {
    if (!pools.some(p => p.items.length)) throw new Error('All question pools are empty')
    for (const p of pools) for (const q of p.items) used.delete(q)   // всё задано — начинаем заново
    return pickUnused(pools, used)
  }
  const total = live.reduce((s, p) => s + p.weight, 0)
  let r = Math.random() * total
  const pool = live.find(p => (r -= p.weight) <= 0) ?? live[live.length - 1]
  const q = pool.items[Math.floor(Math.random() * pool.items.length)]
  used.add(q)
  return q
}

/**
 * Пикер на одну комнату (= одну игру): вопросы в игре не повторяются, в подкатегориях статистики
 * использованные герои / предметы исключаются (StatQuestionPicker).
 */
export function createQuestionPicker(): (mode: GameMode) => Question {
  const { mcPools, cnPools, stats } = loadSources()
  const used = new Set<object>()
  const statPicker = stats ? new StatQuestionPicker(stats) : null
  const oldTotal = (pools: Array<{ weight: number }>) => pools.reduce((s, p) => s + p.weight, 0)

  return (mode: GameMode): Question => {
    if (statPicker) {
      const w = mode === 'closest' ? STATS_CN_WEIGHT : STATS_MC_WEIGHT
      const pools = mode === 'closest' ? cnPools : mcPools
      if (Math.random() * (w + oldTotal(pools)) < w) {
        const q = statPicker.pick(mode)
        if (q) return q
      }
    }
    if (mode === 'all' || mode === 'kerri') {
      const raw = pickUnused(mcPools, used)
      const correct = raw.options[0]
      const { options, optionNotes } = shuffleOptions(raw.options, raw.optionNotes)
      return {
        id: `mc_${idCounter++}`,
        mode,
        topic: raw.topic,
        displayTopic: computeDisplayTopic(raw),
        comment: raw.comment,
        text: raw.question,
        options,
        optionNotes,
        answer: correct,
      }
    } else {
      const raw = pickUnused(cnPools, used)
      return {
        id: `cn_${idCounter++}`,
        mode: 'closest',
        topic: raw.topic,
        displayTopic: computeDisplayTopic(raw),
        comment: raw.comment,
        text: raw.question,
        numericAnswer: raw.answer,
      }
    }
  }
}
