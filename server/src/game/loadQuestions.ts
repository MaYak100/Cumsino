import * as fs from 'fs'
import * as path from 'path'
import type { Question } from '@cumsino/shared'

interface RawMCQuestion {
  type: 'multiple_choice'
  question: string
  options: string[]
  correct: number
  item_name?: string
  hero_name?: string
  category?: string
}

interface RawCNQuestion {
  type: 'closest_number'
  question: string
  answer?: number
  answers?: number[]
  item_name?: string
  hero_name?: string
  category?: string
}

interface Batches<T> {
  scripted: T[]
  agent: T[]
  agent_hard: T[]
}

interface QuestionsDB {
  multiple_choice: { items: Batches<RawMCQuestion>; abilities: Batches<RawMCQuestion> }
  closest_number: { items: Batches<RawCNQuestion>; abilities: Batches<RawCNQuestion> }
}

let idCounter = 0

function topic(q: RawMCQuestion | RawCNQuestion): string {
  return q.item_name ?? q.hero_name ?? q.category ?? 'Dota 2'
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function flatMC(db: QuestionsDB): RawMCQuestion[] {
  const mc = db.multiple_choice
  return [
    ...mc.items.scripted, ...mc.items.agent, ...mc.items.agent_hard,
    ...mc.abilities.scripted, ...mc.abilities.agent, ...mc.abilities.agent_hard,
  ]
}

function flatCN(db: QuestionsDB): RawCNQuestion[] {
  const cn = db.closest_number
  return [
    ...cn.items.scripted, ...cn.items.agent, ...cn.items.agent_hard,
    ...cn.abilities.scripted, ...cn.abilities.agent, ...cn.abilities.agent_hard,
  ]
}

export function loadQuestions(): Question[] {
  const dbPath = path.join(__dirname, '..', '..', '..', 'scripts', 'data', 'questions_db.json')
  const db: QuestionsDB = JSON.parse(fs.readFileSync(dbPath, 'utf-8'))

  const questions: Question[] = []

  for (const raw of flatMC(db)) {
    let text = raw.question
    let options = raw.options

    if (text.includes('{level}')) {
      const splitOptions = options.map(o => o.split(' / ').map(s => s.trim()))
      const numLevels = splitOptions[0].length
      const lvl = Math.floor(Math.random() * numLevels)
      text = text.replace('{level}', String(lvl + 1))
      options = splitOptions.map(o => o[lvl] ?? o[0])
    }

    const correctAnswer = options[raw.correct]
    const shuffledOptions = shuffleArray(options)

    const base = {
      topic: topic(raw),
      text,
      options: shuffledOptions,
      answer: correctAnswer,
    }
    questions.push({ id: `mc_${idCounter++}`, mode: 'all', ...base })
    questions.push({ id: `mc_${idCounter++}`, mode: 'kerri', ...base })
  }

  for (const raw of flatCN(db)) {
    let numericAnswer: number
    let text = raw.question

    if (raw.answers && raw.answers.length > 0) {
      const lvl = Math.floor(Math.random() * raw.answers.length)
      numericAnswer = raw.answers[lvl]
      text = text.replace('{level}', String(lvl + 1))
    } else if (raw.answer !== undefined) {
      numericAnswer = raw.answer
    } else {
      continue
    }

    questions.push({
      id: `cn_${idCounter++}`,
      mode: 'closest',
      topic: topic(raw),
      text,
      numericAnswer,
    })
  }

  return questions
}
