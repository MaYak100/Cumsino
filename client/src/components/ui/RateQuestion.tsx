import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'

const SCORES: Array<{ score: number; label: string }> = [
  { score: -2, label: '🗑 Удалить' },
  { score: -1, label: '👎 Слабый' },
  { score: 1, label: '👍 Хороший' },
  { score: 2, label: '🔥 Ахуенный' },
]

/** Оценка вопроса раунда. «Нормально» — ничего не жать; повторное нажатие снимает выбор. Решение отправляется один раз,
 *  когда экран итогов пропадает. «Удалить» — голос: вопрос уходит из игры навсегда, когда за удаление больше
 *  половины игроков. */
export function RateQuestion() {
  const question = useGameStore(s => s.gameState?.currentQuestion)
  const rateQuestion = useGameStore(s => s.rateQuestion)
  const [score, setScore] = useState<number | null>(null)
  const [difficulty, setDifficulty] = useState<number | null>(null)
  const qid = question?.id
  const choice = useRef({ score, difficulty })
  choice.current = { score, difficulty }

  // экран пропал (или сменился вопрос) — фиксируем выбор. id берём из замыкания: уходящий экран (анимация выхода)
  // успевает получить состояние следующего раунда, и в choice.current уже может быть новый вопрос
  useEffect(() => {
    const id = qid
    return () => {
      const { score: sc, difficulty: df } = choice.current
      if (id && (sc !== null || df !== null)) rateQuestion(id, { score: sc, difficulty: df })
    }
  }, [qid, rateQuestion])

  useEffect(() => { setScore(null); setDifficulty(null) }, [qid])

  if (!question || !qid) return null

  const pickScore = (s: number) => setScore(score === s ? null : s)
  const pickDifficulty = (d: number) => setDifficulty(difficulty === d ? null : d)

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
          return (
            <button
              key={s}
              onClick={() => pickScore(s)}
              className={`px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                active ? (s === -2 ? 'border-red-400 bg-[#3a1a1a] text-red-300' : 'border-yellow-400 bg-[#2a4a2a] text-yellow-400')
                  : 'border-[#3a6a3a] hover:border-yellow-600'}`}
              style={active ? undefined : { color: '#e5e7eb' }}
            >
              {label}
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
