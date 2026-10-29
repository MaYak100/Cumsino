import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { GameEngine } from './game/GameEngine'
import { registerHandlers } from './socket/handlers'
import { createHistory } from './game/questions/setup'
import { createQuestionLabRouter } from './dev/questionLab'

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

// лаборатория вопросов для client /dev — только локально: на Render NODE_ENV=production, там этих адресов нет
if (process.env.NODE_ENV !== 'production') {
  app.use('/dev', createQuestionLabRouter())
  console.log('[dev] лаборатория вопросов: /dev/catalog, /dev/question')
}

// последний рубеж: игра в памяти — лучше продолжить с логом, чем потерять все комнаты
process.on('uncaughtException', err => console.error('[uncaught]', err))
process.on('unhandledRejection', err => console.error('[unhandled]', err))

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
