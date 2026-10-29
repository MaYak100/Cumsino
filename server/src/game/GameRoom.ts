// server/src/game/GameRoom.ts
import { EventEmitter } from 'events'
import type { GameState, GamePhase, GameMode, Player, RoundResult, Question, FriendProfile } from '@cumsino/shared'
import {
  STARTING_CHIPS, WIN_CHIPS, BRIBE_ENABLED, GLADIATOR_BONUS, CLOSEST_WINNER_BONUS, PHASE_DURATIONS, ANSWER_REVEAL_MS, ANSWER_REVEAL_NOTES_MS,
  decomposeToChips,
} from '@cumsino/shared'
import { distributePool } from './economy/distributePool'
import { distributeClosest } from './economy/distributeClosest'
import { distributeTop5 } from './economy/distributeTop5'
import { applyBankBets } from './economy/applyBankBets'
import { RoundSelector } from './RoundSelector'
import type { QuestionSource, RatingVote } from './questions/picker'

interface PlayerWithBankBet extends Player {
  bankBet?: { optionIndex: number; amount: number }
}

/** Начало списка фишек, сумма которого ровно total (фишки > 0 — такой префикс один); нет — undefined. */
function chipsPrefix(chips: number[], total: number): number[] | undefined {
  if (total === 0) return []
  let sum = 0
  for (let i = 0; i < chips.length; i++) {
    sum += chips[i]
    if (sum === total) return chips.slice(0, i + 1)
    if (sum > total) return undefined
  }
  return undefined
}

interface BribeAuctionState {
  price: number
  cycleIndex: number       // 0 = first win turn, increments each time Завалит pays
  winQueue: string[]       // rotating Ответит (betTarget='win') player IDs
  loseQueue: string[]      // rotating Завалит (betTarget='lose') player IDs
  winIdx: number           // current position in winQueue (modular)
  loseIdx: number          // current position in loseQueue (modular)
  waitingFor: 'win' | 'lose'
  currentAsked: string
  timer: ReturnType<typeof setTimeout> | null
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
  private questions: QuestionSource
  /** вопрос последнего посчитанного раунда — его можно оценить до конца следующего раунда */
  private ratable: Question | null = null
  private bettingConfirmedIds = new Set<string>()
  private seenModes = new Set<string>()
  private bribeConditionCount = 0   // kerri rounds where both win+lose bettors existed
  private bribeEverFired = false
  private bribeAuction: BribeAuctionState | null = null
  private revealing = false   // между round_results и REVEAL: раунд посчитан, фаза ещё QUESTION

  constructor(id: string, questions: QuestionSource | ((mode: GameMode) => Question),
    private friendRoster: FriendProfile[] = []) {
    super()
    this.id = id
    this.questions = typeof questions === 'function' ? { pick: questions } : questions
    this.selector = new RoundSelector()
  }

  addPlayer(id: string, name: string) {
    if (this.players.has(id)) { this.broadcastState(); return }   // повторный join того же сокета — не сбрасывать фишки
    if (this.players.size >= 12) return
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
    if (!this.players.has(id)) return
    if (this.phase === 'QUESTION' && !this.revealing && this.currentMode === 'kerri' && id === this.gladiatorId) {
      clearTimeout(this.phaseTimer)
      this.advanceFromQuestion()
      this.players.delete(id)
      this.reassignHost(id)
      return
    }
    this.players.delete(id)
    this.reassignHost(id)
    if (!this.players.size) return
    // керри ушёл до вопроса: толпа уже видела ответ, нового керри не назначить — раунд не считается
    if (this.phase === 'BETTING' && this.currentMode === 'kerri' && id === this.gladiatorId) {
      this.cancelRound('Керри сбежал — раунд не считается')
      return
    }
    // ушёл последний, кого ждали, — фаза не висит до таймера
    if (this.phase === 'BETTING' && this.allBettingConfirmed()) {
      this.schedulePhase('QUESTION', PHASE_DURATIONS['QUESTION']!)
      return
    }
    if (this.phase === 'QUESTION' && !this.revealing && this.allAnswered()) {
      clearTimeout(this.phaseTimer)
      this.advanceFromQuestion()
      return
    }
    this.broadcastState()
  }

