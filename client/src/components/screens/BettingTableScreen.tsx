import { useState, useEffect, useRef } from 'react'
import { LayoutGroup, motion, AnimatePresence } from 'framer-motion'
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
  OUTER_RX, OUTER_RY,
  SCENE_W, SCENE_H,
  useSceneScale,
} from '../../lib/tableGeometry'

// Zone layout constants — positions in scene coord space
// Felt inner bottom = FELT_CY + FELT_RY = 415+248 = 663. All zones must stay above it.
// Header starts at 270 (below top opponent bet zone cy≈225), ends ~348. Q_TOP=365 leaves 17px gap.

const OPT_W = 220
const OPT_H = 60
const OPT_GAP = 8
const OPT_TOP = 412
const OPT_LEFT = FELT_CX - OPT_W - OPT_GAP / 2   // = 650 − 256 − 4 = 390

const MAIN_W = 200
const MAIN_H = 80
const MAIN_GAP = 14
const MAIN_TOP = OPT_TOP + 2 * (OPT_H + OPT_GAP) + 14  // = 452+104+14 = 570
const LOSE_LEFT = FELT_CX - MAIN_W - MAIN_GAP / 2       // = 650−290−7 = 353
const WIN_LEFT  = FELT_CX + MAIN_GAP / 2                // = 657

