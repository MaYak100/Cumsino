import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore, selectIsGladiator, selectMe } from '../../store/gameStore'
import { Timer } from '../ui/Timer'

const OPTION_LABELS = ['A', 'B', 'C', 'D']
const OPTION_BORDER_COLORS = [
  'border-blue-500',
  'border-green-500',
  'border-yellow-500',
  'border-red-500',
]
const OPTION_BORDER_HEX = ['#3b82f6', '#22c55e', '#eab308', '#ef4444']

export function QuestionScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)
  const answeredIds = useGameStore(s => s.answeredIds)
  const gladiatorHoverIndex = useGameStore(s => s.gladiatorHoverIndex)
  const isGladiator = useGameStore(selectIsGladiator)
  const submitAnswer = useGameStore(s => s.submitAnswer)
  const sendHover = useGameStore(s => s.sendHover)
  const roundCorrectAnswer = useGameStore(s => s.roundCorrectAnswer)
  const bribePrompt = useGameStore(s => s.bribePrompt)
  const payBribe = useGameStore(s => s.payBribe)
  const me = useGameStore(selectMe)

  const [bribeTimeLeft, setBribeTimeLeft] = useState(8)
  useEffect(() => {
    if (!bribePrompt) { setBribeTimeLeft(8); return }
    const startedAt = bribePrompt.startedAt
    const tick = () => setBribeTimeLeft(Math.max(0, 8 - (Date.now() - startedAt) / 1000))
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [bribePrompt])

  const myAnswered = myId ? answeredIds.has(myId) : false
  const options = gameState.currentQuestion?.options ?? []
  const isGladiatorMode = gameState.mode === 'kerri'
  const showingCorrect = typeof roundCorrectAnswer === 'string' && roundCorrectAnswer !== null

  function handleMouseEnter(idx: number) {
    if (isGladiator && isGladiatorMode && !showingCorrect) sendHover(idx)
  }

  function handleMouseLeave() {
    if (isGladiator && isGladiatorMode) sendHover(null)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <Timer seconds={gameState.phaseTimeLeft} />

      <div className="w-full max-w-lg mt-4">
        <div className="text-center mb-6">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">{isGladiatorMode && !isGladiator ? 'Наблюдай за Керри' : 'Вопрос'}</div>
          <div className="text-xl text-white leading-relaxed">
            {gameState.currentQuestion?.text}
          </div>
        </div>

        {!(isGladiatorMode && !isGladiator) && (
          <div className="flex justify-center gap-2 mb-4">
            {gameState.players.map(p => (
              <span
                key={p.id}
                className={`w-2 h-2 rounded-full ${answeredIds.has(p.id) ? 'bg-green-400' : 'bg-gray-600'}`}
                title={p.name}
              />
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {options.map((option, idx) => {
            const isHovered = !isGladiator && gladiatorHoverIndex === idx && isGladiatorMode && !showingCorrect
            const isCrowdObserver = isGladiatorMode && !isGladiator
            const isCorrect = showingCorrect && option === roundCorrectAnswer
            return (
              <motion.button
                key={idx}
                onMouseEnter={() => handleMouseEnter(idx)}
                onMouseLeave={handleMouseLeave}
                onClick={isCrowdObserver || showingCorrect ? undefined : () => !myAnswered && submitAnswer(option)}
                disabled={isCrowdObserver || myAnswered || showingCorrect}
                animate={isHovered ? { scale: 1.03 } : { scale: 1 }}
                style={isCrowdObserver ? { cursor: 'default' } : undefined}
                className={`
                  p-4 rounded-xl border-2 text-left transition-colors
                  ${isCorrect
                    ? 'border-green-400 bg-[#0a3a1a] shadow-[0_0_20px_rgba(74,222,128,0.4)]'
                    : `bg-[#1a3a1a] ${OPTION_BORDER_COLORS[idx]}`
                  }
                  ${showingCorrect && !isCorrect ? 'opacity-40 cursor-not-allowed' : ''}
                  ${!showingCorrect && (isCrowdObserver ? 'cursor-default' : myAnswered ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[#2a4a2a]')}
                  ${isHovered ? 'border-yellow-400 bg-[#2a3a1a] shadow-[0_0_20px_rgba(255,215,0,0.3)]' : ''}
                `}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex items-center justify-center text-xs font-bold bg-[#2a4a2a]"
                    style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      border: `1.5px solid ${isCorrect ? '#4ade80' : OPTION_BORDER_HEX[idx]}`,
                    }}
                  >
                    {OPTION_LABELS[idx]}
                  </span>
                  <span className="text-sm">{option}</span>
                </div>
              </motion.button>
            )
          })}
        </div>

        <AnimatePresence>
          {bribePrompt && isGladiatorMode && !isGladiator && (
            <motion.div
              key="bribe-prompt"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.3 }}
              className="mt-4 rounded-xl border border-red-500/60 bg-red-950/80 p-4 text-center"
            >
              <div className="mb-1 text-base font-bold text-red-300">Срочно!</div>
              <div className="mb-1 text-sm text-white">
                {me?.betTarget === 'lose'
                  ? <><b>Заплати {bribePrompt.amount}₽</b>, чтобы НЕ упрощать жизнь керри!</>
                  : bribePrompt.cycleIndex > 0
                    ? <><b>Упс, твою попытку отменили!</b> Заплати {bribePrompt.amount}₽, чтобы всё же упростить жизнь керри!</>
                    : <><b>Заплати {bribePrompt.amount}₽</b>, чтобы упростить жизнь керри!</>}
              </div>
              <div className="mb-3 text-xs" style={{ color: '#c4c9d4' }}>
                {me?.betTarget === 'lose'
                  ? 'и мы НЕ уберём 1 неправильный ответ для него, он будет страдать'
                  : bribePrompt.cycleIndex > 0
                    ? 'и мы уберём 1 неправильный ответ, наверное...'
                    : 'и мы уберём 1 неправильный ответ'}
              </div>
              <div className="flex items-center justify-center gap-3">
                <span
                  className="font-mono text-xl font-bold w-8 text-right"
                  style={{ color: bribeTimeLeft <= 2 ? '#f87171' : '#fbbf24' }}
                >
                  {Math.ceil(bribeTimeLeft)}
                </span>
                <button
                  onClick={payBribe}
                  disabled={(me?.chips ?? 0) < bribePrompt.amount || bribeTimeLeft <= 0}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {bribePrompt.amount}₽
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {showingCorrect ? (
          <>
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center text-green-400 mt-4 text-sm"
            >
              Правильный ответ: {roundCorrectAnswer}
            </motion.p>
            {gameState.currentQuestion?.comment && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="text-center mt-2 text-sm"
                style={{ color: '#c4c9d4' }}
              >
                {gameState.currentQuestion.comment}
              </motion.p>
            )}
          </>
        ) : myAnswered ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-green-400 mt-4 text-sm"
          >
            ✓ Ответ принят, ждём остальных…
          </motion.p>
        ) : null}
      </div>
    </div>
  )
}
