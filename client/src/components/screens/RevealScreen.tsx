import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'

export function RevealScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const roundResults = useGameStore(s => s.roundResults)
  const myId = useGameStore(s => s.myId)

  const playerMap = new Map(gameState.players.map(p => [p.id, p]))
  const sorted = [...roundResults].sort((a, b) => b.delta - a.delta)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl text-yellow-400 mb-6"
      >
        🏆 Итоги раунда
      </motion.div>

      <div className="w-full max-w-md space-y-3">
        {sorted.map((result, i) => {
          const player = playerMap.get(result.playerId)
          if (!player) return null
          const isMe = result.playerId === myId
          const isPos = result.delta > 0
          const isNeg = result.delta < 0

          return (
            <motion.div
              key={result.playerId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`
                flex items-center justify-between p-4 rounded-xl border
                ${isMe ? 'border-yellow-400 bg-[#2a4a2a]' : 'border-[#3a6a3a] bg-[#1a3a1a]'}
              `}
            >
              <div>
                <div className="font-bold">{player.name} {isMe && '(ты)'}</div>
                <div className="text-xs text-gray-400">Баланс: {player.chips} 🪙</div>
              </div>
              <div className={`text-2xl font-mono font-bold ${isPos ? 'text-green-400' : isNeg ? 'text-red-400' : 'text-gray-400'}`}>
                {isPos ? '+' : ''}{result.delta}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
