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
    payBribe: vi.fn(), addBot: vi.fn(), removeBot: vi.fn(), setFirstGame: vi.fn(),
  }
  const engine = { joinRoom: vi.fn(), getRoom: vi.fn(() => room), leaveRoom: vi.fn() }
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
    // place_bet: целые, кратные 10, ≥ 0; сторона win/lose; фишки — номиналы; банк — объект с целым индексом
    ['place_bet', { amount: 30 }, 'placeBet'],
    ['place_bet', { amount: 0 }, 'placeBet'],
    ['place_bet', { amount: 35 }, null],
    ['place_bet', { amount: -10 }, null],
    ['place_bet', { amount: 10.5 }, null],
    ['place_bet', { amount: '30' }, null],
    ['place_bet', { amount: 30, target: 'maybe' }, null],
    ['place_bet', { amount: 30, target: 'win' }, 'placeBet'],
    ['place_bet', { amount: 30, chips: [10, 20] }, 'placeBet'],
    ['place_bet', { amount: 30, chips: [15] }, null],
    ['place_bet', { amount: 30, chips: new Array(41).fill(10) }, null],
    ['place_bet', { amount: 30, bankBet: { optionIndex: 1, amount: 20 } }, 'placeBet'],
    ['place_bet', { amount: 30, bankBet: { optionIndex: 1.5, amount: 20 } }, null],
    ['place_bet', { amount: 30, bankBet: { optionIndex: 1, amount: 25 } }, null],
    ['place_bet', { amount: 30, bankBet: null }, null],
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
    ['identify', { friendId: 7 }, 'identify'],
    ['identify', { friendId: null }, 'identify'],
    ['identify', { friendId: 'me' }, null],
    ['start_game', undefined, 'start'],
    ['pay_bribe', undefined, 'payBribe'],
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
  ]

  it.each(rows)('%s %j → %s', (event, payload, method) => {
    const { send, room } = setup()
    send(event, payload)
    const called = (Object.keys(room) as Array<keyof Room>).filter(k => room[k].mock.calls.length)
    expect(called).toEqual(method ? [method] : [])
  })

  it('place_bet с банк-ставкой (place_bank_bet больше нет)', () => {
    const { send, room, handlers } = setup()
    expect(handlers.has('place_bank_bet')).toBe(false)
    send('place_bet', { amount: 30, target: 'lose', chips: [10, 20, 20], bankBet: { optionIndex: 2, amount: 20 } })
    expect(room.placeBet).toHaveBeenCalledWith('s1', 30, 'lose', [10, 20, 20], { optionIndex: 2, amount: 20 })
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
      expect(engine.joinRoom).toHaveBeenCalledWith(expect.anything(), 'Вася', 'AB12')
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
    send('disconnect')
    expect(engine.leaveRoom).toHaveBeenCalled()
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
      expect(room.rateQuestion).toHaveBeenCalledWith('s1', 'q1', { score: 2, difficulty: -1 })
    })

    it('другой вопрос — прежняя оценка уходит сразу; disconnect досылает', () => {
      const { send, room } = setup()
      send('rate_question', { questionId: 'q1', score: 1 })
      send('rate_question', { questionId: 'q2', score: null })
      expect(room.rateQuestion).toHaveBeenCalledWith('s1', 'q1', { score: 1 })
      send('disconnect')
      expect(room.rateQuestion).toHaveBeenLastCalledWith('s1', 'q2', { score: null })
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
