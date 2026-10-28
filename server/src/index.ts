import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { GameEngine } from './game/GameEngine'
import { registerHandlers } from './socket/handlers'
import { createHistory } from './game/questions/setup'

const app = express()
const httpServer = createServer(app)

const CLIENT_ORIGIN: string | RegExp = process.env.CLIENT_ORIGIN ?? /^http:\/\/localhost(:\d+)?$/

const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
})

app.use(cors({ origin: CLIENT_ORIGIN }))
app.get('/health', (_req, res) => {
  console.log(`[ping] health check — сервер жив`)
  res.json({ ok: true })
})

async function main() {
  // история вопросов (колоды, оценки) — до первого подключения, чтобы первая игра не начала с пустой памятью
  const history = await createHistory()
  const engine = new GameEngine(io, history)

  io.on('connection', (socket) => {
    console.log('connected:', socket.id)
    registerHandlers(socket, engine)
  })

  const PORT = process.env.PORT ?? 3001
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

main()
