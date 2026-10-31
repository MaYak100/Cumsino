import type { Server, Socket } from 'socket.io'
import { randomBytes } from 'crypto'
import { GameRoom } from './GameRoom'
import type { FriendProfile, JoinErrorPayload, JoinedPayload } from '@cumsino/shared'
import { MAX_PLAYERS } from '@cumsino/shared'
import { loadLibrary, type Library } from './questions/library'
import { RoomQuestions } from './questions/picker'
import { QuestionHistory } from './questions/history'

/** комнат на процесс не больше: каждая держит таймеры и колоды в памяти */
export const MAX_ROOMS = 200
/** в комнате никого в сети столько времени — закрывается (вернуться уже некуда) */
export const ROOM_EMPTY_TTL_MS = 10 * 60 * 1000

/** Что движку нужно от сокета (для тестов хватает заглушки). */
type JoinSocket = Pick<Socket, 'id' | 'join' | 'leave' | 'emit'> & { disconnect?: (close?: boolean) => unknown }

/** Сокет ↔ игрок. Игрок — это не сокет: сокет меняется при каждом переподключении, игрок (id в комнате) остаётся. */
interface Binding { code: string; playerId: string; socket: JoinSocket }

/** Комната Socket.IO одного игрока: туда входит его текущий сокет, туда шлются личные события. */
export const playerChannel = (playerId: string) => `pl:${playerId}`

export class GameEngine {
  private rooms: Map<string, GameRoom> = new Map()
  /** socket.id → игрок */
  private bySocket: Map<string, Binding> = new Map()
  /** `${code}|${playerId}` → его текущий сокет */
  private byPlayer: Map<string, Binding> = new Map()
  /** таймеры закрытия комнат, где никого нет в сети */
  private emptyTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  private library: Library
  private friendRoster: FriendProfile[]

  constructor(private io: Server, private history: QuestionHistory = new QuestionHistory(), library?: Library) {
    this.library = library ?? loadLibrary()   // вопросы читаются при старте сервера
    this.friendRoster = Object.entries(this.library.friends?.people ?? {})
      .map(([id, p]) => ({ id: Number(id), name: p.name }))
  }

  get roomCount() { return this.rooms.size }

  /** Вход в комнату (создаёт её). Есть токен этой комнаты — тот же игрок со всем своим (после обрыва связи, после
   *  перезагрузки страницы); нет — новый. Комната полна / сервер полон — join_error, а игрок остаётся, где был. */
  joinRoom(socket: JoinSocket, name: string, gameCode: string, token?: string): void {
    const prev = this.bySocket.get(socket.id)
    let room = this.rooms.get(gameCode)
    const key = token || randomBytes(16).toString('hex')

    // тот же сокет повторно входит туда же — тем же игроком (фишки не сбрасываются)
    if (prev && prev.code === gameCode && room?.has(prev.playerId)) {
      room.addPlayer(prev.playerId, name, key)
      socket.emit('joined', { playerId: prev.playerId } satisfies JoinedPayload)
      return
    }

    const resumed = room?.resume(key, name)
    if (!resumed) {
      // проверки — до выхода из старой комнаты: отказ не должен выкидывать игрока из игры
      if (room?.isFull && !room.canFreeSeat) {
        this.joinError(socket, 'room_full', `В комнате уже ${MAX_PLAYERS} игроков`)
        return
      }
      if (!room && this.rooms.size >= MAX_ROOMS) {
        this.joinError(socket, 'server_full', 'Сервер переполнен — попробуй позже')
        return
      }
    }
    if (prev && prev.code !== gameCode) this.leaveRoom(socket.id)   // переход в другую комнату — без «призрака» в старой
    if (!room) {
      room = this.createRoom(gameCode)
      console.log(`[room] created ${gameCode} | total rooms: ${this.rooms.size}`)
    }

    let playerId = resumed
    if (!playerId) {
      playerId = `p-${randomBytes(6).toString('hex')}`
      if (!room.addPlayer(playerId, name, key)) {
        this.joinError(socket, 'room_full', `В комнате уже ${MAX_PLAYERS} игроков`)
        return
      }
    }
    this.bind(socket, gameCode, playerId)
    if (resumed) console.log(`[room] ${gameCode}: ${name} вернулся (${playerId})`)
    // комната разослала стейт до того, как сокет вошёл в канал игрока, — ему отдельно
    socket.emit('joined', { playerId } satisfies JoinedPayload)
    socket.emit('game_state', room.getStateForPlayer(playerId))
  }

