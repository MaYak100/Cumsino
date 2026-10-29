import React from 'react'
import { motion } from 'framer-motion'
import type { ChipValue } from './Chip'
import type { PhysicalChip } from '../../types/chips'
import { chipStyle } from '../../lib/chipStyle'

interface Props {
  chips: PhysicalChip[]
  interactive: boolean
  placedIds?: Set<string>
  onDenomClick?: (denom: ChipValue) => void
  size?: 'sm' | 'md'
}

const CHIP_PX = { sm: 22, md: 32 } as const
const STEP_PX = { sm: 5, md: 6 } as const

const DENOM_ORDER: ChipValue[] = [500, 100, 50, 20, 10]

export function PhysicalChipStack({ chips, interactive, placedIds, onDenomClick, size = 'md' }: Props) {
  const px = CHIP_PX[size]
  const step = STEP_PX[size]

  const byDenom = new Map<ChipValue, PhysicalChip[]>()
  for (const d of DENOM_ORDER) byDenom.set(d, [])
  for (const chip of chips) byDenom.get(chip.denom)!.push(chip)

  const stacks = DENOM_ORDER.filter(d => byDenom.get(d)!.some(c => !(placedIds?.has(c.id) ?? false)))

  return (
    <div className="flex items-end gap-1.5">
      {stacks.map(denom => {
        const group = byDenom.get(denom)!
        const unplacedCount = group.filter(c => !(placedIds?.has(c.id) ?? false)).length
        if (unplacedCount === 0) return null
        const stackH = px + (unplacedCount - 1) * step
        const isClickable = interactive && unplacedCount > 0 && onDenomClick != null

        const containerStyle: React.CSSProperties = {
          position: 'relative',
          width: px,
          height: stackH,
          flexShrink: 0,
          ...(isClickable ? { cursor: 'pointer' } : {}),
        }

        const unplaced = group.filter(c => !(placedIds?.has(c.id) ?? false))

        const inner = unplaced.map((chip, i) => {
          const wrapperStyle: React.CSSProperties = {
            ...chipStyle(denom, px),
            position: 'absolute',
            bottom: i * step,
            zIndex: i + 1,
          }

          if (interactive) {
            return (
              <motion.div
                key={chip.id}
                layoutId={chip.id}
                style={wrapperStyle}
              >
                {denom}
              </motion.div>
            )
          }

          return (
            <div
              key={chip.id}
              style={wrapperStyle}
            >
              {denom}
            </div>
          )
        })

        if (isClickable) {
          return (
            <motion.div
              key={denom}
              style={containerStyle}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              onClick={() => onDenomClick!(denom)}
            >
              {inner}
            </motion.div>
          )
        }

        return (
          <div key={denom} style={containerStyle}>
            {inner}
          </div>
        )
      })}
    </div>
  )
}
