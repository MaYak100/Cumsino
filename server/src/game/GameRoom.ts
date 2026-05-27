// server/src/game/GameRoom.ts
import { EventEmitter } from 'events'
import type { GameState, GamePhase, GameMode, Player, RoundResult, Question } from '@cumsino/shared'
import { STARTING_CHIPS, WIN_CHIPS, GLADIATOR_BONUS, PHASE_DURATIONS, decomposeToChips } from '@cumsino/shared'
import { distributePool } from './economy/distributePool'
import { distributeClosest } from './economy/distributeClosest'
import { distributeTop5 } from './economy/distributeTop5'
import { applyBankBets } from './economy/applyBankBets'
import { RoundSelector } from './RoundSelector'

interface PlayerWithBankBet extends Player {
  bankBet?: { optionIndex: number; amount: number }
}

export class GameRoom extends EventEmitter {
  readonly id: string
  private players: Map<string, PlayerWithBankBet> = new Map()
  private hostId = ''
  private phase: GamePhase = 'LOBBY'
  private roundIndex = 0
  private currentMode: GameMode = 'all'
  private currentQuestion: Question | null = null
  private gladiatorId?: string
  private phaseTimer?: ReturnType<typeof setTimeout>
  private phaseEndTime = 0
  private selector: RoundSelector
  private questions: Question[]

  constructor(id: string, questions: Question[]) {
    super()
    this.id = id
    this.questions = questions
    this.selector = new RoundSelector()
  }

  addPlayer(id: string, name: string) {
    if (this.players.size === 0) this.hostId = id
    this.players.set(id, {
      id, name,
      chips: STARTING_CHIPS,
      currentBet: 0,
      hasAnswered: false,
    })
    this.broadcastState()
  }

  removePlayer(id: string) {
    this.players.delete(id)
    this.broadcastState()
  }

  destroy() {
    clearTimeout(this.phaseTimer)
  }

  start(requesterId: string) {
    if (this.phase !== 'LOBBY') return
    if (requesterId !== this.hostId) return
    this.nextRound()
  }

  placeBet(playerId: string, amount: number, target?: 'win' | 'lose') {
    const player = this.players.get(playerId)
    if (!player || this.phase !== 'BETTING') return
    if (amount > player.chips) return

    player.currentBet = amount
    if (target) player.betTarget = target

    this.broadcast('bet_updated', { playerId, amount, target })
  }

  placeBankBet(playerId: string, optionIndex: number, amount: number) {
    const player = this.players.get(playerId)
    if (!player || this.phase !== 'BETTING' || this.currentMode !== 'kerri') return
    if (!this.currentQuestion?.options) return
    if (optionIndex < 0 || optionIndex >= this.currentQuestion.options.length) return
    if (player.currentBet + amount > player.chips) return

    player.bankBet = { optionIndex, amount }
    this.broadcast('bank_bet_updated', { playerId, optionIndex, amount })
  }

  submitAnswer(playerId: string, answer: string | number | string[]) {
    const player = this.players.get(playerId)
    if (!player || this.phase !== 'QUESTION') return
    if (player.hasAnswered) return
    // In kerri mode, only the gladiator can answer
    if (this.currentMode === 'kerri' && playerId !== this.gladiatorId) return

    player.answer = answer
    player.hasAnswered = true
    this.broadcast('player_answered', { playerId })

    if (this.allAnswered()) {
      clearTimeout(this.phaseTimer)
      this.advanceFromQuestion()
    }
  }

  relayHover(playerId: string, optionIndex: number | null) {
    if (playerId !== this.gladiatorId) return
    this.broadcastExcept(playerId, 'gladiator_hovering', { optionIndex })
  }

