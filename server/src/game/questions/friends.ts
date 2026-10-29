// server/src/game/questions/friends.ts
// Вопросы про друзей (перенос прототипа scripts/friends_questions.py, правила — docs/questions/stratz-research.md,
// «Друзья»). Метрики — scripts/data/friends/metrics.json. Вопросы только про тех, кто опознан в лобби
// («кто ты» при входе); категория получает вес, когда опознаны ≥ 2 человека.
//
// Ник — в родительном падеже (GENITIVE, формы сверены с компанией): «На каком из героев у выбрудка больше всего
// игр в рейтинге?». В «Сколько игр X и Y сыграли вместе» — именительный.
// Срезы: рейтинг (lobbyType RANKED) и Турбо, не смешиваются. Открытый профиль — вся история («в рейтинге»),
// аноним — игры в пати с кем-то из открытых («в пати рейтинге»); окно выборки — в comment. Пары аноним + аноним
// не спрашиваем. Отрыв лидера: счётчики ≥ 15%, винрейты ≥ 10 п.п. Герой (человек в «главном напарнике»),
// попавший в варианты, до конца игры в этом типе вопроса про этого человека не появляется.
import type { Question } from '@cumsino/shared'

type Mode = 'ranked' | 'turbo'
const MODES: Mode[] = ['ranked', 'turbo']
const MODE_TEXT: Record<Mode, string> = { ranked: 'в рейтинге', turbo: 'в Турбо' }
const PARTY_TEXT: Record<Mode, string> = { ranked: 'в пати рейтинге', turbo: 'в пати Турбо' }
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября',
  'ноября', 'декабря']
const MIN_COUNT_GAP = 0.15
const MIN_WR_GAP = 0.10
/** hero_wr: варианты — от 30 игр, правильный ответ — от 50 (лидер на 31 игре — шум ±9 п.п.) */
const MIN_WR_GAMES = 30
const MIN_WR_LEAD_GAMES = 50
const MIN_SELF_WR_GAMES = 40
/** self_wr: шаг вариантов ≈ одна стандартная ошибка винрейта (50 / √игр), но не меньше 5 п.п. */
const SELF_WR_MIN_STEP = 5
/** hero_main (варианты, кроме ловушки) и hero_games */
const MIN_HERO_GAMES = 20
const MIN_PAIR_GAMES = 50
/** варианты «мейна» — из первых TOP_POOL героев человека */
const TOP_POOL = 8
/** hero_games и self_wr — только самые игранные герои: иначе человек со 130 героями забивает колоду */
const TOP_CARDS = 6
/** В рейтинге компания собрана вокруг него: «главный напарник» про других почти всегда он — спрашиваем только про него. */
const RANKED_PAIR_TOP_ONLY = 1101588971

export const MIN_IDENTIFIED_FRIENDS = 2

/** Родительный падеж ников компании (по steam id). Кого нет — ник не склоняется. */
const GENITIVE: Record<number, string> = {
  1101588971: 'выбрудка',
  910030283: 'Блоха Иглы',
  841374410: 'онального трахадоrа',
  1023791464: 'DUPHЯ',
  875585992: 'Питахайля',
  1259367416: 'гнилого кулича',
}

type Span = [from: string, to: string]   // 'YYYY-MM'

export interface FriendsMetrics {
  people: Record<string, { name: string; open: boolean }>
  heroes: Record<Mode, Record<string, { own: Record<string, [number, number]>; company: Record<string, [number, number]> }>>
  pairs: Record<Mode, Record<string, number>>
  /** окно выборки по человеку и базе (own / company) */
  spans?: Record<Mode, Record<string, { own?: Span; company?: Span }>>
  pairSpans?: Record<Mode, Record<string, Span>>
}

/** group — человек (или пара): колода выбирает сначала человека, потом карточку (picker.ts drawFromDeck) */
export interface FriendCandidate { card: string; group: string; build: () => Question | null }

export interface FriendKind {
  id: string
  kinds: Array<'mc' | 'closest'>
  templates: number
  candidates: (g: FriendsGen, present: number[]) => FriendCandidate[]
}

type Pick = [key: number, value: number]

/** '2022-10' → «с октября 2022» */
function since(ym: string | undefined): string {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  return `с ${MONTHS[Number(m) - 1]} ${y}`
}

export class FriendsGen {
  private used = new Map<string, Set<number>>()

  constructor(private m: FriendsMetrics, private names: Record<number, string>, readonly rng: () => number = Math.random) {}

