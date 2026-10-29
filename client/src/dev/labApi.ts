// client/src/dev/labApi.ts
// Запросы лаборатории к dev-адресам сервера (server/src/dev/questionLab.ts). Сервер тот же, что у игры
// (VITE_SERVER_URL или localhost:3001); в production этих адресов нет.
import type { GameMode, Question } from '@cumsino/shared'

export const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export interface LabSub {
  id: string
  title: string
  /** вес в MC и в «кто ближе» (categories.ts: weight и closest) */
  weight: number
  closestWeight: number
  /** тема: постоянный субъект и аспект подкатегории */
  subject: string | null
  aspect: string | null
  source: 'bank' | 'stats' | 'friends'
  kinds: Array<'mc' | 'closest'>
  counts: { mc: number; closest: number; number?: number; choice?: number }
  templates: number
}

export interface LabCategory {
  id: string
  title: string
  weight: number
  closestWeight: number
  requires: 'friends' | null
  subs: LabSub[]
}

export interface LabCatalog {
  stats: { snapshot: string; patch: string } | null
  friends: Array<{ id: number; name: string; open: boolean }>
  minFriends: number
  warnings: string[]
  categories: LabCategory[]
}

export interface QuestionMeta {
  id: string
  category: string
  categoryTitle: string
  sub: string
  subTitle: string
  source: 'bank' | 'stats' | 'friends'
  bankKind?: 'number' | 'choice'
  step?: number
  unit?: string
  numberAnswer?: number
  bankTopic?: string
}

export interface LabQuestion {
  question: Question
  meta: QuestionMeta
  /** срез кончился и пошёл по новому кругу */
  wrapped: boolean
}

export class LabError extends Error {
  constructor(message: string, readonly offline = false) { super(message) }
}

const OFFLINE = `Сервер ${SERVER_URL} не отвечает — запусти npm run dev:server`

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${SERVER_URL}/dev${path}`, init)
  } catch {
    throw new LabError(OFFLINE, true)
  }
  const body = await res.json().catch(() => null)
  if (res.status === 404 && !body) {
    throw new LabError(`На ${SERVER_URL} нет /dev — сервер старый или запущен с NODE_ENV=production`, true)
  }
  if (!res.ok) throw new LabError(body?.error ?? `ошибка ${res.status}`)
  return body as T
}

export const fetchCatalog = () => call<LabCatalog>('/catalog')

export function fetchQuestion(p: {
  session: string; mode: GameMode; cat?: string | null; sub?: string | null; id?: string; friends: number[]
}): Promise<LabQuestion> {
  const q = new URLSearchParams({ session: p.session, mode: p.mode })
  if (p.id) q.set('id', p.id)
  else {
    if (p.cat) q.set('cat', p.cat)
    if (p.sub) q.set('sub', p.sub)
  }
  if (p.friends.length) q.set('friends', p.friends.join(','))
  return call<LabQuestion>(`/question?${q}`)
}

export const resetSession = (session: string) =>
  call<{ ok: boolean }>(`/reset?session=${encodeURIComponent(session)}`, { method: 'POST' })
