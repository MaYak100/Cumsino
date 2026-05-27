import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { buildPhysicalChips } from '../../types/chips'
import type { ChipValue } from '../ui/Chip'

const CHIP_COLORS: Record<ChipValue, string> = {
  10:  'bg-gradient-to-br from-gray-200 to-gray-500 text-gray-900',
  20:  'bg-gradient-to-br from-green-400 to-green-700 text-white',
  50:  'bg-gradient-to-br from-blue-400 to-blue-700 text-white',
  100: 'bg-gradient-to-br from-red-400 to-red-700 text-white',
  500: 'bg-gradient-to-br from-gray-700 to-black text-yellow-400',
}

function WinChips({ delta }: { delta: number }) {
  const chips = buildPhysicalChips(delta)
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {chips.map((chip, i) => (
        <motion.div
          key={chip.id}
          initial={{ scale: 0, opacity: 0, y: -8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: i * 0.06 }}
          className={`
            ${CHIP_COLORS[chip.denom]}
            w-7 h-7 rounded-full flex items-center justify-center
            text-[9px] font-bold border border-white/10
            shadow-[0_3px_8px_rgba(0,0,0,0.6)]
          `}
        >
          {chip.denom}
        </motion.div>
      ))}
    </div>
  )
}

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
                p-4 rounded-xl border
                ${isMe ? 'border-yellow-400 bg-[#2a4a2a]' : 'border-[#3a6a3a] bg-[#1a3a1a]'}
              `}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold">{player.name} {isMe && '(ты)'}</div>
                  <div className="text-xs text-gray-400">Баланс: {player.chips} 🪙</div>
                </div>
                <div className={`text-2xl font-mono font-bold ${isPos ? 'text-green-400' : isNeg ? 'text-red-400' : 'text-gray-400'}`}>
                  {isPos ? '+' : ''}{result.delta}
                </div>
              </div>
              {isMe && isPos && <WinChips delta={result.delta} />}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
