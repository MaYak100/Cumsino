import type { Server, Socket } from 'socket.io'
import { GameRoom } from './GameRoom'
import type { FriendProfile, JoinErrorPayload } from '@cumsino/shared'
import { MAX_PLAYERS } from '@cumsino/shared'
import { loadLibrary, type Library } from './questions/library'
import { RoomQuestions } from './questions/picker'
import { QuestionHistory } from './questions/history'

/** комнат на процесс не больше: каждая держит таймеры и колоды в памяти */
export const MAX_ROOMS = 200

/** Что движку нужно от сокета (для тестов хватает заглушки). */
type JoinSocket = Pick<Socket, 'id' | 'join' | 'leave' | 'emit'>

export class GameEngine {
  private rooms: Map<string, GameRoom> = new Map()
  private playerRoom: Map<string, string> = new Map()

  private library: Library
  private friendRoster: FriendProfile[]

  constructor(private io: Server, private history: QuestionHistory = new QuestionHistory(), library?: Library) {
    this.library = library ?? loadLibrary()   // вопросы читаются при старте сервера
    this.friendRoster = Object.entries(this.library.friends?.people ?? {})
      .map(([id, p]) => ({ id: Number(id), name: p.name }))
  }

  get roomCount() { return this.rooms.size }

  /** Вход в комнату (создаёт её). Комната полна / сервер полон — join_error, а игрок остаётся, где был. */
  joinRoom(socket: JoinSocket, name: string, gameCode: string): void {
    const prev = this.playerRoom.get(socket.id)
    let room = this.rooms.get(gameCode)
    const rejoin = prev === gameCode && !!room?.has(socket.id)
    // проверки — до выхода из старой комнаты: отказ не должен выкидывать игрока из игры
    if (!rejoin) {
      if (room?.isFull) {
        this.joinError(socket, 'room_full', `В комнате уже ${MAX_PLAYERS} игроков`)
        return
      }
      if (!room && this.rooms.size >= MAX_ROOMS) {
        this.joinError(socket, 'server_full', 'Сервер переполнен — попробуй позже')
        return
      }
    }
    if (prev && prev !== gameCode) {   // переход в другую комнату — без «призрака» в старой
      this.leaveRoom(socket.id)
      socket.leave(prev)
    }
    if (!room) {
      room = this.createRoom(gameCode)
      console.log(`[room] created ${gameCode} | total rooms: ${this.rooms.size}`)
    }
    if (!room.addPlayer(socket.id, name)) {
      this.joinError(socket, 'room_full', `В комнате уже ${MAX_PLAYERS} игроков`)
      return
    }
    socket.join(gameCode)
    this.playerRoom.set(socket.id, gameCode)
  }

  private joinError(socket: JoinSocket, reason: JoinErrorPayload['reason'], message: string) {
    const payload: JoinErrorPayload = { reason, message }
    socket.emit('join_error', payload)
  }

  leaveRoom(socketId: string): void {
    const gameCode = this.playerRoom.get(socketId)
    if (!gameCode) return
    const room = this.rooms.get(gameCode)
    if (room) {
      room.removePlayer(socketId)
      // людей не осталось (одни боты — тоже пустая): закрываем, destroy снимает и таймеры ботов
      if (room.humanCount === 0) {
        room.destroy()
        this.rooms.delete(gameCode)
        console.log(`[room] destroyed ${gameCode} | rooms left: ${this.rooms.size}${this.rooms.size === 0 ? ' — сервер можно усыплять' : ''}`)
      }
    }
    this.playerRoom.delete(socketId)
  }

  getRoom(socketId: string): GameRoom | undefined {
    const code = this.playerRoom.get(socketId)
    return code ? this.rooms.get(code) : undefined
  }

  private createRoom(gameCode: string): GameRoom {
    // пикер на игру: колоды общие (history), а «уже было в этой игре» и исключения статистики — свои
    const room = new GameRoom(gameCode, new RoomQuestions(this.library, this.history), this.friendRoster)

    room.on('broadcast', ({ event, data }: { event: string; data: unknown }) => {
      this.io.to(gameCode).emit(event, data)
    })

    room.on('broadcastExcept', ({ excludeId, event, data }: { excludeId: string; event: string; data: unknown }) => {
      this.io.to(gameCode).except(excludeId).emit(event, data)
    })

    room.on('sendToPlayer', ({ playerId, event, data }: { playerId: string; event: string; data: unknown }) => {
      this.io.to(playerId).emit(event, data)
    })

    this.rooms.set(gameCode, room)
    return room
  }
}
