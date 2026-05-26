import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { Timer } from '../ui/Timer'

export function QuestionTextScreen() {
  const gameState = useGameStore(s => s.gameState)!

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <Timer seconds={gameState.phaseTimeLeft} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="mt-8 max-w-lg"
      >
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-4">Вопрос</div>
        <div className="text-2xl text-white leading-relaxed">
          {gameState.currentQuestion?.text}
        </div>
        <motion.div
          className="mt-6 text-gray-500 text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          Варианты ответов появятся через несколько секунд…
        </motion.div>
      </motion.div>
    </div>
  )
}
