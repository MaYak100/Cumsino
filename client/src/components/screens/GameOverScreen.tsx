import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'

export function GameOverScreen() {
  const winner = useGameStore(s => s.winner)
  const myId = useGameStore(s => s.myId)
  const reset = useGameStore(s => s.reset)

  const isWinner = winner?.id === myId

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', duration: 0.6 }}
        className="text-8xl mb-4"
      >
        {isWinner ? '🏆' : '💀'}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <div className="text-4xl text-yellow-400 font-bold mb-2">
          {isWinner ? 'ТЫ ПОБЕДИЛ!' : 'ИГРА ОКОНЧЕНА'}
        </div>
        {winner && (
          <div className="text-xl text-white mb-2">
            {!isWinner && 'Победитель: '}
            <strong className="text-yellow-400">{winner.name}</strong>
          </div>
        )}
        {winner && (
          <div className="text-gray-400">Итоговый баланс: {winner.chips} 🪙</div>
        )}
      </motion.div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        onClick={reset}
        className="mt-10 px-8 py-3 bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-bold rounded-xl hover:brightness-110"
      >
        НОВАЯ ИГРА
      </motion.button>
    </div>
  )
}
