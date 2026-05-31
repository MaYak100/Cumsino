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

export function GladiatorSelfScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)
  const answeredIds = useGameStore(s => s.answeredIds)
  const submitAnswer = useGameStore(s => s.submitAnswer)
  const sendHover = useGameStore(s => s.sendHover)
  const roundCorrectAnswer = useGameStore(s => s.roundCorrectAnswer)

  const myAnswered = myId ? answeredIds.has(myId) : false
  const options = gameState.currentQuestion?.options ?? []
  const showingCorrect = typeof roundCorrectAnswer === 'string' && roundCorrectAnswer !== null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="text-center mb-4">
        <div className="text-2xl text-yellow-400 mb-1">🎯 Ты — Керри!</div>
        <div className="text-xs text-gray-400">Толпа наблюдает за твоим выбором</div>
      </div>

      <Timer seconds={gameState.phaseTimeLeft} />

      <div className="w-full max-w-lg mt-6">
        <div className="text-center text-white text-xl mb-6 leading-relaxed">
          {gameState.currentQuestion?.text}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {options.map((option, idx) => {
            const isCorrect = showingCorrect && option === roundCorrectAnswer
            return (
              <motion.button
                key={idx}
                onMouseEnter={() => { if (!showingCorrect) sendHover(idx) }}
                onMouseLeave={() => sendHover(null)}
                onClick={() => !myAnswered && !showingCorrect && submitAnswer(option)}
                disabled={myAnswered || showingCorrect}
                whileHover={!myAnswered && !showingCorrect ? { scale: 1.02 } : {}}
                className={`
                  p-4 rounded-xl border-2 text-left transition-colors
                  ${isCorrect
                    ? 'border-green-400 bg-[#0a3a1a] shadow-[0_0_20px_rgba(74,222,128,0.4)]'
                    : `bg-[#1a3a1a] ${OPTION_BORDER_COLORS[idx]}`
                  }
                  ${showingCorrect && !isCorrect ? 'opacity-40 cursor-not-allowed' : ''}
                  ${!showingCorrect && (myAnswered ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[#2a4a2a]')}
                `}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-[#2a4a2a] border ${isCorrect ? 'border-green-400' : OPTION_BORDER_COLORS[idx]}`}>
                    {OPTION_LABELS[idx]}
                  </span>
                  <span className="text-sm">{option}</span>
                </div>
              </motion.button>
            )
          })}
        </div>

        {showingCorrect ? (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center text-green-400 mt-4 text-sm"
          >
            Правильный ответ: {roundCorrectAnswer}
          </motion.p>
        ) : myAnswered ? (
          <p className="text-center text-green-400 mt-4 text-sm">✓ Ответ отправлен</p>
        ) : null}
      </div>
    </div>
  )
}
