import type { ItemId } from '@cumsino/shared'
import { C } from '../../theme'

export const ITEM_LABEL: Record<ItemId, string> = {
  blink: 'Блинк', gem: 'Гем', manta: 'Манта', smoke: 'Смок', hex: 'Хекс', bkb: 'BKB', aegis: 'Аегис',
}

const INK = C.ink
const S = { stroke: INK, strokeWidth: 2.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

/** Мультяшные символы предметов (не копии игровых иконок): чернильный контур + один цвет, как наклейка. */
export function ItemIcon({ id, size = 44 }: { id: ItemId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      {ICONS[id]}
    </svg>
  )
}

const ICONS: Record<ItemId, JSX.Element> = {
  // кинжал наискосок + хвост рывка
  blink: (
    <g>
      <path d="M5 33 L12 26 M4 25 L9 20 M12 40 L17 35" {...S} fill="none" opacity={0.55} />
      <g transform="rotate(42 26 22)">
        <path d="M26 3 L30.5 11 L30.5 29 L21.5 29 L21.5 11 Z" fill={C.sky} {...S} />
        <path d="M26 6 L26 27" stroke="#ffffff" strokeWidth={1.6} opacity={0.7} strokeLinecap="round" />
        <rect x={16} y={29} width={20} height={5} rx={2.2} fill={C.brass} {...S} />
        <rect x={23.2} y={34} width={5.6} height={8} rx={1.6} fill={INK} />
        <circle cx={26} cy={44.5} r={2.6} fill={C.brass} {...S} />
      </g>
    </g>
  ),
  // гранёный камень + искра
  gem: (
    <g>
      <path d="M10 18 L17 9 L31 9 L38 18 L24 41 Z" fill={C.sky} {...S} />
      <path d="M10 18 L38 18 M17 9 L21 18 L24 9 L27 18 L31 9 M21 18 L24 41 L27 18" {...S} strokeWidth={1.8} fill="none" />
      <path d="M17 9 L21 18 L10 18 Z" fill="#ffffff" opacity={0.45} />
      <path d="M40 5 L41.3 8.7 L45 10 L41.3 11.3 L40 15 L38.7 11.3 L35 10 L38.7 8.7 Z" fill={C.brass} {...S} strokeWidth={1.4} />
    </g>
  ),
  // скат и его иллюзия
  manta: (
    <g>
      <path d="M22 16 C16 16 9 20 3 28 C10 28 16 30 20 35 L22 43 L24 35 C28 30 34 28 41 28 C35 20 28 16 22 16 Z"
        fill="none" {...S} strokeDasharray="3 3.5" opacity={0.45} transform="translate(-1 -6)" />
      <path d="M26 18 C20 18 13 22 7 30 C14 30 20 32 24 37 L26 45 L28 37 C32 32 38 30 45 30 C39 22 32 18 26 18 Z"
        fill={C.mint} {...S} />
      <path d="M23 18 L20.5 13.5 M29 18 L31.5 13.5" {...S} fill="none" />
      <circle cx={23} cy={23} r={1.6} fill={INK} />
      <circle cx={29} cy={23} r={1.6} fill={INK} />
    </g>
  ),
  // клубок дыма
  smoke: (
    <g>
      <path d="M11 36 C5 36 4 28 10 26 C9 19 17 15 22 19 C24 12 35 12 36 20 C43 20 45 29 39 32 C40 37 34 39 31 36 Z"
        fill="#a99bd1" {...S} />
      <path d="M17 27 C19 24 23 24 24 27 M27 23 C29 21 32 22 33 24" {...S} strokeWidth={1.8} fill="none" opacity={0.6} />
      <path d="M14 41 C17 43 20 41 22 43 M26 42 C29 44 32 42 34 44" {...S} strokeWidth={1.8} fill="none" opacity={0.5} />
    </g>
  ),
  // овечка
  hex: (
    <g>
      <path d="M17 34 C10 35 8 27 13 24 C11 17 19 14 23 18 C26 12 36 13 36 20 C42 21 43 29 38 31 C39 37 32 39 29 35 C26 39 19 39 17 34 Z"
        fill="#ffffff" {...S} />
      <path d="M18 34 L17 42 M25 36 L25 43 M31 35 L32 42" {...S} fill="none" />
      <ellipse cx={11} cy={24} rx={6} ry={7.5} fill={INK} transform="rotate(-15 11 24)" />
      <path d="M8 19 C4 17 3 21 6 22" fill={INK} {...S} strokeWidth={1.6} />
      <circle cx={10} cy={23} r={1.5} fill="#ffffff" />
      <path d="M38 13 C40 9 45 10 44 14" {...S} stroke={C.hot} fill="none" />
    </g>
  ),
  // чёрный брусок с короной
  bkb: (
    <g>
      <path d="M12 23 L14 11 L19.5 17.5 L24 8 L28.5 17.5 L34 11 L36 23 Z" fill={C.brass} {...S} />
      <circle cx={24} cy={8} r={2} fill={C.hot} {...S} strokeWidth={1.4} />
      <rect x={8} y={23} width={32} height={14} rx={3} fill={INK} {...S} />
      <path d="M12 27 L36 27" stroke="#ffffff" strokeWidth={1.6} opacity={0.35} strokeLinecap="round" />
      <circle cx={16} cy={31} r={1.8} fill={C.brass} />
      <circle cx={24} cy={31} r={1.8} fill={C.brass} />
      <circle cx={32} cy={31} r={1.8} fill={C.brass} />
    </g>
  ),
  // щит с крыльями
  aegis: (
    <g>
      <path d="M14 20 C8 16 3 18 2 23 C6 22 8 24 9 26 C5 26 4 29 5 31 C8 29 11 30 13 31 Z" fill="#ffffff" {...S} strokeWidth={2} />
      <path d="M34 20 C40 16 45 18 46 23 C42 22 40 24 39 26 C43 26 44 29 43 31 C40 29 37 30 35 31 Z" fill="#ffffff" {...S} strokeWidth={2} />
      <path d="M24 7 L36 12 V23 C36 31 31 37 24 41 C17 37 12 31 12 23 V12 Z" fill={C.brass} {...S} />
      <path d="M24 12 L31 15 V23 C31 28 28 32 24 35 Z" fill="#ffffff" opacity={0.35} />
      <path d="M24 16 V31 M19 22 H29" {...S} strokeWidth={2} fill="none" />
    </g>
  ),
}
