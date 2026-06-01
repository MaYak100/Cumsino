import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { Timer } from '../ui/Timer'

const OPTION_LABELS = ['A', 'B', 'C', 'D']
const OPTION_BORDER_COLORS = [
  'border-blue-500',
  'border-green-500',
  'border-yellow-500',
  'border-red-500',
]
const OPTION_BORDER_HEX = ['#3b82f6', '#22c55e', '#eab308', '#ef4444']

export function GladiatorSelfScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)
  const answeredIds = useGameStore(s => s.answeredIds)
  const submitAnswer = useGameStore(s => s.submitAnswer)
  const sendHover = useGameStore(s => s.sendHover)
  const roundCorrectAnswer = useGameStore(s => s.roundCorrectAnswer)
  const bribeEliminatedIdx = useGameStore(s => s.bribeEliminatedIdx)

  const myAnswered = myId ? answeredIds.has(myId) : false
  const options = gameState.currentQuestion?.options ?? []
  const showingCorrect = typeof roundCorrectAnswer === 'string' && roundCorrectAnswer !== null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ position: 'relative' }}>
      <Timer seconds={gameState.phaseTimeLeft} />

      <div className="w-full max-w-lg mt-4">
        <div className="text-center mb-6">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Вопрос</div>
          <div className="text-xl text-white leading-relaxed">
            {gameState.currentQuestion?.text}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {options.map((option, idx) => {
            const isCorrect = showingCorrect && option === roundCorrectAnswer
            const isEliminated = !showingCorrect && bribeEliminatedIdx === idx
            return (
              <motion.button
                key={idx}
                onMouseEnter={() => { if (!showingCorrect && !isEliminated) sendHover(idx) }}
                onMouseLeave={() => sendHover(null)}
                onClick={() => !myAnswered && !showingCorrect && !isEliminated && submitAnswer(option)}
                disabled={myAnswered || showingCorrect || isEliminated}
                whileHover={!myAnswered && !showingCorrect && !isEliminated ? { scale: 1.02 } : {}}
                className={`
                  p-4 rounded-xl border-2 text-left transition-colors
                  ${isCorrect
                    ? 'border-green-400 bg-[#0a3a1a] shadow-[0_0_20px_rgba(74,222,128,0.4)]'
                    : `bg-[#1a3a1a] ${OPTION_BORDER_COLORS[idx]}`
                  }
                  ${isEliminated ? 'opacity-30 cursor-not-allowed line-through' : ''}
                  ${showingCorrect && !isCorrect ? 'opacity-40 cursor-not-allowed' : ''}
                  ${!showingCorrect && !isEliminated && (myAnswered ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[#2a4a2a]')}
                `}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex items-center justify-center text-xs font-bold bg-[#2a4a2a]"
                    style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      border: `1.5px solid ${isCorrect ? '#4ade80' : OPTION_BORDER_HEX[idx]}`,
                    }}
                  >
                    {OPTION_LABELS[idx]}
                  </span>
                  <span className="text-sm">{option}</span>
                </div>
              </motion.button>
            )
          })}
        </div>

        {showingCorrect ? (
          <>
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center text-green-400 mt-4 text-sm"
            >
              Правильный ответ: {roundCorrectAnswer}
            </motion.p>
            {gameState.currentQuestion?.comment && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="text-center mt-2 text-sm"
                style={{ color: '#c4c9d4' }}
              >
                {gameState.currentQuestion.comment}
              </motion.p>
            )}
          </>
        ) : myAnswered ? (
          <p className="text-center text-green-400 mt-4 text-sm">✓ Ответ отправлен</p>
        ) : null}
      </div>
    </div>
  )
}
