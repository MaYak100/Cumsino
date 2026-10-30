import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { socket } from '../../socket'
import { C, DISPLAY } from '../../theme'
import { Logo } from '../ui/Logo'

const field = 'w-full rounded-xl px-4 focus:outline-none transition-colors'
const SERVER = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'
/** столько ждём соединения, прежде чем сказать, что сервер спит (Render засыпает после 15 мин простоя, просыпается ~30–60 с) */
const SLOW_MS = 2500
/** за это время даже спящий сервер должен был ответить — дальше честно говорим, что не вышло */
const GIVE_UP_MS = 75_000

type Status = 'idle' | 'connecting' | 'waking' | 'error'

export function JoinScreen() {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const connect = useGameStore(s => s.connect)
  // отказ сервера (комната полна, плохой код…) — join_error, готовый текст в message
  const joinError = useGameStore(s => s.joinError)
  const ready = !!name.trim() && code.length >= 4
  const busy = status === 'connecting' || status === 'waking'

  // будим сервер, пока человек вводит имя: к нажатию «Войти» он, скорее всего, уже проснётся
  useEffect(() => { fetch(SERVER + '/health').catch(() => {}) }, [])

  // ход подключения: долго нет связи — «будим сервер»; ошибка соединения — сокет переподключается сам, говорим об этом
  useEffect(() => {
    if (!busy) return
    const slow = setTimeout(() => setStatus(s => (s === 'connecting' ? 'waking' : s)), SLOW_MS)
    const giveUp = setTimeout(() => { socket.disconnect(); setStatus('error') }, GIVE_UP_MS)
    const onError = () => setStatus(s => (s === 'connecting' ? 'waking' : s))
    socket.on('connect_error', onError)
    return () => { clearTimeout(slow); clearTimeout(giveUp); socket.off('connect_error', onError) }
  }, [busy])

  // сервер ответил отказом — снова можно жать «Войти»
  useEffect(() => { if (joinError) setStatus('idle') }, [joinError])

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setStatus('connecting')
    connect(name.trim(), code.trim().toUpperCase())
  }

  function cancel() {
    socket.disconnect()
    setStatus('idle')
  }

  const message = joinError
    ? { text: joinError.message, color: C.hot }
    : status === 'waking'
      ? { text: 'Будим сервер — после простоя он просыпается до минуты. Не закрывай вкладку', color: C.brass }
      : status === 'error'
        ? { text: 'Сервер не отвечает. Проверь интернет и попробуй ещё раз', color: C.hot }
        : null

  return (
    <div className="stage min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-14">
          <Logo size={60} animated />
        </div>

        <form onSubmit={handleJoin} className="flex flex-col gap-4">
          <label className="block">
            <span className="block text-sm mb-1.5" style={{ color: C.muted }}>Имя</span>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={20}
              placeholder="Как тебя звать"
              autoFocus
              disabled={busy}
              className={`${field} h-14 text-lg font-semibold`}
              style={{ background: C.panel, border: `2px solid ${C.line}`, color: C.fg }}
            />
          </label>

          <label className="block">
            <span className="block text-sm mb-1.5" style={{ color: C.muted }}>Код комнаты</span>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              maxLength={4}
              placeholder="XXXX"
              autoComplete="off"
              disabled={busy}
              className={`${field} h-20 text-center`}
              style={{
                background: C.panel, border: `2px solid ${C.line}`, color: C.fg,
                fontFamily: DISPLAY, fontSize: 40, letterSpacing: '0.3em', paddingLeft: '0.3em',
              }}
            />
          </label>

          <motion.button
            type="submit"
            disabled={!ready || busy}
            whileTap={{ scale: 0.96 }}
            className="mt-2 h-14 rounded-xl font-bold text-lg disabled:opacity-35 transition-opacity"
            style={{ background: C.brass, color: C.ink }}
          >
            {busy ? 'Входим…' : 'Войти'}
          </motion.button>

          <AnimatePresence mode="wait">
            {message && (
              <motion.div
                key={message.text}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                role="status"
                className="text-[0.9375rem] text-center leading-snug"
                style={{ color: message.color }}
              >
                {message.text}
                {status === 'waking' && (
                  <button type="button" onClick={cancel} className="block mx-auto mt-2 text-sm underline" style={{ color: C.muted }}>
                    Отмена
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </div>
    </div>
  )
}
