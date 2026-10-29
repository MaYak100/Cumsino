import { motion, AnimatePresence } from 'framer-motion'
import { chipScatter } from '../../types/chips'
import type { PhysicalChip } from '../../types/chips'
import { chipStyle } from '../../lib/chipStyle'
import { C, DISPLAY } from '../../theme'

interface Props {
  cx: number
  cy: number
  chips: PhysicalChip[]
  mine: boolean
  onRecall?: (id: string) => void
}

const CHIP_PX = 30
const SCATTER_XY = 15
const UNIT_OFFSET = 16 // shift chips up so (cx,cy) is center of chips+label block

export function BetZone({ cx, cy, chips, mine, onRecall }: Props) {
  const total = chips.reduce((s, c) => s + c.denom, 0)

  const totalLabel = total > 0 ? (
    <div style={{
      position: 'absolute',
      left: cx - 30,
      top: cy - UNIT_OFFSET + 38,
      width: 60,
      textAlign: 'center',
      fontSize: 14,
      fontFamily: DISPLAY,
      color: C.fg,
      fontVariantNumeric: 'tabular-nums',
      background: 'rgba(12,21,19,0.75)',
      borderRadius: 999,
      padding: '2px 6px',
      pointerEvents: 'none',
      zIndex: 15,
    }}>
      {total}
    </div>
  ) : null

  if (!mine) {
    return (
      <>
        <AnimatePresence>
          {chips.map((chip, i) => {
            const ox = chipScatter(chip.id + 'x', SCATTER_XY * 2)
            const oy = chipScatter(chip.id + 'y', SCATTER_XY * 2)
            const left = cx + ox - CHIP_PX / 2
            const top = cy - UNIT_OFFSET + oy - CHIP_PX / 2
            return (
              <motion.div
                key={chip.id}
                style={{ position: 'absolute', left, top, zIndex: 10 }}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.25, delay: i * 0.04 }}
              >
                <div style={chipStyle(chip.denom, CHIP_PX)}>
                  {chip.denom}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
        {totalLabel}
      </>
    )
  }

  return (
    <>
      {chips.map(chip => {
        const ox = chipScatter(chip.id + 'x', SCATTER_XY * 2)
        const oy = chipScatter(chip.id + 'y', SCATTER_XY * 2)
        const left = cx + ox - CHIP_PX / 2
        const top = cy + oy - CHIP_PX / 2

        const inner = (
          <div
            className="cursor-pointer hover:scale-110 hover:-translate-y-1 transition-transform"
            style={chipStyle(chip.denom, CHIP_PX)}
            onClick={() => onRecall?.(chip.id)}
          >
            {chip.denom}
          </div>
        )

        return (
          <motion.div
            key={chip.id}
            layoutId={chip.id}
            style={{ position: 'absolute', left, top, zIndex: 10, borderRadius: '50%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            {inner}
          </motion.div>
        )
      })}
      {totalLabel}
    </>
  )
}
