// server/src/game/GameRoom.ts
import { EventEmitter } from 'events'
import type { GameState, GamePhase, GameMode, Player, RoundResult, Question, FriendProfile, ItemId, PublicEffect } from '@cumsino/shared'
import {
  STARTING_CHIPS, WIN_CHIPS, BRIBE_ENABLED, GLADIATOR_BONUS, CLOSEST_WINNER_BONUS, PHASE_DURATIONS, FIRST_SHOP_EXTRA, ANSWER_REVEAL_MS, ANSWER_REVEAL_NOTES_MS,
  decomposeToChips,
  ITEMS, ITEM_ORDER, BUY_PHASES, itemPrice, round10, blindFor, streakShare,
  HEX_SECONDS, bkbCap, AEGIS_THRESHOLD, AEGIS_RESTORE, LAST_ANSWER_GRACE_MS,
  LIGHTNING_MS, LIGHTNING_SHARE, LIGHTNING_GLADIATOR, STREAK_GLADIATOR_BASE,
} from '@cumsino/shared'
import { distributePool } from './economy/distributePool'
import { distributeClosest } from './economy/distributeClosest'
import { distributeTop5 } from './economy/distributeTop5'
import { applyBankBets } from './economy/applyBankBets'
import { RoundSelector } from './RoundSelector'
import type { QuestionSource, RatingVote } from './questions/picker'

/** Предметы и эффекты одного раунда (docs/items.md) — сбрасываются в nextRound. */
interface RoundItems {
  /** предметы «раз за раунд», уже применённые (manta, smoke, bkb) */
  used: Set<ItemId>
  /** этот игрок уже бросил хекс в этом раунде */
  hexThrown: boolean
  /** на этом игроке хекс */
  hexed: boolean
  /** до какого момента (Date.now) хекснутый может отвечать — ставится на старте QUESTION */
  hexDeadline?: number
  smoked: boolean
  /** смок включён до ответа: другим не видно, что ответил (после ответа — уже видели player_answered) */
  smokeHidesAnswer: boolean
  bkb: boolean
  /** сколько вернёт BKB: две цены BKB на момент включения */
  bkbCap: number
  /** керри-толпа: исход, выделенный на столе до подтверждения (из stage_chip) — туда уйдёт принудительный блайнд */
  stagedTarget?: 'win' | 'lose'
  /** варианты, убранные мантой (индексы options) */
  removedOptions: number[]
  /** мс от начала QUESTION до последнего ответа (после блинка — новое) */
  answerAt?: number
}

const freshRound = (): RoundItems => ({
  used: new Set(), hexThrown: false, hexed: false, smoked: false, smokeHidesAnswer: false, bkb: false, bkbCap: 0,
  removedOptions: [],
})

interface PlayerWithBankBet extends Player {
  bankBet?: { optionIndex: number; amount: number }
  /** запас предметов — личное, в публичный стейт не попадает */
  inventory: Partial<Record<ItemId, number>>
  /** аегис куплен и ещё не сработал */
  aegis: boolean
  aegisBought: boolean
  items: RoundItems
  /** порядковый номер входа — по нему ходит большой блайнд (уход игроков не сбивает очередь) */
  seat: number
  /** вошёл посреди раунда (не в лобби и не в лавке): до следующего раунда только смотрит — не ставит, не отвечает,
   *  не применяет предметы, не керри, без блайнда, никого не задерживает. Сбрасывается в nextRound. */
  spectator: boolean
}

