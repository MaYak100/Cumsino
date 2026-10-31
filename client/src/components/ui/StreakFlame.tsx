import { createContext, useContext, useId, useMemo, type CSSProperties, type ReactNode } from 'react'
import { rng } from './Sticker'

/**
 * Огонь серии — три варианта (сравнить в /mocks: ?s=showcase-flame, или ?flame=a|b|c в любом сценарии):
 *  a — «языки»: отдельные языки из трёх листов бумаги, каждый качается от основания в своей фазе;
 *  b — «венец»: сплошной венец языков на лист, листы дышат и клонятся вразнобой;
 *  c — «угли»: низкий венец и обрезки бумаги-искры, поднимаются и гаснут.
 * В игре — FLAME_DEFAULT.
 */
export type FlameStyle = 'a' | 'b' | 'c'
export const FLAME_DEFAULT: FlameStyle = 'b'
export const FlameStyleContext = createContext<FlameStyle>(FLAME_DEFAULT)

/** Слои снаружи внутрь: красный — оранжевый — жёлтый. */
const LAYERS = ['#d8402b', '#ff8a2a', '#ffd23f']
/** серия 5+ — синее пламя: горячее обычного */
const BLUE = ['#2a54d6', '#3fa3ff', '#c9f1ff']
/** доля высоты / ширины языка у каждого слоя (снаружи внутрь) */
const KH = [1, 0.72, 0.46]
const KW = [1, 0.72, 0.46]
/** шаг рамки: насколько каждый следующий лист меньше предыдущего */
const STEP = 1.4

/** Языки пламени (viewBox 0 0 20 40): острый кончик с изгибом и пузатое основание; второй — с боковым язычком. */
const TONGUES = [
  'M12.5 0 C11.5 7 18.5 13 19.2 23 C19.8 32 15.5 40 10 40 C4.5 40 0.2 33 0.9 25 C1.6 17 9.5 12.5 12.5 0 Z',
  'M11 0 C10.5 6 14.5 10.5 16 15 C17.2 13.5 17.6 11.5 17.2 9 C20.2 14 20.4 21 19.6 27 C18.7 34.5 15 40 10 40 C4.5 40 0.4 34 0.8 26.5 C1.2 18 8.5 11 11 0 Z',
]

interface Geo { n: number; top: number; side: number; base: number; colors: string[]; seed: string; radius: number }

/** Лист рамки вокруг плашки (li — номер слоя): листы с отступом — снаружи красный, ближе к плашке оранжевый и жёлтый. */
function RimSheet({ g, li }: { g: Geo; li: number }) {
  const i = li + (g.colors.length === 3 ? 0 : 1)
  return (
    <span style={{
      position: 'absolute', top: g.top + i * STEP, left: i * STEP, right: i * STEP,
      bottom: i * STEP, background: g.colors[li], borderRadius: g.radius + g.side - i * STEP,
    }} />
  )
}

interface TongueSpec { x: number; w: number; h: number; flip: boolean; shape: number; vars: CSSProperties }

/** a — языки: где стоят, какой высоты и в каком ритме качаются (общие для всех листов языка).
 *  Крупные языки через равные промежутки, между ними и по краям — мелкие (рисуются первыми, позади). */
function tongueSpecs(g: Geo): TongueSpec[] {
  const r = rng(g.seed)
  const hot = g.n >= 3
  const B = hot ? 4 : 3
  const calm = hot ? 1 : 0.6      // тлеет — качается тише
  const spec = (x: number, big: boolean): TongueSpec => {
    const center = 1 - Math.abs(2 * x - 1) ** 1.8
    // 9 px основания — за плашкой; видимая часть языка — от высоты серии
    const h = 9 + g.top * (big ? 0.7 + 0.3 * center : 0.34 + 0.18 * center) * (0.86 + r() * 0.16)
    const w = Math.max(10, Math.min(30, h * (big ? 0.72 : 0.8)))
    const lean = (x - 0.5) * 22                  // крайние клонятся наружу
    const amp = (big ? 2 + r() * 2 : 3 + r() * 3) * calm
    const vars = {
      '--fr0': `${(lean - amp).toFixed(1)}deg`, '--fr1': `${(lean + amp).toFixed(1)}deg`,
      '--fs0': (0.9 - 0.05 * calm).toFixed(2), '--fs1': (1 + 0.05 * calm).toFixed(2),
      '--fd': `${((2.2 + r() * 1.6) / calm).toFixed(2)}s`, '--fdl': `${(-r() * 4).toFixed(2)}s`,
      '--fd2': `${((1.2 + r() * 0.8) / Math.sqrt(calm)).toFixed(2)}s`, '--fdl2': `${(-r() * 2).toFixed(2)}s`,
    } as CSSProperties
    return { x, w, h, flip: x < 0.5 ? r() < 0.25 : r() < 0.75, shape: r() < 0.5 ? 1 : 0, vars }
  }
  const bigX = Array.from({ length: B }, (_, i) => 0.2 + (i / (B - 1)) * 0.6 + (r() - 0.5) * 0.06)
  const small = [0.05, ...bigX.slice(1).map((x, i) => (x + bigX[i]) / 2 + (r() - 0.5) * 0.04), 0.95].map(x => spec(x, false))
  return [...small, ...bigX.map(x => spec(x, true))]
}

