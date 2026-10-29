import type { CSSProperties } from 'react'

/** Цвета номиналов: основа + цвет насечек на ребре + цвет цифры. */
const CHIP: Record<number, { base: string; edge: string; text: string }> = {
  10:  { base: '#d9d4c7', edge: '#4b5560', text: '#1d2522' },
  20:  { base: '#1f9d63', edge: '#e9f5ee', text: '#ffffff' },
  50:  { base: '#2f6fd6', edge: '#e6eefc', text: '#ffffff' },
  100: { base: '#d63a4f', edge: '#fbe9ec', text: '#ffffff' },
  500: { base: '#1c1f22', edge: '#f2b630', text: '#f2b630' },
}

/** Фишка казино: насечки на ребре (conic), внутреннее кольцо, номинал по центру. */
export function chipStyle(denom: number, px: number): CSSProperties {
  const c = CHIP[denom] ?? CHIP[100]
  return {
    width: px,
    height: px,
    borderRadius: '50%',
    background: [
      `radial-gradient(circle at 50% 50%, ${c.base} 0 52%, rgba(255,255,255,.55) 53% 56%, ${c.base} 57% 70%, transparent 71%)`,
      `repeating-conic-gradient(${c.base} 0 22.5deg, ${c.edge} 22.5deg 45deg)`,
    ].join(', '),
    boxShadow: '0 2px 0 rgba(0,0,0,.45), 0 5px 10px rgba(0,0,0,.5), inset 0 0 0 1px rgba(0,0,0,.25)',
    color: c.text,
    fontSize: Math.max(7, Math.round(px * 0.32)),
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
    lineHeight: 1,
  }
}
