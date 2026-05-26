import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { WIN_CHIPS } from '@cumsino/shared'

export function LeaderboardScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)

  const sorted = [...gameState.players].sort((a, b) => b.chips - a.chips)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="text-3xl text-yellow-400 mb-2">📊 Таблица лидеров</div>
      <div className="text-xs text-gray-400 mb-6">Раунд {gameState.roundIndex}</div>

      <div className="w-full max-w-md space-y-2">
        {sorted.map((player, i) => {
          const isMe = player.id === myId
          const progress = Math.min(100, (player.chips / WIN_CHIPS) * 100)

          return (
            <motion.div
              key={player.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`p-4 rounded-xl border ${isMe ? 'border-yellow-400 bg-[#2a4a2a]' : 'border-[#3a6a3a] bg-[#1a3a1a]'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg text-gray-400">{i + 1}.</span>
                  <span className="font-bold">{player.name}</span>
                  {isMe && <span className="text-xs text-yellow-400">(ты)</span>}
                </div>
                <span className="font-mono text-yellow-400">{player.chips} 🪙</span>
              </div>
              <div className="h-1.5 bg-[#0d1f0d] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.8, delay: i * 0.08 }}
                  className="h-full bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full"
                />
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {progress.toFixed(0)}% до победы ({WIN_CHIPS} 🪙)
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
