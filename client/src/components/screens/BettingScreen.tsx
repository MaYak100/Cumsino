import { useGameStore, selectMe, selectIsGladiator } from '../../store/gameStore'
import { Chip } from '../ui/Chip'
import type { ChipValue } from '../ui/Chip'
import { Timer } from '../ui/Timer'

const CHIP_VALUES: ChipValue[] = [10, 20, 50, 100, 500]

export function BettingScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const me = useGameStore(selectMe)
  const isGladiator = useGameStore(selectIsGladiator)
  const pendingBet = useGameStore(s => s.pendingBet)
  const pendingTarget = useGameStore(s => s.pendingTarget)
  const addChip = useGameStore(s => s.addChipToBet)
  const removeChip = useGameStore(s => s.removeLastChip)
  const confirm = useGameStore(s => s.confirmBet)
  const setTarget = useGameStore(s => s.setPendingTarget)

  if (isGladiator && gameState.mode === 'gladiator') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Timer seconds={gameState.phaseTimeLeft} />
        <div className="mt-8 text-6xl mb-4">⚔️</div>
        <div className="text-3xl text-yellow-400 font-bold mb-2">Ты — Гладиатор!</div>
        <div className="text-gray-400">Толпа делает ставки на тебя…</div>
        <div className="mt-4 text-sm text-gray-500 animate-pulse">Жди вопроса</div>
      </div>
    )
  }

  const isGladiatorMode = gameState.mode === 'gladiator'
  const gladiatorName = gameState.players.find(p => p.id === gameState.gladiatorId)?.name

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <Timer seconds={gameState.phaseTimeLeft} />

      <div className="w-full max-w-md mt-4">
        {gameState.currentQuestion && (
          <div className="bg-[#2a4a2a] border border-[#3a6a3a] rounded-xl px-6 py-3 text-center mb-4">
            <div className="text-xs uppercase tracking-widest text-gray-400">Тема</div>
            <div className="text-xl text-white">{gameState.currentQuestion.topic}</div>
            {isGladiatorMode && gladiatorName && (
              <div className="mt-2 text-yellow-400 text-sm">Гладиатор: <strong>{gladiatorName}</strong></div>
            )}
          </div>
        )}

        {isGladiatorMode && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {(['win', 'lose'] as const).map(target => (
              <button
                key={target}
                onClick={() => setTarget(target)}
                className={`
                  rounded-xl py-4 text-center border-2 transition-all
                  ${pendingTarget === target
                    ? target === 'win' ? 'border-green-400 bg-green-900' : 'border-red-400 bg-red-900'
                    : 'border-[#3a6a3a] bg-[#1a3a1a]'
                  }
                `}
              >
                <div className="text-2xl">{target === 'win' ? '👍' : '💀'}</div>
                <div className="text-xs font-bold mt-1">
                  {target === 'win' ? 'ОН ОТВЕТИТ' : 'ОН ЗАВАЛИТ'}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="text-xs uppercase tracking-widest text-gray-400 text-center mb-2">
          Выбери фишки
        </div>
        <div className="flex justify-center gap-2 mb-4 flex-wrap">
          {CHIP_VALUES.map(v => (
            <div key={v} className="flex flex-col items-center gap-1">
              <Chip
                value={v}
                size="md"
                onClick={() => addChip(v)}
                disabled={!me || pendingBet + v > me.chips}
              />
              <button
                onClick={() => removeChip(v)}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                −
              </button>
            </div>
          ))}
        </div>

        <div className="bg-[#0d1f0d] border border-[#3a6a3a] rounded-xl p-4 text-center mb-4">
          <div className="text-xs uppercase tracking-widest text-gray-400">Твоя ставка</div>
          <div className="text-4xl font-mono text-yellow-400 mt-1">{pendingBet} 🪙</div>
          <div className="text-xs text-gray-500 mt-1">Баланс: {me?.chips ?? 0} фишек</div>
        </div>

        <button
          onClick={confirm}
          disabled={pendingBet <= 0 || (isGladiatorMode && !pendingTarget)}
          className="w-full py-3 bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
        >
          ✓ ПОДТВЕРДИТЬ СТАВКУ
        </button>
      </div>
    </div>
  )
}
