import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { rng } from './Sticker'

/** Дым Smoke of Deceit — цвета иконки смока (ItemIcon): от почти чёрного фиолетового к лавандовому. */
export const SMOKE = {
  back: '#1a1029',     // нижний лист — почти чёрный
  edge: '#4a3480',     // кромка нижнего листа: отделяет облако от тёмного сукна
  mid: '#2e1d50',
  puff: '#4b2f8c',
  curl: '#9b7ae8',
  light: '#c2a9f7',
} as const

/** Облачный контур вокруг прямоугольника x0..x1 × y0..y1: точки по периметру, соседние соединены дугой наружу —
 *  клубы разного размера. Ширина клуба ~ step (в px), seed — каждый раз один и тот же контур. */
function cloudPath(seed: string, x0: number, y0: number, x1: number, y1: number, step: number): string {
  const r = rng(seed)
  const pts: [number, number][] = []
  // шаг вдоль стороны случайный — клубы разного размера; сверху крупнее (дым поднимается), снизу мельче
  const side = (ax: number, ay: number, bx: number, by: number, k: number) => {
    const len = Math.hypot(bx - ax, by - ay)
    const sizes: number[] = []
    let sum = 0
    while (sum < len) { const v = step * k * (0.6 + r() * 0.9); sizes.push(v); sum += v }
    // растянуть шаги ровно на длину стороны; первая точка — не в самом углу (угол закрывает клуб между сторонами)
    let t = sizes[0] * 0.5 / sum
    for (let i = 0; i < sizes.length; i++) {
      pts.push([ax + (bx - ax) * t, ay + (by - ay) * t])
      t += (sizes[i] + (sizes[i + 1] ?? sizes[0])) * 0.5 / sum
    }
  }
  side(x0, y0, x1, y0, 1.25)
  side(x1, y0, x1, y1, 1)
  side(x1, y1, x0, y1, 0.8)
  side(x0, y1, x0, y0, 1)
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 1; i <= pts.length; i++) {
    const [ax, ay] = pts[i - 1]
    const [bx, by] = pts[i % pts.length]
    const rad = (Math.hypot(bx - ax, by - ay) / 2) * (1.02 + r() * 0.3)
    d += ` A${rad.toFixed(1)} ${rad.toFixed(1)} 0 0 1 ${bx.toFixed(1)} ${by.toFixed(1)}`
  }
  return d + ' Z'
}

/** Завиток дыма (как на иконке смока): виток и хвост в сторону. */
function curlPath(cx: number, cy: number, s: number, flip: boolean): string {
  const f = flip ? -1 : 1
  const X = (dx: number) => (cx + dx * s * f).toFixed(1)
  const Y = (dy: number) => (cy + dy * s).toFixed(1)
  return `M${X(-1.6)} ${Y(0.55)} C${X(-1.1)} ${Y(0.7)} ${X(-0.85)} ${Y(-0.2)} ${X(-0.25)} ${Y(-0.55)}`
    + ` C${X(0.45)} ${Y(-0.95)} ${X(1.05)} ${Y(-0.35)} ${X(0.8)} ${Y(0.2)}`
    + ` C${X(0.55)} ${Y(0.7)} ${X(-0.1)} ${Y(0.55)} ${X(0.05)} ${Y(0.05)}`
}

