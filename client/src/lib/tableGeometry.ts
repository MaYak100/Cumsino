import { useState, useEffect, createContext, useContext, useMemo } from 'react'

export const FELT_CX = 650
export const FELT_CY = 415
export const FELT_RX = 380
export const FELT_RY = 248
export const OUTER_RX = 424
export const OUTER_RY = 285
export const LAND_INSET = 20
export const CARD_GAP_X = 45
export const CARD_GAP_Y = 45
export const SCENE_W = 1300
export const SCENE_H = 820

// растёт и на больших экранах (до 1.4): на 1920×1080 стол не должен оставаться «ноутбучным»
const sceneScale = () => Math.min(1.4, window.innerWidth / SCENE_W, window.innerHeight / (SCENE_H + 90))   // +90: плашки игроков сверху и снизу выходят за сцену

/** Ниже этого масштаба сцены круглый стол не играбелен (фишки мельче ~17 px) — ставки в компактной раскладке. */
export const COMPACT_SCALE = 0.55
const COMPACT_WIDTH = 640
const isCompact = () => window.innerWidth < COMPACT_WIDTH || sceneScale() < COMPACT_SCALE

function useViewport<T>(compute: () => T): T {
  const [v, setV] = useState(compute)
  useEffect(() => {
    const handler = () => setV(compute())
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return v
}

export function useSceneScale(): number {
  return useViewport(sceneScale)
}

/** Телефон (уже 640 px) или экран, где стол ужимается меньше ×0.55: ставки — списком (CompactBetting), фон без стола. */
export function useCompactBetting(): boolean {
  return useViewport(isCompact)
}

/** Масштаб сцены стола (CSS scale у обёртки) — для поправки перелёта фишек, см. useFlightTransform. */
export const SceneScaleContext = createContext(1)

/** Перелёт фишки по layoutId внутри отмасштабированной сцены. Framer Motion меряет старую и новую рамку на экране
 *  и сдвигает элемент translate'ом на разницу в экранных пикселях — а translate применяется внутри scale(s) предка
 *  и вырастает в s раз: на 1920×1080 фишка стартовала на ~30 px ниже стопки и в конце догоняла. Масштаб предка FM
 *  не учитывает (и motion-обёртка со style.scale не помогает — ошибка только растёт), поэтому делим сдвиг сами:
 *  transformTemplate получает готовую строку проекции. */
export function useFlightTransform(scale?: number) {
  const ctx = useContext(SceneScaleContext)
  const s = scale ?? ctx
  return useMemo(() => {
    if (s === 1) return undefined
    return (_: unknown, generated: string) =>
      generated.replace(/translate3d\(([^,]+)px, ([^,]+)px,/, (_m, x: string, y: string) =>
        `translate3d(${parseFloat(x) / s}px, ${parseFloat(y) / s}px,`)
  }, [s])
}

export function playerAngle(i: number, N: number): number {
  return Math.PI / 2 + i * (2 * Math.PI / N)
}

export function landingZone(angle: number): { cx: number; cy: number } {
  const ex = FELT_RX * Math.cos(angle)
  const ey = FELT_RY * Math.sin(angle)
  const len = Math.sqrt(ex * ex + ey * ey)
  const nx = -ex / len
  const ny = -ey / len
  return {
    cx: FELT_CX + ex + nx * LAND_INSET,
    cy: FELT_CY + ey + ny * LAND_INSET,
  }
}

export function cardAnchor(angle: number): { x: number; y: number } {
  const ex = OUTER_RX * Math.cos(angle)
  const ey = OUTER_RY * Math.sin(angle)
  const len = Math.sqrt(ex * ex + ey * ey)
  const nx = ex / len
  const ny = ey / len
  return {
    x: FELT_CX + ex + nx * CARD_GAP_X,
    y: FELT_CY + ey + ny * CARD_GAP_Y,
  }
}

export function unitPosition(
  angle: number,
  unitW: number,
  chipRowH: number,
  cardH: number,
): { left: number; top: number } {
  const anchor = cardAnchor(angle)
  const sinA = Math.sin(angle)
  const cosA = Math.cos(angle)
  const totalH = chipRowH + cardH

  if (Math.abs(cosA) > Math.abs(sinA)) {
    const top = anchor.y - totalH / 2
    if (cosA > 0) return { left: anchor.x, top }
    return { left: anchor.x - unitW, top }
  }

  const left = anchor.x - unitW / 2
  if (sinA > 0) return { left, top: anchor.y }
  return { left, top: anchor.y - totalH }
}
