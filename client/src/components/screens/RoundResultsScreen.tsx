import { useState, useEffect } from 'react'
import { motion, LayoutGroup } from 'framer-motion'
import { WIN_CHIPS } from '@cumsino/shared'
import { useGameStore } from '../../store/gameStore'
import { C, DISPLAY, MODE, modeColor } from '../../theme'
import { RateQuestion } from '../ui/RateQuestion'

type Phase = 1 | 2 | 3
const TICKS = [500, 1000, 1500, 2000, 2500]
const pct = (v: number) => Math.min(100, Math.max(0, (v / WIN_CHIPS) * 100))
const EASE = [0.65, 0, 0.35, 1] as const

/** Дорожка 0 → 3000: старый баланс латунью, прирост — мятой, потеря — малиновым хвостом. */
function Track({ prev, next, phase, compact }: { prev: number; next: number; phase: Phase; compact: boolean }) {
  const moving = phase >= 2
  const gain = next > prev
  const loss = next < prev
  const end = moving ? next : prev
  const h = compact ? 14 : 18
  // число встаёт за концом закрашенного: при потере — за малиновым хвостом; у финиша — внутрь полосы
  const labelAt = moving && loss ? prev : end
  const inside = pct(labelAt) > 86

  return (
    <div className="relative" style={{ height: h }}>
      <div className="absolute inset-0 rounded" style={{
        background: C.panel2,
        backgroundImage: `repeating-linear-gradient(90deg, transparent 0 calc(${100 / 6}% - 1px), ${C.line} calc(${100 / 6}% - 1px) ${100 / 6}%)`,
      }} />
      {loss && (
        <div className="absolute left-0 top-0 h-full rounded" style={{ width: `${pct(prev)}%`, background: C.hot }} />
      )}
      <motion.div
        className="absolute left-0 top-0 h-full rounded"
        style={{ background: `linear-gradient(90deg, #a87a17, ${C.brass})` }}
        initial={false}
        animate={{ width: `${pct(moving && loss ? next : prev)}%` }}
        transition={{ duration: moving ? 0.9 : 0, ease: EASE }}
      />
      {gain && (
        <motion.div
          className="absolute top-0 h-full"
          style={{ left: `${pct(prev)}%`, background: C.mint, borderRadius: '0 4px 4px 0', boxShadow: `0 0 14px ${C.mint}88` }}
          initial={{ width: 0 }}
          animate={{ width: moving ? `${pct(next) - pct(prev)}%` : 0 }}
          transition={{ duration: 0.9, ease: EASE }}
        />
      )}
      <motion.div
        className="absolute top-0 h-full flex items-center"
        initial={false}
        animate={{ left: `${pct(labelAt)}%` }}
        transition={{ duration: moving && !loss ? 0.9 : 0, ease: EASE }}
      >
        <span className="tnum whitespace-nowrap" style={{
          fontFamily: DISPLAY, fontSize: compact ? 12 : 14,
          transform: inside ? 'translateX(calc(-100% - 6px))' : 'translateX(8px)',
          color: inside ? C.ink : C.fg,
        }}>
          {end}
        </span>
      </motion.div>
    </div>
  )
}

interface RowEntry {
  playerId: string
  name: string
  delta: number
  sources: Array<{ label: string; delta: number }>
  newBalance: number
  prevBalance: number
}

const ROW_GRID = 'grid grid-cols-[30px_1fr_76px] sm:grid-cols-[30px_200px_1fr_84px] items-center gap-x-3 sm:gap-x-5'

