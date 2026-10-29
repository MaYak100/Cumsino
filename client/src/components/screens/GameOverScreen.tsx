import { motion } from 'framer-motion'
import { WIN_CHIPS } from '@cumsino/shared'
import { useGameStore } from '../../store/gameStore'
import { C, DISPLAY } from '../../theme'
import { Sticker } from '../ui/Sticker'

export function GameOverScreen() {
  const winner = useGameStore(s => s.winner)
  const myId = useGameStore(s => s.myId)
  const players = useGameStore(s => s.gameState?.players ?? [])
  const reset = useGameStore(s => s.reset)
  const isWinner = winner?.id === myId
  const standings = [...players].sort((a, b) => b.chips - a.chips)
  const pct = (v: number) => Math.min(100, Math.max(0, (v / WIN_CHIPS) * 100))

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 gap-10">
      <div className="flex flex-col items-center gap-5 text-center">
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-lg" style={{ color: C.muted }}>
          {isWinner ? 'Касса твоя' : 'Кассу забрал'}
        </motion.span>
        <Sticker seed={`win-${winner?.id}`} slam delay={0.2} rotate={-3} jag={9}
          color={C.brass} padding="clamp(14px,2vw,24px) clamp(24px,4vw,48px)">
          <span style={{ fontFamily: DISPLAY, fontSize: 'clamp(44px, 9vw, 112px)', lineHeight: 1 }}>
            {isWinner ? 'Ты' : winner?.name ?? '—'}
          </span>
        </Sticker>
      </div>

      <div className="w-full flex flex-col gap-2.5" style={{ maxWidth: '40rem' }}>
        {standings.map((p, i) => {
          const me = p.id === myId
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.06 }}
              className="grid grid-cols-[110px_1fr_64px] items-center gap-4"
            >
              <span className="font-bold truncate" style={{ color: me ? C.brass : C.fg }}>{me ? 'Ты' : p.name}</span>
              <div className="relative h-3 rounded" style={{ background: C.panel2 }}>
                <motion.div
                  className="absolute left-0 top-0 h-full rounded"
                  style={{ background: i === 0 ? C.brass : C.muted }}
                  initial={{ width: '0rem' }}
                  animate={{ width: `${pct(p.chips)}%` }}
                  transition={{ delay: 0.8 + i * 0.06, duration: 0.8, ease: [0.65, 0, 0.35, 1] }}
                />
              </div>
              <span className="text-right tnum" style={{ fontFamily: DISPLAY, color: i === 0 ? C.brass : C.fg }}>${p.chips}</span>
            </motion.div>
          )
        })}
      </div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
        whileTap={{ scale: 0.95 }}
        onClick={reset}
        className="rounded-2xl px-10 h-14 text-lg font-bold"
        style={{ background: C.fg, color: C.ink }}
      >
        Новая игра
      </motion.button>
    </div>
  )
}
