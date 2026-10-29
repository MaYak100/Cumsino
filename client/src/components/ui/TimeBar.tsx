import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { LIGHTNING_MS } from '@cumsino/shared'
import { C, DISPLAY } from '../../theme'

/** Светлее на долю k (смешать с белым) — для «молнии». */
function lighten(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16)
  const ch = (sh: number) => Math.round(((n >> sh) & 255) + (255 - ((n >> sh) & 255)) * k)
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`
}

/** Таймер-фитиль: линия во всю ширину тает до нуля, цифры на конце. ≤5с — малиновый.
 *  total — полная длина отсчёта (45 с вопроса, 12 с хекса): от неё ширина, поэтому ход линейный, даже если экран
 *  открыли посреди отсчёта. lightning — первые секунды дают «Молнию»: значок у границы окна, пока окно идёт — линия
 *  ярче. redAfterLightning — сразу после окна молнии линия красная (хекс: время почти кончилось). */
export function TimeBar({ seconds, total, color = C.brass, stopped, lightning, redAfterLightning }: {
  seconds: number; total?: number; color?: string; stopped?: boolean; lightning?: boolean; redAfterLightning?: boolean
}) {
  const [current, setCurrent] = useState(seconds)
  const maxRef = useRef(total ?? seconds)

  useEffect(() => {
    if (seconds > maxRef.current) maxRef.current = seconds
    setCurrent(seconds)
    if (stopped) return
    const id = setInterval(() => setCurrent(p => Math.max(0, p - 1)), 1000)
    return () => clearInterval(id)
  }, [seconds, stopped])

  const max = maxRef.current
  const win = LIGHTNING_MS / 1000
  const showBolt = !!lightning && max > win
  const boltOn = showBolt && !stopped && current > max - win   // окно молнии ещё идёт
  const urgent = !stopped && (current <= 5 || (!!redAfterLightning && showBolt && !boltOn))
  const c = boltOn ? lighten(color, 0.45) : urgent ? C.hot : color
  // ширина «на секунду вперёд»: линейный переход за 1с даёт непрерывное таяние
  const frac = max > 0 ? Math.max(0, current - (stopped ? 0 : 1)) / max : 0
  const boltAt = max > 0 ? ((max - win) / max) * 100 : 0

  return (
    <div className="flex items-center gap-3 px-4 sm:px-7" style={{ height: '1.375rem' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <div style={{ height: boltOn ? '0.35rem' : '0.25rem', background: C.line, borderRadius: 4, overflow: 'hidden', transition: 'height .3s' }}>
          <div style={{
            height: '100%', width: `${frac * 100}%`, background: c, borderRadius: 4,
            transition: stopped ? 'width .3s ease' : 'width 1s linear, background-color .3s',
            boxShadow: boltOn ? `0 0 16px ${c}, 0 0 4px #fff` : `0 0 10px ${c}`,
            opacity: stopped ? 0.35 : 1,
          }} />
        </div>
        {showBolt && (
          // граница окна молнии: успел ответить верно правее неё — бонус
          <motion.svg
            width={18} height={22} viewBox="0 0 18 22"
            style={{ position: 'absolute', left: `${boltAt}%`, top: '50%', marginLeft: -9, marginTop: -11 }}
            animate={boltOn ? { scale: [1, 1.25, 1], opacity: 1 } : { scale: 1, opacity: 0.3 }}
            transition={boltOn ? { repeat: Infinity, duration: 0.9 } : { duration: 0.3 }}
          >
            <path d="M10.5 1 L2.5 12.5 H8.2 L6.8 21 L15.5 8.6 H9.6 Z"
              fill={boltOn ? '#fff4b8' : C.muted} stroke={C.ink} strokeWidth={1.6} strokeLinejoin="round" />
          </motion.svg>
        )}
      </div>
      <span className="tnum" style={{
        fontFamily: DISPLAY, fontSize: '0.9375rem', minWidth: '1.5rem', textAlign: 'right',
        color: stopped ? C.muted : c,
      }}>
        {current}
      </span>
    </div>
  )
}
