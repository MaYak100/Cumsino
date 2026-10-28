// server/src/game/questions/friends.ts
// Вопросы про друзей (перенос прототипа scripts/friends_questions.py, правила — docs/questions/stratz-research.md,
// «Друзья»). Метрики — scripts/data/friends/metrics.json. Вопросы только про тех, кто опознан в лобби
// («кто ты» при входе); категория получает вес, когда опознаны ≥ 2 человека.
//
// Срезы: рейтинг (lobbyType RANKED) и Турбо, не смешиваются. Открытый профиль — вся история («в рейтинге»),
// аноним — игры в пати с кем-то из открытых («в пати рейтинге»). Пары аноним + аноним не спрашиваем.
// Отрыв лидера: счётчики ≥ 15%, винрейты ≥ 10 п.п. (от 30 игр). Герой (человек в «главном напарнике»),
// попавший в варианты, до конца игры в этом типе вопроса про этого человека не появляется.
import type { Question } from '@cumsino/shared'
import { makeStepOptions } from './stepOptions'

type Mode = 'ranked' | 'turbo'
const MODES: Mode[] = ['ranked', 'turbo']
const MODE_TEXT: Record<Mode, string> = { ranked: 'в рейтинге', turbo: 'в Турбо' }
const PARTY_TEXT: Record<Mode, string> = { ranked: 'в пати рейтинге', turbo: 'в пати Турбо' }
const MIN_COUNT_GAP = 0.15
const MIN_WR_GAP = 0.10
const MIN_WR_GAMES = 30
const SELF_WR_STEP = 2
const MIN_HERO_GAMES = 20
const MIN_PAIR_GAMES = 50
const TOP_POOL = 8
/** В рейтинге компания собрана вокруг него: «главный напарник» про других почти всегда он — спрашиваем только про него. */
const RANKED_PAIR_TOP_ONLY = 1101588971

export const MIN_IDENTIFIED_FRIENDS = 2

export interface FriendsMetrics {
  people: Record<string, { name: string; open: boolean }>
  heroes: Record<Mode, Record<string, { own: Record<string, [number, number]>; company: Record<string, [number, number]> }>>
  pairs: Record<Mode, Record<string, number>>
}

export interface FriendCandidate { card: string; build: () => Question | null }

export interface FriendKind {
  id: string
  kinds: Array<'mc' | 'closest'>
  templates: number
  candidates: (g: FriendsGen, present: number[]) => FriendCandidate[]
}