  people(): number[] {
    return Object.keys(this.m.people).map(Number)
  }

  isOpen(a: number): boolean {
    return !!this.m.people[a]?.open
  }

  who(a: number): string {
    return this.m.people[a]?.name ?? String(a)
  }

  /** родительный падеж ника («у выбрудка»); нет в GENITIVE — ник как есть (Rocinante не склоняется) */
  whose(a: number): string {
    return GENITIVE[a] ?? this.who(a)
  }

  hero(h: number): string {
    return this.names[h] ?? `#${h}`
  }

  where(a: number, mode: Mode): string {
    return this.isOpen(a) ? MODE_TEXT[mode] : PARTY_TEXT[mode]
  }

  heroes(a: number, mode: Mode): Array<[hero: number, games: number, wins: number]> {
    const rec = this.m.heroes[mode]?.[a]
    if (!rec) return []
    const base = this.isOpen(a) ? rec.own : rec.company
    return Object.entries(base).map(([h, [g, w]]) => [Number(h), g, w])
  }

  /** TOP_CARDS самых игранных героев от minGames игр */
  topHeroes(a: number, mode: Mode, minGames: number): Array<[hero: number, games: number, wins: number]> {
    return this.heroes(a, mode).filter(([, games]) => games >= minGames).sort((x, y) => y[1] - x[1]).slice(0, TOP_CARDS)
  }

  /** Окно выборки для comment. */
  window(a: number, mode: Mode): string {
    const span = this.m.spans?.[mode]?.[a]?.[this.isOpen(a) ? 'own' : 'company']
    const from = since(span?.[0])
    return this.isOpen(a)
      ? `Вся история STRATZ${from ? ` — ${from}` : ''}.`
      : `Профиль скрыт: только игры в пати с открытыми профилями${from ? `, ${from}` : ''}.`
  }

  pairKey(a: number, b: number): string {
    const [x, y] = a < b ? [a, b] : [b, a]
    return `${x}-${y}`
  }

  pair(a: number, b: number, mode: Mode): number {
    return this.m.pairs[mode]?.[this.pairKey(a, b)] ?? 0
  }

  pairSince(a: number, b: number, mode: Mode): string {
    return since(this.m.pairSpans?.[mode]?.[this.pairKey(a, b)]?.[0])
  }

  pairOk(a: number, b: number): boolean {
    return this.isOpen(a) || this.isOpen(b)
  }

  usedOf(key: string): Set<number> {
    let s = this.used.get(key)
    if (!s) this.used.set(key, (s = new Set()))
    return s
  }

  shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  /** Лидер (cands по убыванию «лучшести») отрывается от трёх остальных; лидер — первый подходящий (и проходящий leadOk). */
  leaderSet(cands: Pick[], gapOk: (lead: number, other: number) => boolean, leadOk: (c: Pick) => boolean = () => true):
    Pick[] | null {
    for (let i = 0; i < cands.length; i++) {
      if (!leadOk(cands[i])) continue
      const rest = cands.slice(i + 1).filter(c => gapOk(cands[i][1], c[1]))
      if (rest.length >= 3) return [cands[i], ...this.shuffle(rest).slice(0, 3)]
    }
    return null
  }

  mc(card: string, usedKey: string, subject: number, text: string, picked: Pick[], label: (k: number) => string,
    note: (v: number) => string = v => String(v)): Question {
    const used = this.usedOf(usedKey)
    for (const [k] of picked) used.add(k)
    const shown = this.shuffle(picked)
    return {
      id: card, mode: 'all', topic: 'Друзья', displayTopic: this.who(subject), text,
      options: shown.map(([k]) => label(k)),
      optionNotes: shown.map(([, v]) => note(v)),
      answer: label(picked[0][0]),
    }
  }

  closest(card: string, subject: string, text: string, answer: number, comment: string): Question {
    return { id: card, mode: 'closest', topic: 'Друзья', displayTopic: subject, text, numericAnswer: answer, unit: 'игр', comment }
  }
}

/** 1 игра, 2 игры, 5 игр */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100
  const w = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
  return `${n} ${w}`
}

/** Шаг вариантов self_wr по выборке. */
export function selfWrStep(games: number): number {
  return Math.max(SELF_WR_MIN_STEP, Math.round(50 / Math.sqrt(games)))
}

