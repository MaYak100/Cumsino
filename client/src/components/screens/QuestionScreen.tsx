import { useEffect, useState, type CSSProperties } from 'react'
import { roundTimings } from '@cumsino/shared'
import { useGameStore, selectIsGladiator, selectMe } from '../../store/gameStore'
import { C, modeColor } from '../../theme'
import { GameHud } from '../ui/GameHud'
import { TimeBar } from '../ui/TimeBar'
import { AnswerOptions } from '../ui/AnswerOptions'
import { AnswerProgress } from '../ui/AnswerProgress'
import { RateQuestion } from '../ui/RateQuestion'
import { RevealNote } from '../ui/RevealNote'
import { SelfEffects } from '../ui/SelfEffects'
import { TopicInline } from '../ui/Topic'
import { useCountdown } from '../../lib/useCountdown'
import { useAnswerAck } from '../../lib/useAnswerAck'
import { ignoreHotkey } from '../../lib/pressable'
import { Money } from '../ui/Money'

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
  const me = useGameStore(selectMe)
  const gemResults = useGameStore(s => s.gemResults)

  const q = gameState.currentQuestion
  const options = q?.options ?? []
  const isKerri = gameState.mode === 'kerri'
  const isCrowd = isKerri && !isGladiator
  const color = modeColor(gameState.mode)
  const revealed = typeof roundCorrectAnswer === 'string'
  const myAnswered = myId ? answeredIds.has(myId) : false
  const gladiator = gameState.players.find(p => p.id === gameState.gladiatorId)

  // свой ответ — сервер помнит его (myAnswer): экран, смонтированный заново после переподключения, покажет его же
  const savedPick = () => {
    const a = gameState.myAnswer
    const i = typeof a === 'string' ? options.indexOf(a) : -1
    return i >= 0 ? i : null
  }
  const [pick, setPick] = useState<number | null>(savedPick)
  // ответ ушёл, а сервер не засчитал (хекс кончился в пути) — выбор снимается, можно снова
  const [lost, setLost] = useState(false)
  useEffect(() => { setPick(savedPick()); setLost(false) }, [q?.id])

  // хекс: у тебя своё короткое время на ответ
  const hexLeft = useCountdown(revealed ? undefined : gameState.hexTimeLeft, gameState.hexEndsAt)
  const hexed = hexLeft !== undefined
  const hexDead = hexed && hexLeft <= 0
  // блинк: пока есть в запасе — ответ можно сменить
  const blinks = gameState.inventory?.blink ?? 0
  const canBlink = !isCrowd && myAnswered && blinks > 0 && !revealed && !hexDead
  const eliminated = gameState.removedOptions ?? []
  // гем: у кого что выбрано
  const peeks: Record<number, string[]> = {}
  for (const [targetId, r] of Object.entries(gemResults)) {
    const idx = typeof r.answer === 'string' ? options.indexOf(r.answer) : -1
    const name = gameState.players.find(p => p.id === targetId)?.name
    if (idx >= 0 && name) (peeks[idx] ??= []).push(name)
  }
  // толпа керри: на каком варианте своя ставка; на раскрытии — что выбрал керри (в т.ч. неверное)
  const myBetIdx = isCrowd && me?.currentBet && me.betOption !== undefined ? me.betOption : -1
  if (myBetIdx >= 0) (peeks[myBetIdx] ??= []).push('твоя ставка')
  const kerriAnswer = gladiator?.answer
  const kerriIdx = isCrowd && revealed && typeof kerriAnswer === 'string' ? options.indexOf(kerriAnswer) : -1

  useAnswerAck(pick !== null && !isCrowd && !revealed, myAnswered, () => { setPick(null); setLost(true) })

  const interactive = !isCrowd && !revealed && !hexDead && (!myAnswered || canBlink)
  const choose = (idx: number) => {
    if (!interactive || eliminated.includes(idx)) return
    if (!myAnswered && pick === null) {
      setPick(idx)
      setLost(false)
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
      if (ignoreHotkey(e)) return
      const n = Number(e.key)
      if (n >= 1 && n <= options.length) choose(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const hover = isGladiator && isKerri && !revealed
    ? (idx: number | null) => sendHover(idx)
    : undefined

  // длины полос: «для всех» со ставкой на вопрос — вопрос 15 с, хекс 7 с, молния 1.5 с
  const timings = roundTimings(gameState.mode, !!gameState.questionBet)

  return (
    <div className="min-h-dvh flex flex-col">
      <GameHud />
      {hexed
        // key: разные полосы — разные экземпляры (иначе хексовая унаследует длину 45 с от обычной и «побежит» неровно)
        ? <TimeBar key="hex" seconds={gameState.hexTimeLeft!} endsAt={gameState.hexEndsAt} total={timings.hexSeconds} color={color} stopped={revealed || hexDead}
            lightning={!isCrowd} lightningMs={timings.lightningMs} redAfterLightning />
        : <TimeBar key="phase" seconds={gameState.phaseTimeLeft} endsAt={gameState.phaseEndsAt} total={timings.question} color={color} stopped={revealed}
            lightning={!isCrowd} lightningMs={timings.lightningMs} />}

      {/* блок вопроса — по центру; лоток под ним фиксированной высоты, поэтому раскрытие ничего не двигает */}
      <main className="below-itembar flex-1 w-full max-w-[56rem] mx-auto px-4 sm:px-6 pt-6 flex flex-col justify-center">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-base" style={{ color: C.muted }}>
          {isCrowd && gladiator ? (
            <span>Отвечает <b style={{ color: C.hot }}>{gladiator.name}</b>, ты смотришь</span>
          ) : isGladiator ? (
            <span style={{ color: C.hot }} className="font-semibold">Ты керри. Все смотрят на тебя</span>
          ) : (
            <TopicInline topic={q?.displayTopic ?? q?.topic} />
          )}
          {!revealed && <SelfEffects hexLeft={hexed ? hexLeft : undefined} />}
        </div>

        <h1 className="font-semibold leading-tight mb-7" style={{ fontSize: 'clamp(1.45rem, 2.4vw, 2.75rem)', color: C.fg, textWrap: 'balance' } as CSSProperties}>
          {q?.text}
        </h1>

        <AnswerOptions
          options={options}
          interactive={interactive}
          myPick={isCrowd ? (kerriIdx >= 0 ? kerriIdx : null) : pick}
          pickLabel={isCrowd ? 'Выбор керри' : undefined}
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
              {me?.currentBet && myBetIdx >= 0 ? (
                <span>
                  Твоя ставка <b className="tnum" style={{ color: C.fg }}><Money v={me.currentBet} /></b> на то, что он выберет{' '}
                  <b style={{ color: C.fg }}>«{options[myBetIdx]}»</b>
                </span>
              ) : <span>Ты не ставил в этом раунде</span>}
              {gladiator && answeredIds.has(gladiator.id) && <span style={{ color: C.fg }}>Керри ответил</span>}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <AnswerProgress color={color} only={isGladiator && gladiator ? [gladiator.id] : undefined} />
              {lost && !myAnswered && !hexDead ? (
                <span className="text-[0.8125rem] font-semibold" style={{ color: C.hot }}>Ответ не засчитан, выбери ещё раз</span>
              ) : (
                // «1–4» — подсказка для клавиатуры, на тач-экране её нет
                <span className={`text-[0.8125rem] ${!hexDead && !canBlink && !myAnswered ? '[@media(pointer:coarse)]:hidden' : ''}`}
                  style={{ color: canBlink ? C.sky : C.muted }}>
                  {hexDead ? 'Не успел' : canBlink ? `Ответ принят. Передумал — жми другой вариант (блинков: ${blinks})`
                    : myAnswered ? 'Ответ принят' : pick !== null ? 'Отправляем…' : 'Можно жать 1–4'}
                </span>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
