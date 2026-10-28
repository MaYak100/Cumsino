// server/src/game/questions/stepOptions.ts
// Варианты числового вопроса по шагу (эталон — scripts/generate/numeric_lab/options.py): позиция правильного
// ответа по величине случайная среди тех, где все варианты > floor, остальные — ровно через шаг.
// Порядок показа перемешивает вызывающий.

function decimals(x: number): number {
  const s = String(x)
  if (s.includes('e')) return 0
  const dot = s.indexOf('.')
  return dot < 0 ? 0 : s.length - dot - 1
}

/** → варианты по возрастанию и индекс правильного среди них. */
export function makeStepOptions(answer: number, step: number, rng: () => number = Math.random, n = 4, floor = 0):
  { values: number[]; correct: number } {
  step = Math.abs(step)
  const valid: number[] = []
  for (let p = 0; p < n; p++) if (answer - p * step > floor) valid.push(p)
  if (!valid.length) valid.push(0)
  const p = valid[Math.floor(rng() * valid.length)]
  const digits = Math.max(decimals(step), decimals(answer))
  const k = 10 ** digits
  const values = Array.from({ length: n }, (_, i) => Math.round((answer + (i - p) * step) * k) / k)
  return { values, correct: p }
}

/** Число для варианта: «3.2», «850», «0.75» — без хвостов плавающей точки. */
export function formatNumber(v: number): string {
  return String(Number(v.toPrecision(12)))
}
