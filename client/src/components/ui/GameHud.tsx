import { motion } from 'framer-motion'
import { WIN_CHIPS } from '@cumsino/shared'
import { useGameStore, selectMe } from '../../store/gameStore'
import { C, DISPLAY, MODE, modeColor } from '../../theme'
import { Money } from './Money'

/** Узкая гонка 0 → 3000: точка на каждого, своя — крупнее. */
export function MiniRace() {
  const players = useGameStore(s => s.gameState?.players ?? [])
  const myId = useGameStore(s => s.myId)
  const pct = (v: number) => Math.min(100, Math.max(0, (v / WIN_CHIPS) * 100))
  const sorted = [...players].sort((a, b) => (a.id === myId ? 1 : 0) - (b.id === myId ? 1 : 0))
  return (
    <div style={{ position: 'relative', height: 22, width: '100%' }} aria-label="Гонка до 3000">
      <div style={{ position: 'absolute', left: 0, right: 0, top: 10, height: 2, background: C.line, borderRadius: 2 }} />
      {[1000, 2000].map(t => (
        <div key={t} style={{ position: 'absolute', left: `${pct(t)}%`, top: 6, width: 1, height: 10, background: C.line }} />
      ))}
      {/* финиш — шашечки */}
      <div style={{
        position: 'absolute', right: -2, top: 3, width: 8, height: 16, borderRadius: 1,
        background: `repeating-conic-gradient(${C.fg} 0 25%, ${C.bg} 0 50%) 0 0 / 4px 4px`,
      }} />
      {sorted.map(p => {
        const me = p.id === myId
        const size = me ? 12 : 8
        return (
          <motion.div
            key={p.id}
            title={`${p.name}: ${p.chips}`}
            initial={false}
            animate={{ left: `${pct(p.chips)}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            style={{
              position: 'absolute', top: 11 - size / 2, width: size, height: size, marginLeft: -size / 2,
              borderRadius: '50%',
              background: me ? C.brass : C.muted,
              boxShadow: me ? `0 0 0 3px ${C.bg}, 0 0 12px ${C.brass}` : `0 0 0 2px ${C.bg}`,
              zIndex: me ? 2 : 1,
            }}
          />
        )
      })}
    </div>
  )
}

/** Верхняя полоса экрана: режим и раунд, гонка до 3000, свой баланс. */
export function GameHud() {
  const gameState = useGameStore(s => s.gameState)
  const me = useGameStore(selectMe)
  if (!gameState) return null
  const color = modeColor(gameState.mode)

  return (
    <div className="flex items-center gap-4 sm:gap-8 px-4 sm:px-7" style={{ height: 60, position: 'relative', zIndex: 5 }}>
      <div className="flex items-center gap-3 shrink-0">
        <span style={{
          fontFamily: DISPLAY, fontSize: '0.8125rem', color: C.ink, background: color,
          padding: '4px 10px 5px', borderRadius: 4, transform: 'rotate(-2deg)', display: 'inline-block',
        }}>
          {MODE[gameState.mode]?.short ?? gameState.mode}
        </span>
        <span className="text-sm tnum" style={{ color: C.muted }}>Раунд {gameState.roundIndex}</span>
      </div>

      <div className="hidden sm:block flex-1" style={{ maxWidth: 560, margin: '0 auto' }}>
        <MiniRace />
      </div>

      {me && (
        <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
          <span className="tnum" style={{ fontFamily: DISPLAY, fontSize: '1.4rem', color: C.fg }}><Money v={me.chips} /></span>
        </div>
      )}
    </div>
  )
}
