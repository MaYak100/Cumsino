import { useEffect, useState } from 'react'
import { serverTime } from './clock'

/** Живой отсчёт секунд. Есть дедлайн (endsAt, время сервера) — от него (не копит ошибку в фоновой вкладке); нет —
 *  от значения из стейта («сколько осталось»). seconds undefined — отсчёта нет. */
export function useCountdown(seconds: number | undefined, endsAt?: number): number | undefined {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    setLeft(seconds)
    if (seconds === undefined) return
    const started = Date.now()
    const calc = () => setLeft(endsAt !== undefined
      ? Math.max(0, Math.ceil((endsAt - serverTime()) / 1000))
      : Math.max(0, Math.ceil(seconds - (Date.now() - started) / 1000)))
    calc()
    const id = setInterval(calc, 250)
    document.addEventListener('visibilitychange', calc)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', calc) }
  }, [seconds, endsAt])
  return left
}
