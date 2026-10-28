// server/src/game/questions/smooth.ts
// Сглаженный взвешенный выбор: доли за длинную дистанцию — ровно по весам, но серии и провалы реже, чем у
// чистого рандома. У каждого варианта есть кредит: при каждом выборе все кандидаты получают w/W, выбранный
// отдаёт 1 (сумма кредитов не растёт, отставание от своей доли = кредит). Вероятность ∝ w · e^(λ·кредит):
// отставший вытягивается чаще, перебравший — реже. λ = 0 — чистый рандом, большие λ — почти round-robin.
// Кредиты живут между играми (history), так что доли точные не только внутри одной игры.

export const SMOOTH_LAMBDA = 1.5
const CREDIT_LIMIT = 3   // после смены весов старый перекос не тянется вечно

export interface Weighted { key: string; weight: number }

/** Порядок попыток: первый — выбор, следующие — запасные, если у выбранного не собрался вопрос. */
export function smoothOrder(items: Weighted[], credits: Map<string, number>, rng: () => number,
  lambda = SMOOTH_LAMBDA): string[] {
  const rest = items.filter(i => i.weight > 0)
  const out: string[] = []
  while (rest.length) {
    const p = rest.map(i => i.weight * Math.exp(lambda * (credits.get(i.key) ?? 0)))
    const total = p.reduce((s, x) => s + x, 0)
    let r = rng() * total
    let k = p.findIndex(x => (r -= x) <= 0)
    if (k < 0) k = rest.length - 1
    out.push(rest[k].key)
    rest.splice(k, 1)
  }
  return out
}

/** Учесть выбор: кандидаты (те, из кого выбирали) получают свою долю, выбранный отдаёт единицу. */
export function commitChoice(items: Weighted[], chosen: string, credits: Map<string, number>): void {
  const live = items.filter(i => i.weight > 0)
  const total = live.reduce((s, i) => s + i.weight, 0)
  if (total <= 0) return
  for (const i of live) {
    let c = (credits.get(i.key) ?? 0) + i.weight / total - (i.key === chosen ? 1 : 0)
    c = Math.max(-CREDIT_LIMIT, Math.min(CREDIT_LIMIT, c))
    credits.set(i.key, c)
  }
}
