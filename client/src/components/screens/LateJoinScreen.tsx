import { motion } from 'framer-motion'
import { WIN_CHIPS } from '@cumsino/shared'
import { useGameStore } from '../../store/gameStore'
import { C, DISPLAY } from '../../theme'
import { Logo } from '../ui/Logo'
import { Money } from '../ui/Money'

/** Вошёл посреди раунда: видно стол и гонку, со следующего раунда — в игре. */
export function LateJoinScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)
  const standings = [...gameState.players].sort((a, b) => b.chips - a.chips)
  const pct = (v: number) => Math.min(100, Math.max(0, (v / WIN_CHIPS) * 100))

  return (
    <div className="stage min-h-screen flex flex-col items-center justify-center px-4 py-10 gap-10">
      <Logo size={40} />
      <div className="text-center">
        <div style={{ fontFamily: DISPLAY, fontSize: '2rem' }}>Игра уже идёт</div>
        <motion.div
          className="mt-2 text-[0.9375rem]"
          style={{ color: C.muted }}
          animate={{ opacity: [1, 0.45, 1] }}
          transition={{ repeat: Infinity, duration: 1.8 }}
        >
          Подсядешь со следующего раунда
        </motion.div>
      </div>

      <div className="w-full flex flex-col gap-2.5" style={{ maxWidth: '35rem' }}>
        {standings.map((p, i) => {
          const me = p.id === myId
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="grid grid-cols-[110px_1fr_56px] items-center gap-4"
            >
              <span className="font-bold truncate" style={{ color: me ? C.brass : C.fg }}>{me ? 'Ты' : p.name}</span>
              <div className="relative h-2.5 rounded" style={{ background: C.panel2 }}>
                <div className="absolute left-0 top-0 h-full rounded" style={{ width: `${pct(p.chips)}%`, background: me ? C.brass : C.muted }} />
              </div>
              <span className="text-right tnum" style={{ fontFamily: DISPLAY, fontSize: '0.9375rem' }}><Money v={p.chips} /></span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
