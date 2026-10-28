import { motion } from 'framer-motion'

/** Истинное значение варианта после раскрытия ответа («610», «64%»): с sm — справа внутри бокса,
 *  на узком экране — бейджем на верхней кромке (иначе налезает на длинное имя варианта).
 *  Родительский бокс должен быть `relative`. */
export function OptionNote({ note, correct }: { note?: string; correct: boolean }) {
  if (!note) return null
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.15 }}
      className="absolute -top-2.5 right-2 rounded border border-gray-600 bg-[#0b1f0b] px-1.5 text-xs leading-5
                 sm:static sm:ml-auto sm:border-0 sm:bg-transparent sm:px-0 sm:pl-1 sm:text-sm
                 font-semibold tabular-nums whitespace-nowrap"
      style={{ color: correct ? '#4ade80' : '#e5e7eb', borderColor: correct ? '#4ade80' : undefined }}
    >
      {note}
    </motion.span>
  )
}
