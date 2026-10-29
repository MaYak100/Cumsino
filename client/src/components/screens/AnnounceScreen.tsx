import { useState, useEffect, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { C, DISPLAY, MODE, modeColor } from '../../theme'
import { GameHud } from '../ui/GameHud'
import { Sticker } from '../ui/Sticker'

const seenModes = new Set<string>()

/** Анонс раунда: режим во весь экран → поверх него с размаху клеится стикер темы. */
export function AnnounceScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const [topicShown, setTopicShown] = useState(false)

  useEffect(() => {
    setTopicShown(false)
    // новый режим — дольше, чтобы успели прочитать правила
    const isFirst = !seenModes.has(gameState.mode)
    seenModes.add(gameState.mode)
    const t = setTimeout(() => setTopicShown(true), isFirst ? 5200 : 3000)
    return () => clearTimeout(t)
  }, [gameState.phase, gameState.roundIndex])

  const mode = MODE[gameState.mode]
  const color = modeColor(gameState.mode)
  const q = gameState.currentQuestion
  const topic = q?.displayTopic ?? q?.topic ?? ''

  return (
    <div className="min-h-screen flex flex-col overflow-hidden">
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
            {mode?.desc}
          </motion.p>
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
              <div style={{
                fontFamily: DISPLAY, fontSize: 'clamp(34px, 6vw, 86px)', lineHeight: 1,
                textAlign: 'center', textWrap: 'balance',
              } as CSSProperties}>
                {topic}
              </div>
            </Sticker>
          </div>
        )}
      </motion.div>
    </div>
  )
}
