// Валидация входящих событий, лимит событий на сокет, троттлинг оценок, чистка имени, проверка Origin.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { registerHandlers, cleanName, EVENTS_BURST, EVENTS_PER_SECOND, RATE_FLUSH_MS, NAME_MAX } from '../handlers'
import { originAllowed } from '../origin'

function setup() {
  const handlers = new Map<string, (p: unknown) => void>()
  const emitted: Array<{ event: string; data: any }> = []
  const room = {
    start: vi.fn(), placeBet: vi.fn(), submitAnswer: vi.fn(), buyItem: vi.fn(), useItem: vi.fn(),
    setShopReady: vi.fn(), relayHover: vi.fn(), stageChip: vi.fn(), identify: vi.fn(), rateQuestion: vi.fn(),
    addBot: vi.fn(), removeBot: vi.fn(), setFirstGame: vi.fn(), setSettings: vi.fn(),
  }
  // игрок — не сокет: ctx отдаёт комнату и id игрока (p1), а не socket.id
  const engine = {
    joinRoom: vi.fn(), ctx: vi.fn(() => ({ room, id: 'p1' })), leaveRoom: vi.fn(), disconnect: vi.fn(),
  }
  const socket = {
    id: 's1',
    on: (event: string, fn: (p: unknown) => void) => { handlers.set(event, fn) },
    emit: (event: string, data: any) => { emitted.push({ event, data }); return true },
  }
  registerHandlers(socket as any, engine as any)
  const send = (event: string, payload?: unknown) => handlers.get(event)!(payload)
  return { send, room, engine, emitted, handlers }
}

type Room = ReturnType<typeof setup>['room']
type Row = [event: string, payload: unknown, method: keyof Room | null]