/** Что расчёт раунда меняет кроме фишек: серии и сработавшие аегисы (применяет commitSettlement). */
interface PendingSettlement {
  streaks: Map<string, number>
  aegisUsed: Set<string>
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
  /** игроков в комнате при его показе — делитель оценки команды (как в report) */
  private ratableRoomPlayers = 1
  private bettingConfirmedIds = new Set<string>()
  private seenModes = new Set<string>()
  private bribeConditionCount = 0   // kerri rounds where both win+lose bettors existed
  private bribeEverFired = false
  private bribeAuction: BribeAuctionState | null = null
  private revealing = false   // между round_results и REVEAL: раунд посчитан, фаза ещё QUESTION
  /** все ответили — раунд считается через LAST_ANSWER_GRACE_MS (успеть блинкнуть) */
  private graceTimer?: ReturnType<typeof setTimeout>
  /** конец отсчёта хекснутых — пересчитать «все ответили» */
  private hexTimers: ReturnType<typeof setTimeout>[] = []
  private questionStartAt = 0
  private seatCounter = 0
  /** длительность анонса раунда (первый раз в режиме — дольше); лавка уходит в анонс с ней */
  private announceSeconds = PHASE_DURATIONS['ANNOUNCE']!
  private pending: PendingSettlement | null = null

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
      streak: 0,
      inventory: {},
      aegis: false,
      aegisBought: false,
      items: freshRound(),
      seat: this.seatCounter++,
      // в лобби и в лавке раунд ещё не начался — участвует; иначе смотрит до следующего раунда
      spectator: !['LOBBY', 'SHOP'].includes(this.phase),
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
    if (this.phase === 'SHOP' && this.allShopReady()) {
      this.endShop()
      return
    }
    if (this.phase === 'BETTING' && this.allBettingConfirmed()) {
      this.schedulePhase('QUESTION', PHASE_DURATIONS['QUESTION']!)
      return
    }
    if (this.phase === 'QUESTION' && !this.revealing && this.allAnswered()) this.startGrace()
    this.broadcastState()
  }

  private reassignHost(leftId: string) {
    if (leftId !== this.hostId) return
    this.hostId = this.players.keys().next().value ?? ''
  }

  /** Раунд без расчёта: ставки не списываются, все видят причину в итогах. */
  private cancelRound(reason: string) {
    clearTimeout(this.phaseTimer)
    this.clearRoundTimers()
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

  /** Оценка вопроса: только последнего посчитанного раунда, только своя (переоценка заменяет). Ключ голоса — id
   *  игрока: у двух игроков с одним ником голоса разные. */
  rateQuestion(playerId: string, questionId: string, vote: RatingVote) {
    const player = this.players.get(playerId)
    const q = this.ratable
    if (!player || !q || q.id !== questionId) return
    this.questions.rate?.(q, { id: player.id, name: player.name, roomPlayers: this.ratableRoomPlayers }, vote)
  }

  destroy() {
    clearTimeout(this.phaseTimer)
    this.clearRoundTimers()
    this.clearBribeAuction()
  }

  start(requesterId: string) {
    if (this.phase !== 'LOBBY') return
    if (requesterId !== this.hostId) return
    this.nextRound()
  }

  placeBet(playerId: string, amount: number, target?: 'win' | 'lose', chips?: number[], bankBet?: { optionIndex: number; amount: number }) {
    const player = this.players.get(playerId)
    if (!player || this.phase !== 'BETTING' || player.spectator) return
    if (this.currentMode === 'kerri' && playerId === this.gladiatorId) return   // керри не ставит на себя
    const existingBankAmount = player.bankBet?.amount ?? 0
    if (amount + existingBankAmount > player.chips) return
    // блайнд («для всех» и толпа керри): меньше нельзя (если баланса на блайнд хватает)
    const blind = player.blind ?? 0
    if (amount < blind && player.chips >= blind) return
    // толпа керри: сторона (ответит / завалит) обязательна, если ставка не нулевая
    if (this.currentMode === 'kerri' && amount > 0 && target !== 'win' && target !== 'lose') return

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
    if (!player || this.phase !== 'BETTING' || this.currentMode !== 'kerri' || player.spectator) return
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

  submitAnswer(playerId: string, answer: string | number | string[], blink = false) {
    const player = this.players.get(playerId)
    if (!player || this.phase !== 'QUESTION' || this.revealing || player.spectator) return
    // In kerri mode, only the gladiator can answer
    if (this.currentMode === 'kerri' && playerId !== this.gladiatorId) return
    if (!this.answerOk(answer)) return
    if (this.hexExpired(player)) return   // хекс: HEX_SECONDS прошли — ни ответа, ни блинка
    const idx = typeof answer === 'string' ? this.currentQuestion?.options?.indexOf(answer) ?? -1 : -1
    if (idx >= 0 && player.items.removedOptions.includes(idx)) return   // вариант убран мантой

    if (player.hasAnswered) {
      // смена ответа — только блинком и только на другой ответ
      if (!blink || !this.canUse(player, 'blink')) return
      if (JSON.stringify(answer) === JSON.stringify(player.answer)) return
      this.consume(player, 'blink')
      player.answer = answer
      player.items.answerAt = Date.now() - this.questionStartAt
      this.announceItem(player, { playerId, item: 'blink' })
      if (this.graceTimer) this.startGrace()   // блинк в окно после последнего ответа перезапускает отсчёт
      this.broadcastState()
      return
    }

    player.answer = answer
    player.hasAnswered = true
    player.items.answerAt = Date.now() - this.questionStartAt
    if (player.items.smoked) this.sendToPlayer(playerId, 'player_answered', { playerId })
    else this.broadcast('player_answered', { playerId })

    if (this.allAnswered()) this.startGrace()
  }

  // ── предметы (docs/items.md) ──

  /** Покупка: только в лавке (BUY_PHASES), цена от баланса списывается сразу; аегис — один за игру и сразу активен. */
  buyItem(playerId: string, item: ItemId) {
    const player = this.players.get(playerId)
    if (!player || !BUY_PHASES.includes(this.phase) || !ITEMS[item]) return
    // нажал «Готов» — лавка для него закрыта (клиент тоже не даёт); передумал — снимает «Готов»
    if (player.shopReady) return
    // страховка: победитель проверяется до лавки, но покупка никогда не должна отнять победу
    if (player.chips >= WIN_CHIPS) return
    const price = itemPrice(item, player.chips)
    if (player.chips < price) return
    // с аегисом (и самим аегисом) нельзя докупиться ниже порога: иначе он сработает после ближайшего раунда сам —
    // «купи аегис на последние $100 и получи $300»
    if ((player.aegis || item === 'aegis') && player.chips - price < AEGIS_THRESHOLD) return
    if (item === 'aegis') {
      if (player.aegisBought) return
      player.aegisBought = true
      player.aegis = true
    } else {
      const have = player.inventory[item] ?? 0
      if (have >= ITEMS[item].max) return
      player.inventory[item] = have + 1
    }
    player.chips -= price
    this.broadcastState()
  }

  /** Применение предмета (кроме блинка — он в submit_answer — и пассивного аегиса). Не подходит — молча игнор. */
  useItem(playerId: string, item: ItemId, targetId?: string) {
    const player = this.players.get(playerId)
    if (!player || !ITEMS[item] || item === 'blink' || item === 'aegis') return
    if (!this.canUse(player, item)) return
    const r = player.items
    // цель — участник раунда, не сам применивший (зрители, ушедшие и «никто» — мимо, предмет не тратится)
    const target = targetId !== undefined ? this.players.get(targetId) : undefined
    if (ITEMS[item].targeted && (!target || target.id === playerId || target.spectator)) return

    switch (item) {
      case 'gem': {
        if (!target) return
        this.consume(player, item)
        const smoked = target.items.smoked
        const answer = smoked || Array.isArray(target.answer) ? null : target.answer ?? null
        this.sendToPlayer(playerId, 'gem_result', { targetId: target.id, answer, smoked })
        if (r.smoked) {
          // смотрящий в смоке: никто, включая цель, не узнаёт о геме
          this.sendToPlayer(playerId, 'item_used', { playerId, item })
        } else {
          this.broadcastExcept(target.id, 'item_used', { playerId, item })
          this.sendToPlayer(target.id, 'item_used', { playerId, item, targetId: target.id, onYou: true })
        }
        break
      }
      case 'manta': {
        const q = this.currentQuestion
        // после ответа манта бесполезна (и подсказала бы, куда блинкнуть) — как и на клиенте
        if (r.used.has('manta') || !q?.options || player.hasAnswered) return
        const candidates = q.options.map((_, i) => i)
          .filter(i => q.options![i] !== q.answer && !r.removedOptions.includes(i))
        if (!candidates.length) return
        const optionIndex = candidates[Math.floor(Math.random() * candidates.length)]
        this.consume(player, item)
        r.used.add('manta')
        r.removedOptions.push(optionIndex)
        this.sendToPlayer(playerId, 'manta_result', { optionIndex })
        this.announceItem(player, this.currentMode === 'kerri' ? { playerId, item, optionIndex } : { playerId, item })
        break
      }
      case 'smoke': {
        if (r.used.has('smoke')) return
        this.consume(player, item)
        r.used.add('smoke')
        r.smoked = true
        r.smokeHidesAnswer = !player.hasAnswered   // ответ до смока все уже видели — не «разответиваем»
        this.broadcast('item_used', { playerId, item })   // само применение видно всем
        break
      }
      case 'hex': {
        if (r.hexThrown || !target || target.items.hexed) return
        this.consume(player, item)
        r.hexThrown = true
        target.items.hexed = true
        this.broadcast('item_used', { playerId, item, targetId: target.id })
        break
      }
      case 'bkb': {
        if (r.used.has('bkb')) return
        this.consume(player, item)
        r.used.add('bkb')
        r.bkb = true
        r.bkbCap = bkbCap(player.chips)
        this.broadcast('item_used', { playerId, item })
        break
      }
    }
    this.broadcastState()
  }

  /** Есть в запасе, подходящая фаза и режим, игрок участвует в раунде. Керри: керри — только блинк, толпа — только bkb
   *  (в анонсе керри ещё не выбран — все толпа; bkb выбранного возвращается в запас в selectGladiator). */
  private canUse(player: PlayerWithBankBet, item: ItemId): boolean {
    const def = ITEMS[item]
    if (player.spectator) return false
    if ((player.inventory[item] ?? 0) < 1) return false
    if (def.usePhases === 'passive' || !def.usePhases.includes(this.phase)) return false
    if (!def.modes.includes(this.currentMode)) return false
    if (this.phase === 'QUESTION' && this.revealing) return false
    if (this.currentMode === 'kerri') {
      const allowed: ItemId[] = player.id === this.gladiatorId ? ['blink'] : ['bkb']
      if (!allowed.includes(item)) return false
    }
    return true
  }

  private consume(player: PlayerWithBankBet, item: ItemId) {
    const left = (player.inventory[item] ?? 0) - 1
    if (left > 0) player.inventory[item] = left
    else delete player.inventory[item]
  }

  /** item_used всем; применивший в смоке — только себе. */
  private announceItem(player: PlayerWithBankBet, data: Record<string, unknown>) {
    if (player.items.smoked) this.sendToPlayer(player.id, 'item_used', data)
    else this.broadcast('item_used', data)
  }

  private hexExpired(p: PlayerWithBankBet): boolean {
    return this.phase === 'QUESTION' && p.items.hexDeadline !== undefined && Date.now() >= p.items.hexDeadline
  }

  /** Все ответили — раунд считается через секунду; повторный вызов перезапускает отсчёт. */
  private startGrace() {
    clearTimeout(this.graceTimer)
    this.graceTimer = setTimeout(() => this.safely('grace', () => {
      this.graceTimer = undefined
      this.advanceFromQuestion()
    }), LAST_ANSWER_GRACE_MS)
  }

  private clearRoundTimers() {
    clearTimeout(this.graceTimer)
    this.graceTimer = undefined
    for (const t of this.hexTimers) clearTimeout(t)
    this.hexTimers = []
  }

  /** Старт QUESTION: отсчёт для молнии и HEX_SECONDS хекснутым. */
  private onQuestionStart() {
    this.questionStartAt = Date.now()
    for (const p of this.players.values()) {
      if (!p.items.hexed) continue
      p.items.hexDeadline = this.questionStartAt + HEX_SECONDS * 1000
      this.hexTimers.push(setTimeout(() => this.safely('hex', () => {
        if (this.phase !== 'QUESTION' || this.revealing) return
        if (!this.graceTimer && this.allAnswered()) this.startGrace()
        this.broadcastState()
      }), HEX_SECONDS * 1000))
    }
  }

  /** Вход в BETTING («для всех» и керри): каждому, кто ставит, блайнд. Большой (10%) — у единственного лидера по
   *  балансу среди ставящих; лидеров несколько (ничья наверху) — у всех малый (5%). Зрителям и керри — ничего
   *  (керри должен быть уже выбран). */
  private assignBlinds() {
    const list = Array.from(this.players.values())
      .filter(p => !p.spectator && !(this.currentMode === 'kerri' && p.id === this.gladiatorId))
    const top = Math.max(0, ...list.map(p => p.chips))
    const leaders = list.filter(p => p.chips === top && p.chips >= 10)
    const big = leaders.length === 1 ? leaders[0] : undefined
    for (const p of list) {
      p.bigBlind = p === big
      p.blind = blindFor(p.chips, p === big)
    }
  }

  /** Конец BETTING: кто не подтвердил ставку — ставит блайнд (фишки разложит клиент). Толпа керри — на исход,
   *  выделенный на столе, а не выделил — на «ответит». Банк-ставка (если сделана без подтверждения) остаётся, блайнд —
   *  не больше остатка. Банк-ставка блайнд не закрывает. */
  private forceBlinds() {
    if (this.currentMode !== 'all' && this.currentMode !== 'kerri') return
    for (const p of this.players.values()) {
      if (p.spectator || this.bettingConfirmedIds.has(p.id)) continue
      if (this.currentMode === 'kerri' && p.id === this.gladiatorId) continue
      const blind = Math.min(p.blind ?? 0, p.chips - (p.bankBet?.amount ?? 0))
      if (blind <= 0) continue
      p.currentBet = blind
      p.betChips = undefined
      if (this.currentMode === 'kerri') {
        p.betTarget = p.items.stagedTarget ?? 'win'
        this.broadcast('bet_updated', { playerId: p.id, amount: blind, target: p.betTarget })
      } else {
        this.broadcast('bet_updated', { playerId: p.id, amount: blind })
      }
    }
  }

  stageChip(playerId: string, chips: number[], target?: 'win' | 'lose') {
    if (this.phase !== 'BETTING') return
    const player = this.players.get(playerId)
    if (!player || player.spectator) return
    if (target && this.currentMode === 'kerri') player.items.stagedTarget = target
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

  getPublicState(viewerId?: string): GameState {
    const timeLeft = Math.max(0, Math.ceil((this.phaseEndTime - Date.now()) / 1000))
    const settled = this.revealing || this.phase === 'REVEAL'
    // в лавке вопрос следующего раунда уже выбран, но не показывается (тема — сюрприз анонса)
    const showQuestion = this.phase !== 'SHOP'
    return {
      id: this.id,
      phase: this.phase,
      roundIndex: this.roundIndex,
      lastMainMode: this.selector.lastMainMode,
      mode: this.currentMode,
      currentQuestion: this.currentQuestion && showQuestion
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
      players: Array.from(this.players.values()).map(p => {
        const effects = this.effectsOf(p)
        return {
          id: p.id, name: p.name, chips: p.chips, currentBet: p.currentBet,
          betTarget: p.betTarget, betChips: p.betChips,
          // смок: другим не видно, ответил ли (до расчёта раунда)
          hasAnswered: p.items.smokeHidesAnswer && !settled && p.id !== viewerId ? false : p.hasAnswered,
          // чужие ответы — только после расчёта раунда (в «ближе всех» иначе можно подсмотреть число)
          ...(settled ? { answer: p.answer } : {}),
          friendId: p.friendId,
          streak: p.streak ?? 0,
          ...(p.blind !== undefined ? { blind: p.blind, bigBlind: p.bigBlind } : {}),
          ...(this.phase === 'SHOP' ? { shopReady: !!p.shopReady } : {}),
          ...(effects.length ? { effects } : {}),
        }
      }),
      phaseTimeLeft: timeLeft,
      friendRoster: this.friendRoster,
    }
  }

  private effectsOf(p: PlayerWithBankBet): PublicEffect[] {
    const e: PublicEffect[] = []
    if (p.items.bkb) e.push('bkb')
    if (p.items.hexed) e.push('hex')
    if (p.items.smoked) e.push('smoke')
    if (p.aegis) e.push('aegis')
    return e
  }

  getStateForPlayer(playerId: string): GameState {
    const base = this.getPublicState(playerId)
    const showAnswer =
      this.currentMode === 'kerri' &&
      playerId !== this.gladiatorId &&
      (this.phase === 'BETTING' || this.phase === 'QUESTION') &&
      this.currentQuestion?.answer !== undefined
    if (showAnswer) {
      base.gladiatorAnswer = this.currentQuestion!.answer
    }
    // личное: запас, цены, аегис, хекс на мне, убранные мантой варианты
    const me = this.players.get(playerId)
    if (me) {
      base.inventory = { ...me.inventory }
      base.prices = Object.fromEntries(ITEM_ORDER.map(id => [id, itemPrice(id, me.chips)])) as Record<ItemId, number>
      base.aegisBought = me.aegisBought
      if (me.items.hexed && (this.phase === 'BETTING' || this.phase === 'QUESTION')) {
        base.hexTimeLeft = me.items.hexDeadline === undefined
          ? HEX_SECONDS
          : Math.max(0, Math.ceil((me.items.hexDeadline - Date.now()) / 1000))
      }
      if (me.items.removedOptions.length) base.removedOptions = [...me.items.removedOptions]
    }
    return base
  }

  get playerCount() { return this.players.size }

  private nextRound() {
    this.revealing = false
    this.clearRoundTimers()
    this.pending = null
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
      p.spectator = false
      p.shopReady = undefined
      p.currentBet = 0
      p.betTarget = undefined
      p.betChips = undefined
      p.answer = undefined
      p.hasAnswered = false
      p.bankBet = undefined
      p.blind = undefined
      p.bigBlind = undefined
      p.items = freshRound()
    }

    const isFirstMode = !this.seenModes.has(mode)
    this.seenModes.add(mode)
    this.announceSeconds = PHASE_DURATIONS['ANNOUNCE']! + (isFirstMode ? 3 : 0)
    // раунд «для всех» начинается с лавки — но только после первого круга (первого «кто ближе»): до этого предметов
    // никто не видит. Раунд, режим и вопрос уже этого раунда, вопрос в стейте скрыт
    if (mode === 'closest') this.closestSeen = true
    if (mode === 'all' && this.closestSeen) this.startShop()
    else this.schedulePhase('ANNOUNCE', this.announceSeconds)
  }

  // ── лавка (SHOP) ──

  private startShop() {
    for (const p of this.players.values()) p.shopReady = false
    // первая лавка — предметы видят впервые, читают описания: дольше
    this.schedulePhase('SHOP', PHASE_DURATIONS['SHOP']! + (this.shopsShown === 0 ? FIRST_SHOP_EXTRA : 0))
    this.shopsShown++
  }

  /** был ли уже «кто ближе» (лавка открывается только после первого круга) и сколько лавок прошло */
  private closestSeen = false
  private shopsShown = 0

  /** «Готов» / передумал. Все готовы — лавка закрывается сразу. */
  setShopReady(playerId: string, ready: boolean) {
    const player = this.players.get(playerId)
    if (!player || this.phase !== 'SHOP') return
    player.shopReady = ready
    if (this.allShopReady()) this.endShop()
    else this.broadcastState()
  }

  private allShopReady(): boolean {
    return this.players.size > 0 && [...this.players.values()].every(p => p.shopReady)
  }

  private endShop() {
    for (const p of this.players.values()) p.shopReady = undefined
    this.schedulePhase('ANNOUNCE', this.announceSeconds)
  }

  private schedulePhase(phase: GamePhase, seconds: number) {
    clearTimeout(this.phaseTimer)
    this.phase = phase
    this.phaseEndTime = Date.now() + seconds * 1000
    if (phase === 'QUESTION') this.onQuestionStart()
    this.broadcastState()
    this.phaseTimer = setTimeout(() => this.safely('onPhaseEnd', () => this.onPhaseEnd()), seconds * 1000)
    if (BRIBE_ENABLED && phase === 'QUESTION' && this.currentMode === 'kerri') {
      this.checkAndStartBribeEvent()
    }
  }

  private onPhaseEnd() {
    switch (this.phase) {
      case 'SHOP':
        this.endShop()
        break

      case 'ANNOUNCE':
        if (this.currentMode === 'kerri') this.selectGladiator()   // до блайндов: керри блайнда нет
        if (this.currentMode === 'all' || this.currentMode === 'kerri') this.assignBlinds()
        if (this.currentMode === 'closest') {
          this.schedulePhase('QUESTION', PHASE_DURATIONS['QUESTION']!)
        } else {
          this.schedulePhase('BETTING', PHASE_DURATIONS['BETTING']!)
        }
        break

      case 'BETTING':
        this.forceBlinds()
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
    this.clearRoundTimers()
    this.clearBribeAuction()
    const results = this.calculateResults()
    this.applyDeltas(results)
    this.commitSettlement()
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
    const players = Array.from(this.players.values())
    this.ratable = q
    this.ratableRoomPlayers = players.length
    const answering = this.currentMode === 'kerri'
      ? players.filter(p => p.id === this.gladiatorId)
      : players.filter(p => !p.spectator)
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

  /** Основной расчёт + бонусы казино (молния → серия → BKB → аегис). Серии и аегисы применяет commitSettlement. */
  private calculateResults(): RoundResult[] {
    return this.applyBonuses(this.baseResults())
  }

  private applyBonuses(results: RoundResult[]): RoundResult[] {
    const q = this.currentQuestion
    const mode = this.currentMode
    const pending: PendingSettlement = { streaks: new Map(), aegisUsed: new Set() }
    this.pending = pending
    if (!q || !results.length) return results

    // ближайшие в «кто ближе»
    const closestIds = new Set<string>()
    if (mode === 'closest' && q.numericAnswer !== undefined) {
      const diffs = [...this.players.values()].filter(p => typeof p.answer === 'number')
        .map(p => ({ id: p.id, d: Math.abs((p.answer as number) - q.numericAnswer!) }))
      const min = Math.min(...diffs.map(d => d.d))
      diffs.filter(d => d.d === min).forEach(d => closestIds.add(d.id))
    }
    const kerriCorrect = mode === 'kerri' && this.gladiatorId !== undefined
      && this.players.get(this.gladiatorId)?.answer === q.answer

    return results.map(r => {
      const p = this.players.get(r.playerId)
      if (!p) return r
      const baseSources = r.sources ?? []
      const sources = [...baseSources]
      let delta = r.delta
      const add = (label: string, d: number) => {
        if (!d) return
        sources.push({ label, delta: d })
        delta += d
      }
      const isGladiator = mode === 'kerri' && p.id === this.gladiatorId
      const fast = p.items.answerAt !== undefined && p.items.answerAt < LIGHTNING_MS

      // исход раунда для серии: true — +1, false — сброс, null — без изменений
      let won: boolean | null = null
      let streakBase = 0
      if (mode === 'all') {
        won = p.hasAnswered && p.answer === q.answer
        streakBase = p.currentBet
        if (won && fast) add('Молния', Math.max(10, round10(p.currentBet * LIGHTNING_SHARE)))
      } else if (mode === 'kerri') {
        if (isGladiator) {
          won = kerriCorrect
          streakBase = STREAK_GLADIATOR_BASE
          if (won && fast) add('Молния', LIGHTNING_GLADIATOR)
        } else if (p.currentBet > 0) {
          // пропустить ставку толпа не может (блайнд принудительный); ставки нет — только у безденежного: серия не меняется
          won = kerriCorrect ? p.betTarget === 'win' : p.betTarget === 'lose'
          streakBase = p.currentBet
        }
      } else if (mode === 'closest') {
        // «кто ближе» серию не сбивает: ближайший +1, остальные (и не ответившие) — без изменений
        if (closestIds.has(p.id)) won = true
        streakBase = CLOSEST_WINNER_BONUS
      }

      const prev = p.streak ?? 0
      let streak = prev
      if (won === true) streak = prev + 1
      else if (won === false && !p.items.bkb) streak = 0   // под BKB серия не сбивается
      pending.streaks.set(p.id, streak)
      if (won === true && streak >= 2) add(`Серия ×${streak}`, round10(streakBase * streakShare(streak)))

      if (p.items.bkb && delta < 0) add('BKB', Math.min(-delta, p.items.bkbCap))

      // аегис — по предсказанному балансу; после него баланс ровно AEGIS_RESTORE
      if (p.aegis && p.chips + delta < AEGIS_THRESHOLD) {
        add('Аегис', AEGIS_RESTORE - (p.chips + delta))
        pending.aegisUsed.add(p.id)
      }

      if (sources.length === baseSources.length) return r
      return { ...r, delta, chipBreakdown: decomposeToChips(Math.abs(delta)), sources }
    })
  }

  private commitSettlement() {
    const s = this.pending
    if (!s) return
    for (const [id, streak] of s.streaks) {
      const p = this.players.get(id)
      if (p) p.streak = streak
    }
    for (const id of s.aegisUsed) {
      const p = this.players.get(id)
      if (p) p.aegis = false
    }
    this.pending = null
  }

  private baseResults(): RoundResult[] {
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
    // зритель (вошёл в анонсе) керри не становится — у него на экране «ждём следующий раунд»
    const ids = Array.from(this.players.values()).filter(p => !p.spectator).map(p => p.id)
    this.gladiatorId = ids[Math.floor(Math.random() * ids.length)]
    // BKB из анонса керри ни к чему (керри не теряет) — возвращаем в запас
    const g = this.players.get(this.gladiatorId)
    if (g?.items.bkb) {
      g.items.bkb = false
      g.items.bkbCap = 0
      g.items.used.delete('bkb')
      g.inventory.bkb = (g.inventory.bkb ?? 0) + 1
    }
  }

  private allBettingConfirmed(): boolean {
    if (this.bettingConfirmedIds.size === 0) return false
    for (const [id, p] of this.players) {
      if (p.spectator || (this.currentMode === 'kerri' && id === this.gladiatorId)) continue
      // меньше $10 — ни одной фишки: клиенту нечего подтверждать, фаза не должна висеть до таймера
      if (p.chips < 10) continue
      if (!this.bettingConfirmedIds.has(id)) return false
    }
    return true
  }

  private allAnswered(): boolean {
    if (this.currentMode === 'kerri') {
      if (!this.gladiatorId) return false
      return this.players.get(this.gladiatorId)?.hasAnswered ?? false
    }
    // хекснутый после HEX_SECONDS — как ответивший (без ответа); зрители (вошли посреди раунда) не ждутся
    return Array.from(this.players.values()).every(p => p.spectator || p.hasAnswered || this.hexExpired(p))
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