/** 4 винрейта через step, все в (0, 100); позиция ответа по величине — случайная из допустимых. По возрастанию. */
export function wrOptions(answer: number, step: number, rng: () => number): number[] {
  const valid = [0, 1, 2, 3].filter(p => answer - p * step > 0 && answer + (3 - p) * step < 100)
  const p = valid.length ? valid[Math.floor(rng() * valid.length)] : 0
  return [0, 1, 2, 3].map(i => answer + (i - p) * step)
}

const gapCount = (l: number, o: number) => l >= o * (1 + MIN_COUNT_GAP)
const pct = (v: number) => `${Math.round(100 * v)}%`
const gamesNote = (v: number) => plural(v, 'игра', 'игры', 'игр')
const other = (mode: Mode): Mode => mode === 'ranked' ? 'turbo' : 'ranked'

function perPerson(present: number[],
  fn: (a: number, mode: Mode) => Omit<FriendCandidate, 'group'> | Array<Omit<FriendCandidate, 'group'>> | null): FriendCandidate[] {
  const out: FriendCandidate[] = []
  for (const a of present) for (const mode of MODES) {
    const c = fn(a, mode)
    for (const x of Array.isArray(c) ? c : c ? [c] : []) out.push({ ...x, group: String(a) })
  }
  return out
}

