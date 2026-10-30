import { motion, AnimatePresence } from 'framer-motion'
import { pileOffset } from '../../types/chips'
import type { PhysicalChip } from '../../types/chips'
import { chipStyle } from '../../lib/chipStyle'
import { C, DISPLAY } from '../../theme'
import { Money } from './Money'
import { pressable } from '../../lib/pressable'
import { useFlightTransform } from '../../lib/tableGeometry'

interface Props {
  cx: number
  cy: number
  /** в порядке выкладки — от него зависит место фишки в кучке */
  chips: PhysicalChip[]
  /** постоянные места своих фишек в кучке (lib/pileSlots) — без них место = порядок */
  slots?: Map<string, number>
  mine: boolean
  onRecall?: (id: string) => void
  /** sm — керри-толпа: середину сукна занимают исходы и квитки, кучки соседей у края должны быть компактнее */
  size?: 'md' | 'sm'
}

const SIZES = {
  md: { chip: 30, spread: 16, offset: 16, pill: 44 },
  sm: { chip: 24, spread: 11, offset: 12, pill: 34 },
} as const

/** Ставка игрока на сукне: фишки кучкой (каждая краем на соседней), под ней сумма. */
export function BetZone({ cx, cy, chips, slots, mine, onRecall, size = 'md' }: Props) {
  const { chip: CHIP_PX, spread, offset: UNIT_OFFSET, pill } = SIZES[size]
  const flight = useFlightTransform()
  const total = chips.reduce((s, c) => s + c.denom, 0)
  const at = (chip: PhysicalChip, i: number) => {
    const o = pileOffset(slots?.get(chip.id) ?? i, chip.id, spread)
    return { left: cx + o.x - CHIP_PX / 2, top: cy - UNIT_OFFSET + o.y - CHIP_PX / 2, zIndex: 10 + i }
  }

  return (
    <>
      {mine ? (
        // свои — без AnimatePresence: перелёт со стопки и обратно ведёт общий layoutId
        chips.map((chip, i) => (
          <motion.div
            key={chip.id}
            layoutId={chip.id}
            transformTemplate={flight}
            style={{ position: 'absolute', ...at(chip, i), borderRadius: '50%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            <div
              className="cursor-pointer hover:-translate-y-1 transition-transform"
              style={chipStyle(chip.denom, CHIP_PX)}
              onClick={() => onRecall?.(chip.id)}
              {...(onRecall ? pressable(() => onRecall(chip.id), `Убрать фишку $${chip.denom}`) : {})}
            >
              {chip.denom}
            </div>
          </motion.div>
        ))
      ) : (
        <AnimatePresence>
          {chips.map((chip, i) => (
            <motion.div
              key={chip.id}
              style={{ position: 'absolute', ...at(chip, i) }}
              initial={{ opacity: 0, y: -14, scale: 1.15 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            >
              <div style={chipStyle(chip.denom, CHIP_PX)}>{chip.denom}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
      {total > 0 && (
        <div style={{
          position: 'absolute',
          left: cx - 34,
          top: cy - UNIT_OFFSET + pill,
          width: 68,
          textAlign: 'center',
          fontSize: size === 'sm' ? 13 : 14,
          fontFamily: DISPLAY,
          color: C.fg,
          fontVariantNumeric: 'tabular-nums',
          background: 'rgba(12,21,19,0.78)',
          borderRadius: 999,
          padding: '2px 6px',
          pointerEvents: 'none',
          zIndex: 40,   // кнопки «Ставлю» и подпись блайнда — выше (60): своя кнопка не уходит под чужую сумму
        }}>
          <Money v={total} />
        </div>
      )}
    </>
  )
}