describe('socket/handlers', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  const rows: Row[] = [
    // place_bet: целые, кратные 10, ≥ 0; вариант керри — целый индекс; фишки — номиналы
    ['place_bet', { amount: 30 }, 'placeBet'],
    ['place_bet', { amount: 0 }, 'placeBet'],
    ['place_bet', { amount: 35 }, null],
    ['place_bet', { amount: -10 }, null],
    ['place_bet', { amount: 10.5 }, null],
    ['place_bet', { amount: '30' }, null],
    ['place_bet', { amount: 30, option: 'win' }, null],
    ['place_bet', { amount: 30, option: 1.5 }, null],
    ['place_bet', { amount: 30, option: -1 }, null],
    ['place_bet', { amount: 30, option: 99 }, null],
    ['place_bet', { amount: 30, option: 2 }, 'placeBet'],
    ['place_bet', { amount: 30, chips: [10, 20] }, 'placeBet'],
    ['place_bet', { amount: 30, chips: [15] }, null],
    ['place_bet', { amount: 30, chips: new Array(41).fill(10) }, null],
    ['place_bet', undefined, null],
    // submit_answer: строка ≤ 300 или число; блинк — boolean
    ['submit_answer', { answer: 'A' }, 'submitAnswer'],
    ['submit_answer', { answer: 42 }, 'submitAnswer'],
    ['submit_answer', { answer: 'x'.repeat(301) }, null],
    ['submit_answer', { answer: ['A', 'B'] }, null],
    ['submit_answer', { answer: null }, null],
    ['submit_answer', { answer: 'A', blink: 'yes' }, null],
    ['submit_answer', { answer: 'A', blink: true }, 'submitAnswer'],
    // предметы
    ['buy_item', { item: 'gem' }, 'buyItem'],
    ['buy_item', { item: 'rapier' }, null],
    ['use_item', { item: 'hex', targetId: 'p2' }, 'useItem'],
    ['use_item', { item: 'hex', targetId: 'x'.repeat(65) }, null],
    ['use_item', { item: 'hex', targetId: 5 }, null],
    ['shop_ready', { ready: true }, 'setShopReady'],
    ['shop_ready', { ready: 'true' }, null],
    // прочее
    ['gladiator_hover', { optionIndex: 2 }, 'relayHover'],
    ['gladiator_hover', { optionIndex: null }, 'relayHover'],
    ['gladiator_hover', { optionIndex: 1.5 }, null],
    ['stage_chip', { chips: [10, 500] }, 'stageChip'],
    ['stage_chip', { chips: 'lots' }, null],
    ['stage_chip', { chips: [10], option: 2 }, 'stageChip'],
    ['identify', { friendId: 7 }, 'identify'],
    ['identify', { friendId: null }, 'identify'],
    ['identify', { friendId: 'me' }, null],
    ['start_game', undefined, 'start'],
    // боты: add_bot без данных; remove_bot — id строкой до 64 символов
    ['add_bot', undefined, 'addBot'],
    ['remove_bot', { id: 'bot-1' }, 'removeBot'],
    ['remove_bot', { id: '' }, null],
    ['remove_bot', { id: 7 }, null],
    ['remove_bot', { id: 'x'.repeat(65) }, null],
    ['remove_bot', undefined, null],
    // «играем впервые»: только boolean
    ['set_first_game', { on: true }, 'setFirstGame'],
    ['set_first_game', { on: false }, 'setFirstGame'],
    ['set_first_game', { on: 'yes' }, null],
    ['set_first_game', undefined, null],
    // настройки игры: каждое поле — boolean или нет; хоть одно
    ['set_settings', { jackpot: false }, 'setSettings'],
    ['set_settings', { questionBet: true }, 'setSettings'],
    ['set_settings', { jackpot: true, questionBet: false }, 'setSettings'],
    ['set_settings', { jackpot: 'no' }, null],
    ['set_settings', { jackpot: true, questionBet: 1 }, null],
    ['set_settings', {}, null],
    ['set_settings', undefined, null],
  ]

  it.each(rows)('%s %j → %s', (event, payload, method) => {
    const { send, room } = setup()
    send(event, payload)
    const called = (Object.keys(room) as Array<keyof Room>).filter(k => room[k].mock.calls.length)
    expect(called).toEqual(method ? [method] : [])
  })

  it('place_bet с вариантом керри: в комнату уходит id игрока, не сокета; банк-ставок и взяток больше нет', () => {
    const { send, room, handlers } = setup()
    expect(handlers.has('place_bank_bet')).toBe(false)
    expect(handlers.has('pay_bribe')).toBe(false)
    send('place_bet', { amount: 30, option: 2, chips: [10, 20] })
    expect(room.placeBet).toHaveBeenCalledWith('p1', 30, 2, [10, 20])
  })

  it('set_settings: в комнату — только переданные поля', () => {
    const { send, room } = setup()
    send('set_settings', { questionBet: false, junk: 1 })
    expect(room.setSettings).toHaveBeenCalledWith('p1', { questionBet: false })
  })

  it('событие без привязки сокета к игроку (ctx пуст) — молча мимо', () => {
    const { send, room, engine } = setup()
    engine.ctx.mockReturnValue(undefined as any)
    send('place_bet', { amount: 30 })
    send('start_game')
    expect(room.placeBet).not.toHaveBeenCalled()
    expect(room.start).not.toHaveBeenCalled()
  })

  it('исключение в обработчике не выходит наружу', () => {
    const { send, room } = setup()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    room.start.mockImplementation(() => { throw new Error('бум') })
    expect(() => send('start_game')).not.toThrow()
  })

  describe('join_game', () => {
    it('чистое имя и код — в движок', () => {
      const { send, engine } = setup()
      send('join_game', { name: '  Вася  ', gameCode: ' ab12 ' })
      expect(engine.joinRoom).toHaveBeenCalledWith(expect.anything(), 'Вася', 'AB12', undefined)
    })

    it('токен сессии: годный (16–64 символа A-Za-z0-9_-) — в движок, мусор — отбрасывается', () => {
      const { send, engine } = setup()
      const good = 'abcdEFGH_-123456'
      send('join_game', { name: 'Вася', gameCode: 'AB', token: good })
      send('join_game', { name: 'Вася', gameCode: 'AB', token: 'коротко' })
      send('join_game', { name: 'Вася', gameCode: 'AB', token: 'a'.repeat(65) })
      send('join_game', { name: 'Вася', gameCode: 'AB', token: 'abcdEFGH 123456!!' })
      send('join_game', { name: 'Вася', gameCode: 'AB', token: 42 })
      expect(engine.joinRoom.mock.calls.map(c => c[3])).toEqual([good, undefined, undefined, undefined, undefined])
    })

    it('плохой код — join_error bad_code', () => {
      const { send, engine, emitted } = setup()
      send('join_game', { name: 'Вася', gameCode: 'АБВ' })
      send('join_game', { name: 'Вася', gameCode: 'A' })
      expect(engine.joinRoom).not.toHaveBeenCalled()
      expect(emitted.map(e => e.data.reason)).toEqual(['bad_code', 'bad_code'])
    })

    it('имя из одних невидимых символов — join_error bad_name', () => {
      const { send, engine, emitted } = setup()
      send('join_game', { name: '\u200b\u202e \u2066', gameCode: 'AB' })
      send('join_game', { name: 42, gameCode: 'AB' })
      expect(engine.joinRoom).not.toHaveBeenCalled()
      expect(emitted.map(e => e.data.reason)).toEqual(['bad_name', 'bad_name'])
    })
  })

  describe('cleanName', () => {
    it.each([
      ['Вася', 'Вася'],
      ['  Ва  ся ', 'Ва ся'],
      ['Ва\u200bся', 'Вася'],                // zero-width space
      ['\u202easaV', 'asaV'],                 // RTL override
      ['a\u0000b\u0007c', 'abc'],             // управляющие
      ['\ufeffName', 'Name'],                 // BOM
      ['a\u2028b', 'ab'],                     // разделитель строк
      ['q\u0301\u0302\u0303\u0304\u0305', 'q\u0301\u0302'],   // «залго» — не больше двух диакритик
      ['', null],
      ['   ', null],
      ['\u200b\u200d', null],
    ])('%j → %j', (raw, clean) => {
      expect(cleanName(raw)).toBe(clean)
    })

    it(`не длиннее ${NAME_MAX} символов (эмодзи не режется пополам)`, () => {
      expect(Array.from(cleanName('я'.repeat(100))!).length).toBe(NAME_MAX)
      const emoji = cleanName('😀'.repeat(30))!
      expect(Array.from(emoji).length).toBe(NAME_MAX)
      expect(emoji.endsWith('😀')).toBe(true)
    })
  })

  it('лимит событий: сверх ведра — молча отброшено, со временем — снова принимается; disconnect — всегда', () => {
    const { send, room, engine } = setup()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (let i = 0; i < EVENTS_BURST + 10; i++) send('stage_chip', { chips: [10] })
    expect(room.stageChip).toHaveBeenCalledTimes(EVENTS_BURST)
    vi.advanceTimersByTime(1000)
    for (let i = 0; i < EVENTS_PER_SECOND + 10; i++) send('stage_chip', { chips: [10] })
    expect(room.stageChip).toHaveBeenCalledTimes(EVENTS_BURST + EVENTS_PER_SECOND)
    send('disconnect', 'transport close')
    expect(engine.disconnect).toHaveBeenCalledWith('s1')
  })

  describe('выход и обрыв', () => {
    it('leave_game — явный уход (leaveRoom), disconnect — обрыв (disconnect), это разные вещи', () => {
      const { send, engine } = setup()
      send('leave_game')
      expect(engine.leaveRoom).toHaveBeenCalledWith('s1')
      expect(engine.disconnect).not.toHaveBeenCalled()
      send('disconnect', 'transport close')
      expect(engine.disconnect).toHaveBeenCalledWith('s1')
    })

    it('disconnect приходит напрямую на сокет (причина — строка) и не режется лимитом событий', () => {
      const { send, engine } = setup()
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      for (let i = 0; i < EVENTS_BURST + 10; i++) send('stage_chip', { chips: [10] })
      send('disconnect', 'ping timeout')
      expect(engine.disconnect).toHaveBeenCalledTimes(1)
    })

    it('исключение движка при обрыве не выходит наружу', () => {
      const { send, engine } = setup()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      engine.disconnect.mockImplementation(() => { throw new Error('бум') })
      expect(() => send('disconnect', 'x')).not.toThrow()
    })

    it('client_log: годная запись не падает, мусор мимо', () => {
      const { send } = setup()
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      send('client_log', { reason: 'transport close', downMs: 1500, transport: 'websocket', hidden: true })
      expect(log).toHaveBeenCalledTimes(1)
      send('client_log', { reason: 5, downMs: 'x' })
      expect(log).toHaveBeenCalledTimes(1)
    })

    it('leave_game досылает недосланную оценку до выхода', () => {
      const { send, room, engine } = setup()
      send('rate_question', { questionId: 'q1', score: 1 })
      send('leave_game')
      expect(room.rateQuestion).toHaveBeenCalledWith('p1', 'q1', { score: 1 })
      expect(engine.leaveRoom).toHaveBeenCalled()
    })
  })

  describe('rate_question', () => {
    it('серия нажатий — одна запись через RATE_FLUSH_MS, поля сливаются', () => {
      const { send, room } = setup()
      send('rate_question', { questionId: 'q1', score: 1 })
      send('rate_question', { questionId: 'q1', score: 2 })
      send('rate_question', { questionId: 'q1', difficulty: -1 })
      expect(room.rateQuestion).not.toHaveBeenCalled()
      vi.advanceTimersByTime(RATE_FLUSH_MS)
      expect(room.rateQuestion).toHaveBeenCalledTimes(1)
      expect(room.rateQuestion).toHaveBeenCalledWith('p1', 'q1', { score: 2, difficulty: -1 })
    })

    it('другой вопрос — прежняя оценка уходит сразу; disconnect досылает', () => {
      const { send, room } = setup()
      send('rate_question', { questionId: 'q1', score: 1 })
      send('rate_question', { questionId: 'q2', score: null })
      expect(room.rateQuestion).toHaveBeenCalledWith('p1', 'q1', { score: 1 })
      send('disconnect')
      expect(room.rateQuestion).toHaveBeenLastCalledWith('p1', 'q2', { score: null })
    })

    it.each([
      [{ questionId: 'q', score: 3 }],
      [{ questionId: 'q', score: 0 }],
      [{ questionId: 'q', difficulty: 2 }],
      [{ questionId: 5, score: 1 }],
      [{ questionId: 'x'.repeat(201), score: 1 }],
    ])('мусор %j — мимо', payload => {
      const { send, room } = setup()
      send('rate_question', payload)
      vi.advanceTimersByTime(RATE_FLUSH_MS)
      expect(room.rateQuestion).not.toHaveBeenCalled()
    })
  })

  describe('Origin', () => {
    it.each([
      ['http://localhost:5173', /^http:\/\/localhost(:\d+)?$/, true],
      ['http://evil.com', /^http:\/\/localhost(:\d+)?$/, false],
      ['http://localhost.evil.com', /^http:\/\/localhost(:\d+)?$/, false],
      ['https://mayak100.github.io', 'https://mayak100.github.io', true],
      ['https://mayak100.github.io.evil.com', 'https://mayak100.github.io', false],
      [undefined, 'https://mayak100.github.io', true],   // не браузер
    ] as Array<[string | undefined, string | RegExp, boolean]>)('%s при %s → %s', (origin, allowed, ok) => {
      expect(originAllowed(origin, allowed)).toBe(ok)
    })
  })
})
