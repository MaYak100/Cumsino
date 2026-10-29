import { useState, useEffect, useRef } from 'react'
import { LayoutGroup, motion, AnimatePresence } from 'framer-motion'
import { useGameStore, selectMe, selectIsGladiator } from '../../store/gameStore'
import { buildPhysicalChips, buildChipsForPlayer, pileOffset } from '../../types/chips'
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
  SCENE_W, SCENE_H,
  useSceneScale,
} from '../../lib/tableGeometry'
import { Money } from '../ui/Money'

// Раскладка керри-толпы в координатах сцены (сукно: центр 650×415, внутренние полуоси 380×248).
// Сверху вниз: [кто отвечает + таймер, вопрос] — блок прибит низом к HEAD_BOTTOM и растёт вверх (зона ставки
// верхнего соперника — около y≈187, туда не лезем) → две главные зоны в самой широкой части сукна → подпись
// побочной ставки → 2×2 варианта-квитка → кнопка подтверждения.
const HEAD_BOTTOM = 328
const Q_W = 600

const MAIN_W = 272
const MAIN_H = 84
const MAIN_GAP = 16
const MAIN_TOP = 340
const LOSE_LEFT = FELT_CX - MAIN_W - MAIN_GAP / 2
const WIN_LEFT  = FELT_CX + MAIN_GAP / 2

