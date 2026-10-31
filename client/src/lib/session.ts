/**
 * Сессия игрока на этом устройстве. Токен — секрет игрока в комнате: с ним после обрыва связи или перезагрузки
 * страницы сервер возвращает того же игрока (фишки, предметы, ставка, ответ), а не заводит нового с $500.
 *
 * - токены — в localStorage по паре «комната + имя»: зашёл снова тем же именем в ту же комнату — тот же игрок;
 *   другое имя в той же вкладке (тест на одном компьютере) — другой игрок;
 * - текущая игра вкладки — в sessionStorage: перезагрузил страницу — сразу обратно в игру, без экрана входа;
 * - последние имя и код — в localStorage: экран входа заполнен.
 * Хранилище может быть недоступно (приватный режим) — тогда всё живёт только в памяти вкладки.
 */

const TOKENS = 'cumsino:tokens'
const ACTIVE = 'cumsino:active'
const LAST = 'cumsino:last'

export interface Session { name: string; gameCode: string; token: string }

const memory = new Map<string, string>()

function read(storage: () => Storage, key: string): string | null {
  try { return storage().getItem(key) } catch { return memory.get(key) ?? null }
}

function write(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key)
    else storage().setItem(key, value)
  } catch {
    if (value === null) memory.delete(key)
    else memory.set(key, value)
  }
}

const local = () => window.localStorage
const session = () => window.sessionStorage

function parse<T>(raw: string | null): T | null {
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

/** 32 hex-символа; crypto.randomUUID на http по LAN нет, getRandomValues есть везде */
function newToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Токен игрока «имя» в комнате «код» на этом устройстве (нет — создаётся). */
export function tokenFor(gameCode: string, name: string): string {
  const key = `${gameCode}|${name.trim().toLocaleLowerCase()}`
  const all = parse<Record<string, string>>(read(local, TOKENS)) ?? {}
  if (all[key]) return all[key]
  const token = newToken()
  // старые комнаты не копим: оставляем последние 20
  const entries = Object.entries(all).slice(-19)
  write(local, TOKENS, JSON.stringify(Object.fromEntries([...entries, [key, token]])))
  return token
}

/** Вкладка в игре: перезагрузка вернёт сюда же. */
export function rememberActive(s: Session) {
  write(session, ACTIVE, JSON.stringify(s))
  write(local, LAST, JSON.stringify({ name: s.name, gameCode: s.gameCode }))
}

/** Игра этой вкладки (была до перезагрузки) — или null. */
export function activeSession(): Session | null {
  const s = parse<Session>(read(session, ACTIVE))
  return s && s.name && s.gameCode && s.token ? s : null
}

/** Вышел из игры сам — после перезагрузки на экран входа. */
export function forgetActive() {
  write(session, ACTIVE, null)
}

const DRAFT = 'cumsino:draft'

/** Набранное число «кто ближе» (ключ вопроса + текст) — переживает и перезагрузку страницы. */
export function saveDraft(draft: { key: string; value: string } | null) {
  write(session, DRAFT, draft ? JSON.stringify(draft) : null)
}

export function loadDraft(): { key: string; value: string } | null {
  return parse<{ key: string; value: string }>(read(session, DRAFT))
}

/** Последние имя и код комнаты — заполнить экран входа. */
export function lastJoin(): { name: string; gameCode: string } | null {
  return parse<{ name: string; gameCode: string }>(read(local, LAST))
}