  private reassignHost(leftId: string) {
    if (leftId !== this.hostId) return
    this.hostId = this.players.keys().next().value ?? ''
  }

  /** Раунд без расчёта: ставки не списываются, все видят причину в итогах. */
  private cancelRound(reason: string) {
    clearTimeout(this.phaseTimer)
    this.clearBribeAuction()
    this.revealing = true
    const results: RoundResult[] = Array.from(this.players.values()).map(p => ({
      playerId: p.id, delta: 0, chipBreakdown: decomposeToChips(0), sources: [{ label: reason, delta: 0 }],
    }))
    this.broadcastState()
    this.broadcast('round_results', {
      results, correctAnswer: this.currentQuestion?.answer ?? null,
      correctNumericAnswer: this.currentQuestion?.numericAnswer ?? null, comment: reason, optionNotes: null,
      mode: this.currentMode, gladiatorId: this.gladiatorId,
    })
    this.schedulePhase('REVEAL', PHASE_DURATIONS['REVEAL']!)
  }

  /** «Кто ты» в лобби: человек из компании или null (пропустить). Одним человеком назваться может только один. */
  identify(playerId: string, friendId: number | null) {
    const player = this.players.get(playerId)
    if (!player || this.phase !== 'LOBBY') return
    if (friendId === null) {
      player.friendId = undefined
    } else {
      if (!this.friendRoster.some(f => f.id === friendId)) return
      if ([...this.players.values()].some(p => p.id !== playerId && p.friendId === friendId)) return
      player.friendId = friendId
    }
    this.broadcastState()
  }

  /** Оценка вопроса: только последнего посчитанного раунда, только своя (переоценка заменяет). */
  rateQuestion(playerId: string, questionId: string, vote: RatingVote) {
    const player = this.players.get(playerId)
    const q = this.ratable
    if (!player || !q || q.id !== questionId) return
    this.questions.rate?.(q, player.name, vote)
  }

  destroy() {
    clearTimeout(this.phaseTimer)
    this.clearBribeAuction()
  }

  start(requesterId: string) {
    if (this.phase !== 'LOBBY') return
    if (requesterId !== this.hostId) return
    this.nextRound()
  }

  placeBet(playerId: string, amount: number, target?: 'win' | 'lose', chips?: number[], bankBet?: { optionIndex: number; amount: number }) {
    const player = this.players.get(playerId)
    if (!player || this.phase !== 'BETTING') return
    if (this.currentMode === 'kerri' && playerId === this.gladiatorId) return   // керри не ставит на себя
    const existingBankAmount = player.bankBet?.amount ?? 0
    if (amount + existingBankAmount > player.chips) return

    player.currentBet = amount
    if (target) player.betTarget = target

    let acceptedBank = 0
    if (bankBet && this.currentMode === 'kerri' && this.currentQuestion?.options) {
      const { optionIndex, amount: bankAmount } = bankBet
      if (this.bankBetTargetOk(optionIndex) && bankAmount > 0 && amount + bankAmount <= player.chips) {
        player.bankBet = { optionIndex, amount: bankAmount }
        acceptedBank = bankAmount
        this.broadcast('bank_bet_updated', { playerId, optionIndex, amount: bankAmount })
      }
    }

    // Фишки на сукне — те же, что были в черновике (stage_chip): у толпы керри это [...основная, ...банк].
    // Банк-ставку отклонили — остаётся префикс основной; сумма не сходится — нет фишек (клиент разложит сумму).
    player.betChips = chips && (chipsPrefix(chips, amount + acceptedBank) ?? chipsPrefix(chips, amount))

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
    if (playerId === this.gladiatorId || !this.bankBetTargetOk(optionIndex)) return
    if (player.currentBet + amount > player.chips) return

    player.bankBet = { optionIndex, amount }
    this.broadcast('bank_bet_updated', { playerId, optionIndex, amount })
  }

