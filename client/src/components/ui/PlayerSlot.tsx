import type { Player } from '@cumsino/shared'
import { buildPhysicalChips } from '../../types/chips'
import type { PhysicalChip } from '../../types/chips'
import type { ChipValue } from './Chip'
import { PhysicalChipStack } from './PhysicalChipStack'
import { unitPosition } from '../../lib/tableGeometry'

const UNIT_W = 170
const CHIP_ROW_H = 48
const BALANCE_H = 20
const CARD_H = 38
const UNIT_H = CHIP_ROW_H + BALANCE_H + CARD_H

interface Props {
  player: Player
  angle: number
  isMe: boolean
  myChips?: PhysicalChip[]
  placedIds?: Set<string>
  onDenomClick?: (denom: ChipValue) => void
}

export function PlayerSlot({ player, angle, isMe, myChips, placedIds, onDenomClick }: Props) {
  const { left, top } = unitPosition(angle, UNIT_W, UNIT_H, 0)
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
        paddingBottom: 16,
      }}
    >
      <div style={{ height: CHIP_ROW_H, display: 'flex', alignItems: 'flex-end' }}>
        <PhysicalChipStack
          chips={chips}
          interactive={isMe}
          placedIds={placedIds}
          onDenomClick={onDenomClick}
          size="md"
        />
      </div>

      <div style={{
        fontSize: 13,
        fontWeight: 700,
        color: isMe ? '#fbbf24' : '#d1d5db',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.04em',
        marginBottom: 3,
      }}>
        ${player.chips}
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

export { UNIT_W, CARD_H, CHIP_ROW_H, BALANCE_H, UNIT_H }
