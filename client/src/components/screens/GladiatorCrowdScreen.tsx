import { useGameStore, selectMe } from '../../store/gameStore'
import { Chip } from '../ui/Chip'
import type { ChipValue } from '../ui/Chip'
import { Timer } from '../ui/Timer'

const CHIP_VALUES: ChipValue[] = [10, 20, 50, 100, 500]

export function GladiatorCrowdScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const me = useGameStore(selectMe)
  const pendingBet = useGameStore(s => s.pendingBet)
  const pendingTarget = useGameStore(s => s.pendingTarget)
  const addChip = useGameStore(s => s.addChipToBet)
  const removeChip = useGameStore(s => s.removeLastChip)
  const confirm = useGameStore(s => s.confirmBet)
  const setTarget = useGameStore(s => s.setPendingTarget)

  const gladiatorName = gameState.players.find(p => p.id === gameState.gladiatorId)?.name

  return (
    <div className="min-h-screen flex flex-col items-center p-4 pt-6">
      <Timer seconds={gameState.phaseTimeLeft} />

      <div className="text-center mt-4 mb-4">
        <div className="text-xs uppercase tracking-widest text-gray-400">Гладиатор</div>
        <div className="text-3xl font-bold text-yellow-400">⚔️ {gladiatorName}</div>
      </div>

      {gameState.currentQuestion && (
        <div className="w-full max-w-md bg-[#2a4a2a] border border-[#3a6a3a] rounded-xl p-4 mb-4 text-center">
          <div className="text-sm text-white mb-2">{gameState.currentQuestion.text}</div>
          {gameState.gladiatorAnswer && (
            <div className="text-xs text-gray-400">
              Правильный ответ: <strong className="text-yellow-400">{gameState.gladiatorAnswer}</strong>
            </div>
          )}
        </div>
      )}

      <div className="w-full max-w-md">
        <div className="grid grid-cols-2 gap-3 mb-4">
          {(['win', 'lose'] as const).map(target => (
            <button
              key={target}
              onClick={() => setTarget(target)}
              className={`
                rounded-xl py-5 text-center border-2 transition-all
                ${pendingTarget === target
                  ? target === 'win' ? 'border-green-400 bg-green-900' : 'border-red-400 bg-red-900'
                  : 'border-[#3a6a3a] bg-[#1a3a1a] hover:border-gray-500'
                }
              `}
            >
              <div className="text-3xl">{target === 'win' ? '👍' : '💀'}</div>
              <div className="text-xs font-bold mt-2">
                {target === 'win' ? 'ОН ОТВЕТИТ' : 'ОН ЗАВАЛИТ'}
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-center gap-2 mb-4 flex-wrap">
          {CHIP_VALUES.map(v => (
            <div key={v} className="flex flex-col items-center gap-1">
              <Chip value={v} onClick={() => addChip(v)} disabled={!me || pendingBet + v > me.chips} />
              <button onClick={() => removeChip(v)} className="text-xs text-gray-500 hover:text-gray-300">−</button>
            </div>
          ))}
        </div>

        <div className="bg-[#0d1f0d] border border-[#3a6a3a] rounded-xl p-3 text-center mb-4">
          <div className="text-xs text-gray-400">Ставка</div>
          <div className="text-3xl font-mono text-yellow-400">{pendingBet} 🪙</div>
        </div>

        <button
          onClick={confirm}
          disabled={pendingBet <= 0 || !pendingTarget}
          className="w-full py-3 bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-bold rounded-xl disabled:opacity-40"
        >
          ✓ ПОДТВЕРДИТЬ
        </button>
      </div>
    </div>
  )
}
