// server/src/game/questions/stepOptions.ts
// Варианты числового вопроса по шагу (эталон — scripts/generate/numeric_lab/options.py): позиция правильного
// ответа по величине случайная среди тех, где все варианты > floor, соседи — через один или два шага (50 / 50).
// Порядок показа перемешивает вызывающий.

function decimals(x: number): number {
  const s = String(x)
  if (s.includes('e')) return 0
  const dot = s.indexOf('.')
  return dot < 0 ? 0 : s.length - dot - 1
}

/**
 * → варианты по возрастанию и индекс правильного среди них. Промежуток между соседними вариантами — один или два шага
 * с равным шансом (решение 2026-10-29: ровный шаг слишком сложен — соседи почти неотличимы). Все варианты строго
 * между floor и ceil; если при выпавших промежутках ответ никуда не встаёт — промежутки по одному шагу.
 */
export function makeStepOptions(answer: number, step: number, rng: () => number = Math.random, n = 4, floor = 0,
  ceil = Infinity): { values: number[]; correct: number } {
  step = Math.abs(step)
  const gaps = Array.from({ length: n - 1 }, () => (rng() < 0.5 ? 1 : 2))
  const fits = (offsets: number[], p: number) =>
    offsets.every(o => answer + (o - offsets[p]) * step > floor && answer + (o - offsets[p]) * step < ceil)
  let offsets = gapOffsets(gaps)
  let valid = offsets.map((_, p) => p).filter(p => fits(offsets, p))
  if (!valid.length) {
    offsets = gapOffsets(gaps.map(() => 1))
    valid = offsets.map((_, p) => p).filter(p => fits(offsets, p))
  }
  if (!valid.length) valid.push(0)
  const p = valid[Math.floor(rng() * valid.length)]
  const digits = Math.max(decimals(step), decimals(answer))
  const k = 10 ** digits
  const values = offsets.map(o => Math.round((answer + (o - offsets[p]) * step) * k) / k)
  return { values, correct: p }
}

/** промежутки в шагах → смещения вариантов от наименьшего: [1, 2, 1] → [0, 1, 3, 4] */
function gapOffsets(gaps: number[]): number[] {
  const out = [0]
  for (const g of gaps) out.push(out[out.length - 1] + g)
  return out
}

/** Число для варианта: «3.2», «850», «0.75» — без хвостов плавающей точки. */
export function formatNumber(v: number): string {
  return String(Number(v.toPrecision(12)))
}
