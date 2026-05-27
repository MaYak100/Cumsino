import { motion } from 'framer-motion'
import type { ChipValue } from './Chip'
import type { PhysicalChip } from '../../types/chips'

interface Props {
  chips: PhysicalChip[]
  interactive: boolean
  placedIds?: Set<string>
  onChipClick?: (id: string) => void
  size?: 'sm' | 'md'
}

const CHIP_PX = { sm: 20, md: 28 } as const
const STEP_PX = { sm: 7, md: 10 } as const

const DENOM_ORDER: ChipValue[] = [500, 100, 50, 20, 10]

const CHIP_COLORS: Record<ChipValue, string> = {
  10:  'bg-gradient-to-br from-gray-200 to-gray-500 text-gray-900 border-gray-300/40',
  20:  'bg-gradient-to-br from-green-400 to-green-700 text-white border-green-300/40',
  50:  'bg-gradient-to-br from-blue-400 to-blue-700 text-white border-blue-300/40',
  100: 'bg-gradient-to-br from-red-400 to-red-700 text-white border-red-300/40',
  500: 'bg-gradient-to-br from-gray-700 to-black text-yellow-400 border-yellow-600/30',
}

export function PhysicalChipStack({ chips, interactive, placedIds, onChipClick, size = 'md' }: Props) {
  const px = CHIP_PX[size]
  const step = STEP_PX[size]

  const byDenom = new Map<ChipValue, PhysicalChip[]>()
  for (const d of DENOM_ORDER) byDenom.set(d, [])
  for (const chip of chips) byDenom.get(chip.denom)!.push(chip)

  const stacks = DENOM_ORDER.filter(d => byDenom.get(d)!.length > 0)

  return (
    <div className="flex items-end gap-1.5">
      {stacks.map(denom => {
        const group = byDenom.get(denom)!
        const stackH = px + (group.length - 1) * step
        return (
          <div
            key={denom}
            style={{ position: 'relative', width: px, height: stackH, flexShrink: 0 }}
          >
            {group.map((chip, i) => {
              const placed = placedIds?.has(chip.id) ?? false
              const chipNode = (
                <div
                  className={`
                    ${CHIP_COLORS[denom]}
                    rounded-full border flex items-center justify-center font-bold select-none
                    shadow-[0_3px_8px_rgba(0,0,0,0.7)]
                    transition-opacity duration-200
                    ${interactive ? 'cursor-pointer' : ''}
                    ${placed ? 'opacity-20' : 'opacity-100'}
                  `}
                  style={{
                    position: 'absolute',
                    width: px,
                    height: px,
                    bottom: i * step,
                    zIndex: i + 1,
                    fontSize: size === 'sm' ? 8 : 10,
                  }}
                  onClick={interactive ? () => onChipClick?.(chip.id) : undefined}
                >
                  {denom}
                </div>
              )

              if (interactive) {
                return (
                  <motion.div
                    key={chip.id}
                    layoutId={chip.id}
                    style={{ position: 'absolute', bottom: i * step, zIndex: i + 1 }}
                    whileHover={!placed ? { scale: 1.18, y: -4 } : {}}
                    transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  >
                    {chipNode}
                  </motion.div>
                )
              }

              return (
                <div
                  key={chip.id}
                  style={{ position: 'absolute', bottom: i * step, zIndex: i + 1 }}
                >
                  {chipNode}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
