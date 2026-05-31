import { useGameStore, selectMe } from '../../store/gameStore'
import { PlayerCard } from '../ui/PlayerCard'

export function LobbyScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const me = useGameStore(selectMe)
  const myId = useGameStore(s => s.myId)
  const startGame = useGameStore(s => s.startGame)
  const isHost = myId !== null && myId === gameState.hostId

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

      <div className="w-full max-w-sm mb-6">
        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2 text-center">
          Игроки ({gameState.players.length})
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {gameState.players.map(player => (
            <div key={player.id} style={{ width: 'calc(33.33% - 6px)' }}>
              <PlayerCard
                player={player}
                isMe={player.id === me?.id}
                hideChips
              />
            </div>
          ))}
        </div>
      </div>

      {isHost ? (
        <button
          onClick={startGame}
          className="px-10 py-4 bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-bold text-lg rounded-xl hover:brightness-110 transition-all shadow-lg"
        >
          ▶ НАЧАТЬ ИГРУ
        </button>
      ) : (
        <div className="text-center">
          <div className="text-gray-300 text-sm tracking-wide">
            Ожидаем хоста и ждем игроков. Пока не рыпайтесь.
          </div>
        </div>
      )}

      <p className="text-gray-400 text-xs mt-5 text-center leading-relaxed">
        Ставьте ставки · Отвечайте на вопросы<br />
        Начинайте с 500 фишек · Заработайте 3000
      </p>
    </div>
  )
}
