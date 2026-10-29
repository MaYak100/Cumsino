import type { Player } from '@cumsino/shared'
import { buildPhysicalChips } from '../../types/chips'
import type { PhysicalChip } from '../../types/chips'
import type { ChipValue } from './Chip'
import { PhysicalChipStack } from './PhysicalChipStack'
import { unitPosition } from '../../lib/tableGeometry'
import { C, DISPLAY } from '../../theme'
import { Money } from './Money'

const UNIT_W = 200
const CHIP_ROW_H = 52
const BALANCE_H = 0   // баланс теперь в плашке рядом с именем
const CARD_H = 40
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

      {/* свой баланс — то, что осталось в стопке: выкладываешь фишку — число тает */}
      <NamePlate
        name={player.name}
        isMe={isMe}
        balance={isMe ? chips.filter(c => !placedIds?.has(c.id)).reduce((a, c) => a + c.denom, 0) : player.chips}
      />
    </div>
  )
}

/** Плашка игрока у стола: имя | $баланс (общая для стола ставок и фонового стола). */
export function NamePlate({ name, isMe, balance }: { name: string; isMe: boolean; balance?: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', maxWidth: UNIT_W, height: CARD_H,
      borderRadius: 12, overflow: 'hidden',
      border: `2px solid ${isMe ? C.brass : C.line}`,
      background: C.panel,
      boxShadow: '0 8px 22px rgba(0,0,0,.55)',
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', padding: '0 12px',
        background: isMe ? C.brass : 'transparent', color: isMe ? C.ink : C.fg,
        fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
      }}>
        {name}
      </span>
      {balance !== undefined && (
        <span style={{
          display: 'flex', alignItems: 'center', padding: '0 12px',
          borderLeft: `1px solid ${isMe ? C.brass : C.line}`,
          fontFamily: DISPLAY, fontSize: 16, fontVariantNumeric: 'tabular-nums',
          color: isMe ? C.brass : C.fg, whiteSpace: 'nowrap',
        }}>
          <Money v={balance} />
        </span>
      )}
    </div>
  )
}

export { UNIT_W, CARD_H, CHIP_ROW_H, BALANCE_H, UNIT_H }
