import type { Player } from '@cumsino/shared'
import { buildPhysicalChips } from '../../types/chips'
import { PhysicalChipStack } from './PhysicalChipStack'

interface PlayerCardProps {
  player: Player
  isMe?: boolean
  isGladiator?: boolean
  hasAnswered?: boolean
  hideChips?: boolean
}

export function PlayerCard({ player, isMe, isGladiator, hasAnswered, hideChips }: PlayerCardProps) {
  const chips = hideChips ? [] : buildPhysicalChips(player.chips)

  return (
    <div className={`
      rounded-xl border
      ${hideChips ? 'p-2' : 'p-3'}
      ${isMe ? 'border-yellow-400 bg-[#2a4a2a]' : 'border-[#3a6a3a] bg-[#1a3a1a]'}
    `}>
      <div className="flex items-center gap-2">
        {isGladiator && <span title="Керри">🎯</span>}
        {hasAnswered && <span title="Ответил" className="text-green-400">✓</span>}
        <span className={`font-bold truncate ${hideChips ? 'text-sm' : 'text-sm'}`}>{player.name}</span>
      </div>
      {!hideChips && (
        <>
          <div className="text-yellow-400 font-mono text-sm mb-2 mt-1">{player.chips}</div>
          <PhysicalChipStack chips={chips} interactive={false} size="sm" />
        </>
      )}
    </div>
  )
}
