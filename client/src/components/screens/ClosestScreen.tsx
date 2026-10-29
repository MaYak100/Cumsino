import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { C, DISPLAY, modeColor } from '../../theme'
import { GameHud } from '../ui/GameHud'
import { TimeBar } from '../ui/TimeBar'
import { AnswerProgress } from '../ui/AnswerProgress'
import { RateQuestion } from '../ui/RateQuestion'
import { RevealNote } from '../ui/RevealNote'
import { GuessLine } from '../ui/GuessLine'

const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })

/** «Кто ближе»: одно большое поле под число. Раскрытие — правильное число рядом со своим и разница. */
export function ClosestScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)
  const answeredIds = useGameStore(s => s.answeredIds)
  const submitAnswer = useGameStore(s => s.submitAnswer)
  const roundCorrectAnswer = useGameStore(s => s.roundCorrectAnswer)
  const roundComment = useGameStore(s => s.roundComment)
  const [value, setValue] = useState('')
  const [sent, setSent] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const q = gameState.currentQuestion
  const color = modeColor(gameState.mode)
  const myAnswered = myId ? answeredIds.has(myId) : false
  const revealed = typeof roundCorrectAnswer === 'number'
  const locked = myAnswered || revealed || sent !== null
  const parsed = parseFloat(value.replace(/\s/g, '').replace(',', '.'))

  useEffect(() => { setValue(''); setSent(null) }, [q?.id])
  useEffect(() => { if (!locked) inputRef.current?.focus() }, [locked])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (locked || isNaN(parsed)) return
    setSent(parsed)
    submitAnswer(parsed)
  }

  const me = gameState.players.find(p => p.id === myId)
  const mine = sent ?? (typeof me?.answer === 'number' ? me.answer : null)
  const diff = revealed && mine !== null ? Math.abs(mine - (roundCorrectAnswer as number)) : null
  // чужие ответы приходят, когда раунд посчитан
  const guesses = gameState.players.flatMap(p => {
    const v = p.id === myId ? mine : p.answer
    return typeof v === 'number' ? [{ id: p.id, name: p.name, value: v, me: p.id === myId }] : []
  })

  return (
    <div className="min-h-screen flex flex-col">
      <GameHud />
      <TimeBar seconds={gameState.phaseTimeLeft} color={color} stopped={revealed} />

      {/* блок вопроса — по центру; лоток под ним фиксированной высоты, поэтому раскрытие ничего не двигает */}
      <main className="flex-1 w-full max-w-[56rem] mx-auto px-4 sm:px-6 pt-6 pb-8 flex flex-col justify-center">
        <div className="mb-3 text-base" style={{ color: C.muted }}>{q?.displayTopic ?? q?.topic}</div>
        <h1 className="font-semibold leading-tight mb-8" style={{ fontSize: 'clamp(1.45rem, 2.4vw, 2.75rem)', textWrap: 'balance' } as CSSProperties}>
          {q?.text}
        </h1>

        {/* поле и раскрытие одной высоты — ничего не прыгает */}
        <div style={{ height: '8rem' }}>
          {revealed ? (
            <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
              <motion.div
                initial={{ scale: 1.6, opacity: 0, rotate: -4 }}
                animate={{ scale: 1, opacity: 1, rotate: -2 }}
                transition={{ type: 'spring', stiffness: 420, damping: 20 }}
                style={{ transformOrigin: 'left bottom' }}
              >
                <div className="text-sm mb-1" style={{ color: C.muted }}>Правильно</div>
                <div className="tnum" style={{ fontFamily: DISPLAY, fontSize: 'clamp(56px, 8vw, 96px)', lineHeight: 1, color: C.mint }}>
                  {fmt(roundCorrectAnswer as number)}
                </div>
              </motion.div>
              {mine !== null && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }} className="pb-2">
                  <div className="text-sm mb-1" style={{ color: C.muted }}>Ты сказал</div>
                  <div className="tnum" style={{ fontFamily: DISPLAY, fontSize: '2.25rem', lineHeight: 1, color: C.fg }}>{fmt(mine)}</div>
                  <div className="text-sm mt-1.5 tnum" style={{ color: diff === 0 ? C.mint : C.muted }}>
                    {diff === 0 ? 'В точку' : `мимо на ${fmt(diff!)}`}
                  </div>
                </motion.div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch gap-3">
              <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={sent !== null ? fmt(sent) : value}
                onChange={e => setValue(e.target.value.replace(/[^\d.,\s-]/g, ''))}
                disabled={locked}
                placeholder="0"
                aria-label="Твоё число"
                className="tnum flex-1 min-w-0 rounded-2xl px-6 bg-transparent text-center sm:text-left focus:outline-none disabled:opacity-70"
                style={{
                  fontFamily: DISPLAY, fontSize: 'clamp(44px, 6vw, 72px)', height: '7rem', color: C.fg,
                  background: C.panel, border: `2px solid ${locked ? C.line : color}`,
                  boxShadow: locked ? 'none' : `0 0 0 5px ${color}22`,
                }}
              />
              <motion.button
                type="submit"
                disabled={locked || isNaN(parsed)}
                whileTap={{ scale: 0.95 }}
                className="rounded-2xl px-8 font-bold text-lg disabled:opacity-35"
                style={{ height: '7rem', minWidth: '10.625rem', background: color, color: C.ink }}
              >
                {locked ? 'Принято' : 'Ответить'}
              </motion.button>
            </form>
          )}
        </div>

        <div className="mt-7 flex flex-col items-center gap-5" style={{ height: '17rem' }}>
          {revealed ? (
            <>
              {guesses.length > 1 && (
                <div className="w-full">
                  <GuessLine guesses={guesses} correct={roundCorrectAnswer as number} />
                </div>
              )}
              {roundComment && <RevealNote text={roundComment} />}
              <RateQuestion delay={roundComment ? 0.5 : 0.3} />
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <AnswerProgress color={color} />
              <span className="text-[0.8125rem]" style={{ color: C.muted }}>
                {locked ? 'Ждём остальных' : 'Enter — отправить'}
              </span>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