type Pick = [key: number, value: number]

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

  pair(a: number, b: number, mode: Mode): number {
    const [x, y] = a < b ? [a, b] : [b, a]
    return this.m.pairs[mode]?.[`${x}-${y}`] ?? 0
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

  /** Лидер (cands по убыванию «лучшести») отрывается от трёх остальных; лидер — первый подходящий. */
  leaderSet(cands: Pick[], gapOk: (lead: number, other: number) => boolean): Pick[] | null {
    for (let i = 0; i < cands.length; i++) {
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

  closest(card: string, subject: string, text: string, answer: number): Question {
    return { id: card, mode: 'closest', topic: 'Друзья', displayTopic: subject, text, numericAnswer: answer }
  }
}

/** 1 игра, 2 игры, 5 игр */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100
  const w = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
  return `${n} ${w}`
}

const gapCount = (l: number, o: number) => l >= o * (1 + MIN_COUNT_GAP)
const pct = (v: number) => `${Math.round(100 * v)}%`

function perPerson(present: number[], fn: (a: number, mode: Mode) => FriendCandidate | FriendCandidate[] | null): FriendCandidate[] {
  const out: FriendCandidate[] = []
  for (const a of present) for (const mode of MODES) {
    const c = fn(a, mode)
    if (Array.isArray(c)) out.push(...c)
    else if (c) out.push(c)
  }
  return out
}

export const FRIEND_KINDS: FriendKind[] = [
  {
    id: 'hero_main', kinds: ['mc'], templates: 14,
    candidates: (g, present) => perPerson(present, (a, mode) => ({
      card: `fr:hero_main:${a}:${mode}`,
      build: () => {
        const key = `hero_main:${a}:${mode}`
        const hs: Pick[] = g.heroes(a, mode).filter(([h]) => !g.usedOf(key).has(h))
          .sort((x, y) => y[1] - x[1]).slice(0, TOP_POOL).map(([h, games]) => [h, games])
        const pick = g.leaderSet(hs, gapCount)
        return pick && g.mc(`fr:hero_main:${a}:${mode}`, key, a,
          `На каком из героев у ${g.who(a)} больше всего игр ${g.where(a, mode)}?`, pick, h => g.hero(h))
      },
    })),
  },
  {
    id: 'mode_trap', kinds: ['mc'], templates: 14,
    candidates: (g, present) => perPerson(present, (a, mode) => ({
      card: `fr:mode_trap:${a}:${mode}`,
      build: () => {
        const key = `mode_trap:${a}`
        const used = g.usedOf(key)
        const other: Mode = mode === 'ranked' ? 'turbo' : 'ranked'
        const games = new Map(g.heroes(a, mode).filter(([h]) => !used.has(h)).map(([h, n]) => [h, n]))
        const top = [...games].sort((x, y) => y[1] - x[1]).slice(0, TOP_POOL)
        const trap = g.heroes(a, other).filter(([h]) => !used.has(h)).sort((x, y) => y[1] - x[1])[0]?.[0]
        if (!top.length || trap === undefined) return null
        const lead = top[0]
        const gTrap = games.get(trap) ?? 0
        if (trap === lead[0] || !gapCount(lead[1], gTrap)) return null
        const rest = top.slice(1).filter(x => x[0] !== trap && gapCount(lead[1], x[1]))
        if (rest.length < 2) return null
        const picked: Pick[] = [lead, [trap, gTrap], ...g.shuffle(rest).slice(0, 2)]
        const q = g.mc(`fr:mode_trap:${a}:${mode}`, key, a,
          `На каком из героев у ${g.who(a)} больше всего игр ${g.where(a, mode)}?`, picked, h => g.hero(h))
        q.comment = `${g.hero(trap)} — мейн ${g.who(a)} ${g.where(a, other)}, не ${g.where(a, mode)}.`
        return q
      },
    })),
  },
  {
    id: 'hero_wr', kinds: ['mc'], templates: 28,
    candidates: (g, present) => perPerson(present, (a, mode) => (['best', 'worst'] as const).map(side => ({
      card: `fr:hero_wr:${a}:${mode}:${side}`,
      build: () => {
        const key = `hero_wr:${a}:${mode}`
        const sign = side === 'best' ? 1 : -1
        const hs: Pick[] = g.heroes(a, mode).filter(([h, games]) => games >= MIN_WR_GAMES && !g.usedOf(key).has(h))
          .map(([h, games, wins]): Pick => [h, wins / games]).sort((x, y) => sign * (y[1] - x[1]))
        const pick = g.leaderSet(hs, (l, o) => sign * (l - o) >= MIN_WR_GAP)
        return pick && g.mc(`fr:hero_wr:${a}:${mode}:${side}`, key, a,
          `На ком из героев у ${g.who(a)} ${side === 'best' ? 'лучший' : 'худший'} винрейт ${g.where(a, mode)}?`,
          pick, h => g.hero(h), pct)
      },
    }))),
  },
  {
    id: 'self_wr', kinds: ['mc'], templates: 0,
    candidates: (g, present) => perPerson(present, (a, mode) => g.heroes(a, mode)
      .filter(([, games]) => games >= MIN_WR_GAMES)
      .map(([h, games, wins]) => ({
        card: `fr:self_wr:${a}:${mode}:${h}`,
        build: () => {
          const answer = Math.round(100 * wins / games)
          const { values } = makeStepOptions(answer, SELF_WR_STEP, g.rng)
          return {
            id: `fr:self_wr:${a}:${mode}:${h}`, mode: 'all', topic: 'Друзья', displayTopic: g.who(a),
            text: `Какой винрейт у ${g.who(a)} на ${g.hero(h)} ${g.where(a, mode)}?`,
            options: g.shuffle(values.map(v => `${v}%`)), answer: `${answer}%`,
            comment: `${plural(games, 'игра', 'игры', 'игр')}, ${plural(wins, 'победа', 'победы', 'побед')}.`,
          }
        },
      }))),
  },
  {
    id: 'hero_games', kinds: ['closest'], templates: 0,
    candidates: (g, present) => perPerson(present, (a, mode) => g.heroes(a, mode)
      .filter(([, games]) => games >= MIN_HERO_GAMES)
      .map(([h, games]) => ({
        card: `fr:hero_games:${a}:${mode}:${h}`,
        build: () => g.closest(`fr:hero_games:${a}:${mode}:${h}`, g.who(a),
          `Сколько игр ${g.who(a)} сыграл на ${g.hero(h)} ${g.where(a, mode)}?`, games),
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
        out.push({
          card: `fr:pair_games:${a}-${b}:${mode}`,
          build: () => g.closest(`fr:pair_games:${a}-${b}:${mode}`, `${g.who(a)} и ${g.who(b)}`,
            `Сколько игр ${g.who(a)} и ${g.who(b)} сыграли вместе ${MODE_TEXT[mode]}?`, n),
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
          return pick && g.mc(`fr:pair_top:${a}:${mode}`, key, a,
            `С кем ${g.who(a)} сыграл больше всего игр ${MODE_TEXT[mode]}?`, pick, b => g.who(b))
        },
      }
    }),
  },
]