/** Языки одного листа: у листа свой цвет, движение — общее с остальными листами языка (те же переменные и фазы). */
function TongueSheet({ g, li, specs }: { g: Geo; li: number; specs: TongueSpec[] }) {
  const i = li + (g.colors.length === 3 ? 0 : 1)
  const zone = g.top + 9          // основание языков прячется за плашкой
  return (
    <>
      {specs.map((t, k) => (
        <span key={k} className="flame-tongue" style={{
          position: 'absolute', left: `calc(${(t.x * 100).toFixed(1)}% - ${t.w / 2}px)`, top: zone - t.h,
          width: t.w, height: t.h, ...t.vars,
        }}>
          <svg viewBox="0 0 20 40" preserveAspectRatio="none" aria-hidden style={{
            position: 'absolute', bottom: 0, left: '50%', width: t.w * KW[i], height: t.h * KH[i],
            transform: `translateX(-50%)${t.flip ? ' scaleX(-1)' : ''}`, overflow: 'visible',
          }}>
            <path d={TONGUES[t.shape]} fill={g.colors[li]} />
          </svg>
        </span>
      ))}
    </>
  )
}

/** Контур венца (viewBox 0 0 100 zone): языки с пузатым боком и острым кончиком; к краям венец сходит на нет —
 *  углы рамки скруглены, прямоугольник не торчит. */
function crownPath(seed: string, zone: number, T: number, k: number): string {
  const r = rng(seed)
  const L = 4, R = 96
  let px = L, py = zone
  let d = `M${L} ${zone}`
  const f = (v: number) => v.toFixed(1)
  for (let i = 0; i < T; i++) {
    const vx = L + ((i + 1) / T) * (R - L)
    const x = px + (vx - px) * (0.45 + (r() - 0.5) * 0.2)
    const center = 1 - Math.abs((x - 50) / 50) ** 1.8
    // 9 px основания — за плашкой: высоты языков считаются от видимой части
    const vis = zone - 9
    const tipY = zone - 9 - vis * k * (0.4 + 0.6 * center) * (0.82 + r() * 0.2)
    const vy = i === T - 1 ? zone : zone - 9 - vis * k * (0.08 + r() * 0.1) * center
    const dx = x - px, dx2 = vx - x
    // подъём: пузо наружу, потом кончик; спуск — круче, к впадине
    d += ` C${f(px + dx * 0.85)} ${f(py)} ${f(x - dx * 0.3)} ${f(tipY + (py - tipY) * 0.35)} ${f(x)} ${f(tipY)}`
    d += ` C${f(x + dx2 * 0.2)} ${f(tipY + (vy - tipY) * 0.45)} ${f(vx - dx2 * 0.6)} ${f(vy)} ${f(vx)} ${f(vy)}`
    px = vx; py = vy
  }
  return d + ' Z'
}

