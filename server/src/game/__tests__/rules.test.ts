// Решения 2026-10-30: возврат предметов отменённого раунда, «мешок» керри, боты, «играем впервые» — docs/items.md, CLAUDE.md
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GameRoom } from '../GameRoom'
import { GameEngine } from '../GameEngine'
import { QuestionHistory } from '../questions/history'
import type { Library } from '../questions/library'
import type { Question, GameMode, GamePhase } from '@cumsino/shared'
import { PHASE_DURATIONS, MAX_PLAYERS, itemPrice, lockedItems } from '@cumsino/shared'

const mcQ: Question = { id: 'q-mc', mode: 'all', topic: 'T', text: 'Q?', options: ['A', 'B', 'C', 'D'], answer: 'A' }
const cnQ: Question = { id: 'q-cn', mode: 'closest', topic: 'T', text: 'Сколько?', numericAnswer: 330 }
const byMode = (mode: GameMode): Question => ({ ...(mode === 'closest' ? cnQ : mcQ), mode })

type Msg = { event: string; data: any }

function makeRoom(n = 3, source: any = byMode) {
  const broadcasts: Msg[] = []
  const toPlayer: Array<Msg & { playerId: string }> = []
  const room = new GameRoom('r1', source)
  room.on('broadcast', ({ event, data }) => broadcasts.push({ event, data }))
  room.on('sendToPlayer', ({ playerId, event, data }) => toPlayer.push({ playerId, event, data }))
  for (let i = 1; i <= n; i++) room.addPlayer(`p${i}`, `P${i}`)
  const r = room as any
  const p = (id: string) => r.players.get(id)
  const results = () => broadcasts.filter(b => b.event === 'round_results').at(-1)?.data
  return { room, r, p, broadcasts, toPlayer, results }
}

