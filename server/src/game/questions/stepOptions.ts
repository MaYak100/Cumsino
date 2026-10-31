// server/src/game/questions/stepOptions.ts
// Варианты числового вопроса по шагу (эталон — scripts/generate/numeric_lab/options.py): сначала равновероятно — место
// правильного ответа по величине среди возможных, потом промежутки (два шага — 66%, один — 34%) среди раскладок, при
// которых с этим местом все варианты в (floor, ceil). Порядок показа перемешивает вызывающий.

function decimals(x: number): number {
  const s = String(x)
  if (s.includes('e')) return 0
  const dot = s.indexOf('.')
  return dot < 0 ? 0 : s.length - dot - 1
}

/**
 * Промежуток между соседними вариантами — два шага с шансом DOUBLE_GAP_CHANCE, иначе один (2026-10-29 — 50 / 50: ровный
 * шаг слишком сложен; 2026-10-30 — 66%, общее упрощение).
 */
export const DOUBLE_GAP_CHANCE = 0.66

/** Все раскладки промежутков (1 или 2 шага) для n вариантов с вероятностью каждой: [1, 2, 1] — 0.34 · 0.66 · 0.34. */
function gapLayouts(n: number): { offsets: number[]; weight: number }[] {
  let out = [{ gaps: [] as number[], weight: 1 }]
  for (let i = 0; i < n - 1; i++) {
    out = out.flatMap(l => [
      { gaps: [...l.gaps, 1], weight: l.weight * (1 - DOUBLE_GAP_CHANCE) },
      { gaps: [...l.gaps, 2], weight: l.weight * DOUBLE_GAP_CHANCE },
    ])
  }
  return out.map(l => ({ offsets: gapOffsets(l.gaps), weight: l.weight }))
}

/**
 * → варианты по возрастанию и индекс правильного среди них. Место ответа равновероятно среди тех, для которых есть хоть
 * одна раскладка в (floor, ceil): при ответе ≤ 3 шагов от floor (или ceil) крайнее место невозможно — оно исключается,
 * остальные равновероятны (сборка банка такие вопросы не пропускает, раздел 4 docs/questions/README.md). Раскладка —
 * по весам 66 / 34 среди тех, что с выбранным местом умещаются. Не умещается ничего (окно уже трёх шагов) — ответ
 * наименьший, промежутки по одному шагу, как раньше.
 */
export function makeStepOptions(answer: number, step: number, rng: () => number = Math.random, n = 4, floor = 0,
  ceil = Infinity): { values: number[]; correct: number } {
  step = Math.abs(step)
  const k = 10 ** Math.max(decimals(step), decimals(answer))
  // значение варианта в d шагах от ответа, округлённое до точности шага и ответа (без хвостов плавающей точки:
  // 0.7 − 7 · 0.1 — ровно 0, а не −1e-16)
  const at = (d: number) => Math.round((answer + d * step) * k) / k
  const fits = (offsets: number[], p: number) =>
    offsets.every(o => at(o - offsets[p]) > floor && at(o - offsets[p]) < ceil)
  const layouts = gapLayouts(n)
  const ranks = Array.from({ length: n }, (_, p) => p).filter(p => layouts.some(l => fits(l.offsets, p)))
  if (!ranks.length) {
    const offsets = Array.from({ length: n }, (_, i) => i)
    return { values: offsets.map(at), correct: 0 }
  }
  const p = ranks[Math.floor(rng() * ranks.length)]
  const ok = layouts.filter(l => fits(l.offsets, p))
  let r = rng() * ok.reduce((s, l) => s + l.weight, 0)
  const { offsets } = ok.find(l => (r -= l.weight) < 0) ?? ok[ok.length - 1]
  return { values: offsets.map(o => at(o - offsets[p])), correct: p }
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