  getPublicState(): GameState {
    const timeLeft = Math.max(0, Math.ceil((this.phaseEndTime - Date.now()) / 1000))
    return {
      id: this.id,
      phase: this.phase,
      roundIndex: this.roundIndex,
      lastMainMode: this.selector.lastMainMode,
      mode: this.currentMode,
      currentQuestion: this.currentQuestion
        ? {
            id: this.currentQuestion.id,
            mode: this.currentQuestion.mode,
            topic: this.currentQuestion.topic,
            text: this.currentQuestion.text,
            options: this.currentQuestion.options,
            items: this.currentQuestion.items,
          }
        : null,
      gladiatorId: this.gladiatorId,
      hostId: this.hostId,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id, name: p.name, chips: p.chips, currentBet: p.currentBet,
        betTarget: p.betTarget, answer: p.answer, hasAnswered: p.hasAnswered,
      })),
      phaseTimeLeft: timeLeft,
    }
  }

  getStateForPlayer(playerId: string): GameState {
    const base = this.getPublicState()
    const showAnswer =
      this.currentMode === 'kerri' &&
      playerId !== this.gladiatorId &&
      (this.phase === 'BETTING' || this.phase === 'QUESTION_TEXT' || this.phase === 'QUESTION') &&
      this.currentQuestion?.answer !== undefined
    if (showAnswer) {
      base.gladiatorAnswer = this.currentQuestion!.answer
    }
    return base
  }

  get playerCount() { return this.players.size }

  private nextRound() {
    const mode = this.selector.next()
    this.currentMode = mode
    this.gladiatorId = undefined
    this.currentQuestion = this.pickQuestion(mode)
    this.roundIndex++

    for (const p of this.players.values()) {
      p.currentBet = 0
      p.betTarget = undefined
      p.answer = undefined
      p.hasAnswered = false
      p.bankBet = undefined
    }

    this.schedulePhase('ANNOUNCE', PHASE_DURATIONS['ANNOUNCE']!)
  }

  private schedulePhase(phase: GamePhase, seconds: number) {
    clearTimeout(this.phaseTimer)
    this.phase = phase
    this.phaseEndTime = Date.now() + seconds * 1000
    this.broadcastState()
    this.phaseTimer = setTimeout(() => this.onPhaseEnd(), seconds * 1000)
  }

  private onPhaseEnd() {
    switch (this.phase) {
      case 'ANNOUNCE':
        if (this.currentMode === 'kerri') this.selectGladiator()
        if (this.currentMode === 'closest') {
          this.schedulePhase('QUESTION_TEXT', PHASE_DURATIONS['QUESTION_TEXT']!)
        } else {
          this.schedulePhase('BETTING', PHASE_DURATIONS['BETTING']!)
        }
        break

      case 'BETTING':
        this.schedulePhase('QUESTION_TEXT', PHASE_DURATIONS['QUESTION_TEXT']!)
        break

      case 'QUESTION_TEXT':
        this.schedulePhase('QUESTION', PHASE_DURATIONS['QUESTION']!)
        break

      case 'QUESTION':
        this.advanceFromQuestion()
        break

      case 'REVEAL':
        this.schedulePhase('LEADERBOARD', PHASE_DURATIONS['LEADERBOARD']!)
        break

      case 'LEADERBOARD': {
        const winner = this.checkWinner()
        if (winner) {
          this.phase = 'GAME_OVER'
          this.broadcast('game_over', { winner })
          this.broadcastState()
        } else {
          this.nextRound()
        }
        break
      }
    }
  }

  private advanceFromQuestion() {
    const results = this.calculateResults()
    this.applyDeltas(results)
    this.broadcast('round_results', { results })
    this.schedulePhase('REVEAL', PHASE_DURATIONS['REVEAL']!)
  }

  private calculateResults(): RoundResult[] {
    const players = Array.from(this.players.values())

    if (this.currentMode === 'all') {
      const q = this.currentQuestion!
      const winners = players.filter(p => p.answer === q.answer && p.currentBet > 0)
        .map(p => ({ id: p.id, stake: p.currentBet }))
      const losers = players.filter(p => p.answer !== q.answer && p.currentBet > 0)
        .map(p => ({ id: p.id, stake: p.currentBet }))
      const deltas = distributePool(winners, losers)
      return this.buildResults(deltas)
    }

    if (this.currentMode === 'kerri') {
      if (!this.gladiatorId) return []
      const gladiator = this.players.get(this.gladiatorId)
      if (!gladiator) return []
      const correct = gladiator.answer === this.currentQuestion!.answer
      const crowd = players.filter(p => p.id !== this.gladiatorId && p.currentBet > 0)
      const winners = crowd.filter(p => correct ? p.betTarget === 'win' : p.betTarget === 'lose')
        .map(p => ({ id: p.id, stake: p.currentBet }))
      const losers = crowd.filter(p => correct ? p.betTarget === 'lose' : p.betTarget === 'win')
        .map(p => ({ id: p.id, stake: p.currentBet }))
      let deltas = distributePool(winners, losers)
      deltas.set(gladiator.id, correct ? GLADIATOR_BONUS : 0)

      // Bank bets x4
      const gladiatorAnswerIndex = this.currentQuestion?.options
        ? this.currentQuestion.options.indexOf(gladiator.answer as string)
        : -1
      deltas = applyBankBets(deltas, this.players.values(), gladiatorAnswerIndex)

      return this.buildResults(deltas)
    }

    if (this.currentMode === 'closest') {
      const entries = players
        .filter(p => typeof p.answer === 'number')
        .map(p => ({ id: p.id, answer: p.answer as number }))
      const deltas = distributeClosest(entries, this.currentQuestion!.numericAnswer!)
      return this.buildResults(deltas)
    }

    if (this.currentMode === 'top5') {
      const entries = players
        .filter(p => Array.isArray(p.answer))
        .map(p => ({ id: p.id, answer: p.answer as string[] }))
      const deltas = distributeTop5(entries, this.currentQuestion!.orderedItems!)
      return this.buildResults(deltas)
    }

    return []
  }

  private buildResults(deltas: Map<string, number>): RoundResult[] {
    return Array.from(this.players.keys()).map(playerId => {
      const delta = deltas.get(playerId) ?? 0
      return { playerId, delta, chipBreakdown: decomposeToChips(Math.abs(delta)) }
    })
  }

  private applyDeltas(results: RoundResult[]) {
    for (const r of results) {
      const player = this.players.get(r.playerId)
      if (player) player.chips = Math.max(0, player.chips + r.delta)
    }
  }

  private selectGladiator() {
    const ids = Array.from(this.players.keys())
    this.gladiatorId = ids[Math.floor(Math.random() * ids.length)]
  }

  private allAnswered(): boolean {
    if (this.currentMode === 'kerri') {
      if (!this.gladiatorId) return false
      return this.players.get(this.gladiatorId)?.hasAnswered ?? false
    }
    return Array.from(this.players.values()).every(p => p.hasAnswered)
  }

  private checkWinner(): Player | undefined {
    return Array.from(this.players.values()).find(p => p.chips >= WIN_CHIPS)
  }

  private pickQuestion(mode: GameMode): Question {
    const pool = this.questions.filter(q => q.mode === mode)
    if (pool.length === 0) throw new Error(`No questions for mode: ${mode}`)
    return pool[Math.floor(Math.random() * pool.length)]
  }

  private broadcast(event: string, data: unknown) {
    this.emit('broadcast', { event, data })
  }

  private broadcastExcept(excludeId: string, event: string, data: unknown) {
    this.emit('broadcastExcept', { excludeId, event, data })
  }

  private broadcastState() {
    for (const [playerId] of this.players) {
      this.emit('sendToPlayer', { playerId, event: 'game_state', data: this.getStateForPlayer(playerId) })
    }
  }
}
