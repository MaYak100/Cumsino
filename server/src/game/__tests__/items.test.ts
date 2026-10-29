// Блайнды, бонусы (молния, серия), предметы и окно после последнего ответа — docs/items.md
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GameRoom } from '../GameRoom'
import type { Question, ItemId, GameMode, RoundResult } from '@cumsino/shared'
import {
  GLADIATOR_BONUS, CLOSEST_WINNER_BONUS, PHASE_DURATIONS,
  itemPrice, blindFor, BKB_CAP, AEGIS_RESTORE, HEX_SECONDS, LAST_ANSWER_GRACE_MS,
  LIGHTNING_GLADIATOR, LIGHTNING_MS, STREAK_GLADIATOR_BASE,
} from '@cumsino/shared'

const mcQ: Question = { id: 'q-mc', mode: 'all', topic: 'T', text: 'Q?', options: ['A', 'B', 'C', 'D'], answer: 'A' }
const cnQ: Question = { id: 'q-cn', mode: 'closest', topic: 'T', text: 'Сколько?', numericAnswer: 330 }

type Msg = { event: string; data: any }
type PMsg = Msg & { playerId: string }

function makeRoom(n = 3, question: Question = mcQ) {
  const broadcasts: Msg[] = []
  const except: Array<Msg & { excludeId: string }> = []
  const toPlayer: PMsg[] = []
  const room = new GameRoom('r1', () => question)
  room.on('broadcast', ({ event, data }) => broadcasts.push({ event, data }))
  room.on('broadcastExcept', ({ excludeId, event, data }) => except.push({ excludeId, event, data }))
  room.on('sendToPlayer', ({ playerId, event, data }) => toPlayer.push({ playerId, event, data }))
  for (let i = 1; i <= n; i++) room.addPlayer(`p${i}`, `P${i}`)
  const r = room as any
  const p = (id: string) => r.players.get(id)
  const give = (id: string, item: ItemId, count = 1) => { p(id).inventory[item] = count }
  const ev = (event: string) => broadcasts.filter(b => b.event === event)
  const sent = (playerId: string, event: string) => toPlayer.filter(m => m.playerId === playerId && m.event === event)
  const results = (): RoundResult[] => ev('round_results').at(-1)?.data.results
  const res = (id: string) => results().find(x => x.playerId === id)!
  /** фаза QUESTION через schedulePhase — как в игре (старт отсчёта молнии и хекса) */
  const toQuestion = (mode: GameMode = 'all', q: Question = mode === 'closest' ? cnQ : mcQ) => {
    r.currentMode = mode
    r.currentQuestion = { ...q }
    if (mode === 'kerri' && !r.gladiatorId) r.gladiatorId = 'p1'
    r.schedulePhase('QUESTION', PHASE_DURATIONS.QUESTION!)
  }
  const setPhase = (phase: string, mode: GameMode = 'all') => {
    r.phase = phase
    r.currentMode = mode
    r.currentQuestion = { ...(mode === 'closest' ? cnQ : mcQ) }
  }
  const bets = (amounts: Record<string, number>) => {
    for (const [id, a] of Object.entries(amounts)) p(id).currentBet = a
  }
  return { room, r, p, give, ev, sent, results, res, toQuestion, setPhase, bets, broadcasts, except, toPlayer }
}

const labels = (rr: RoundResult) => (rr.sources ?? []).map(s => s.label)
const src = (rr: RoundResult, label: string) => rr.sources?.find(s => s.label === label)?.delta

