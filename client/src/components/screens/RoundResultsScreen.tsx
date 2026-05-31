import { useState, useEffect } from 'react'
import { motion, LayoutGroup } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { WIN_CHIPS } from '@cumsino/shared'

type Phase = 1 | 2 | 3

function toPct(balance: number) {
  return Math.min(100, Math.max(0, (balance / WIN_CHIPS) * 100))
}

function ProgressBar({ prevBalance, newBalance, phase }: {
  prevBalance: number
  newBalance: number
  phase: Phase
}) {
  const prevPct = toPct(prevBalance)
  const newPct = toPct(newBalance)
  const isGain = newBalance > prevBalance
  const isLoss = newBalance < prevBalance
  const animating = phase >= 2

  return (
    <div style={{ marginTop: 10 }}>
      {/* Track */}
      <div style={{ position: 'relative', height: 8, background: '#0d1f0d', borderRadius: 4, overflow: 'hidden' }}>
        {/* Red underlayer — revealed as gold shrinks */}
        {isLoss && (
          <div style={{
            position: 'absolute', left: 0, top: 0, height: '100%',
            width: `${prevPct}%`, background: '#f87171', borderRadius: 4,
          }} />
        )}
        {/* Gold fill */}
        <motion.div
          style={{
            position: 'absolute', left: 0, top: 0, height: '100%',
            background: 'linear-gradient(90deg, #b45309, #fbbf24)',
            borderRadius: isGain ? '4px 0 0 4px' : 4,
          }}
          animate={{ width: `${animating && isLoss ? newPct : prevPct}%` }}
          transition={{ duration: animating ? 0.8 : 0, ease: 'easeInOut' }}
        />
        {/* Green extension */}
        {isGain && (
          <motion.div
            style={{
              position: 'absolute', top: 0, height: '100%',
              left: `${prevPct}%`, background: '#4ade80', borderRadius: '0 4px 4px 0',
            }}
            initial={{ width: '0%' }}
            animate={{ width: animating ? `${newPct - prevPct}%` : '0%' }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
          />
        )}
      </div>

      {/* Marker + edge labels */}
      <div style={{ position: 'relative', height: 22, overflow: 'visible' }}>
        <span style={{ position: 'absolute', bottom: 0, left: 0, color: '#6b7280', fontSize: 9 }}>0</span>
        <span style={{ position: 'absolute', bottom: 0, right: 0, color: '#6b7280', fontSize: 9 }}>3000</span>
        <motion.div
          style={{ position: 'absolute', top: 2 }}
          animate={{ left: `${animating ? newPct : prevPct}%` }}
          transition={{ duration: animating ? 0.8 : 0, ease: 'easeInOut' }}
        >
          <div style={{ transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: 0, height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderBottom: '6px solid #fbbf24',
            }} />
            <div style={{ color: '#fbbf24', fontSize: 9, fontWeight: 700, marginTop: 1, whiteSpace: 'nowrap' }}>
              {animating ? newBalance : prevBalance}
            </div>
          </div>
        </motion.div>
      </div>
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

const RANK_COLORS = ['#fbbf24', '#d1d5db', '#cd7f32']

function rankColor(rank: number) {
  return rank <= 3 ? RANK_COLORS[rank - 1] : '#9ca3af'
}

function PlayerRow({ entry, isMe, phase, enterDelay, compact, rank }: {
  entry: RowEntry
  isMe: boolean
  phase: Phase
  enterDelay: number
  compact: boolean
  rank: number
}) {
  const isGain = entry.delta > 0

  return (
    <motion.div
      layout
      layoutId={entry.playerId}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: enterDelay, layout: { duration: 0.5, ease: 'easeInOut' } }}
      className={`rounded-xl border ${isMe ? 'border-yellow-400 bg-[#2a4a2a]' : 'border-[#3a6a3a] bg-[#1a3a1a]'}`}
      style={{ padding: compact ? '8px 12px 6px' : '10px 14px 8px' }}
    >
      {/* Name + total delta */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ color: rankColor(rank), fontWeight: 700, fontSize: compact ? 11 : 12, minWidth: 16 }}>
            {rank}.
          </span>
          <span style={{
            color: '#fbbf24', fontWeight: 700,
            fontSize: compact ? 13 : 14,
          }}>
            {entry.name}{isMe && ' (ты)'}
          </span>
        </div>
        {entry.delta !== 0 && (
          <span style={{
            color: isGain ? '#4ade80' : '#f87171',
            fontWeight: 700,
            fontSize: compact ? 13 : 15,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {isGain ? '+' : ''}{entry.delta}
          </span>
        )}
      </div>

      {/* Sources */}
      {entry.sources.map((s, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 1 }}>
          <span style={{ color: s.delta >= 0 ? '#4ade80' : '#f87171' }}>
            {s.delta >= 0 ? '✓' : '✗'} {s.label}
          </span>
          {entry.sources.length > 1 && (
            <span style={{ color: s.delta >= 0 ? '#4ade80' : '#f87171', fontVariantNumeric: 'tabular-nums' }}>
              {s.delta > 0 ? '+' : ''}{s.delta}
            </span>
          )}
        </div>
      ))}

      <ProgressBar
        prevBalance={entry.prevBalance}
        newBalance={entry.newBalance}
        phase={phase}
      />
    </motion.div>
  )
}

export function RoundResultsScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const roundResults = useGameStore(s => s.roundResults)
  const myId = useGameStore(s => s.myId)

  const [phase, setPhase] = useState<Phase>(1)

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(2), 1500)
    const t2 = setTimeout(() => setPhase(3), 3500)
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
    phase >= 3 ? b.newBalance - a.newBalance : b.prevBalance - a.prevBalance
  )

  const twoCol = entries.length > 5
  const compact = twoCol

  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-5 px-4">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="text-yellow-400 font-bold tracking-wide mb-1"
        style={{ fontSize: 22 }}
      >
        ИТОГИ РАУНДА
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="text-gray-500 mb-4"
        style={{ fontSize: 11 }}
      >
        Раунд {gameState.roundIndex}
      </motion.div>

      <LayoutGroup>
        <div style={{
          width: '100%',
          maxWidth: twoCol ? 860 : 460,
          display: twoCol ? 'grid' : 'flex',
          gridTemplateColumns: twoCol ? '1fr 1fr' : undefined,
          flexDirection: twoCol ? undefined : 'column',
          gap: 8,
        }}>
          {sorted.map((entry, i) => (
            <PlayerRow
              key={entry.playerId}
              entry={entry}
              isMe={entry.playerId === myId}
              phase={phase}
              enterDelay={i * 0.06}
              compact={compact}
              rank={i + 1}
            />
          ))}
        </div>
      </LayoutGroup>
    </div>
  )
}
