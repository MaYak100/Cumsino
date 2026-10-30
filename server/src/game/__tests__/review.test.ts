// Находки ревью 2026-10-30: утечки (фаза × роль), зрители, лимиты ставок, сброс раунда, инвариант источников,
// победитель, BETTING без ставящих, хекс, падения расчёта / сбора вопроса, пустые раунды.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GameRoom } from '../GameRoom'
import type { Question, GameMode, GameState, RoundResult } from '@cumsino/shared'
import {
  PHASE_DURATIONS, LAST_ANSWER_GRACE_MS, ANSWER_REVEAL_NOTES_MS, WIN_CHIPS, HEX_SECONDS,
  AEGIS_THRESHOLD, AEGIS_RESTORE, itemPrice, STARTING_CHIPS, NEW_MODE_ANNOUNCE_EXTRA,
} from '@cumsino/shared'

// узнаваемые строки: если они встретятся в сообщении до расчёта — утечка
const SECRET_ID = 'stat:secret_sub:SECRETLEADER'
const SECRET_COMMENT = 'SECRETCOMMENT'
const NOTES = ['N1x', 'N2x', 'N3x', 'N4x']
const SECRET_NUM = 98765

const mcQ: Question = {
  id: SECRET_ID, mode: 'all', topic: 'T', text: 'Q?', options: ['A', 'B', 'C', 'D'], answer: 'A',
  comment: SECRET_COMMENT, optionNotes: NOTES,
}
const cnQ: Question = {
  id: SECRET_ID, mode: 'closest', topic: 'T', text: 'Сколько?', numericAnswer: SECRET_NUM, unit: '%',
  comment: SECRET_COMMENT,
}

type Entry = { event: string; data: any; settled: boolean }
const ANNOUNCE_FIRST = PHASE_DURATIONS.ANNOUNCE! + NEW_MODE_ANNOUNCE_EXTRA

/** Комната с почтой по игрокам: broadcast — всем в комнате, broadcastExcept — всем кроме, sendToPlayer — одному.
 *  settled — сообщение ушло после расчёта раунда (revealing / REVEAL). */
function makeRoom(n = 3, q: (mode: GameMode) => Question = m => (m === 'closest' ? cnQ : mcQ)) {
  const room = new GameRoom('r1', mode => ({ ...q(mode), mode }))
  const r = room as any
  const inbox = new Map<string, Entry[]>()
  const push = (id: string, event: string, data: any) => {
    if (!inbox.has(id)) inbox.set(id, [])
    inbox.get(id)!.push({ event, data: JSON.parse(JSON.stringify(data)), settled: r.revealing || r.phase === 'REVEAL' })
  }
  room.on('broadcast', ({ event, data }) => { for (const id of r.players.keys()) push(id, event, data) })
  room.on('broadcastExcept', ({ excludeId, event, data }) => {
    for (const id of r.players.keys()) if (id !== excludeId) push(id, event, data)
  })
  room.on('sendToPlayer', ({ playerId, event, data }) => push(playerId, event, data))
  for (let i = 1; i <= n; i++) room.addPlayer(`p${i}`, `P${i}`)
  const p = (id: string) => r.players.get(id)
  const mail = (id: string) => inbox.get(id) ?? []
  const states = (id: string): GameState[] => mail(id).filter(e => e.event === 'game_state').map(e => e.data)
  const results = (): RoundResult[] => mail('p1').filter(e => e.event === 'round_results').at(-1)?.data.results
  /** начать с режима mode: цикл all → kerri → closest */
  const startIn = (mode: GameMode) => {
    r.selector.index = { all: 0, kerri: 1, closest: 2 }[mode]
    room.start('p1')
  }
  return { room, r, p, inbox, mail, states, results, startIn }
}

const before = (es: Entry[]) => es.filter(e => !e.settled)
const leaks = (es: Entry[], needle: string | number) => es.some(e => JSON.stringify(e.data).includes(String(needle)))