describe('решения 2026-10-30', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── возврат предметов отменённого раунда ──
  describe('отменённый раунд — предметы обратно в запас', () => {
    it('керри сбежал в BETTING: BKB толпы из анонса вернулся (с ценой покупки)', () => {
      const t = makeRoom(3)
      t.r.phase = 'SHOP'
      t.room.buyItem('p3', 'bkb')
      t.r.currentMode = 'kerri'
      t.r.currentQuestion = { ...mcQ }
      t.r.phase = 'ANNOUNCE'
      t.room.useItem('p3', 'bkb')
      expect(t.p('p3').inventory.bkb).toBeUndefined()
      t.r.gladiatorId = 'p1'
      t.r.phase = 'BETTING'
      t.room.removePlayer('p1')
      expect(t.results().results.every((x: any) => x.delta === 0)).toBe(true)
      expect(t.p('p3').inventory.bkb).toBe(1)
      expect(t.p('p3').bkbPaid).toEqual([itemPrice('bkb', 500)])
      expect(t.p('p3').items.bkb).toBe(false)
    })

    it('керри сбежал в QUESTION: BKB толпы вернулся, банк-ставка и ставки не списаны', () => {
      const t = makeRoom(3)
      t.p('p2').inventory.bkb = 1
      t.r.currentMode = 'kerri'
      t.r.currentQuestion = { ...mcQ }
      t.r.phase = 'BETTING'
      t.r.gladiatorId = 'p1'
      t.room.useItem('p2', 'bkb')
      t.room.placeBet('p2', 100, 'lose', undefined, { optionIndex: 1, amount: 50 })
      t.r.schedulePhase('QUESTION', PHASE_DURATIONS.QUESTION!)
      t.room.removePlayer('p1')
      expect(t.p('p2').inventory.bkb).toBe(1)
      expect(t.p('p2').chips).toBe(500)
      expect(t.results().comment).toMatch(/Керри сбежал/)
      vi.advanceTimersByTime(PHASE_DURATIONS.QUESTION! * 1000)   // таймер вопроса уже снят — второго расчёта нет
      expect(t.broadcasts.filter(b => b.event === 'round_results')).toHaveLength(1)
    })

    it('ошибка расчёта: блинк, гем, манта, смок, хекс — все обратно', () => {
      const t = makeRoom(3)
      t.r.currentMode = 'all'
      t.r.currentQuestion = { ...mcQ }
      for (const it of ['blink', 'gem', 'manta', 'smoke', 'hex'] as const) t.p('p1').inventory[it] = 1
      t.r.phase = 'BETTING'
      t.room.useItem('p1', 'hex', 'p2')
      t.room.useItem('p1', 'smoke')
      t.r.schedulePhase('QUESTION', PHASE_DURATIONS.QUESTION!)
      t.room.useItem('p1', 'manta')
      t.room.useItem('p1', 'gem', 'p3')
      t.room.submitAnswer('p1', 'A')
      const other = mcQ.options!.find(o => o !== 'A' && !t.p('p1').items.removedOptions.includes(mcQ.options!.indexOf(o)))!
      t.room.submitAnswer('p1', other, true)
      expect(t.p('p1').inventory).toEqual({})
      vi.spyOn(console, 'error').mockImplementation(() => {})
      t.r.calculateResults = () => { throw new Error('бум') }
      t.r.advanceFromQuestion()
      expect(t.p('p1').inventory).toEqual({ blink: 1, gem: 1, manta: 1, smoke: 1, hex: 1 })
    })

    it('посчитанный раунд — ничего не возвращается', () => {
      const t = makeRoom(2)
      t.p('p1').inventory.smoke = 1
      t.r.currentMode = 'all'
      t.r.currentQuestion = { ...mcQ }
      t.r.schedulePhase('QUESTION', PHASE_DURATIONS.QUESTION!)
      t.room.useItem('p1', 'smoke')
      t.r.advanceFromQuestion()
      expect(t.p('p1').inventory.smoke).toBeUndefined()
    })
  })

  // ── «мешок» керри ──
  describe('керри — «мешок»', () => {
    const pick = (t: ReturnType<typeof makeRoom>) => { t.r.selectGladiator(); return t.r.gladiatorId as string }

    it('каждый по разу в круге, потом новый круг', () => {
      for (let run = 0; run < 30; run++) {
        const t = makeRoom(4)
        const seq = Array.from({ length: 12 }, () => pick(t))
        for (let c = 0; c < 3; c++) expect(new Set(seq.slice(c * 4, c * 4 + 4)).size).toBe(4)
      }
    })

    it('ушедший выпадает из мешка; вошедший посреди круга попадает в него', () => {
      const t = makeRoom(3)
      vi.spyOn(Math, 'random').mockReturnValue(0)
      expect(pick(t)).toBe('p1')
      t.room.removePlayer('p2')
      t.room.addPlayer('p4', 'P4')   // в лобби вошёл бы участником; здесь — фаза LOBBY
      expect(t.r.kerriBag).toEqual(['p3', 'p4'])
      expect(pick(t)).toBe('p3')
      expect(pick(t)).toBe('p4')
      expect(t.r.kerriBag).toEqual([])
      expect(pick(t)).toBe('p1')     // новый круг: p1, p3, p4
      expect(t.r.kerriBag).toEqual(['p3', 'p4'])
    })

    it('зритель керри не становится и остаётся в мешке до следующего раунда', () => {
      const t = makeRoom(2)
      vi.spyOn(Math, 'random').mockReturnValue(0)
      pick(t)                        // p1; в мешке p2
      t.r.phase = 'ANNOUNCE'
      t.room.addPlayer('p3', 'P3')   // зритель, попал в мешок
      t.p('p2').spectator = true
      expect(pick(t)).toBe('p1')     // в мешке одни зрители — новый круг из тех, кого в нём нет
      expect(t.r.kerriBag).toEqual(['p2', 'p3'])
      t.p('p2').spectator = false
      t.p('p3').spectator = false
      expect(pick(t)).toBe('p2')
    })
  })

  // ── боты ──
  describe('боты', () => {
    it('добавляет только хост и только в лобби; имена «Бот N» с наименьшего свободного; лимит комнаты', () => {
      const t = makeRoom(2)
      expect(t.room.addBot('p2')).toBe(false)
      expect(t.room.addBot('p1')).toBe(true)
      expect(t.room.addBot('p1')).toBe(true)
      const bots = () => t.room.getPublicState().players.filter(x => x.bot)
      expect(bots().map(b => b.name)).toEqual(['Бот 1', 'Бот 2'])
      t.room.removeBot('p2', bots()[0].id)          // не хост
      expect(bots()).toHaveLength(2)
      t.room.removeBot('p1', 'p2')                  // не бот
      expect(t.r.players.has('p2')).toBe(true)
      t.room.removeBot('p1', bots()[0].id)
      expect(bots().map(b => b.name)).toEqual(['Бот 2'])
      t.room.addBot('p1')
      expect(bots().map(b => b.name).sort()).toEqual(['Бот 1', 'Бот 2'])
      while (t.room.addBot('p1')) { /* до лимита */ }
      expect(t.room.playerCount).toBe(MAX_PLAYERS)
      t.r.phase = 'ANNOUNCE'
      t.room.removeBot('p1', bots()[0].id)
      expect(t.room.playerCount).toBe(MAX_PLAYERS)
    })

    it('боту не шлётся стейт; хостом бот не становится', () => {
      const t = makeRoom(2)
      t.room.addBot('p1')
      const botId = t.room.getPublicState().players.find(x => x.bot)!.id
      t.toPlayer.length = 0
      t.room.start('p1')
      expect(t.toPlayer.some(m => m.playerId === botId)).toBe(false)
      t.room.removePlayer('p1')
      expect(t.room.getPublicState().hostId).toBe('p2')
      t.room.removePlayer('p2')
      expect(t.room.humanCount).toBe(0)
      expect(t.room.getPublicState().hostId).toBe('')
    })

    it('проходят полный цикл режимов сами: лавка, ставки (керри — сторона), ответы, керри-бот отвечает', () => {
      const t = makeRoom(1)
      t.room.addBot('p1')
      t.room.addBot('p1')
      const botIds = t.room.getPublicState().players.filter(x => x.bot).map(x => x.id)
      const log: Array<{ round: number; mode: GameMode; phase: GamePhase }> = []
      t.room.on('sendToPlayer', ({ playerId, event, data }: any) => {
        if (playerId !== 'p1' || event !== 'game_state') return
        const last = log.at(-1)
        if (!last || last.phase !== data.phase || last.round !== data.roundIndex) {
          log.push({ round: data.roundIndex, mode: data.mode, phase: data.phase })
        }
      })
      const bets = new Map<number, Map<string, any>>()
      const answers = new Map<number, Set<string>>()
      const gladiators = new Map<number, string>()
      t.room.on('broadcast', ({ event, data }: any) => {
        const round = t.r.roundIndex
        if (event === 'bet_updated') {
          if (!bets.has(round)) bets.set(round, new Map())
          bets.get(round)!.set(data.playerId, data)
        }
        if (event === 'player_answered') {
          if (!answers.has(round)) answers.set(round, new Set())
          answers.get(round)!.add(data.playerId)
        }
        if (event === 'round_results' && data.gladiatorId) gladiators.set(round, data.gladiatorId)
      })
      t.room.start('p1')
      // человек: в лавке «Готов», на ставках — блайнд, на вопросе — ответ; бот ходит за 0.5–3 с
      for (let s = 0; s < 600 && t.r.roundIndex <= 7; s++) {
        if (t.r.phase === 'SHOP') t.room.setShopReady('p1', true)
        if (t.r.phase === 'BETTING') t.room.placeBet('p1', t.p('p1').blind ?? 0, t.r.currentMode === 'kerri' ? 'win' : undefined)
        if (t.r.phase === 'QUESTION') t.room.submitAnswer('p1', t.r.currentMode === 'closest' ? 300 : 'B')
        vi.advanceTimersByTime(1000)
      }
      expect(t.r.phase).not.toBe('GAME_OVER')
      const modes = new Map(log.map(l => [l.round, l.mode]))
      expect([...modes.values()].slice(0, 7)).toEqual(['all', 'kerri', 'closest', 'all', 'kerri', 'closest', 'all'])
      expect(log.some(l => l.phase === 'SHOP')).toBe(true)
      for (const [round, mode] of modes) {
        if (round > 7) continue
        const g = gladiators.get(round)
        for (const b of botIds) {
          if (mode === 'all') {
            expect(bets.get(round)?.has(b)).toBe(true)
            expect(answers.get(round)?.has(b)).toBe(true)
          } else if (mode === 'kerri') {
            if (b === g) expect(answers.get(round)?.has(b)).toBe(true)
            else expect(['win', 'lose']).toContain(bets.get(round)?.get(b)?.target)
          } else {
            expect(answers.get(round)?.has(b)).toBe(true)
          }
        }
      }
      // все трое побывали керри: раунды 2 и 5 — круг из трёх ещё не кончился, но двое разных
      expect(new Set([gladiators.get(2), gladiators.get(5)]).size).toBe(2)
      // лавка закрылась досрочно: все «Готов» (люди и боты)
      const shopRound = log.find(l => l.phase === 'SHOP')!.round
      expect(log.find(l => l.round === shopRound && l.phase === 'ANNOUNCE')).toBeDefined()
    })

    it('в оценках не участвуют: делитель и голосующие — только люди, голос бота мимо', () => {
      const reports: any[] = []
      const rate = vi.fn()
      const t = makeRoom(2, { pick: byMode, report: (_q: Question, rr: any) => reports.push(rr), rate })
      t.room.addBot('p1')
      const botId = t.room.getPublicState().players.find(x => x.bot)!.id
      t.r.currentMode = 'all'
      t.r.currentQuestion = { ...mcQ }
      t.r.schedulePhase('QUESTION', PHASE_DURATIONS.QUESTION!)
      t.room.submitAnswer(botId, 'A')
      t.r.advanceFromQuestion()
      expect(reports[0]).toMatchObject({ roomPlayers: 2, present: ['p1', 'p2'], players: 2, answered: 0 })
      t.room.rateQuestion(botId, 'q-mc', { score: 2 })
      expect(rate).not.toHaveBeenCalled()
      t.room.rateQuestion('p1', 'q-mc', { score: 2 })
      expect(rate.mock.calls[0][1]).toMatchObject({ id: 'p1', roomPlayers: 2 })
    })

    it('ушёл последний человек — комната закрывается (с ботами), таймеры ботов сняты', () => {
      const emptyLibrary: Library = { categories: [], stats: null, friends: null, heroNames: {}, warnings: [] }
      const io = { to: () => ({ emit: () => true, except: () => ({ emit: () => true }) }) }
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const e = new GameEngine(io as any, new QuestionHistory(), emptyLibrary)
      const sock = { id: 'h', join() {}, leave() {}, emit: () => true }
      e.joinRoom(sock as any, 'H', 'ROOM')
      const room = e.getRoom('h')!
      room.addBot('h')
      room.addBot('h')
      expect(room.playerCount).toBe(3)
      ;(room as any).phase = 'SHOP'
      ;(room as any).runBots()
      expect(vi.getTimerCount()).toBeGreaterThan(0)
      e.leaveRoom('h')
      expect(e.roomCount).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('бот уходит — его таймеры сняты', () => {
      const t = makeRoom(1)
      t.room.addBot('p1')
      const botId = t.room.getPublicState().players.find(x => x.bot)!.id
      t.r.phase = 'SHOP'
      t.r.runBots()
      expect(t.r.botTimers.get(botId)).toHaveLength(1)
      t.r.phase = 'LOBBY'
      t.room.removeBot('p1', botId)
      expect(t.r.botTimers.has(botId)).toBe(false)
    })
  })

  describe('«играем впервые»', () => {
    it('lockedItems: без галочки всё открыто; с ней по два за лавку (манта, гем → блинк, BKB → хекс, смок), аегис всегда', () => {
      expect(lockedItems(false, 1)).toEqual([])
      expect(lockedItems(true, 0)).toEqual(['blink', 'bkb', 'hex', 'smoke'])
      expect(lockedItems(true, 1)).toEqual(['blink', 'bkb', 'hex', 'smoke'])
      expect(lockedItems(true, 2)).toEqual(['hex', 'smoke'])
      expect(lockedItems(true, 3)).toEqual([])
    })

    it('ставит только хост и только в лобби; видно всем', () => {
      const t = makeRoom(2)
      t.room.setFirstGame('p2', true)
      expect(t.room.getPublicState().firstGame).toBe(false)
      t.room.setFirstGame('p1', true)
      expect(t.room.getPublicState().firstGame).toBe(true)
      expect(t.room.getPublicState().lockedItems).toEqual(['blink', 'bkb', 'hex', 'smoke'])
      t.r.phase = 'ANNOUNCE'
      t.room.setFirstGame('p1', false)
      expect(t.room.getPublicState().firstGame).toBe(true)
    })

    it('закрытое в лавке не купить; следующая лавка открывает следующие два; аегис — с первой', () => {
      const t = makeRoom(2)
      t.room.setFirstGame('p1', true)
      t.r.startShop()
      t.room.buyItem('p1', 'blink')
      t.room.buyItem('p1', 'manta')
      t.room.buyItem('p2', 'aegis')
      expect(t.p('p1').inventory).toEqual({ manta: 1 })
      expect(t.p('p2').aegisBought).toBe(true)
      t.r.startShop()
      expect(t.room.getPublicState().lockedItems).toEqual(['hex', 'smoke'])
      t.room.buyItem('p1', 'blink')
      t.room.buyItem('p1', 'hex')
      expect(t.p('p1').inventory).toEqual({ manta: 1, blink: 1 })
    })

    it('без галочки в первой лавке открыто всё', () => {
      const t = makeRoom(2)
      t.r.startShop()
      t.room.buyItem('p1', 'smoke')
      expect(t.p('p1').inventory).toEqual({ smoke: 1 })
      expect(t.room.getPublicState().lockedItems).toBeUndefined()
    })
  })
})
