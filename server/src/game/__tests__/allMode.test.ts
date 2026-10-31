// «Для всех» 2026-10-31: джекпот, ставка на вопрос, смок прячет ставку, настройки хоста —
// docs/superpowers/specs/2026-10-31-all-mode-jackpot-question-bet-design.md, docs/items.md
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GameRoom, type RoomSettings } from '../GameRoom'
import type { Question, GameMode, RoundResult, GameState } from '@cumsino/shared'
import {
  PHASE_DURATIONS, NEW_MODE_ANNOUNCE_EXTRA, LAST_ANSWER_GRACE_MS, LIGHTNING_MS, LIGHTNING_QB_MS, HEX_SECONDS,
  HEX_QB_SECONDS, QUESTION_BET_BETTING, QUESTION_BET_QUESTION, allCorrectBonus, bkbCap, ITEMS,
} from '@cumsino/shared'

const mcQ: Question = { id: 'q-mc', mode: 'all', topic: 'T', text: 'Q?', options: ['A', 'B', 'C', 'D'], answer: 'A' }
const cnQ: Question = { id: 'q-cn', mode: 'closest', topic: 'T', text: 'Сколько?', numericAnswer: 330 }
const byMode = (mode: GameMode): Question => ({ ...(mode === 'closest' ? cnQ : mcQ), mode })
const ANNOUNCE_FIRST = PHASE_DURATIONS.ANNOUNCE! + NEW_MODE_ANNOUNCE_EXTRA

type Entry = { event: string; data: any }

/** Комната с почтой по игрокам (broadcast — всем, sendToPlayer — одному). */
function makeRoom(n = 3, settings: Partial<RoomSettings> = {}) {
  const room = new GameRoom('r1', byMode, [], settings)
  const r = room as any
  const inbox = new Map<string, Entry[]>()
  const push = (id: string, event: string, data: any) => {
    if (!inbox.has(id)) inbox.set(id, [])
    inbox.get(id)!.push({ event, data: JSON.parse(JSON.stringify(data ?? null)) })
  }
  room.on('broadcast', ({ event, data }) => { for (const id of r.players.keys()) push(id, event, data) })
  room.on('broadcastExcept', ({ excludeId, event, data }) => {
    for (const id of r.players.keys()) if (id !== excludeId) push(id, event, data)
  })
  room.on('sendToPlayer', ({ playerId, event, data }) => push(playerId, event, data))
  for (let i = 1; i <= n; i++) room.addPlayer(`p${i}`, `P${i}`)
  const p = (id: string) => r.players.get(id)
  const mail = (id: string) => inbox.get(id) ?? []
  const clear = () => inbox.clear()
  const states = (id: string): GameState[] => mail(id).filter(e => e.event === 'game_state').map(e => e.data)
  const results = (): RoundResult[] => mail('p1').filter(e => e.event === 'round_results').at(-1)?.data.results
  const res = (id: string) => results().find(x => x.playerId === id)!
  const src = (id: string, label: string) => res(id).sources?.find(s => s.label === label)?.delta
  const startIn = (mode: GameMode) => {
    r.selector.index = { all: 0, kerri: 1, closest: 2 }[mode]
    room.start('p1')
  }
  /** Раунд «для всех» номер n с готовыми ставками и ответами ({id: [ответ, ставка]}), посчитан и применён. */
  const settle = (plays: Record<string, [string | undefined, number]>, n = 1) => {
    r.revealing = false
    r.phase = 'QUESTION'
    r.currentMode = 'all'
    r.currentQuestion = { ...mcQ }
    r.modeRounds.all = n
    for (const [id, pl] of r.players as Map<string, any>) {
      const [answer, bet] = plays[id] ?? [undefined, 0]
      pl.answer = answer
      pl.hasAnswered = answer !== undefined
      pl.currentBet = bet
    }
    r.advanceFromQuestion()
    vi.clearAllTimers()
  }
  return { room, r, p, mail, clear, states, results, res, src, startIn, settle }
}

