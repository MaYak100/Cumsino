// client/src/dev/labState.ts
// Состояние стора (gameStore) для лаборатории: настоящий вопрос с сервера + режим + стадия раунда → ровно то, что
// клиент получил бы по сокету (game_state, round_results). Игроки, ставки и ответы соперников — правдоподобные
// заглушки; они детерминированы по id вопроса, чтобы при переключении стадий не прыгали.
import type { GameState, GameMode, Player, Question, RoundResult } from '@cumsino/shared'
import { decomposeToChips, CLOSEST_WINNER_BONUS, CLOSEST_EXACT_BONUS, GLADIATOR_BONUS, PHASE_DURATIONS, roundTimings } from '@cumsino/shared'
import { useGameStore } from '../store/gameStore'

type GameStoreState = ReturnType<typeof useGameStore.getState>
export type StoreState = Partial<GameStoreState>

/** all, kerri глазами толпы, kerri глазами самого керри, «кто ближе» */
export type LabMode = 'all' | 'kerri-crowd' | 'kerri-gladiator' | 'closest'
export type Stage = 'announce' | 'betting' | 'question' | 'answer' | 'results'

export const LAB_MODES: Array<{ id: LabMode; label: string }> = [
  { id: 'all', label: 'Для всех' },
  { id: 'kerri-crowd', label: 'Керри: толпа' },
  { id: 'kerri-gladiator', label: 'Керри: я керри' },
  { id: 'closest', label: 'Кто ближе' },
]

export const STAGES: Array<{ id: Stage; label: string; key: string }> = [
  { id: 'announce', label: 'Анонс', key: '1' },
  { id: 'betting', label: 'Ставки', key: '2' },
  { id: 'question', label: 'Вопрос', key: '3' },
  { id: 'answer', label: 'Ответ', key: '4' },
  { id: 'results', label: 'Итоги', key: '5' },
]

export const gameModeOf = (m: LabMode): GameMode => (m === 'closest' ? 'closest' : m === 'all' ? 'all' : 'kerri')

/** «Кто ближе» в игре идёт без ставок (ANNOUNCE → QUESTION) */
export const stageAllowed = (m: LabMode, s: Stage) => !(m === 'closest' && s === 'betting')

export const MY_ID = 'dev-1'
const KERRI_ID = 'dev-2'

export const PLAYER_POOL: Player[] = ['Ты', 'Артём', 'Света', 'Никита', 'Даша', 'Костя', 'Лена', 'Паша', 'Маша', 'Женя']
  .map((name, i) => ({ id: `dev-${i + 1}`, name, chips: 500, currentBet: 0, hasAnswered: false }))

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** mulberry32 — повторяемые «случайные» соперники для одного вопроса */
function seeded(seed: string): () => number {
  let a = hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Без ответа, числа, комментария и подписей — как currentQuestion в game_state (GameRoom.getPublicState). */
export function publicQuestion(q: Question): GameState['currentQuestion'] {
  const { answer: _a, numericAnswer: _n, comment: _c, optionNotes: _on, ...pub } = q
  return pub
}

const correctOf = (q: Question): string | number | null => q.answer ?? q.numericAnswer ?? null

/** Правдоподобная догадка соперника в «кто ближе»: ±40% от ответа, округлено «по-человечески». */
function guessNumber(answer: number, rnd: () => number): number {
  const v = answer * (0.6 + rnd() * 0.8)
  if (Math.abs(answer) < 10) return Math.round(v * 10) / 10
  const mag = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(answer))) - 1)
  return Math.round(v / mag) * mag
}

export interface LabInput {
  q: Question
  mode: LabMode
  stage: Stage
  count: number
  /** account id опознанных людей из компании — раздаются первым игрокам (как «кто ты» в лобби) */
  friends: number[]
  /** что ответил «я» на экране вопроса (кликом по варианту или числом) */
  myAnswer?: string | number
}

