import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { Timer } from '../ui/Timer'

const MODE_LABELS: Record<string, string> = {
  all: '🧠 ВОПРОС ДЛЯ ВСЕХ',
  gladiator: '⚔️ ГЛАДИАТОР',
  closest: '🎯 КТО БЛИЖЕ',
  top5: '📊 ТОП 5',
}

export function AnnounceScreen() {
  const gameState = useGameStore(s => s.gameState)!

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <Timer seconds={gameState.phaseTimeLeft} />

      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8"
      >
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-2">Режим раунда</div>
        <div className="text-4xl font-bold text-yellow-400 mb-6">
          {MODE_LABELS[gameState.mode] ?? gameState.mode}
        </div>

        {gameState.currentQuestion && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="bg-[#2a4a2a] border border-[#3a6a3a] rounded-2xl px-8 py-4"
          >
            <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">Тема</div>
            <div className="text-2xl text-white">{gameState.currentQuestion.topic}</div>
          </motion.div>
        )}
      </motion.div>

      {(gameState.mode === 'all' || gameState.mode === 'gladiator') && (
        <p className="mt-8 text-gray-400 text-sm">Готовься к ставкам…</p>
      )}
    </div>
  )
}
