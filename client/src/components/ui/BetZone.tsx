import { motion, AnimatePresence } from 'framer-motion'
import { chipScatter } from '../../types/chips'
import type { PhysicalChip } from '../../types/chips'
import type { ChipValue } from './Chip'

interface Props {
  cx: number
  cy: number
  chips: PhysicalChip[]
  mine: boolean
  onRecall?: (id: string) => void
}

const CHIP_PX = 28
const SCATTER_XY = 15

const CHIP_COLORS: Record<ChipValue, string> = {
  10:  'bg-gradient-to-br from-gray-200 to-gray-500 text-gray-900 border-gray-300/40',
  20:  'bg-gradient-to-br from-green-400 to-green-700 text-white border-green-300/40',
  50:  'bg-gradient-to-br from-blue-400 to-blue-700 text-white border-blue-300/40',
  100: 'bg-gradient-to-br from-red-400 to-red-700 text-white border-red-300/40',
  500: 'bg-gradient-to-br from-gray-700 to-black text-yellow-400 border-yellow-600/30',
}

export function BetZone({ cx, cy, chips, mine, onRecall }: Props) {
  if (!mine) {
    return (
      <AnimatePresence>
        {chips.map((chip, i) => {
          const ox = chipScatter(chip.id + 'x', SCATTER_XY * 2)
          const oy = chipScatter(chip.id + 'y', SCATTER_XY * 2)
          const left = cx + ox - CHIP_PX / 2
          const top = cy + oy - CHIP_PX / 2
          return (
            <motion.div
              key={chip.id}
              style={{ position: 'absolute', left, top, zIndex: 10 }}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
            >
              <div
                className={`${CHIP_COLORS[chip.denom]} rounded-full border flex items-center justify-center font-bold select-none shadow-[0_3px_12px_rgba(0,0,0,0.8)]`}
                style={{ width: CHIP_PX, height: CHIP_PX, fontSize: 10 }}
              >
                {chip.denom}
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
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
            className={`
              ${CHIP_COLORS[chip.denom]}
              rounded-full border flex items-center justify-center font-bold select-none
              shadow-[0_3px_12px_rgba(0,0,0,0.8)]
              cursor-pointer hover:scale-110 hover:-translate-y-1 transition-transform
            `}
            style={{ width: CHIP_PX, height: CHIP_PX, fontSize: 10 }}
            onClick={() => onRecall?.(chip.id)}
          >
            {chip.denom}
          </div>
        )

        return (
          <motion.div
            key={chip.id}
            layoutId={chip.id}
            style={{ position: 'absolute', left, top, zIndex: 10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            {inner}
          </motion.div>
        )
      })}
    </>
  )
}
