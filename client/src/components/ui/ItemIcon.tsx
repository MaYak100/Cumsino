import { useId } from 'react'
import type { ItemId } from '@cumsino/shared'
import { C } from '../../theme'

export const ITEM_LABEL: Record<ItemId, string> = {
  blink: 'Блинк', gem: 'Гем', manta: 'Манта', smoke: 'Смок', hex: 'Хекс', bkb: 'BKB', aegis: 'Аегис',
}

/**
 * Предметы как скетч маркером на бумаге: свои упрощённые рисунки по силуэту и цвету игровых иконок.
 * Заливка чуть съехала с контура (как маркер мимо линии), контур — двойной дрожащий штрих,
 * немного штриховки и белые блики. Дрожь — один фильтр на всю иконку, id уникален на экземпляр.
 */
export function ItemIcon({ id, size = 44 }: { id: ItemId; size?: number }) {
  const fid = 'ii' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const seed = SEED[id]
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden style={{ overflow: 'visible' }}>
      <defs>
        <filter id={fid} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves={2} seed={seed} />
          <feDisplacementMap in="SourceGraphic" scale={1.6} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter={`url(#${fid})`}>{ICONS[id]}</g>
    </svg>
  )
}

const SEED: Record<ItemId, number> = { blink: 3, gem: 7, manta: 11, smoke: 5, hex: 13, bkb: 2, aegis: 9 }

const INK = C.ink
const W = 2.3
const OFF = 'translate(1.1 1.2)'

/** Пятно цвета (съехавшее) + двойной чернильный контур. */
function Shape({ d, c, w = W, noInk }: { d: string; c: string; w?: number; noInk?: boolean }) {
  return (
    <>
      <path d={d} fill={c} transform={OFF} />
      {!noInk && (
        <>
          <path d={d} fill="none" stroke={INK} strokeWidth={w} strokeLinejoin="round" strokeLinecap="round" />
          <path d={d} fill="none" stroke={INK} strokeWidth={w * 0.35} strokeLinejoin="round" strokeLinecap="round"
            transform="translate(-0.7 0.5)" opacity={0.6} />
        </>
      )}
    </>
  )
}

/** Сплошная тёмная деталь (рукоять, глазница) — без сдвига. */
function Solid({ d, c = INK }: { d: string; c?: string }) {
  return <path d={d} fill={c} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
}

/** Линия: чернила, цветной росчерк или белый блик. */
function Line({ d, c = INK, w = W, op = 1 }: { d: string; c?: string; w?: number; op?: number }) {
  return <path d={d} fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" opacity={op} />
}

/** Штриховка тени. */
function Hatch({ d }: { d: string }) {
  return <Line d={d} w={1} op={0.55} />
}

function Hi({ d, w = 1.8 }: { d: string; w?: number }) {
  return <Line d={d} c="#ffffff" w={w} op={0.95} />
}

// лепесток Аегиса, смотрит вверх из центра (24, 25)
const PETAL_OUT = 'M24 25 C18 19 18 10 22 2.5 C23.5 8 29 10 29 17 C29 21 27 23 24 25 Z'
const PETAL_IN = 'M24 25 C20.5 20.5 20.5 14 23.5 9 C24.5 13 28 15 27.5 19.5 C27 22 25.5 23.5 24 25 Z'

// клубы дыма из шара Смока: тянутся вверх-вправо, расширяясь
const SMOKE = 'M22 22 C21 17.5 24.5 14 28 15 C28 10 33 7.5 36.5 9.5 C37.5 4 45 3.5 45.5 9 C48.5 10.5 47.5 16 44 16 C44 20 38.5 21.5 36.5 19 C34.5 22.5 29.5 23 28 21.5 C27 24 24 25 22 22 Z'

