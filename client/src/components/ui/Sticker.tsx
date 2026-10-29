import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { C } from '../../theme'

/** Детерминированный ГПСЧ от строки — у стикера одна и та же «вырезка» при каждом рендере. */
function rng(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Рваный контур: точки по периметру прямоугольника, утопленные внутрь на 0…jag px. */
export function roughClip(seed: string, jag = 5, perSide = 7): string {
  const r = rng(seed)
  const j = () => (r() * jag).toFixed(1)
  const pts: string[] = []
  for (let i = 0; i < perSide; i++) pts.push(`${((i / perSide) * 100).toFixed(1)}% ${j()}px`)
  for (let i = 0; i < 3; i++) pts.push(`calc(100% - ${j()}px) ${((i / 3) * 100).toFixed(1)}%`)
  for (let i = perSide; i > 0; i--) pts.push(`${((i / perSide) * 100).toFixed(1)}% calc(100% - ${j()}px)`)
  for (let i = 3; i > 0; i--) pts.push(`${j()}px ${((i / 3) * 100).toFixed(1)}%`)
  return `polygon(${pts.join(', ')})`
}

interface StickerProps {
  children: ReactNode
  seed: string
  color?: string
  textColor?: string
  rotate?: number
  /** «шлепок»: влетает крупно и с перекосом, оседает пружиной */
  slam?: boolean
  delay?: number
  jag?: number
  padding?: string
  className?: string
  style?: CSSProperties
}

/** Наклейка с неровной вырезкой, тенью и бликом. Тень — на обёртке (clip-path режет box-shadow). */
export function Sticker({
  children, seed, color = C.paper, textColor = C.ink, rotate = -2, slam, delay = 0,
  jag = 5, padding = '10px 18px', className, style,
}: StickerProps) {
  return (
    <motion.div
      className={className}
      initial={slam ? { scale: 2.1, opacity: 0, rotate: rotate - 9 } : false}
      animate={{ scale: 1, opacity: 1, rotate }}
      transition={slam
        ? { delay, type: 'spring', stiffness: 520, damping: 19, mass: 0.9, opacity: { delay, duration: 0.08 } }
        : { duration: 0 }}
      style={{
        display: 'inline-block',
        filter: 'drop-shadow(0 3px 0 rgba(0,0,0,.35)) drop-shadow(0 12px 18px rgba(0,0,0,.45))',
        ...style,
      }}
    >
      <div style={{
        clipPath: roughClip(seed, jag),
        background: `linear-gradient(115deg, rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 38%), ${color}`,
        color: textColor,
        padding,
      }}>
        {children}
      </div>
    </motion.div>
  )
}
