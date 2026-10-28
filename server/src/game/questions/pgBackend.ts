// server/src/game/questions/pgBackend.ts
// Хранилище истории вопросов в Postgres (Neon, DATABASE_URL). Таблицы создаются сами при старте. Запись —
// в фоне, по одной операции: ошибка базы пишется в лог и не ломает игру (состояние в памяти верное до
// перезапуска). Схема:
//   q_meta     — счётчик игр
//   q_deck     — номер круга колоды подкатегории
//   q_seen     — последний показ карточки в колоде (круг, номер игры)
//   q_archive  — «удалить» большинством комнаты: вопрос больше не выпадает (кто, сколько голосов, текст)
//   q_credit   — кредиты сглаженного выбора
//   q_rating   — оценки и сложность (одна строка на игрока, вопрос и игру; переоценка заменяет)
//   q_showing  — показы: сколько игроков, ответили, верно, ошибки в «ближе всех» — статистика по категориям
import { Pool } from 'pg'
import type { HistoryBackend, HistorySnapshot, RatingRow, ShowingRow } from './history'

const SCHEMA = `
create table if not exists q_meta (key text primary key, value bigint not null);
create table if not exists q_deck (deck text primary key, cycle int not null);
create table if not exists q_seen (
  deck text not null, card text not null, cycle int not null, game_no int not null,
  seen_at timestamptz not null default now(), primary key (deck, card));
create table if not exists q_archive (
  question_id text primary key, by_name text, category text, sub text, text text,
  archived_at timestamptz not null default now());
alter table q_archive add column if not exists votes int;
alter table q_archive add column if not exists players int;
create table if not exists q_credit (scope text not null, item text not null, credit double precision not null,
  primary key (scope, item));
create table if not exists q_rating (
  question_id text not null, category text not null, sub text not null, game_no int not null, player text not null,
  score smallint, difficulty smallint, rated_at timestamptz not null default now(),
  primary key (question_id, game_no, player));
create table if not exists q_showing (
  id bigserial primary key, question_id text not null, category text not null, sub text not null, mode text not null,
  game_no int not null, players int not null, answered int not null, correct int not null,
  rel_errors double precision[], shown_at timestamptz not null default now());
alter table q_showing add column if not exists room_players int;
`

export class PgBackend implements HistoryBackend {
  private pool: Pool
  private queue: Promise<unknown> = Promise.resolve()

  constructor(url: string) {
    this.pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30_000 })
    this.pool.on('error', err => console.error('[history] pg:', err.message))
  }

  async load(): Promise<HistorySnapshot> {
    await this.pool.query(SCHEMA)
    const [meta, decks, seen, archived, credits, ratings] = await Promise.all([
      this.pool.query(`select value from q_meta where key = 'game_no'`),
      this.pool.query(`select deck, cycle from q_deck`),
      this.pool.query(`select deck, card, cycle, game_no from q_seen`),
      this.pool.query(`select question_id from q_archive`),
      this.pool.query(`select scope, item, credit from q_credit`),
      // показ = одна точка: сумма оценок / игроков в комнате (не нажал — «нормально», 0)
      this.pool.query(`
        with s as (
          select sh.category, sh.sub,
            coalesce(r.total, 0)::float / greatest(coalesce(sh.room_players, sh.players), 1) as team
          from q_showing sh
          left join (select question_id, game_no, sum(score) as total from q_rating
                     where score is not null group by question_id, game_no) r
            on r.question_id = sh.question_id and r.game_no = sh.game_no)
        select 'cat:' || category as key, count(*)::int as n, sum(team) as sum from s group by category
        union all
        select 'sub:' || sub, count(*)::int, sum(team) from s group by sub`),
    ])
    return {
      gameNo: Number(meta.rows[0]?.value ?? 0),
      cycles: Object.fromEntries(decks.rows.map(r => [r.deck, r.cycle])),
      seen: seen.rows.map(r => ({ deck: r.deck, card: r.card, cycle: r.cycle, gameNo: r.game_no })),
      archived: archived.rows.map(r => r.question_id),
      credits: credits.rows.map(r => ({ scope: r.scope, item: r.item, credit: r.credit })),
      ratings: ratings.rows.map(r => ({ key: r.key, n: r.n, sum: Number(r.sum ?? 0) })),
    }
  }

  /** Запросы идут по очереди: порядок записей сохраняется (кредиты, круг колоды). */
  private run(sql: string, params: unknown[]): void {
    this.queue = this.queue
      .then(() => this.pool.query(sql, params))
      .catch(err => console.error('[history] запись не удалась:', (err as Error).message))
  }

  /** Дождаться записи всего, что уже отправлено (тесты, остановка сервера). */
  flush(): Promise<unknown> {
    return this.queue
  }

  async close(): Promise<void> {
    await this.flush()
    await this.pool.end()
  }

  gameStarted(gameNo: number): void {
    this.run(`insert into q_meta (key, value) values ('game_no', $1)
      on conflict (key) do update set value = greatest(q_meta.value, excluded.value)`, [gameNo])
  }

  seen(deck: string, card: string, cycle: number, gameNo: number): void {
    this.run(`insert into q_seen (deck, card, cycle, game_no) values ($1, $2, $3, $4)
      on conflict (deck, card) do update set cycle = excluded.cycle, game_no = excluded.game_no, seen_at = now()`,
    [deck, card, cycle, gameNo])
  }

  cycle(deck: string, cycle: number): void {
    this.run(`insert into q_deck (deck, cycle) values ($1, $2)
      on conflict (deck) do update set cycle = excluded.cycle`, [deck, cycle])
  }

  credits(scope: string, entries: Array<[string, number]>): void {
    if (!entries.length) return
    this.run(`insert into q_credit (scope, item, credit)
      select $1, unnest($2::text[]), unnest($3::double precision[])
      on conflict (scope, item) do update set credit = excluded.credit`,
    [scope, entries.map(e => e[0]), entries.map(e => e[1])])
  }

  archive(questionId: string, info: { by: string; category: string; sub: string; text: string; votes: number; players: number }): void {
    this.run(`insert into q_archive (question_id, by_name, category, sub, text, votes, players)
      values ($1, $2, $3, $4, $5, $6, $7) on conflict (question_id) do nothing`,
    [questionId, info.by, info.category, info.sub, info.text, info.votes, info.players])
  }

  rating(row: RatingRow): void {
    this.run(`insert into q_rating (question_id, category, sub, game_no, player, score, difficulty)
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (question_id, game_no, player) do update set
        score = coalesce(excluded.score, q_rating.score),
        difficulty = coalesce(excluded.difficulty, q_rating.difficulty),
        rated_at = now()`,
    [row.questionId, row.category, row.sub, row.gameNo, row.player, row.score ?? null, row.difficulty ?? null])
  }

  showing(row: ShowingRow): void {
    this.run(`insert into q_showing (question_id, category, sub, mode, game_no, room_players, players, answered, correct,
      rel_errors) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [row.questionId, row.category, row.sub, row.mode, row.gameNo, row.roomPlayers, row.players, row.answered,
      row.correct, row.relErrors ?? null])
  }
}
