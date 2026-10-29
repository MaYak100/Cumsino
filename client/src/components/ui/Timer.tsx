import { useEffect, useRef, useState } from 'react'
import { C, DISPLAY } from '../../theme'

interface TimerProps {
  seconds: number
  color?: string
  size?: number
}

/** Кольцо-таймер (на столе). ≤5с — малиновый, без пульсации. */
export function Timer({ seconds, color = C.brass, size = 56 }: TimerProps) {
  const [current, setCurrent] = useState(seconds)
  const maxRef = useRef(seconds)

  useEffect(() => {
    if (seconds > maxRef.current) maxRef.current = seconds
    setCurrent(seconds)
    const id = setInterval(() => setCurrent(p => Math.max(0, p - 1)), 1000)
    return () => clearInterval(id)
  }, [seconds])

  const c = current <= 5 ? C.hot : color
  const half = size / 2
  const r = half - 4
  const circ = 2 * Math.PI * r
  const dash = circ * (maxRef.current > 0 ? current / maxRef.current : 0)

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={half} cy={half} r={r} fill={C.bg} fillOpacity={0.55} stroke={C.line} strokeWidth={4} />
      <circle
        cx={half} cy={half} r={r}
        fill="none" stroke={c} strokeWidth={4}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${half} ${half})`}
        style={{ transition: 'stroke-dasharray 1s linear, stroke .3s' }}
      />
      <text x={half} y={half + 1} dominantBaseline="middle" textAnchor="middle" fill={c}
        fontSize={size * 0.3} fontFamily={DISPLAY}>
        {current}
      </text>
    </svg>
  )
}
