import { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { Timer } from '../ui/Timer'

export function ClosestScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)
  const answeredIds = useGameStore(s => s.answeredIds)
  const submitAnswer = useGameStore(s => s.submitAnswer)
  const [value, setValue] = useState('')

  const myAnswered = myId ? answeredIds.has(myId) : false

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = parseFloat(value)
    if (isNaN(num)) return
    submitAnswer(num)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <Timer seconds={gameState.phaseTimeLeft} />

      <div className="w-full max-w-md mt-6 text-center">
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-2">🎯 КТО БЛИЖЕ</div>
        <div className="text-xl text-white leading-relaxed mb-8">
          {gameState.currentQuestion?.text}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="number"
            value={value}
            onChange={e => setValue(e.target.value)}
            disabled={myAnswered}
            placeholder="Введи число"
            className="w-full bg-[#2a4a2a] border border-[#3a6a3a] rounded-xl px-6 py-4 text-white text-center text-3xl font-mono focus:outline-none focus:border-yellow-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={myAnswered || !value}
            className="w-full py-3 bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-bold rounded-xl disabled:opacity-40"
          >
            {myAnswered ? '✓ Ответ принят' : 'ОТВЕТИТЬ'}
          </button>
        </form>

        <div className="mt-4 flex justify-center gap-1">
          {gameState.players.map(p => (
            <span
              key={p.id}
              className={`w-2 h-2 rounded-full ${answeredIds.has(p.id) ? 'bg-green-400' : 'bg-gray-600'}`}
              title={p.name}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
