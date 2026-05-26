import type { Player } from '@cumsino/shared'
import { decomposeToChips } from '@cumsino/shared'

interface PlayerCardProps {
  player: Player
  isMe?: boolean
  isGladiator?: boolean
  hasAnswered?: boolean
}

export function PlayerCard({ player, isMe, isGladiator, hasAnswered }: PlayerCardProps) {
  const breakdown = decomposeToChips(player.chips)

  return (
    <div className={`
      rounded-xl p-3 border
      ${isMe ? 'border-yellow-400 bg-[#2a4a2a]' : 'border-[#3a6a3a] bg-[#1a3a1a]'}
    `}>
      <div className="flex items-center gap-2 mb-1">
        {isGladiator && <span title="Гладиатор">⚔️</span>}
        {hasAnswered && <span title="Ответил" className="text-green-400">✓</span>}
        <span className="font-bold text-sm truncate">{player.name}</span>
        {isMe && <span className="text-xs text-yellow-400 ml-auto">(ты)</span>}
      </div>
      <div className="text-yellow-400 font-mono text-lg">{player.chips} 🪙</div>
      <div className="flex flex-wrap gap-1 mt-1">
        {(Object.entries(breakdown) as [string, number][])
          .filter(([, count]) => count > 0)
          .map(([denom, count]) => (
            <span key={denom} className="text-xs text-gray-400">
              {count}×{denom}
            </span>
          ))}
      </div>
    </div>
  )
}