  /** Банк-ставка ×4 — только на ошибку керри: на верный вариант (его толпа видит) — нельзя. */
  private bankBetTargetOk(optionIndex: number): boolean {
    const q = this.currentQuestion
    if (!q?.options || !Number.isInteger(optionIndex)) return false
    return optionIndex >= 0 && optionIndex < q.options.length && q.options[optionIndex] !== q.answer
  }

  /** Ответ подходит вопросу: вариант из списка, конечное число, список вариантов для top5. */
  private answerOk(answer: unknown): boolean {
    const q = this.currentQuestion
    if (!q) return false
    if (this.currentMode === 'closest') return typeof answer === 'number' && Number.isFinite(answer)
    if (this.currentMode === 'top5') {
      return Array.isArray(answer) && answer.length <= 5 && answer.every(a => typeof a === 'string' && (q.items ?? []).includes(a))
    }
    return typeof answer === 'string' && (q.options ?? []).includes(answer)
  }

  submitAnswer(playerId: string, answer: string | number | string[]) {
    const player = this.players.get(playerId)
    if (!player || this.phase !== 'QUESTION' || this.revealing) return
    if (player.hasAnswered) return
    // In kerri mode, only the gladiator can answer
    if (this.currentMode === 'kerri' && playerId !== this.gladiatorId) return
    if (!this.answerOk(answer)) return

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

  payBribe(playerId: string) {
    const a = this.bribeAuction
    if (!a || this.phase !== 'QUESTION' || this.currentMode !== 'kerri') return
    if (a.currentAsked !== playerId) return
    const player = this.players.get(playerId)
    if (!player || this.freeChips(player) < a.price) return

    player.chips -= a.price
    clearTimeout(a.timer!)
    a.timer = null
    this.sendToPlayer(playerId, 'bribe_prompt_cancel', {})

    if (a.waitingFor === 'win') {
      this.sendToGladiator('bribe_msg', { type: 'helping' })
      a.waitingFor = 'lose'
    } else {
      // Завалит paid → price escalates, move to next pair
      a.price += 25
      a.cycleIndex++
      a.loseIdx++
      a.winIdx++
      a.waitingFor = 'win'
    }
    this.broadcastState()  // reflect chip deduction immediately
    this.askBribePlayer()
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
            displayTopic: this.currentQuestion.displayTopic,
            text: this.currentQuestion.text,
            options: this.currentQuestion.options,
            items: this.currentQuestion.items,
            category: this.currentQuestion.category,
            subcategory: this.currentQuestion.subcategory,
          }
        : null,
      gladiatorId: this.gladiatorId,
      hostId: this.hostId,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id, name: p.name, chips: p.chips, currentBet: p.currentBet,
        betTarget: p.betTarget, betChips: p.betChips, hasAnswered: p.hasAnswered,
        // чужие ответы — только после расчёта раунда (в «ближе всех» иначе можно подсмотреть число)
        ...(this.revealing || this.phase === 'REVEAL' ? { answer: p.answer } : {}),
        friendId: p.friendId,
      })),
      phaseTimeLeft: timeLeft,
      friendRoster: this.friendRoster,
    }
  }

  getStateForPlayer(playerId: string): GameState {
    const base = this.getPublicState()
    const showAnswer =
      this.currentMode === 'kerri' &&
      playerId !== this.gladiatorId &&
      (this.phase === 'BETTING' || this.phase === 'QUESTION') &&
      this.currentQuestion?.answer !== undefined
    if (showAnswer) {
      base.gladiatorAnswer = this.currentQuestion!.answer
    }
    return base
  }

  get playerCount() { return this.players.size }

  private nextRound() {
    this.revealing = false
    // вопрос не собрался (ошибка в банке) — следующий режим цикла, а не падение комнаты
    let mode = this.selector.next()
    let question: Question | null = null
    for (let attempt = 0; attempt < 3 && !question; attempt++) {
      try {
        question = this.pickQuestion(mode)
      } catch (err) {
        console.error(`[room ${this.id}] вопрос для ${mode} не собрался:`, err)
        if (attempt < 2) mode = this.selector.next()
      }
    }
    if (!question) throw new Error('ни один режим не дал вопроса')
    this.currentMode = mode
    this.gladiatorId = undefined
    this.currentQuestion = question
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

    const isFirstMode = !this.seenModes.has(mode)
    this.seenModes.add(mode)
    this.schedulePhase('ANNOUNCE', PHASE_DURATIONS['ANNOUNCE']! + (isFirstMode ? 3 : 0))
  }

  private schedulePhase(phase: GamePhase, seconds: number) {
    clearTimeout(this.phaseTimer)
    this.phase = phase
    this.phaseEndTime = Date.now() + seconds * 1000
    this.broadcastState()
    this.phaseTimer = setTimeout(() => this.safely('onPhaseEnd', () => this.onPhaseEnd()), seconds * 1000)
    if (BRIBE_ENABLED && phase === 'QUESTION' && this.currentMode === 'kerri') {
      this.checkAndStartBribeEvent()
    }
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
    // раунд уже посчитан — идёт показ ответа (фаза ещё QUESTION): поздний ответ / дисконнект не считают его снова
    if (this.revealing) return
    this.revealing = true
    this.clearBribeAuction()
    const results = this.calculateResults()
    this.applyDeltas(results)
    this.reportRound()
    this.broadcastState()
    this.broadcast('round_results', {
      results,
      correctAnswer: this.currentQuestion?.answer ?? null,
      correctNumericAnswer: this.currentQuestion?.numericAnswer ?? null,
      comment: this.currentQuestion?.comment ?? null,
      optionNotes: this.currentQuestion?.optionNotes ?? null,
      mode: this.currentMode,
      gladiatorId: this.gladiatorId,
    })
    clearTimeout(this.phaseTimer)
    this.phaseTimer = setTimeout(() => this.safely('reveal', () => {
      this.schedulePhase('REVEAL', PHASE_DURATIONS['REVEAL']!)
    }), this.currentQuestion?.optionNotes ? ANSWER_REVEAL_NOTES_MS : ANSWER_REVEAL_MS)
  }

  /** Статистика раунда для фидбека по категориям: сколько отвечало, сколько верно, ошибки в «ближе всех». */
  private reportRound() {
    const q = this.currentQuestion
    if (!q) return
    this.ratable = q
    const players = Array.from(this.players.values())
    const answering = this.currentMode === 'kerri' ? players.filter(p => p.id === this.gladiatorId) : players
    const answered = answering.filter(p => p.hasAnswered)
    if (this.currentMode === 'closest' && q.numericAnswer !== undefined) {
      const nums = answered.map(p => p.answer).filter((a): a is number => typeof a === 'number')
      const base = Math.abs(q.numericAnswer) || 1
      this.questions.report?.(q, {
        roomPlayers: players.length, players: answering.length, answered: nums.length,
        correct: nums.filter(a => a === q.numericAnswer).length,
        relErrors: nums.map(a => Math.abs(a - q.numericAnswer!) / base),
      })
      return
    }
    this.questions.report?.(q, {
      roomPlayers: players.length, players: answering.length, answered: answered.length,
      correct: answered.filter(p => p.answer === q.answer).length,
    })
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
      const totalDeltas = applyBankBets(new Map(mainDeltas), players.filter(p => p.id !== gladiator.id), gladiatorAnswerIndex)

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

  /** Фишки вне ставок раунда — только ими можно платить (взятка). */
  private freeChips(p: PlayerWithBankBet): number {
    return p.chips - p.currentBet - (p.bankBet?.amount ?? 0)
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
    const friends = [...this.players.values()].map(p => p.friendId).filter((f): f is number => f !== undefined)
    return this.questions.pick(mode, { friends })
  }

  /** Исключение в таймере не должно ронять процесс (все комнаты) — пишем в лог, комната живёт дальше. */
  private safely(where: string, fn: () => void) {
    try {
      fn()
    } catch (err) {
      console.error(`[room ${this.id}] ошибка в ${where}:`, err)
    }
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

  private sendToPlayer(playerId: string, event: string, data: unknown) {
    this.emit('sendToPlayer', { playerId, event, data })
  }

  private sendToGladiator(event: string, data: unknown) {
    if (this.gladiatorId) this.sendToPlayer(this.gladiatorId, event, data)
  }

  private clearBribeAuction() {
    if (!this.bribeAuction) return
    if (this.bribeAuction.timer) clearTimeout(this.bribeAuction.timer)
    this.sendToPlayer(this.bribeAuction.currentAsked, 'bribe_prompt_cancel', {})
    this.bribeAuction = null
  }

  private askBribePlayer() {
    const a = this.bribeAuction
    if (!a) return
    const queue = a.waitingFor === 'win' ? a.winQueue : a.loseQueue
    const idx = a.waitingFor === 'win' ? a.winIdx : a.loseIdx
    a.currentAsked = queue[idx % queue.length]
    this.sendToPlayer(a.currentAsked, 'bribe_prompt', { amount: a.price, cycleIndex: a.cycleIndex })
    a.timer = setTimeout(() => this.onBribeTimeout(), 8000)
  }

  private onBribeTimeout() {
    const a = this.bribeAuction
    if (!a) return
    this.bribeAuction = null  // null first to prevent double-cancel in clearBribeAuction
    this.sendToPlayer(a.currentAsked, 'bribe_prompt_cancel', {})

    if (a.waitingFor === 'win') {
      // Ответит didn't pay → gladiator betrayed
      this.sendToGladiator('bribe_msg', { type: 'betrayed' })
    } else {
      // Завалит didn't pay → eliminate a random wrong option for gladiator
      let eliminatedOptionIndex: number | undefined
      const q = this.currentQuestion
      if (q?.options && q.answer) {
        const correctIdx = q.options.indexOf(q.answer as string)
        const wrongIdxs = q.options.map((_, i) => i).filter(i => i !== correctIdx)
        if (wrongIdxs.length > 0) {
          eliminatedOptionIndex = wrongIdxs[Math.floor(Math.random() * wrongIdxs.length)]
        }
      }
      this.sendToGladiator('bribe_msg', { type: 'helped', eliminatedOptionIndex })
    }
  }

  private startBribeAuction(winIds: string[], loseIds: string[]) {
    const shuffle = (arr: string[]): string[] => {
      const a = [...arr]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]]
      }
      return a
    }
    this.bribeAuction = {
      price: 50,
      cycleIndex: 0,
      winQueue: shuffle(winIds),
      loseQueue: shuffle(loseIds),
      winIdx: 0,
      loseIdx: 0,
      waitingFor: 'win',
      currentAsked: '',
      timer: null,
    }
    this.askBribePlayer()
  }

  private checkAndStartBribeEvent() {
    if (!this.gladiatorId) return
    const players = Array.from(this.players.values())
    const winBettors = players.filter(p =>
      p.id !== this.gladiatorId && p.betTarget === 'win' && p.currentBet > 0
    )
    const loseBettors = players.filter(p =>
      p.id !== this.gladiatorId && p.betTarget === 'lose' && p.currentBet > 0
    )
    if (winBettors.length === 0 || loseBettors.length === 0) return

    this.bribeConditionCount++
    const shouldFire =
      (!this.bribeEverFired && this.bribeConditionCount >= 2) ||
      (this.bribeEverFired && Math.random() < 0.4)
    if (!shouldFire) return

    this.bribeEverFired = true
    this.startBribeAuction(winBettors.map(p => p.id), loseBettors.map(p => p.id))
  }
}