const SIDE_LABEL_TOP = MAIN_TOP + MAIN_H + 12
const OPT_W = 260
const OPT_H = 52
const OPT_GAP = 8
const OPT_TOP = SIDE_LABEL_TOP + 24
const OPT_LEFT = FELT_CX - OPT_W - OPT_GAP / 2
const CONFIRM_TOP = OPT_TOP + 2 * (OPT_H + OPT_GAP) + 8

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
  // в порядке выкладки: от него зависит место фишки в кучке (Set хранит порядок вставки)
  const chipById         = new Map(myStack.map(c => [c.id, c]))
  const inOrder          = (ids: Set<string>) => [...ids].flatMap(id => chipById.get(id) ?? [])
  const mainPlacedChips  = inOrder(mainPlacedIds)
  const bankPlacedChips  = inOrder(bankPlacedIds)
  const stdPlacedChips   = inOrder(stdPlacedIds)
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
      const withBank = bankTarget !== null && bankBetAmt > 0
      socket.emit('place_bet', {
        amount: mainBetAmt,
        target: mainTarget,
        // те же фишки и в том же порядке, что в черновике (stage_chip): основная, затем банк — у соперников ничего не пропадает
        chips: [...mainPlacedChips, ...(withBank ? bankPlacedChips : [])].map(c => c.denom),
        ...(withBank ? { bankBet: { optionIndex: bankTarget, amount: bankBetAmt } } : {}),
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

  // ── Кучка фишек в зоне (общий layoutId со стопкой — фишка перелетает) ───────
  const renderZoneChips = (chips: PhysicalChip[], cx: number, cy: number, spread: number) =>
    chips.map((chip, i) => {
      const o = pileOffset(i, chip.id, spread)
      return (
        <motion.div
          key={chip.id}
          layoutId={chip.id}
          style={{
            ...chipStyle(chip.denom, CPIX),
            position: 'absolute',
            left: cx + o.x - CPIX / 2,
            top:  cy + o.y - CPIX / 2,
            zIndex: 20 + i,
            cursor: 'pointer',
          }}
          onClick={() => kerriRecall(chip.id)}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        >
          {chip.denom}
        </motion.div>
      )
    })

  // сколько всего на кону у исхода: подтверждённые ставки соперников + своя
  const sideTotal = (target: 'win' | 'lose') =>
    players.reduce((a, p) => a + (p.id !== myId && p.betTarget === target ? p.currentBet : 0), 0)
    + (mainTarget === target ? mainBetAmt : 0)

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

            {/* ── Керри сам: таймер над стикером ── */}
            {isGladiator && isKerriMode && (
              <div style={{
                position: 'absolute', left: FELT_CX - 25, top: FELT_CY - 150, zIndex: 5, pointerEvents: 'none',
              }}>
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

            {/* ══ KERRI CROWD ═════════════════════════════════════════════ */}
            {isKerriCrowd && gameState.currentQuestion && (() => {
              const q  = gameState.currentQuestion!
              const opts = q.options ?? []
              const mainZone = (target: 'win' | 'lose') => {
                const win = target === 'win'
                const color = win ? C.mint : C.hot
                const sel = mainTarget === target
                const active = sel && activeZone === 'main'
                const left = win ? WIN_LEFT : LOSE_LEFT
                const total = sideTotal(target)
                return (
                  <div key={target}>
                    <motion.div
                      whileHover={betConfirmed ? undefined : { y: -2 }}
                      whileTap={betConfirmed ? undefined : { scale: 0.97 }}
                      style={{
                        position: 'absolute', left, top: MAIN_TOP, width: MAIN_W, height: MAIN_H, zIndex: 6,
                        borderRadius: 16,
                        border: `2px ${sel ? 'solid' : 'dashed'} ${sel ? color : `${color}66`}`,
                        background: active ? `${color}2e` : sel ? `${color}14` : 'rgba(8,17,14,0.5)',
                        boxShadow: active ? `0 0 30px ${color}55, inset 0 0 0 1px ${color}` : 'none',
                        cursor: betConfirmed ? 'default' : 'pointer',
                        transition: 'border-color .18s, background .18s, box-shadow .18s',
                      }}
                      onClick={() => selectMainZone(target)}
                    >
                      <div style={{
                        position: 'absolute', left: 0, right: 0, top: 10, textAlign: 'center',
                        fontFamily: DISPLAY, fontSize: 26, lineHeight: 1, color: sel ? color : `${color}bb`,
                        opacity: sel && mainBetAmt > 0 ? 0.35 : 1, transition: 'opacity .2s',   // фишки поверх надписи
                      }}>
                        {win ? 'Ответит' : 'Завалит'}
                      </div>
                      {total > 0 && (
                        <div style={{
                          position: 'absolute', right: 12, bottom: 8,
                          fontFamily: DISPLAY, fontSize: 14, fontVariantNumeric: 'tabular-nums', color,
                        }}>
                          <Money v={total} />
                        </div>
                      )}
                    </motion.div>
                    {sel && renderZoneChips(mainPlacedChips, left + MAIN_W / 2, MAIN_TOP + MAIN_H / 2 + 6, 15)}
                  </div>
                )
              }
              return (
                <>
                  {/* кто отвечает + таймер, под ним вопрос — растёт вверх от HEAD_BOTTOM */}
                  <div style={{
                    position: 'absolute', left: FELT_CX - Q_W / 2, width: Q_W, bottom: SCENE_H - HEAD_BOTTOM,
                    zIndex: 5, pointerEvents: 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Timer seconds={gameState.phaseTimeLeft} color={C.hot} size={40} />
                      {gladiatorName && (
                        <span style={{ fontSize: 15, color: C.muted }}>
                          Отвечает <span style={{ fontFamily: DISPLAY, fontSize: 22, color: C.hot }}>{gladiatorName}</span>
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 19, fontWeight: 600, color: C.fg, lineHeight: 1.35, textWrap: 'balance' } as React.CSSProperties}>
                      {q.text}
                    </div>
                  </div>

                  {mainZone('lose')}
                  {mainZone('win')}

                  {/* побочная ставка: на вариант, который он выберет вместо верного */}
                  <div style={{
                    position: 'absolute', left: 0, width: SCENE_W, top: SIDE_LABEL_TOP, zIndex: 5,
                    textAlign: 'center', fontSize: 14, color: C.muted, pointerEvents: 'none',
                  }}>
                    Угадай, где ошибётся — <span style={{ fontFamily: DISPLAY, color: C.brass }}>×4</span>
                  </div>

                  {opts.map((opt, idx) => {
                    const isCorrect = opt === gameState.gladiatorAnswer
                    const zx = OPT_LEFT + (idx % 2) * (OPT_W + OPT_GAP)
                    const zy = OPT_TOP + Math.floor(idx / 2) * (OPT_H + OPT_GAP)
                    const isSel = bankTarget === idx
                    const isActive = isSel && activeZone === 'bank'
                    return (
                      <div key={idx}>
                        <div
                          style={{
                            position: 'absolute', left: zx, top: zy, width: OPT_W, height: OPT_H, zIndex: 6,
                            borderRadius: 10,
                            border: `2px ${isCorrect || isSel ? 'solid' : 'dashed'} ${
                              isCorrect ? `${C.mint}88` : isActive ? C.brass : isSel ? '#9a7630' : 'rgba(237,232,222,0.18)'}`,
                            background: isCorrect ? 'rgba(62,224,143,0.08)'
                              : isActive ? 'rgba(242,182,48,0.16)' : isSel ? 'rgba(242,182,48,0.07)' : 'rgba(8,17,14,0.5)',
                            boxShadow: isActive ? '0 0 20px rgba(242,182,48,0.3)' : 'none',
                            cursor: isCorrect || betConfirmed ? 'default' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
                            transition: 'border-color .18s, background .18s, box-shadow .18s',
                          }}
                          onClick={isCorrect ? undefined : () => selectBankZone(idx)}
                        >
                          <span style={{
                            width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                            background: isCorrect ? C.mint : isActive ? C.brass : 'rgba(8,17,14,0.7)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontFamily: DISPLAY, color: isCorrect || isActive ? C.ink : C.muted,
                          }}>
                            {idx + 1}
                          </span>
                          <span style={{
                            flex: 1, fontSize: 14, fontWeight: 600, lineHeight: 1.25,
                            color: isCorrect ? C.mint : isActive ? C.brass : C.fg,
                            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          } as React.CSSProperties}>
                            {opt}
                          </span>
                          {isCorrect ? (
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.mint, flexShrink: 0 }}>верный</span>
                          ) : isSel && bankBetAmt > 0 ? (
                            <span style={{ fontFamily: DISPLAY, fontSize: 14, color: C.brass, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                              <Money v={bankBetAmt} />
                            </span>
                          ) : null}
                        </div>
                        {/* фишки — снаружи квитка, на сукне: текст варианта остаётся читаемым */}
                        {isSel && renderZoneChips(bankPlacedChips, idx % 2 ? zx + OPT_W + 26 : zx - 26, zy + OPT_H / 2, 8)}
                      </div>
                    )
                  })}
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
                    // та же схема id, что у черновика: подтверждение не перерисовывает фишки заново
                    ? player.betChips.map((denom, i) => ({ id: `${i}-${denom}-${player.id}`, denom } as PhysicalChip))
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
              style={{ position: 'absolute', left: FELT_CX, top: CONFIRM_TOP, zIndex: 30, translateX: '-50%' }}
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
              style={{ position: 'absolute', left: FELT_CX + 80, top: 606, zIndex: 30 }}
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
        height: 46, padding: '0 22px', borderRadius: 999, border: 'none', cursor: 'pointer',
        background: C.brass, color: C.ink, whiteSpace: 'nowrap',
        fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8,
        boxShadow: '0 4px 0 #a87a17, 0 10px 24px rgba(0,0,0,.5)',
      }}
    >
      Ставлю <span style={{ fontFamily: DISPLAY, fontVariantNumeric: 'tabular-nums' }}><Money v={amount} /></span>
    </motion.button>
  )
}
