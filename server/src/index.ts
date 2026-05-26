import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { GameEngine } from './game/GameEngine'
import { registerHandlers } from './socket/handlers'

const app = express()
const httpServer = createServer(app)

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'

const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
})

app.use(cors({ origin: CLIENT_ORIGIN }))
app.get('/health', (_req, res) => res.json({ ok: true }))

const engine = new GameEngine(io)

io.on('connection', (socket) => {
  console.log('connected:', socket.id)
  registerHandlers(socket, engine)
})

const PORT = process.env.PORT ?? 3001
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
