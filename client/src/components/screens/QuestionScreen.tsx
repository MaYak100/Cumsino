import { useEffect, useState, type CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore, selectIsGladiator, selectMe } from '../../store/gameStore'
import { C, modeColor } from '../../theme'
import { GameHud } from '../ui/GameHud'
import { TimeBar } from '../ui/TimeBar'
import { AnswerOptions } from '../ui/AnswerOptions'
import { AnswerProgress } from '../ui/AnswerProgress'
import { RateQuestion } from '../ui/RateQuestion'
import { RevealNote } from '../ui/RevealNote'
import { ItemIcon } from '../ui/ItemIcon'
import { useCountdown } from '../../lib/useCountdown'

/** Вопрос с вариантами — «для всех», керри (отвечает сам) и толпа, которая смотрит на керри.
 *  Раскладка прибита к верху: вопрос и варианты не двигаются, всё новое (пояснение, оценка) появляется ниже. */
export function QuestionScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)
  const answeredIds = useGameStore(s => s.answeredIds)
  const gladiatorHoverIndex = useGameStore(s => s.gladiatorHoverIndex)
  const isGladiator = useGameStore(selectIsGladiator)
  const submitAnswer = useGameStore(s => s.submitAnswer)
  const sendHover = useGameStore(s => s.sendHover)
  const roundCorrectAnswer = useGameStore(s => s.roundCorrectAnswer)
  const roundComment = useGameStore(s => s.roundComment)
  const roundOptionNotes = useGameStore(s => s.roundOptionNotes)
  const bribeEliminatedIdx = useGameStore(s => s.bribeEliminatedIdx)
  const bribePrompt = useGameStore(s => s.bribePrompt)
  const payBribe = useGameStore(s => s.payBribe)
  const me = useGameStore(selectMe)
  const gemResults = useGameStore(s => s.gemResults)
  const gemmedOnMe = useGameStore(s => s.gemmedOnMe)

  const q = gameState.currentQuestion
  const options = q?.options ?? []
  const isKerri = gameState.mode === 'kerri'
  const isCrowd = isKerri && !isGladiator
  const color = modeColor(gameState.mode)
  const revealed = typeof roundCorrectAnswer === 'string'
  const myAnswered = myId ? answeredIds.has(myId) : false
  const gladiator = gameState.players.find(p => p.id === gameState.gladiatorId)

  const [pick, setPick] = useState<number | null>(null)
  useEffect(() => setPick(null), [q?.id])

  // хекс: у тебя своё короткое время на ответ
  const hexLeft = useCountdown(revealed ? undefined : gameState.hexTimeLeft)
  const hexed = hexLeft !== undefined
  const hexDead = hexed && hexLeft <= 0
  // блинк: пока есть в запасе — ответ можно сменить
  const blinks = gameState.inventory?.blink ?? 0
  const canBlink = !isCrowd && myAnswered && blinks > 0 && !revealed && !hexDead
  const eliminated = [
    ...(gameState.removedOptions ?? []),
    ...(isGladiator && bribeEliminatedIdx !== null ? [bribeEliminatedIdx] : []),
  ]
  // гем: у кого что выбрано
  const peeks: Record<number, string[]> = {}
  for (const [targetId, r] of Object.entries(gemResults)) {
    const idx = typeof r.answer === 'string' ? options.indexOf(r.answer) : -1
    const name = gameState.players.find(p => p.id === targetId)?.name
    if (idx >= 0 && name) (peeks[idx] ??= []).push(name)
  }

  const interactive = !isCrowd && !revealed && !hexDead && (!myAnswered || canBlink)
  const choose = (idx: number) => {
    if (!interactive || eliminated.includes(idx)) return
    if (!myAnswered && pick === null) {
      setPick(idx)
      submitAnswer(options[idx])
    } else if (canBlink && idx !== pick) {
      setPick(idx)
      submitAnswer(options[idx], true)
    }
  }

  // 1–4 на клавиатуре
  useEffect(() => {
    if (!interactive) return
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (n >= 1 && n <= options.length) choose(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const hover = isGladiator && isKerri && !revealed
    ? (idx: number | null) => sendHover(idx)
    : undefined

  return (
    <div className="min-h-screen flex flex-col">
      <GameHud />
      {hexed
        ? <TimeBar seconds={gameState.hexTimeLeft!} color={C.hot} stopped={revealed || hexDead} />
        : <TimeBar seconds={gameState.phaseTimeLeft} color={color} stopped={revealed} />}

      {/* блок вопроса — по центру; лоток под ним фиксированной высоты, поэтому раскрытие ничего не двигает */}
      <main className="flex-1 w-full max-w-[56rem] mx-auto px-4 sm:px-6 pt-6 pb-8 flex flex-col justify-center">
        <div className="mb-3 flex items-center gap-3 text-base" style={{ color: C.muted }}>
          {isCrowd && gladiator ? (
            <span>Отвечает <b style={{ color: C.hot }}>{gladiator.name}</b>, ты смотришь</span>
          ) : isGladiator ? (
            <span style={{ color: C.hot }} className="font-semibold">Ты керри. Все смотрят на тебя</span>
          ) : (
            <span>{q?.displayTopic ?? q?.topic}</span>
          )}
          {hexed && !revealed && (
            <motion.span
              initial={{ scale: 1.8, opacity: 0, rotate: -10 }} animate={{ scale: 1, opacity: 1, rotate: -3 }}
              className="ml-auto flex items-center gap-1.5 font-bold rounded-lg pl-1 pr-3 py-0.5"
              style={{ background: C.paper, color: C.ink }}
            >
              <ItemIcon id="hex" size={30} />
              {hexDead ? 'Время вышло' : `Ты овца: ${hexLeft} с`}
            </motion.span>
          )}
        </div>

        <h1 className="font-semibold leading-tight mb-7" style={{ fontSize: 'clamp(1.45rem, 2.4vw, 2.75rem)', color: C.fg, textWrap: 'balance' } as CSSProperties}>
          {q?.text}
        </h1>

        <AnswerOptions
          options={options}
          interactive={interactive}
          myPick={pick}
          onPick={choose}
          onHover={hover}
          correct={revealed ? (roundCorrectAnswer as string) : null}
          notes={roundOptionNotes}
          hoverIdx={isCrowd ? gladiatorHoverIndex : null}
          eliminated={eliminated}
          allowChange={canBlink}
          peeks={peeks}
          knownCorrect={isCrowd ? gameState.gladiatorAnswer : null}
          color={color}
          seed={q?.id ?? 'q'}
        />

        {/* лоток под вариантами: статус → пояснение и оценка */}
        <div className="mt-7 flex flex-col items-center gap-5" style={{ height: '13rem' }}>
          {revealed ? (
            <>
              {roundComment && <RevealNote text={roundComment} />}
              <RateQuestion delay={roundComment ? 0.5 : 0.3} />
            </>
          ) : isCrowd ? (
            <div className="flex flex-col items-center gap-2 text-sm" style={{ color: C.muted }}>
              {me?.currentBet ? (
                <span>
                  Твоя ставка <b className="tnum" style={{ color: C.fg }}>{me.currentBet}</b> на то, что он{' '}
                  <b style={{ color: me.betTarget === 'lose' ? C.hot : C.mint }}>
                    {me.betTarget === 'lose' ? 'завалит' : 'ответит'}
                  </b>
                </span>
              ) : <span>Ты не ставил в этом раунде</span>}
              {gladiator && answeredIds.has(gladiator.id) && <span style={{ color: C.fg }}>Керри ответил</span>}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <AnswerProgress color={color} only={isGladiator && gladiator ? [gladiator.id] : undefined} />
              <span className="text-[0.8125rem]" style={{ color: canBlink ? C.sky : C.muted }}>
                {hexDead ? 'Не успел' : canBlink ? `Ответ принят. Передумал — жми другой вариант (блинков: ${blinks})`
                  : myAnswered ? 'Ответ принят' : 'Можно жать 1–4'}
              </span>
              {gemmedOnMe > 0 && (
                <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="text-[0.8125rem] font-semibold" style={{ color: C.hot }}>
                  На тебя посмотрели гемом
                </motion.span>
              )}
            </div>
          )}

          <AnimatePresence>
            {bribePrompt && isCrowd && !revealed && (
              <BribePrompt
                amount={bribePrompt.amount}
                startedAt={bribePrompt.startedAt}
                cycle={bribePrompt.cycleIndex}
                lose={me?.betTarget === 'lose'}
                canPay={(me?.chips ?? 0) >= bribePrompt.amount}
                onPay={payBribe}
              />
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}

/** Взятка (выключена флагом BRIBE_ENABLED, код сохранён). */
function BribePrompt({ amount, startedAt, cycle, lose, canPay, onPay }: {
  amount: number; startedAt: number; cycle: number; lose: boolean; canPay: boolean; onPay: () => void
}) {
  const [left, setLeft] = useState(8)
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, 8 - (Date.now() - startedAt) / 1000))
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [startedAt])

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className="w-full max-w-md rounded-2xl p-4 text-center"
      style={{ border: `2px solid ${C.hot}`, background: `${C.hot}14` }}
    >
      <div className="text-sm mb-3" style={{ color: C.fg }}>
        {lose
          ? <>Заплати <b>{amount}</b>, чтобы керри не убрали неверный вариант</>
          : cycle > 0
            ? <>Твою попытку перебили. <b>{amount}</b> — и керри всё же уберут неверный вариант</>
            : <>Заплати <b>{amount}</b> — и керри уберут один неверный вариант</>}
      </div>
      <div className="flex items-center justify-center gap-3">
        <span className="tnum font-display text-xl w-8 text-right" style={{ color: left <= 2 ? C.hot : C.brass }}>
          {Math.ceil(left)}
        </span>
        <button
          onClick={onPay}
          disabled={!canPay || left <= 0}
          className="rounded-xl px-5 py-2.5 font-bold disabled:opacity-40"
          style={{ background: C.hot, color: C.ink }}
        >
          Заплатить {amount}
        </button>
      </div>
    </motion.div>
  )
}
