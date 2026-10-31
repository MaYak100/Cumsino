import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Часы сервера на клиенте. Отсчёт фазы — от дедлайна (phaseEndsAt, время сервера), а не «минус секунда по таймеру»:
 * в фоновой вкладке и на занятом телефоне тики опаздывают, и прежний отсчёт копил ошибку (показывал больше, чем
 * осталось, фаза кончалась «на середине»), а каждый новый game_state перезапускал его (рывки и «ускорения»).
 *
 * Разница часов: в каждом стейте сервер пишет своё время (serverNow). Выборка serverNow − Date.now() меньше настоящей
 * разницы на задержку доставки, поэтому берём наибольшую из последних — у самого быстрого пакета ошибка меньше всего.
 */
const samples: number[] = []
let offset = 0

export function syncClock(serverNow: number | undefined) {
  if (!serverNow) return
  const sample = serverNow - Date.now()
  // часы устройства перевели (или первый стейт) — старые выборки больше не про эти часы
  if (samples.length && Math.abs(sample - offset) > 1000) samples.length = 0
  samples.push(sample)
  if (samples.length > 12) samples.shift()
  offset = Math.max(...samples)
}

/** «Сейчас» по часам сервера. */
export const serverTime = () => Date.now() + offset

/**
 * Сколько миллисекунд до дедлайна (время сервера); перерисовка 4 раза в секунду и сразу при возврате на вкладку.
 * Нет дедлайна (моки, /dev) — отсчёт от fallbackSeconds с момента, когда он пришёл. stopped — число замирает.
 */
export function useMsLeft(endsAt: number | undefined, fallbackSeconds: number, stopped = false): number {
  const fallbackEnd = useMemo(() => serverTime() + fallbackSeconds * 1000, [fallbackSeconds])
  const end = endsAt ?? fallbackEnd
  const [, setTick] = useState(0)
  useEffect(() => {
    if (stopped) return
    const tick = () => setTick(t => t + 1)
    const id = setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [stopped])
  const live = Math.max(0, end - serverTime())
  // остановлен (ответ раскрыт) — замираем на том, что было в момент остановки
  const frozen = useRef<number | null>(null)
  if (!stopped) frozen.current = null
  else if (frozen.current === null) frozen.current = live
  return stopped ? frozen.current! : live
}
