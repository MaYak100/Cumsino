// Живой прогон сессий: настоящий сервер и socket.io-client — обрыв посреди ставок, возврат по токену, стол в конце
// ставок, ответ после перезагрузки, вторая вкладка, вход по имени с другого устройства, хост к человеку в сети.
// Запуск: сервер (PORT=3002 DATABASE_URL= npm run dev --workspace=server), затем node scripts/e2e_sessions.mjs [url]
import { io } from 'socket.io-client'

const URL = process.argv[2] ?? 'http://localhost:3002'
const CODE = 'E2E' + Math.floor(Math.random() * 900 + 100)
const sleep = ms => new Promise(r => setTimeout(r, ms))
let fails = 0
const check = (ok, what) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${what}`); if (!ok) fails++ }

function client(name, token) {
  const s = io(URL, { transports: ['websocket'], forceNew: true, extraHeaders: { origin: 'http://localhost:5173' } })
  const c = { s, name, token, id: null, state: null, events: [] }
  s.on('connect', () => s.emit('join_game', { name, gameCode: CODE, token }))
  s.on('joined', ({ playerId }) => { c.id = playerId })
  s.on('game_state', st => { c.state = st })
  s.onAny((ev, data) => c.events.push([ev, data]))
  return c
}
const me = c => c.state?.players.find(p => p.id === c.id)
async function until(fn, ms = 20000, what = '') {
  const t = Date.now()
  while (Date.now() - t < ms) { if (fn()) return true; await sleep(100) }
  console.log('  (не дождался: ' + what + ')')
  return false
}

const TA = 'tokenA_' + 'a'.repeat(20), TB = 'tokenB_' + 'b'.repeat(20), TC = 'tokenC_' + 'c'.repeat(20)
const A = client('Аня', TA)
const B = client('Боря', TB)
const C = client('Вася', TC)
await until(() => A.id && B.id && C.id && A.state?.players.length === 3, 8000, 'вход троих')
check(A.state.hostId === A.id, 'Аня — хост')
const bId = B.id

A.s.emit('start_game')
await until(() => A.state?.phase === 'BETTING', 20000, 'BETTING')
check(A.state.phase === 'BETTING' && A.state.mode === 'all', `первый раунд — ставки «для всех» (${A.state.phase}/${A.state.mode})`)

// Боря кладёт на стол $150 и пропадает; Вася тоже кладёт и не подтверждает
B.s.emit('stage_chip', { chips: [100, 50] })
C.s.emit('stage_chip', { chips: [20, 20] })
await sleep(300)
B.s.disconnect()
await until(() => A.state?.players.find(p => p.id === bId)?.offline, 5000, 'Боря offline')
check(!!A.state.players.find(p => p.id === bId)?.offline, 'Боря после обрыва — «не в сети», а не удалён')
check(A.state.players.length === 3, 'игроков по-прежнему трое')

// Аня ставит блайнд, Вася подтверждает — Борю не ждут: ставки кончаются сразу, за Борю — его стол
const blindA = me(A).blind
A.s.emit('place_bet', { amount: blindA, chips: [] })
C.s.emit('place_bet', { amount: Math.max(40, me(C).blind), chips: [20, 20] })
await until(() => A.state?.phase === 'QUESTION', 10000, 'QUESTION без Бори')
check(A.state.phase === 'QUESTION', 'ставки закончились, не дожидаясь Бори (через льготные 5 с)')
const bAfter = A.state.players.find(p => p.id === bId)
check(bAfter?.currentBet === 150, `за Борю поставлено то, что лежало на столе: $${bAfter?.currentBet}`)

// Боря возвращается новым сокетом с тем же токеном
const B2 = client('Боря', TB)
await until(() => B2.id && B2.state, 5000, 'возврат Бори')
check(B2.id === bId, `тот же игрок после переподключения (${B2.id} = ${bId})`)
check(!me(B2)?.spectator, 'не зритель')
check(me(B2)?.chips === 500 && me(B2)?.currentBet === 150, `фишки и ставка на месте: $${me(B2)?.chips}, ставка $${me(B2)?.currentBet}`)
check(!A.state.players.find(p => p.id === bId)?.offline, 'у других Боря снова в сети')

// Боря отвечает, его ответ сервер помнит (myAnswer); перезагрузка ещё раз — ответ виден
const opt = B2.state.currentQuestion.options[0]
B2.s.emit('submit_answer', { answer: opt })
await sleep(300)
B2.s.disconnect()
const B3 = client('Боря', TB)
await until(() => B3.id && B3.state, 5000, 'второй возврат')
check(B3.state.myAnswer === opt, 'после второго переподключения свой ответ на месте (myAnswer)')

// вторая вкладка с тем же токеном забирает игру
const B4 = client('Боря', TB)
await until(() => B3.events.some(([e]) => e === 'session_replaced'), 5000, 'session_replaced')
check(B3.events.some(([e]) => e === 'session_replaced'), 'старая вкладка получила session_replaced')
check(B4.id === bId, 'новая вкладка — тот же игрок')

// Вася пропадает и заходит с другого устройства (другой токен, то же имя) — тем же игроком
const cId = C.id
C.s.disconnect()
await until(() => A.state?.players.find(p => p.id === cId)?.offline, 5000, 'Вася offline')
const C2 = client('вася', 'tokenC2_' + 'd'.repeat(20))
await until(() => C2.id, 5000, 'Вася с другого устройства')
check(C2.id === cId, 'по имени (не в сети) — тот же игрок с другого устройства')

// хост пропал — хостом стал человек в сети
A.s.disconnect()
await until(() => B4.state?.hostId !== A.id, 5000, 'новый хост')
check(B4.state.hostId !== A.id && [bId, cId].includes(B4.state.hostId), 'хост ушёл в сеть к другому')

for (const c of [A, B, B2, B3, B4, C, C2]) c.s.disconnect()
console.log(fails ? `\nПРОВАЛОВ: ${fails}` : '\nВСЁ ПРОШЛО')
process.exit(fails ? 1 : 0)
