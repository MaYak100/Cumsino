import * as fs from 'fs'
import * as path from 'path'
import type { Question, GameMode } from '@cumsino/shared'

interface RawMCQuestion {
  type: 'multiple_choice'
  topic: string
  question: string
  options: string[]
}

interface RawCNQuestion {
  type: 'closest_number'
  topic: string
  question: string
  answer: number
}

let idCounter = 0

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function loadFile(filename: string): unknown[] {
  const p = path.join(__dirname, '..', '..', '..', 'scripts', 'data', 'generated', filename)
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

function weightedPick<T>(pools: Array<{ items: T[]; weight: number }>): T {
  const total = pools.reduce((s, p) => s + p.weight, 0)
  let r = Math.random() * total
  for (const pool of pools) {
    r -= pool.weight
    if (r <= 0 && pool.items.length > 0) {
      return pool.items[Math.floor(Math.random() * pool.items.length)]
    }
  }
  for (const pool of pools) {
    if (pool.items.length > 0) {
      return pool.items[Math.floor(Math.random() * pool.items.length)]
    }
  }
  throw new Error('All question pools are empty')
}

export function createQuestionPicker(): (mode: GameMode) => Question {
  const abilitiesAll = loadFile('abilities_main.json') as Array<RawMCQuestion | RawCNQuestion>
  const itemsAll = loadFile('items_main.json') as Array<RawMCQuestion | RawCNQuestion>
  const general = loadFile('general_main.json') as RawMCQuestion[]
  const costs = loadFile('costs_main.json') as RawCNQuestion[]

  const abilitiesMC = abilitiesAll.filter((q): q is RawMCQuestion => q.type === 'multiple_choice')
  const itemsMC = itemsAll.filter((q): q is RawMCQuestion => q.type === 'multiple_choice')
  const abilitiesCN = abilitiesAll.filter((q): q is RawCNQuestion => q.type === 'closest_number')
  const itemsCN = itemsAll.filter((q): q is RawCNQuestion => q.type === 'closest_number')

  const mcPools = [
    { items: general, weight: 5 },
    { items: abilitiesMC, weight: 55 },
    { items: itemsMC, weight: 40 },
  ]

  const cnPools = [
    { items: costs, weight: 30 },
    { items: abilitiesCN, weight: 35 },
    { items: itemsCN, weight: 35 },
  ]

  return (mode: GameMode): Question => {
    if (mode === 'all' || mode === 'kerri') {
      const raw = weightedPick(mcPools)
      const correct = raw.options[0]
      const shuffled = shuffleArray(raw.options)
      return {
        id: `mc_${idCounter++}`,
        mode,
        topic: raw.topic,
        text: raw.question,
        options: shuffled,
        answer: correct,
      }
    } else {
      const raw = weightedPick(cnPools)
      return {
        id: `cn_${idCounter++}`,
        mode: 'closest',
        topic: raw.topic,
        text: raw.question,
        numericAnswer: raw.answer,
      }
    }
  }
}
