import { useState, useEffect } from 'react'

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

export function useSceneScale(): number {
  const compute = () => Math.min(1, window.innerWidth / SCENE_W, window.innerHeight / SCENE_H)
  const [scale, setScale] = useState(compute)
  useEffect(() => {
    const handler = () => setScale(compute())
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return scale
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