/** Облако по размеру w×h: бумажные листы дыма. cover — закрывает всё, peek — клубы выглядывают из-за плашки. */
export function SmokeCloud({ w, h, seed, peek }: { w: number; h: number; seed: string; peek?: boolean }) {
  const fid = 'sm' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const b = Math.max(3.5, Math.min(9, h * 0.22))          // размер клуба
  const r = rng(seed + ':layout')
  // нижний лист — по контуру плашки (на пиксель шире), клубы наружу
  const back = cloudPath(seed + ':b', -1, -1, w + 1, h + 1, b * 1.6)
  // средний лист — внутри, сдвинут к низу: верх нижнего листа остаётся тёмной каймой
  const midIn = Math.min(w, h) * 0.22
  const mid = cloudPath(seed + ':m', midIn * 1.6, midIn * 0.9, w - midIn * 1.3, h - midIn * 0.35, b * 2.6)
  // две пряди посветлее — длинные и низкие, у краёв, на разной высоте
  const pw = Math.min(w * 0.34, h * 1.6)
  const ph = h * 0.22
  const pa = w * (0.08 + r() * 0.08), pb = w * (0.58 + r() * 0.08)
  const puffA = cloudPath(seed + ':pa', pa, h * 0.52, pa + pw, h * 0.52 + ph, b * 2.2)
  const puffB = cloudPath(seed + ':pb', pb, h * 0.2, pb + pw * 0.85, h * 0.2 + ph * 0.9, b * 2)
  const cs = Math.max(3, Math.min(8, h * 0.17))
  const curlA = curlPath(w * (0.3 + r() * 0.08), h * 0.42, cs, false)
  const curlB = curlPath(w * (0.74 + r() * 0.06), h * 0.62, cs * 0.8, true)
  const sw = Math.max(1.2, Math.min(2.2, h * 0.05))

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
      <defs>
        {/* лист бумаги отбрасывает тень на лист под ним */}
        <filter id={fid} x="-20%" y="-30%" width="140%" height="170%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="0.6" floodColor="#05020a" floodOpacity="0.75" />
        </filter>
        <linearGradient id={fid + 'g'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {peek ? (
        // своя плашка: клубы позади неё, видны только по краям
        <g className="smoke-drift-a">
          <path d={back} fill={SMOKE.mid} stroke={SMOKE.edge} strokeWidth={1} opacity={0.95} />
        </g>
      ) : (
        <>
          <path d={back} fill={SMOKE.back} stroke={SMOKE.edge} strokeWidth={1.2} strokeLinejoin="round" />
          <g className="smoke-drift-a" filter={`url(#${fid})`}>
            <path d={mid} fill={SMOKE.mid} />
          </g>
          <g className="smoke-drift-b" filter={`url(#${fid})`}>
            <path d={puffA} fill={SMOKE.puff} />
            <path d={puffB} fill={SMOKE.puff} opacity={0.85} />
          </g>
          <g className="smoke-curl" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d={curlA} stroke={SMOKE.light} strokeWidth={sw} opacity={0.9} />
          </g>
          <g className="smoke-curl smoke-curl-late" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d={curlB} stroke={SMOKE.curl} strokeWidth={sw * 0.9} opacity={0.85} />
          </g>
          {/* блик бумаги */}
          <path d={back} fill={`url(#${fid}g)`} />
        </>
      )}
    </svg>
  )
}

/**
 * Игрок в смоке: дым закрывает плашку целиком — по её форме, клубы наружу (ник, баланс, бирки не видны).
 * self — своя плашка видна, клубы выглядывают из-за неё. Размер берёт с содержимого (ResizeObserver).
 */
export function SmokeVeil({ on, seed, self, children, style, className }: {
  on: boolean; seed: string; self?: boolean; children: ReactNode; style?: CSSProperties; className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!on || !el) return
    const measure = () => setBox(b => (b && b.w === el.offsetWidth && b.h === el.offsetHeight
      ? b : { w: el.offsetWidth, h: el.offsetHeight }))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [on])

  const cover = on && !self
  return (
    <span ref={ref} className={className} style={{ position: 'relative', display: 'inline-flex', ...style }}
      {...(cover ? { role: 'img', 'aria-label': 'Игрок в смоке' } : {})}>
      <AnimatePresence>
        {on && self && box && (
          <motion.span key="peek" aria-hidden
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1.12 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
            <SmokeCloud w={box.w} h={box.h} seed={seed} peek />
          </motion.span>
        )}
      </AnimatePresence>
      <span aria-hidden={cover || undefined} style={{
        position: 'relative', zIndex: 1, display: 'inherit', flexDirection: 'inherit', alignItems: 'inherit',
        width: '100%', minWidth: 0,
        opacity: cover ? 0 : 1, transition: `opacity ${cover ? 0.25 : 0.5}s ease ${cover ? 0.1 : 0.15}s`,
      }}>
        {children}
      </span>
      <AnimatePresence>
        {cover && box && (
          <motion.span key="cover" aria-hidden
            // клуб наплывает: из меньшего и прозрачного, чуть перелетая, оседает; уходит — рассеивается
            initial={{ opacity: 0, scale: 0.7, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.15, y: -6, transition: { duration: 0.6, ease: 'easeIn' } }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
              filter: 'drop-shadow(0 3px 0 rgba(0,0,0,.4)) drop-shadow(0 8px 14px rgba(0,0,0,.45))' }}>
            <SmokeCloud w={box.w} h={box.h} seed={seed} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
