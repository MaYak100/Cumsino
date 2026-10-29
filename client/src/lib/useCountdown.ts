import { useEffect, useState } from 'react'

/** Живой отсчёт секунд от значения из стейта (сервер присылает «сколько осталось»). undefined — отсчёта нет. */
export function useCountdown(seconds: number | undefined): number | undefined {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    setLeft(seconds)
    if (seconds === undefined) return
    const started = Date.now()
    const id = setInterval(() => setLeft(Math.max(0, Math.ceil(seconds - (Date.now() - started) / 1000))), 250)
    return () => clearInterval(id)
  }, [seconds])
  return left
}