describe('«для всех»: джекпот, ставка на вопрос, смок', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── настройки ──
  describe('настройки хоста', () => {
    it('по умолчанию обе включены и видны всем; банк джекпота — 0', () => {
      const t = makeRoom(2)
      const st = t.room.getStateForPlayer('p2')
      expect(st).toMatchObject({ jackpot: true, questionBet: true, jackpotBank: 0 })
    })

    it('меняет только хост и только в лобби; без изменений стейт не рассылается', () => {
      const t = makeRoom(2)
      t.room.setSettings('p2', { jackpot: false })
      expect(t.room.getPublicState().jackpot).toBe(true)
      t.clear()
      t.room.setSettings('p1', { jackpot: false })
      expect(t.room.getPublicState()).toMatchObject({ jackpot: false, questionBet: true })
      expect(t.room.getPublicState().jackpotBank).toBeUndefined()   // джекпот выключен — банка нет
      expect(t.states('p2')).toHaveLength(1)
      t.room.setSettings('p1', { jackpot: false })                  // то же самое — тишина
      expect(t.states('p2')).toHaveLength(1)
      t.room.setSettings('p1', { questionBet: false })
      expect(t.room.getPublicState()).toMatchObject({ jackpot: false, questionBet: false })
      t.startIn('all')
      t.room.setSettings('p1', { jackpot: true, questionBet: true })
      expect(t.room.getPublicState()).toMatchObject({ jackpot: false, questionBet: false })
    })
  })

  // ── джекпот ──
  describe('джекпот', () => {
    it('«все ошиблись» — ставки уходят в банк, банк копится; обычный раунд — банк угадавшим пропорционально ставкам', () => {
      const t = makeRoom(3)
      t.settle({ p1: ['B', 100], p2: ['C', 50] })
      expect(t.res('p1').delta).toBe(-100)
      expect(t.res('p2').delta).toBe(-50)
      expect(t.res('p3').delta).toBe(0)
      expect(t.res('p1').sources![0].label).toMatch(/^Все ошиблись/)
      expect(t.p('p1').chips).toBe(400)
      expect(t.r.jackpotBank).toBe(150)
      expect(t.room.getPublicState().jackpotBank).toBe(150)

      t.settle({ p1: ['B', 30], p2: [undefined, 20] }, 2)   // не ответил со ставкой — тоже ошибся
      expect(t.r.jackpotBank).toBe(200)

      // пул $40 и банк $200 делятся 1:3
      t.settle({ p1: ['A', 100], p2: ['A', 300], p3: ['B', 40] }, 3)
      expect(t.src('p1', 'Ответил верно')).toBe(10)
      expect(t.src('p1', 'Джекпот')).toBe(50)
      expect(t.src('p2', 'Ответил верно')).toBe(30)
      expect(t.src('p2', 'Джекпот')).toBe(150)
      expect(t.res('p2').delta).toBe(180)
      expect(t.res('p3').delta).toBe(-40)
      expect(t.r.jackpotBank).toBe(0)
    })

    it('«все угадали» — каждому $50 + $10 × (n − 1) от казино, банк не трогается', () => {
      const t = makeRoom(3)
      t.r.jackpotBank = 120
      t.settle({ p1: ['A', 100], p2: ['A', 30] }, 1)
      expect(t.res('p1').delta).toBe(50)
      expect(t.res('p2').delta).toBe(50)
      expect(t.res('p3').delta).toBe(0)
      expect(t.src('p1', 'Все угадали')).toBe(50)
      expect(t.r.jackpotBank).toBe(120)
      t.settle({ p1: ['A', 100], p2: ['A', 30] }, 4)
      expect(t.src('p1', 'Все угадали')).toBe(allCorrectBonus(4))
      expect(allCorrectBonus(4)).toBe(80)
      expect(t.src('p1', 'Серия ×2')).toBe(10)   // серия — тоже от бонуса: 20% от $80 → $10
      expect(t.r.jackpotBank).toBe(120)
    })

    it('ставит меньше двух — как без джекпота: нулевые дельты, банк не трогается', () => {
      const t = makeRoom(3)
      t.r.jackpotBank = 70
      t.settle({ p1: ['B', 100], p2: ['C', 0], p3: ['D', 0] })
      expect(t.res('p1').delta).toBe(0)
      expect(t.res('p1').sources![0].label).toBe('Все ошиблись')
      t.settle({ p1: ['A', 100] }, 2)
      expect(t.res('p1').delta).toBe(0)
      expect(t.r.jackpotBank).toBe(70)
    })

    it('выигрыш из банка и бонус «все угадали» — база молнии и серии', () => {
      const t = makeRoom(2)
      // обычный раунд: пул $100 + банк $400 → выигрыш $500; молния 25% = $125 → $120; серия ×3 35% = $175 → $170
      t.r.jackpotBank = 400
      t.p('p1').streak = 2
      t.p('p1').currentBet = 100
      t.p('p2').currentBet = 100
      t.r.currentMode = 'all'
      t.r.currentQuestion = { ...mcQ }
      t.r.schedulePhase('QUESTION', QUESTION_BET_QUESTION)
      vi.advanceTimersByTime(1000)
      t.room.submitAnswer('p1', 'A')
      t.room.submitAnswer('p2', 'B')
      vi.advanceTimersByTime(LAST_ANSWER_GRACE_MS)
      expect(t.src('p1', 'Ответил верно')).toBe(100)
      expect(t.src('p1', 'Джекпот')).toBe(400)
      expect(t.src('p1', 'Молния')).toBe(120)
      expect(t.src('p1', 'Серия ×3')).toBe(170)
      expect(t.p('p1').streak).toBe(3)
    })

    it('«все угадали»: молния и серия от бонуса (раньше «все угадали» бонусы обнуляло)', () => {
      const t = makeRoom(2)
      t.p('p1').streak = 1
      t.p('p1').currentBet = 100
      t.p('p2').currentBet = 100
      t.r.currentMode = 'all'
      t.r.currentQuestion = { ...mcQ }
      t.r.modeRounds.all = 6   // бонус $100
      t.r.schedulePhase('QUESTION', QUESTION_BET_QUESTION)
      t.room.submitAnswer('p1', 'A')
      vi.advanceTimersByTime(3000)
      t.room.submitAnswer('p2', 'A')
      vi.advanceTimersByTime(LAST_ANSWER_GRACE_MS)
      expect(t.src('p1', 'Все угадали')).toBe(100)
      expect(t.src('p1', 'Молния')).toBe(20)          // 25% от $100 → $25 → $20
      expect(t.src('p1', 'Серия ×2')).toBe(20)        // 20% от $100
      expect(t.src('p2', 'Молния')).toBeUndefined()   // 3 с > 1.5 с
    })

    it('BKB страхует ставку, ушедшую в банк; банк получает её целиком', () => {
      const t = makeRoom(2)
      t.p('p1').items.bkb = true
      t.p('p1').items.bkbCap = bkbCap(ITEMS.bkb.basePrice)
      t.settle({ p1: ['B', 100], p2: ['C', 50] })
      expect(t.res('p1').delta).toBe(0)
      expect(t.src('p1', 'BKB')).toBe(100)
      expect(t.r.jackpotBank).toBe(150)
    })

    it('отменённый раунд банк не трогает (и расчёт, повторённый тестом, не копит банк дважды)', () => {
      const t = makeRoom(3)
      t.r.jackpotBank = 300
      t.r.phase = 'QUESTION'
      t.r.currentMode = 'all'
      t.r.currentQuestion = { ...mcQ }
      for (const [id, a, b] of [['p1', 'B', 100], ['p2', 'C', 100]] as const) {
        Object.assign(t.p(id), { answer: a, hasAnswered: true, currentBet: b })
      }
      t.r.calculateResults()
      t.r.calculateResults()
      t.r.cancelRound('Керри сбежал — раунд не считается')
      expect(t.r.jackpotBank).toBe(300)
      expect(t.p('p1').chips).toBe(500)
    })

    it('джекпот выключен — как раньше: «все ошиблись» / «все угадали» без дельт, банк не растёт и не делится', () => {
      const t = makeRoom(3, { jackpot: false })
      t.settle({ p1: ['B', 100], p2: ['C', 50] })
      t.settle({ p1: ['A', 100], p2: ['A', 50] }, 2)
      expect(t.res('p1').delta).toBe(0)
      expect(t.r.jackpotBank).toBe(0)
      t.r.jackpotBank = 200   // даже если что-то лежит — без джекпота не делится
      t.settle({ p1: ['A', 100], p2: ['B', 100] }, 3)
      expect(t.src('p1', 'Ответил верно')).toBe(100)
      expect(t.src('p1', 'Джекпот')).toBeUndefined()
      expect(t.r.jackpotBank).toBe(200)
      expect(t.room.getPublicState().jackpotBank).toBeUndefined()
    })

    it('керри джекпот не трогает', () => {
      const t = makeRoom(3)
      t.r.jackpotBank = 100
      t.r.phase = 'QUESTION'
      t.r.currentMode = 'kerri'
      t.r.gladiatorId = 'p1'
      t.r.currentQuestion = { ...mcQ, mode: 'kerri' }
      t.r.modeRounds.kerri = 1
      Object.assign(t.p('p1'), { answer: 'B', hasAnswered: true })
      Object.assign(t.p('p2'), { currentBet: 50, betOption: 2 })
      Object.assign(t.p('p3'), { currentBet: 50, betOption: 3 })
      t.r.advanceFromQuestion()
      expect(t.res('p2').delta).toBe(0)
      expect(t.r.jackpotBank).toBe(100)
    })
  })

  // ── ставка на вопрос ──
  describe('ставка на вопрос', () => {
    function toQuestion(settings: Partial<RoomSettings> = {}) {
      const t = makeRoom(3, settings)
      t.startIn('all')
      vi.advanceTimersByTime(ANNOUNCE_FIRST * 1000)
      expect(t.r.phase).toBe('BETTING')
      return t
    }

    it('ставки 20 с, вопрос 15 с; выключено — 30 и 45 с', () => {
      const t = toQuestion()
      expect(t.room.getPublicState().phaseDuration).toBe(QUESTION_BET_BETTING)
      vi.advanceTimersByTime(QUESTION_BET_BETTING * 1000)
      expect(t.r.phase).toBe('QUESTION')
      expect(t.room.getPublicState().phaseDuration).toBe(QUESTION_BET_QUESTION)

      const off = toQuestion({ questionBet: false })
      expect(off.room.getPublicState().phaseDuration).toBe(PHASE_DURATIONS.BETTING)
      vi.advanceTimersByTime(PHASE_DURATIONS.BETTING! * 1000)
      expect(off.room.getPublicState().phaseDuration).toBe(PHASE_DURATIONS.QUESTION)
    })

    it('керри и «кто ближе» — прежние длительности при включённой настройке', () => {
      const t = makeRoom(3)
      t.startIn('kerri')
      vi.advanceTimersByTime(ANNOUNCE_FIRST * 1000)
      expect(t.r.phase).toBe('BETTING')
      expect(t.room.getPublicState().phaseDuration).toBe(PHASE_DURATIONS.BETTING)
      const c = makeRoom(2)
      c.startIn('closest')
      vi.advanceTimersByTime(ANNOUNCE_FIRST * 1000)
      expect(c.room.getPublicState().phaseDuration).toBe(PHASE_DURATIONS.QUESTION)
    })

    it('молния — только первые 1.5 с; ставка на тему — 8 с', () => {
      const run = (settings: Partial<RoomSettings>, ms: number) => {
        const t = makeRoom(2, settings)
        t.p('p1').currentBet = 100
        t.p('p2').currentBet = 100
        t.r.currentMode = 'all'
        t.r.currentQuestion = { ...mcQ }
        t.r.schedulePhase('QUESTION', 15)
        vi.advanceTimersByTime(ms)
        t.room.submitAnswer('p1', 'A')
        t.room.submitAnswer('p2', 'B')
        t.r.advanceFromQuestion()
        return t.src('p1', 'Молния')
      }
      expect(run({}, LIGHTNING_QB_MS - 100)).toBe(20)
      expect(run({}, LIGHTNING_QB_MS + 100)).toBeUndefined()
      expect(run({ questionBet: false }, LIGHTNING_QB_MS + 100)).toBe(20)
      expect(run({ questionBet: false }, LIGHTNING_MS + 100)).toBeUndefined()
    })

    it('хекс — 7 с у цели; ставка на тему — 15 с', () => {
      const t = toQuestion()
      t.p('p1').inventory = { hex: 1 }
      t.room.useItem('p1', 'hex', 'p2')
      expect(t.room.getStateForPlayer('p2').hexTimeLeft).toBe(HEX_QB_SECONDS)
      for (const id of ['p1', 'p2', 'p3']) t.room.placeBet(id, 30)
      expect(t.r.phase).toBe('QUESTION')
      expect(t.room.getStateForPlayer('p2').hexEndsAt).toBe(t.r.questionStartAt + HEX_QB_SECONDS * 1000)
      vi.advanceTimersByTime(HEX_QB_SECONDS * 1000)
      t.room.submitAnswer('p2', 'A')
      expect(t.p('p2').hasAnswered).toBe(false)

      const off = toQuestion({ questionBet: false })
      off.p('p1').inventory = { hex: 1 }
      off.room.useItem('p1', 'hex', 'p2')
      expect(off.room.getStateForPlayer('p2').hexTimeLeft).toBe(HEX_SECONDS)
    })

    it('на ставках — текст вопроса без вариантов и единицы; ставка на тему — без текста; в QUESTION — всё', () => {
      const t = toQuestion()
      const q = t.room.getStateForPlayer('p2').currentQuestion!
      expect(q.text).toBe('Q?')
      expect(q.options).toBeUndefined()
      expect(q.unit).toBeUndefined()
      const off = toQuestion({ questionBet: false })
      expect(off.room.getStateForPlayer('p2').currentQuestion!.text).toBe('')
      for (const id of ['p1', 'p2', 'p3']) off.room.placeBet(id, 30)
      expect(off.room.getStateForPlayer('p2').currentQuestion).toMatchObject({ text: 'Q?', options: ['A', 'B', 'C', 'D'] })
    })

    it('бот отвечает через 2–6 с (молния 1.5 с ему не достаётся); ставка на тему — 0.5–3 с', () => {
      const run = (settings: Partial<RoomSettings>) => {
        const t = makeRoom(1, settings)
        t.room.addBot('p1')
        t.r.currentMode = 'all'
        t.r.currentQuestion = { ...mcQ }
        t.r.schedulePhase('QUESTION', 15)
        return t
      }
      const on = run({})
      vi.advanceTimersByTime(1999)
      expect(on.p('bot-1').hasAnswered).toBe(false)
      vi.advanceTimersByTime(1)
      expect(on.p('bot-1').hasAnswered).toBe(true)
      const off = run({ questionBet: false })
      vi.advanceTimersByTime(500)
      expect(off.p('bot-1').hasAnswered).toBe(true)
    })
  })

  // ── смок прячет ставку ──
  describe('смок прячет ставку («для всех»)', () => {
    function betting(settings: Partial<RoomSettings> = {}) {
      const t = makeRoom(3, settings)
      t.p('p2').inventory = { smoke: 1 }
      t.startIn('all')
      return t
    }
    const toBets = () => vi.advanceTimersByTime(ANNOUNCE_FIRST * 1000)
    const seen = (t: ReturnType<typeof makeRoom>, viewer: string, id: string) =>
      t.room.getStateForPlayer(viewer).players.find(x => x.id === id)!

    for (const questionBet of [true, false]) {
      it(`включён в анонсе: соперники не видят ни черновика, ни ставки, ни блайнда за него; себе — всё (questionBet: ${questionBet})`, () => {
        const t = betting({ questionBet })
        expect(t.r.phase).toBe('ANNOUNCE')
        t.room.useItem('p2', 'smoke')
        expect(t.p('p2').items.smoked).toBe(true)
        toBets()
        expect(t.r.phase).toBe('BETTING')
        t.clear()
        t.room.stageChip('p2', [100, 20])
        t.room.placeBet('p2', 120, undefined, [100, 20])
        t.room.stageChip('p3', [50])   // p3 не подтвердит — за него стол
        for (const v of ['p1', 'p3']) {
          expect(t.mail(v).some(e => (e.event === 'chip_staged' || e.event === 'bet_updated') && e.data.playerId === 'p2')).toBe(false)
          expect(seen(t, v, 'p2')).toMatchObject({ currentBet: 0, betHidden: true, effects: ['smoke'] })
          expect(seen(t, v, 'p2').betChips).toBeUndefined()
        }
        expect(t.mail('p2').some(e => e.event === 'bet_updated' && e.data.amount === 120)).toBe(true)
        expect(seen(t, 'p2', 'p2')).toMatchObject({ currentBet: 120, betChips: [100, 20] })
        expect(seen(t, 'p2', 'p2').betHidden).toBeUndefined()
        // ставки p3 и p1 видны как обычно
        expect(t.mail('p1').some(e => e.event === 'chip_staged' && e.data.playerId === 'p3')).toBe(true)
        // после расчёта — видно всем
        t.room.placeBet('p1', 30)
        t.room.placeBet('p3', 50)
        expect(t.r.phase).toBe('QUESTION')
        expect(seen(t, 'p1', 'p2').currentBet).toBe(0)
        for (const id of ['p1', 'p2', 'p3']) t.room.submitAnswer(id, 'A')
        vi.advanceTimersByTime(LAST_ANSWER_GRACE_MS)
        expect(seen(t, 'p1', 'p2')).toMatchObject({ currentBet: 120, betChips: [100, 20] })
        expect(seen(t, 'p1', 'p2').betHidden).toBeUndefined()
      })
    }

    it('принудительный блайнд за игрока в смоке не раскрывается', () => {
      const t = betting()
      t.room.useItem('p2', 'smoke')
      toBets()
      t.clear()
      t.room.placeBet('p1', 30)
      t.room.placeBet('p3', 30)
      vi.advanceTimersByTime(QUESTION_BET_BETTING * 1000)
      expect(t.r.phase).toBe('QUESTION')
      expect(t.p('p2').currentBet).toBe(t.p('p2').blind)
      expect(t.mail('p1').some(e => e.event === 'bet_updated' && e.data.playerId === 'p2')).toBe(false)
      expect(t.mail('p2').some(e => e.event === 'bet_updated' && e.data.playerId === 'p2')).toBe(true)
      expect(seen(t, 'p1', 'p2').currentBet).toBe(0)
    })

    it('включён посреди ставок — кучка у соперников пропадает, дальше черновик не идёт', () => {
      const t = betting()
      toBets()
      t.room.stageChip('p2', [50])
      expect(t.mail('p1').some(e => e.event === 'chip_staged' && e.data.playerId === 'p2')).toBe(true)
      t.room.useItem('p2', 'smoke')
      expect(t.states('p1').at(-1)!.players.find(x => x.id === 'p2')!.betHidden).toBe(true)
      t.clear()
      t.room.stageChip('p2', [50, 50])
      expect(t.mail('p1').some(e => e.event === 'chip_staged')).toBe(false)
    })

    it('в анонсе смок — только «для всех» (в «кто ближе» анонс сразу в вопрос)', () => {
      const t = makeRoom(2)
      t.p('p2').inventory = { smoke: 1 }
      t.startIn('closest')
      expect(t.r.phase).toBe('ANNOUNCE')
      t.room.useItem('p2', 'smoke')
      expect(t.p('p2').items.smoked).toBe(false)
      expect(t.p('p2').inventory.smoke).toBe(1)
    })

    it('смок в «кто ближе» ставок не касается (их нет) — betHidden не появляется', () => {
      const t = makeRoom(2)
      t.p('p2').inventory = { smoke: 1 }
      t.startIn('closest')
      vi.advanceTimersByTime(ANNOUNCE_FIRST * 1000)
      t.room.useItem('p2', 'smoke')
      expect(t.p('p2').items.smoked).toBe(true)
      expect(seen(t, 'p1', 'p2').betHidden).toBeUndefined()
    })
  })
})