  /** Сокет становится текущим у игрока; прежний сокет того же игрока (вторая вкладка, старое соединение) — отключается. */
  private bind(socket: JoinSocket, code: string, playerId: string) {
    const key = `${code}|${playerId}`
    const old = this.byPlayer.get(key)
    if (old && old.socket.id !== socket.id) {
      this.bySocket.delete(old.socket.id)   // его disconnect уже не уведёт игрока из сети
      old.socket.emit('session_replaced', {})
      old.socket.leave(code)
      old.socket.leave(playerChannel(playerId))
      old.socket.disconnect?.(true)
    }
    const b: Binding = { code, playerId, socket }
    this.bySocket.set(socket.id, b)
    this.byPlayer.set(key, b)
    socket.join(code)
    socket.join(playerChannel(playerId))
    clearTimeout(this.emptyTimers.get(code))
    this.emptyTimers.delete(code)
  }

  private joinError(socket: JoinSocket, reason: JoinErrorPayload['reason'], message: string) {
    const payload: JoinErrorPayload = { reason, message }
    socket.emit('join_error', payload)
  }

  /** Связь оборвалась: игрок остаётся в игре «не в сети» и вернётся по токену. Никого в сети — комната ждёт
   *  ROOM_EMPTY_TTL_MS и закрывается. */
  disconnect(socketId: string): void {
    const b = this.bySocket.get(socketId)
    if (!b) return
    this.bySocket.delete(socketId)
    const key = `${b.code}|${b.playerId}`
    if (this.byPlayer.get(key) === b) this.byPlayer.delete(key)
    const room = this.rooms.get(b.code)
    if (!room) return
    room.setOffline(b.playerId)
    if (room.onlineHumans === 0 && !this.emptyTimers.has(b.code)) {
      this.emptyTimers.set(b.code, setTimeout(() => {
        this.emptyTimers.delete(b.code)
        const r = this.rooms.get(b.code)
        if (r && r.onlineHumans === 0) this.closeRoom(b.code, 'никого в сети')
      }, ROOM_EMPTY_TTL_MS))
    }
  }

  /** Игрок вышел сам (кнопка «Выйти», переход в другую комнату): уходит из комнаты совсем. */
  leaveRoom(socketId: string): void {
    const b = this.bySocket.get(socketId)
    if (!b) return
    this.bySocket.delete(socketId)
    this.byPlayer.delete(`${b.code}|${b.playerId}`)
    b.socket.leave(b.code)
    b.socket.leave(playerChannel(b.playerId))
    const room = this.rooms.get(b.code)
    if (!room) return
    room.removePlayer(b.playerId)
    // людей не осталось (одни боты — тоже пустая): закрываем, destroy снимает и таймеры ботов
    if (room.humanCount === 0) this.closeRoom(b.code, 'все вышли')
  }

  private closeRoom(code: string, why: string) {
    const room = this.rooms.get(code)
    if (!room) return
    room.destroy()
    this.rooms.delete(code)
    clearTimeout(this.emptyTimers.get(code))
    this.emptyTimers.delete(code)
    for (const [key, b] of this.byPlayer) if (b.code === code) this.byPlayer.delete(key)
    for (const [id, b] of this.bySocket) if (b.code === code) this.bySocket.delete(id)
    console.log(`[room] destroyed ${code} (${why}) | rooms left: ${this.rooms.size}${this.rooms.size === 0 ? ' — сервер можно усыплять' : ''}`)
  }

  /** Комната и игрок этого сокета. */
  ctx(socketId: string): { room: GameRoom; id: string } | undefined {
    const b = this.bySocket.get(socketId)
    const room = b && this.rooms.get(b.code)
    return room && b ? { room, id: b.playerId } : undefined
  }

  getRoom(socketId: string): GameRoom | undefined {
    return this.ctx(socketId)?.room
  }

  private createRoom(gameCode: string): GameRoom {
    // пикер на игру: колоды общие (history), а «уже было в этой игре» и исключения статистики — свои
    const room = new GameRoom(gameCode, new RoomQuestions(this.library, this.history), this.friendRoster)

    room.on('broadcast', ({ event, data }: { event: string; data: unknown }) => {
      this.io.to(gameCode).emit(event, data)
    })

    room.on('broadcastExcept', ({ excludeId, event, data }: { excludeId: string; event: string; data: unknown }) => {
      this.io.to(gameCode).except(playerChannel(excludeId)).emit(event, data)
    })

    room.on('sendToPlayer', ({ playerId, event, data }: { playerId: string; event: string; data: unknown }) => {
      this.io.to(playerChannel(playerId)).emit(event, data)
    })

    this.rooms.set(gameCode, room)
    return room
  }
}
