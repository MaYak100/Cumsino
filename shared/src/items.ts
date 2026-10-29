// shared/src/items.ts — предметы, бонусы (молния, серия) и блайнды. Правила — docs/items.md.
import type { GameMode, GamePhase } from './types'

export type ItemId = 'blink' | 'gem' | 'manta' | 'smoke' | 'hex' | 'bkb' | 'aegis'

export interface ItemDef {
  id: ItemId
  name: string
  /** цена при балансе до $500; выше — дороже (itemPrice) */
  basePrice: number
  /** сколько можно держать в запасе; у аегиса — сколько можно купить за игру */
  max: number
  /** когда применяется; passive — срабатывает сам */
  usePhases: GamePhase[] | 'passive'
  /** в каких режимах применяется. kerri: керри — только блинк; толпа — только bkb */
  modes: GameMode[]
  /** нужно выбрать игрока */
  targeted: boolean
  /** клавиша на панели */
  key?: string
  /** одной строкой — для подсказки */
  desc: string
}

export const ITEMS: Record<ItemId, ItemDef> = {
  blink: {
    id: 'blink', name: 'Blink', basePrice: 50, max: 5, usePhases: ['QUESTION'], modes: ['all', 'kerri', 'closest'],
    targeted: false, key: 'Z', desc: 'Передумал после ответа — жми другой вариант. Один блинк — одна смена ответа',
  },
  gem: {
    id: 'gem', name: 'Gem of True Sight', basePrice: 150, max: 3, usePhases: ['QUESTION'], modes: ['all', 'closest'],
    targeted: true, key: 'X', desc: 'Подсмотри, что сейчас выбрано у игрока. Все видят, что ты смотрел, но не на кого',
  },
  manta: {
    id: 'manta', name: 'Manta Style', basePrice: 100, max: 3, usePhases: ['QUESTION'], modes: ['all'],
    targeted: false, key: 'C', desc: 'Убирает один неверный вариант. Раз за раунд',
  },
  smoke: {
    id: 'smoke', name: 'Smoke of Deceit', basePrice: 100, max: 3, usePhases: ['QUESTION'], modes: ['all', 'closest'],
    targeted: false, key: 'V', desc: 'До конца раунда не видно, ответил ли ты и чем пользуешься. Гем на тебя слепнет',
  },
  hex: {
    id: 'hex', name: 'Scythe of Vyse', basePrice: 150, max: 3, usePhases: ['BETTING'], modes: ['all'],
    targeted: true, key: 'B', desc: 'Бросается на ставках: у цели будет всего 12 секунд на ответ',
  },
  bkb: {
    id: 'bkb', name: 'Black King Bar', basePrice: 200, max: 2, usePhases: ['ANNOUNCE', 'BETTING'], modes: ['all', 'kerri'],
    targeted: false, key: 'N', desc: 'Включи до вопроса: проигрыш вернётся (до двух цен BKB), серия не собьётся',
  },
  aegis: {
    id: 'aegis', name: 'Aegis', basePrice: 100, max: 1, usePhases: 'passive', modes: ['all', 'kerri', 'closest'],
    targeted: false, desc: 'Один на игру, работает сам: упал ниже $50 — встаёшь с $300',
  },
}

export const ITEM_ORDER: ItemId[] = ['blink', 'gem', 'manta', 'smoke', 'hex', 'bkb', 'aegis']

/** Покупка — только в лавке (фаза SHOP перед каждым раундом «для всех»). */
export const BUY_PHASES: GamePhase[] = ['SHOP']

export const round10 = (x: number) => Math.round(x / 10) * 10
const ceil10 = (x: number) => Math.ceil(x / 10) * 10

/** Цена растёт с балансом: до $500 — базовая, $1000 — ×1.25, $2000 — ×1.75, с $2500 — ×2. */
export function itemPrice(id: ItemId, balance: number): number {
  const k = Math.min(2, Math.max(1, 0.75 + balance / 2000))
  return round10(ITEMS[id].basePrice * k)
}

// ── параметры предметов ──
export const HEX_SECONDS = 12
/** сейв BKB растёт с его ценой: две цены BKB на момент включения ($400 при базовой) */
export const bkbCap = (balance: number) => 2 * itemPrice('bkb', balance)
export const AEGIS_THRESHOLD = 50
export const AEGIS_RESTORE = 300
/** после последнего ответа раунд считается через секунду: успеть блинкнуть в последний момент */
export const LAST_ANSWER_GRACE_MS = 1000

// ── бонусы (платит казино) ──
/** «Молния»: верный ответ в первые 5 секунд вопроса — +25% ставки (керри — +$100) */
export const LIGHTNING_MS = 5000
export const LIGHTNING_SHARE = 0.25
export const LIGHTNING_GLADIATOR = 100

/** «Серия»: доля ставки сверху за N верных раундов подряд (с двух). Сброс — ошибка или пропуск хода. */
export function streakShare(streak: number): number {
  if (streak < 2) return 0
  return [0, 0, 0.2, 0.35, 0.5][streak] ?? 0.6
}
/** у керри ставки нет — серия считается от бонуса керри */
export const STREAK_GLADIATOR_BASE = 300

// ── блайнды (только «для всех») ──
export const SMALL_BLIND = 0.05
export const BIG_BLIND = 0.1

/** Минимальная ставка раунда: 5% баланса (ведущему — 10%), вверх до $10, не меньше $10 и не больше баланса. */
export function blindFor(balance: number, big: boolean): number {
  if (balance < 10) return 0
  return Math.min(Math.floor(balance / 10) * 10, Math.max(10, ceil10(balance * (big ? BIG_BLIND : SMALL_BLIND))))
}
