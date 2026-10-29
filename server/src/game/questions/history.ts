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
  /** key `cat:<id>` / `sub:<id>`: n — показов, sum — сумма средних оценок команды по этим показам */
  ratings: Array<{ key: string; n: number; sum: number }>
  /** показы последних игр с голосами — переоценка после перезапуска заменяет голос, а не добавляет второй */
  shows?: Array<{ questionId: string; gameNo: number; category: string; sub: string; roomPlayers: number;
    votes: Array<{ player: string; name?: string; score: number | null; difficulty: number | null }> }>
}

export interface RatingRow {
  questionId: string
  category: string
  sub: string
  gameNo: number
  /** id игрока (сокет) — у двух игроков с одним ником голоса разные */
  player: string
  /** ник — для архива («кто удалил») и чтения базы глазами */
  name?: string
  /** undefined — не менять, null — снять: −2 удалить, −1 слабый, +1 хороший, +2 ахуенный */
  score?: number | null
  /** undefined — не менять, null — снять: −1 легко, +1 сложно */
  difficulty?: number | null
}

/** Голос игрока целиком (так он и пишется в базу: переоценка заменяет строку). */
interface Vote { name?: string; score: number | null; difficulty: number | null }

export interface ShowingRow {
  questionId: string
  category: string
  sub: string
  mode: string
  gameNo: number
  /** сколько игроков в комнате — делитель оценки команды и порог «удалить» */
  roomPlayers: number
  /** сколько отвечало (в kerri — один керри) */
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
  archive(questionId: string, info: { by: string; category: string; sub: string; text: string; votes: number; players: number }): void
  rating(row: RatingRow): void
  showing(row: ShowingRow): void
  /** дождаться записи всего отправленного (остановка сервера) */
  flush?(): Promise<unknown>
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
  /** key `cat:<id>` / `sub:<id>` → показов и сумма оценок команды (одна точка на показ, см. rate) */
  private ratingSums = new Map<string, { n: number; sum: number }>()
  /** показы (этого процесса и последних игр из базы): голоса игроков, переоценка заменяет */
  private shows = new Map<string, { roomPlayers: number; category: string; sub: string; votes: Map<string, Vote> }>()

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
    for (const sh of snap.shows ?? []) {
      this.shows.set(`${sh.gameNo}|${sh.questionId}`, {
        roomPlayers: Math.max(1, sh.roomPlayers), category: sh.category, sub: sh.sub,
        votes: new Map(sh.votes.map(v => [v.player, { name: v.name, score: v.score, difficulty: v.difficulty }])),
      })
    }
  }

  /** Дождаться записи в хранилище (остановка сервера). */
  flush(): Promise<unknown> {
    return this.backend.flush?.() ?? Promise.resolve()
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

  /** Последний показ карточки (круг, номер игры). */
  lastSeen(deck: string, card: string): SeenRecord | undefined {
    return this.deckSeen(deck).get(card)
  }

  /**
   * Нельзя брать ни при каком круге: была в этой или прошлой игре (маленькие колоды не повторяются в соседних
   * играх) — или в игре с бо́льшим номером: её взяла соседняя комната, начавшая игру позже.
   */
  blockedFor(deck: string, card: string, gameNo: number): boolean {
    const rec = this.deckSeen(deck).get(card)
    return rec !== undefined && rec.gameNo >= gameNo - 1
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
  // Единица — показанный вопрос: средняя оценка команды = сумма оценок / игроков в комнате (кто не нажал — «нормально»,
  // 0). Так размер лобби и то, сколько людей вообще жмут кнопки, на вес не влияют. «Удалить» = −2 в оценке; вопрос
  // уходит в архив, только когда «удалить» нажали больше половины игроков комнаты.

  ratingOf(key: string): { n: number; sum: number } {
    return this.ratingSums.get(key) ?? { n: 0, sum: 0 }
  }

  private addToKeys(category: string, sub: string, dn: number, dsum: number): void {
    for (const key of [`cat:${category}`, `sub:${sub}`]) {
      const r = this.ratingOf(key)
      this.ratingSums.set(key, { n: r.n + dn, sum: r.sum + dsum })
    }
  }

  showing(row: ShowingRow): void {
    this.shows.set(`${row.gameNo}|${row.questionId}`,
      { roomPlayers: Math.max(1, row.roomPlayers), category: row.category, sub: row.sub, votes: new Map() })
    this.addToKeys(row.category, row.sub, 1, 0)
    this.backend.showing(row)
  }

  /**
   * Голос игрока. Сразу меняет суммы в памяти (следующий выбор вопроса уже его видит) и сразу пишется в базу —
   * исход игры не важен. Показ в памяти не нашёлся (сервер перезапускали, лаборатория) — делитель берётся из
   * события (roomPlayers), число показов не растёт: показ уже учтён при загрузке из q_showing.
   */
  rate(row: RatingRow, info: { text: string; roomPlayers: number }): void {
    const key = `${row.gameNo}|${row.questionId}`
    let show = this.shows.get(key)
    if (!show) {
      show = { roomPlayers: Math.max(1, info.roomPlayers), category: row.category, sub: row.sub, votes: new Map() }
      this.shows.set(key, show)
    }
    const prev: Vote = show.votes.get(row.player) ?? { score: null, difficulty: null }
    const next: Vote = {
      name: row.name ?? prev.name,
      score: row.score !== undefined ? row.score : prev.score,
      difficulty: row.difficulty !== undefined ? row.difficulty : prev.difficulty,
    }
    show.votes.set(row.player, next)
    const delta = (next.score ?? 0) - (prev.score ?? 0)
    if (delta) this.addToKeys(show.category, show.sub, 0, delta / show.roomPlayers)
    const deletes = [...show.votes.values()].filter(v => v.score !== null && v.score <= -2)
    if (deletes.length * 2 > show.roomPlayers && !this.archived.has(row.questionId)) {
      this.archived.add(row.questionId)
      this.backend.archive(row.questionId, {
        by: deletes.map(v => v.name ?? '?').join(', '), category: row.category, sub: row.sub, text: info.text,
        votes: deletes.length, players: show.roomPlayers,
      })
    }
    this.backend.rating({ ...row, name: next.name, score: next.score, difficulty: next.difficulty })
  }
}
