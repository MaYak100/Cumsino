import { useState, useEffect, useRef } from 'react'
import { useGameStore, selectMe, selectIsGladiator } from '../store/gameStore'
import { buildPhysicalChips } from '../types/chips'
import type { PhysicalChip } from '../types/chips'
import type { ChipValue } from '../components/ui/Chip'
import { useStableSlots } from './pileSlots'
import { socket } from '../socket'

/**
 * Логика ставок — общая для круглого стола (BettingTableScreen) и компактной раскладки на телефоне (CompactBetting):
 * своя стопка, черновик (stage_chip — сервер его помнит), толпа керри — выбор варианта, быстрые ставки, блайнд,
 * подтверждение. Вызывается один раз в BettingTableScreen — при повороте телефона раскладка меняется, а черновик
 * остаётся.
 *
 * Истина — на столе: не подтвердил к концу ставок — сервер ставит то, что лежит (если не меньше блайнда), иначе
 * блайнд; в керри — на выделенный вариант. Поэтому каждая выкладка сразу уходит черновиком, а экран, смонтированный
 * заново (переподключение), раскладывает черновик и подтверждённую ставку из стейта.
 */
export function useBetting() {
  const gameState = useGameStore(s => s.gameState)!
  const myId      = useGameStore(s => s.myId)
  const me        = useGameStore(selectMe)
  const isGladiator = useGameStore(selectIsGladiator)
  const markBetSent = useGameStore(s => s.markBetSent)

  const isKerriMode  = gameState.mode === 'kerri'
  const isKerriCrowd = isKerriMode && !isGladiator
  const options = gameState.currentQuestion?.options ?? []
  // толпа знает верный ответ — по умолчанию выделен он (туда же сервер поставит, если ничего не выбрал)
  const correctIndex = gameState.gladiatorAnswer !== undefined ? options.indexOf(gameState.gladiatorAnswer) : -1

  const [myStack, setMyStack]         = useState<PhysicalChip[]>([])
  const [betConfirmed, setBetConfirmed] = useState(false)
  /** выложенные фишки (в керри — на выбранный вариант) */
  const [placedIds, setPlacedIds] = useState<Set<string>>(new Set())
  /** толпа керри: на какой вариант ставлю */
  const [option, setOption] = useState<number | null>(null)

  const roundRef = useRef<number | null>(null)

  // Быстрая ставка раскладывает фишки каскадом (таймеры). Пока раскладывает — «Ставлю» спрятана, ручная выкладка
  // ждёт, а подтверждение сначала докладывает всё разом
  const quick = useRef<{ timers: number[]; pick: PhysicalChip[] } | null>(null)
  const [dealing, setDealing] = useState(false)
  const stopQuick = (flush: boolean): PhysicalChip[] | null => {
    const q = quick.current
    if (!q) return null
    q.timers.forEach(clearTimeout)
    quick.current = null
    setDealing(false)
    if (flush) setPlacedIds(new Set(q.pick.map(c => c.id)))
    return q.pick
  }
  useEffect(() => () => quick.current?.timers.forEach(clearTimeout), [])

  // Новые ставки (или экран смонтирован посреди ставок — переподключение): стопка из баланса, на стол — то, что
  // сервер помнит: подтверждённая ставка или черновик
  useEffect(() => {
    if (gameState.phase !== 'BETTING' || !me || roundRef.current === gameState.roundIndex) return
    roundRef.current = gameState.roundIndex
    stopQuick(false)
    const stack = buildPhysicalChips(me.chips)
    const confirmed = !!gameState.betConfirmed && me.currentBet > 0
    const onTable = confirmed ? me.betChips ?? [] : gameState.myStagedChips ?? []
    const taken = new Set<string>()
    for (const denom of onTable) {
      const chip = [...stack].reverse().find(c => c.denom === denom && !taken.has(c.id))
      if (chip) taken.add(chip.id)
    }
    setMyStack(stack)
    setPlacedIds(taken)
    setBetConfirmed(!!gameState.betConfirmed)
    const saved = confirmed ? me.betOption : gameState.myStagedOption
    setOption(isKerriCrowd ? saved ?? (correctIndex >= 0 ? correctIndex : null) : null)
  }, [gameState.phase, gameState.roundIndex, !!me])

  // ставка подтвердилась на сервере (в т.ч. из другого окна) — здесь тоже
  useEffect(() => {
    if (gameState.betConfirmed) setBetConfirmed(true)
  }, [gameState.betConfirmed])

  // ── производное ──────────────────────────────────────────────────────────
  // в порядке выкладки: от него зависит место фишки в кучке (Set хранит порядок вставки)
  const chipById     = new Map(myStack.map(c => [c.id, c]))
  const placedChips  = [...placedIds].flatMap(id => chipById.get(id) ?? [])
  // места в кучке не зависят от того, что убрали: фишки не переезжают по спирали
  const slots        = useStableSlots(placedChips)
  const sum = (cs: PhysicalChip[]) => cs.reduce((a, c) => a + c.denom, 0)
  const betAmt = sum(placedChips)

  /** Черновик соперникам и серверу (не подтвердишь — поставится он); в керри — с вариантом. */
  const stage = (chips: PhysicalChip[], opt = option) =>
    socket.emit('stage_chip', isKerriCrowd && opt !== null ? { chips: chips.map(c => c.denom), option: opt } : { chips: chips.map(c => c.denom) })

  const place = (denom: ChipValue) => {
    if (betConfirmed || quick.current || isGladiator) return
    if (isKerriCrowd && option === null) return
    const unplaced = myStack.filter(c => c.denom === denom && !placedIds.has(c.id))
    const chip = unplaced[unplaced.length - 1]
    if (!chip) return
    setPlacedIds(prev => new Set([...prev, chip.id]))
    stage([...placedChips, chip])
  }

  const recall = (id: string) => {
    if (betConfirmed || quick.current) return
    setPlacedIds(prev => { const s = new Set(prev); s.delete(id); return s })
    stage(placedChips.filter(c => c.id !== id))
  }

  /** Толпа керри: вариант, на который ставлю (кучка переезжает на него). */
  const selectOption = (i: number) => {
    if (betConfirmed || !isKerriCrowd || i < 0 || i >= options.length) return
    setOption(i)
    stage(quick.current?.pick ?? placedChips, i)
  }

  /** Отмена: всё выложенное — обратно в стопку (вариант остаётся выбранным). */
  const clearDraft = () => {
    if (betConfirmed) return
    stopQuick(false)
    setPlacedIds(new Set())
    stage([])
  }

  // ── блайнд ───────────────────────────────────────────────────────────────
  // меньше блайнда ставку не подтвердить; не подтвердил — сервер поставит стол (если не меньше) или блайнд
  const myBlind = !isGladiator && me?.blind && me.chips >= me.blind ? me.blind : 0

  // ── Быстрая ставка: min / 25% / 50% / all-in ─────────────────────────────
  // Заменяет выложенное на нужную сумму: фишки берутся жадно, от крупных, и летят каскадом. Ставка уходит только по
  // «Ставлю» (или сама в конце ставок — она уже на столе).
  const balance = me?.chips ?? 0
  const quickAmounts = (() => {
    const ceil10 = (x: number) => Math.ceil(x / 10) * 10
    const min = Math.max(10, myBlind)
    const clamp = (x: number) => Math.min(balance, Math.max(min, ceil10(x)))
    return [
      { label: 'min', amount: Math.min(balance, min) },
      { label: '25%', amount: clamp(balance * 0.25) },
      { label: '50%', amount: clamp(balance * 0.5) },
      { label: 'all-in', amount: balance },
    ]
  })()
  const quickBet = (target: number) => {
    if (betConfirmed || target <= 0 || isGladiator) return
    if (isKerriCrowd && option === null) return
    stopQuick(false)
    const pool = [...myStack].sort((a, b) => b.denom - a.denom)
    let rest = target
    const pick: PhysicalChip[] = []
    for (const c of pool) if (c.denom <= rest) { pick.push(c); rest -= c.denom }
    if (rest > 0) {   // ровно не сложилось — добираем одной фишкой сверху
      const extra = pool.filter(c => !pick.includes(c)).reverse().find(c => c.denom >= rest)
      if (extra) pick.push(extra)
    }
    setPlacedIds(new Set())
    if (pick.length) {
      const q = { timers: [] as number[], pick }
      quick.current = q
      setDealing(true)
      pick.forEach((c, i) => q.timers.push(window.setTimeout(() => {
        setPlacedIds(prev => new Set([...prev, c.id]))
        if (i === pick.length - 1 && quick.current === q) { quick.current = null; setDealing(false) }
      }, 60 + i * 55)))
    }
    stage(pick)
  }

  // ── Подтверждение ────────────────────────────────────────────────────────
  const handleConfirm = () => {
    if (betConfirmed) return
    // быстрая ставка ещё раскладывается — подтверждаем всю выбранную сумму, а не то, что успело долететь
    const chips = stopQuick(true) ?? placedChips
    const amount = sum(chips)
    if (amount <= 0 || amount < myBlind) return
    if (isKerriCrowd && option === null) return
    markBetSent()
    socket.emit('place_bet', {
      amount,
      // те же фишки и в том же порядке, что в черновике (stage_chip): у соперников ничего не прыгает
      chips: chips.map(c => c.denom),
      ...(isKerriCrowd ? { option } : {}),
    })
    setBetConfirmed(true)
  }

  /** сколько на кону у варианта (керри): подтверждённые ставки соперников + черновики + своя */
  const stagedBets = useGameStore(s => s.stagedBets)
  const stagedOptions = useGameStore(s => s.stagedOptions)
  const optionTotal = (i: number) =>
    gameState.players.reduce((a, p) => {
      if (p.id === myId) return a
      if (p.betOption === i && p.currentBet > 0) return a + p.currentBet
      if (stagedOptions[p.id] === i && p.currentBet === 0) return a + (stagedBets[p.id] ?? []).reduce((x, y) => x + y, 0)
      return a
    }, 0) + (option === i ? betAmt : 0)

  /** «Ставлю $N» можно показать */
  const canConfirm = !isGladiator && !betConfirmed && !dealing && placedIds.size > 0 && betAmt >= myBlind
    && (!isKerriCrowd || option !== null)
  /** подпись блайнда — пока ставка до него не дотягивает */
  const showBlind = !isGladiator && !betConfirmed && !dealing && myBlind > 0 && betAmt < myBlind
  /** что лежит в черновике (для «Отмены») */
  const hasDraft = placedIds.size > 0

  return {
    gameState, myId, me, isGladiator, isKerriMode, isKerriCrowd,
    myStack, betConfirmed, dealing,
    placedIds, placedChips, slots, betAmt,
    options, option, correctIndex, selectOption, optionTotal,
    myBlind, balance, quickAmounts,
    place, recall, clearDraft,
    quickBet, handleConfirm,
    canConfirm, showBlind, confirmAmount: betAmt, hasDraft,
  }
}

export type Betting = ReturnType<typeof useBetting>
