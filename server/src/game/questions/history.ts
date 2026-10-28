// server/src/game/questions/history.ts
// Память игры о вопросах между играми: колоды (что уже выпадало в текущем круге), архив («удалить»), кредиты
// сглаженного выбора, суммы оценок. Состояние живёт в памяти процесса (сервер один), каждое изменение
// дописывается в хранилище (Neon, pgBackend.ts); без DATABASE_URL — только память, до перезапуска.

export interface SeenRecord { cycle: number; gameNo: number }

export interface HistorySnapshot {
  gameNo: number
  cycles: Record<string, number>
  seen: Array<{ deck: string; card: string; cycle: number; gameNo: number }>
  archived: string[]
  credits: Array<{ scope: string; item: string; credit: number }>
  ratings: Array<{ key: string; n: number; sum: number }>
}

export interface RatingRow {
  questionId: string
  category: string
  sub: string
  gameNo: number
  player: string
  score?: number | null        // −2 удалить, −1 слабый, +1 хороший, +2 ахуенный
  difficulty?: number | null   // −1 легко, +1 сложно
}

export interface ShowingRow {
  questionId: string
  category: string
  sub: string
  mode: string
  gameNo: number
  players: number
  answered: number
  correct: number
  /** «ближе всех»: |ответ − правильный| / правильный по каждому ответившему */
  relErrors?: number[]
}

export interface HistoryBackend {
  load(): Promise<HistorySnapshot | null>
  gameStarted(gameNo: number): void
  seen(deck: string, card: string, cycle: number, gameNo: number): void
  cycle(deck: string, cycle: number): void
  credits(scope: string, entries: Array<[string, number]>): void
  archive(questionId: string, info: { by: string; category: string; sub: string; text: string }): void
  rating(row: RatingRow): void
  showing(row: ShowingRow): void
}

export const memoryBackend: HistoryBackend = {
  load: async () => null,
  gameStarted() {},
  seen() {},
  cycle() {},
  credits() {},
  archive() {},
  rating() {},
  showing() {},
}

export class QuestionHistory {
  gameNo = 0
  private cycles = new Map<string, number>()
  private seenBy = new Map<string, Map<string, SeenRecord>>()
  readonly archived = new Set<string>()
  private creditMap = new Map<string, Map<string, number>>()
  /** key: `cat:<id>` / `sub:<id>` → сколько оценок и их сумма (без «нормально») */
  private ratingSums = new Map<string, { n: number; sum: number }>()
  /** последняя оценка игрока по вопросу в игре — переоценка заменяет, а не добавляет */
  private lastScore = new Map<string, number>()

  constructor(readonly backend: HistoryBackend = memoryBackend) {}

  async init(): Promise<void> {
    const snap = await this.backend.load()
    if (!snap) return
    this.gameNo = snap.gameNo
    for (const [deck, c] of Object.entries(snap.cycles)) this.cycles.set(deck, c)
    for (const s of snap.seen) this.deckSeen(s.deck).set(s.card, { cycle: s.cycle, gameNo: s.gameNo })
    for (const id of snap.archived) this.archived.add(id)
    for (const c of snap.credits) this.creditsOf(c.scope).set(c.item, c.credit)
    for (const r of snap.ratings) this.ratingSums.set(r.key, { n: r.n, sum: r.sum })
  }

  startGame(): number {
    this.gameNo += 1
    this.backend.gameStarted(this.gameNo)
    return this.gameNo
  }

  // ---------- колоды ----------

  cycleOf(deck: string): number {
    return this.cycles.get(deck) ?? 0
  }

  private deckSeen(deck: string): Map<string, SeenRecord> {
    let m = this.seenBy.get(deck)
    if (!m) this.seenBy.set(deck, (m = new Map()))
    return m
  }

  /** Карточка свежая: не выпадала в текущем круге и не выпадала в этой и прошлой игре (стык кругов). */
  isFresh(deck: string, card: string, gameNo: number): boolean {
    if (this.archived.has(card)) return false
    const rec = this.deckSeen(deck).get(card)
    if (!rec) return true
    return rec.cycle < this.cycleOf(deck) && rec.gameNo < gameNo - 1
  }

  /** Уже была в этой игре — повторять нельзя ни при каком круге. */
  usedInGame(deck: string, card: string, gameNo: number): boolean {
    return this.deckSeen(deck).get(card)?.gameNo === gameNo
  }

  take(deck: string, card: string, gameNo: number): void {
    const cycle = this.cycleOf(deck)
    this.deckSeen(deck).set(card, { cycle, gameNo })
    this.backend.seen(deck, card, cycle, gameNo)
  }

  newCycle(deck: string): void {
    const c = this.cycleOf(deck) + 1
    this.cycles.set(deck, c)
    this.backend.cycle(deck, c)
  }

  // ---------- сглаженный выбор ----------

  creditsOf(scope: string): Map<string, number> {
    let m = this.creditMap.get(scope)
    if (!m) this.creditMap.set(scope, (m = new Map()))
    return m
  }

  saveCredits(scope: string): void {
    this.backend.credits(scope, [...this.creditsOf(scope)])
  }

  // ---------- оценки ----------

  ratingOf(key: string): { n: number; sum: number } {
    return this.ratingSums.get(key) ?? { n: 0, sum: 0 }
  }

  rate(row: RatingRow, archiveInfo?: { text: string }): void {
    if (row.score != null) {
      const k = `${row.gameNo}|${row.player}|${row.questionId}`
      const prev = this.lastScore.get(k)
      for (const key of [`cat:${row.category}`, `sub:${row.sub}`]) {
        const r = { ...this.ratingOf(key) }
        if (prev === undefined) r.n += 1
        else r.sum -= prev
        r.sum += row.score
        this.ratingSums.set(key, r)
      }
      this.lastScore.set(k, row.score)
      if (row.score <= -2 && archiveInfo && !this.archived.has(row.questionId)) {
        this.archived.add(row.questionId)
        this.backend.archive(row.questionId, { by: row.player, category: row.category, sub: row.sub, text: archiveInfo.text })
      }
    }
    this.backend.rating(row)
  }

  showing(row: ShowingRow): void {
    this.backend.showing(row)
  }
}
