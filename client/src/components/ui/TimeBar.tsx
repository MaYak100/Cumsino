import { useEffect, useRef, useState } from 'react'
import { C, DISPLAY } from '../../theme'

/** Таймер-фитиль: линия во всю ширину тает до нуля, цифры на конце. ≤5с — малиновый. */
export function TimeBar({ seconds, color = C.brass, stopped }: { seconds: number; color?: string; stopped?: boolean }) {
  const [current, setCurrent] = useState(seconds)
  const maxRef = useRef(seconds)

  useEffect(() => {
    if (seconds > maxRef.current) maxRef.current = seconds
    setCurrent(seconds)
    if (stopped) return
    const id = setInterval(() => setCurrent(p => Math.max(0, p - 1)), 1000)
    return () => clearInterval(id)
  }, [seconds, stopped])

  const urgent = current <= 5 && !stopped
  const c = urgent ? C.hot : color
  // ширина «на секунду вперёд»: линейный переход за 1с даёт непрерывное таяние
  const frac = maxRef.current > 0 ? Math.max(0, current - (stopped ? 0 : 1)) / maxRef.current : 0

  return (
    <div className="flex items-center gap-3 px-4 sm:px-7" style={{ height: '1.375rem' }}>
      <div style={{ flex: 1, height: '0.25rem', background: C.line, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${frac * 100}%`, background: c, borderRadius: 4,
          transition: stopped ? 'width .3s ease' : 'width 1s linear, background-color .3s',
          boxShadow: `0 0 10px ${c}`,
          opacity: stopped ? 0.35 : 1,
        }} />
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
