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
  const roundCorrectAnswer = useGameStore(s => s.roundCorrectAnswer)
  const roundMode = useGameStore(s => s.roundMode)
  const roundGladiatorId = useGameStore(s => s.roundGladiatorId)

  const playerMap = new Map(gameState.players.map(p => [p.id, p]))
  const sorted = [...roundResults].sort((a, b) => b.delta - a.delta)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl text-yellow-400 mb-6 font-bold tracking-wide"
      >
        ИТОГИ РАУНДА
      </motion.div>

      <div className="w-full max-w-md space-y-3">
        {sorted.map((result, i) => {
          const player = playerMap.get(result.playerId)
          if (!player) return null
          const isMe = result.playerId === myId
          const isPos = result.delta > 0
          const isNeg = result.delta < 0

          // Determine correct/wrong label and border
          let borderColor = '#3a6a3a'
          let statusLabel: string | null = null
          let statusColor = ''

          if (roundMode === 'all') {
            const playerAnsweredCorrect =
              player.answer !== undefined && player.answer === roundCorrectAnswer
            const playerAnsweredWrong =
              player.answer !== undefined && player.answer !== roundCorrectAnswer
            if (playerAnsweredCorrect) {
              borderColor = '#4ade80'
              statusLabel = '✓ Верно'
              statusColor = 'text-green-400'
            } else if (playerAnsweredWrong) {
              borderColor = '#f87171'
              statusLabel = '✗ Неверно'
              statusColor = 'text-red-400'
            }
          } else if (roundMode === 'kerri') {
            const isGladiator = result.playerId === roundGladiatorId
            if (isGladiator) {
              if (isPos) {
                borderColor = '#4ade80'
                statusLabel = '✓ Верно'
                statusColor = 'text-green-400'
              } else {
                borderColor = '#f87171'
                statusLabel = '✗ Неверно'
                statusColor = 'text-red-400'
              }
            } else {
              if (isPos) {
                borderColor = '#4ade80'
                statusLabel = 'Ставка угадана'
                statusColor = 'text-green-400'
              } else if (isNeg) {
                borderColor = '#f87171'
                statusLabel = 'Ставка не угадана'
                statusColor = 'text-red-400'
              }
            }
          } else {
            // closest / top5: border by delta
            if (isPos) borderColor = '#4ade80'
            else if (isNeg) borderColor = '#f87171'
          }

          return (
            <motion.div
              key={result.playerId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="p-4 rounded-xl border bg-[#1a3a1a]"
              style={{ borderColor }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold">
                    {player.name} {isMe && '(ты)'}
                  </div>
                  <div className="text-xs text-gray-400">Баланс: {player.chips} 🪙</div>
                  {statusLabel && (
                    <div className={`text-xs mt-1 font-semibold ${statusColor}`}>
                      {statusLabel}
                    </div>
                  )}
                </div>
                <div className={`text-2xl font-mono font-bold ${isPos ? 'text-green-400' : isNeg ? 'text-red-400' : 'text-gray-400'}`}>
                  {isPos ? '+' : ''}{result.delta}
                </div>
              </div>
              {isPos && <WinChips delta={result.delta} />}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