/** b — венец (и низкий венец у c): лист венца на цвет, листы дышат и клонятся каждый в своём ритме. */
function CrownSheet({ g, li, low }: { g: Geo; li: number; low?: boolean }) {
  const i = li + (g.colors.length === 3 ? 0 : 1)
  const r = rng(`${g.seed}:c${li}`)
  const hot = g.n >= 3
  const zone = low ? g.top * 0.45 + 9 : g.top + 9
  const T = hot ? 6 : 5
  const calm = low ? 0.5 : hot ? 1 : 0.6
  const vars = {
    '--fk0': `${(-2.5 * calm - r()).toFixed(1)}deg`, '--fk1': `${(2.5 * calm + r()).toFixed(1)}deg`,
    '--fs0': (1 - 0.1 * calm).toFixed(2), '--fs1': (1 + 0.04 * calm).toFixed(2),
    '--fd': `${((1.9 + li * 0.55 + r() * 0.5) / Math.sqrt(calm)).toFixed(2)}s`, '--fdl': `${(-r() * 2).toFixed(2)}s`,
  } as CSSProperties
  return (
    <svg className="flame-crown" viewBox={`0 0 100 ${zone}`} preserveAspectRatio="none" aria-hidden style={{
      position: 'absolute', left: i * STEP, top: g.top + 9 - zone,
      width: `calc(100% - ${i * STEP * 2}px)`, height: zone, overflow: 'visible', ...vars,
    }}>
      <path d={crownPath(`${g.seed}:${li}`, zone, T, KH[i])} fill={g.colors[li]} />
    </svg>
  )
}

/** c — искры: обрезки бумаги поднимаются от венца, кружатся и гаснут. */
function Embers({ g }: { g: Geo }) {
  const r = rng(g.seed + ':e')
  const count = g.n === 2 ? 3 : g.n < 5 ? 5 : 7
  const rise = g.top + 14
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const x = 0.12 + (i / Math.max(1, count - 1)) * 0.76 + (r() - 0.5) * 0.08
        const s = 3.5 + r() * 3
        const c = g.colors[Math.min(g.colors.length - 1, 1 + Math.floor(r() * 2))]
        const vars = {
          '--fx': `${((r() - 0.5) * 14).toFixed(1)}px`, '--fy': `${(-rise * (0.75 + r() * 0.5)).toFixed(1)}px`,
          '--frt': `${((r() - 0.5) * 300).toFixed(0)}deg`,
          '--fd': `${(2.2 + r() * 1.4).toFixed(2)}s`, '--fdl': `${(-r() * 3.6).toFixed(2)}s`,
        } as CSSProperties
        return (
          <span key={i} className="flame-ember" style={{
            position: 'absolute', left: `${(x * 100).toFixed(1)}%`, top: g.top + 2, width: s, height: s * 1.3,
            background: c, clipPath: i % 2 ? 'polygon(50% 0, 100% 60%, 40% 100%, 0 45%)' : 'polygon(0 10%, 100% 0, 60% 100%)',
            ...vars,
          }} />
        )
      })}
    </>
  )
}

/** Рамка-пламя вокруг плашки за серию верных ответов: 2 — тлеет, 3 и больше — горит, чем дальше, тем выше; 5+ — синее.
 *  Огонь позади содержимого — ник и баланс не перекрывает. Меньше 2 — просто содержимое. */
export function StreakFlame({ streak, children, radius = 12, variant }: {
  streak?: number; children: ReactNode; radius?: number; variant?: FlameStyle
}) {
  const ctx = useContext(FlameStyleContext)
  const style = variant ?? ctx
  const seed = useId()
  const n = streak ?? 0
  const on = n >= 2
  const g = useMemo<Geo | null>(() => {
    if (!on) return null
    const hot = n >= 3
    return {
      n, seed, radius,
      top: n === 2 ? 10 : Math.min(36, 18 + (n - 3) * 6),   // высота языков в центре
      side: hot ? 6 : 5,
      base: hot ? 6 : 5,
      colors: n >= 5 ? BLUE : hot ? LAYERS : LAYERS.slice(1),
    }
  }, [on, n, seed, radius])

  const specs = useMemo(() => (g && style === 'a' ? tongueSpecs(g) : null), [g, style])

  if (!g) return <>{children}</>

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <span aria-hidden style={{
        position: 'absolute', zIndex: 0, pointerEvents: 'none',
        left: -g.side, right: -g.side, top: -g.base - g.top, bottom: -g.base,
        filter: 'drop-shadow(0 2px 0 rgba(0,0,0,.35))',
      }}>
        {style === 'c' && <Embers g={g} />}
        {/* лист за листом: рамка и языки одного цвета — один лист бумаги, следующий цвет ложится сверху */}
        {g.colors.map((_, li) => (
          <span key={li}>
            {style === 'a' && specs && <TongueSheet g={g} li={li} specs={specs} />}
            {style !== 'a' && <CrownSheet g={g} li={li} low={style === 'c'} />}
            <RimSheet g={g} li={li} />
          </span>
        ))}
      </span>
      <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex' }}>{children}</span>
    </span>
  )
}
