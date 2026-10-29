import { useEffect, useState, type ReactNode } from 'react'

/** ГПСЧ от числа — у каждого кадра своё пламя, но один кадр рисуется одинаково при перерисовке. */
function rng(seed: number) {
  let h = seed * 2654435761 >>> 0
  return () => {
    h = (h + 0x6d2b79f5) >>> 0
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Высота края суперэллипса над центром для x ∈ [0, 1] (доля полувысоты): 1 в середине, 0 у самого бока. */
function seHalf(x: number, e: number) {
  return Math.max(0, 1 - Math.abs(2 * x - 1) ** e) ** (1 / e)
}

/** Контур бумажного пламени: основа — суперэллипс (скруглённый прямоугольник: мягкие углы и сверху, и снизу), по
 *  верху — языки, равномерно по ширине, выше в центре и сходят на нет к бокам; низ — лёгкая рвань.
 *  top — высота языков в px: основа начинается ниже на top, языки дорастают до верхнего края. */
function flameClip(seed: number, top: number, tongues: number): string {
  const r = rng(seed)
  const E = 5
  // y в долях основы → css: основа занимает высоту контейнера минус зону языков сверху
  const pt = (x: number, y: number, up: number) =>
    `${(x * 100).toFixed(2)}% calc(${top.toFixed(1)}px + ${(y * 100).toFixed(2)}% - ${(y * top).toFixed(1)}px - ${up.toFixed(1)}px)`
  const pts: string[] = []
  // левый бок снизу вверх (скругление), затем верх слева направо — впадина / язык по очереди
  pts.push(pt(0, 0.5, 0))
  const K = tongues * 2
  for (let k = 0; k <= K; k++) {
    const x = 0.02 + (k / K) * 0.96
    const y = 0.5 - 0.5 * seHalf(x, E)
    const center = 1 - Math.abs(2 * x - 1) ** 1.8          // 1 в центре, 0 у боков
    const tip = k % 2 === 1
    const up = tip ? top * (0.3 + 0.7 * center) * (0.75 + 0.25 * r()) : top * 0.1 * center * r()
    pts.push(pt(x, y, up))
  }
  pts.push(pt(1, 0.5, 0))
  // низ справа налево — мелкая рвань наружу
  const B = 16
  for (let k = 1; k < B; k++) {
    const x = 1 - k / B
    pts.push(pt(x, 0.5 + 0.5 * seHalf(x, E), -r() * 2.2))
  }
  return `polygon(${pts.join(', ')})`
}

/** Огонь как у бумажной аппликации: слои снаружи внутрь. */
const LAYERS = [
  { color: '#d8402b', k: 1 },
  { color: '#ff8a2a', k: 0.68 },
  { color: '#ffd23f', k: 0.38 },
]
/** серия 5+ — синее пламя: горячее обычного */
const BLUE = [
  { color: '#2a54d6', k: 1 },
  { color: '#3fa3ff', k: 0.68 },
  { color: '#c9f1ff', k: 0.38 },
]

/** Рамка-пламя вокруг плашки за серию верных ответов: 2 — тлеет, 3 и больше — горит, чем дальше, тем выше; 5+ — синее.
 *  Бумажная: пламя «перерезается» раз в секунду, как покадровая анимация. Меньше 2 — просто содержимое. */
export function StreakFlame({ streak, children }: { streak?: number; children: ReactNode; radius?: number }) {
  const n = streak ?? 0
  const [tick, setTick] = useState(() => Math.floor(Math.random() * 1000))
  const on = n >= 2
  useEffect(() => {
    if (!on) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [on])

  if (!on) return <>{children}</>

  const hot = n >= 3
  const top = n === 2 ? 10 : Math.min(36, 18 + (n - 3) * 6)   // высота языков в центре
  // контур скруглён — чтобы углы плашки не торчали, рамка шире плашки по бокам и снизу на пару пикселей больше
  const sidePad = hot ? 8 : 7
  const base = hot ? 8 : 6
  const layers = n >= 5 ? BLUE : hot ? LAYERS : LAYERS.slice(1)
  const tongues = hot ? 9 : 7

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <span aria-hidden style={{
        position: 'absolute', zIndex: 0, pointerEvents: 'none',
        left: -sidePad, right: -sidePad, top: -base - top, bottom: -base,
        filter: 'drop-shadow(0 2px 0 rgba(0,0,0,.35))',
      }}>
        {layers.map((l, i) => (
          <span key={i} style={{
            position: 'absolute',
            // внутренние слои — с отступом от краёв: снаружи видно красный, ближе к плашке — оранжевый и жёлтый
            top: top * (1 - l.k), left: i * 1.6, right: i * 1.6, bottom: i * 2,
            clipPath: flameClip(tick * 7 + i * 131 + n, top * l.k, tongues),
            background: l.color,
          }} />
        ))}
      </span>
      <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex' }}>{children}</span>
    </span>
  )
}
