// Сессии (игрок — не сокет): обрыв связи → «не в сети» со всем своим, возврат по токену / по имени, кого не ждём,
// хост, движок (второй сокет, пустая комната, выход). И то, что пришло вместе с ними: черновик на столе в конце
// ставок, керри — банк по выбору керри, растущие бонусы, подачка.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GameRoom, LOBBY_DROP_MS, OFFLINE_GRACE_MS } from '../GameRoom'
import { GameEngine, ROOM_EMPTY_TTL_MS, playerChannel } from '../GameEngine'
import { QuestionHistory } from '../questions/history'
import type { Library } from '../questions/library'
import type { Question, GameMode, RoundResult } from '@cumsino/shared'
import {
  PHASE_DURATIONS, LAST_ANSWER_GRACE_MS, LIGHTNING_MS, MAX_PLAYERS, CLOSEST_EXACT_BONUS,
  gladiatorBonus, closestWinnerBonus,
} from '@cumsino/shared'

const mcQ: Question = { id: 'q-mc', mode: 'all', topic: 'T', text: 'Q?', options: ['A', 'B', 'C', 'D'], answer: 'A' }
const cnQ: Question = { id: 'q-cn', mode: 'closest', topic: 'T', text: 'Сколько?', numericAnswer: 330 }
const byMode = (mode: GameMode): Question => ({ ...(mode === 'closest' ? cnQ : mcQ), mode })

type Msg = { event: string; data: any }

function makeRoom(n = 3) {
  const broadcasts: Msg[] = []
  const toPlayer: Array<Msg & { playerId: string }> = []
  const room = new GameRoom('r1', byMode, [{ id: 7, name: 'Друг' }])
  room.on('broadcast', ({ event, data }) => broadcasts.push({ event, data }))
  room.on('sendToPlayer', ({ playerId, event, data }) => toPlayer.push({ playerId, event, data }))
  for (let i = 1; i <= n; i++) room.addPlayer(`p${i}`, `P${i}`, `tok-${i}`)
  const r = room as any
  const p = (id: string) => r.players.get(id)
  const results = (): RoundResult[] => broadcasts.filter(b => b.event === 'round_results').at(-1)?.data.results
  const res = (id: string) => results().find(x => x.playerId === id)!
  const src = (id: string, label: string) => res(id).sources?.find(s => s.label === label)?.delta
  const pub = (id: string, viewer?: string) =>
    (viewer ? room.getStateForPlayer(viewer) : room.getPublicState()).players.find(x => x.id === id)!
  /** старт с режима mode (цикл all → kerri → closest), сразу на ставки (керри — p1 при Math.random = 0) */
  const toBetting = (mode: 'all' | 'kerri') => {
    r.selector.index = { all: 0, kerri: 1 }[mode]
    room.start('p1')
    r.onPhaseEnd()   // ANNOUNCE → BETTING
    expect(r.phase).toBe('BETTING')
  }
  return { room, r, p, broadcasts, toPlayer, results, res, src, pub, toBetting }
}

