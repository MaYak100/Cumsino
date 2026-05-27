import type { Player } from '@cumsino/shared'
import { buildPhysicalChips } from '../../types/chips'
import type { PhysicalChip } from '../../types/chips'
import { PhysicalChipStack } from './PhysicalChipStack'
import { unitPosition } from '../../lib/tableGeometry'

const UNIT_W = 170
const CARD_H = 38
const CHIP_ROW_H = 48

interface Props {
  player: Player
  angle: number
  isMe: boolean
  myChips?: PhysicalChip[]
  placedIds?: Set<string>
  onChipClick?: (id: string) => void
}

export function PlayerSlot({ player, angle, isMe, myChips, placedIds, onChipClick }: Props) {
  const { left, top } = unitPosition(angle, UNIT_W, CHIP_ROW_H, CARD_H)
  const chips = isMe ? (myChips ?? []) : buildPhysicalChips(player.chips)

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: UNIT_W,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        zIndex: 4,
      }}
    >
      <div style={{ height: CHIP_ROW_H, display: 'flex', alignItems: 'flex-end' }}>
        <PhysicalChipStack
          chips={chips}
          interactive={isMe}
          placedIds={placedIds}
          onChipClick={onChipClick}
          size="md"
        />
      </div>

      <div
        style={{
          background: isMe ? '#100e00' : 'linear-gradient(135deg,#121212,#0a0a0a)',
          border: `1.5px solid ${isMe ? '#fbbf24' : '#333'}`,
          borderRadius: 8,
          padding: '5px 14px',
          boxShadow: isMe
            ? '0 0 18px rgba(251,191,36,0.12), 0 4px 24px rgba(0,0,0,0.8)'
            : '0 4px 24px rgba(0,0,0,0.8)',
          whiteSpace: 'nowrap',
          maxWidth: UNIT_W,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: isMe ? '#fbbf24' : '#aaa',
            letterSpacing: '0.01em',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
          }}
        >
          {player.name}
        </div>
      </div>
    </div>
  )
}

export { UNIT_W, CARD_H, CHIP_ROW_H }
