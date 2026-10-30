import { useState, useEffect, useRef } from 'react'
import { LayoutGroup, motion, AnimatePresence } from 'framer-motion'
import { useGameStore, selectMe, selectIsGladiator } from '../../store/gameStore'
import { buildPhysicalChips, buildChipsForPlayer, pileOffset } from '../../types/chips'
import { useStableSlots } from '../../lib/pileSlots'
import type { PhysicalChip } from '../../types/chips'
import type { ChipValue } from '../ui/Chip'
import { PlayerSlot, UNIT_W, UNIT_H } from '../ui/PlayerSlot'
import { BetZone } from '../ui/BetZone'
import { Timer } from '../ui/Timer'
import { socket } from '../../socket'
import { FeltOval } from '../ui/TableFelt'
import { Sticker } from '../ui/Sticker'
import { TopicStack } from '../ui/Topic'
import { chipStyle } from '../../lib/chipStyle'
import { C, DISPLAY } from '../../theme'
import { FeedTag, useFreshFeed } from '../ui/AnswerProgress'
import {
  playerAngle,
  unitPosition,
  landingZone,
  FELT_CX, FELT_CY,
  SCENE_W, SCENE_H,
  useSceneScale,
  useFlightTransform,
  SceneScaleContext,
} from '../../lib/tableGeometry'
import { Money } from '../ui/Money'
import { GLADIATOR_BONUS } from '@cumsino/shared'
import { pressable } from '../../lib/pressable'
import { isSpectator } from '../../lib/players'

// Раскладка керри-толпы в координатах сцены (сукно: центр 650×415, внутренние полуоси 380×248).
// Кучки соперников лежат у края сукна (landingZone, компактные — BetZone size="sm"); середина рассчитана так, чтобы
// не задевать их при 3–8 игроках: напротив (y≈187, сумма до ≈235), верхние диагонали (x ≤ 435 / ≥ 865 до y≈300),
// бока (x ≤ 330), нижние диагонали (x ≤ 435 / ≥ 865 с y≈528). Сверху вниз: кто отвечает + таймер → вопрос →
// две главные зоны → подпись побочной ставки → 2×2 варианта-квитка (узкие: ниже по сукну соседи ближе) → «Ставлю».
const HEAD_TOP = 256
const Q_TOP = 298
const Q_W = 540

const MAIN_W = 250
const MAIN_H = 60
const MAIN_GAP = 14
const MAIN_TOP = 374
const LOSE_LEFT = FELT_CX - MAIN_W - MAIN_GAP / 2
const WIN_LEFT  = FELT_CX + MAIN_GAP / 2

const SIDE_LABEL_TOP = MAIN_TOP + MAIN_H + 8
const OPT_W = 210
const OPT_H = 64    // до четырёх строк мелкого текста
const OPT_GAP = 6
const OPT_TOP = 466
const OPT_LEFT = FELT_CX - OPT_W - OPT_GAP / 2
const CONFIRM_TOP = OPT_TOP + 2 * OPT_H + OPT_GAP + 8

// фишки в главной зоне и в квитке (банк — внутри квитка, справа: не сливается с кучкой соседа)
const CPIX = 26
const CPIX_BANK = 22
const BANK_PAD = 44   // место справа в квитке под кучку банк-ставки

// «для всех»: «Ставлю» и подпись блайнда — над своей кучкой (сбоку при 7–8 игроках лежит зона соседа)
const ABOVE_MY_PILE = 125

