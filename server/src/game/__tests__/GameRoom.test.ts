import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GameRoom } from '../GameRoom'
import type { Question } from '@cumsino/shared'
import {
  GLADIATOR_BONUS,
  STARTING_CHIPS,
  WIN_CHIPS,
  CLOSEST_WINNER_BONUS,
  CLOSEST_EXACT_BONUS,
  ANSWER_REVEAL_MS,
  ANSWER_REVEAL_NOTES_MS,
  LAST_ANSWER_GRACE_MS,
  MAX_PLAYERS,
} from '@cumsino/shared'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mcQ: Question = {
  id: 'q-mc',
  mode: 'all',
  topic: 'Test',
  text: 'Q?',
  options: ['A', 'B', 'C', 'D'],
  answer: 'A',
}

const cnQ: Question = {
  id: 'q-cn',
  mode: 'closest',
  topic: 'Test',
  text: 'How much?',
  numericAnswer: 330,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRoom(question: Question = mcQ) {
  const broadcasts: Array<{ event: string; data: unknown }> = []
  const playerMsgs: Array<{ playerId: string; event: string; data: unknown }> = []
  const room = new GameRoom('r1', () => question)
  room.on('broadcast', ({ event, data }) => broadcasts.push({ event, data }))
  room.on('sendToPlayer', ({ playerId, event, data }) =>
    playerMsgs.push({ playerId, event, data })
  )
  return { room, broadcasts, playerMsgs }
}

// Bypass TypeScript private — for test state manipulation only
const priv = (room: GameRoom): any => room as any

function addPlayers(room: GameRoom, count: number) {
  for (let i = 1; i <= count; i++) room.addPlayer(`p${i}`, `P${i}`)
}

// ---------------------------------------------------------------------------
// describe blocks
// ---------------------------------------------------------------------------

describe('GameRoom', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // Player management
  // -------------------------------------------------------------------------

  describe('управление игроками', () => {
    it('первый addPlayer становится хостом', () => {
      const { room } = makeRoom()
      room.addPlayer('p1', 'Alice')
      expect(priv(room).hostId).toBe('p1')
    })

    it('второй игрок не заменяет хоста', () => {
      const { room } = makeRoom()
      room.addPlayer('p1', 'Alice')
      room.addPlayer('p2', 'Bob')
      expect(priv(room).hostId).toBe('p1')
    })

    it(`лимит ${MAX_PLAYERS} игроков: лишний не входит, addPlayer → false`, () => {
      const { room } = makeRoom()
      for (let i = 1; i <= MAX_PLAYERS; i++) expect(room.addPlayer(`p${i}`, `P${i}`)).toBe(true)
      expect(room.isFull).toBe(true)
      expect(room.addPlayer('extra', 'X')).toBe(false)
      expect(priv(room).players.size).toBe(MAX_PLAYERS)
      expect(room.addPlayer('p1', 'P1')).toBe(true)   // повторный join своего сокета — не отказ
    })

    it('start() отклоняет не-хоста', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      room.start('p2')
      expect(priv(room).phase).toBe('LOBBY')
    })

    it('start() хостом начинает первый раунд «для всех» без лавки', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      room.start('p1')
      expect(priv(room).phase).toBe('ANNOUNCE')
      expect(priv(room).currentMode).toBe('all')
    })

    it('start() повторно игнорируется (не LOBBY)', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      room.start('p1')
      expect(priv(room).phase).toBe('ANNOUNCE')
      room.start('p1') // second call
      expect(priv(room).phase).toBe('ANNOUNCE')
      expect(priv(room).roundIndex).toBe(1)
    })

    it('стартовые чипы у каждого игрока = STARTING_CHIPS', () => {
      const { room } = makeRoom()
      room.addPlayer('p1', 'Alice')
      expect(priv(room).players.get('p1').chips).toBe(STARTING_CHIPS)
    })
  })

  // -------------------------------------------------------------------------
  // checkWinner
  // -------------------------------------------------------------------------

  describe('checkWinner', () => {
    it('игрок с WIN_CHIPS побеждает', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      priv(room).players.get('p2').chips = WIN_CHIPS
      expect(priv(room).checkWinner()?.id).toBe('p2')
    })

    it('нет победителя если у всех меньше WIN_CHIPS', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      expect(priv(room).checkWinner()).toBeUndefined()
    })

    it('игрок с chips > WIN_CHIPS тоже побеждает', () => {
      const { room } = makeRoom()
      addPlayers(room, 1)
      priv(room).players.get('p1').chips = WIN_CHIPS + 100
      expect(priv(room).checkWinner()?.id).toBe('p1')
    })
  })

  // -------------------------------------------------------------------------
  // applyDeltas
  // -------------------------------------------------------------------------

  describe('applyDeltas', () => {
    it('чипы не уходят ниже нуля', () => {
      const { room } = makeRoom()
      addPlayers(room, 1)
      const player = priv(room).players.get('p1')
      player.chips = 100
      priv(room).applyDeltas([
        { playerId: 'p1', delta: -500, chipBreakdown: {}, sources: [] },
      ])
      expect(player.chips).toBe(0)
    })

    it('положительная дельта добавляется', () => {
      const { room } = makeRoom()
      addPlayers(room, 1)
      const player = priv(room).players.get('p1')
      player.chips = 100
      priv(room).applyDeltas([
        { playerId: 'p1', delta: 200, chipBreakdown: {}, sources: [] },
      ])
      expect(player.chips).toBe(300)
    })

    it('несуществующий playerId игнорируется', () => {
      const { room } = makeRoom()
      addPlayers(room, 1)
      expect(() =>
        priv(room).applyDeltas([
          { playerId: 'ghost', delta: 100, chipBreakdown: {}, sources: [] },
        ])
      ).not.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // getStateForPlayer
  // -------------------------------------------------------------------------

  describe('getStateForPlayer', () => {
    function setupKerri(room: GameRoom, phase: 'BETTING' | 'QUESTION' = 'BETTING') {
      const r = priv(room)
      r.phase = phase
      r.currentMode = 'kerri'
      r.gladiatorId = 'p1'
      r.currentQuestion = { ...mcQ }
    }

    it('толпа в BETTING (kerri) видит gladiatorAnswer', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      setupKerri(room, 'BETTING')
      expect(room.getStateForPlayer('p2').gladiatorAnswer).toBe('A')
    })

    it('гладиатор в BETTING не видит gladiatorAnswer', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      setupKerri(room, 'BETTING')
      expect(room.getStateForPlayer('p1').gladiatorAnswer).toBeUndefined()
    })

    it('толпа в QUESTION (kerri) видит gladiatorAnswer', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      setupKerri(room, 'QUESTION')
      expect(room.getStateForPlayer('p2').gladiatorAnswer).toBe('A')
    })

    it('режим all: никто не видит gladiatorAnswer', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      const r = priv(room)
      r.phase = 'BETTING'
      r.currentMode = 'all'
      r.currentQuestion = { ...mcQ }
      expect(room.getStateForPlayer('p1').gladiatorAnswer).toBeUndefined()
      expect(room.getStateForPlayer('p2').gladiatorAnswer).toBeUndefined()
    })

    it('betOption толпы керри до расчёта видит только толпа (не керри, не зритель, не посторонний)', () => {
      const { room } = makeRoom()
      addPlayers(room, 3)
      const r = priv(room)
      r.phase = 'BETTING'
      r.currentMode = 'kerri'
      r.gladiatorId = 'p1'
      r.currentQuestion = { ...mcQ }
      r.players.get('p3').spectator = true
      Object.assign(r.players.get('p2'), { currentBet: 100, betOption: 2 })
      const seen = (state: any) => state.players.find((p: any) => p.id === 'p2').betOption
      expect(seen(room.getStateForPlayer('p2'))).toBe(2)
      expect(seen(room.getStateForPlayer('p1'))).toBeUndefined()
      expect(seen(room.getStateForPlayer('p3'))).toBeUndefined()
      expect(seen(room.getPublicState())).toBeUndefined()
      r.revealing = true   // посчитан — видят все
      expect(seen(room.getStateForPlayer('p1'))).toBe(2)
    })
  })

  // -------------------------------------------------------------------------
  // Подписи значений вариантов и comment — только после ответа
  // -------------------------------------------------------------------------

  describe('optionNotes и comment', () => {
    const notedQ: Question = { ...mcQ, comment: 'пояснение', optionNotes: ['610', '340', '163', '149'] }

    function toQuestion(room: GameRoom, q: Question) {
      const r = priv(room)
      r.phase = 'QUESTION'
      r.currentMode = 'all'
      r.currentQuestion = { ...q }
    }

    it('не уходят в game_state до ответа', () => {
      const { room } = makeRoom(notedQ)
      addPlayers(room, 2)
      toQuestion(room, notedQ)
      const cq = room.getStateForPlayer('p1').currentQuestion as any
      expect(cq.optionNotes).toBeUndefined()
      expect(cq.comment).toBeUndefined()
      expect(cq.options).toEqual(['A', 'B', 'C', 'D'])
    })

    it('приходят в round_results по порядку вариантов', () => {
      const { room, broadcasts } = makeRoom(notedQ)
      addPlayers(room, 2)
      toQuestion(room, notedQ)
      priv(room).advanceFromQuestion()
      const rr = broadcasts.find(b => b.event === 'round_results')!.data as any
      expect(rr.optionNotes).toEqual(['610', '340', '163', '149'])
      expect(rr.comment).toBe('пояснение')
    })

    it('без подписей — null и обычная пауза перед REVEAL', () => {
      const { room, broadcasts } = makeRoom()
      addPlayers(room, 2)
      toQuestion(room, mcQ)
      priv(room).advanceFromQuestion()
      const rr = broadcasts.find(b => b.event === 'round_results')!.data as any
      expect(rr.optionNotes).toBeNull()
      vi.advanceTimersByTime(ANSWER_REVEAL_MS)
      expect(priv(room).phase).toBe('REVEAL')
    })

    it('с подписями пауза перед REVEAL дольше', () => {
      const { room } = makeRoom(notedQ)
      addPlayers(room, 2)
      toQuestion(room, notedQ)
      priv(room).advanceFromQuestion()
      vi.advanceTimersByTime(ANSWER_REVEAL_MS)
      expect(priv(room).phase).toBe('QUESTION')
      vi.advanceTimersByTime(ANSWER_REVEAL_NOTES_MS - ANSWER_REVEAL_MS)
      expect(priv(room).phase).toBe('REVEAL')
    })
  })

  // -------------------------------------------------------------------------
  // Окно показа ответа: раунд считается один раз
  // -------------------------------------------------------------------------

  describe('окно показа ответа', () => {
    it('поздний ответ после таймера не считает раунд второй раз', () => {
      const { room, broadcasts } = makeRoom()
      addPlayers(room, 2)
      const r = priv(room)
      r.phase = 'QUESTION'
      r.currentMode = 'all'
      r.currentQuestion = { ...mcQ }
      r.players.get('p1').currentBet = 100
      r.players.get('p2').currentBet = 100
      room.submitAnswer('p1', 'A')
      r.advanceFromQuestion()                 // таймер вопроса истёк, p2 не успел
      const chips = [...r.players.values()].map((p: any) => p.chips)
      room.submitAnswer('p2', 'A')            // ответ p2 долетел в окно показа
      expect([...r.players.values()].map((p: any) => p.chips)).toEqual(chips)
      expect(broadcasts.filter(b => b.event === 'round_results')).toHaveLength(1)
    })

    it('дисконнект гладиатора в окне показа не считает раунд второй раз', () => {
      const { room, broadcasts } = makeRoom()
      addPlayers(room, 3)
      const r = priv(room)
      r.phase = 'QUESTION'
      r.currentMode = 'kerri'
      r.gladiatorId = 'p1'
      r.currentQuestion = { ...mcQ }
      room.submitAnswer('p1', 'A')            // единственный отвечающий — раунд посчитан
      vi.advanceTimersByTime(LAST_ANSWER_GRACE_MS)
      room.removePlayer('p1')
      expect(broadcasts.filter(b => b.event === 'round_results')).toHaveLength(1)
      expect(r.players.has('p1')).toBe(false)
    })

    it('показ записан до раскрытия ответа; оценка — по id игрока, делитель — игроки комнаты при показе', () => {
      const calls: string[] = []
      const votes: Array<{ voter: { id: string; name: string; roomPlayers: number }; score?: number | null }> = []
      const room = new GameRoom('r1', {
        pick: () => mcQ,
        report: (_q, r) => { calls.push(`report:${r.roomPlayers}`) },
        rate: (_q, voter, vote) => { votes.push({ voter, score: vote.score }) },
      })
      room.on('broadcast', ({ event }) => { if (event === 'round_results') calls.push('round_results') })
      room.addPlayer('p1', 'Вася')
      room.addPlayer('p2', 'Вася')
      room.addPlayer('p3', 'Петя')
      const r = priv(room)
      r.phase = 'QUESTION'
      r.currentMode = 'all'
      r.currentQuestion = { ...mcQ }
      room.rateQuestion('p1', mcQ.id, { score: 2 })   // до раскрытия — нечего оценивать
      r.advanceFromQuestion()
      expect(calls).toEqual(['report:3', 'round_results'])
      room.removePlayer('p3')                            // ушёл после показа — делитель тот же
      room.rateQuestion('p1', mcQ.id, { score: 2 })
      room.rateQuestion('p2', mcQ.id, { score: -1 })
      room.rateQuestion('p2', 'other', { score: -1 })   // не тот вопрос
      expect(votes).toEqual([
        { voter: { id: 'p1', name: 'Вася', roomPlayers: 3 }, score: 2 },
        { voter: { id: 'p2', name: 'Вася', roomPlayers: 3 }, score: -1 },
      ])
    })

    it('следующий раунд снова принимает ответы', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      const r = priv(room)
      r.phase = 'QUESTION'
      r.currentMode = 'all'
      r.currentQuestion = { ...mcQ }
      r.advanceFromQuestion()
      r.nextRound()
      r.phase = 'QUESTION'
      room.submitAnswer('p1', 'A')
      expect(r.players.get('p1').hasAnswered).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // allBettingConfirmed
  // -------------------------------------------------------------------------

  describe('allBettingConfirmed', () => {
    it('kerri: гладиатор исключён — достаточно подтверждения толпы', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      const r = priv(room)
      r.currentMode = 'kerri'
      r.gladiatorId = 'p1'
      r.bettingConfirmedIds.add('p2')
      expect(r.allBettingConfirmed()).toBe(true)
    })

    it('all: нужны подтверждения от всех', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      const r = priv(room)
      r.currentMode = 'all'
      r.bettingConfirmedIds.add('p1')
      expect(r.allBettingConfirmed()).toBe(false)
      r.bettingConfirmedIds.add('p2')
      expect(r.allBettingConfirmed()).toBe(true)
    })

    it('пустой bettingConfirmedIds → false', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      priv(room).currentMode = 'all'
      expect(priv(room).allBettingConfirmed()).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // submitAnswer
  // -------------------------------------------------------------------------

  describe('submitAnswer', () => {
    function setupQuestion(room: GameRoom, mode: 'all' | 'kerri' = 'all') {
      const r = priv(room)
      r.phase = 'QUESTION'
      r.currentMode = mode
      r.gladiatorId = 'p1'
      r.currentQuestion = { ...mcQ }
    }

    it('в kerri только гладиатор может ответить', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      setupQuestion(room, 'kerri')
      room.submitAnswer('p2', 'A')
      expect(priv(room).players.get('p2').hasAnswered).toBe(false)
    })

    it('гладиатор в kerri может ответить', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      setupQuestion(room, 'kerri')
      room.submitAnswer('p1', 'A')
      expect(priv(room).players.get('p1').hasAnswered).toBe(true)
    })

    it('в режиме all любой может ответить', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      setupQuestion(room, 'all')
      room.submitAnswer('p2', 'B')
      expect(priv(room).players.get('p2').hasAnswered).toBe(true)
    })

    it('повторный ответ игнорируется', () => {
      const { room, broadcasts } = makeRoom()
      addPlayers(room, 1)
      setupQuestion(room, 'all')
      room.submitAnswer('p1', 'A')
      const countAfterFirst = broadcasts.length
      room.submitAnswer('p1', 'B')
      expect(broadcasts.length).toBe(countAfterFirst)
      expect(priv(room).players.get('p1').answer).toBe('A')
    })

    it('ответ вне фазы QUESTION игнорируется', () => {
      const { room } = makeRoom()
      addPlayers(room, 1)
      priv(room).currentQuestion = { ...mcQ }
      // phase = 'LOBBY' по умолчанию
      room.submitAnswer('p1', 'A')
      expect(priv(room).players.get('p1').hasAnswered).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // removePlayer
  // -------------------------------------------------------------------------

  describe('removePlayer', () => {
    it('дисконнект гладиатора в QUESTION (kerri) — раунд отменяется: «Керри сбежал», нулевые дельты, ставки целы', () => {
      const { room, broadcasts } = makeRoom()
      addPlayers(room, 3)
      const r = priv(room)
      r.phase = 'QUESTION'
      r.currentMode = 'kerri'
      r.gladiatorId = 'p1'
      r.currentQuestion = { ...mcQ }
      Object.assign(r.players.get('p2'), { currentBet: 100, betOption: 0 })
      Object.assign(r.players.get('p3'), { currentBet: 200, betOption: 1 })
      room.removePlayer('p1')
      const rr = broadcasts.filter(b => b.event === 'round_results') as Array<{ event: string; data: any }>
      expect(rr).toHaveLength(1)
      expect(rr[0].data.results.every((x: any) => x.delta === 0)).toBe(true)
      expect(rr[0].data.results[0].sources[0].label).toMatch(/Керри сбежал/)
      expect(r.players.get('p2').chips).toBe(500)
      expect(r.players.get('p3').chips).toBe(500)
      expect(r.players.get('p3').streak).toBe(0)
      expect(r.revealing).toBe(true)
    })

    it('дисконнект обычного игрока в QUESTION не завершает раунд', () => {
      const { room, broadcasts } = makeRoom()
      addPlayers(room, 3)
      const r = priv(room)
      r.phase = 'QUESTION'
      r.currentMode = 'all'
      r.currentQuestion = { ...mcQ }
      room.removePlayer('p2')
      expect(broadcasts.find(b => b.event === 'round_results')).toBeUndefined()
    })

    it('после дисконнекта игрок удаляется из комнаты', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      room.removePlayer('p2')
      expect(priv(room).players.has('p2')).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Исправления по аудиту 2026-10-28 (docs/audit-2026-10-28-game.md)
  // -------------------------------------------------------------------------

  describe('аудит: стабильность и экономика', () => {
    function question(room: GameRoom, mode: 'all' | 'kerri' | 'closest', phase = 'QUESTION') {
      const r = priv(room)
      r.phase = phase
      r.currentMode = mode
      r.gladiatorId = mode === 'kerri' ? 'p1' : undefined
      r.currentQuestion = mode === 'closest' ? { ...cnQ } : { ...mcQ }
    }

    it('ушёл хост — хостом становится следующий, игру можно начать', () => {
      const { room } = makeRoom()
      addPlayers(room, 3)
      room.removePlayer('p1')
      expect(priv(room).hostId).toBe('p2')
      room.start('p2')
      expect(priv(room).phase).toBe('ANNOUNCE')
    })

    it('ушёл последний, кто не ответил, — раунд считается (через окно после последнего ответа)', () => {
      const { room, broadcasts } = makeRoom()
      addPlayers(room, 3)
      question(room, 'all')
      room.submitAnswer('p1', 'A')
      room.submitAnswer('p2', 'B')
      room.removePlayer('p3')
      vi.advanceTimersByTime(LAST_ANSWER_GRACE_MS)
      expect(broadcasts.find(b => b.event === 'round_results')).toBeDefined()
    })

    it('ушёл последний, кто не поставил, — BETTING заканчивается', () => {
      const { room } = makeRoom()
      addPlayers(room, 3)
      question(room, 'all', 'BETTING')
      room.placeBet('p1', 10)
      room.placeBet('p2', 10)
      room.removePlayer('p3')
      expect(priv(room).phase).toBe('QUESTION')
    })

    it('керри сбежал во время ставок — раунд без расчёта', () => {
      const { room, broadcasts } = makeRoom()
      addPlayers(room, 3)
      question(room, 'kerri', 'BETTING')
      room.placeBet('p2', 100, 0)
      room.removePlayer('p1')
      const rr = broadcasts.find(b => b.event === 'round_results')!.data as any
      expect(rr.results.every((r: any) => r.delta === 0)).toBe(true)
      expect(priv(room).phase).toBe('REVEAL')
      expect(priv(room).players.get('p2').chips).toBe(STARTING_CHIPS)
    })

    it('керри не может ставить', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      question(room, 'kerri', 'BETTING')
      room.placeBet('p1', 100, 1)
      expect(priv(room).players.get('p1').currentBet).toBe(0)
      expect(priv(room).players.get('p1').betOption).toBeUndefined()
    })

    it('толпа керри: ненулевая ставка — только с вариантом из вопроса', () => {
      const { room } = makeRoom()
      addPlayers(room, 3)
      question(room, 'kerri', 'BETTING')
      room.placeBet('p2', 100)
      room.placeBet('p2', 100, 4)   // вариантов 4: индекс 4 — мимо
      expect(priv(room).players.get('p2').currentBet).toBe(0)
      room.placeBet('p2', 100, 1)   // на неверный — можно (ставят на выбор керри, а не на ответ)
      expect(priv(room).players.get('p2')).toMatchObject({ currentBet: 100, betOption: 1 })
    })

    it('ответ не из вариантов / не число в «ближе всех» отклоняется', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      question(room, 'all')
      room.submitAnswer('p1', 'X'.repeat(100))
      expect(priv(room).players.get('p1').hasAnswered).toBe(false)
      question(room, 'closest')
      room.submitAnswer('p2', 'много' as any)
      room.submitAnswer('p2', Infinity)
      expect(priv(room).players.get('p2').hasAnswered).toBe(false)
      room.submitAnswer('p2', 300)
      expect(priv(room).players.get('p2').hasAnswered).toBe(true)
    })

    it('чужие ответы не видны до расчёта раунда', () => {
      const { room } = makeRoom()
      addPlayers(room, 3)
      question(room, 'closest')
      room.submitAnswer('p1', 300)
      expect(room.getPublicState().players.find(p => p.id === 'p1')!.answer).toBeUndefined()
      priv(room).advanceFromQuestion()
      expect(room.getPublicState().players.find(p => p.id === 'p1')!.answer).toBe(300)
    })

    it('повторный join того же сокета не сбрасывает фишки', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      priv(room).players.get('p1').chips = 40
      room.addPlayer('p1', 'P1')
      expect(priv(room).players.get('p1').chips).toBe(40)
    })

    it('ошибка пикера — следующий режим, а не падение', () => {
      let calls = 0
      const room = new GameRoom('r', (mode) => {
        calls++
        if (mode === 'all') throw new Error('битый банк')
        return { ...mcQ, mode }
      })
      addPlayers(room, 2)
      room.start('p1')
      expect(calls).toBe(2)
      expect(priv(room).currentMode).toBe('kerri')
    })
  })

  // -------------------------------------------------------------------------
  // Фишки ставки на сукне: соперники видят ровно то, что игрок выложил
  // -------------------------------------------------------------------------

  describe('betChips — фишки ставки для соперников', () => {
    function betting(room: GameRoom, mode: 'all' | 'kerri') {
      const r = priv(room)
      r.phase = 'BETTING'
      r.currentMode = mode
      r.gladiatorId = mode === 'kerri' ? 'p1' : undefined
      r.currentQuestion = { ...mcQ }
    }
    const betUpdated = (broadcasts: Array<{ event: string; data: any }>, playerId: string) =>
      broadcasts.filter(b => b.event === 'bet_updated' && b.data.playerId === playerId).at(-1)?.data
    const publicChips = (room: GameRoom, id: string) => room.getPublicState().players.find(p => p.id === id)!.betChips

    it('all: номиналы и порядок черновика сохраняются (без сортировки и разложения)', () => {
      const { room, broadcasts } = makeRoom()
      addPlayers(room, 3)
      betting(room, 'all')
      room.placeBet('p2', 110, undefined, [50, 10, 50])
      expect(betUpdated(broadcasts, 'p2').chips).toEqual([50, 10, 50])
      expect(publicChips(room, 'p2')).toEqual([50, 10, 50])
    })

    it('kerri: фишки и вариант — толпе (bet_updated лично), керри — без варианта', () => {
      const { room, playerMsgs } = makeRoom()
      addPlayers(room, 3)
      betting(room, 'kerri')
      room.placeBet('p3', 110, 2, [100, 10])
      const to = (id: string) => playerMsgs.filter(m => m.playerId === id && m.event === 'bet_updated').at(-1)?.data as any
      expect(to('p2')).toEqual({ playerId: 'p3', amount: 110, chips: [100, 10], option: 2 })
      expect(to('p1').chips).toEqual([100, 10])
      expect(to('p1')).not.toHaveProperty('option')
      expect(publicChips(room, 'p3')).toEqual([100, 10])
    })

    it('kerri: фишек больше ставки — betChips только префикс на сумму ставки', () => {
      const { room } = makeRoom()
      addPlayers(room, 3)
      betting(room, 'kerri')
      room.placeBet('p2', 100, 1, [50, 50, 20, 10])
      expect(priv(room).players.get('p2').betChips).toEqual([50, 50])
    })

    it('сумма фишек не сходится со ставкой — betChips нет (клиент разложит сумму)', () => {
      const { room, broadcasts } = makeRoom()
      addPlayers(room, 2)
      betting(room, 'all')
      room.placeBet('p1', 100, undefined, [50, 20])
      expect(betUpdated(broadcasts, 'p1').chips).toBeUndefined()
      expect(priv(room).players.get('p1').currentBet).toBe(100)
    })

    it('game_state посреди BETTING (кто-то зашёл) не затирает betChips', () => {
      const { room } = makeRoom()
      addPlayers(room, 3)
      betting(room, 'kerri')
      room.placeBet('p2', 120, 1, [50, 50, 20])
      room.addPlayer('p4', 'P4')
      expect(room.getStateForPlayer('p3').players.find(p => p.id === 'p2')!.betChips).toEqual([50, 50, 20])
    })
  })

  // -------------------------------------------------------------------------
  // calculateResults — режим ALL
  // -------------------------------------------------------------------------

  describe('calculateResults — all', () => {
    function setup(playerDefs: Array<{ answer: string; bet: number }>) {
      const { room } = makeRoom()
      addPlayers(room, playerDefs.length)
      const r = priv(room)
      r.phase = 'QUESTION'
      r.currentMode = 'all'
      r.currentQuestion = { ...mcQ }
      playerDefs.forEach(({ answer, bet }, i) => {
        const p = r.players.get(`p${i + 1}`)
        p.answer = answer
        p.hasAnswered = true
        p.currentBet = bet
      })
      return { room }
    }

    it('победитель получает пул проигравшего', () => {
      const { room } = setup([
        { answer: 'A', bet: 100 },
        { answer: 'B', bet: 200 },
      ])
      const results = priv(room).calculateResults()
      const p1 = results.find((r: any) => r.playerId === 'p1')
      const p2 = results.find((r: any) => r.playerId === 'p2')
      expect(p1.delta).toBe(200)
      expect(p2.delta).toBe(-200)
    })

    it('сумма всех дельт = 0 (деньги консервативны)', () => {
      const { room } = setup([
        { answer: 'A', bet: 100 },
        { answer: 'B', bet: 150 },
        { answer: 'C', bet: 200 },
      ])
      const results = priv(room).calculateResults()
      const total = results.reduce((s: number, r: any) => s + r.delta, 0)
      expect(total).toBe(0)
    })

    it('все ответили верно — нулевые дельты (джекпот выключен)', () => {
      const { room } = setup([
        { answer: 'A', bet: 100 },
        { answer: 'A', bet: 200 },
      ])
      priv(room).settings.jackpot = false
      const results = priv(room).calculateResults()
      for (const r of results) expect(r.delta).toBe(0)
    })

    it('никто не угадал — нулевые дельты, ставки сохраняются (джекпот выключен)', () => {
      const { room } = setup([
        { answer: 'B', bet: 100 },
        { answer: 'C', bet: 200 },
      ])
      priv(room).settings.jackpot = false
      const results = priv(room).calculateResults()
      for (const r of results) expect(r.delta).toBe(0)
    })

    it('игрок без ставки не получает и не теряет', () => {
      const { room } = setup([
        { answer: 'A', bet: 100 },
        { answer: 'B', bet: 200 },
        { answer: 'A', bet: 0 },
      ])
      const results = priv(room).calculateResults()
      const p3 = results.find((r: any) => r.playerId === 'p3')
      expect(p3.delta).toBe(0)
    })

    it('несколько победителей делят пул пропорционально ставкам', () => {
      const { room } = setup([
        { answer: 'A', bet: 100 },
        { answer: 'A', bet: 300 },
        { answer: 'B', bet: 400 },
      ])
      const results = priv(room).calculateResults()
      const p1 = results.find((r: any) => r.playerId === 'p1')
      const p2 = results.find((r: any) => r.playerId === 'p2')
      expect(p2.delta).toBeGreaterThan(p1.delta)
      const total = results.reduce((s: number, r: any) => s + r.delta, 0)
      expect(total).toBe(0)
    })

    it('source label корректен для победителя', () => {
      const { room } = setup([
        { answer: 'A', bet: 100 },
        { answer: 'B', bet: 100 },
      ])
      const results = priv(room).calculateResults()
      const p1 = results.find((r: any) => r.playerId === 'p1')
      expect(p1.sources.some((s: any) => s.label === 'Ответил верно')).toBe(true)
    })

    it('source label: Все угадали когда нет проигравших', () => {
      const { room } = setup([
        { answer: 'A', bet: 100 },
        { answer: 'A', bet: 200 },
      ])
      const results = priv(room).calculateResults()
      const p1 = results.find((r: any) => r.playerId === 'p1')
      expect(p1.sources.some((s: any) => s.label === 'Все угадали')).toBe(true)
    })

    it('source label: Все ошиблись когда нет победителей', () => {
      const { room } = setup([
        { answer: 'B', bet: 100 },
        { answer: 'C', bet: 200 },
      ])
      const results = priv(room).calculateResults()
      const p1 = results.find((r: any) => r.playerId === 'p1')
      expect(p1.sources.some((s: any) => s.label.startsWith('Все ошиблись'))).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // calculateResults — режим KERRI
  // -------------------------------------------------------------------------

  describe('calculateResults — kerri', () => {
    // p1 = керри, p2..pN = толпа; option — индекс варианта, на который поставил (A B C D, верный — A = 0)
    function setup(gladiatorAnswer: string | undefined, crowd: Array<{ bet: number; option?: number }>) {
      const { room } = makeRoom()
      addPlayers(room, crowd.length + 1)
      const r = priv(room)
      r.phase = 'QUESTION'
      r.currentMode = 'kerri'
      r.gladiatorId = 'p1'
      r.currentQuestion = { ...mcQ }
      const gladiator = r.players.get('p1')
      if (gladiatorAnswer !== undefined) {
        gladiator.answer = gladiatorAnswer
        gladiator.hasAnswered = true
      }
      crowd.forEach(({ bet, option }, i) => {
        const p = r.players.get(`p${i + 2}`)
        p.currentBet = bet
        p.betOption = option
      })
      return { room }
    }
    const res = (results: any[], id: string) => results.find((r: any) => r.playerId === id)
    const labels = (results: any[], id: string) => res(results, id).sources.map((s: any) => s.label)

    it('керри ответил верно → получает GLADIATOR_BONUS (без nextRound — первый раунд режима)', () => {
      const { room } = setup('A', [{ bet: 100, option: 0 }])
      expect(res(priv(room).calculateResults(), 'p1').delta).toBe(GLADIATOR_BONUS)
    })

    it('керри ответил неверно → получает 0', () => {
      const { room } = setup('B', [{ bet: 100, option: 0 }])
      expect(res(priv(room).calculateResults(), 'p1').delta).toBe(0)
    })

    it('выигрывают поставившие на выбор керри (верный): делят ставки остальных пропорционально', () => {
      const { room } = setup('A', [
        { bet: 100, option: 0 },
        { bet: 300, option: 0 },
        { bet: 200, option: 1 },
        { bet: 200, option: 2 },
      ])
      const results = priv(room).calculateResults()
      expect(res(results, 'p2').delta).toBe(100)
      expect(res(results, 'p3').delta).toBe(300)
      expect(res(results, 'p4').delta).toBe(-200)
      expect(res(results, 'p5').delta).toBe(-200)
      expect(labels(results, 'p2')).toContain('Угадал выбор керри')
      expect(labels(results, 'p4')).toContain('Не угадал выбор керри')
    })

    it('керри выбрал неверный вариант — выигрывают поставившие на него, а не на верный', () => {
      const { room } = setup('C', [
        { bet: 100, option: 2 },
        { bet: 200, option: 0 },
      ])
      const results = priv(room).calculateResults()
      expect(res(results, 'p2').delta).toBe(200)
      expect(res(results, 'p3').delta).toBe(-200)
      expect(res(results, 'p1').delta).toBe(0)
      expect(labels(results, 'p1')).toEqual(['Не закеррил'])
    })

    it('керри не ответил — у толпы нет дельт, «Керри не ответил»; у керри — «Не ответил»', () => {
      const { room } = setup(undefined, [
        { bet: 100, option: 0 },
        { bet: 200, option: 1 },
      ])
      const results = priv(room).calculateResults()
      for (const r of results) expect(r.delta).toBe(0)
      expect(labels(results, 'p2')).toEqual(['Керри не ответил'])
      expect(labels(results, 'p1')).toEqual(['Не ответил'])
    })

    it('нет гладиатора → пустой массив', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      const r = priv(room)
      r.phase = 'QUESTION'
      r.currentMode = 'kerri'
      r.gladiatorId = undefined
      r.currentQuestion = { ...mcQ }
      expect(priv(room).calculateResults()).toHaveLength(0)
    })

    it('source label: Закеррил для керри с верным ответом', () => {
      const { room } = setup('A', [{ bet: 100, option: 0 }])
      expect(labels(priv(room).calculateResults(), 'p1')).toContain('Закеррил')
    })

    it('source label: Не закеррил для керри с неверным ответом', () => {
      const { room } = setup('B', [{ bet: 100, option: 0 }])
      expect(labels(priv(room).calculateResults(), 'p1')).toContain('Не закеррил')
    })

    it('все поставили на выбор керри — «Все угадали выбор керри», дельт нет', () => {
      const { room } = setup('A', [
        { bet: 100, option: 0 },
        { bet: 200, option: 0 },
      ])
      const results = priv(room).calculateResults()
      expect(res(results, 'p2').delta).toBe(0)
      expect(labels(results, 'p2')).toContain('Все угадали выбор керри')
    })

    it('на выбор керри никто не ставил — «Никто не угадал выбор керри», ставки при своих', () => {
      const { room } = setup('A', [
        { bet: 100, option: 1 },
        { bet: 200, option: 2 },
      ])
      const results = priv(room).calculateResults()
      expect(res(results, 'p2').delta).toBe(0)
      expect(res(results, 'p3').delta).toBe(0)
      expect(labels(results, 'p2')).toContain('Никто не угадал выбор керри')
    })

    it('толпа без ставки — без дельты и без подписи', () => {
      const { room } = setup('A', [
        { bet: 100, option: 0 },
        { bet: 0 },
      ])
      const p3 = res(priv(room).calculateResults(), 'p3')
      expect(p3.delta).toBe(0)
      expect(p3.sources).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // calculateResults — режим CLOSEST
  // -------------------------------------------------------------------------

  describe('calculateResults — closest', () => {
    // cnQ.numericAnswer = 330
    function setup(answers: number[]) {
      const { room } = makeRoom(cnQ)
      addPlayers(room, answers.length)
      const r = priv(room)
      r.phase = 'QUESTION'
      r.currentMode = 'closest'
      r.currentQuestion = { ...cnQ }
      answers.forEach((answer, i) => {
        const p = r.players.get(`p${i + 1}`)
        p.answer = answer
        p.hasAnswered = true
      })
      return { room }
    }

    it('точный ответ → CLOSEST_WINNER_BONUS + CLOSEST_EXACT_BONUS', () => {
      const { room } = setup([330, 100])
      const results = priv(room).calculateResults()
      const p1 = results.find((r: any) => r.playerId === 'p1')
      expect(p1.delta).toBe(CLOSEST_WINNER_BONUS + CLOSEST_EXACT_BONUS)
    })

    it('ближайший без точного → CLOSEST_WINNER_BONUS', () => {
      const { room } = setup([300, 100])
      const results = priv(room).calculateResults()
      const p1 = results.find((r: any) => r.playerId === 'p1')
      expect(p1.delta).toBe(CLOSEST_WINNER_BONUS)
    })

    it('проигравший получает 0', () => {
      const { room } = setup([300, 100])
      const results = priv(room).calculateResults()
      const p2 = results.find((r: any) => r.playerId === 'p2')
      expect(p2.delta).toBe(0)
    })

    it('ничья: оба на одинаковом расстоянии → бонус делится', () => {
      // 100 и 560 оба на dist 230
      const { room } = setup([100, 560])
      const results = priv(room).calculateResults()
      const p1 = results.find((r: any) => r.playerId === 'p1')
      const p2 = results.find((r: any) => r.playerId === 'p2')
      expect(p1.delta).toBe(p2.delta)
      expect(p1.delta).toBeGreaterThan(0)
    })

    it('точная ничья: оба = 330 → бонус делится с exact-надбавкой', () => {
      const { room } = setup([330, 330])
      const results = priv(room).calculateResults()
      const total = results.reduce((s: number, r: any) => s + r.delta, 0)
      // Каждый получает половину (400/2=200)
      expect(results[0].delta).toBe(200)
      expect(results[1].delta).toBe(200)
      expect(total).toBe(400)
    })

    it('нет ответов → нулевые дельты', () => {
      const { room } = makeRoom(cnQ)
      addPlayers(room, 2)
      priv(room).phase = 'QUESTION'
      priv(room).currentMode = 'closest'
      priv(room).currentQuestion = { ...cnQ }
      // Игроки не ответили (answer = undefined)
      const results = priv(room).calculateResults()
      for (const r of results) expect(r.delta).toBe(0)
    })

    it('source label: Ближайший ответ', () => {
      const { room } = setup([300, 100])
      const results = priv(room).calculateResults()
      const p1 = results.find((r: any) => r.playerId === 'p1')
      expect(p1.sources.some((s: any) => s.label === 'Ближайший ответ')).toBe(true)
    })

    it('source label: точный ответ имеет две записи — Ближайший ответ и Угадал точно', () => {
      const { room } = setup([330, 100])
      const results = priv(room).calculateResults()
      const p1 = results.find((r: any) => r.playerId === 'p1')
      expect(p1.sources.some((s: any) => s.label === 'Ближайший ответ')).toBe(true)
      expect(p1.sources.some((s: any) => s.label === 'Угадал точно')).toBe(true)
    })
  })
})
