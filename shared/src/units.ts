// shared/src/units.ts
// Число с единицей для показа игроку: варианты числового вопроса, ответ «ближе всех».
// «%» и «×» — слитно («175%», «1.5×»), остальное через пробел («12 сек.», «2250 золота»).

const GLUED = new Set(['%', '×'])

/** 'x' в банке — тот же множитель, что и '×' */
function normalize(unit: string): string {
  return unit === 'x' ? '×' : unit
}

export function withUnit(value: string | number, unit?: string | null): string {
  const u = unit ? normalize(unit.trim()) : ''
  if (!u) return String(value)
  return GLUED.has(u) ? `${value}${u}` : `${value} ${u}`
}