export function labState({ q, mode, stage, count, friends, myAnswer }: LabInput): StoreState {
  const rnd = seeded(`${q.id}|${q.text}|${count}`)
  const gm = gameModeOf(mode)
  const kerri = gm === 'kerri'
  const gladiatorId = kerri ? (mode === 'kerri-gladiator' ? MY_ID : KERRI_ID) : undefined
  const options = q.options ?? []
  const correct = correctOf(q)
  const wrong = options.filter(o => o !== q.answer)

  // ставки, исходы, ответы — один раз, дальше стадия решает, что из этого видно
  const players: Player[] = PLAYER_POOL.slice(0, count).map((p, i) => {
    const me = p.id === MY_ID
    const isKerri = p.id === gladiatorId
    const chips = 250 + Math.floor(rnd() * 60) * 10
    const bet = isKerri || gm === 'closest' ? 0 : [50, 100, 150, 200][Math.floor(rnd() * 4)]
    // толпа керри ставит на вариант, который выберет керри: чаще на верный
    const betOption = kerri && !isKerri && options.length
      ? (rnd() < 0.55 ? Math.max(0, options.indexOf(q.answer ?? '')) : Math.floor(rnd() * options.length))
      : undefined
    let answer: string | number | undefined
    if (gm === 'closest') answer = me && myAnswer !== undefined ? myAnswer : guessNumber(q.numericAnswer ?? 0, rnd)
    else if (!kerri || isKerri) {
      answer = me && myAnswer !== undefined ? myAnswer
        : rnd() < 0.55 || !wrong.length ? q.answer : wrong[Math.floor(rnd() * wrong.length)]
    }
    return {
      ...p, chips, currentBet: bet, betOption, betChips: bet ? decomposeBet(bet) : undefined,
      answer, hasAnswered: false, friendId: friends[i],
    }
  })

  const phase = stage === 'announce' ? 'ANNOUNCE' : stage === 'betting' ? 'BETTING'
    : stage === 'results' ? 'REVEAL' : 'QUESTION'
  const revealed = stage === 'answer' || stage === 'results'

  // ставки видны с BETTING: соперники уже поставили, «я» ставлю сам на столе
  const shown = players.map(p => {
    const me = p.id === MY_ID
    if (stage === 'announce') return { ...p, currentBet: 0, betOption: undefined, betChips: undefined, answer: undefined }
    if (stage === 'betting') {
      return me ? { ...p, currentBet: 0, betOption: undefined, betChips: undefined, answer: undefined } : { ...p, answer: undefined }
    }
    return { ...p, answer: revealed ? p.answer : undefined, hasAnswered: revealed && p.answer !== undefined }
  })

  // кто «уже ответил» на экране вопроса: в kerri отвечает только керри
  const answerers = shown.filter(p => p.id !== MY_ID && (kerri ? p.id === gladiatorId : true))
  const answeredIds = new Set<string>(
    revealed ? shown.filter(p => players.find(x => x.id === p.id)!.answer !== undefined).map(p => p.id)
      : stage === 'question' ? answerers.filter((_, i) => i % 2 === 0 && !(kerri && mode === 'kerri-crowd')).map(p => p.id)
        : [],
  )
  if (myAnswer !== undefined && stage === 'question') answeredIds.add(MY_ID)

  const results = stage === 'results' ? roundResults(gm, q, players, gladiatorId) : []
  const finalPlayers = stage === 'results'
    ? shown.map(p => ({ ...p, chips: Math.max(0, p.chips + (results.find(r => r.playerId === p.id)?.delta ?? 0)) }))
    : shown

  // как сервер: «для всех» до вопроса — без вариантов и единицы (ставка на вопрос — текст виден, лаборатория — с ней)
  const preQuestion = gm === 'all' && (phase === 'ANNOUNCE' || phase === 'BETTING')
  const timings = roundTimings(gm, true)
  const gameState: GameState = {
    id: 'lab',
    phase,
    roundIndex: 3,
    mode: gm,
    currentQuestion: publicQuestion(preQuestion ? { ...q, options: undefined, unit: undefined } : q),
    jackpot: true,
    questionBet: true,
    jackpotBank: 0,
    // керри выбирают на переходе ANNOUNCE → BETTING
    gladiatorId: stage === 'announce' ? undefined : gladiatorId,
    // толпа видит ответ керри в BETTING и QUESTION (GameRoom.getStateForPlayer)
    gladiatorAnswer: mode === 'kerri-crowd' && (phase === 'BETTING' || phase === 'QUESTION') ? q.answer : undefined,
    hostId: MY_ID,
    players: finalPlayers,
    phaseTimeLeft: phase === 'QUESTION' && revealed ? 0
      : phase === 'BETTING' ? timings.betting : phase === 'QUESTION' ? timings.question : PHASE_DURATIONS[phase] ?? 30,
    friendRoster: [],
  }

  return {
    myId: MY_ID,
    gameState,
    isLateJoiner: false,
    winner: null,
    answeredIds,
    gladiatorHoverIndex: null,
    stagedBets: {},
    stagedOptions: {},
    // round_results приходит в конце QUESTION и живёт до следующего ANNOUNCE
    roundResults: results,
    roundCorrectAnswer: revealed ? correct : null,
    roundComment: revealed ? q.comment ?? null : null,
    roundOptionNotes: revealed ? q.optionNotes ?? null : null,
  }
}

