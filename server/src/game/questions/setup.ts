// server/src/game/questions/setup.ts
// История вопросов при старте сервера: с DATABASE_URL — Neon, без него (или если база так и не ответила) — только
// память процесса. Локально DATABASE_URL берётся из .env: ближайший вверх от корня репозитория — в worktree
// (.claude/worktrees/<имя>/) своего .env нет (он в .gitignore), берётся .env основного checkout.
import * as fs from 'fs'
import * as path from 'path'
import { parseEnv } from 'util'
import { QuestionHistory } from './history'
import type { PgBackend } from './pgBackend'

const LOAD_TIMEOUT_MS = 15_000   // Neon после простоя просыпается за секунды
const LOAD_ATTEMPTS = 4
const RETRY_PAUSE_MS = 3_000

const REPO = path.join(__dirname, '..', '..', '..', '..')

/** Ближайший .env от dir вверх по родительским папкам (worktree → основной checkout); нет — null. */
export function findDotEnv(dir: string = REPO): string | null {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    const file = path.join(d, '.env')
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file
    if (path.dirname(d) === d) return null
  }
}

/**
 * Переменные из .env — только те, которых нет в окружении: явно заданная побеждает, даже пустая
 * (`DATABASE_URL= npm run dev:server` — без базы). Возвращает имена загруженных.
 */
export function loadDotEnv(file: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const vars = parseEnv(fs.readFileSync(file, 'utf-8'))
  const loaded: string[] = []
  for (const [key, value] of Object.entries(vars)) {
    if (key in env) continue
    env[key] = value
    loaded.push(key)
  }
  return loaded
}

function dotEnv(): void {
  if (process.env.NODE_ENV === 'production') return
  const file = findDotEnv()
  if (!file) {
    console.log('[env] .env не найден (искал вверх от корня репозитория)')
    return
  }
  const loaded = loadDotEnv(file)
  console.log(`[env] ${file}: ${loaded.length ? loaded.join(', ') : 'всё уже задано в окружении'}`)
}

function loud(lines: string[]): void {
  const bar = '!'.repeat(78)
  console.error([bar, ...lines.map(l => `!! ${l}`), bar].join('\n'))
}

export async function createHistory(opts: { attempts?: number; timeoutMs?: number; pauseMs?: number } = {}):
  Promise<QuestionHistory> {
  dotEnv()
  const url = process.env.DATABASE_URL
  if (!url) {
    console.warn('[history] DATABASE_URL не задан — колоды и оценки живут до перезапуска сервера')
    return new QuestionHistory()
  }
  // pg грузится только при DATABASE_URL: нет модуля (не сделали npm install) — громкий лог, а не падение сервера
  let Backend: typeof PgBackend
  try {
    Backend = (await import('./pgBackend')).PgBackend
  } catch (err) {
    loud([`Модуль pg не загрузился (${(err as Error).message.split('\n')[0]}) — сервер работает БЕЗ NEON.`,
      'Нужен npm install в корне репозитория (основного checkout).'])
    return new QuestionHistory()
  }
  const attempts = opts.attempts ?? LOAD_ATTEMPTS
  const timeoutMs = opts.timeoutMs ?? LOAD_TIMEOUT_MS
  let lastError = ''
  for (let n = 1; n <= attempts; n++) {
    // каждая попытка — свои пул и история: поздний ответ брошенной попытки ничего не испортит
    const backend = new Backend(url)
    const history = new QuestionHistory(backend)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        history.init(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('таймаут')), timeoutMs) }),
      ])
      console.log(`[history] Neon: игр сыграно ${history.gameNo}, в архиве ${history.archived.size}` +
        (n > 1 ? ` (с попытки ${n})` : ''))
      return history
    } catch (err) {
      lastError = (err as Error).message
      console.warn(`[history] база не ответила, попытка ${n} из ${attempts}: ${lastError}`)
      backend.close().catch(() => {})
      if (n < attempts) await new Promise(r => setTimeout(r, opts.pauseMs ?? RETRY_PAUSE_MS))
    } finally {
      clearTimeout(timer)
    }
  }
  loud([
    `БАЗА ВОПРОСОВ НЕДОСТУПНА (${lastError}) — сервер работает БЕЗ NEON.`,
    'Колоды, оценки, показы и архив живут только до перезапуска и в базу НЕ попадут.',
    'Перезапусти сервер, когда Neon проснётся.',
  ])
  return new QuestionHistory()
}
