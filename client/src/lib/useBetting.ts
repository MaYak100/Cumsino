import { useState, useEffect, useRef } from 'react'
import { useGameStore, selectMe, selectIsGladiator } from '../store/gameStore'
import { buildPhysicalChips } from '../types/chips'
import type { PhysicalChip } from '../types/chips'
import type { ChipValue } from '../components/ui/Chip'
import { useStableSlots } from './pileSlots'
import { socket } from '../socket'

export type MainSide = 'win' | 'lose'

/**
 * Логика ставок — общая для круглого стола (BettingTableScreen) и компактной раскладки на телефоне (CompactBetting):
 * своя стопка, черновик (stage_chip соперникам), керри-толпа (исход + банк-ставка на вариант), быстрые ставки,
 * блайнд, подтверждение и авто-подтверждение за 2 с до конца ставок. Вызывается один раз в BettingTableScreen —
 * при повороте телефона раскладка меняется, а черновик остаётся.
 */
export function useBetting() {
  const gameState = useGameStore(s => s.gameState)!
  const myId      = useGameStore(s => s.myId)
  const me        = useGameStore(selectMe)
  const isGladiator = useGameStore(selectIsGladiator)
  const markBetSent = useGameStore(s => s.markBetSent)

  const [myStack, setMyStack]         = useState<PhysicalChip[]>([])
  const [betConfirmed, setBetConfirmed] = useState(false)

  // «для всех»: выложенные фишки
  const [stdPlacedIds, setStdPlacedIds] = useState<Set<string>>(new Set())

  // толпа керри: исход и банк-ставка, у каждой своя кучка
  const [mainTarget,  setMainTarget]  = useState<MainSide | null>(null)
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

  // ── производное ──────────────────────────────────────────────────────────
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
  const sum = (cs: PhysicalChip[]) => cs.reduce((a, c) => a + c.denom, 0)
  const mainBetAmt  = sum(mainPlacedChips)
  const bankBetAmt  = sum(bankPlacedChips)
  const stdBetAmt   = sum(stdPlacedChips)
  // Черновик ставки соперникам; в керри — с выделенным исходом: не подтвердишь — сервер поставит блайнд туда
  const stage = (payload: { chips: number[] }, target = mainTarget) =>
    socket.emit('stage_chip', isKerriCrowd && target ? { ...payload, target } : payload)

  // ── «для всех» ───────────────────────────────────────────────────────────
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

  // ── толпа керри ──────────────────────────────────────────────────────────
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

  const selectMainZone = (target: MainSide) => {
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

  /** Фишку номинала — в выбранную зону (в керри — в активную: исход или квиток). */
  const place = (denom: ChipValue) => (isKerriCrowd ? kerriPlace(denom) : stdPlace(denom))
  const recall = (id: string) => (isKerriCrowd ? kerriRecall(id) : stdRecall(id))

  /** Отмена: всё выложенное — обратно в стопку (исход и квиток в керри остаются выбранными). */
  const clearDraft = () => {
    if (betConfirmed) return
    stopQuick(false)
    setStdPlacedIds(new Set())
    setMainPlacedIds(new Set())
    setBankPlacedIds(new Set())
    stage({ chips: [] })
  }

  // ── блайнд ───────────────────────────────────────────────────────────────
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

  // ── Подтверждение ────────────────────────────────────────────────────────
  const handleConfirm = () => {
    if (betConfirmed) return
    // быстрая ставка ещё раскладывается — подтверждаем всю выбранную сумму, а не то, что успело долететь
    const pick = stopQuick(true)
    const main = pick && isKerriCrowd ? pick : mainPlacedChips
    const std = pick && !isKerriCrowd ? pick : stdPlacedChips
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

  // свежая версия на каждый рендер — авто-подтверждение по таймеру зовёт актуальную
  handleConfirmRef.current = handleConfirm

  // сколько всего на кону у исхода: подтверждённые ставки соперников + своя
  const sideTotal = (target: MainSide) =>
    gameState.players.reduce((a, p) => a + (p.id !== myId && p.betTarget === target ? p.currentBet : 0), 0)
    + (mainTarget === target ? mainBetAmt : 0)

  /** «Ставлю $N» можно показать */
  const canConfirm = !isGladiator && !betConfirmed && !dealing && (isKerriCrowd
    ? mainTarget !== null && mainBetAmt > 0 && mainBetAmt >= myBlind
    : stdPlacedIds.size > 0 && stdBetAmt >= myBlind)
  /** подпись блайнда — пока ставка до него не дотягивает */
  const showBlind = !isGladiator && !betConfirmed && !dealing && myBlind > 0 &&
    (isKerriCrowd ? !(mainTarget !== null && mainBetAmt >= myBlind) : stdBetAmt < myBlind)
  /** сумма на кнопке «Ставлю» (в керри — основная + банк) */
  const confirmAmount = isKerriCrowd ? mainBetAmt + bankBetAmt : stdBetAmt
  /** что лежит в черновике (для «Отмены») */
  const hasDraft = isKerriCrowd ? mainPlacedIds.size + bankPlacedIds.size > 0 : stdPlacedIds.size > 0

  return {
    gameState, myId, me, isGladiator, isKerriMode, isKerriCrowd,
    myStack, betConfirmed, dealing,
    stdPlacedIds, stdPlacedChips, stdSlots, stdBetAmt,
    mainTarget, bankTarget, activeZone, allPlacedIds,
    mainPlacedChips, bankPlacedChips, mainSlots, bankSlots, mainBetAmt, bankBetAmt,
    myBlind, balance, quickAmounts,
    stdPlace, stdRecall, kerriPlace, kerriRecall, selectMainZone, selectBankZone, place, recall, clearDraft,
    quickBet, handleConfirm, sideTotal,
    canConfirm, showBlind, confirmAmount, hasDraft,
  }
}

export type Betting = ReturnType<typeof useBetting>
