import { useState, useEffect, useRef } from 'react'
import { LayoutGroup, motion } from 'framer-motion'
import { useGameStore, selectMe, selectIsGladiator } from '../../store/gameStore'
import { buildPhysicalChips, buildChipsForPlayer, chipScatter } from '../../types/chips'
import type { PhysicalChip } from '../../types/chips'
import type { ChipValue } from '../ui/Chip'
import { PlayerSlot } from '../ui/PlayerSlot'
import { BetZone } from '../ui/BetZone'
import { Timer } from '../ui/Timer'
import { socket } from '../../socket'
import {
  playerAngle,
  landingZone,
  FELT_CX, FELT_CY,
  FELT_RY,
  OUTER_RX, OUTER_RY,
  SCENE_W, SCENE_H,
} from '../../lib/tableGeometry'

// Zone layout constants — positions in scene coord space
// Felt interior: x ∈ [270, 1030], y ∈ [167, 663]

const OPT_W = 240
const OPT_H = 48
const OPT_GAP = 12
const OPT_TOP = 322
const OPT_LEFT = FELT_CX - OPT_W - OPT_GAP / 2   // = 650 − 240 − 6 = 404

const MAIN_W = 274
const MAIN_H = 60
const MAIN_GAP = 14
const MAIN_TOP = OPT_TOP + 2 * (OPT_H + OPT_GAP) + 18  // = 322+120+18 = 460
const LOSE_LEFT = FELT_CX - MAIN_W - MAIN_GAP / 2       // = 650−274−7 = 369
const WIN_LEFT  = FELT_CX + MAIN_GAP / 2                // = 657

const Q_TOP    = FELT_CY - FELT_RY + 72   // = 415 − 248 + 72 = 239  (below in-felt header)
const Q_CX     = FELT_CX                  // = 650
const Q_W      = 420

// Chip pixel size inside zones
const CPIX = 26

// Chip inline styles matching PhysicalChipStack CHIP_COLORS
const CHIP_BG: Record<number, { background: string; color: string }> = {
  10:  { background: 'linear-gradient(135deg,#e5e7eb,#6b7280)', color: '#111827' },
  20:  { background: 'linear-gradient(135deg,#4ade80,#15803d)', color: '#fff' },
  50:  { background: 'linear-gradient(135deg,#60a5fa,#1d4ed8)', color: '#fff' },
  100: { background: 'linear-gradient(135deg,#f87171,#b91c1c)', color: '#fff' },
  500: { background: 'linear-gradient(135deg,#374151,#000)',    color: '#fbbf24' },
}

