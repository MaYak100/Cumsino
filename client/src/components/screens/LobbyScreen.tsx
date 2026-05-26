import { useGameStore, selectMe } from '../../store/gameStore'
import { PlayerCard } from '../ui/PlayerCard'

export function LobbyScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const me = useGameStore(selectMe)
  const startGame = useGameStore(s => s.startGame)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl text-yellow-400 mb-2 font-serif" style={{
        textShadow: '0 0 20px rgba(255,215,0,0.4)'
      }}>
        ♠ CUMSINO ♠
      </h1>

      <div className="mb-6 text-center">
        <div className="text-xs uppercase tracking-widest text-gray-400">Код комнаты</div>
        <div className="text-5xl font-mono text-white tracking-[0.3em] mt-1">
          {gameState.id}
        </div>
      </div>

      <div className="w-full max-w-md mb-6">
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">
          Игроки ({gameState.players.length})
        </div>
        <div className="grid grid-cols-2 gap-3">
          {gameState.players.map(player => (
            <PlayerCard
              key={player.id}
              player={player}
              isMe={player.id === me?.id}
            />
          ))}
        </div>
      </div>

      <button
        onClick={startGame}
        className="px-10 py-4 bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-bold text-lg rounded-xl hover:brightness-110 transition-all shadow-lg"
      >
        ▶ НАЧАТЬ ИГРУ
      </button>

      <p className="text-gray-500 text-xs mt-4">
        Стартовый капитал: 500 фишек · Цель: 3000 фишек
      </p>
    </div>
  )
}
