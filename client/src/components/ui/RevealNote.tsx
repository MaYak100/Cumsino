import { motion } from 'framer-motion'
import { C } from '../../theme'

/** Пояснение к правильному ответу — появляется под вариантами, ничего не сдвигая выше. */
export function RevealNote({ text, delay = 0.2 }: { text: string; delay?: number }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="w-full text-[0.9375rem] leading-relaxed pl-4"
      style={{ maxWidth: '47.5rem', color: C.fg, borderLeft: `3px solid ${C.mint}` }}
    >
      {text}
    </motion.p>
  )
}