const ICONS: Record<ItemId, JSX.Element> = {
  // Blink Dagger: изогнутый голубой клинок-полумесяц, тёмно-синяя рукоять вверх-вправо, росчерки рывка
  blink: (
    <g>
      <Line d="M3 27 L8 26 M5 36 L10 33.5 M12 46 L14.5 41.5 M22 45 L23 41 M3 18 L7.5 19.5 M36 33 L40 35" c={C.sky} w={2.2} />
      <Shape d="M35 24 C30 36 19 44 10 41 C5.5 39.5 3 34 3.5 27.5 C7 32.5 13 34 19.5 31 C25 28.5 28.5 22 30.5 15 Z" c="#c8f0fb" />
      <Shape d="M35 24 C30 36 19 44 10 41 C5.5 39.5 3 34 3.5 27.5 C5 33 8 37 12 37.5 C20 38.5 28 32 32.5 22 Z" c={C.sky} noInk />
      <Line d="M35 24 C30 36 19 44 10 41 C5.5 39.5 3 34 3.5 27.5" w={W} />
      <Hi d="M27 21 C24 27 18.5 31.5 11 32.5" />
      <Hatch d="M17 40 L18.5 37 M21.5 38.5 L23 35.5 M25.5 36 L27 33" />
      <Solid d="M28.5 12.5 C31 11 36.5 21 38 26 C36 27.5 34 26 33 24 C31.5 21 29 16 28.5 12.5 Z" c="#2a3f8f" />
      <Solid d="M33.5 20.5 L41.5 9 C43 8 45.5 9.5 45 11.5 L37.5 23.5 Z" c="#2346a8" />
      <Line d="M38 13.5 L41 15.5 M36 17 L39 19" c={C.sky} w={1.4} />
      <circle cx={43.4} cy={9.4} r={2.6} fill={C.sky} stroke={INK} strokeWidth={1.6} />
    </g>
  ),

  // Gem of True Sight: светящийся зелёный гранёный камень в тёмной оправе
  gem: (
    <g>
      <Line d="M5 10 L9 13 M43 38 L39 35.5 M44 15 L40 17 M8 40 L11.5 37.5" c={C.mint} w={2.2} />
      <Shape d="M24 6 C35 6 43 14 42 24 C41 35 33 42 24 42 C13 42 6 34 6 24 C6 14 13 6 24 6 Z" c="#38423f" />
      <Hatch d="M33 37 L37 33 M29 39.5 L35 34.5" />
      <Shape d="M24 11 L34 17 L35 28 L26 37 L15 33 L13 21 Z" c="#2fd27f" />
      <path d="M20 19 L28 18 L30 26 L23 30 L18 26 Z" fill="#aaf5c9" />
      <Line d="M20 19 L28 18 L30 26 L23 30 L18 26 Z M24 11 L20 19 M34 17 L28 18 M35 28 L30 26 M26 37 L23 30 M15 33 L18 26 M13 21 L20 19" w={1.1} op={0.8} />
      <Hatch d="M27 33 L31 29.5 M29.5 34 L33 30.5" />
      <path d="M17 15 L18.4 10.5 L19.8 15 L24.5 16.4 L19.8 17.8 L18.4 22.5 L17 17.8 L12.3 16.4 Z" fill="#ffffff" stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
    </g>
  ),

  // Manta Style: бледный лезвие-полумесяц слева, узорный центр с красным камнем, древко вправо-вверх
  manta: (
    <g>
      <Shape d="M29 21 L43 7 C45 6 47 8 46 10 L32.5 25 Z" c="#4a3358" />
      <Line d="M37 15 L39.5 17.5 M40.5 11.5 L43 14" c={C.brass} w={1.8} />
      <Shape d="M27 3 C11 7 2 21 5 33 C7 40 13 45 22 46 C15.5 39 13.5 31 15.5 24 C17.5 16 21.5 9 27 3 Z" c="#e4edf1" />
      <Hatch d="M8 30 L10.5 28.5 M8 35 L11.5 33 M10 40 L13.5 37.5" />
      <Hi d="M22 7.5 C13 13 8 22 8.5 29" />
      <Line d="M19 13.5 L19.4 13.5 M17 18.5 L17.4 18.5 M15.8 24 L16.2 24 M15.8 29.5 L16.2 29.5 M17 35 L17.4 35" w={2.6} c={C.hot} />
      <Shape d="M24.5 16 C30 16 33.5 20 33 25 C32.5 30 28.5 33 24 33 C19.5 33 16.5 29 17 24.5 C17.5 19.5 20.5 16 24.5 16 Z" c="#5a2d6e" />
      <Shape d="M25 20 C28 20 29.5 22.5 29 25 C28.5 27.5 26.5 29 24.5 29 C22 29 20.5 27 21 24.5 C21.5 22 23 20 25 20 Z" c="#ff2d4f" w={1.6} />
      <Hi d="M23 22.5 C23.5 21.8 24.3 21.5 25 21.5" w={1.4} />
    </g>
  ),

  // Smoke of Deceit: фиолетовый шар с тёмным завитком, из него поднимается дым
  smoke: (
    <g>
      <Shape d={SMOKE} c="#c2a9f7" />
      <Line d="M30 17 C31.5 15 34 15 35 16.5 M37 10 C38.5 8.5 41 9 41.5 10.5" w={1.2} op={0.6} />
      <Line d="M44 21 C45.5 20 47 21 46.5 22.5 M38 25 C39.5 24 41 25 40.5 26.5" c="#9b7ae8" w={1.8} />
      <Shape d="M18 18.5 C25.5 18.5 31 24 31 31 C31 38.5 25 43.5 18 43.5 C10.5 43.5 5 38 5 31 C5 24 10.5 18.5 18 18.5 Z" c="#7a4bdf" />
      <Hatch d="M23 41 L28 36 M19.5 42.5 L26 36.5 M27 37 L29.8 34" />
      <Line d="M12 36 C9.5 31 12.5 26.5 17 27 C20.5 27.5 21 31.5 18 32.5 M17 27 C21 24 26 25 28 28" w={2.4} />
      <Hi d="M8.5 29 C9.5 25 12.5 22 16 21.5" w={2} />
    </g>
  ),

  // Scythe of Vyse: золотое древко, сверху бледный птичий череп с клювом, голубое свечение
  hex: (
    <g>
      <Shape d="M5 17 C3 28 9 38 21 39 C14 34 10 27 11 19 Z" c="#8fe6f5" w={1.8} />
      <Line d="M4 30 L7.5 29 M9 40 L11.5 37 M16 44 L17 40.5" c={C.sky} w={2.2} />
      <Shape d="M23.5 21 L28.5 19 L45 43.5 L41 46.5 Z" c={C.brass} />
      <Hatch d="M33 31.5 L35.5 30 M36 36 L38.5 34.5 M39 40.5 L41.5 39" />
      <Solid d="M22 19.5 C24 17.5 28 17 30.5 18.5 L30 22.5 C27.5 21.5 25 22 23.5 23.5 Z" c="#9a6b14" />
      <Shape d="M21 18 C18 14 20 6 27 4.5 C34 3 40 8 38.5 14.5 C37.5 19 33 21 28 20 C25.5 19.5 23 19 21 18 Z" c="#f2ead6" />
      <Shape d="M23 9 L4.5 15.5 L22 17 Z" c="#e3d7b8" />
      <Line d="M8.5 15 L21 13.5" w={1} op={0.7} />
      <circle cx={29} cy={11} r={3.4} fill={INK} />
      <circle cx={28} cy={10} r={1} fill={C.sky} />
      <Hatch d="M33 17.5 L36 14.5 M30.5 19 L34 15.5" />
      <Hi d="M25 6.5 C28 5 31.5 5 34 6.5" />
    </g>
  ),

  // Black King Bar: золотая шлем-маска с красным глазом-камнем и загнутым назад гребнем
  bkb: (
    <g>
      <Shape d="M20 12 C27 3.5 38 1.5 46.5 4 C39 6 33.5 9.5 30 15 Z" c="#d99a1e" />
      <Shape d="M29 18 C35.5 12 42 11 47.5 13.5 C42 15 38 18 35.5 23 Z" c="#e8a823" />
      <Shape d="M32 27 C37.5 24 43 24.5 47 28 C42.5 28.5 39 31 36.5 35 Z" c="#d99a1e" />
      <Shape d="M6 25 C7 16 15 10.5 24 10.5 C32 11 37.5 17 37 26 C36.5 35 29.5 41.5 21 41.5 C16 41.5 12 39 9.5 35.5 L2.5 37 L5.5 31 Z" c={C.brass} />
      <Hatch d="M29 36.5 L33 32.5 M25.5 38.5 L31 33.5 M32 31 L35 28" />
      <Line d="M8 22 C13 18 21 17.5 28 20.5" w={2} />
      <Line d="M9.5 35 C15 37 23 36 29 31 C32 28.5 33.5 25 33.5 21" w={2} />
      <path d="M17.5 21.5 C22.5 21 25.5 24 25 27.5 C24.5 30.5 21.5 32 18.5 31.5 C15 31 13 28.5 13.5 25.5 C14 23 15.5 21.8 17.5 21.5 Z"
        fill="#ff2340" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <Hi d="M16.5 24.5 C17.3 23.6 18.3 23.2 19.3 23.2" w={1.6} />
      <Hi d="M11 15.5 C14 13 18 12 22 12.3" />
    </g>
  ),

  // Aegis of the Immortal: тлеющий огненный цветок — тёмно-красные лепестки, оранжевые внутри, жёлтое ядро
  aegis: (
    <g>
      {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
        <g key={a} transform={`rotate(${a} 24 25)`}><Shape d={PETAL_OUT} c="#b8321e" w={1.9} /></g>
      ))}
      {[22, 94, 166, 238, 310].map(a => (
        <g key={a} transform={`rotate(${a} 24 25)`}><Shape d={PETAL_IN} c="#ff8a1f" w={1.5} /></g>
      ))}
      <circle cx={24} cy={25} r={6.5} fill="#ffd23f" stroke={INK} strokeWidth={1.8} />
      <circle cx={23.2} cy={24.2} r={3.2} fill="#fff6c9" />
      <Line d="M6 8 L7.5 10 M41 6.5 L40 9 M44 41 L41.5 40" c="#ff8a1f" w={2} />
    </g>
  ),
}
