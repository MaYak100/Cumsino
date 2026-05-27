import type { Player } from '@cumsino/shared'
import { buildPhysicalChips } from '../../types/chips'
import { PhysicalChipStack } from './PhysicalChipStack'

interface PlayerCardProps {
  player: Player
  isMe?: boolean
  isGladiator?: boolean
  hasAnswered?: boolean
}

export function PlayerCard({ player, isMe, isGladiator, hasAnswered }: PlayerCardProps) {
  const chips = buildPhysicalChips(player.chips)

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
      <div className="text-yellow-400 font-mono text-sm mb-2">{player.chips}</div>
      <PhysicalChipStack chips={chips} interactive={false} size="sm" />
    </div>
  )
}
