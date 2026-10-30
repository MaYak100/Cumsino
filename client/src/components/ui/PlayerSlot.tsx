import { useMemo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { Player } from '@cumsino/shared'
import { buildPhysicalChips } from '../../types/chips'
import type { PhysicalChip } from '../../types/chips'
import type { ChipValue } from './Chip'
import { PhysicalChipStack } from './PhysicalChipStack'
import { unitPosition } from '../../lib/tableGeometry'
import { C, DISPLAY } from '../../theme'
import { Money } from './Money'
import { Marks } from './AnswerProgress'
import { StreakFlame } from './StreakFlame'
import { pressable } from '../../lib/pressable'
import { BotMark, needsBotMark } from './BotMark'

const UNIT_W = 200
const CHIP_ROW_H = 52
const BALANCE_H = 0   // баланс теперь в плашке рядом с именем
const CARD_H = 40
const UNIT_H = CHIP_ROW_H + BALANCE_H + CARD_H
const CHIP_GAP = 8    // под стопкой: огню серии есть где гореть
const ROW_GAP = 4     // gap колонки слота
/** верх плашки от верха слота — фоновый стол (TableFelt) кладёт свою плашку ровно сюда, иначе она выглядывает снизу */
const PLATE_TOP = CHIP_ROW_H + CHIP_GAP + ROW_GAP

interface Props {
  player: Player
  angle: number
  isMe: boolean
  myChips?: PhysicalChip[]
  placedIds?: Set<string>
  onDenomClick?: (denom: ChipValue) => void
  /** выбор цели предмета (хекс): плашка — мишень */
  onTarget?: () => void
  /** над плашкой: свежая бирка предмета */
  above?: ReactNode
}

export function PlayerSlot({ player, angle, isMe, myChips, placedIds, onDenomClick, onTarget, above }: Props) {
  const { left, top } = unitPosition(angle, UNIT_W, UNIT_H, 0)
  // стопка соперника — стабильные id: на каждый клик и chip_staged узлы не пересоздаются
  const theirs = useMemo(() => buildPhysicalChips(player.chips, `stack-${player.id}`), [player.chips, player.id])
  const chips = isMe ? (myChips ?? []) : theirs

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
        gap: ROW_GAP,
        zIndex: 4,
        paddingBottom: 16,
      }}
    >
      <div style={{ height: CHIP_ROW_H, display: 'flex', alignItems: 'flex-end', marginBottom: CHIP_GAP }}>
        <PhysicalChipStack
          chips={chips}
          interactive={isMe}
          placedIds={placedIds}
          onDenomClick={onDenomClick}
          size="md"
        />
      </div>

      {/* свой баланс — то, что осталось в стопке: выкладываешь фишку — число тает */}
      <motion.div
        className="relative flex flex-col items-center"
        onClick={onTarget}
        {...(onTarget ? pressable(onTarget, `Цель: ${player.name}`) : {})}
        whileHover={onTarget ? { scale: 1.08, y: -3 } : undefined}
        style={{
          cursor: onTarget ? 'crosshair' : undefined, borderRadius: 14,
          boxShadow: onTarget ? `0 0 0 3px ${C.hot}, 0 0 22px ${C.hot}88` : 'none',
        }}
      >
        {above}
        <NamePlate
          name={player.name}
          isMe={isMe}
          balance={isMe ? chips.filter(c => !placedIds?.has(c.id)).reduce((a, c) => a + c.denom, 0) : player.chips}
          player={player}
        />
      </motion.div>
    </div>
  )
}

/** Плашка игрока у стола: имя | $баланс (общая для стола ставок и фонового стола). */
export function NamePlate({ name, isMe, balance, player }: { name: string; isMe: boolean; balance?: number; player?: Player }) {
  return (
    <StreakFlame streak={player?.streak}>
    <div style={{
      position: 'relative', overflow: 'visible',
      display: 'flex', alignItems: 'stretch', maxWidth: UNIT_W, height: CARD_H,
      borderRadius: 12,
      border: `2px solid ${isMe ? C.brass : C.line}`,
      background: C.panel,
      boxShadow: '0 8px 22px rgba(0,0,0,.55)',
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', padding: '0 12px',
        background: isMe ? C.brass : 'transparent', color: isMe ? C.ink : C.fg, borderRadius: '10px 0 0 10px',
        fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', minWidth: 0, gap: 5,
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{name}</span>
        {needsBotMark(player) && <BotMark />}
      </span>
      {/* блайнд, эффекты — бумажной биркой на правом верхнем углу: имя не теснят, справа место кнопкам быстрой ставки */}
      {player && ((player.effects?.length ?? 0) > 0 || player.bigBlind) && (
        <span style={{
          position: 'absolute', right: -10, top: 0, zIndex: 3, transform: 'translateY(-70%) rotate(5deg)',
          pointerEvents: 'none', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 6,
          background: C.paper, boxShadow: '0 3px 8px rgba(0,0,0,.5)',
        }}>
          {player.bigBlind && (
            <span style={{ fontFamily: DISPLAY, fontSize: 11, color: C.ink }}>ББ</span>
          )}
          <Marks p={player} size={22} />
        </span>
      )}
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
    </StreakFlame>
  )
}

export { UNIT_W, CARD_H, CHIP_ROW_H, BALANCE_H, UNIT_H, PLATE_TOP }
