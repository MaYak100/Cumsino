import { motion } from 'framer-motion'
import { useGameStore, selectIsGladiator } from '../../store/gameStore'
import { Timer } from '../ui/Timer'

const OPTION_LABELS = ['A', 'B', 'C', 'D']
const OPTION_BORDER_COLORS = [
  'border-blue-500',
  'border-green-500',
  'border-yellow-500',
  'border-red-500',
]

export function QuestionScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)
  const answeredIds = useGameStore(s => s.answeredIds)
  const gladiatorHoverIndex = useGameStore(s => s.gladiatorHoverIndex)
  const isGladiator = useGameStore(selectIsGladiator)
  const submitAnswer = useGameStore(s => s.submitAnswer)
  const sendHover = useGameStore(s => s.sendHover)

  const myAnswered = myId ? answeredIds.has(myId) : false
  const options = gameState.currentQuestion?.options ?? []
  const isGladiatorMode = gameState.mode === 'kerri'

  function handleMouseEnter(idx: number) {
    if (isGladiator && isGladiatorMode) sendHover(idx)
  }

  function handleMouseLeave() {
    if (isGladiator && isGladiatorMode) sendHover(null)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <Timer seconds={gameState.phaseTimeLeft} />

      <div className="w-full max-w-lg mt-4">
        <div className="text-center mb-6">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Вопрос</div>
          <div className="text-xl text-white leading-relaxed">
            {gameState.currentQuestion?.text}
          </div>
        </div>

        <div className="flex justify-center gap-2 mb-4">
          {gameState.players.map(p => (
            <span
              key={p.id}
              className={`w-2 h-2 rounded-full ${answeredIds.has(p.id) ? 'bg-green-400' : 'bg-gray-600'}`}
              title={p.name}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {options.map((option, idx) => {
            const isHovered = !isGladiator && gladiatorHoverIndex === idx && isGladiatorMode
            return (
              <motion.button
                key={idx}
                onMouseEnter={() => handleMouseEnter(idx)}
                onMouseLeave={handleMouseLeave}
                onClick={() => !myAnswered && submitAnswer(option)}
                disabled={myAnswered}
                animate={isHovered ? { scale: 1.03 } : { scale: 1 }}
                className={`
                  p-4 rounded-xl border-2 text-left transition-colors bg-[#1a3a1a]
                  ${OPTION_BORDER_COLORS[idx]}
                  ${myAnswered ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[#2a4a2a]'}
                  ${isHovered ? 'border-yellow-400 bg-[#2a3a1a] shadow-[0_0_20px_rgba(255,215,0,0.3)]' : ''}
                `}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-[#2a4a2a] border ${OPTION_BORDER_COLORS[idx]}`}>
                    {OPTION_LABELS[idx]}
                  </span>
                  <span className="text-sm">{option}</span>
                </div>
              </motion.button>
            )
          })}
        </div>

        {myAnswered && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-green-400 mt-4 text-sm"
          >
            ✓ Ответ принят, ждём остальных…
          </motion.p>
        )}
      </div>
    </div>
  )
}