function decomposeBet(amount: number): number[] {
  const b = decomposeToChips(amount)
  return ([500, 100, 50, 20, 10] as const).flatMap(d => Array<number>(b[d]).fill(d))
}

/** Итоги раунда по правилам GameRoom.calculateResults (без молнии, серий и предметов). */
function roundResults(gm: GameMode, q: Question, players: Player[], gladiatorId?: string): RoundResult[] {
  const row = (playerId: string, delta: number, sources: RoundResult['sources']): RoundResult =>
    ({ playerId, delta, chipBreakdown: decomposeToChips(Math.abs(delta)), sources })

  if (gm === 'closest') {
    const target = q.numericAnswer ?? 0
    const diffs = players.map(p => ({ id: p.id, diff: Math.abs(Number(p.answer) - target), exact: p.answer === target }))
    const min = Math.min(...diffs.map(d => d.diff))
    const winners = diffs.filter(d => d.diff === min)
    const exact = winners.every(w => w.exact)
    const each = Math.floor((CLOSEST_WINNER_BONUS + (exact ? CLOSEST_EXACT_BONUS : 0)) / winners.length / 10) * 10
    const base = Math.floor(CLOSEST_WINNER_BONUS / winners.length / 10) * 10
    return players.map(p => !winners.some(w => w.id === p.id) ? row(p.id, 0, [])
      : row(p.id, each, exact
        ? [{ label: 'Ближайший ответ', delta: base }, { label: 'Угадал точно', delta: each - base }]
        : [{ label: 'Ближайший ответ', delta: each }]))
  }

  const pool = (win: Player[], lose: Player[]) => {
    const deltas = new Map<string, number>()
    const total = lose.reduce((s, p) => s + p.currentBet, 0)
    const stakes = win.reduce((s, p) => s + p.currentBet, 0)
    for (const p of lose) deltas.set(p.id, -p.currentBet)
    for (const p of win) deltas.set(p.id, stakes ? Math.floor(total * p.currentBet / stakes / 10) * 10 : 0)
    return deltas
  }

  if (gm === 'kerri') {
    const kerri = players.find(p => p.id === gladiatorId)
    const ok = kerri?.answer === q.answer
    // выигрывают поставившие на вариант, который выбрал керри
    const pick = kerri?.answer !== undefined ? (q.options ?? []).indexOf(String(kerri.answer)) : -1
    const crowd = players.filter(p => p.id !== gladiatorId && p.currentBet > 0)
    const win = crowd.filter(p => pick >= 0 && p.betOption === pick)
    const lose = crowd.filter(p => !(pick >= 0 && p.betOption === pick))
    const deltas = win.length && lose.length ? pool(win, lose) : new Map<string, number>()
    return players.map(p => {
      if (p.id === gladiatorId) {
        const d = ok ? GLADIATOR_BONUS : 0
        return row(p.id, d, [{ label: ok ? 'Закеррил' : 'Не закеррил', delta: d }])
      }
      const d = deltas.get(p.id) ?? 0
      const label = pick < 0 ? 'Керри не ответил' : !lose.length ? 'Все угадали выбор керри'
        : !win.length ? 'Никто не угадал выбор керри' : win.includes(p) ? 'Угадал выбор керри' : 'Не угадал выбор керри'
      return row(p.id, d, p.currentBet ? [{ label, delta: d }] : [])
    })
  }

  const win = players.filter(p => p.answer === q.answer && p.currentBet > 0)
  const lose = players.filter(p => p.answer !== q.answer && p.currentBet > 0)
  const deltas = win.length && lose.length ? pool(win, lose) : new Map<string, number>()
  return players.map(p => {
    const d = deltas.get(p.id) ?? 0
    const label = !lose.length ? 'Все угадали' : !win.length ? 'Все ошиблись'
      : win.includes(p) ? 'Ответил верно' : 'Ответил неверно'
    return row(p.id, d, p.currentBet ? [{ label, delta: d }] : [])
  })
}
