import { useEffect, useRef, useState } from 'react'

interface TimerProps {
  seconds: number
}

export function Timer({ seconds }: TimerProps) {
  const [current, setCurrent] = useState(seconds)
  const maxRef = useRef(seconds)

  useEffect(() => {
    if (seconds > current) maxRef.current = seconds
    setCurrent(seconds)
    const id = setInterval(() => setCurrent(p => Math.max(0, p - 1)), 1000)
    return () => clearInterval(id)
  }, [seconds])

  const isUrgent = current <= 5
  const r = 20
  const circ = 2 * Math.PI * r
  const frac = maxRef.current > 0 ? current / maxRef.current : 0
  const dash = circ * frac

  return (
    <svg
      width={52} height={52}
      style={{ flexShrink: 0 }}
    >
      <circle cx={26} cy={26} r={r} fill="rgba(0,0,0,0.25)" stroke="rgba(255,255,255,0.1)" strokeWidth={3.5} />
      <circle
        cx={26} cy={26} r={r}
        fill="none"
        stroke={isUrgent ? '#ef4444' : '#fbbf24'}
        strokeWidth={3.5}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 26 26)"
      />
      <text
        x={26} y={26}
        dominantBaseline="middle"
        textAnchor="middle"
        fill={isUrgent ? '#ef4444' : '#fbbf24'}
        fontSize={13}
        fontWeight="bold"
        fontFamily="monospace"
      >
        {current}
      </text>
    </svg>
  )
}
