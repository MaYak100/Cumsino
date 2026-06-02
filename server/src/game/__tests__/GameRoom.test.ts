import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GameRoom } from '../GameRoom'
import type { Question } from '@cumsino/shared'
import {
  GLADIATOR_BONUS,
  STARTING_CHIPS,
  WIN_CHIPS,
  CLOSEST_WINNER_BONUS,
  CLOSEST_EXACT_BONUS,
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

    it('лимит 12 игроков', () => {
      const { room } = makeRoom()
      for (let i = 1; i <= 13; i++) room.addPlayer(`p${i}`, `P${i}`)
      expect(priv(room).players.size).toBe(12)
    })

    it('start() отклоняет не-хоста', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      room.start('p2')
      expect(priv(room).phase).toBe('LOBBY')
    })

    it('start() хостом переводит в ANNOUNCE', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      room.start('p1')
      expect(priv(room).phase).toBe('ANNOUNCE')
    })

    it('start() повторно игнорируется (не LOBBY)', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      room.start('p1')
      expect(priv(room).phase).toBe('ANNOUNCE')
      room.start('p1') // second call
      expect(priv(room).phase).toBe('ANNOUNCE') // stays ANNOUNCE, not re-set
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

    it('getPublicState не содержит bankBet в игроках', () => {
      const { room } = makeRoom()
      addPlayers(room, 2)
      priv(room).players.get('p2').bankBet = { optionIndex: 1, amount: 100 }
      const state = room.getPublicState()
      const p2 = state.players.find(p => p.id === 'p2')!
      expect((p2 as any).bankBet).toBeUndefined()
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
    it('дисконнект гладиатора в QUESTION (kerri) вызывает досрочный round_results', () => {
      const { room, broadcasts } = makeRoom()
      addPlayers(room, 2)
      const r = priv(room)
      r.phase = 'QUESTION'
      r.currentMode = 'kerri'
      r.gladiatorId = 'p1'
      r.currentQuestion = { ...mcQ }
      room.removePlayer('p1')
      expect(broadcasts.find(b => b.event === 'round_results')).toBeDefined()
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

    it('все ответили верно — нулевые дельты', () => {
      const { room } = setup([
        { answer: 'A', bet: 100 },
        { answer: 'A', bet: 200 },
      ])
      const results = priv(room).calculateResults()
      for (const r of results) expect(r.delta).toBe(0)
    })

    it('никто не угадал — нулевые дельты (ставки сохраняются)', () => {
      const { room } = setup([
        { answer: 'B', bet: 100 },
        { answer: 'C', bet: 200 },
      ])
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
      expect(p1.sources.some((s: any) => s.label === 'Все ошиблись')).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // calculateResults — режим KERRI
  // -------------------------------------------------------------------------

  describe('calculateResults — kerri', () => {
    // p1 = гладиатор, p2..pN = толпа
    function setup(
      gladiatorAnswer: string,
      crowd: Array<{
        bet: number
        betTarget: 'win' | 'lose'
        bankBet?: { optionIndex: number; amount: number }
      }>
    ) {
      const { room } = makeRoom()
      addPlayers(room, crowd.length + 1)
      const r = priv(room)
      r.phase = 'QUESTION'
      r.currentMode = 'kerri'
      r.gladiatorId = 'p1'
      r.currentQuestion = { ...mcQ }
      const gladiator = r.players.get('p1')
      gladiator.answer = gladiatorAnswer
      gladiator.hasAnswered = true
      crowd.forEach(({ bet, betTarget, bankBet }, i) => {
        const p = r.players.get(`p${i + 2}`)
        p.currentBet = bet
        p.betTarget = betTarget
        if (bankBet) p.bankBet = bankBet
      })
      return { room }
    }

    it('гладиатор ответил верно → получает GLADIATOR_BONUS', () => {
      const { room } = setup('A', [{ bet: 100, betTarget: 'win' }])
      const results = priv(room).calculateResults()
      const gladiator = results.find((r: any) => r.playerId === 'p1')
      expect(gladiator.delta).toBe(GLADIATOR_BONUS)
    })

    it('гладиатор ответил неверно → получает 0', () => {
      const { room } = setup('B', [{ bet: 100, betTarget: 'win' }])
      const results = priv(room).calculateResults()
      const gladiator = results.find((r: any) => r.playerId === 'p1')
      expect(gladiator.delta).toBe(0)
    })

    it('win-ставка выигрывает когда гладиатор верно', () => {
      const { room } = setup('A', [
        { bet: 100, betTarget: 'win' },
        { bet: 200, betTarget: 'lose' },
      ])
      const results = priv(room).calculateResults()
      const p2 = results.find((r: any) => r.playerId === 'p2')
      const p3 = results.find((r: any) => r.playerId === 'p3')
      expect(p2.delta).toBeGreaterThan(0)
      expect(p3.delta).toBe(-200)
    })

    it('lose-ставка выигрывает когда гладиатор ошибся', () => {
      const { room } = setup('B', [
        { bet: 100, betTarget: 'lose' },
        { bet: 200, betTarget: 'win' },
      ])
      const results = priv(room).calculateResults()
      const p2 = results.find((r: any) => r.playerId === 'p2')
      expect(p2.delta).toBeGreaterThan(0)
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

    it('bankBet попал → +3x amount поверх основной дельты', () => {
      // gladiator answers 'A' = options[0], bankBet на index 0
      const { room } = setup('A', [
        { bet: 100, betTarget: 'win', bankBet: { optionIndex: 0, amount: 50 } },
      ])
      const results = priv(room).calculateResults()
      const p2 = results.find((r: any) => r.playerId === 'p2')
      // main: no losers → 0; bankBet hit: +150
      expect(p2.delta).toBe(150)
    })

    it('bankBet промазал → -amount поверх основной дельты', () => {
      const { room } = setup('A', [
        { bet: 100, betTarget: 'win', bankBet: { optionIndex: 1, amount: 50 } },
      ])
      const results = priv(room).calculateResults()
      const p2 = results.find((r: any) => r.playerId === 'p2')
      // main: 0; bankBet miss: -50
      expect(p2.delta).toBe(-50)
    })

    it('source label: Закеррил для гладиатора верного ответа', () => {
      const { room } = setup('A', [{ bet: 100, betTarget: 'win' }])
      const results = priv(room).calculateResults()
      const gladiator = results.find((r: any) => r.playerId === 'p1')
      expect(gladiator.sources.some((s: any) => s.label === 'Закеррил')).toBe(true)
    })

    it('source label: Не закеррил для гладиатора неверного ответа', () => {
      const { room } = setup('B', [{ bet: 100, betTarget: 'win' }])
      const results = priv(room).calculateResults()
      const gladiator = results.find((r: any) => r.playerId === 'p1')
      expect(gladiator.sources.some((s: any) => s.label === 'Не закеррил')).toBe(true)
    })

    it('source label: Все угадали исход когда нет проигравших в толпе', () => {
      const { room } = setup('A', [
        { bet: 100, betTarget: 'win' },
        { bet: 200, betTarget: 'win' },
      ])
      const results = priv(room).calculateResults()
      const p2 = results.find((r: any) => r.playerId === 'p2')
      expect(p2.sources.some((s: any) => s.label === 'Все угадали исход')).toBe(true)
    })

    it('source label: Никто не угадал исход когда нет победителей в толпе', () => {
      const { room } = setup('A', [
        { bet: 100, betTarget: 'lose' },
        { bet: 200, betTarget: 'lose' },
      ])
      const results = priv(room).calculateResults()
      const p2 = results.find((r: any) => r.playerId === 'p2')
      expect(p2.sources.some((s: any) => s.label === 'Никто не угадал исход')).toBe(true)
    })

    it('bankBet hit отражён в sources', () => {
      const { room } = setup('A', [
        { bet: 0, betTarget: 'win', bankBet: { optionIndex: 0, amount: 50 } },
      ])
      const results = priv(room).calculateResults()
      const p2 = results.find((r: any) => r.playerId === 'p2')
      expect(p2.sources.some((s: any) => s.label === 'Прочитал ошибку')).toBe(true)
    })

    it('bankBet miss отражён в sources', () => {
      const { room } = setup('A', [
        { bet: 0, betTarget: 'win', bankBet: { optionIndex: 2, amount: 50 } },
      ])
      const results = priv(room).calculateResults()
      const p2 = results.find((r: any) => r.playerId === 'p2')
      expect(p2.sources.some((s: any) => s.label === 'Был слишком уверен')).toBe(true)
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

  // -------------------------------------------------------------------------
  // Bribe auction
  // -------------------------------------------------------------------------

  describe('bribe auction', () => {
    function setupBribe(room: GameRoom, winIds: string[], loseIds: string[]) {
      const r = priv(room)
      r.phase = 'QUESTION'
      r.currentMode = 'kerri'
      r.gladiatorId = 'p1'
      r.currentQuestion = { ...mcQ }
      for (const id of winIds) {
        const p = r.players.get(id)
        p.betTarget = 'win'
        p.currentBet = 100
      }
      for (const id of loseIds) {
        const p = r.players.get(id)
        p.betTarget = 'lose'
        p.currentBet = 100
      }
    }

    it('не запускается если нет lose-ставок', () => {
      const { room } = makeRoom()
      addPlayers(room, 3)
      setupBribe(room, ['p2', 'p3'], [])
      priv(room).bribeConditionCount = 1
      priv(room).checkAndStartBribeEvent()
      expect(priv(room).bribeAuction).toBeNull()
    })

    it('не запускается если нет win-ставок', () => {
      const { room } = makeRoom()
      addPlayers(room, 3)
      setupBribe(room, [], ['p2', 'p3'])
      priv(room).bribeConditionCount = 1
      priv(room).checkAndStartBribeEvent()
      expect(priv(room).bribeAuction).toBeNull()
    })

    it('запускается при bribeConditionCount >= 2 (первый раз)', () => {
      const { room } = makeRoom()
      addPlayers(room, 3)
      setupBribe(room, ['p2'], ['p3'])
      priv(room).bribeConditionCount = 1  // станет 2 внутри
      priv(room).checkAndStartBribeEvent()
      expect(priv(room).bribeAuction).not.toBeNull()
      expect(priv(room).bribeAuction.price).toBe(50)
      expect(priv(room).bribeAuction.waitingFor).toBe('win')
    })

    it('не запускается если bribeEverFired и random > 0.4', () => {
      const { room } = makeRoom()
      addPlayers(room, 3)
      setupBribe(room, ['p2'], ['p3'])
      priv(room).bribeEverFired = true
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      priv(room).checkAndStartBribeEvent()
      expect(priv(room).bribeAuction).toBeNull()
    })

    it('запускается повторно если bribeEverFired и random < 0.4', () => {
      const { room } = makeRoom()
      addPlayers(room, 3)
      setupBribe(room, ['p2'], ['p3'])
      priv(room).bribeEverFired = true
      vi.spyOn(Math, 'random').mockReturnValue(0.3)
      priv(room).checkAndStartBribeEvent()
      expect(priv(room).bribeAuction).not.toBeNull()
    })

    it('payBribe: win-сторона платит → гладиатор получает helping, waitingFor → lose', () => {
      const { room, playerMsgs } = makeRoom()
      addPlayers(room, 3)
      setupBribe(room, ['p2'], ['p3'])
      priv(room).bribeConditionCount = 1
      priv(room).checkAndStartBribeEvent()

      const askedId = priv(room).bribeAuction.currentAsked
      expect(askedId).toBe('p2')

      room.payBribe(askedId)

      const gladMsg = playerMsgs.find(
        m => m.playerId === 'p1' && m.event === 'bribe_msg'
      )
      expect(gladMsg?.data).toMatchObject({ type: 'helping' })
      expect(priv(room).players.get('p2').chips).toBe(STARTING_CHIPS - 50)
      expect(priv(room).bribeAuction?.waitingFor).toBe('lose')
    })

    it('payBribe: lose-сторона платит → цена +25, cycleIndex++, waitingFor → win', () => {
      const { room } = makeRoom()
      addPlayers(room, 3)
      setupBribe(room, ['p2'], ['p3'])
      priv(room).bribeConditionCount = 1
      priv(room).checkAndStartBribeEvent()

      room.payBribe(priv(room).bribeAuction.currentAsked) // win pays
      room.payBribe(priv(room).bribeAuction.currentAsked) // lose pays

      const a = priv(room).bribeAuction
      expect(a.price).toBe(75)
      expect(a.cycleIndex).toBe(1)
      expect(a.waitingFor).toBe('win')
    })

    it('payBribe: игрок не тот кого спрашивают — игнорируется', () => {
      const { room } = makeRoom()
      addPlayers(room, 3)
      setupBribe(room, ['p2'], ['p3'])
      priv(room).bribeConditionCount = 1
      priv(room).checkAndStartBribeEvent()

      // Аукцион ждёт p2 (win), но p3 пытается заплатить
      room.payBribe('p3')
      expect(priv(room).players.get('p3').chips).toBe(STARTING_CHIPS)
      expect(priv(room).bribeAuction).not.toBeNull()
    })

    it('payBribe: у игрока нет чипов — игнорируется', () => {
      const { room } = makeRoom()
      addPlayers(room, 3)
      setupBribe(room, ['p2'], ['p3'])
      priv(room).bribeConditionCount = 1
      priv(room).checkAndStartBribeEvent()

      priv(room).players.get('p2').chips = 0
      room.payBribe('p2')
      expect(priv(room).bribeAuction).not.toBeNull()
    })

    it('таймаут win-стороны → гладиатор получает betrayed, аукцион очищается', () => {
      const { room, playerMsgs } = makeRoom()
      addPlayers(room, 3)
      setupBribe(room, ['p2'], ['p3'])
      priv(room).bribeConditionCount = 1
      priv(room).checkAndStartBribeEvent()

      vi.advanceTimersByTime(8001)

      const gladMsg = playerMsgs.find(
        m => m.playerId === 'p1' && m.event === 'bribe_msg'
      )
      expect(gladMsg?.data).toMatchObject({ type: 'betrayed' })
      expect(priv(room).bribeAuction).toBeNull()
    })

    it('таймаут lose-стороны → гладиатор получает helped с индексом неверного варианта', () => {
      const { room, playerMsgs } = makeRoom()
      addPlayers(room, 3)
      setupBribe(room, ['p2'], ['p3'])
      priv(room).bribeConditionCount = 1
      priv(room).checkAndStartBribeEvent()

      room.payBribe(priv(room).bribeAuction.currentAsked) // win платит
      playerMsgs.length = 0

      vi.advanceTimersByTime(8001) // lose не платит

      const gladMsg = playerMsgs.find(
        m => m.playerId === 'p1' && m.event === 'bribe_msg'
      )
      expect(gladMsg?.data).toMatchObject({ type: 'helped' })
      const eliminated = (gladMsg?.data as any).eliminatedOptionIndex
      expect(eliminated).toBeDefined()
      // options[0] = 'A' = правильный — нельзя удалять
      expect(eliminated).not.toBe(0)
      expect([1, 2, 3]).toContain(eliminated)
    })

    it('clearBribeAuction вызывается при завершении раунда', () => {
      const { room } = makeRoom()
      addPlayers(room, 3)
      setupBribe(room, ['p2'], ['p3'])
      priv(room).bribeConditionCount = 1
      priv(room).checkAndStartBribeEvent()
      expect(priv(room).bribeAuction).not.toBeNull()

      priv(room).advanceFromQuestion()
      expect(priv(room).bribeAuction).toBeNull()
    })

    it('destroy очищает bribeAuction и таймер', () => {
      const { room } = makeRoom()
      addPlayers(room, 3)
      setupBribe(room, ['p2'], ['p3'])
      priv(room).bribeConditionCount = 1
      priv(room).checkAndStartBribeEvent()
      expect(priv(room).bribeAuction).not.toBeNull()

      room.destroy()
      expect(priv(room).bribeAuction).toBeNull()
    })
  })
})
