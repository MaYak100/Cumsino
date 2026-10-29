import { useRef } from 'react'
import type { PhysicalChip } from '../types/chips'

/** Постоянные места фишек в кучке: фишка получает место спирали при выкладке и держит его, пока лежит.
 *  Убрал фишку — остальные не съезжают по спирали, её место займёт следующая выложенная (наименьшее свободное). */
export function useStableSlots(chips: PhysicalChip[]): Map<string, number> {
  const ref = useRef(new Map<string, number>())
  const prev = ref.current
  const next = new Map<string, number>()
  for (const c of chips) if (prev.has(c.id)) next.set(c.id, prev.get(c.id)!)
  const taken = new Set(next.values())
  let free = 0
  for (const c of chips) {
    if (next.has(c.id)) continue
    while (taken.has(free)) free++
    next.set(c.id, free)
    taken.add(free)
  }
  ref.current = next
  return next
}
