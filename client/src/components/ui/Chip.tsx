import { motion } from 'framer-motion'

export type ChipValue = 10 | 20 | 50 | 100 | 500

interface ChipProps {
  value: ChipValue
  onClick?: () => void
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  layoutId?: string
}

const CHIP_STYLES: Record<ChipValue, string> = {
  10: 'bg-gradient-to-br from-gray-200 to-gray-500 text-gray-900 border-gray-300',
  20: 'bg-gradient-to-br from-green-400 to-green-700 text-white border-green-300',
  50: 'bg-gradient-to-br from-blue-400 to-blue-700 text-white border-blue-300',
  100: 'bg-gradient-to-br from-red-400 to-red-700 text-white border-red-300',
  500: 'bg-gradient-to-br from-gray-700 to-black text-yellow-400 border-gray-600',
}

const SIZE_CLASSES = {
  sm: 'w-10 h-10 text-xs border-2',
  md: 'w-14 h-14 text-sm border-[3px]',
  lg: 'w-16 h-16 text-base border-4',
}

export function Chip({ value, onClick, size = 'md', disabled = false, layoutId }: ChipProps) {
  return (
    <motion.button
      layoutId={layoutId}
      whileHover={!disabled ? { scale: 1.1, y: -4 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={disabled ? undefined : onClick}
      className={`
        ${SIZE_CLASSES[size]}
        ${CHIP_STYLES[value]}
        rounded-full font-bold flex items-center justify-center
        shadow-[0_4px_8px_rgba(0,0,0,0.6)]
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        select-none
      `}
    >
      {value}
    </motion.button>
  )
}