describe('сессии', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── обрыв и возвращение ──
  describe('не в сети и возвращение', () => {
    it('обрыв: игрок остаётся со всем своим — фишки, запас, аегис, «кто ты»; публично offline', () => {
      const t = makeRoom(2)
      t.room.identify('p1', 7)
      Object.assign(t.p('p1'), { chips: 340, inventory: { gem: 1 }, aegisBought: true, aegis: true })
      t.room.setOffline('p1')
      expect(t.room.playerCount).toBe(2)
      expect(t.p('p1')).toMatchObject({ chips: 340, inventory: { gem: 1 }, aegisBought: true, friendId: 7 })
      expect(t.pub('p1').offline).toBe(true)
      expect(t.pub('p2').offline).toBeUndefined()
      expect(t.room.onlineHumans).toBe(1)
    })

    it('возвращение по токену — тот же id, снова в сети, не зритель, фишки те же', () => {
      const t = makeRoom(3)
      t.room.start('p1')   // ANNOUNCE: вошедший сейчас был бы зрителем
      t.p('p2').chips = 270
      t.room.setOffline('p2')
      expect(t.room.resume('tok-2', 'Совсем другое имя')).toBe('p2')
      expect(t.p('p2').offlineSince).toBeUndefined()
      expect(t.p('p2').spectator).toBe(false)
      expect(t.p('p2').chips).toBe(270)
      expect(t.pub('p2').offline).toBeUndefined()
      expect(t.room.playerCount).toBe(3)
    })

    it('по имени (без учёта регистра) — только если тот игрок не в сети; другое имя — новый игрок', () => {
      const t = makeRoom(2)
      expect(t.room.resume('tok-new', 'p1')).toBeUndefined()   // P1 в сети — второй «P1» будет новым игроком
      t.room.setOffline('p1')
      expect(t.room.resume('tok-new', 'p1')).toBe('p1')
      expect(t.p('p1').token).toBe('tok-new')   // дальше — по новому токену
      t.room.setOffline('p1')
      expect(t.room.resume('tok-new', 'кто угодно')).toBe('p1')
      expect(t.room.resume('tok-other', 'Петя')).toBeUndefined()
    })

    it('полная комната: место освобождает тот, кто не в сети дольше минуты', () => {
      const t = makeRoom(MAX_PLAYERS)
      t.room.setOffline('p3')
      expect(t.room.canFreeSeat).toBe(false)
      expect(t.room.addPlayer('x', 'X')).toBe(false)
      vi.advanceTimersByTime(61_000)
      expect(t.room.canFreeSeat).toBe(true)
      expect(t.room.addPlayer('x', 'X')).toBe(true)
      expect(t.room.has('p3')).toBe(false)
      expect(t.room.playerCount).toBe(MAX_PLAYERS)
    })

    it(`старт игры: закрывший вкладку в лобби (не в сети дольше LOBBY_DROP_MS) убирается, мигнувший — остаётся`, () => {
      const t = makeRoom(3)
      t.room.setOffline('p2')
      vi.advanceTimersByTime(LOBBY_DROP_MS + 1)
      t.room.setOffline('p3')
      vi.advanceTimersByTime(LOBBY_DROP_MS - 1)
      t.room.start('p1')
      expect(t.r.phase).toBe('ANNOUNCE')
      expect(t.room.has('p2')).toBe(false)
      expect(t.room.has('p3')).toBe(true)
      expect(t.p('p3').spectator).toBe(false)
      expect(t.room.getPublicState().players.map(x => x.id)).toEqual(['p1', 'p3'])
    })

    it('хост ушёл из сети — хост у человека в сети; вернулся — хостом не становится, пока новый в сети', () => {
      const t = makeRoom(3)
      t.room.setOffline('p1')
      expect(t.room.getPublicState().hostId).toBe('p2')
      t.room.resume('tok-1', 'P1')
      expect(t.room.getPublicState().hostId).toBe('p2')
      t.room.setOffline('p2')
      expect(t.room.getPublicState().hostId).toBe('p1')
      t.room.setOffline('p1')
      t.room.setOffline('p3')
      expect(t.room.getPublicState().hostId).toBe('p3')   // в сети никого — хост остаётся прежним
    })
  })

  // ── кого не ждём ──
  describe('не в сети — не ждём (после OFFLINE_GRACE_MS)', () => {
    it('SHOP: остальные «Готов», последний пропал — лавка закрывается, но не раньше OFFLINE_GRACE_MS', () => {
      const t = makeRoom(2)
      t.r.closestSeen = true
      t.room.start('p1')
      expect(t.r.phase).toBe('SHOP')
      t.room.setShopReady('p1', true)
      expect(t.r.phase).toBe('SHOP')
      t.room.setOffline('p2')
      expect(t.pub('p2').offline).toBe(true)   // «нет связи» видно сразу
      vi.advanceTimersByTime(OFFLINE_GRACE_MS - 1)
      expect(t.r.phase).toBe('SHOP')            // перезагрузка страницы лавку не закрывает
      vi.advanceTimersByTime(1)
      expect(t.r.phase).toBe('ANNOUNCE')
    })

    it('вернулся в пределах OFFLINE_GRACE_MS — его по-прежнему ждут', () => {
      const t = makeRoom(2)
      t.r.closestSeen = true
      t.room.start('p1')
      t.room.setShopReady('p1', true)
      t.room.setOffline('p2')
      vi.advanceTimersByTime(1000)
      t.room.resume('tok-2', 'P2')
      vi.advanceTimersByTime(OFFLINE_GRACE_MS)
      expect(t.r.phase).toBe('SHOP')
    })

    it('BETTING: не ждём, но ставка за него ставится — черновик со стола или блайнд', () => {
      const t = makeRoom(3)
      t.toBetting('all')
      t.room.placeBet('p1', 30)
      t.room.stageChip('p2', [50, 10])
      t.room.setOffline('p2')
      vi.advanceTimersByTime(OFFLINE_GRACE_MS)
      expect(t.r.phase).toBe('BETTING')   // p3 в сети и не подтвердил
      t.room.setOffline('p3')
      vi.advanceTimersByTime(OFFLINE_GRACE_MS)
      expect(t.r.phase).toBe('QUESTION')
      expect(t.p('p2')).toMatchObject({ currentBet: 60, betChips: [50, 10] })
      expect(t.p('p3')).toMatchObject({ currentBet: 30, betChips: undefined })
      expect(t.broadcasts.filter(b => b.event === 'bet_updated').map(b => b.data.playerId)).toEqual(['p1', 'p2', 'p3'])
    })

    it('QUESTION: ответили все в сети — раунд считается, не в сети с ответом не ждут', () => {
      const t = makeRoom(3)
      t.r.currentMode = 'all'
      t.r.currentQuestion = { ...mcQ }
      t.r.schedulePhase('QUESTION', PHASE_DURATIONS.QUESTION!)
      t.room.submitAnswer('p1', 'A')
      t.room.submitAnswer('p2', 'B')
      t.room.setOffline('p3')
      vi.advanceTimersByTime(OFFLINE_GRACE_MS + LAST_ANSWER_GRACE_MS)
      expect(t.results()).toBeDefined()
    })
  })

  // ── черновик на столе ──
  describe('конец ставок: черновик на столе', () => {
    it('«для всех»: черновик не меньше блайнда — ставка он (с фишками); меньше — блайнд', () => {
      const t = makeRoom(3)
      t.toBetting('all')
      t.room.stageChip('p2', [20, 20])   // 40 ≥ 30
      t.room.stageChip('p3', [10, 10])   // 20 < 30
      expect(t.room.getStateForPlayer('p2').myStagedChips).toEqual([20, 20])
      t.room.placeBet('p1', 30)
      expect(t.room.getStateForPlayer('p1').betConfirmed).toBe(true)
      expect(t.room.getStateForPlayer('p2').betConfirmed).toBeUndefined()
      t.r.onPhaseEnd()   // таймер
      expect(t.p('p2')).toMatchObject({ currentBet: 40, betChips: [20, 20] })
      expect(t.p('p3')).toMatchObject({ currentBet: 30, betChips: undefined })
      const upd = t.broadcasts.filter(b => b.event === 'bet_updated').map(b => b.data)
      expect(upd.find(d => d.playerId === 'p2')).toMatchObject({ amount: 40, chips: [20, 20] })
    })

    it('после подтверждения черновик не меняется; керри черновика не кладёт', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const t = makeRoom(3)
      t.toBetting('kerri')
      t.room.stageChip('p1', [50], 1)   // керри
      expect(t.p('p1').items.stagedChips).toBeUndefined()
      t.room.placeBet('p2', 30, 1)
      t.room.stageChip('p2', [100], 3)
      expect(t.p('p2').items.stagedChips).toBeUndefined()
      expect(t.p('p2')).toMatchObject({ currentBet: 30, betOption: 1 })
    })

    it('керри: черновик ставится на выделенный вариант; без варианта — на верный; ничего — блайнд на верный', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const t = makeRoom(4)
      t.toBetting('kerri')
      expect(t.r.gladiatorId).toBe('p1')
      t.room.stageChip('p2', [50], 2)
      t.room.stageChip('p3', [20, 20])
      const st = t.room.getStateForPlayer('p2')
      expect(st).toMatchObject({ myStagedChips: [50], myStagedOption: 2 })
      t.r.onPhaseEnd()
      expect(t.p('p2')).toMatchObject({ currentBet: 50, betOption: 2, betChips: [50] })
      expect(t.p('p3')).toMatchObject({ currentBet: 40, betOption: 0, betChips: [20, 20] })
      expect(t.p('p4')).toMatchObject({ currentBet: 30, betOption: 0 })
      expect(t.p('p1').currentBet).toBe(0)
      expect(t.room.getStateForPlayer('p2').myStagedChips).toBeUndefined()   // в QUESTION черновика уже нет
    })
  })

  // ── керри: банк по выбору керри ──
  describe('керри: банк делят угадавшие выбор керри', () => {
    it('керри выбрал неверный C — выигрывают поставившие на C, пропорционально', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const t = makeRoom(4)
      t.toBetting('kerri')
      t.room.placeBet('p2', 50, 2)
      t.room.placeBet('p3', 40, 0)
      t.room.placeBet('p4', 30, 1)
      expect(t.r.phase).toBe('QUESTION')
      t.room.submitAnswer('p1', 'C')
      vi.advanceTimersByTime(LAST_ANSWER_GRACE_MS)
      expect(t.res('p2').delta).toBe(70)
      expect(t.res('p3').delta).toBe(-40)
      expect(t.res('p4').delta).toBe(-30)
      expect(t.res('p1').delta).toBe(0)
      expect(t.src('p2', 'Угадал выбор керри')).toBe(70)
      expect(t.src('p3', 'Не угадал выбор керри')).toBe(-40)
      expect(t.src('p1', 'Не закеррил')).toBe(0)
      // после расчёта вариант виден всем, в т.ч. керри; итоги — в личном стейте
      const st = t.room.getStateForPlayer('p1')
      expect(st.players.find(x => x.id === 'p2')!.betOption).toBe(2)
      expect(st.roundResults?.results).toEqual(t.results())
    })

    it('керри не ответил — у толпы дельт нет, серия толпы не сбивается', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const t = makeRoom(3)
      t.toBetting('kerri')
      t.r.players.get('p2').streak = 2
      t.room.placeBet('p2', 50, 2)
      t.room.placeBet('p3', 40, 0)
      vi.advanceTimersByTime(PHASE_DURATIONS.QUESTION! * 1000)
      for (const id of ['p1', 'p2', 'p3']) expect(t.res(id).delta).toBe(0)
      expect(t.src('p2', 'Керри не ответил')).toBe(0)
      expect(t.src('p1', 'Не ответил')).toBe(0)
      expect(t.r.players.get('p2').streak).toBe(2)
    })
  })

  // ── растущие бонусы ──
  describe('бонусы керри и «кто ближе» растут', () => {
    it('формулы: керри 300 + 50·(n−1), ближайший 200 + 40·(n−1)', () => {
      expect([1, 2, 3].map(gladiatorBonus)).toEqual([300, 350, 400])
      expect([1, 2, 3].map(closestWinnerBonus)).toEqual([200, 240, 280])
      expect(gladiatorBonus(0)).toBe(300)   // без nextRound (тесты) — база
    })

    it('второй раунд керри — $350', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const t = makeRoom(3)
      t.room.start('p1')                              // all
      for (let i = 0; i < 4; i++) t.r.nextRound()     // kerri, closest, all, kerri
      expect(t.r.currentMode).toBe('kerri')
      expect(t.r.modeRounds.kerri).toBe(2)
      t.r.gladiatorId = 'p1'
      t.r.schedulePhase('QUESTION', PHASE_DURATIONS.QUESTION!)
      vi.advanceTimersByTime(LIGHTNING_MS)
      t.room.submitAnswer('p1', 'A')
      vi.advanceTimersByTime(LAST_ANSWER_GRACE_MS)
      expect(t.src('p1', 'Закеррил')).toBe(350)
    })

    it('второй «кто ближе» — ближайшему $240, за точное +$200 сверху (не растёт); серия — от $240', () => {
      const t = makeRoom(3)
      t.room.start('p1')                              // all
      for (let i = 0; i < 5; i++) t.r.nextRound()     // kerri, closest, all, kerri, closest
      expect(t.r.currentMode).toBe('closest')
      expect(t.r.modeRounds.closest).toBe(2)
      t.p('p2').streak = 1
      t.r.schedulePhase('QUESTION', PHASE_DURATIONS.QUESTION!)
      t.room.submitAnswer('p1', 300)
      t.room.submitAnswer('p2', 330)
      t.room.submitAnswer('p3', 100)
      vi.advanceTimersByTime(LAST_ANSWER_GRACE_MS)
      expect(t.src('p2', 'Ближайший ответ')).toBe(240)
      expect(t.src('p2', 'Угадал точно')).toBe(CLOSEST_EXACT_BONUS)
      expect(t.src('p2', 'Серия ×2')).toBe(50)   // 240 × 0.2 = 48 → $50
      expect(t.res('p1').delta).toBe(0)
    })
  })

  // ── подачка ──
  describe('подачка', () => {
    function lose(chips: number, bet: number) {
      const t = makeRoom(2)
      t.p('p2').chips = chips
      t.p('p1').currentBet = bet
      t.p('p2').currentBet = bet
      t.r.currentMode = 'all'
      t.r.currentQuestion = { ...mcQ }
      t.r.schedulePhase('QUESTION', PHASE_DURATIONS.QUESTION!)
      t.room.submitAnswer('p1', 'A')
      t.room.submitAnswer('p2', 'B')
      vi.advanceTimersByTime(LAST_ANSWER_GRACE_MS)
      return t
    }

    it('баланс дошёл до $0 — ровно $50, источник «Подачка»', () => {
      const t = lose(100, 100)
      expect(t.p('p2').chips).toBe(50)
      expect(t.res('p2').delta).toBe(-50)
      expect(t.res('p2').sources).toEqual([
        { label: 'Ответил неверно', delta: -100 },
        { label: 'Подачка', delta: 50 },
      ])
    })

    it('остался хоть $10 — подачки нет', () => {
      const t = lose(110, 100)
      expect(t.p('p2').chips).toBe(10)
      expect(t.src('p2', 'Подачка')).toBeUndefined()
    })
  })
})

