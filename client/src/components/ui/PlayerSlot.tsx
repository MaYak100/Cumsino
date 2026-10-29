import type { Player } from '@cumsino/shared'
import { buildPhysicalChips } from '../../types/chips'
import type { PhysicalChip } from '../../types/chips'
import type { ChipValue } from './Chip'
import { PhysicalChipStack } from './PhysicalChipStack'
import { unitPosition } from '../../lib/tableGeometry'
import { C, DISPLAY } from '../../theme'

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
        fontSize: 15,
        fontFamily: DISPLAY,
        color: isMe ? C.brass : C.fg,
        fontVariantNumeric: 'tabular-nums',
        marginBottom: 2,
      }}>
        {player.chips}
      </div>

      <NamePlate name={player.name} isMe={isMe} />
    </div>
  )
}

/** Именная плашка у стола (общая для стола ставок и фонового стола). */
export function NamePlate({ name, isMe }: { name: string; isMe: boolean }) {
  return (
    <div style={{
      background: isMe ? C.brass : C.panel,
      color: isMe ? C.ink : C.fg,
      border: `1.5px solid ${isMe ? C.brass : C.line}`,
      borderRadius: 999,
      padding: '5px 16px 6px',
      fontSize: 14,
      fontWeight: 700,
      whiteSpace: 'nowrap',
      maxWidth: UNIT_W,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      boxShadow: '0 6px 18px rgba(0,0,0,.55)',
    }}>
      {name}
    </div>
  )
}

export { UNIT_W, CARD_H, CHIP_ROW_H, BALANCE_H, UNIT_H }
