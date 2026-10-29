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
import { FeltOval } from '../ui/TableFelt'
import { Sticker } from '../ui/Sticker'
import { chipStyle } from '../../lib/chipStyle'
import { C, DISPLAY } from '../../theme'
import {
  playerAngle,
  landingZone,
  FELT_CX, FELT_CY,
  OUTER_RY,
  SCENE_W, SCENE_H,
  useSceneScale,
} from '../../lib/tableGeometry'

// Zone layout constants — positions in scene coord space
// Felt inner bottom = FELT_CY + FELT_RY = 415+248 = 663. All zones must stay above it.
// Header starts at 270 (below top opponent bet zone cy≈225), ends ~348. Q_TOP=365 leaves 17px gap.

const OPT_W = 220
const OPT_H = 68
const OPT_GAP = 8
const OPT_TOP = 412
const OPT_LEFT = FELT_CX - OPT_W - OPT_GAP / 2   // = 650 − 256 − 4 = 390

const MAIN_W = 200
const MAIN_H = 72
const MAIN_GAP = 14
const MAIN_TOP = OPT_TOP + 2 * (OPT_H + OPT_GAP) + 14  // = 452+104+14 = 570
const LOSE_LEFT = FELT_CX - MAIN_W - MAIN_GAP / 2       // = 650−290−7 = 353
const WIN_LEFT  = FELT_CX + MAIN_GAP / 2                // = 657

const Q_TOP = 306
const Q_CX  = FELT_CX  // = 650
const Q_W   = 440