export function BettingTableScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId      = useGameStore(s => s.myId)
  const me        = useGameStore(selectMe)
  const isGladiator = useGameStore(selectIsGladiator)
  const stagedBets  = useGameStore(s => s.stagedBets)

  const [myStack, setMyStack]         = useState<PhysicalChip[]>([])
  const [betConfirmed, setBetConfirmed] = useState(false)

  // Standard-mode (all) placed chips
  const [stdPlacedIds, setStdPlacedIds] = useState<Set<string>>(new Set())

  // Kerri-crowd placed chips, separated by zone
  const [mainTarget,  setMainTarget]  = useState<'win' | 'lose' | null>(null)
  const [bankTarget,  setBankTarget]  = useState<number | null>(null)
  const [activeZone,  setActiveZone]  = useState<'main' | 'bank' | null>(null)
  const [mainPlacedIds, setMainPlacedIds] = useState<Set<string>>(new Set())
  const [bankPlacedIds, setBankPlacedIds] = useState<Set<string>>(new Set())

  const phaseRef = useRef('')

  useEffect(() => {
    if (gameState.phase === 'BETTING' && me && phaseRef.current !== 'BETTING') {
      setMyStack(buildPhysicalChips(me.chips))
      setStdPlacedIds(new Set())
      setBetConfirmed(false)
      setMainTarget(null)
      setBankTarget(null)
      setActiveZone(null)
      setMainPlacedIds(new Set())
      setBankPlacedIds(new Set())
    }
    phaseRef.current = gameState.phase
  }, [gameState.phase])

  const isKerriMode  = gameState.mode === 'kerri'
  const isKerriCrowd = isKerriMode && !isGladiator

  // ── Derived ──────────────────────────────────────────────────────────────
  const allPlacedIds     = new Set([...mainPlacedIds, ...bankPlacedIds])
  const mainPlacedChips  = myStack.filter(c => mainPlacedIds.has(c.id))
  const bankPlacedChips  = myStack.filter(c => bankPlacedIds.has(c.id))
  const stdPlacedChips   = myStack.filter(c => stdPlacedIds.has(c.id))
  const mainBetAmt  = mainPlacedChips.reduce((a, c) => a + c.denom, 0)
  const bankBetAmt  = bankPlacedChips.reduce((a, c) => a + c.denom, 0)
  const stdBetAmt   = stdPlacedChips.reduce((a, c) => a + c.denom, 0)
  const bankTotal   = gameState.players.reduce((a, p) => a + p.currentBet, 0)
    + (betConfirmed ? 0 : isKerriCrowd ? mainBetAmt + bankBetAmt : stdBetAmt)

  // ── Standard mode handlers ───────────────────────────────────────────────
  const stdPlace = (denom: ChipValue) => {
    if (betConfirmed) return
    const unplaced = myStack.filter(c => c.denom === denom && !stdPlacedIds.has(c.id))
    const chip = unplaced[unplaced.length - 1]
    if (!chip) return
    setStdPlacedIds(prev => new Set([...prev, chip.id]))
    socket.emit('stage_chip', { amount: stdBetAmt + denom })
  }

  const stdRecall = (id: string) => {
    if (betConfirmed) return
    const denom = myStack.find(c => c.id === id)?.denom ?? 0
    setStdPlacedIds(prev => { const s = new Set(prev); s.delete(id); return s })
    socket.emit('stage_chip', { amount: Math.max(0, stdBetAmt - denom) })
  }

  // ── Kerri crowd handlers ─────────────────────────────────────────────────
  const kerriPlace = (denom: ChipValue) => {
    if (betConfirmed || activeZone === null) return
    if (activeZone === 'main' && !mainTarget) return
    if (activeZone === 'bank' && bankTarget === null) return
    const unplacedK = myStack.filter(c => c.denom === denom && !allPlacedIds.has(c.id))
    const chip = unplacedK[unplacedK.length - 1]
    if (!chip) return
    if (activeZone === 'main') {
      setMainPlacedIds(prev => new Set([...prev, chip.id]))
    } else {
      setBankPlacedIds(prev => new Set([...prev, chip.id]))
    }
    socket.emit('stage_chip', { amount: mainBetAmt + bankBetAmt + denom })
  }

  const kerriRecall = (id: string) => {
    if (betConfirmed) return
    const denom = myStack.find(c => c.id === id)?.denom ?? 0
    if (mainPlacedIds.has(id)) {
      setMainPlacedIds(prev => { const s = new Set(prev); s.delete(id); return s })
      socket.emit('stage_chip', { amount: Math.max(0, mainBetAmt + bankBetAmt - denom) })
    } else if (bankPlacedIds.has(id)) {
      setBankPlacedIds(prev => { const s = new Set(prev); s.delete(id); return s })
      socket.emit('stage_chip', { amount: Math.max(0, mainBetAmt + bankBetAmt - denom) })
    }
  }

  const selectMainZone = (target: 'win' | 'lose') => {
    if (betConfirmed) return
    if (mainTarget !== target) {
      // Switching sides: return chips placed in previous main zone
      setMainPlacedIds(new Set())
      socket.emit('stage_chip', { amount: bankBetAmt })
    }
    setMainTarget(target)
    setActiveZone('main')
  }

  const selectBankZone = (idx: number) => {
    if (betConfirmed) return
    if (bankTarget !== null && bankTarget !== idx) {
      setBankPlacedIds(new Set())
      socket.emit('stage_chip', { amount: mainBetAmt })
    }
    if (bankTarget === idx) {
      // Toggle off only if empty
      if (bankPlacedIds.size === 0) {
        setBankTarget(null)
        if (activeZone === 'bank') setActiveZone(mainTarget ? 'main' : null)
      } else {
        setActiveZone('bank')
      }
    } else {
      setBankTarget(idx)
      setActiveZone('bank')
    }
  }

  // ── Confirm ──────────────────────────────────────────────────────────────
  const canConfirm = !betConfirmed && (
    isKerriCrowd ? mainTarget !== null && mainBetAmt > 0 : stdBetAmt > 0
  )

  const handleConfirm = () => {
    if (!canConfirm) return
    if (isKerriCrowd) {
      socket.emit('place_bet', { amount: mainBetAmt, target: mainTarget })
      if (bankTarget !== null && bankBetAmt > 0) {
        socket.emit('place_bank_bet', { optionIndex: bankTarget, amount: bankBetAmt })
      }
    } else {
      socket.emit('place_bet', { amount: stdBetAmt, target: undefined })
    }
    setBetConfirmed(true)
  }

  const players       = gameState.players
  const others        = players.filter(p => p.id !== myId)
  const orderedPlayers = me ? [me, ...others] : players
  const N             = orderedPlayers.length
  const gladiatorName = players.find(p => p.id === gameState.gladiatorId)?.name

  // ── Zone chip renderer (shared layoutId with PhysicalChipStack) ───────────
  const renderZoneChips = (
    chips: PhysicalChip[],
    zx: number, zy: number, zw: number, zh: number,
  ) => chips.map(chip => {
    const ox = chipScatter(chip.id + 'zx', zw * 0.18)
    const oy = chipScatter(chip.id + 'zy', zh * 0.22)
    return (
      <motion.div
        key={chip.id}
        layoutId={chip.id}
        style={{
          position: 'absolute',
          left: zx + zw / 2 + ox - CPIX / 2,
          top:  zy + zh / 2 + oy - CPIX / 2,
          zIndex: 20,
          width: CPIX, height: CPIX,
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 8,
          cursor: 'pointer',
          boxShadow: '0 3px 10px rgba(0,0,0,0.85)',
          border: '1.5px solid rgba(255,255,255,0.15)',
          ...CHIP_BG[chip.denom],
        }}
        onClick={() => kerriRecall(chip.id)}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      >
        {chip.denom}
      </motion.div>
    )
  })

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at 50% 35%, #1c1600 0%, #060606 70%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        userSelect: 'none',
      }}
    >
      {/* Table scene */}
      <div style={{ width: SCENE_W, height: SCENE_H, flexShrink: 0, position: 'relative' }}>
        <LayoutGroup>
          <div style={{ width: SCENE_W, height: SCENE_H, position: 'relative' }}>

            {/* ── Felt SVG ── */}
            <svg
              style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 1 }}
              width={SCENE_W} height={SCENE_H}
            >
              <ellipse cx={FELT_CX} cy={FELT_CY} rx={OUTER_RX + 14} ry={OUTER_RY + 14} fill="#3d2600" />
              <defs>
                <radialGradient id="felt-g" cx="35%" cy="38%" r="65%">
                  <stop offset="0%"   stopColor="#278320" />
                  <stop offset="55%"  stopColor="#0e4a0a" />
                  <stop offset="100%" stopColor="#071e06" />
                </radialGradient>
              </defs>
              <ellipse
                cx={FELT_CX} cy={FELT_CY}
                rx={OUTER_RX} ry={OUTER_RY}
                fill="url(#felt-g)"
              />
            </svg>

            {/* ── In-felt header: timer + topic + kerri badge ── */}
            <div style={{
              position: 'absolute',
              left: FELT_CX - 260, top: FELT_CY - OUTER_RY + 16,
              width: 520, zIndex: 5, pointerEvents: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
            }}>
              <Timer seconds={gameState.phaseTimeLeft} />
              {gameState.currentQuestion && (
                <div style={{ color: '#9ca3af', fontSize: 12 }}>
                  Тема: <span style={{ color: '#fbbf24' }}>{gameState.currentQuestion.topic}</span>
                </div>
              )}
              {isKerriMode && gladiatorName && (
                <div style={{
                  background: 'linear-gradient(135deg,#92400e,#78350f)',
                  border: '1px solid #d97706',
                  borderRadius: 20,
                  padding: '3px 12px',
                  fontSize: 11, fontWeight: 700,
                  color: '#fbbf24', letterSpacing: '.05em',
                }}>
                  🎯 КЕРРИ: {gladiatorName}
                </div>
              )}
            </div>

            {/* ── Center: bank or gladiator label (non-kerri-crowd only) ── */}
            {!isKerriCrowd && (
              <div style={{
                position: 'absolute',
                left: FELT_CX, top: FELT_CY,
                transform: 'translate(-50%,-50%)',
                textAlign: 'center', pointerEvents: 'none', zIndex: 5,
              }}>
                {isGladiator && isKerriMode ? (
                  <>
                    <div style={{ fontSize: 26, marginBottom: 4 }}>🎯</div>
                    <div style={{ fontSize: 15, fontWeight: 'bold', color: '#fbbf24' }}>Ты — Керри!</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Жди вопроса…</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.22)', letterSpacing: '.14em', textTransform: 'uppercase' }}>банк</div>
                    <div style={{ fontSize: 22, fontWeight: 'bold', color: '#fbbf24', marginTop: 2 }}>{bankTotal}</div>
                  </>
                )}
              </div>
            )}

            {/* ══ KERRI CROWD: felt zones ══════════════════════════════════ */}
            {isKerriCrowd && gameState.currentQuestion && (() => {
              const q  = gameState.currentQuestion!
              const opts = q.options ?? []
              return (
                <>
                  {/* Question text */}
                  <div style={{
                    position: 'absolute',
                    left: Q_CX - Q_W / 2, top: Q_TOP, width: Q_W,
                    textAlign: 'center', zIndex: 5, pointerEvents: 'none',
                  }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.28)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 5 }}>
                      ВОПРОС
                    </div>
                    <div style={{ fontSize: 13, color: '#f3f4f6', lineHeight: 1.55 }}>
                      {q.text}
                    </div>
                  </div>

                  {/* ── Option zones (2 × 2) ── */}
                  {opts.map((opt, idx) => {
                    const isCorrect = opt === gameState.gladiatorAnswer
                    const row = Math.floor(idx / 2)
                    const col = idx % 2
                    const zx = OPT_LEFT + col * (OPT_W + OPT_GAP)
                    const zy = OPT_TOP  + row * (OPT_H + OPT_GAP)

                    const isSel    = bankTarget === idx
                    const isActive = isSel && activeZone === 'bank'

                    const borderColor = isCorrect ? '#4ade80'
                      : isActive ? '#fbbf24'
                      : isSel   ? '#a16207'
                      : 'rgba(255,255,255,0.18)'

                    const bg = isCorrect ? 'rgba(5,46,22,0.6)'
                      : isActive ? 'rgba(28,18,0,0.7)'
                      : isSel   ? 'rgba(20,12,0,0.5)'
                      : 'rgba(0,0,0,0.32)'

                    return (
                      <div key={idx}>
                        <div
                          style={{
                            position: 'absolute', left: zx, top: zy,
                            width: OPT_W, height: OPT_H, zIndex: 6,
                            borderRadius: 10,
                            border: `2px ${isCorrect ? 'solid' : 'dashed'} ${borderColor}`,
                            background: bg,
                            cursor: isCorrect ? 'default' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '0 10px',
                            transition: 'border-color .18s, background .18s, box-shadow .18s',
                            boxShadow: isActive ? `0 0 18px rgba(251,191,36,0.28)` : 'none',
                          }}
                          onClick={isCorrect ? undefined : () => selectBankZone(idx)}
                        >
                          {/* Letter chip */}
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                            background: isCorrect ? '#14532d' : isActive ? '#422006' : '#1f2937',
                            border: `1px solid ${isCorrect ? '#4ade80' : isActive ? '#fbbf24' : '#374151'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 800,
                            color: isCorrect ? '#4ade80' : isActive ? '#fbbf24' : '#9ca3af',
                          }}>
                            {String.fromCharCode(65 + idx)}
                          </div>
                          {/* Label */}
                          <div style={{
                            fontSize: 12, fontWeight: 500, overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            color: isCorrect ? '#4ade80' : isActive ? '#fbbf24' : '#d1d5db',
                            flex: 1,
                          }}>
                            {opt}
                          </div>
                          {/* Right tag */}
                          {isCorrect && (
                            <div style={{ fontSize: 10, color: '#4ade80', fontWeight: 700, flexShrink: 0 }}>✓</div>
                          )}
                          {isActive && (
                            <div style={{
                              fontSize: 10, color: '#fbbf24', fontWeight: 800, flexShrink: 0,
                              background: 'rgba(251,191,36,0.12)', borderRadius: 6,
                              padding: '1px 6px', letterSpacing: '.04em',
                            }}>×4</div>
                          )}
                          {isSel && !isActive && (
                            <div style={{ fontSize: 10, color: '#a16207', fontWeight: 700, flexShrink: 0 }}>×4</div>
                          )}
                        </div>
                        {/* Chips inside this bank zone */}
                        {isSel && renderZoneChips(bankPlacedChips, zx, zy, OPT_W, OPT_H)}
                      </div>
                    )
                  })}

                  {/* ── LOSE zone ── */}
                  <div>
                    <div
                      style={{
                        position: 'absolute', left: LOSE_LEFT, top: MAIN_TOP,
                        width: MAIN_W, height: MAIN_H, zIndex: 6,
                        borderRadius: 14,
                        border: `2px dashed ${
                          mainTarget === 'lose' && activeZone === 'main' ? '#f87171'
                          : mainTarget === 'lose' ? '#dc2626'
                          : 'rgba(248,113,113,0.32)'
                        }`,
                        background: mainTarget === 'lose' && activeZone === 'main'
                          ? 'rgba(127,29,29,0.5)'
                          : mainTarget === 'lose'
                          ? 'rgba(90,15,15,0.4)'
                          : 'rgba(0,0,0,0.3)',
                        cursor: 'pointer',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 3,
                        transition: 'border-color .18s, background .18s, box-shadow .18s',
                        boxShadow: mainTarget === 'lose' && activeZone === 'main'
                          ? '0 0 22px rgba(248,113,113,0.32)' : 'none',
                      }}
                      onClick={() => selectMainZone('lose')}
                    >
                      <div style={{
                        fontSize: 14, fontWeight: 800, letterSpacing: '.04em',
                        color: mainTarget === 'lose' ? '#f87171' : 'rgba(248,113,113,0.55)',
                      }}>
                        💀 ОН ЗАВАЛИТ
                      </div>
                      {mainTarget !== 'lose' && (
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '.08em' }}>
                          нажми — ставить сюда
                        </div>
                      )}
                      {mainTarget === 'lose' && mainBetAmt > 0 && (
                        <div style={{ fontSize: 10, color: '#f87171', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {mainBetAmt}
                        </div>
                      )}
                    </div>
                    {mainTarget === 'lose' && renderZoneChips(mainPlacedChips, LOSE_LEFT, MAIN_TOP, MAIN_W, MAIN_H)}
                  </div>

                  {/* ── WIN zone ── */}
                  <div>
                    <div
                      style={{
                        position: 'absolute', left: WIN_LEFT, top: MAIN_TOP,
                        width: MAIN_W, height: MAIN_H, zIndex: 6,
                        borderRadius: 14,
                        border: `2px dashed ${
                          mainTarget === 'win' && activeZone === 'main' ? '#4ade80'
                          : mainTarget === 'win' ? '#16a34a'
                          : 'rgba(74,222,128,0.32)'
                        }`,
                        background: mainTarget === 'win' && activeZone === 'main'
                          ? 'rgba(20,83,45,0.5)'
                          : mainTarget === 'win'
                          ? 'rgba(10,55,25,0.4)'
                          : 'rgba(0,0,0,0.3)',
                        cursor: 'pointer',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 3,
                        transition: 'border-color .18s, background .18s, box-shadow .18s',
                        boxShadow: mainTarget === 'win' && activeZone === 'main'
                          ? '0 0 22px rgba(74,222,128,0.32)' : 'none',
                      }}
                      onClick={() => selectMainZone('win')}
                    >
                      <div style={{
                        fontSize: 14, fontWeight: 800, letterSpacing: '.04em',
                        color: mainTarget === 'win' ? '#4ade80' : 'rgba(74,222,128,0.55)',
                      }}>
                        👍 ОН ОТВЕТИТ
                      </div>
                      {mainTarget !== 'win' && (
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '.08em' }}>
                          нажми — ставить сюда
                        </div>
                      )}
                      {mainTarget === 'win' && mainBetAmt > 0 && (
                        <div style={{ fontSize: 10, color: '#4ade80', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {mainBetAmt}
                        </div>
                      )}
                    </div>
                    {mainTarget === 'win' && renderZoneChips(mainPlacedChips, WIN_LEFT, MAIN_TOP, MAIN_W, MAIN_H)}
                  </div>
                </>
              )
            })()}

            {/* ── Player slots + bet zones ── */}
            {orderedPlayers.map((player, i) => {
              const angle        = playerAngle(i, N)
              const { cx, cy }   = landingZone(angle)
              const isMe         = player.id === myId
              const isThisGlad   = player.id === gameState.gladiatorId

              const betChips = isMe
                ? (isKerriCrowd ? [] : stdPlacedChips)
                : buildChipsForPlayer(player.id, stagedBets[player.id] ?? player.currentBet)

              return (
                <div key={player.id}>
                  <PlayerSlot
                    player={player}
                    angle={angle}
                    isMe={isMe}
                    myChips={isMe ? myStack : undefined}
                    placedIds={isMe ? (isKerriCrowd ? allPlacedIds : stdPlacedIds) : undefined}
                    onDenomClick={
                      isMe && !isThisGlad && !betConfirmed
                        ? isKerriCrowd
                          ? activeZone !== null ? kerriPlace : undefined
                          : stdPlace
                        : undefined
                    }
                  />
                  {/* Standard-mode my zone, or all opponent zones */}
                  {(!isMe || !isKerriCrowd) && (
                    <BetZone
                      cx={cx} cy={cy}
                      chips={betChips}
                      mine={isMe && !betConfirmed && !isKerriCrowd}
                      onRecall={isMe && !betConfirmed && !isKerriCrowd ? stdRecall : undefined}
                    />
                  )}
                </div>
              )
            })}

          </div>
        </LayoutGroup>
      </div>

      {/* ── Bottom: confirm section ── */}
      {!isGladiator && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {betConfirmed ? (
            <div style={{
              padding: '10px 32px', borderRadius: 12,
              background: '#14532d', border: '2px solid #4ade80',
              color: '#4ade80', fontWeight: 700, fontSize: 14, letterSpacing: '.05em',
            }}>
              ✓ СТАВКА ПРИНЯТА
            </div>
          ) : isKerriCrowd ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              {/* Main bet summary */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                  {mainTarget === 'win' ? '👍 Ответит' : mainTarget === 'lose' ? '💀 Завалит' : 'Основная'}
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 900, fontFamily: 'monospace',
                  color: mainBetAmt > 0 ? '#fbbf24' : '#374151',
                }}>
                  {mainBetAmt || '—'}
                </div>
              </div>
              {bankTarget !== null && (
                <>
                  <div style={{ width: 1, height: 36, background: '#1f2937' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                      ×4 {gameState.currentQuestion?.options?.[bankTarget]?.split(' ')[0] ?? ''}
                    </div>
                    <div style={{
                      fontSize: 22, fontWeight: 900, fontFamily: 'monospace',
                      color: bankBetAmt > 0 ? '#fbbf24' : '#374151',
                    }}>
                      {bankBetAmt || '—'}
                    </div>
                  </div>
                </>
              )}
              <button
                onClick={handleConfirm}
                disabled={!canConfirm}
                style={{
                  padding: '10px 32px', borderRadius: 12, border: 'none',
                  background: canConfirm ? 'linear-gradient(135deg,#d97706,#b45309)' : '#374151',
                  color: canConfirm ? '#000' : '#6b7280',
                  fontWeight: 700, fontSize: 14, letterSpacing: '.05em',
                  cursor: canConfirm ? 'pointer' : 'not-allowed',
                  transition: 'all .15s',
                }}
              >
                ✓ ПОДТВЕРДИТЬ СТАВКУ
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.1em' }}>Ставка</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fbbf24', fontFamily: 'monospace' }}>{stdBetAmt}</div>
              </div>
              <button
                onClick={handleConfirm}
                disabled={!canConfirm}
                style={{
                  padding: '10px 32px', borderRadius: 12, border: 'none',
                  background: canConfirm ? 'linear-gradient(135deg,#d97706,#b45309)' : '#374151',
                  color: canConfirm ? '#000' : '#6b7280',
                  fontWeight: 700, fontSize: 14, letterSpacing: '.05em',
                  cursor: canConfirm ? 'pointer' : 'not-allowed',
                  transition: 'all .15s',
                }}
              >
                ✓ ПОДТВЕРДИТЬ СТАВКУ
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
