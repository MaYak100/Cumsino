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

/** Контур бумажного пламени вокруг прямоугольника: языки вверху (и по бокам, если side > 0), низ почти ровный.
 *  top — высота языков в px (рамка выше плашки на эту величину), side — высота боковых языков. */
function flameClip(seed: number, top: number, side: number, tongues: number): string {
  const r = rng(seed)
  const pts: string[] = []
  // верх: слева направо, чередуя впадину и язык
  for (let i = 0; i <= tongues * 2; i++) {
    const x = (i / (tongues * 2)) * 100
    const tip = i % 2 === 1
    const y = tip ? r() * top * 0.45 : top * (0.75 + r() * 0.25)
    pts.push(`${x.toFixed(1)}% ${y.toFixed(1)}px`)
  }
  // правый бок: вниз, языки наружу
  for (let i = 1; i <= 4; i++) {
    const y = top + ((i / 5) * 100)
    pts.push(`calc(100% - ${(i % 2 ? r() * side * 0.4 : side * (0.7 + r() * 0.3)).toFixed(1)}px) calc(${((i / 5) * 100).toFixed(1)}% + ${(top * (1 - i / 5)).toFixed(1)}px)`)
    void y
  }
  // низ: справа налево, мелкая рвань
  for (let i = 6; i >= 0; i--) pts.push(`${((i / 6) * 100).toFixed(1)}% calc(100% - ${(r() * 3).toFixed(1)}px)`)
  // левый бок: вверх
  for (let i = 4; i >= 1; i--) {
    pts.push(`${(i % 2 ? r() * side * 0.4 : side * (0.7 + r() * 0.3)).toFixed(1)}px calc(${((i / 5) * 100).toFixed(1)}% + ${(top * (1 - i / 5)).toFixed(1)}px)`)
  }
  return `polygon(${pts.join(', ')})`
}

/** Огонь как у бумажной аппликации: слои снаружи внутрь. */
const LAYERS = [
  { color: '#d8402b', k: 1 },
  { color: '#ff8a2a', k: 0.68 },
  { color: '#ffd23f', k: 0.38 },
]

/** Рамка-пламя вокруг плашки за серию верных ответов: 2 — тлеет, 3 и больше — горит, чем дальше, тем выше.
 *  Бумажная: пламя «перерезается» раз в секунду, как покадровая анимация. Меньше 2 — просто содержимое. */
export function StreakFlame({ streak, children, radius = 12 }: { streak?: number; children: ReactNode; radius?: number }) {
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
  const top = n === 2 ? 9 : Math.min(34, 16 + (n - 3) * 6)   // высота языков сверху
  const side = hot ? Math.min(14, 6 + (n - 3) * 2) : 3
  const pad = hot ? 5 : 3
  const layers = hot ? LAYERS : LAYERS.slice(1)
  const tongues = hot ? 9 : 7

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <span aria-hidden style={{
        position: 'absolute', zIndex: 0, pointerEvents: 'none',
        left: -pad - side, right: -pad - side, top: -pad - top, bottom: -pad,
        filter: 'drop-shadow(0 2px 0 rgba(0,0,0,.35))',
      }}>
        {layers.map((l, i) => (
          <span key={i} style={{
            position: 'absolute', inset: 0,
            // внутренние слои ниже и уже — пламя «слоями бумаги»
            transform: `scale(${1 - i * 0.03}, 1)`, transformOrigin: 'bottom center',
            clipPath: flameClip(tick * 7 + i * 131 + n, top * l.k + (top * (1 - l.k)), side * l.k, tongues),
            background: l.color,
            borderRadius: radius,
            top: top * (1 - l.k),
          }} />
        ))}
      </span>
      <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex' }}>{children}</span>
    </span>
  )
}
