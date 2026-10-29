import { motion } from 'framer-motion'
import { C, DISPLAY } from '../../theme'

interface Guess { id: string; name: string; value: number; me: boolean }

/** «Кто ближе»: все догадки и правильное число на одной оси. Подписи — в два ряда, чтобы не слипались. */
export function GuessLine({ guesses, correct }: { guesses: Guess[]; correct: number }) {
  if (!guesses.length) return null
  const values = [...guesses.map(g => g.value), correct]
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = (hi - lo) * 0.06 || Math.abs(correct) * 0.1 || 1
  const x = (v: number) => ((v - (lo - pad)) / (hi - lo + 2 * pad)) * 100
  const sorted = [...guesses].sort((a, b) => a.value - b.value)
  const best = Math.min(...guesses.map(g => Math.abs(g.value - correct)))

  return (
    <div className="relative w-full" style={{ height: 92 }}>
      <div className="absolute left-0 right-0 rounded" style={{ top: 46, height: 3, background: C.line }} />
      <motion.div
        className="absolute flex flex-col items-center"
        style={{ left: `${x(correct)}%`, top: 0, translateX: '-50%' }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
      >
        <div style={{
          width: 2, height: 92, borderRadius: 2, opacity: 0.55,
          background: `linear-gradient(${C.mint}00, ${C.mint} 35%, ${C.mint} 65%, ${C.mint}00)`,
        }} />
      </motion.div>
      {sorted.map((g, i) => {
        const up = i % 2 === 0
        const near = Math.abs(g.value - correct) === best
        const color = near ? C.mint : g.me ? C.brass : C.fg
        return (
          <motion.div
            key={g.id}
            className="absolute flex flex-col items-center"
            style={{ top: up ? 9 : 40, translateX: '-50%', flexDirection: up ? 'column' : 'column-reverse' }}
            initial={{ left: `${x(correct)}%`, opacity: 0 }}
            animate={{ left: `${x(g.value)}%`, opacity: 1 }}
            transition={{ delay: 0.35 + i * 0.06, type: 'spring', stiffness: 160, damping: 20 }}
          >
            <span className="whitespace-nowrap text-[0.75rem] font-semibold leading-tight text-center"
              style={{ color, textShadow: `0 0 6px ${C.bg}, 0 0 3px ${C.bg}` }}>
              {g.me ? 'Ты' : g.name}
              <span className="block tnum" style={{ fontFamily: DISPLAY, fontSize: '0.6875rem', opacity: 0.8 }}>{g.value.toLocaleString('ru-RU')}</span>
            </span>
            <span style={{
              width: 10, height: 10, borderRadius: '50%', background: color, margin: '3px 0',
              boxShadow: `0 0 0 3px ${C.bg}`,
            }} />
          </motion.div>
        )
      })}
    </div>
  )
}
