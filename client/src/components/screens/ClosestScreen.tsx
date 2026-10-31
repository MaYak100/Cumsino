import { roundTimings } from '@cumsino/shared'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { withUnit } from '@cumsino/shared'
import { useGameStore } from '../../store/gameStore'
import { C, DISPLAY, modeColor } from '../../theme'
import { GameHud } from '../ui/GameHud'
import { TimeBar } from '../ui/TimeBar'
import { AnswerProgress } from '../ui/AnswerProgress'
import { RateQuestion } from '../ui/RateQuestion'
import { RevealNote } from '../ui/RevealNote'
import { GuessLine } from '../ui/GuessLine'
import { SelfEffects } from '../ui/SelfEffects'
import { TopicInline } from '../ui/Topic'
import { ItemIcon } from '../ui/ItemIcon'
import { parseNumber } from '../../lib/parseNumber'
import { useAnswerAck } from '../../lib/useAnswerAck'

const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })

/** «Кто ближе»: одно большое поле под число. Раскрытие — правильное число рядом со своим и разница. */
export function ClosestScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)
  const answeredIds = useGameStore(s => s.answeredIds)
  const submitAnswer = useGameStore(s => s.submitAnswer)
  const roundCorrectAnswer = useGameStore(s => s.roundCorrectAnswer)
  const roundComment = useGameStore(s => s.roundComment)
  const q = gameState.currentQuestion
  // черновик числа — в сторе по ключу вопроса: экран, смонтированный заново, не стирает набранное
  const draft = useGameStore(s => s.closestDraft)
  const setClosestDraft = useGameStore(s => s.setClosestDraft)
  const value = draft && draft.key === q?.id ? draft.value : ''
  const setValue = (v: string) => { if (q) setClosestDraft({ key: q.id, value: v }) }
  // отправленное число — сервер помнит его (myAnswer): после переподключения поле покажет его же
  const savedSent = () => (typeof gameState.myAnswer === 'number' ? gameState.myAnswer : null)
  const [sent, setSent] = useState<number | null>(savedSent)
  const inputRef = useRef<HTMLInputElement>(null)

  const color = modeColor(gameState.mode)
  const myAnswered = myId ? answeredIds.has(myId) : false
  const revealed = typeof roundCorrectAnswer === 'number'
  const [editing, setEditing] = useState(false)
  const answered = myAnswered || sent !== null
  // блинк: пока есть в запасе — отправленное число можно поменять
  const blinks = gameState.inventory?.blink ?? 0
  const canBlink = answered && blinks > 0 && !revealed
  const locked = revealed || (answered && !editing)
  const parsed = parseNumber(value)
  // ответ ушёл, а сервер не засчитал — снова можно ввести
  const [lost, setLost] = useState(false)
  useAnswerAck(sent !== null, myAnswered, () => { setSent(null); setEditing(false); setLost(true) })
  // единица числа («золота», «%», «сек.») — суффиксом у поля и у чисел раскрытия
  const unit = q?.unit
  const unitMark = unit ? withUnit('', unit).trim() : ''

  useEffect(() => { setSent(savedSent()); setEditing(false); setLost(false) }, [q?.id])
  useEffect(() => { if (!locked) inputRef.current?.focus() }, [locked])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (locked || parsed === null) return
    setLost(false)
    setSent(parsed)
    submitAnswer(parsed, answered)
    setEditing(false)
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
    <div className="min-h-dvh flex flex-col">
      <GameHud />
      <TimeBar seconds={gameState.phaseTimeLeft} endsAt={gameState.phaseEndsAt} total={roundTimings(gameState.mode, !!gameState.questionBet).question} color={color} stopped={revealed} />

      {/* блок вопроса — по центру; лоток под ним фиксированной высоты, поэтому раскрытие ничего не двигает */}
      <main className="below-itembar flex-1 w-full max-w-[56rem] mx-auto px-4 sm:px-6 pt-6 flex flex-col justify-center">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-base" style={{ color: C.muted }}>
          <TopicInline topic={q?.displayTopic ?? q?.topic} />
          {!revealed && <SelfEffects />}
        </div>
        <h1 className="font-semibold leading-tight mb-8" style={{ fontSize: 'clamp(1.45rem, 2.4vw, 2.75rem)', textWrap: 'balance' } as CSSProperties}>
          {q?.text}
        </h1>

        {/* поле и раскрытие одной высоты — ничего не прыгает. На телефоне поле и кнопка друг под другом (кнопка
            обязана быть видна: у цифровой клавиатуры iOS нет Enter), поэтому блок выше */}
        <div className="h-[9.75rem] sm:h-[8rem]">
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
                  {unitMark && <span style={{ fontSize: '0.38em', marginLeft: '0.3em', color: C.muted }}>{unitMark}</span>}
                </div>
              </motion.div>
              {mine !== null && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }} className="pb-2">
                  <div className="text-sm mb-1" style={{ color: C.muted }}>Ты сказал</div>
                  <div className="tnum" style={{ fontFamily: DISPLAY, fontSize: '2.25rem', lineHeight: 1, color: C.fg }}>
                    {fmt(mine)}
                    {unitMark && <span style={{ fontSize: '0.45em', marginLeft: '0.3em', color: C.muted }}>{unitMark}</span>}
                  </div>
                  <div className="text-sm mt-1.5 tnum" style={{ color: diff === 0 ? C.mint : C.muted }}>
                    {diff === 0 ? 'В точку' : `мимо на ${withUnit(fmt(diff!), unit)}`}
                  </div>
                </motion.div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch gap-3">
              <div className="relative flex-1 min-w-0">
              <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={sent !== null && !editing ? fmt(sent) : value}
                onChange={e => setValue(e.target.value.replace(/[^\d.,\s-]/g, ''))}
                disabled={locked}
                placeholder="0"
                aria-label="Твоё число"
                className="tnum w-full h-[5.5rem] sm:h-[7rem] rounded-2xl px-6 bg-transparent text-center sm:text-left focus:outline-none disabled:opacity-70"
                style={{
                  fontFamily: DISPLAY, fontSize: 'clamp(44px, 6vw, 72px)', color: C.fg,
                  background: C.panel, border: `2px solid ${locked ? C.line : color}`,
                  boxShadow: locked ? 'none' : `0 0 0 5px ${color}22`,
                  paddingRight: unitMark ? '7rem' : undefined,
                }}
              />
              {unitMark && (
                <span className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ fontFamily: DISPLAY, fontSize: '1.5rem', color: C.muted }}>
                  {unitMark}
                </span>
              )}
              </div>
              {/* ответ принят, а блинк есть — вместо «Принято» иконка блинка «Изменить»; в правке — она же отправляет */}
              {locked && canBlink ? (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setEditing(true); setValue(sent !== null ? String(sent) : '') }}
                  className="h-[3.5rem] sm:h-[7rem] rounded-2xl px-5 font-bold text-lg flex items-center justify-center gap-2"
                  style={{ minWidth: '10.625rem', background: 'transparent', color: C.sky, border: `2px solid ${C.sky}` }}
                  aria-label={`Изменить ответ блинком (осталось ${blinks})`}
                >
                  <ItemIcon id="blink" size={40} />
                  Изменить
                </motion.button>
              ) : editing ? (
                <motion.button
                  type="submit"
                  disabled={parsed === null}
                  whileTap={{ scale: 0.95 }}
                  className="h-[3.5rem] sm:h-[7rem] rounded-2xl px-5 font-bold text-lg disabled:opacity-35 flex items-center justify-center gap-2"
                  style={{ minWidth: '10.625rem', background: C.sky, color: C.ink }}
                >
                  <ItemIcon id="blink" size={40} />
                  Изменить
                </motion.button>
              ) : (
              <motion.button
                type="submit"
                disabled={locked || parsed === null}
                whileTap={{ scale: 0.95 }}
                className="h-[3.5rem] sm:h-[7rem] rounded-2xl px-8 font-bold text-lg disabled:opacity-35"
                style={{ minWidth: '10.625rem', background: color, color: C.ink }}
              >
                {locked ? 'Принято' : 'Ответить'}
              </motion.button>
              )}
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
              {lost && !locked ? (
                <span className="text-[0.8125rem] font-semibold" style={{ color: C.hot }}>Ответ не засчитан, отправь ещё раз</span>
              ) : locked ? (
                <span className="text-[0.8125rem]" style={{ color: C.muted }}>Ждём остальных</span>
              ) : (
                // на тач-экране Enter может не быть — подсказка только для клавиатуры
                <span className="text-[0.8125rem] [@media(pointer:coarse)]:hidden" style={{ color: C.muted }}>Enter — отправить</span>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