export function RoundResultsScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const roundResults = useGameStore(s => s.roundResults)
  const roundCorrectAnswer = useGameStore(s => s.roundCorrectAnswer)
  const myId = useGameStore(s => s.myId)
  const [phase, setPhase] = useState<Phase>(1)

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(2), 1200)
    const t2 = setTimeout(() => setPhase(3), 3200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const playerMap = new Map(gameState.players.map(p => [p.id, p]))
  const entries: RowEntry[] = roundResults.flatMap(r => {
    const player = playerMap.get(r.playerId)
    if (!player) return []
    return [{
      playerId: r.playerId,
      name: player.name,
      delta: r.delta,
      sources: r.sources ?? [],
      newBalance: player.chips,
      prevBalance: player.chips - r.delta,
    }]
  })
  const sorted = [...entries].sort((a, b) =>
    phase >= 3 ? b.newBalance - a.newBalance : b.prevBalance - a.prevBalance)
  const compact = entries.length > 6
  const color = modeColor(gameState.mode)

  return (
    <div className="min-h-screen flex flex-col items-center px-4 sm:px-8 pt-8 pb-10">
      <div className="w-full flex flex-wrap items-end justify-between gap-x-6 gap-y-2 mb-6" style={{ maxWidth: 980 }}>
        <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-4">
          <span style={{ fontFamily: DISPLAY, fontSize: 'clamp(30px, 4vw, 44px)', lineHeight: 1 }}>
            Раунд {gameState.roundIndex}
          </span>
          <span style={{
            fontFamily: DISPLAY, fontSize: 14, color: C.ink, background: color,
            padding: '4px 10px 5px', borderRadius: 4, transform: 'rotate(-3deg)', display: 'inline-block',
          }}>
            {MODE[gameState.mode]?.short}
          </span>
        </motion.div>
        {roundCorrectAnswer !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            className="text-[15px] max-w-full sm:max-w-[50%] truncate" style={{ color: C.muted }}>
            Ответ <b style={{ color: C.mint }}>{String(roundCorrectAnswer)}</b>
          </motion.div>
        )}
      </div>

      <div className="w-full" style={{ maxWidth: 980 }}>
        {/* ось */}
        <div className={`${ROW_GRID} mb-2`} style={{ padding: compact ? '0 12px' : '0 14px' }}>
          <span />
          <span className="hidden sm:block" />
          <div className="relative h-5 col-span-2 sm:col-span-1 text-[11px] tnum" style={{ color: C.muted }}>
            <span className="absolute left-0">0</span>
            {TICKS.map(t => (
              <span key={t} className="absolute -translate-x-1/2" style={{ left: `${pct(t)}%` }}>{t}</span>
            ))}
            <span className="absolute right-0 font-bold flex items-center gap-1.5" style={{ color: C.fg }}>
              <span style={{ width: 10, height: 10, background: `repeating-conic-gradient(${C.fg} 0 25%, ${C.bg} 0 50%) 0 0 / 5px 5px` }} />
              {WIN_CHIPS}
            </span>
          </div>
          <span className="hidden sm:block" />
        </div>

        <LayoutGroup>
          <div className="flex flex-col" style={{ gap: compact ? 4 : 8 }}>
            {sorted.map((e, i) => {
              const me = e.playerId === myId
              const rank = i + 1
              return (
                <motion.div
                  key={e.playerId}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05, layout: { duration: 0.55, ease: EASE } }}
                  className={`${ROW_GRID} rounded-xl gap-y-2`}
                  style={{
                    padding: compact ? '6px 12px' : '10px 14px',
                    background: me ? `${C.brass}14` : 'transparent',
                    boxShadow: me ? `inset 3px 0 0 ${C.brass}` : 'none',
                  }}
                >
                  <span className="tnum order-1" style={{
                    fontFamily: DISPLAY, fontSize: compact ? 15 : 18,
                    color: phase >= 3 && rank === 1 ? C.brass : C.muted,
                  }}>
                    {rank}
                  </span>
                  <div className="order-2 min-w-0">
                    <div className="font-bold truncate" style={{ fontSize: compact ? 15 : 17, color: me ? C.brass : C.fg }}>
                      {me ? 'Ты' : e.name}
                    </div>
                    {e.sources.length > 0 && (
                      <div className="flex flex-wrap gap-x-3 text-[12px] leading-tight mt-0.5">
                        {e.sources.map((s, si) => (
                          <span key={si} style={{ color: s.delta >= 0 ? C.mint : C.hot }}>
                            {s.label}{e.sources.length > 1 && <span className="tnum"> {s.delta > 0 ? '+' : ''}{s.delta}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="order-4 sm:order-3 col-span-3 sm:col-span-1">
                    <Track prev={e.prevBalance} next={e.newBalance} phase={phase} compact={compact} />
                  </div>
                  <motion.span
                    className="order-3 sm:order-4 text-right tnum"
                    initial={{ opacity: 0, scale: 1.5 }}
                    animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.5 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.5 + i * 0.04 }}
                    style={{
                      fontFamily: DISPLAY, fontSize: compact ? 18 : 24,
                      color: e.delta > 0 ? C.mint : e.delta < 0 ? C.hot : C.muted,
                    }}
                  >
                    {e.delta > 0 ? '+' : e.delta < 0 ? '−' : ''}{Math.abs(e.delta)}
                  </motion.span>
                </motion.div>
              )
            })}
          </div>
        </LayoutGroup>
      </div>

      <div className="w-full flex justify-center mt-10">
        <RateQuestion delay={0.8} />
      </div>
    </div>
  )
}