export const FRIEND_KINDS: FriendKind[] = [
  {
    // Ловушка (бывший mode_trap): мейн другого режима, если он здесь не лидер, — на месте случайного соперника.
    // Сколько у неё игр в этом режиме, не важно (бывает и 0): она неправильный ответ, а контраст — и есть вопрос.
    id: 'hero_main', kinds: ['mc'], templates: 14,
    candidates: (g, present) => perPerson(present, (a, mode) => {
      // меньше 4 героев от MIN_HERO_GAMES игр — у человека нет «мейна» в этом срезе (аноним с малым покрытием)
      if (g.heroes(a, mode).filter(([, games]) => games >= MIN_HERO_GAMES).length < 4) return null
      return {
        card: `fr:hero_main:${a}:${mode}`,
        build: () => {
          const key = `hero_main:${a}:${mode}`
          const used = g.usedOf(key)
          const games = new Map(g.heroes(a, mode).map(([h, n]) => [h, n]))
          const hs: Pick[] = [...games].filter(([h, n]) => n >= MIN_HERO_GAMES && !used.has(h))
            .sort((x, y) => y[1] - x[1]).slice(0, TOP_POOL)
          const pick = g.leaderSet(hs, gapCount)
          if (!pick) return null
          const trap = g.heroes(a, other(mode)).sort((x, y) => y[1] - x[1])[0]?.[0]
          const gTrap = trap === undefined ? 0 : games.get(trap) ?? 0
          const trapOk = trap !== undefined && trap !== pick[0][0] && !used.has(trap) && gapCount(pick[0][1], gTrap)
          if (trapOk && !pick.some(([h]) => h === trap)) pick[3] = [trap, gTrap]
          const q = g.mc(`fr:hero_main:${a}:${mode}`, key, a,
            `На каком из героев у ${g.whose(a)} больше всего игр ${g.where(a, mode)}?`, pick, h => g.hero(h), gamesNote)
          q.comment = (trapOk ? `${g.hero(trap)} — мейн ${g.whose(a)} ${g.where(a, other(mode))}, а не ${g.where(a, mode)}. ` : '')
            + g.window(a, mode)
          return q
        },
      }
    }),
  },
  {
    id: 'hero_wr', kinds: ['mc'], templates: 28,
    candidates: (g, present) => perPerson(present, (a, mode) => (['best', 'worst'] as const).map(side => ({
      card: `fr:hero_wr:${a}:${mode}:${side}`,
      build: () => {
        const key = `hero_wr:${a}:${mode}`
        const sign = side === 'best' ? 1 : -1
        const stats = new Map(g.heroes(a, mode).filter(([h, games]) => games >= MIN_WR_GAMES && !g.usedOf(key).has(h))
          .map(([h, games]) => [h, games]))
        const hs: Pick[] = g.heroes(a, mode).filter(([h]) => stats.has(h))
          .map(([h, games, wins]): Pick => [h, wins / games]).sort((x, y) => sign * (y[1] - x[1]))
        // лидер — от MIN_WR_LEAD_GAMES игр; более редкие герои «лучше» лидера в варианты не попадают
        const pick = g.leaderSet(hs, (l, o) => sign * (l - o) >= MIN_WR_GAP, ([h]) => stats.get(h)! >= MIN_WR_LEAD_GAMES)
        if (!pick) return null
        const [lead, wr] = pick[0]
        const q = g.mc(`fr:hero_wr:${a}:${mode}:${side}`, key, a,
          `На ком у ${g.whose(a)} ${side === 'best' ? 'лучший' : 'худший'} винрейт ${g.where(a, mode)}?`,
          pick, h => g.hero(h), pct)
        q.comment = `${g.hero(lead)} — ${pct(wr)} за ${plural(stats.get(lead)!, 'игру', 'игры', 'игр')}; `
          + `в вариантах — герои от ${MIN_WR_GAMES} игр. ${g.window(a, mode)}`
        return q
      },
    }))),
  },
  {
    id: 'self_wr', kinds: ['mc'], templates: 0,
    candidates: (g, present) => perPerson(present, (a, mode) => g.topHeroes(a, mode, MIN_SELF_WR_GAMES)
      .map(([h, games, wins]) => ({
        card: `fr:self_wr:${a}:${mode}:${h}`,
        build: () => {
          const answer = Math.round(100 * wins / games)
          const values = wrOptions(answer, selfWrStep(games), g.rng)
          return {
            id: `fr:self_wr:${a}:${mode}:${h}`, mode: 'all', topic: 'Друзья', displayTopic: g.who(a),
            text: `Какой винрейт у ${g.whose(a)} на ${g.hero(h)} ${g.where(a, mode)}?`,
            options: g.shuffle(values.map(v => `${v}%`)), answer: `${answer}%`,
            comment: `${plural(games, 'игра', 'игры', 'игр')}, ${plural(wins, 'победа', 'победы', 'побед')}. `
              + g.window(a, mode),
          }
        },
      }))),
  },
  {
    id: 'hero_games', kinds: ['closest'], templates: 0,
    candidates: (g, present) => perPerson(present, (a, mode) => g.topHeroes(a, mode, MIN_HERO_GAMES)
      .map(([h, games]) => ({
        card: `fr:hero_games:${a}:${mode}:${h}`,
        build: () => g.closest(`fr:hero_games:${a}:${mode}:${h}`, g.who(a),
          `Сколько игр у ${g.whose(a)} на ${g.hero(h)} ${g.where(a, mode)}?`, games, g.window(a, mode)),
      }))),
  },
  {
    id: 'pair_games', kinds: ['closest'], templates: 0,
    candidates: (g, present) => {
      const out: FriendCandidate[] = []
      for (const mode of MODES) for (let i = 0; i < present.length; i++) for (let j = i + 1; j < present.length; j++) {
        const [a, b] = [present[i], present[j]].sort((x, y) => x - y)
        const n = g.pair(a, b, mode)
        if (!g.pairOk(a, b) || n < MIN_PAIR_GAMES) continue
        const from = g.pairSince(a, b, mode)
        out.push({
          card: `fr:pair_games:${a}-${b}:${mode}`, group: `${a}-${b}`,
          build: () => g.closest(`fr:pair_games:${a}-${b}:${mode}`, `${g.who(a)} и ${g.who(b)}`,
            `Сколько игр ${g.who(a)} и ${g.who(b)} сыграли вместе ${MODE_TEXT[mode]}?`, n,
            `В одной команде${from ? `, ${from}` : ''}.`),
        })
      }
      return out
    },
  },
  {
    id: 'pair_top', kinds: ['mc'], templates: 8,
    candidates: (g, present) => perPerson(present, (a, mode) => {
      if (mode === 'ranked' && a !== RANKED_PAIR_TOP_ONLY) return null
      return {
        card: `fr:pair_top:${a}:${mode}`,
        build: () => {
          const key = `pair_top:${a}:${mode}`
          const mates: Pick[] = g.people().filter(b => b !== a && !g.usedOf(key).has(b) && g.pairOk(a, b))
            .map((b): Pick => [b, g.pair(a, b, mode)]).sort((x, y) => y[1] - x[1])
          const pick = g.leaderSet(mates, gapCount)
          if (!pick) return null
          const q = g.mc(`fr:pair_top:${a}:${mode}`, key, a,
            `С кем у ${g.whose(a)} больше всего общих игр ${MODE_TEXT[mode]}?`, pick, b => g.who(b), gamesNote)
          // пары считаются по историям открытых профилей (аноним + аноним в варианты не попадает)
          q.comment = g.isOpen(a) ? `В одной команде. ${g.window(a, mode)}` : 'В одной команде, по историям открытых профилей.'
          return q
        },
      }
    }),
  },
]
