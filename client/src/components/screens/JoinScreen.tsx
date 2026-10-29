import { useState } from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { C, DISPLAY } from '../../theme'
import { Logo } from '../ui/Logo'

const field = 'w-full rounded-xl px-4 focus:outline-none transition-colors'

export function JoinScreen() {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const connect = useGameStore(s => s.connect)
  const ready = !!name.trim() && code.length >= 4

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    connect(name.trim(), code.trim().toUpperCase())
  }

  return (
    <div className="stage min-h-screen flex items-center justify-center p-4">
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
              className={`${field} h-20 text-center`}
              style={{
                background: C.panel, border: `2px solid ${C.line}`, color: C.fg,
                fontFamily: DISPLAY, fontSize: 40, letterSpacing: '0.3em', paddingLeft: '0.3em',
              }}
            />
          </label>

          <motion.button
            type="submit"
            disabled={!ready}
            whileTap={{ scale: 0.96 }}
            className="mt-2 h-14 rounded-xl font-bold text-lg disabled:opacity-35 transition-opacity"
            style={{ background: C.brass, color: C.ink }}
          >
            Войти
          </motion.button>
        </form>
      </div>
    </div>
  )
}
