import { motion } from 'framer-motion'
import { C, DISPLAY } from '../../theme'

/** Вордмарк «Cumsino 2»: латунь с жёсткой малиновой тенью, набекрень. С `animated` название влетает с размаху,
 *  следом так же пафосно прилетает двойка и ложится внахлёст на хвост слова — слово вздрагивает от удара. */
export function Logo({ size = 56, animated = false }: { size?: number; animated?: boolean }) {
  const shadow = size * 0.06
  const two = 0.55   // когда прилетает двойка, с

  return (
    <div aria-label="Cumsino 2" style={{ display: 'inline-flex', alignItems: 'flex-end', transform: 'rotate(-4deg)' }}>
      <motion.span
        initial={animated ? { scale: 1.9, opacity: 0, rotate: -12 } : false}
        animate={animated
          ? { scale: 1, opacity: 1, rotate: 0, x: [0, 0, -size * 0.08, size * 0.03, 0] }
          : undefined}
        transition={{
          type: 'spring', stiffness: 380, damping: 18,
          opacity: { duration: 0.1 },
          x: { duration: 0.32, delay: two + 0.08, times: [0, 0.01, 0.35, 0.7, 1] },
        }}
        style={{
          fontFamily: DISPLAY, fontSize: size, lineHeight: 1, color: C.brass,
          textShadow: `${shadow}px ${shadow}px 0 ${C.hot}`,
          display: 'inline-block', position: 'relative', zIndex: 1,
        }}
      >
        Cumsino
      </motion.span>
      <motion.span
        initial={animated ? { scale: 3.2, opacity: 0, rotate: 32, y: -size * 0.4 } : false}
        animate={{ scale: 1, opacity: 1, rotate: 9, y: 0 }}
        transition={animated
          ? { delay: two, type: 'spring', stiffness: 620, damping: 15, opacity: { delay: two, duration: 0.06 } }
          : { duration: 0 }}
        style={{
          fontFamily: DISPLAY, fontSize: size * 1.45, lineHeight: 0.8, color: C.hot,
          textShadow: `${shadow}px ${shadow}px 0 ${C.brass}`,
          display: 'inline-block', position: 'relative', zIndex: 2,
          marginLeft: -size * 0.16,           // нахлёст на «o»
          marginBottom: -size * 0.12,
        }}
      >
        2
      </motion.span>
    </div>
  )
}