// ── движок: сокет ↔ игрок ──
describe('GameEngine: сессии', () => {
  const emptyLibrary: Library = { categories: [], stats: null, friends: null, heroNames: {}, warnings: [] }
  const TOKEN = 'tokenAAAAAAAAAAAAAAA'

  function makeEngine() {
    const sent: Array<{ ch: string; event: string; data: any }> = []
    const io = {
      to: (ch: string) => ({
        emit: (event: string, data: any) => { sent.push({ ch, event, data }); return true },
        except: () => ({ emit: () => true }),
      }),
    }
    return { e: new GameEngine(io as any, new QuestionHistory(), emptyLibrary), sent }
  }

  function makeSocket(id: string) {
    const rooms = new Set<string>()
    const emitted: Msg[] = []
    return {
      id, rooms, emitted,
      join: (r: string) => { rooms.add(r) },
      leave: (r: string) => { rooms.delete(r) },
      emit: (event: string, data: any) => { emitted.push({ event, data }); return true },
      disconnect: vi.fn(),
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('вход: свой id игрока (не socket.id) — joined и game_state сокету; сокет в комнате и в канале игрока', () => {
    const { e, sent } = makeEngine()
    const s = makeSocket('s1')
    e.joinRoom(s as any, 'Вася', 'ROOM', TOKEN)
    const id = e.ctx('s1')!.id
    expect(id).toMatch(/^p-[0-9a-f]{12}$/)
    expect(s.emitted.find(m => m.event === 'joined')!.data).toEqual({ playerId: id })
    expect(s.emitted.find(m => m.event === 'game_state')!.data.players[0].id).toBe(id)
    expect([...s.rooms].sort()).toEqual(['ROOM', playerChannel(id)].sort())
    // личные события комнаты — в канал игрока
    sent.length = 0
    e.ctx('s1')!.room.identify(id, null)
    e.ctx('s1')!.room.setFirstGame(id, true)
    expect(sent.some(m => m.ch === playerChannel(id) && m.event === 'game_state')).toBe(true)
  })

  it('второй сокет с тем же токеном — тот же игрок; старому session_replaced и отключение', () => {
    const { e } = makeEngine()
    const a = makeSocket('a')
    const b = makeSocket('b')
    e.joinRoom(a as any, 'Вася', 'ROOM', TOKEN)
    const id = e.ctx('a')!.id
    e.joinRoom(b as any, 'Вася', 'ROOM', TOKEN)
    expect(e.ctx('b')!.id).toBe(id)
    expect(e.ctx('a')).toBeUndefined()
    expect(a.emitted.some(m => m.event === 'session_replaced')).toBe(true)
    expect(a.disconnect).toHaveBeenCalledWith(true)
    expect(a.rooms.size).toBe(0)
    const room = e.getRoom('b')!
    expect(room.playerCount).toBe(1)
    e.disconnect('a')   // поздний disconnect старого сокета не уводит игрока из сети
    expect(room.onlineHumans).toBe(1)
  })

  it('обрыв и возвращение по токену — тот же игрок с фишками; новый игрок с тем же именем, пока он в сети', () => {
    const { e } = makeEngine()
    const a = makeSocket('a')
    e.joinRoom(a as any, 'Вася', 'ROOM', TOKEN)
    const { room, id } = e.ctx('a')!
    ;(room as any).players.get(id).chips = 340
    const c = makeSocket('c')
    e.joinRoom(c as any, 'Вася', 'ROOM')   // без токена, Вася в сети — другой игрок
    expect(e.ctx('c')!.id).not.toBe(id)
    e.disconnect('a')
    expect(room.getPublicState().players.find(x => x.id === id)!.offline).toBe(true)
    const b = makeSocket('b')
    e.joinRoom(b as any, 'Вася', 'ROOM', TOKEN)
    expect(e.ctx('b')!.id).toBe(id)
    expect((room as any).players.get(id).chips).toBe(340)
    expect(room.playerCount).toBe(2)
  })

  it('без токена, но с именем того, кто не в сети, — это он (зашёл с другого устройства)', () => {
    const { e } = makeEngine()
    e.joinRoom(makeSocket('a') as any, 'Вася', 'ROOM')
    e.joinRoom(makeSocket('x') as any, 'Петя', 'ROOM')
    const id = e.ctx('a')!.id
    e.disconnect('a')
    e.joinRoom(makeSocket('b') as any, 'вася', 'ROOM')
    expect(e.ctx('b')!.id).toBe(id)
    expect(e.getRoom('b')!.playerCount).toBe(2)
  })

  it(`никого в сети — комната ждёт ROOM_EMPTY_TTL_MS и закрывается; вернулся раньше — живёт`, () => {
    const { e } = makeEngine()
    e.joinRoom(makeSocket('a') as any, 'A', 'ONE', TOKEN)
    e.disconnect('a')
    vi.advanceTimersByTime(ROOM_EMPTY_TTL_MS - 1)
    expect(e.roomCount).toBe(1)
    vi.advanceTimersByTime(1)
    expect(e.roomCount).toBe(0)

    e.joinRoom(makeSocket('b') as any, 'B', 'TWO', TOKEN)
    e.disconnect('b')
    vi.advanceTimersByTime(ROOM_EMPTY_TTL_MS / 2)
    e.joinRoom(makeSocket('b2') as any, 'B', 'TWO', TOKEN)
    vi.advanceTimersByTime(ROOM_EMPTY_TTL_MS)
    expect(e.roomCount).toBe(1)
    expect(e.getRoom('b2')!.onlineHumans).toBe(1)
  })

  it('leave_game (leaveRoom) — уходит совсем; ушёл последний — комната закрывается сразу', () => {
    const { e } = makeEngine()
    const a = makeSocket('a')
    e.joinRoom(a as any, 'A', 'ROOM', TOKEN)
    e.joinRoom(makeSocket('b') as any, 'B', 'ROOM')
    const room = e.getRoom('a')!
    e.leaveRoom('a')
    expect(room.playerCount).toBe(1)
    expect(e.ctx('a')).toBeUndefined()
    expect(a.rooms.size).toBe(0)
    e.leaveRoom('b')
    expect(e.roomCount).toBe(0)
  })

  it('полная комната: место того, кто не в сети дольше минуты, отдаётся новому', () => {
    const { e } = makeEngine()
    for (let i = 0; i < MAX_PLAYERS; i++) e.joinRoom(makeSocket(`s${i}`) as any, `P${i}`, 'FULL')
    e.disconnect('s3')
    const late = makeSocket('late')
    e.joinRoom(late as any, 'L', 'FULL')
    expect(late.emitted.find(m => m.event === 'join_error')?.data.reason).toBe('room_full')
    vi.advanceTimersByTime(61_000)
    e.joinRoom(late as any, 'L', 'FULL')
    expect(e.getRoom('late')!.playerCount).toBe(MAX_PLAYERS)
    expect(e.getRoom('late')!.getPublicState().players.some(x => x.name === 'P3')).toBe(false)
  })
})
