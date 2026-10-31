import { C, DISPLAY } from '../../theme'
import { useMsLeft } from '../../lib/clock'

interface TimerProps {
  /** остаток из стейта — запасной отсчёт (моки), если нет дедлайна */
  seconds: number
  /** конец отсчёта — время сервера (phaseEndsAt) */
  endsAt?: number
  /** полная длина (phaseDuration): от неё доля кольца — открытый посреди фазы экран не рисует полный круг */
  total?: number
  color?: string
  size?: number
}

/** Кольцо-таймер (на столе). ≤5с — малиновый, без пульсации. Остаток — от дедлайна (lib/clock). */
export function Timer({ seconds, endsAt, total, color = C.brass, size = 56 }: TimerProps) {
  const ms = useMsLeft(endsAt, seconds)
  const current = Math.ceil(ms / 1000)
  const max = total ?? seconds

  const c = current <= 5 ? C.hot : color
  const half = size / 2
  const r = half - 4
  const circ = 2 * Math.PI * r
  const dash = circ * (max > 0 ? Math.min(1, ms / (max * 1000)) : 0)

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={half} cy={half} r={r} fill={C.bg} fillOpacity={0.55} stroke={C.line} strokeWidth={4} />
      <circle
        cx={half} cy={half} r={r}
        fill="none" stroke={c} strokeWidth={4}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${half} ${half})`}
        style={{ transition: 'stroke-dasharray .25s linear, stroke .3s' }}
      />
      <text x={half} y={half + 1} dominantBaseline="middle" textAnchor="middle" fill={c}
        fontSize={size * 0.3} fontFamily={DISPLAY}>
        {current}
      </text>
    </svg>
  )
}