export function BettingTableScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId      = useGameStore(s => s.myId)
  const me        = useGameStore(selectMe)
  const isGladiator = useGameStore(selectIsGladiator)
  const stagedBets  = useGameStore(s => s.stagedBets)
  const targeting   = useGameStore(s => s.targeting)
  const useItem     = useGameStore(s => s.useItem)
  const freshFeed   = useFreshFeed()
  const markBetSent = useGameStore(s => s.markBetSent)

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

  // Быстрая ставка раскладывает фишки каскадом (таймеры). Пока раскладывает — «Ставлю» спрятана, ручная выкладка
  // ждёт, а подтверждение (и авто в конце ставок) сначала докладывает всё разом
  const quick = useRef<{ timers: number[]; pick: PhysicalChip[]; kerri: boolean } | null>(null)
  const [dealing, setDealing] = useState(false)
  const stopQuick = (flush: boolean): PhysicalChip[] | null => {
    const q = quick.current
    if (!q) return null
    q.timers.forEach(clearTimeout)
    quick.current = null
    setDealing(false)
    if (flush) (q.kerri ? setMainPlacedIds : setStdPlacedIds)(new Set(q.pick.map(c => c.id)))
    return q.pick
  }
  useEffect(() => () => quick.current?.timers.forEach(clearTimeout), [])

  useEffect(() => {
    if (gameState.phase === 'BETTING' && me && phaseRef.current !== 'BETTING') {
      stopQuick(false)
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
  // места в кучке не зависят от того, что убрали: фишки не переезжают по спирали
  const stdSlots         = useStableSlots(stdPlacedChips)
  const mainSlots        = useStableSlots(mainPlacedChips)
  const bankSlots        = useStableSlots(bankPlacedChips)
  const mainBetAmt  = mainPlacedChips.reduce((a, c) => a + c.denom, 0)
  const bankBetAmt  = bankPlacedChips.reduce((a, c) => a + c.denom, 0)
  const stdBetAmt   = stdPlacedChips.reduce((a, c) => a + c.denom, 0)
  // Черновик ставки соперникам; в керри — с выделенным исходом: не подтвердишь — сервер поставит блайнд туда
  const stage = (payload: { chips: number[] }, target = mainTarget) =>
    socket.emit('stage_chip', isKerriCrowd && target ? { ...payload, target } : payload)

  // ── Standard mode handlers ───────────────────────────────────────────────
  const stdPlace = (denom: ChipValue) => {
    if (betConfirmed || quick.current) return
    const unplaced = myStack.filter(c => c.denom === denom && !stdPlacedIds.has(c.id))
    const chip = unplaced[unplaced.length - 1]
    if (!chip) return
    setStdPlacedIds(prev => new Set([...prev, chip.id]))
    stage({ chips: [...stdPlacedChips, chip].map(c => c.denom) })
  }

  const stdRecall = (id: string) => {
    if (betConfirmed || quick.current) return
    setStdPlacedIds(prev => { const s = new Set(prev); s.delete(id); return s })
    stage({ chips: stdPlacedChips.filter(c => c.id !== id).map(c => c.denom) })
  }

  // ── Kerri crowd handlers ─────────────────────────────────────────────────
  const kerriPlace = (denom: ChipValue) => {
    if (betConfirmed || quick.current || activeZone === null) return
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
    stage({ chips: [...newMain, ...newBank].map(c => c.denom) })
  }

  const kerriRecall = (id: string) => {
    if (betConfirmed || quick.current) return
    if (mainPlacedIds.has(id)) {
      setMainPlacedIds(prev => { const s = new Set(prev); s.delete(id); return s })
      stage({ chips: [...mainPlacedChips.filter(c => c.id !== id), ...bankPlacedChips].map(c => c.denom) })
    } else if (bankPlacedIds.has(id)) {
      setBankPlacedIds(prev => { const s = new Set(prev); s.delete(id); return s })
      stage({ chips: [...mainPlacedChips, ...bankPlacedChips.filter(c => c.id !== id)].map(c => c.denom) })
    }
  }

  const selectMainZone = (target: 'win' | 'lose') => {
    if (betConfirmed) return
    if (mainTarget !== target) {
      stopQuick(false)
      setMainPlacedIds(new Set())
      stage({ chips: bankPlacedChips.map(c => c.denom) }, target)
    } else {
      stage({ chips: [...mainPlacedChips, ...bankPlacedChips].map(c => c.denom) }, target)
    }
    setMainTarget(target)
    setActiveZone('main')
  }

  const selectBankZone = (idx: number) => {
    if (betConfirmed) return
    if (bankTarget !== null && bankTarget !== idx) {
      setBankPlacedIds(new Set())
      stage({ chips: mainPlacedChips.map(c => c.denom) })
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
  // блайнд («для всех» и толпа керри): меньше него ставку не подтвердить; не подтвердил — сервер поставит блайнд сам
  // (в керри — на выделенный исход, а не выбран — на «ответит»)
  const myBlind = !isGladiator && me?.blind && me.chips >= me.blind ? me.blind : 0

  // ── Быстрая ставка: min / 25% / 50% / all-in ─────────────────────────────
  // Заменяет выложенное (в керри — основную ставку) на нужную сумму: фишки берутся жадно, от крупных, и летят
  // каскадом. Ставка уходит только по «Ставлю».
  const balance = me?.chips ?? 0
  const quickAmounts = (() => {
    const free = balance - (isKerriCrowd ? bankBetAmt : 0)
    const ceil10 = (x: number) => Math.ceil(x / 10) * 10
    const min = Math.max(10, myBlind)
    const clamp = (x: number) => Math.min(free, Math.max(min, ceil10(x)))
    return [
      { label: 'min', amount: Math.min(free, min) },
      { label: '25%', amount: clamp(balance * 0.25) },
      { label: '50%', amount: clamp(balance * 0.5) },
      { label: 'all-in', amount: free },
    ]
  })()
  const quickBet = (target: number) => {
    if (betConfirmed || target <= 0) return
    if (isKerriCrowd && !mainTarget) return
    stopQuick(false)
    const busy = isKerriCrowd ? bankPlacedIds : new Set<string>()
    const pool = myStack.filter(c => !busy.has(c.id)).sort((a, b) => b.denom - a.denom)
    let rest = target
    const pick: PhysicalChip[] = []
    for (const c of pool) if (c.denom <= rest) { pick.push(c); rest -= c.denom }
    if (rest > 0) {   // ровно не сложилось — добираем одной фишкой сверху
      const extra = pool.filter(c => !pick.includes(c)).reverse().find(c => c.denom >= rest)
      if (extra) pick.push(extra)
    }
    const setIds = isKerriCrowd ? setMainPlacedIds : setStdPlacedIds
    setIds(new Set())
    if (isKerriCrowd) setActiveZone('main')
    if (pick.length) {
      const q = { timers: [] as number[], pick, kerri: isKerriCrowd }
      quick.current = q
      setDealing(true)
      pick.forEach((c, i) => q.timers.push(window.setTimeout(() => {
        setIds(prev => new Set([...prev, c.id]))
        if (i === pick.length - 1 && quick.current === q) { quick.current = null; setDealing(false) }
      }, 60 + i * 55)))
    }
    stage({ chips: [...pick.map(c => c.denom), ...(isKerriCrowd ? bankPlacedChips.map(c => c.denom) : [])] })
  }
  const myAngle = playerAngle(0, Math.max(1, gameState.players.length))
  const myUnit = unitPosition(myAngle, UNIT_W, UNIT_H, 0)
  const stdControlsTop = landingZone(myAngle).cy - ABOVE_MY_PILE

  const handleConfirm = () => {
    if (betConfirmed) return
    // быстрая ставка ещё раскладывается — подтверждаем всю выбранную сумму, а не то, что успело долететь
    const pick = stopQuick(true)
    const main = pick && isKerriCrowd ? pick : mainPlacedChips
    const std = pick && !isKerriCrowd ? pick : stdPlacedChips
    const sum = (cs: PhysicalChip[]) => cs.reduce((a, c) => a + c.denom, 0)
    const mainAmt = sum(main)
    const stdAmt = sum(std)
    const ok = isKerriCrowd ? mainTarget !== null && mainAmt > 0 && mainAmt >= myBlind : stdAmt > 0 && stdAmt >= myBlind
    if (!ok) return
    markBetSent()
    if (isKerriCrowd) {
      const withBank = bankTarget !== null && bankBetAmt > 0
      socket.emit('place_bet', {
        amount: mainAmt,
        target: mainTarget,
        // те же фишки и в том же порядке, что в черновике (stage_chip): основная, затем банк — у соперников ничего не пропадает
        chips: [...main, ...(withBank ? bankPlacedChips : [])].map(c => c.denom),
        ...(withBank ? { bankBet: { optionIndex: bankTarget, amount: bankBetAmt } } : {}),
      })
    } else {
      socket.emit('place_bet', { amount: stdAmt, chips: std.map(c => c.denom) })
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
  const flight = useFlightTransform(sceneScale)
  const renderZoneChips = (chips: PhysicalChip[], slots: Map<string, number>, cx: number, cy: number, spread: number, px = CPIX) =>
    chips.map((chip, i) => {
      const o = pileOffset(slots.get(chip.id) ?? i, chip.id, spread)
      return (
        <motion.div
          key={chip.id}
          layoutId={chip.id}
          transformTemplate={flight}
          style={{
            ...chipStyle(chip.denom, px),
            position: 'absolute',
            left: cx + o.x - px / 2,
            top:  cy + o.y - px / 2,
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
        width: '100%',
        height: '100dvh',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Сцена 1300×820, отмасштабированная под экран. Перелёт фишек по layoutId внутри scale() поправляет
          useFlightTransform (масштаб — через SceneScaleContext) */}
      <div style={{
        position: 'absolute',
        width: SCENE_W,
        height: SCENE_H,
        left: `calc(50% - ${SCENE_W / 2}px)`,
        top: `calc(50% - ${SCENE_H / 2}px)`,
        transform: `scale(${sceneScale})`,
      }}>
        <SceneScaleContext.Provider value={sceneScale}>
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
                  <TopicStack topic={gameState.currentQuestion.displayTopic ?? gameState.currentQuestion.topic} size={32} aspectScale={0.5} />
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
                  Ответишь верно — <b style={{ color: C.mint }}>+<Money v={GLADIATOR_BONUS} /></b>
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
                      style={{
                        position: 'absolute', left, top: MAIN_TOP, width: MAIN_W, height: MAIN_H, zIndex: 6,
                        borderRadius: 16,
                        border: `2px ${sel ? 'solid' : 'dashed'} ${sel ? color : `${color}66`}`,
                        background: active ? `${color}2e` : sel ? `${color}14` : 'rgba(8,17,14,0.5)',
                        boxShadow: active ? `0 0 30px ${color}55, inset 0 0 0 1px ${color}` : 'none',
                        willChange: 'auto',
                        cursor: betConfirmed ? 'default' : 'pointer',
                        transition: 'border-color .18s, background .18s, box-shadow .18s',
                      }}
                      onClick={() => selectMainZone(target)}
                      {...(betConfirmed ? {} : pressable(() => selectMainZone(target), win ? 'Ставлю, что ответит' : 'Ставлю, что завалит'))}
                    >
                      <div style={{
                        position: 'absolute', left: 0, right: 0, top: 9, textAlign: 'center',
                        fontFamily: DISPLAY, fontSize: 23, lineHeight: 1, color: sel ? color : `${color}bb`,
                        opacity: sel && mainBetAmt > 0 ? 0.35 : 1, transition: 'opacity .2s',   // фишки поверх надписи
                      }}>
                        {win ? 'Ответит' : 'Завалит'}
                      </div>
                      {total > 0 && (
                        <div style={{
                          position: 'absolute', right: 12, bottom: 6,
                          fontFamily: DISPLAY, fontSize: 14, fontVariantNumeric: 'tabular-nums', color,
                        }}>
                          <Money v={total} />
                        </div>
                      )}
                    </motion.div>
                    {sel && renderZoneChips(mainPlacedChips, mainSlots, left + MAIN_W / 2, MAIN_TOP + MAIN_H / 2 + 4, 12)}
                  </div>
                )
              }
              return (
                <>
                  {/* кто отвечает + таймер — ниже суммы ставки соседа напротив; под ним вопрос */}
                  <div style={{
                    position: 'absolute', left: FELT_CX - Q_W / 2, width: Q_W, top: HEAD_TOP, height: Q_TOP - HEAD_TOP - 8,
                    zIndex: 5, pointerEvents: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  }}>
                    <Timer seconds={gameState.phaseTimeLeft} color={C.hot} size={32} />
                    {gladiatorName && (
                      <span style={{ fontSize: 14, color: C.muted, whiteSpace: 'nowrap' }}>
                        Отвечает <span style={{ fontFamily: DISPLAY, fontSize: 19, color: C.hot }}>{gladiatorName}</span>
                      </span>
                    )}
                  </div>
                  <div style={{
                    position: 'absolute', left: FELT_CX - Q_W / 2, width: Q_W, top: Q_TOP, zIndex: 5, pointerEvents: 'none',
                    textAlign: 'center', color: C.fg, fontWeight: 600, lineHeight: 1.3, textWrap: 'balance',
                    fontSize: q.text.length > 140 ? 15 : 17,   // три строки до главных зон
                  } as React.CSSProperties}>
                    {q.text}
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
                            display: 'flex', alignItems: 'center', padding: `0 ${isCorrect ? 10 : BANK_PAD}px 0 11px`,
                            transition: 'border-color .18s, background .18s, box-shadow .18s',
                          }}
                          onClick={isCorrect ? undefined : () => selectBankZone(idx)}
                          {...(isCorrect || betConfirmed ? {} : pressable(() => selectBankZone(idx), `Ошибётся на «${opt}»`))}
                        >
                          <span style={{
                            flex: 1, fontSize: 13, fontWeight: 600, lineHeight: 1.2,
                            color: isCorrect ? C.mint : isActive ? C.brass : C.fg,
                            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical',
                          } as React.CSSProperties}>
                            {opt}
                          </span>
                          {/* бейджи на кромке, не в строке — тексту варианта нужна вся ширина */}
                          {isCorrect ? (
                            <span style={{
                              position: 'absolute', top: -9, right: 10, fontSize: 11, fontWeight: 800, lineHeight: 1,
                              padding: '3px 7px', borderRadius: 999, background: C.mint, color: C.ink,
                            }}>верный</span>
                          ) : isSel && bankBetAmt > 0 ? (
                            <span style={{
                              position: 'absolute', top: -10, right: 8, zIndex: 30, fontFamily: DISPLAY, fontSize: 12, lineHeight: 1,
                              padding: '3px 7px 4px', borderRadius: 999, background: C.brass, color: C.ink, fontVariantNumeric: 'tabular-nums',
                            }}>
                              <Money v={bankBetAmt} />
                            </span>
                          ) : null}
                        </div>
                        {/* фишки — внутри квитка, справа (место оставлено отступом): своя кучка не сливается с соседской */}
                        {isSel && renderZoneChips(bankPlacedChips, bankSlots, zx + OPT_W - BANK_PAD / 2 - 2, zy + OPT_H / 2 + 3, 5, CPIX_BANK)}
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
                    onTarget={targeting === 'hex' && !isMe && !player.effects?.includes('hex') && !isSpectator(player)
                      ? () => useItem('hex', player.id) : undefined}
                    above={(() => {
                      // хекс — бирка над целью; остальное — над тем, кто применил
                      const e = freshFeed.find(f => f.item === 'hex' ? f.targetId === player.id : f.playerId === player.id)
                      return e ? <FeedTag key={e.at} item={e.item} side="left" /> : null
                    })()}
                  />
                  {/* Standard-mode my zone, or all opponent zones */}
                  {(!isMe || !isKerriCrowd) && (
                    <BetZone
                      cx={cx} cy={cy}
                      chips={betChips}
                      slots={isMe ? stdSlots : undefined}
                      mine={isMe && !isKerriCrowd}
                      onRecall={isMe && !betConfirmed && !isKerriCrowd ? stdRecall : undefined}
                      size={isKerriMode ? 'sm' : 'md'}
                    />
                  )}
                </div>
              )
            })}

          </div>
        </LayoutGroup>

        {/* ── Confirm button (kerri crowd) ── */}
        <AnimatePresence>
          {isKerriCrowd && !betConfirmed && !dealing && mainTarget !== null && mainBetAmt > 0 && mainBetAmt >= myBlind && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6, rotate: -6 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              style={{ position: 'absolute', left: FELT_CX, top: CONFIRM_TOP, zIndex: 60, translateX: '-50%', pointerEvents: 'auto' }}
            >
              <ConfirmButton amount={mainBetAmt + bankBetAmt} onClick={handleConfirm} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Confirm button (all mode) ── */}
        <AnimatePresence>
          {!isGladiator && !isKerriCrowd && !betConfirmed && !dealing && stdPlacedIds.size > 0 && stdBetAmt >= myBlind && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6, rotate: -6 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              style={{ position: 'absolute', left: FELT_CX, top: stdControlsTop, zIndex: 60, translateX: '-50%', pointerEvents: 'auto' }}
            >
              <ConfirmButton amount={stdBetAmt} onClick={handleConfirm} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Блайнд: сколько минимум (пока ставка не дотягивает) ── */}
        <AnimatePresence>
          {!betConfirmed && !dealing && myBlind > 0 && (isKerriCrowd ? !(mainTarget !== null && mainBetAmt >= myBlind) : stdBetAmt < myBlind) && (
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{
                position: 'absolute', zIndex: 60, translateX: '-50%', left: FELT_CX, pointerEvents: 'none',
                top: isKerriCrowd ? CONFIRM_TOP + 6 : stdControlsTop + 6,
                fontSize: 15, fontWeight: 700, color: C.fg, whiteSpace: 'nowrap',
                background: 'rgba(12,21,19,0.8)', borderRadius: 999, padding: '6px 14px',
                border: `1.5px dashed ${C.brass}`,
              }}
            >
              {me?.bigBlind ? 'Большой блайнд' : 'Малый блайнд'}: <span style={{ fontFamily: DISPLAY, color: C.brass }}><Money v={myBlind} /></span>
              {isKerriCrowd && !mainTarget && <span style={{ color: C.muted, fontWeight: 600 }}> — выбери исход</span>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Быстрая ставка: по две кнопки с боков от моей стопки ── */}
        {!isGladiator && !betConfirmed && me && balance >= 10 && (
          <>
            {[quickAmounts.slice(0, 2), quickAmounts.slice(2)].map((col, ci) => (
              <div key={ci} style={{
                position: 'absolute', zIndex: 30, top: myUnit.top + 2,
                left: ci === 0 ? myUnit.left - 86 : myUnit.left + UNIT_W + 6,
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                {col.map(q => (
                  <QuickButton key={q.label} label={q.label} amount={q.amount}
                    disabled={isKerriCrowd && !mainTarget} onClick={() => quickBet(q.amount)} />
                ))}
              </div>
            ))}
          </>
        )}
        </SceneScaleContext.Provider>
      </div>
    </div>
  )
}

/** Быстрая ставка: подпись и сумма; выкладывает фишки, подтверждать — «Ставлю». */
function QuickButton({ label, amount, disabled, onClick }: { label: string; amount: number; disabled: boolean; onClick: () => void }) {
  return (
    <motion.button
      onClick={disabled ? undefined : onClick}
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.92 }}
      title={disabled ? 'Сначала выбери исход' : undefined}
      style={{
        width: 80, height: 40, borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
        background: C.panel, border: `1.5px solid ${label === 'all-in' ? C.hot : C.line}`,
        color: C.fg, opacity: disabled ? 0.4 : 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.05,
        boxShadow: '0 6px 14px rgba(0,0,0,.45)',
      }}
    >
      <span style={{ fontFamily: DISPLAY, fontSize: 13, color: label === 'all-in' ? C.hot : C.brass }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}><Money v={amount} /></span>
    </motion.button>
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
