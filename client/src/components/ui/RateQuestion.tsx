import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'

const SCORES: Array<{ score: number; label: string }> = [
  { score: -2, label: '🗑 Удалить' },
  { score: -1, label: '👎 Слабый' },
  { score: 1, label: '👍 Хороший' },
  { score: 2, label: '🔥 Ахуенный' },
]

/** Оценка вопроса раунда. «Нормально» — ничего не жать. «Удалить» убирает вопрос из игры навсегда — со вторым нажатием. */
export function RateQuestion() {
  const question = useGameStore(s => s.gameState?.currentQuestion)
  const rateQuestion = useGameStore(s => s.rateQuestion)
  const [score, setScore] = useState<number | null>(null)
  const [difficulty, setDifficulty] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const qid = question?.id

  useEffect(() => { setScore(null); setDifficulty(null); setConfirmDelete(false) }, [qid])

  if (!question || !qid) return null

  const pickScore = (s: number) => {
    if (s === -2 && !confirmDelete) { setConfirmDelete(true); return }
    setConfirmDelete(false)
    if (score === -2) return   // удалён — назад не вернуть
    setScore(s)
    rateQuestion(qid, { score: s })
  }
  const pickDifficulty = (d: number) => {
    const next = difficulty === d ? null : d
    setDifficulty(next)
    rateQuestion(qid, { difficulty: next })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="w-full mt-5 rounded-xl border border-[#3a6a3a] bg-[#132a13] px-3 py-2.5"
      style={{ maxWidth: 460 }}
    >
      <div className="text-[11px] mb-2 leading-snug" style={{ color: '#c4c9d4' }}>
        Как вопрос? <span style={{ color: '#e5e7eb' }}>{question.text}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SCORES.map(({ score: s, label }) => {
          const active = score === s
          const asking = s === -2 && confirmDelete
          return (
            <button
              key={s}
              onClick={() => pickScore(s)}
              disabled={score === -2 && s !== -2}
              className={`px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                active ? 'border-yellow-400 bg-[#2a4a2a] text-yellow-400'
                  : asking ? 'border-red-400 text-red-300'
                    : 'border-[#3a6a3a] hover:border-yellow-600 disabled:opacity-40'}`}
              style={active || asking ? undefined : { color: '#e5e7eb' }}
            >
              {asking ? 'Точно? Навсегда' : active && s === -2 ? '🗑 Удалён' : label}
            </button>
          )
        })}
        <span className="mx-1" />
        {[{ d: -1, label: 'Легко' }, { d: 1, label: 'Сложно' }].map(({ d, label }) => (
          <button
            key={d}
            onClick={() => pickDifficulty(d)}
            className={`px-2.5 py-1 rounded-lg border text-xs ${
              difficulty === d ? 'border-yellow-400 text-yellow-400' : 'border-[#3a6a3a]'}`}
            style={difficulty === d ? undefined : { color: '#c4c9d4' }}
          >
            {label}
          </button>
        ))}
      </div>
    </motion.div>
  )
}
