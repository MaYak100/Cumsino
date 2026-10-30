// GameEngine: вход, полная комната, переход между комнатами, потолок комнат.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GameEngine, MAX_ROOMS } from '../GameEngine'
import { QuestionHistory } from '../questions/history'
import type { Library } from '../questions/library'
import { MAX_PLAYERS } from '@cumsino/shared'

const emptyLibrary: Library = { categories: [], stats: null, friends: null, heroNames: {}, warnings: [] }

function makeEngine() {
  const io = { to: () => ({ emit: () => true, except: () => ({ emit: () => true }) }) }
  return new GameEngine(io as any, new QuestionHistory(), emptyLibrary)
}

function makeSocket(id: string) {
  const rooms = new Set<string>()
  const emitted: Array<{ event: string; data: any }> = []
  return {
    id, rooms, emitted,
    join: (r: string) => { rooms.add(r) },
    leave: (r: string) => { rooms.delete(r) },
    emit: (event: string, data: any) => { emitted.push({ event, data }); return true },
  }
}

describe('GameEngine', () => {
  beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}) })
  afterEach(() => { vi.restoreAllMocks() })

  it('первый вход создаёт комнату, сокет в ней', () => {
    const e = makeEngine()
    const s = makeSocket('a')
    e.joinRoom(s as any, 'A', 'ROOM')
    expect(e.roomCount).toBe(1)
    expect(e.getRoom('a')?.id).toBe('ROOM')
    expect(s.rooms.has('ROOM')).toBe(true)
  })

  it(`полная комната (${MAX_PLAYERS}) — join_error room_full, игрок остаётся в старой комнате`, () => {
    const e = makeEngine()
    for (let i = 0; i < MAX_PLAYERS; i++) e.joinRoom(makeSocket(`p${i}`) as any, `P${i}`, 'FULL')
    const s = makeSocket('x')
    e.joinRoom(s as any, 'X', 'HOME')
    e.joinRoom(s as any, 'X', 'FULL')
    expect(s.emitted.find(m => m.event === 'join_error')?.data.reason).toBe('room_full')
    expect(e.getRoom('x')?.id).toBe('HOME')
    expect(s.rooms.has('HOME')).toBe(true)
    expect(e.getRoom('p0')?.playerCount).toBe(MAX_PLAYERS)
  })

  it('повторный join в свою полную комнату — не отказ', () => {
    const e = makeEngine()
    const socks = Array.from({ length: MAX_PLAYERS }, (_, i) => makeSocket(`p${i}`))
    for (const s of socks) e.joinRoom(s as any, s.id, 'FULL')
    e.joinRoom(socks[0] as any, 'p0', 'FULL')
    expect(socks[0].emitted.some(m => m.event === 'join_error')).toBe(false)
    expect(e.getRoom('p0')?.playerCount).toBe(MAX_PLAYERS)
  })

  it('переход в другую комнату: из старой выходит, опустевшая удаляется', () => {
    const e = makeEngine()
    const s = makeSocket('a')
    const other = makeSocket('b')
    e.joinRoom(s as any, 'A', 'ONE')
    e.joinRoom(other as any, 'B', 'TWO')
    e.joinRoom(s as any, 'A', 'TWO')
    expect(e.roomCount).toBe(1)
    expect(e.getRoom('a')?.id).toBe('TWO')
    expect(e.getRoom('a')?.playerCount).toBe(2)
    expect(s.rooms.has('ONE')).toBe(false)
  })

  it(`потолок ${MAX_ROOMS} комнат: новая — server_full, в существующую — можно`, () => {
    const e = makeEngine()
    for (let i = 0; i < MAX_ROOMS; i++) e.joinRoom(makeSocket(`s${i}`) as any, 'P', `R${i}`)
    expect(e.roomCount).toBe(MAX_ROOMS)
    const late = makeSocket('late')
    e.joinRoom(late as any, 'L', 'NEW')
    expect(late.emitted.find(m => m.event === 'join_error')?.data.reason).toBe('server_full')
    expect(e.getRoom('late')).toBeUndefined()
    e.joinRoom(late as any, 'L', 'R0')
    expect(e.getRoom('late')?.id).toBe('R0')
  })

  it('выход последнего — комната удаляется', () => {
    const e = makeEngine()
    e.joinRoom(makeSocket('a') as any, 'A', 'ONE')
    e.leaveRoom('a')
    expect(e.roomCount).toBe(0)
    expect(e.getRoom('a')).toBeUndefined()
  })
})
