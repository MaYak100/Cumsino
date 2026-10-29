import type { GameMode } from '@cumsino/shared'

/** Палитра (зеркало :root в index.css) — для инлайн-стилей. */
export const C = {
  bg: '#0c1513',
  panel: '#13201c',
  panel2: '#1a2a25',
  line: '#24352f',
  fg: '#ede8de',
  muted: '#93a39c',
  paper: '#f3ede2',
  ink: '#121a17',
  brass: '#f2b630',
  hot: '#ff3d6e',
  sky: '#49c6e5',
  mint: '#3ee08f',
} as const

/** Стол: кожаный борт с латунной нитью и бирюзовое сукно. */
export const FELT = {
  rail: '#1d140d',
  trim: '#9a7630',
  edge: '#08110e',
  cloth: 'radial-gradient(ellipse at 50% 38%, #24664d 0%, #164434 52%, #0c271e 100%)',
} as const

export const DISPLAY = "'Dela Gothic One', 'Rubik', sans-serif"

/** У каждого режима свой цвет: он ведёт весь раунд — анонс, таймер, акценты. */
export const MODE: Record<GameMode, { name: string; short: string; desc: string; color: string }> = {
  all: {
    name: 'Вопрос для всех',
    short: 'Для всех',
    desc: 'Ставишь на себя. Ответил верно — делишь ставки тех, кто ошибся.',
    color: C.brass,
  },
  kerri: {
    name: 'Керри',
    short: 'Керри',
    desc: 'Отвечает один. Остальные видят ответ и ставят: вывезет или завалит.',
    color: C.hot,
  },
  closest: {
    name: 'Кто ближе',
    short: 'Кто ближе',
    desc: 'Без ставок. Чьё число ближе к правде — тот забирает банк.',
    color: C.sky,
  },
  top5: {
    name: 'Топ 5',
    short: 'Топ 5',
    desc: 'Назови пятёрку.',
    color: C.mint,
  },
}

export const modeColor = (mode?: GameMode | null) => (mode ? MODE[mode]?.color : undefined) ?? C.brass