// Chip pixel size inside zones
const CPIX = 28

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
          ...chipStyle(chip.denom, CPIX),
          position: 'absolute',
          left: zx + zw / 2 + ox - CPIX / 2,
          top:  zy + zh / 2 + oy - CPIX / 2,
          zIndex: 20,
          cursor: 'pointer',
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

            <FeltOval zIndex={1} />

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
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 14, color: C.muted }}>Отвечает</span>
                    <span style={{ fontFamily: DISPLAY, fontSize: 22, color: C.hot }}>{gladiatorName}</span>
                  </div>
                )}
                <Timer seconds={gameState.phaseTimeLeft} color={C.hot} size={50} />
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
                <div style={{ marginBottom: 18 }}><Timer seconds={gameState.phaseTimeLeft} /></div>
                <Sticker seed={`${gameState.currentQuestion.id}-topic`} slam rotate={-3} jag={6} padding="10px 22px 12px"
                  style={{ maxWidth: 520 }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: 32, lineHeight: 1.05, textAlign: 'center' }}>
                    {gameState.currentQuestion.displayTopic ?? gameState.currentQuestion.topic}
                  </div>
                </Sticker>
                <div style={{ fontSize: 15, color: C.fg, marginTop: 22 }}>
                  Ставь на то, что ответишь верно
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
                <Sticker seed={`kerri-${gameState.roundIndex}`} slam rotate={-4} jag={7}
                  color={C.hot} textColor={C.ink} padding="12px 28px 14px">
                  <div style={{ fontFamily: DISPLAY, fontSize: 44, lineHeight: 1 }}>Ты керри</div>
                </Sticker>
                <div style={{ fontSize: 17, color: C.fg, maxWidth: 360, lineHeight: 1.5, margin: '22px auto 8px' }}>
                  Ответишь верно — <b style={{ color: C.mint }}>+300</b>
                </div>
                <div style={{ fontSize: 14, color: C.muted, maxWidth: 360, lineHeight: 1.55, margin: '0 auto' }}>
                  Сейчас на тебя ставят и все смотрят. Рассуждай вслух, тяни интригу.
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
                    <div style={{ fontSize: 18, fontWeight: 600, color: C.fg, lineHeight: 1.4 }}>
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

                    const borderColor = isCorrect ? C.mint
                      : isActive ? C.brass
                      : isSel   ? '#9a7630'
                      : 'rgba(237,232,222,0.2)'

                    const bg = isCorrect ? 'rgba(62,224,143,0.14)'
                      : isActive ? 'rgba(242,182,48,0.14)'
                      : isSel   ? 'rgba(242,182,48,0.07)'
                      : 'rgba(8,17,14,0.45)'

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
                          {/* номер варианта — как на экране вопроса */}
                          <div style={{
                            width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                            background: isCorrect ? C.mint : isActive ? C.brass : 'rgba(8,17,14,0.6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontFamily: DISPLAY,
                            color: isCorrect || isActive ? C.ink : C.muted,
                          }}>
                            {idx + 1}
                          </div>
                          <div style={{
                            fontSize: 12.5, fontWeight: 600,
                            lineHeight: 1.3,
                            color: isCorrect ? C.mint : isActive ? C.brass : C.fg,
                            flex: 1,
                          }}>
                            {opt}
                          </div>
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
                                fontSize: 13, fontFamily: DISPLAY, fontVariantNumeric: 'tabular-nums',
                                color: isActive ? C.brass : '#9a7630',
                              }}>{bankBetAmt}</div>
                            )}
                            <div style={{
                              fontSize: 12, fontFamily: DISPLAY,
                              color: isActive ? C.brass : '#9a7630',
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
                        border: `2px ${mainTarget === 'lose' ? 'solid' : 'dashed'} ${
                          mainTarget === 'lose' && activeZone === 'main' ? C.hot
                          : mainTarget === 'lose' ? '#b8264b'
                          : 'rgba(255,61,110,0.4)'
                        }`,
                        background: mainTarget === 'lose' && activeZone === 'main'
                          ? 'rgba(255,61,110,0.18)'
                          : mainTarget === 'lose'
                          ? 'rgba(255,61,110,0.08)'
                          : 'rgba(8,17,14,0.45)',
                        cursor: 'pointer',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 3,
                        transition: 'border-color .18s, background .18s, box-shadow .18s',
                        boxShadow: mainTarget === 'lose' && activeZone === 'main'
                          ? '0 0 26px rgba(255,61,110,0.35)' : 'none',
                      }}
                      onClick={() => selectMainZone('lose')}
                    >
                      <div style={{
                        fontFamily: DISPLAY, fontSize: 22,
                        color: mainTarget === 'lose' ? C.hot : 'rgba(255,61,110,0.75)',
                        opacity: mainTarget === 'lose' && mainBetAmt > 0 ? 0.3 : 1, transition: 'opacity .2s',
                      }}>
                        Завалит
                      </div>
                    </div>
                    {mainTarget === 'lose' && mainBetAmt > 0 && (
                      <div style={{
                        position: 'absolute', left: LOSE_LEFT - 44, top: MAIN_TOP,
                        width: 38, height: MAIN_H, zIndex: 7, pointerEvents: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontFamily: DISPLAY, fontVariantNumeric: 'tabular-nums',
                        color: activeZone === 'main' ? C.hot : '#b8264b',
                      }}>{mainBetAmt}</div>
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
                        border: `2px ${mainTarget === 'win' ? 'solid' : 'dashed'} ${
                          mainTarget === 'win' && activeZone === 'main' ? C.mint
                          : mainTarget === 'win' ? '#22a565'
                          : 'rgba(62,224,143,0.4)'
                        }`,
                        background: mainTarget === 'win' && activeZone === 'main'
                          ? 'rgba(62,224,143,0.16)'
                          : mainTarget === 'win'
                          ? 'rgba(62,224,143,0.07)'
                          : 'rgba(8,17,14,0.45)',
                        cursor: 'pointer',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 3,
                        transition: 'border-color .18s, background .18s, box-shadow .18s',
                        boxShadow: mainTarget === 'win' && activeZone === 'main'
                          ? '0 0 26px rgba(62,224,143,0.32)' : 'none',
                      }}
                      onClick={() => selectMainZone('win')}
                    >
                      <div style={{
                        fontFamily: DISPLAY, fontSize: 22,
                        color: mainTarget === 'win' ? C.mint : 'rgba(62,224,143,0.75)',
                        opacity: mainTarget === 'win' && mainBetAmt > 0 ? 0.3 : 1, transition: 'opacity .2s',
                      }}>
                        Ответит
                      </div>
                    </div>
                    {mainTarget === 'win' && mainBetAmt > 0 && (
                      <div style={{
                        position: 'absolute', left: WIN_LEFT + MAIN_W + 6, top: MAIN_TOP,
                        width: 38, height: MAIN_H, zIndex: 7, pointerEvents: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontFamily: DISPLAY, fontVariantNumeric: 'tabular-nums',
                        color: activeZone === 'main' ? C.mint : '#22a565',
                      }}>{mainBetAmt}</div>
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
              initial={{ opacity: 0, scale: 0.6, rotate: -6 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              style={{ position: 'absolute', left: FELT_CX, top: MAIN_TOP + MAIN_H + 14, zIndex: 20, translateX: '-50%' }}
            >
              <ConfirmButton amount={mainBetAmt + bankBetAmt} onClick={handleConfirm} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Confirm button (all mode) ── */}
        <AnimatePresence>
          {!isGladiator && !isKerriCrowd && !betConfirmed && stdPlacedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6, rotate: -6 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              style={{ position: 'absolute', left: FELT_CX + 70, top: 612, zIndex: 20 }}
            >
              <ConfirmButton amount={stdBetAmt} onClick={handleConfirm} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** Подтвердить ставку: латунная плашка с суммой. */
function ConfirmButton({ amount, onClick }: { amount: number; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.92 }}
      style={{
        height: 44, padding: '0 20px', borderRadius: 999, border: 'none', cursor: 'pointer',
        background: C.brass, color: C.ink, whiteSpace: 'nowrap',
        fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8,
        boxShadow: '0 4px 0 #a87a17, 0 10px 24px rgba(0,0,0,.5)',
      }}
    >
      Ставлю <span style={{ fontFamily: DISPLAY, fontVariantNumeric: 'tabular-nums' }}>{amount}</span>
    </motion.button>
  )
}
