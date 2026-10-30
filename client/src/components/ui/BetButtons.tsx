import { motion } from 'framer-motion'
import { C, DISPLAY } from '../../theme'
import { Money } from './Money'

/** Быстрая ставка: подпись и сумма; выкладывает фишки, подтверждать — «Ставлю». */
export function QuickButton({ label, amount, disabled, onClick }: { label: string; amount: number; disabled: boolean; onClick: () => void }) {
  return (
    <motion.button
      onClick={disabled ? undefined : onClick}
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.92 }}
      title={disabled ? 'Сначала выбери исход' : undefined}
      style={{
        width: 80, height: 40, borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
        background: C.panel, border: `1.5px solid ${label === 'all-in' ? C.hot : C.line}`,
        color: C.fg, opacity: disabled ? 0.4 : 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.05,
        boxShadow: '0 6px 14px rgba(0,0,0,.45)',
      }}
    >
      <span style={{ fontFamily: DISPLAY, fontSize: 13, color: label === 'all-in' ? C.hot : C.brass }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}><Money v={amount} /></span>
    </motion.button>
  )
}

/** Подтвердить ставку: латунная плашка с суммой. */
export function ConfirmButton({ amount, onClick }: { amount: number; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.92 }}
      style={{
        height: 46, padding: '0 22px', borderRadius: 999, border: 'none', cursor: 'pointer',
        background: C.brass, color: C.ink, whiteSpace: 'nowrap',
        fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8,
        boxShadow: '0 4px 0 #a87a17, 0 10px 24px rgba(0,0,0,.5)',
      }}
    >
      Ставлю <span style={{ fontFamily: DISPLAY, fontVariantNumeric: 'tabular-nums' }}><Money v={amount} /></span>
    </motion.button>
  )
}
