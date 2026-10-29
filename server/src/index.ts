import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { GameEngine } from './game/GameEngine'
import { registerHandlers } from './socket/handlers'
import { createHistory } from './game/questions/setup'
import type { QuestionHistory } from './game/questions/history'
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

const FLUSH_TIMEOUT_MS = 5_000

/** SIGTERM (Render при деплое) / SIGINT (Ctrl+C, tsx watch): дописать очередь записей в Neon и выйти.
 *  Повторный сигнал — выход сразу. */
function exitOnSignals(history: QuestionHistory) {
  let stopping = false
  const stop = async (signal: string) => {
    if (stopping) process.exit(1)
    stopping = true
    console.log(`[server] ${signal}: дописываю историю вопросов в базу…`)
    httpServer.close()
    let timer: ReturnType<typeof setTimeout> | undefined
    const done = await Promise.race([
      history.flush().then(() => 'записано'),
      new Promise<string>(r => { timer = setTimeout(() => r(`не дождался за ${FLUSH_TIMEOUT_MS / 1000} с`), FLUSH_TIMEOUT_MS) }),
    ])
    clearTimeout(timer)
    console.log(`[server] история: ${done}, выход`)
    process.exit(0)
  }
  process.on('SIGTERM', () => void stop('SIGTERM'))
  process.on('SIGINT', () => void stop('SIGINT'))
}

async function main() {
  // история вопросов (колоды, оценки) — до первого подключения, чтобы первая игра не начала с пустой памятью
  const history = await createHistory()
  exitOnSignals(history)
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