const Q_TOP = 300
const Q_CX  = FELT_CX  // = 650
const Q_W   = 440

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

  const sceneScale = useSceneScale()
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
  const handleConfirmRef = useRef<() => void>(() => {})
  const autoConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  useEffect(() => {
    if (gameState.phase !== 'BETTING' || isGladiator) return
    const delay = Math.max(500, (gameState.phaseTimeLeft - 2) * 1000)
    if (autoConfirmTimerRef.current) clearTimeout(autoConfirmTimerRef.current)
    autoConfirmTimerRef.current = setTimeout(() => handleConfirmRef.current(), delay)
    return () => { if (autoConfirmTimerRef.current) clearTimeout(autoConfirmTimerRef.current) }
  }, [gameState.phase, isGladiator])

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
  // ── Standard mode handlers ───────────────────────────────────────────────
  const stdPlace = (denom: ChipValue) => {
    if (betConfirmed) return
    const unplaced = myStack.filter(c => c.denom === denom && !stdPlacedIds.has(c.id))
    const chip = unplaced[unplaced.length - 1]
    if (!chip) return
    setStdPlacedIds(prev => new Set([...prev, chip.id]))
    socket.emit('stage_chip', { chips: [...stdPlacedChips, chip].map(c => c.denom) })
  }

  const stdRecall = (id: string) => {
    if (betConfirmed) return
    setStdPlacedIds(prev => { const s = new Set(prev); s.delete(id); return s })
    socket.emit('stage_chip', { chips: stdPlacedChips.filter(c => c.id !== id).map(c => c.denom) })
  }

  // ── Kerri crowd handlers ─────────────────────────────────────────────────
  const kerriPlace = (denom: ChipValue) => {
    if (betConfirmed || activeZone === null) return
    if (activeZone === 'main' && !mainTarget) return
    if (activeZone === 'bank' && bankTarget === null) return
    const unplacedK = myStack.filter(c => c.denom === denom && !allPlacedIds.has(c.id))
    const chip = unplacedK[unplacedK.length - 1]
    if (!chip) return
    const newMain = activeZone === 'main' ? [...mainPlacedChips, chip] : mainPlacedChips
    const newBank = activeZone === 'bank' ? [...bankPlacedChips, chip] : bankPlacedChips
    if (activeZone === 'main') {
      setMainPlacedIds(prev => new Set([...prev, chip.id]))
    } else {
      setBankPlacedIds(prev => new Set([...prev, chip.id]))
    }
    socket.emit('stage_chip', { chips: [...newMain, ...newBank].map(c => c.denom) })
  }

  const kerriRecall = (id: string) => {
    if (betConfirmed) return
    if (mainPlacedIds.has(id)) {
      setMainPlacedIds(prev => { const s = new Set(prev); s.delete(id); return s })
      socket.emit('stage_chip', { chips: [...mainPlacedChips.filter(c => c.id !== id), ...bankPlacedChips].map(c => c.denom) })
    } else if (bankPlacedIds.has(id)) {
      setBankPlacedIds(prev => { const s = new Set(prev); s.delete(id); return s })
      socket.emit('stage_chip', { chips: [...mainPlacedChips, ...bankPlacedChips.filter(c => c.id !== id)].map(c => c.denom) })
    }
  }

  const selectMainZone = (target: 'win' | 'lose') => {
    if (betConfirmed) return
    if (mainTarget !== target) {
      setMainPlacedIds(new Set())
      socket.emit('stage_chip', { chips: bankPlacedChips.map(c => c.denom) })
    }
    setMainTarget(target)
    setActiveZone('main')
  }

  const selectBankZone = (idx: number) => {
    if (betConfirmed) return
    if (bankTarget !== null && bankTarget !== idx) {
      setBankPlacedIds(new Set())
      socket.emit('stage_chip', { chips: mainPlacedChips.map(c => c.denom) })
    }
    if (bankTarget === idx) {
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
      socket.emit('place_bet', {
        amount: mainBetAmt,
        target: mainTarget,
        chips: mainPlacedChips.map(c => c.denom),
        ...(bankTarget !== null && bankBetAmt > 0 ? { bankBet: { optionIndex: bankTarget, amount: bankBetAmt } } : {}),
      })
    } else {
      socket.emit('place_bet', { amount: stdBetAmt, chips: stdPlacedChips.map(c => c.denom) })
    }
    setBetConfirmed(true)
  }

  // Keep ref fresh every render so auto-confirm timeout always calls latest version
  handleConfirmRef.current = handleConfirm

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
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'radial-gradient(ellipse at 50% 35%, #1c1600 0%, #060606 70%)',
        userSelect: 'none',
      }}
    >
      {/* Table scene */}
      <div style={{
        position: 'absolute',
        width: SCENE_W,
        height: SCENE_H,
        left: '50%',
        top: '50%',
        transform: `translate(-50%, -50%) scale(${sceneScale})`,
      }}>
        <LayoutGroup>
          <div style={{ width: SCENE_W, height: SCENE_H, position: 'relative' }}>

            {/* ── Felt SVG ── */}
            <svg
              style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 1 }}
              width={SCENE_W} height={SCENE_H}
            >
              <ellipse cx={FELT_CX} cy={FELT_CY} rx={OUTER_RX + 16} ry={OUTER_RY + 16} fill="#3d2600" />
              <ellipse cx={FELT_CX} cy={FELT_CY} rx={OUTER_RX + 5}  ry={OUTER_RY + 5}  fill="#150900" />
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

            {/* ── In-felt header: kerri mode ── */}
            {isKerriMode && (
              <div style={{
                position: 'absolute',
                left: 0, top: FELT_CY - OUTER_RY + 75,
                width: SCENE_W, zIndex: 5, pointerEvents: 'none',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 6,
              }}>
                {isKerriCrowd && gladiatorName && (
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24', letterSpacing: '.02em', marginBottom: 10 }}>
                    Ваш Керри: {gladiatorName}
                  </div>
                )}
                <Timer seconds={gameState.phaseTimeLeft} />
              </div>
            )}

            {/* ── In-felt header: all mode — centered in felt ── */}
            {!isKerriMode && gameState.currentQuestion && (
              <div style={{
                position: 'absolute',
                left: 0, top: FELT_CY - 120,
                width: SCENE_W, zIndex: 5, pointerEvents: 'none',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center',
              }}>
                <div style={{ marginBottom: 11 }}><Timer seconds={gameState.phaseTimeLeft} /></div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.16em', color: '#c4c9d4' }}>
                  Тема
                </div>
                <div style={{
                  fontSize: 32, fontWeight: 800, color: '#fbbf24',
                  letterSpacing: '.04em', textAlign: 'center',
                  textShadow: '0 0 24px rgba(251,191,36,0.45)',
                  marginBottom: 21,
                }}>
                  {gameState.currentQuestion.displayTopic ?? gameState.currentQuestion.topic}
                </div>
                <div style={{ fontSize: 13, color: '#e5e7eb' }}>
                  Ставьте ставку на то, что ответите верно
                </div>
              </div>
            )}

            {/* ── Center: gladiator label (only in kerri mode for the gladiator) ── */}
            {isGladiator && isKerriMode && (
              <div style={{
                position: 'absolute',
                left: FELT_CX, top: FELT_CY,
                transform: 'translate(-50%,-50%)',
                textAlign: 'center', pointerEvents: 'none', zIndex: 5,
              }}>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: '#fbbf24', marginBottom: 12 }}>Ты избранный Керри.</div>
                <div style={{ fontSize: 13, color: '#e5e7eb', maxWidth: 340, lineHeight: 1.65, marginBottom: 10 }}>
                  Ответишь верно: получишь 300 фишек.
                </div>
                <div style={{ fontSize: 13, color: '#e5e7eb', maxWidth: 340, lineHeight: 1.65, marginBottom: 10 }}>
                  Сейчас на тебя ставят ставки и все будут смотреть за твоим позором.
                </div>
                <div style={{ fontSize: 13, color: '#e5e7eb', maxWidth: 340, lineHeight: 1.65 }}>
                  Твоя задача порассуждать чутка вслух, потянуть интригу и может это окупится.
                </div>
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
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 6 }}>
                      ВОПРОС
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: '#e5e7eb', lineHeight: 1.45 }}>
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

                    const tagX = idx % 2 === 1 ? zx + OPT_W + 8 : zx - 46

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
                            padding: '8px 10px',
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
                            color: isCorrect ? '#4ade80' : isActive ? '#fbbf24' : '#c4c9d4',
                          }}>
                            {String.fromCharCode(65 + idx)}
                          </div>
                          {/* Label */}
                          <div style={{
                            fontSize: 12, fontWeight: 500,
                            lineHeight: 1.3,
                            color: isCorrect ? '#4ade80' : isActive ? '#fbbf24' : '#e5e7eb',
                            flex: 1,
                          }}>
                            {opt}
                          </div>
                          {isCorrect && (
                            <div style={{ fontSize: 10, color: '#4ade80', fontWeight: 700, flexShrink: 0 }}>✓</div>
                          )}
                        </div>
                        {/* Outside tag: amount + ×4 */}
                        {isSel && (
                          <div style={{
                            position: 'absolute', left: tagX, top: zy,
                            height: OPT_H, zIndex: 7, width: 38,
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: 1,
                            pointerEvents: 'none',
                          }}>
                            {bankBetAmt > 0 && (
                              <div style={{
                                fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                                color: isActive ? '#fbbf24' : '#a16207',
                              }}>${bankBetAmt}</div>
                            )}
                            <div style={{
                              fontSize: 10, fontWeight: 800, letterSpacing: '.04em',
                              color: isActive ? '#fbbf24' : '#a16207',
                            }}>×4</div>
                          </div>
                        )}
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
                    </div>
                    {mainTarget === 'lose' && mainBetAmt > 0 && (
                      <div style={{
                        position: 'absolute', left: LOSE_LEFT - 44, top: MAIN_TOP,
                        width: 38, height: MAIN_H, zIndex: 7, pointerEvents: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        color: activeZone === 'main' ? '#f87171' : '#b91c1c',
                      }}>${mainBetAmt}</div>
                    )}
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
                    </div>
                    {mainTarget === 'win' && mainBetAmt > 0 && (
                      <div style={{
                        position: 'absolute', left: WIN_LEFT + MAIN_W + 6, top: MAIN_TOP,
                        width: 38, height: MAIN_H, zIndex: 7, pointerEvents: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        color: activeZone === 'main' ? '#4ade80' : '#16a34a',
                      }}>${mainBetAmt}</div>
                    )}
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

              const stagedDenoms = stagedBets[player.id]
              const betChips = isMe
                ? (isKerriCrowd ? [] : stdPlacedChips)
                : stagedDenoms !== undefined
                  ? stagedDenoms.map((denom, i) => ({ id: `${i}-${denom}-${player.id}`, denom } as PhysicalChip))
                  : player.betChips?.length
                    ? player.betChips.map((denom, i) => ({ id: `${player.id}-bet-${i}`, denom } as PhysicalChip))
                    : buildChipsForPlayer(player.id, player.currentBet)

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
                      mine={isMe && !isKerriCrowd}
                      onRecall={isMe && !betConfirmed && !isKerriCrowd ? stdRecall : undefined}
                    />
                  )}
                </div>
              )
            })}

          </div>
        </LayoutGroup>

        {/* ── Confirm button (kerri crowd) ── */}
        <AnimatePresence>
          {isKerriCrowd && !betConfirmed && mainTarget !== null && mainBetAmt > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.75 }}
              transition={{ duration: 0.15 }}
              style={{ position: 'absolute', left: FELT_CX - 18, top: MAIN_TOP + MAIN_H + 12, zIndex: 20 }}
            >
              <motion.button
                onClick={handleConfirm}
                whileTap={{ background: '#166534', borderColor: '#4ade80', scale: 0.92 }}
                style={{
                  width: 36, height: 36, borderRadius: 8, border: '2px solid #16a34a',
                  background: '#0f3d22', color: '#4ade80',
                  fontSize: 22, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >✓</motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Confirm button (all mode) ── */}
        <AnimatePresence>
          {!isGladiator && !isKerriCrowd && !betConfirmed && stdPlacedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.75 }}
              transition={{ duration: 0.15 }}
              style={{ position: 'absolute', left: 697, top: 625, zIndex: 20 }}
            >
              <motion.button
                onClick={handleConfirm}
                whileTap={{ background: '#166534', borderColor: '#4ade80', scale: 0.92 }}
                style={{
                  width: 36, height: 36, borderRadius: 8, border: '2px solid #16a34a',
                  background: '#0f3d22', color: '#4ade80',
                  fontSize: 22, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >✓</motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
