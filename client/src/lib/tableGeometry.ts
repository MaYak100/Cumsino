export const FELT_CX = 450
export const FELT_CY = 305
export const FELT_RX = 200
export const FELT_RY = 125
export const OUTER_RX = 227
export const OUTER_RY = 152
export const LAND_INSET = 42
export const CARD_GAP = 28
export const SCENE_W = 900
export const SCENE_H = 610

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
    x: FELT_CX + ex + nx * CARD_GAP,
    y: FELT_CY + ey + ny * CARD_GAP,
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
