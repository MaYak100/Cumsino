// server/src/game/GameRoom.ts
import { EventEmitter } from 'events'
import type { GameState, GamePhase, GameMode, Player, RoundResult, Question } from '@cumsino/shared'
import { STARTING_CHIPS, WIN_CHIPS, GLADIATOR_BONUS, CLOSEST_WINNER_BONUS, PHASE_DURATIONS, decomposeToChips } from '@cumsino/shared'
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
  private questionPicker: (mode: GameMode) => Question
  private bettingConfirmedIds = new Set<string>()

  constructor(id: string, questionPicker: (mode: GameMode) => Question) {
    super()
    this.id = id
    this.questionPicker = questionPicker
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

  placeBet(playerId: string, amount: number, target?: 'win' | 'lose', chips?: number[], bankBet?: { optionIndex: number; amount: number }) {
    const player = this.players.get(playerId)
    if (!player || this.phase !== 'BETTING') return
    if (amount > player.chips) return

    player.currentBet = amount
    if (target) player.betTarget = target
    if (chips && chips.reduce((a, b) => a + b, 0) === amount) player.betChips = chips

    if (bankBet && this.currentMode === 'kerri' && this.currentQuestion?.options) {
      const { optionIndex, amount: bankAmount } = bankBet
      if (optionIndex >= 0 && optionIndex < this.currentQuestion.options.length
        && bankAmount > 0 && player.currentBet + bankAmount <= player.chips) {
        player.bankBet = { optionIndex, amount: bankAmount }
        this.broadcast('bank_bet_updated', { playerId, optionIndex, amount: bankAmount })
      }
    }

    this.broadcast('bet_updated', { playerId, amount, target, chips: player.betChips })

    this.bettingConfirmedIds.add(playerId)
    if (this.allBettingConfirmed()) {
      clearTimeout(this.phaseTimer)
      this.schedulePhase('QUESTION', PHASE_DURATIONS['QUESTION']!)
    }
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

  stageChip(playerId: string, chips: number[]) {
    if (this.phase !== 'BETTING') return
    if (!this.players.has(playerId)) return
    this.broadcastExcept(playerId, 'chip_staged', { playerId, chips })
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
        betTarget: p.betTarget, betChips: p.betChips, answer: p.answer, hasAnswered: p.hasAnswered,
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

    this.bettingConfirmedIds.clear()
    for (const p of this.players.values()) {
      p.currentBet = 0
      p.betTarget = undefined
      p.betChips = undefined
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
          this.schedulePhase('QUESTION', PHASE_DURATIONS['QUESTION']!)
        } else {
          this.schedulePhase('BETTING', PHASE_DURATIONS['BETTING']!)
        }
        break

      case 'BETTING':
        this.schedulePhase('QUESTION', PHASE_DURATIONS['QUESTION']!)
        break

      case 'QUESTION':
        this.advanceFromQuestion()
        break

      case 'REVEAL': {
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
    this.broadcastState()
    this.broadcast('round_results', {
      results,
      correctAnswer: this.currentQuestion?.answer ?? null,
      correctNumericAnswer: this.currentQuestion?.numericAnswer ?? null,
      mode: this.currentMode,
      gladiatorId: this.gladiatorId,
    })
    clearTimeout(this.phaseTimer)
    this.phaseTimer = setTimeout(() => {
      this.schedulePhase('REVEAL', PHASE_DURATIONS['REVEAL']!)
    }, 2500)
  }

  private calculateResults(): RoundResult[] {
    const players = Array.from(this.players.values())
    type Source = { label: string; delta: number }

    if (this.currentMode === 'all') {
      const q = this.currentQuestion!
      const winnerIds = new Set(players.filter(p => p.answer === q.answer && p.currentBet > 0).map(p => p.id))
      const loserIds = new Set(players.filter(p => p.answer !== q.answer && p.currentBet > 0).map(p => p.id))
      const allCorrect = loserIds.size === 0 && winnerIds.size > 0
      const noneCorrect = winnerIds.size === 0 && loserIds.size > 0

      const deltas = noneCorrect
        ? new Map<string, number>()
        : distributePool(
            [...winnerIds].map(id => ({ id, stake: this.players.get(id)!.currentBet })),
            [...loserIds].map(id => ({ id, stake: this.players.get(id)!.currentBet })),
          )

      return players.map(p => {
        const delta = deltas.get(p.id) ?? 0
        let sources: Source[]
        if (allCorrect) sources = [{ label: 'Все угадали', delta: 0 }]
        else if (noneCorrect) sources = [{ label: 'Все ошиблись', delta: 0 }]
        else if (winnerIds.has(p.id)) sources = [{ label: 'Ответил верно', delta }]
        else if (loserIds.has(p.id)) sources = [{ label: 'Ответил неверно', delta }]
        else sources = []
        return { playerId: p.id, delta, chipBreakdown: decomposeToChips(Math.abs(delta)), sources }
      })
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
      const allGuessedCorrect = losers.length === 0 && winners.length > 0
      const noneGuessedCorrect = winners.length === 0 && losers.length > 0

      const mainDeltas = noneGuessedCorrect
        ? new Map<string, number>()
        : distributePool(winners, losers)
      mainDeltas.set(gladiator.id, correct ? GLADIATOR_BONUS : 0)

      const gladiatorAnswerIndex = this.currentQuestion?.options
        ? this.currentQuestion.options.indexOf(gladiator.answer as string)
        : -1
      const totalDeltas = applyBankBets(new Map(mainDeltas), this.players.values(), gladiatorAnswerIndex)

      return players.map(p => {
        const delta = totalDeltas.get(p.id) ?? 0
        const mainDelta = mainDeltas.get(p.id) ?? 0
        let sources: Source[]
        if (p.id === this.gladiatorId) {
          sources = [{ label: correct ? 'Закеррил' : 'Не закеррил', delta }]
        } else {
          sources = []
          if (p.currentBet > 0) {
            const mainWon = correct ? p.betTarget === 'win' : p.betTarget === 'lose'
            let label: string
            if (allGuessedCorrect) label = 'Все угадали исход'
            else if (noneGuessedCorrect) label = 'Никто не угадал исход'
            else label = mainWon ? 'Угадал исход' : 'Ошибся с исходом'
            sources.push({ label, delta: mainDelta })
          }
          if (p.bankBet) {
            const bankHit = gladiatorAnswerIndex !== -1 && gladiatorAnswerIndex === p.bankBet.optionIndex
            const bankDelta = bankHit ? p.bankBet.amount * 3 : -p.bankBet.amount
            sources.push({ label: bankHit ? 'Прочитал ошибку' : 'Был слишком уверен', delta: bankDelta })
          }
        }
        return { playerId: p.id, delta, chipBreakdown: decomposeToChips(Math.abs(delta)), sources }
      })
    }

    if (this.currentMode === 'closest') {
      const correctNum = this.currentQuestion!.numericAnswer!
      const entries = players
        .filter(p => typeof p.answer === 'number')
        .map(p => ({ id: p.id, answer: p.answer as number }))
      const deltas = distributeClosest(entries, correctNum)

      let isExact = false
      const winnerIds = new Set<string>()
      if (entries.length > 0) {
        const diffs = entries.map(p => ({ id: p.id, diff: Math.abs(p.answer - correctNum), exact: p.answer === correctNum }))
        const minDiff = Math.min(...diffs.map(d => d.diff))
        const closest = diffs.filter(d => d.diff === minDiff)
        isExact = closest.every(w => w.exact)
        closest.forEach(w => winnerIds.add(w.id))
      }

      return players.map(p => {
        const delta = deltas.get(p.id) ?? 0
        let sources: Source[] = []
        if (delta > 0) {
          if (isExact && winnerIds.has(p.id)) {
            const basePart = Math.floor(CLOSEST_WINNER_BONUS / winnerIds.size / 10) * 10
            sources = [
              { label: 'Ближайший ответ', delta: basePart },
              { label: 'Угадал точно', delta: delta - basePart },
            ]
          } else {
            sources = [{ label: 'Ближайший ответ', delta }]
          }
        }
        return { playerId: p.id, delta, chipBreakdown: decomposeToChips(Math.abs(delta)), sources }
      })
    }

    if (this.currentMode === 'top5') {
      const entries = players
        .filter(p => Array.isArray(p.answer))
        .map(p => ({ id: p.id, answer: p.answer as string[] }))
      const deltas = distributeTop5(entries, this.currentQuestion!.orderedItems!)
      return players.map(p => {
        const delta = deltas.get(p.id) ?? 0
        return { playerId: p.id, delta, chipBreakdown: decomposeToChips(Math.abs(delta)), sources: [] }
      })
    }

    return []
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

  private allBettingConfirmed(): boolean {
    if (this.bettingConfirmedIds.size === 0) return false
    for (const [id] of this.players) {
      if (this.currentMode === 'kerri' && id === this.gladiatorId) continue
      if (!this.bettingConfirmedIds.has(id)) return false
    }
    return true
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
    return this.questionPicker(mode)
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