describe('ревью 2026-10-30', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)   // керри — первый участник (p1)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── матрица утечек: фаза × роль ──
  describe('утечки до расчёта раунда', () => {
    function playKerri() {
      const t = makeRoom(3)
      t.startIn('kerri')
      t.room.addPlayer('s1', 'Зритель')               // вошёл в анонсе — зритель
      vi.advanceTimersByTime(ANNOUNCE_FIRST * 1000)   // → BETTING, керри p1
      expect(t.r.phase).toBe('BETTING')
      expect(t.r.gladiatorId).toBe('p1')
      t.room.placeBet('p2', 30, 'lose', [10, 20, 50], { optionIndex: 2, amount: 50 })
      t.room.placeBet('p3', 30, 'win')
      expect(t.r.phase).toBe('QUESTION')
      t.room.submitAnswer('p1', 'C')
      vi.advanceTimersByTime(LAST_ANSWER_GRACE_MS)
      return t
    }

    it('керри: id, comment, optionNotes — ни одной роли до round_results; gladiatorAnswer — только толпе', () => {
      const t = playKerri()
      for (const id of ['p1', 'p2', 'p3', 's1']) {
        const early = before(t.mail(id))
        expect(early.length).toBeGreaterThan(0)
        expect(leaks(early, SECRET_ID)).toBe(false)
        expect(leaks(early, 'SECRETLEADER')).toBe(false)
        expect(leaks(early, SECRET_COMMENT)).toBe(false)
        expect(leaks(early, 'N3x')).toBe(false)
        expect(early.some(e => e.event === 'round_results')).toBe(false)
      }
      const ga = (id: string) => t.states(id).some(s => s.gladiatorAnswer !== undefined)
      expect(ga('p2')).toBe(true)
      expect(ga('p3')).toBe(true)
      expect(ga('p1')).toBe(false)   // керри
      expect(ga('s1')).toBe(false)   // зритель
    })

    it('керри: bank_bet_updated — только толпе (не керри, не зрителю)', () => {
      const t = playKerri()
      const got = (id: string) => t.mail(id).some(e => e.event === 'bank_bet_updated')
      expect(got('p2')).toBe(true)
      expect(got('p3')).toBe(true)
      expect(got('p1')).toBe(false)
      expect(got('s1')).toBe(false)
      // и ни в одном game_state банк-ставки нет
      for (const id of ['p1', 's1']) expect(leaks(t.mail(id), 'bankBet')).toBe(false)
    })

    it('после расчёта: round_results с настоящим id и ключом раунда = currentQuestion.id', () => {
      const t = playKerri()
      const key = t.states('p2').find(s => s.currentQuestion)!.currentQuestion!.id
      expect(key).not.toBe(SECRET_ID)
      expect(key).toMatch(/^r\d+-/)
      const rr = t.mail('p1').find(e => e.event === 'round_results')!.data
      expect(rr).toMatchObject({ questionId: SECRET_ID, questionKey: key, comment: SECRET_COMMENT, optionNotes: NOTES })
    })

    it('«для всех»: чужой ответ, id, notes не видны до расчёта; свой hasAnswered виден', () => {
      const t = makeRoom(3)
      t.startIn('all')
      vi.advanceTimersByTime(ANNOUNCE_FIRST * 1000)
      for (const id of ['p1', 'p2', 'p3']) t.room.placeBet(id, 30)
      expect(t.r.phase).toBe('QUESTION')
      t.room.submitAnswer('p1', 'B')
      t.room.submitAnswer('p2', 'A')
      for (const id of ['p1', 'p2', 'p3']) {
        const early = before(t.mail(id))
        expect(leaks(early, SECRET_ID)).toBe(false)
        expect(leaks(early, 'N1x')).toBe(false)
        expect(early.some(e => e.event === 'game_state' && e.data.players.some((x: any) => 'answer' in x))).toBe(false)
        expect(t.states(id).some(s => s.gladiatorAnswer !== undefined)).toBe(false)
      }
      t.room.submitAnswer('p3', 'C')
      vi.advanceTimersByTime(LAST_ANSWER_GRACE_MS)
      // после расчёта ответы видны
      expect(t.states('p3').at(-1)!.players.find(x => x.id === 'p1')!.answer).toBe('B')
    })

    it('«кто ближе»: число не уходит до расчёта, единица — в currentQuestion', () => {
      const t = makeRoom(2)
      t.startIn('closest')
      vi.advanceTimersByTime(ANNOUNCE_FIRST * 1000)
      expect(t.r.phase).toBe('QUESTION')
      expect(t.states('p1').at(-1)!.currentQuestion!.unit).toBe('%')
      t.room.submitAnswer('p1', 12345)
      for (const id of ['p1', 'p2']) {
        expect(leaks(before(t.mail(id)), SECRET_NUM)).toBe(false)
        expect(leaks(before(t.mail(id)), SECRET_COMMENT)).toBe(false)
      }
      expect(leaks(before(t.mail('p2')), 12345)).toBe(false)   // чужое число
      t.room.submitAnswer('p2', 1)
      vi.advanceTimersByTime(LAST_ANSWER_GRACE_MS)
      expect(t.mail('p2').find(e => e.event === 'round_results')!.data.correctNumericAnswer).toBe(SECRET_NUM)
    })

    it('в лавке вопрос скрыт целиком', () => {
      const t = makeRoom(2)
      t.r.closestSeen = true
      t.startIn('all')
      expect(t.r.phase).toBe('SHOP')
      expect(t.states('p1').at(-1)!.currentQuestion).toBeNull()
    })
  })

  // ── оценка по ключу раунда ──
  describe('оценка вопроса', () => {
    it('принимается по настоящему id и по ключу раунда; чужой ключ — мимо', () => {
      const votes: string[] = []
      const room = new GameRoom('r1', { pick: () => mcQ, rate: (_q, v, vote) => { votes.push(`${v.id}:${vote.score}`) } })
      room.addPlayer('p1', 'A')
      room.addPlayer('p2', 'B')
      room.addPlayer('p3', 'C')
      const r = room as any
      r.nextRound()
      const key = room.getPublicState().currentQuestion!.id
      r.phase = 'QUESTION'
      r.advanceFromQuestion()
      room.rateQuestion('p1', key, { score: 2 })
      room.rateQuestion('p2', SECRET_ID, { score: 1 })
      room.rateQuestion('p3', 'r999-zzz', { score: -1 })
      expect(votes).toEqual(['p1:2', 'p2:1'])
    })

    it('report несёт присутствовавших при показе; destroy закрывает показ (settle)', () => {
      const present: string[][] = []
      let settled = 0
      const room = new GameRoom('r1', {
        pick: () => mcQ,
        report: (_q, r) => { present.push(r.present ?? []) },
        settle: () => { settled++ },
      })
      room.addPlayer('p1', 'A')
      room.addPlayer('p2', 'B')
      const r = room as any
      r.nextRound()
      r.phase = 'QUESTION'
      r.advanceFromQuestion()
      room.addPlayer('late', 'L')   // вошёл после показа — голосовать за этот вопрос не сможет
      expect(present).toEqual([['p1', 'p2']])
      room.destroy()
      expect(settled).toBe(1)
    })
  })

  // ── зрители ──
  describe('зритель', () => {
    it('spectator: true в публичном стейте, после nextRound — нет; не получает gladiatorAnswer', () => {
      const t = makeRoom(3)
      t.startIn('kerri')
      t.room.addPlayer('s1', 'S')
      const pub = (id: string) => t.room.getPublicState().players.find(x => x.id === id)!
      expect(pub('s1').spectator).toBe(true)
      expect(pub('p2').spectator).toBeUndefined()
      t.r.onPhaseEnd()   // ANNOUNCE → BETTING
      expect(t.room.getStateForPlayer('s1').gladiatorAnswer).toBeUndefined()
      expect(t.room.getStateForPlayer('p2').gladiatorAnswer).toBe('A')
      t.r.nextRound()
      expect(pub('s1').spectator).toBeUndefined()
    })

    it('остались одни зрители к концу анонса керри — раунд отменяется, а не висит 75 с', () => {
      const t = makeRoom(1)
      t.startIn('kerri')
      t.room.addPlayer('s1', 'S')
      t.p('p1').spectator = true   // как будто единственный участник ушёл и остались вошедшие в анонсе
      t.room.removePlayer('p1')
      expect(t.r.phase).toBe('REVEAL')
      expect(t.r.gladiatorId).toBeUndefined()
      const rr = t.mail('s1').find(e => e.event === 'round_results')!.data
      expect(rr.results.every((x: RoundResult) => x.delta === 0)).toBe(true)
    })

    it('ушёл последний участник посреди вопроса — раунд отменяется, зритель не ждёт', () => {
      const t = makeRoom(1)
      t.startIn('closest')
      t.r.onPhaseEnd()   // → QUESTION
      t.room.addPlayer('s1', 'S')
      t.room.removePlayer('p1')
      expect(t.r.phase).toBe('REVEAL')
    })

    it('ANNOUNCE без участников (все зрители) — отмена', () => {
      const t = makeRoom(2)
      t.startIn('kerri')
      t.p('p1').spectator = true
      t.p('p2').spectator = true
      t.r.onPhaseEnd()
      expect(t.r.phase).toBe('REVEAL')
      expect(t.r.gladiatorId).toBeUndefined()
    })
  })

  // ── BETTING: ждать некого ──
  describe('BETTING без ставящих', () => {
    it('керри один в комнате — сразу вопрос (соло-тест)', () => {
      const t = makeRoom(1)
      t.startIn('kerri')
      t.r.onPhaseEnd()
      expect(t.r.gladiatorId).toBe('p1')
      expect(t.r.phase).toBe('QUESTION')
    })

    it('у толпы нет денег — сразу вопрос', () => {
      const t = makeRoom(3)
      t.startIn('kerri')
      t.p('p2').chips = 5
      t.p('p3').chips = 0
      t.r.onPhaseEnd()
      expect(t.r.phase).toBe('QUESTION')
    })

    it('«для всех» соло — ставку ждём (есть кому ставить)', () => {
      const t = makeRoom(1)
      t.startIn('all')
      t.r.onPhaseEnd()
      expect(t.r.phase).toBe('BETTING')
      t.room.placeBet('p1', t.p('p1').blind)
      expect(t.r.phase).toBe('QUESTION')
    })
  })

  // ── лимиты баланса ──
  describe('лимиты ставок', () => {
    function kerriBetting(n = 4) {
      const t = makeRoom(n)
      t.startIn('kerri')
      t.r.onPhaseEnd()
      return t
    }

    it('«для всех»: больше баланса — нет, ровно баланс — да', () => {
      const t = makeRoom(3)
      t.startIn('all')
      t.r.onPhaseEnd()
      t.room.placeBet('p2', STARTING_CHIPS + 10)
      expect(t.p('p2').currentBet).toBe(0)
      t.room.placeBet('p2', STARTING_CHIPS)
      expect(t.p('p2').currentBet).toBe(STARTING_CHIPS)
    })

    it('керри: банк не влезает с основной — основная принята, банк нет', () => {
      const t = kerriBetting()
      t.room.placeBet('p2', 400, 'win', undefined, { optionIndex: 1, amount: 200 })
      expect(t.p('p2').currentBet).toBe(400)
      expect(t.p('p2').bankBet).toBeUndefined()
    })

    it('керри: основная + банк ровно баланс — принимается', () => {
      const t = kerriBetting()
      t.room.placeBet('p2', 300, 'lose', undefined, { optionIndex: 1, amount: 200 })
      expect(t.p('p2')).toMatchObject({ currentBet: 300, bankBet: { optionIndex: 1, amount: 200 } })
    })

    it('B7: повторное подтверждение проверяется по новой банк-ставке, а не по старой', () => {
      const t = kerriBetting()
      t.room.placeBet('p2', 100, 'win', undefined, { optionIndex: 1, amount: 400 })
      expect(t.p('p2').bankBet).toEqual({ optionIndex: 1, amount: 400 })
      t.room.placeBet('p2', 300, 'win', undefined, { optionIndex: 2, amount: 200 })   // 300 + 200 = 500
      expect(t.p('p2')).toMatchObject({ currentBet: 300, bankBet: { optionIndex: 2, amount: 200 } })
    })

    it('без новой банк-ставки основная + старая банк сверх баланса — отклоняется', () => {
      const t = kerriBetting()
      t.room.placeBet('p2', 100, 'win', undefined, { optionIndex: 1, amount: 400 })
      t.room.placeBet('p2', 200, 'win')
      expect(t.p('p2').currentBet).toBe(100)
    })

    it('зритель не ставит', () => {
      const t = makeRoom(3)
      t.startIn('all')
      t.room.addPlayer('s1', 'S')
      t.r.onPhaseEnd()
      t.room.placeBet('s1', 30)
      expect(t.p('s1').currentBet).toBe(0)
    })
  })

  // ── сброс раунда ──
  it('nextRound сбрасывает раундовое: ставки, банк, блайнд, ответ, предметы раунда, зрителя', () => {
    const t = makeRoom(2)
    const p = t.p('p2')
    Object.assign(p, {
      currentBet: 100, betTarget: 'lose', betChips: [100], bankBet: { optionIndex: 1, amount: 50 }, blind: 30,
      bigBlind: true, answer: 'B', hasAnswered: true, spectator: true, shopReady: true,
    })
    p.items.bkb = true
    p.items.hexed = true
    p.items.removedOptions = [1]
    p.inventory = { gem: 2 }
    p.streak = 3
    t.r.nextRound()
    expect(p).toMatchObject({ currentBet: 0, hasAnswered: false, spectator: false })
    for (const k of ['betTarget', 'betChips', 'bankBet', 'blind', 'bigBlind', 'answer']) expect(p[k]).toBeUndefined()
    expect(p.items).toMatchObject({ bkb: false, hexed: false, removedOptions: [] })
    // запас и серия — не раундовые
    expect(p.inventory).toEqual({ gem: 2 })
    expect(p.streak).toBe(3)
  })

  // ── инвариант источников ──
  describe('сумма источников = delta', () => {
    /** простой детерминированный генератор (Math.random замокан) */
    function prng(seed: number) {
      return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    }
    const pick = <T,>(rnd: () => number, xs: T[]) => xs[Math.floor(rnd() * xs.length)]

    for (const mode of ['all', 'kerri', 'closest'] as GameMode[]) {
      it(`${mode}: 150 случайных раундов с бонусами, BKB и аегисом`, () => {
        const rnd = prng(mode.length * 7919)
        for (let iter = 0; iter < 150; iter++) {
          const n = 1 + Math.floor(rnd() * 5)
          const t = makeRoom(n)
          t.r.currentMode = mode
          t.r.currentQuestion = mode === 'closest' ? { ...cnQ } : { ...mcQ }
          t.r.phase = 'QUESTION'
          if (mode === 'kerri') t.r.gladiatorId = 'p1'
          for (let i = 1; i <= n; i++) {
            const p = t.p(`p${i}`)
            p.chips = pick(rnd, [0, 5, 40, 60, 500, 1500, 2900])
            p.streak = Math.floor(rnd() * 6)
            p.aegis = rnd() < 0.3
            if (rnd() < 0.3) { p.items.bkb = true; p.items.bkbCap = 400 }
            p.items.answerAt = rnd() < 0.5 ? 1000 : 20000
            const isG = mode === 'kerri' && i === 1
            if (mode !== 'closest' && !isG) {
              p.currentBet = Math.min(p.chips, pick(rnd, [0, 10, 50, 200]))
              if (mode === 'kerri') {
                p.betTarget = pick(rnd, ['win', 'lose'])
                if (rnd() < 0.4 && p.chips - p.currentBet >= 20) p.bankBet = { optionIndex: pick(rnd, [1, 2, 3]), amount: 20 }
              }
            }
            if (mode === 'closest') {
              if (rnd() < 0.8) { p.answer = pick(rnd, [SECRET_NUM, SECRET_NUM - 5, SECRET_NUM + 5, 0]); p.hasAnswered = true }
            } else if (mode === 'all' || isG) {
              if (rnd() < 0.8) { p.answer = pick(rnd, ['A', 'B', 'C', 'D']); p.hasAnswered = true }
            }
          }
          const results: RoundResult[] = t.r.calculateResults()
          expect(results.length).toBe(n)
          for (const res of results) {
            const sum = (res.sources ?? []).reduce((s, x) => s + x.delta, 0)
            expect(sum, `${mode} #${iter} ${res.playerId}: ${JSON.stringify(res.sources)}`).toBe(res.delta)
          }
        }
      })
    }
  })

  // ── аегис: граница ровно $50 ──
  describe('аегис: граница AEGIS_THRESHOLD', () => {
    function settle(chipsBefore: number, loss: number) {
      const t = makeRoom(2)
      t.r.currentMode = 'all'
      t.r.currentQuestion = { ...mcQ }
      t.r.phase = 'QUESTION'
      Object.assign(t.p('p1'), { chips: chipsBefore, currentBet: loss, answer: 'B', hasAnswered: true, aegis: true })
      Object.assign(t.p('p2'), { chips: 500, currentBet: loss, answer: 'A', hasAnswered: true })
      t.r.advanceFromQuestion()
      return t.p('p1')
    }

    it(`после раунда ровно $${AEGIS_THRESHOLD} — аегис не срабатывает`, () => {
      const p = settle(AEGIS_THRESHOLD + 100, 100)
      expect(p.chips).toBe(AEGIS_THRESHOLD)
      expect(p.aegis).toBe(true)
    })

    it(`на $10 ниже — срабатывает: обратно до баланса перед раундом (не выше $${AEGIS_RESTORE})`, () => {
      const p = settle(AEGIS_THRESHOLD + 90, 100)
      expect(p.chips).toBe(AEGIS_THRESHOLD + 90)
      expect(p.aegis).toBe(false)
      const rich = settle(600, 600)
      expect(rich.chips).toBe(AEGIS_RESTORE)
      expect(rich.aegis).toBe(false)
    })

    it('купить аегис на последние — можно (порога при покупке нет)', () => {
      const t = makeRoom(1)
      t.r.phase = 'SHOP'
      const price = itemPrice('aegis', 150)
      t.p('p1').chips = AEGIS_THRESHOLD + price - 10
      t.room.buyItem('p1', 'aegis')
      expect(t.p('p1').aegis).toBe(true)
      expect(t.p('p1').chips).toBe(AEGIS_THRESHOLD - 10)
    })
  })

  // ── победитель ──
  describe('победитель', () => {
    it('несколько ≥ 3000 — самый богатый, а не первый вошедший; наружу — публичная проекция', () => {
      const t = makeRoom(3)
      t.p('p1').chips = WIN_CHIPS + 10
      t.p('p2').chips = WIN_CHIPS + 500
      t.p('p2').inventory = { gem: 1 }
      t.p('p2').bankBet = { optionIndex: 1, amount: 10 }
      t.r.phase = 'REVEAL'
      t.r.onPhaseEnd()
      expect(t.r.phase).toBe('GAME_OVER')
      const winner = t.mail('p3').find(e => e.event === 'game_over')!.data.winner
      expect(winner.id).toBe('p2')
      for (const k of ['inventory', 'items', 'bankBet', 'aegisBought', 'seat']) expect(winner).not.toHaveProperty(k)
    })

    it('точная ничья ≥ 3000 — победителя нет, игра идёт ещё раунд; лидер один — победил', () => {
      const t = makeRoom(3)
      t.p('p1').chips = WIN_CHIPS + 200
      t.p('p2').chips = WIN_CHIPS + 200
      t.p('p3').chips = WIN_CHIPS
      expect(t.r.checkWinner()).toBeUndefined()
      t.r.phase = 'REVEAL'
      t.r.onPhaseEnd()
      expect(t.r.phase).not.toBe('GAME_OVER')
      expect(t.r.roundIndex).toBe(1)
      t.p('p2').chips = WIN_CHIPS + 210
      expect(t.r.checkWinner().id).toBe('p2')
    })

    it('ничья ниже лидера не мешает: лидер один ≥ 3000 — победил', () => {
      const t = makeRoom(3)
      t.p('p1').chips = WIN_CHIPS
      t.p('p2').chips = WIN_CHIPS
      t.p('p3').chips = WIN_CHIPS + 10
      expect(t.r.checkWinner().id).toBe('p3')
    })
  })

  // ── хекс ──
  describe('хекс', () => {
    function hexed() {
      const t = makeRoom(2)
      t.p('p2').items.hexed = true
      t.r.currentMode = 'all'
      t.r.currentQuestion = { ...mcQ }
      t.r.schedulePhase('QUESTION', PHASE_DURATIONS.QUESTION!)
      return t
    }

    it('A6: таймер хекса сработал на миг раньше дедлайна по часам — время всё равно вышло, раунд не ждёт 45 с', () => {
      const t = hexed()
      t.room.submitAnswer('p1', 'A')
      t.p('p2').items.hexDeadline += 5   // часы «отстали»: таймер сработает до дедлайна
      vi.advanceTimersByTime(HEX_SECONDS * 1000)
      expect(t.p('p2').items.hexDone).toBe(true)
      t.room.submitAnswer('p2', 'A')
      expect(t.p('p2').hasAnswered).toBe(false)
      vi.advanceTimersByTime(LAST_ANSWER_GRACE_MS)
      expect(t.r.revealing).toBe(true)
    })

    it('C3: время хекса вышло — манта и гем не применяются (до — применяются)', () => {
      const t = hexed()
      t.p('p2').inventory = { manta: 2, gem: 1 }
      t.room.useItem('p2', 'manta')
      expect(t.p('p2').items.removedOptions.length).toBe(1)
      t.r.players.get('p2').items.used.delete('manta')
      vi.advanceTimersByTime(HEX_SECONDS * 1000)
      expect(t.r.phase).toBe('QUESTION')
      t.room.useItem('p2', 'manta')
      t.room.useItem('p2', 'gem', 'p1')
      expect(t.p('p2').inventory).toEqual({ manta: 1, gem: 1 })
      expect(t.p('p2').items.removedOptions.length).toBe(1)
    })
  })

  // ── падения ──
  describe('ошибки не вешают комнату', () => {
    it('A7: расчёт раунда бросил — нулевые итоги, REVEAL наступает', () => {
      const t = makeRoom(2)
      t.r.currentMode = 'all'
      t.r.currentQuestion = { ...mcQ }
      t.r.phase = 'QUESTION'
      vi.spyOn(console, 'error').mockImplementation(() => {})
      t.r.calculateResults = () => { throw new Error('бум') }
      t.r.advanceFromQuestion()
      const res = t.results()
      expect(res.every(x => x.delta === 0)).toBe(true)
      vi.advanceTimersByTime(ANSWER_REVEAL_NOTES_MS)
      expect(t.r.phase).toBe('REVEAL')
    })

    it('A7: следующий вопрос не собрался — GAME_OVER с лидером, а не вечные итоги', () => {
      let fail = false
      const room = new GameRoom('r1', () => { if (fail) throw new Error('банк сломан'); return { ...mcQ } })
      const over: any[] = []
      room.on('broadcast', ({ event, data }) => { if (event === 'game_over') over.push(data) })
      room.addPlayer('p1', 'A')
      room.addPlayer('p2', 'B')
      const r = room as any
      r.players.get('p2').chips = 700
      vi.spyOn(console, 'error').mockImplementation(() => {})
      fail = true
      r.phase = 'REVEAL'
      r.onPhaseEnd()
      expect(r.phase).toBe('GAME_OVER')
      expect(over[0].winner.id).toBe('p2')
    })
  })

  // ── лишние рассылки ──
  describe('без лишних game_state', () => {
    it('identify тем же / shop_ready тем же / повторный join — стейт не рассылается всем', () => {
      const room = new GameRoom('r1', () => mcQ, [{ id: 7, name: 'Друг' }])
      const sent: string[] = []
      room.on('sendToPlayer', ({ playerId, event }) => { if (event === 'game_state') sent.push(playerId) })
      room.addPlayer('p1', 'A')
      room.addPlayer('p2', 'B')
      sent.length = 0
      room.identify('p1', null)            // и так никто
      expect(sent).toEqual([])
      room.identify('p1', 7)
      expect(sent.length).toBe(2)
      sent.length = 0
      room.identify('p1', 7)
      expect(sent).toEqual([])
      room.addPlayer('p1', 'A')            // повторный join — только себе
      expect(sent).toEqual(['p1'])
      sent.length = 0
      const r = room as any
      r.phase = 'SHOP'
      r.players.get('p1').shopReady = false
      r.players.get('p2').shopReady = false
      room.setShopReady('p1', false)
      expect(sent).toEqual([])
      room.setShopReady('p1', true)
      expect(sent.length).toBe(2)
    })
  })
})
