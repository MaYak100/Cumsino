import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface TimerProps {
  seconds: number
}

export function Timer({ seconds }: TimerProps) {
  const [current, setCurrent] = useState(seconds)

  useEffect(() => {
    setCurrent(seconds)
    const id = setInterval(() => {
      setCurrent(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [seconds])

  const isUrgent = current <= 5

  return (
    <motion.div
      animate={isUrgent ? { scale: [1, 1.1, 1] } : {}}
      transition={{ repeat: Infinity, duration: 0.8 }}
      className={`
        inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold
        ${isUrgent ? 'bg-red-600 text-white' : 'bg-yellow-400 text-black'}
      `}
    >
      ⏱ {current} сек
    </motion.div>
  )
}
