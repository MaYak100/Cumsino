import { useState } from 'react'
import { useGameStore } from '../../store/gameStore'

export function JoinScreen() {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const connect = useGameStore(s => s.connect)

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !code.trim()) return
    connect(name.trim(), code.trim().toUpperCase())
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-5xl text-yellow-400 text-center mb-2 font-serif" style={{
          textShadow: '0 0 30px rgba(255,215,0,0.5)'
        }}>
          ♠ CUMSINO ♠
        </h1>
        <p className="text-center text-gray-400 mb-8 text-sm">Викторина со ставками</p>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-widest text-gray-400 mb-1">
              Твоё имя
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={20}
              placeholder="Введи имя"
              className="w-full bg-[#2a4a2a] border border-[#3a6a3a] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-gray-400 mb-1">
              Код комнаты
            </label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder="XXXX"
              className="w-full bg-[#2a4a2a] border border-[#3a6a3a] rounded-lg px-4 py-3 text-white placeholder-gray-500 font-mono text-center text-2xl tracking-widest focus:outline-none focus:border-yellow-400"
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim() || code.length < 4}
            className="w-full bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-bold py-3 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
          >
            ВОЙТИ В ИГРУ
          </button>
        </form>
      </div>
    </div>
  )
}