describe('предметы, бонусы, блайнды', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── блайнды ──
  describe('блайнды', () => {
    function toBetting(t: ReturnType<typeof makeRoom>, mode: GameMode = 'all') {
      t.setPhase('ANNOUNCE', mode)
      t.r.onPhaseEnd()
    }

    it('малый 5%, большой 10%, вверх до $10 и не больше баланса', () => {
      expect(blindFor(500, false)).toBe(30)
      expect(blindFor(500, true)).toBe(50)
      expect(blindFor(2000, false)).toBe(100)
      expect(blindFor(15, false)).toBe(10)
      expect(blindFor(5, true)).toBe(0)
    })

    it('на входе в BETTING «для всех» каждому блайнд, первому — большой', () => {
      const t = makeRoom(3)
      t.p('p3').chips = 2000
      toBetting(t)
      expect(t.r.phase).toBe('BETTING')
      expect(t.p('p1')).toMatchObject({ blind: 50, bigBlind: true })
      expect(t.p('p2')).toMatchObject({ blind: 30, bigBlind: false })
      expect(t.p('p3')).toMatchObject({ blind: 100, bigBlind: false })
      const pub = t.room.getPublicState().players.find(x => x.id === 'p1')!
      expect(pub.blind).toBe(50)
      expect(pub.bigBlind).toBe(true)
    })

    it('большой блайнд ходит по кругу в порядке входа, пропуская безденежных', () => {
      const t = makeRoom(3)
      const bigs: string[] = []
      for (let i = 0; i < 4; i++) {
        t.r.nextRound()
        toBetting(t)
        bigs.push([...t.r.players.values()].find((x: any) => x.bigBlind).id)
      }
      expect(bigs).toEqual(['p1', 'p2', 'p3', 'p1'])
      t.p('p2').chips = 5
      t.r.nextRound()
      toBetting(t)   // очередь p2, но у него < $10
      expect(t.p('p3').bigBlind).toBe(true)
      expect(t.p('p2').blind).toBe(0)
    })

    it('ставка меньше блайнда отклоняется, блайнд и больше — принимаются', () => {
      const t = makeRoom(3)
      toBetting(t)
      t.room.placeBet('p2', 20)
      expect(t.p('p2').currentBet).toBe(0)
      expect(t.r.bettingConfirmedIds.has('p2')).toBe(false)
      t.room.placeBet('p2', 30)
      expect(t.p('p2').currentBet).toBe(30)
    })

    it('не подтвердил к концу BETTING — ставка = блайнд, bet_updated без фишек', () => {
      const t = makeRoom(3)
      toBetting(t)
      t.room.placeBet('p1', 100)
      t.r.onPhaseEnd()   // конец BETTING
      expect(t.r.phase).toBe('QUESTION')
      expect(t.p('p1').currentBet).toBe(100)
      expect(t.p('p2').currentBet).toBe(30)
      expect(t.p('p3').currentBet).toBe(30)
      const forced = t.ev('bet_updated').map(b => b.data).filter(d => d.playerId === 'p2')
      expect(forced.at(-1)).toEqual({ playerId: 'p2', amount: 30 })
    })

    it('керри и «кто ближе» — без блайндов', () => {
      const t = makeRoom(3)
      vi.spyOn(Math, 'random').mockReturnValue(0)   // керри — p1
      toBetting(t, 'kerri')
      expect(t.p('p2').blind).toBeUndefined()
      t.room.placeBet('p2', 10, 'win')
      expect(t.p('p2').currentBet).toBe(10)
      t.r.nextRound()
      t.setPhase('ANNOUNCE', 'closest')
      t.r.onPhaseEnd()
      expect(t.r.phase).toBe('QUESTION')
      expect(t.p('p1').blind).toBeUndefined()
    })
  })

  // ── молния ──
  describe('молния', () => {
    it('верный ответ в первые 3 с — +25% ставки', () => {
      const t = makeRoom(3)
      t.bets({ p1: 100, p2: 100, p3: 100 })
      t.toQuestion()
      vi.advanceTimersByTime(1000)
      t.room.submitAnswer('p1', 'A')
      vi.advanceTimersByTime(LIGHTNING_MS)
      t.room.submitAnswer('p2', 'A')   // верно, но медленно
      t.room.submitAnswer('p3', 'B')
      vi.advanceTimersByTime(LAST_ANSWER_GRACE_MS)
      expect(src(t.res('p1'), 'Молния')).toBe(30)
      expect(src(t.res('p2'), 'Молния')).toBeUndefined()
      expect(t.res('p1').delta).toBe(50 + 30)
    })

    it('маленькая ставка — молния не меньше $10', () => {
      const t = makeRoom(2)
      t.bets({ p1: 10, p2: 10 })
      t.toQuestion()
      t.room.submitAnswer('p1', 'A')
      t.r.advanceFromQuestion()
      expect(src(t.res('p1'), 'Молния')).toBe(10)
    })

    it('блинк сбрасывает время ответа на новое', () => {
      const t = makeRoom(3)
      t.bets({ p1: 100, p2: 100, p3: 100 })
      t.give('p1', 'blink')
      t.toQuestion()
      t.room.submitAnswer('p1', 'B')
      vi.advanceTimersByTime(5000)
      t.room.submitAnswer('p1', 'A', true)
      t.r.advanceFromQuestion()
      expect(t.p('p1').answer).toBe('A')
      expect(src(t.res('p1'), 'Молния')).toBeUndefined()
    })

    it('керри: быстрый верный ответ — +$50 к бонусу', () => {
      const t = makeRoom(3)
      t.toQuestion('kerri')
      t.room.submitAnswer('p1', 'A')
      t.r.advanceFromQuestion()
      expect(src(t.res('p1'), 'Молния')).toBe(LIGHTNING_GLADIATOR)
      expect(t.res('p1').delta).toBe(GLADIATOR_BONUS + LIGHTNING_GLADIATOR)
    })
  })

  // ── серия ──
  describe('серия', () => {
    it('«для всех»: верно +1, неверно и пропуск — 0; бонус с двух', () => {
      const t = makeRoom(3)
      t.p('p1').streak = 1
      t.p('p2').streak = 4
      t.p('p3').streak = 2
      t.bets({ p1: 100, p2: 100, p3: 100 })
      t.toQuestion()
      vi.advanceTimersByTime(LIGHTNING_MS)
      t.room.submitAnswer('p1', 'A')
      t.room.submitAnswer('p2', 'B')
      t.r.advanceFromQuestion()   // p3 не ответил
      expect(t.p('p1').streak).toBe(2)
      expect(t.p('p2').streak).toBe(0)
      expect(t.p('p3').streak).toBe(0)
      expect(src(t.res('p1'), 'Серия ×2')).toBe(20)
      expect(labels(t.res('p2')).some(l => l.startsWith('Серия'))).toBe(false)
      expect(t.room.getPublicState().players.find(x => x.id === 'p1')!.streak).toBe(2)
    })

    it('бонус растёт с серией: ×3 — 35%, ×5 — 60%', () => {
      const t = makeRoom(2)
      t.p('p1').streak = 2
      t.bets({ p1: 200, p2: 200 })
      t.toQuestion()
      vi.advanceTimersByTime(LIGHTNING_MS)
      t.room.submitAnswer('p1', 'A')
      t.room.submitAnswer('p2', 'B')
      t.r.advanceFromQuestion()
      expect(src(t.res('p1'), 'Серия ×3')).toBe(70)

      const u = makeRoom(2)
      u.p('p1').streak = 4
      u.bets({ p1: 100, p2: 100 })
      u.toQuestion()
      vi.advanceTimersByTime(LIGHTNING_MS)
      u.room.submitAnswer('p1', 'A')
      u.r.advanceFromQuestion()
      expect(src(u.res('p1'), 'Серия ×5')).toBe(60)
    })

    it('керри: керри от базы $300, толпа — по угаданному исходу', () => {
      const t = makeRoom(3)
      t.p('p1').streak = 1
      t.p('p2').streak = 1
      t.p('p3').streak = 3
      t.p('p2').currentBet = 100; t.p('p2').betTarget = 'win'
      t.p('p3').currentBet = 100; t.p('p3').betTarget = 'lose'
      t.toQuestion('kerri')
      vi.advanceTimersByTime(LIGHTNING_MS)
      t.room.submitAnswer('p1', 'A')
      t.r.advanceFromQuestion()
      expect(src(t.res('p1'), 'Серия ×2')).toBe(STREAK_GLADIATOR_BASE / 5)
      expect(src(t.res('p2'), 'Серия ×2')).toBe(20)
      expect(t.p('p3').streak).toBe(0)
    })

    it('«кто ближе»: ближайший +1, не ответил — 0, остальные без изменений', () => {
      const t = makeRoom(3, cnQ)
      t.p('p1').streak = 1
      t.p('p2').streak = 3
      t.p('p3').streak = 2
      t.toQuestion('closest')
      t.room.submitAnswer('p1', 320)
      t.room.submitAnswer('p2', 100)
      t.r.advanceFromQuestion()
      expect(t.p('p1').streak).toBe(2)
      expect(t.p('p2').streak).toBe(3)
      expect(t.p('p3').streak).toBe(0)
      expect(src(t.res('p1'), 'Серия ×2')).toBe(CLOSEST_WINNER_BONUS / 5)
    })

    it('под BKB проигрыш не сбивает серию, BKB возвращает потерю', () => {
      const t = makeRoom(2)
      t.p('p2').streak = 3
      t.p('p2').items.bkb = true
      t.bets({ p1: 100, p2: 100 })
      t.toQuestion()
      vi.advanceTimersByTime(LIGHTNING_MS)
      t.room.submitAnswer('p1', 'A')
      t.room.submitAnswer('p2', 'B')
      t.r.advanceFromQuestion()
      expect(t.p('p2').streak).toBe(3)
      expect(src(t.res('p2'), 'BKB')).toBe(100)
      expect(t.res('p2').delta).toBe(0)
    })
  })

  // ── покупка ──
  describe('покупка', () => {
    it('только в REVEAL и ANNOUNCE, цена списывается сразу', () => {
      const t = makeRoom(2)
      t.r.phase = 'QUESTION'
      t.room.buyItem('p1', 'blink')
      expect(t.p('p1').inventory.blink).toBeUndefined()
      t.r.phase = 'REVEAL'
      t.room.buyItem('p1', 'blink')
      expect(t.p('p1').inventory.blink).toBe(1)
      expect(t.p('p1').chips).toBe(500 - 50)
      t.r.phase = 'ANNOUNCE'
      t.room.buyItem('p1', 'gem')
      expect(t.p('p1').inventory.gem).toBe(1)
    })

    it('цена растёт с балансом', () => {
      const t = makeRoom(1)
      t.r.phase = 'REVEAL'
      t.p('p1').chips = 2000
      t.room.buyItem('p1', 'bkb')
      expect(t.p('p1').chips).toBe(2000 - itemPrice('bkb', 2000))
      expect(itemPrice('bkb', 2000)).toBe(350)
      const st = t.room.getStateForPlayer('p1')
      expect(st.prices!.bkb).toBe(itemPrice('bkb', t.p('p1').chips))
    })

    it('не больше max в запасе и не дороже баланса', () => {
      const t = makeRoom(1)
      t.r.phase = 'REVEAL'
      t.p('p1').chips = 2000
      for (let i = 0; i < 4; i++) t.room.buyItem('p1', 'bkb')
      expect(t.p('p1').inventory.bkb).toBe(2)
      t.p('p1').chips = 40
      t.room.buyItem('p1', 'blink')
      expect(t.p('p1').inventory.blink).toBeUndefined()
    })

    it('аегис — один за игру, сразу активен', () => {
      const t = makeRoom(1)
      t.r.phase = 'REVEAL'
      t.room.buyItem('p1', 'aegis')
      expect(t.p('p1').aegis).toBe(true)
      expect(t.p('p1').inventory.aegis).toBeUndefined()
      expect(t.room.getStateForPlayer('p1').aegisBought).toBe(true)
      expect(t.room.getPublicState().players[0].effects).toEqual(['aegis'])
      t.p('p1').aegis = false   // сработал
      t.room.buyItem('p1', 'aegis')
      expect(t.p('p1').aegis).toBe(false)
    })

    it('запас виден только себе', () => {
      const t = makeRoom(2)
      t.give('p1', 'gem', 2)
      expect(t.room.getStateForPlayer('p1').inventory).toEqual({ gem: 2 })
      expect(t.room.getStateForPlayer('p2').inventory).toEqual({})
      expect(JSON.stringify(t.room.getPublicState())).not.toContain('inventory')
    })
  })

  // ── применение ──
  describe('blink', () => {
    it('меняет отправленный ответ и тратится; без флага или без блинка — нет', () => {
      const t = makeRoom(3)
      t.toQuestion()
      t.room.submitAnswer('p1', 'B')
      t.room.submitAnswer('p1', 'C')              // без блинка-флага
      expect(t.p('p1').answer).toBe('B')
      t.room.submitAnswer('p1', 'C', true)        // флаг есть, блинка нет
      expect(t.p('p1').answer).toBe('B')
      t.give('p1', 'blink', 2)
      t.room.submitAnswer('p1', 'C', true)
      expect(t.p('p1').answer).toBe('C')
      expect(t.p('p1').inventory.blink).toBe(1)
      expect(t.ev('item_used').map(b => b.data)).toEqual([{ playerId: 'p1', item: 'blink' }])
    })

    it('первый ответ с флагом blink — обычный ответ, блинк не тратится', () => {
      const t = makeRoom(3)
      t.give('p1', 'blink')
      t.toQuestion()
      t.room.submitAnswer('p1', 'B', true)
      expect(t.p('p1').hasAnswered).toBe(true)
      expect(t.p('p1').inventory.blink).toBe(1)
    })

    it('толпа керри блинкать не может', () => {
      const t = makeRoom(3)
      t.give('p2', 'blink')
      t.toQuestion('kerri')
      t.room.submitAnswer('p2', 'A', true)
      expect(t.p('p2').inventory.blink).toBe(1)
    })
  })

  describe('gem', () => {
    it('смотрящему — текущий выбор цели; всем — без цели; цели — onYou', () => {
      const t = makeRoom(3)
      t.give('p1', 'gem')
      t.toQuestion()
      t.room.useItem('p1', 'gem', 'p2')
      expect(t.sent('p1', 'gem_result').at(-1)!.data).toEqual({ targetId: 'p2', answer: null, smoked: false })
      t.room.submitAnswer('p2', 'C')
      t.give('p1', 'gem')
      t.room.useItem('p1', 'gem', 'p2')
      expect(t.sent('p1', 'gem_result').at(-1)!.data).toEqual({ targetId: 'p2', answer: 'C', smoked: false })
      expect(t.p('p1').inventory.gem).toBeUndefined()
      expect(t.except.at(-1)).toMatchObject({ excludeId: 'p2', event: 'item_used', data: { playerId: 'p1', item: 'gem' } })
      expect(t.except.at(-1)!.data.targetId).toBeUndefined()
      expect(t.sent('p2', 'item_used').at(-1)!.data).toEqual({ playerId: 'p1', item: 'gem', targetId: 'p2', onYou: true })
    })

    it('цель в смоке — answer null, smoked true', () => {
      const t = makeRoom(3)
      t.give('p1', 'gem')
      t.give('p2', 'smoke')
      t.toQuestion()
      t.room.useItem('p2', 'smoke')
      t.room.submitAnswer('p2', 'C')
      t.room.useItem('p1', 'gem', 'p2')
      expect(t.sent('p1', 'gem_result').at(-1)!.data).toEqual({ targetId: 'p2', answer: null, smoked: true })
    })

    it('не в BETTING, не на себя, не в керри', () => {
      const t = makeRoom(3)
      t.give('p1', 'gem')
      t.setPhase('BETTING')
      t.room.useItem('p1', 'gem', 'p2')
      t.toQuestion()
      t.room.useItem('p1', 'gem', 'p1')
      t.room.useItem('p1', 'gem', 'nobody')
      t.r.currentMode = 'kerri'
      t.room.useItem('p1', 'gem', 'p2')
      expect(t.p('p1').inventory.gem).toBe(1)
    })
  })

  describe('manta', () => {
    it('убирает неверный вариант, ответ им отклоняется, раз за раунд', () => {
      const t = makeRoom(3)
      t.give('p1', 'manta', 2)
      t.toQuestion()
      vi.spyOn(Math, 'random').mockReturnValue(0)   // кандидаты [1,2,3] → 1 (B)
      t.room.useItem('p1', 'manta')
      expect(t.sent('p1', 'manta_result').at(-1)!.data).toEqual({ optionIndex: 1 })
      expect(t.room.getStateForPlayer('p1').removedOptions).toEqual([1])
      expect(t.room.getStateForPlayer('p2').removedOptions).toBeUndefined()
      expect(t.ev('item_used').at(-1)!.data).toEqual({ playerId: 'p1', item: 'manta' })
      t.room.submitAnswer('p1', 'B')
      expect(t.p('p1').hasAnswered).toBe(false)
      t.room.useItem('p1', 'manta')
      expect(t.p('p1').inventory.manta).toBe(1)
      t.room.submitAnswer('p2', 'B')   // у других вариант на месте
      expect(t.p('p2').hasAnswered).toBe(true)
    })

    it('керри: всем видно, какой вариант убран; толпа манту не применяет', () => {
      const t = makeRoom(3)
      t.give('p1', 'manta')
      t.give('p2', 'manta')
      t.toQuestion('kerri')
      vi.spyOn(Math, 'random').mockReturnValue(0.99)   // → 3 (D)
      t.room.useItem('p2', 'manta')
      expect(t.p('p2').inventory.manta).toBe(1)
      t.room.useItem('p1', 'manta')
      expect(t.ev('item_used').at(-1)!.data).toEqual({ playerId: 'p1', item: 'manta', optionIndex: 3 })
    })
  })

  describe('smoke', () => {
    it('другим hasAnswered = false, player_answered только себе, блинк не рассылается', () => {
      const t = makeRoom(3)
      t.give('p1', 'smoke')
      t.give('p1', 'blink')
      t.toQuestion()
      t.room.useItem('p1', 'smoke')
      expect(t.ev('item_used').at(-1)!.data).toEqual({ playerId: 'p1', item: 'smoke' })
      expect(t.room.getPublicState().players[0].effects).toEqual(['smoke'])
      t.room.submitAnswer('p1', 'B')
      expect(t.ev('player_answered')).toHaveLength(0)
      expect(t.sent('p1', 'player_answered')).toHaveLength(1)
      expect(t.room.getStateForPlayer('p2').players[0].hasAnswered).toBe(false)
      expect(t.room.getStateForPlayer('p1').players[0].hasAnswered).toBe(true)
      const usedBefore = t.ev('item_used').length
      t.room.submitAnswer('p1', 'A', true)
      expect(t.ev('item_used')).toHaveLength(usedBefore)
      expect(t.sent('p1', 'item_used').at(-1)!.data).toEqual({ playerId: 'p1', item: 'blink' })
      t.r.advanceFromQuestion()
      expect(t.room.getStateForPlayer('p2').players[0].hasAnswered).toBe(true)   // раунд посчитан — видно
    })

    it('раз за раунд, не в керри', () => {
      const t = makeRoom(3)
      t.give('p2', 'smoke', 3)
      t.toQuestion()
      t.room.useItem('p2', 'smoke')
      t.room.useItem('p2', 'smoke')
      expect(t.p('p2').inventory.smoke).toBe(2)
      t.r.nextRound()
      t.toQuestion('kerri')
      t.room.useItem('p2', 'smoke')
      expect(t.p('p2').inventory.smoke).toBe(2)
    })
  })

  describe('hex', () => {
    it('на ставках: у цели 12 секунд, позже ответ не принимается', () => {
      const t = makeRoom(3)
      t.give('p1', 'hex', 2)
      t.setPhase('BETTING')
      t.room.useItem('p1', 'hex', 'p2')
      expect(t.ev('item_used').at(-1)!.data).toEqual({ playerId: 'p1', item: 'hex', targetId: 'p2' })
      expect(t.room.getStateForPlayer('p2').hexTimeLeft).toBe(HEX_SECONDS)
      expect(t.room.getStateForPlayer('p1').hexTimeLeft).toBeUndefined()
      expect(t.room.getPublicState().players[1].effects).toEqual(['hex'])
      t.room.useItem('p1', 'hex', 'p3')   // второй бросок за раунд — нельзя
      expect(t.p('p3').items.hexed).toBe(false)
      t.toQuestion()
      vi.advanceTimersByTime(5000)
      expect(t.room.getStateForPlayer('p2').hexTimeLeft).toBe(HEX_SECONDS - 5)
      vi.advanceTimersByTime(HEX_SECONDS * 1000 - 5000)
      t.room.submitAnswer('p2', 'A')
      expect(t.p('p2').hasAnswered).toBe(false)
      t.room.submitAnswer('p3', 'A')   // нехекснутый отвечает
      expect(t.p('p3').hasAnswered).toBe(true)
    })

    it('одна порча на цель за раунд; не в QUESTION; не в керри', () => {
      const t = makeRoom(3)
      t.give('p1', 'hex')
      t.give('p3', 'hex')
      t.setPhase('BETTING')
      t.room.useItem('p1', 'hex', 'p2')
      t.room.useItem('p3', 'hex', 'p2')
      expect(t.p('p3').inventory.hex).toBe(1)
      t.toQuestion()
      t.room.useItem('p3', 'hex', 'p1')
      t.setPhase('BETTING', 'kerri')
      t.room.useItem('p3', 'hex', 'p1')
      expect(t.p('p3').inventory.hex).toBe(1)
    })

    it('после 12 секунд цель считается ответившей — раунд считается досрочно', () => {
      const t = makeRoom(3)
      t.give('p1', 'hex')
      t.setPhase('BETTING')
      t.room.useItem('p1', 'hex', 'p2')
      t.toQuestion()
      t.room.submitAnswer('p1', 'A')
      t.room.submitAnswer('p3', 'B')
      vi.advanceTimersByTime(HEX_SECONDS * 1000 - 1)
      expect(t.ev('round_results')).toHaveLength(0)
      vi.advanceTimersByTime(1 + LAST_ANSWER_GRACE_MS)
      expect(t.ev('round_results')).toHaveLength(1)
    })
  })

  describe('bkb', () => {
    it('в ANNOUNCE/BETTING, раз за раунд; возврат не больше $400', () => {
      const t = makeRoom(2)
      t.p('p2').chips = 1000
      t.give('p2', 'bkb', 2)
      t.setPhase('QUESTION')
      t.room.useItem('p2', 'bkb')
      expect(t.p('p2').items.bkb).toBe(false)
      t.setPhase('BETTING')
      t.room.useItem('p2', 'bkb')
      t.room.useItem('p2', 'bkb')
      expect(t.p('p2').inventory.bkb).toBe(1)
      expect(t.ev('item_used').at(-1)!.data).toEqual({ playerId: 'p2', item: 'bkb' })
      expect(t.room.getPublicState().players[1].effects).toEqual(['bkb'])
      t.bets({ p1: 500, p2: 600 })
      t.toQuestion()
      t.room.submitAnswer('p1', 'A')
      t.room.submitAnswer('p2', 'B')
      t.r.advanceFromQuestion()
      expect(src(t.res('p2'), 'BKB')).toBe(BKB_CAP)
      expect(t.res('p2').delta).toBe(-600 + BKB_CAP)
    })

    it('керри: только толпа; BKB избранного в анонсе возвращается в запас', () => {
      const t = makeRoom(2)
      t.give('p1', 'bkb')
      t.setPhase('ANNOUNCE', 'kerri')
      t.room.useItem('p1', 'bkb')
      expect(t.p('p1').items.bkb).toBe(true)
      vi.spyOn(Math, 'random').mockReturnValue(0)   // керри — p1
      t.r.onPhaseEnd()
      expect(t.r.gladiatorId).toBe('p1')
      expect(t.p('p1').items.bkb).toBe(false)
      expect(t.p('p1').inventory.bkb).toBe(1)
      t.room.useItem('p1', 'bkb')
      expect(t.p('p1').items.bkb).toBe(false)
    })
  })

  describe('aegis', () => {
    it('баланс после раунда ниже $50 — становится $300, аегис снимается', () => {
      const t = makeRoom(2)
      t.p('p2').aegis = true
      t.p('p2').chips = 100
      t.bets({ p1: 100, p2: 100 })
      t.toQuestion()
      vi.advanceTimersByTime(LIGHTNING_MS)
      t.room.submitAnswer('p1', 'A')
      t.room.submitAnswer('p2', 'B')
      t.r.advanceFromQuestion()
      expect(t.p('p2').chips).toBe(AEGIS_RESTORE)
      expect(t.res('p2').delta).toBe(AEGIS_RESTORE - 100)
      expect(src(t.res('p2'), 'Аегис')).toBe(AEGIS_RESTORE)
      expect(t.p('p2').aegis).toBe(false)
      expect(t.room.getPublicState().players[1].effects).toBeUndefined()
    })

    it('выше порога — не срабатывает; порядок источников молния → серия → BKB → аегис', () => {
      const t = makeRoom(2)
      t.p('p1').aegis = true
      t.p('p1').streak = 1
      t.bets({ p1: 100, p2: 100 })
      t.toQuestion()
      t.room.submitAnswer('p1', 'A')
      t.r.advanceFromQuestion()
      expect(labels(t.res('p1'))).toEqual(['Ответил верно', 'Молния', 'Серия ×2'])
      expect(t.p('p1').aegis).toBe(true)
      const sum = t.res('p1').sources!.reduce((a, s) => a + s.delta, 0)
      expect(sum).toBe(t.res('p1').delta)
    })
  })

  // ── окно после последнего ответа ──
  describe('окно после последнего ответа', () => {
    it('все ответили — раунд считается через секунду', () => {
      const t = makeRoom(2)
      t.toQuestion()
      t.room.submitAnswer('p1', 'A')
      t.room.submitAnswer('p2', 'B')
      vi.advanceTimersByTime(LAST_ANSWER_GRACE_MS - 1)
      expect(t.ev('round_results')).toHaveLength(0)
      expect(t.r.revealing).toBe(false)
      vi.advanceTimersByTime(1)
      expect(t.ev('round_results')).toHaveLength(1)
    })

    it('блинк в окне перезапускает отсчёт и меняет ответ', () => {
      const t = makeRoom(2)
      t.give('p2', 'blink')
      t.bets({ p1: 100, p2: 100 })
      t.toQuestion()
      t.room.submitAnswer('p1', 'A')
      t.room.submitAnswer('p2', 'B')
      vi.advanceTimersByTime(600)
      t.room.submitAnswer('p2', 'A', true)
      vi.advanceTimersByTime(600)
      expect(t.ev('round_results')).toHaveLength(0)
      vi.advanceTimersByTime(LAST_ANSWER_GRACE_MS - 600)
      expect(t.ev('round_results')).toHaveLength(1)
      expect(labels(t.res('p2'))).toContain('Все угадали')
    })

    it('таймер вопроса во время окна — раунд считается один раз', () => {
      const t = makeRoom(2)
      t.toQuestion()
      vi.advanceTimersByTime(PHASE_DURATIONS.QUESTION! * 1000 - 500)
      t.room.submitAnswer('p1', 'A')
      t.room.submitAnswer('p2', 'A')
      vi.advanceTimersByTime(LAST_ANSWER_GRACE_MS)
      expect(t.ev('round_results')).toHaveLength(1)
    })
  })
})
