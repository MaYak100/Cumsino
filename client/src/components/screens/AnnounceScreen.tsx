import { useState, useEffect, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { C, DISPLAY, MODE, modeColor } from '../../theme'
import { GameHud } from '../ui/GameHud'
import { Sticker } from '../ui/Sticker'
import { TopicStack } from '../ui/Topic'
import { JackpotBadge } from '../ui/JackpotBadge'

/** какие режимы уже объявлялись в этой игре (первый раз — дольше, чтобы прочитали правила). Модульный, но
 *  сбрасывается с новой игрой — иначе во второй игре без перезагрузки правила мелькали бы быстро */
const seenModes = new Set<string>()
/** решение «первый раз» на раунд — повторный запуск эффекта (StrictMode, ремоунт) не превращает его в «уже видели» */
const firstByRound = new Map<number, boolean>()

let lastRound = 0

function isFirstShow(roundIndex: number, mode: string): boolean {
  // номер раунда пошёл назад — это новая игра
  if (roundIndex < lastRound) { seenModes.clear(); firstByRound.clear() }
  lastRound = roundIndex
  if (!firstByRound.has(roundIndex)) {
    firstByRound.set(roundIndex, !seenModes.has(mode))
    seenModes.add(mode)
  }
  return firstByRound.get(roundIndex)!
}

/** Анонс раунда: режим во весь экран → поверх него с размаху клеится стикер темы. */
export function AnnounceScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const [topicShown, setTopicShown] = useState(false)

  useEffect(() => {
    setTopicShown(false)
    // новый режим — дольше, чтобы успели прочитать правила
    const isFirst = isFirstShow(gameState.roundIndex, gameState.mode)
    const t = setTimeout(() => setTopicShown(true), isFirst ? 5200 : 3000)
    return () => clearTimeout(t)
  }, [gameState.phase, gameState.roundIndex])

  const mode = MODE[gameState.mode]
  const color = modeColor(gameState.mode)
  const q = gameState.currentQuestion
  const topic = q?.displayTopic ?? q?.topic ?? ''
  const isAll = gameState.mode === 'all'
  // «для всех» со ставкой на вопрос: ставишь, уже прочитав вопрос (варианты — после ставок)
  const desc = isAll && gameState.questionBet
    ? 'Сначала видишь вопрос без вариантов и ставишь на себя. Ответил верно — делишь ставки тех, кто ошибся.'
    : mode?.desc

  return (
    <div className="min-h-dvh flex flex-col overflow-hidden">
      <GameHud />

      <motion.div
        className="flex-1 flex flex-col items-center justify-center px-6 pb-[8vh] relative"
        animate={topicShown ? { x: [0, -14, 11, -6, 3, 0], y: [0, 6, -4, 2, 0, 0] } : { x: 0, y: 0 }}
        transition={{ duration: 0.38, delay: 0.09 }}
      >
        {/* режим */}
        <motion.div
          animate={topicShown
            ? { opacity: 0.6, scale: 0.96 }
            : { opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, delay: topicShown ? 0.08 : 0 }}
          className="flex flex-col items-center text-center"
        >
          <motion.div
            initial={{ x: '-60vw', skewX: 18, opacity: 0 }}
            animate={{ x: 0, skewX: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.15 }}
            style={{
              fontFamily: DISPLAY, color, lineHeight: 1, rotate: '-3deg',
              fontSize: 'clamp(54px, 10vw, 150px)',
              textShadow: `0 0 60px ${color}55`,
              textWrap: 'balance',
            } as CSSProperties}
          >
            {mode?.name ?? gameState.mode}
          </motion.div>

          {/* гаснет, но держит место — режим не прыгает, когда прилетает тема */}
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={topicShown ? { opacity: 0, y: 0 } : { opacity: 1, y: 0 }}
            transition={topicShown ? { duration: 0.12 } : { delay: 0.75, duration: 0.4 }}
            className="mt-10 text-lg sm:text-xl leading-relaxed"
            style={{ color: C.fg, maxWidth: 560 }}
          >
            {desc}
          </motion.p>
          {/* банк джекпота: пустые раунды «для всех» копят его, забирают угадавшие следующего обычного */}
          {isAll && (gameState.jackpotBank ?? 0) > 0 && (
            <div className="mt-6">
              <JackpotBadge bank={gameState.jackpotBank} size="clamp(22px, 2.6vw, 34px)" slam rotate={-2} />
            </div>
          )}
        </motion.div>

        {/* тема — стикер поверх режима */}
        {topicShown && topic && (
          // ниже центра: стикер ложится на нижнюю половину надписи режима, верх режима торчит
          <div className="absolute inset-0 flex items-center justify-center px-6 pb-[8vh] pointer-events-none"
            style={{ paddingTop: 'clamp(24px, 4.5vw, 84px)' }}>
            <Sticker
              seed={`${q?.id}-topic`}
              slam
              rotate={gameState.roundIndex % 2 ? 3.5 : -4}
              jag={9}
              padding="clamp(14px, 2vw, 26px) clamp(22px, 3vw, 44px)"
              style={{ maxWidth: 'min(900px, 88vw)' }}
            >
              {/* субъект крупно, аспект («способности», «убийства») мельче под ним */}
              <TopicStack topic={topic} size="clamp(34px, 6vw, 86px)" aspectScale={0.4} />
            </Sticker>
          </div>
        )}
      </motion.div>
    </div>
  )
}
