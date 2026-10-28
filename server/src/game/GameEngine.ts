import type { Server, Socket } from 'socket.io'
import { GameRoom } from './GameRoom'
import type { FriendProfile } from '@cumsino/shared'
import { loadLibrary, type Library } from './questions/library'
import { RoomQuestions } from './questions/picker'
import { QuestionHistory } from './questions/history'

export class GameEngine {
  private rooms: Map<string, GameRoom> = new Map()
  private playerRoom: Map<string, string> = new Map()

  private library: Library
  private friendRoster: FriendProfile[]

  constructor(private io: Server, private history: QuestionHistory = new QuestionHistory()) {
    this.library = loadLibrary()   // вопросы читаются при старте сервера
    this.friendRoster = Object.entries(this.library.friends?.people ?? {})
      .map(([id, p]) => ({ id: Number(id), name: p.name }))
  }

  joinRoom(socket: Socket, name: string, gameCode: string): void {
    const prev = this.playerRoom.get(socket.id)
    if (prev && prev !== gameCode) {   // переход в другую комнату — без «призрака» в старой
      this.leaveRoom(socket.id)
      socket.leave(prev)
    }
    let room = this.rooms.get(gameCode)
    if (!room) {
      room = this.createRoom(gameCode)
      console.log(`[room] created ${gameCode} | total rooms: ${this.rooms.size}`)
    }
    socket.join(gameCode)
    this.playerRoom.set(socket.id, gameCode)
    room.addPlayer(socket.id, name)
  }

  leaveRoom(socketId: string): void {
    const gameCode = this.playerRoom.get(socketId)
    if (!gameCode) return
    const room = this.rooms.get(gameCode)
    if (room) {
      room.removePlayer(socketId)
      if (room.playerCount === 0) {
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
