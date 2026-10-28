// server/src/game/questions/setup.ts
// История вопросов при старте сервера: с DATABASE_URL — Neon, без него (или если база не ответила) — только
// память процесса. Локально DATABASE_URL берётся из .env в корне репозитория.
import * as fs from 'fs'
import * as path from 'path'
import { QuestionHistory } from './history'
import { PgBackend } from './pgBackend'

const LOAD_TIMEOUT_MS = 15_000   // Neon после простоя просыпается за секунды

function loadDotEnv(): void {
  const file = path.join(__dirname, '..', '..', '..', '..', '.env')
  if (process.env.NODE_ENV !== 'production' && fs.existsSync(file)) process.loadEnvFile(file)
}

export async function createHistory(): Promise<QuestionHistory> {
  loadDotEnv()
  const url = process.env.DATABASE_URL
  if (!url) {
    console.warn('[history] DATABASE_URL не задан — колоды и оценки живут до перезапуска сервера')
    return new QuestionHistory()
  }
  const backend = new PgBackend(url)
  const history = new QuestionHistory(backend)
  try {
    await Promise.race([
      history.init(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('таймаут')), LOAD_TIMEOUT_MS)),
    ])
    console.log(`[history] Neon: игр сыграно ${history.gameNo}, в архиве ${history.archived.size}`)
    return history
  } catch (err) {
    console.error(`[history] база не ответила (${(err as Error).message}) — работаем без неё`)
    return new QuestionHistory()
  }
}
