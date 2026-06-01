import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'

const MODE_NAMES: Record<string, string> = {
  all:     'ВОПРОС ДЛЯ ВСЕХ',
  kerri:   'КЕРРИ',
  closest: 'КТО БЛИЖЕ',
  top5:    'ТОП 5',
}

const MODE_DESCRIPTIONS: Record<string, string> = {
  all:     'Ставьте ставки на себя. Если ответите, а другие — нет, то поделите их ставки.',
  kerri:   'Случайно выбирается керри. Он будет отвечать на вопрос. Вы видите вопрос и ставите на исход.',
  closest: 'Без ставок. Просто кто угадает число ближе остальных — забирает банк.',
  top5:    'Назови пятёрку',
}

// Spring preset that gives snappy entry without overshoot (no brightness flicker)
const SPRING = { type: 'spring' as const, stiffness: 220, damping: 28 }

export function AnnounceScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const [step, setStep] = useState<'mode' | 'topic'>('mode')

  useEffect(() => {
    setStep('mode')
    const t = setTimeout(() => setStep('topic'), 4000)
    return () => clearTimeout(t)
  }, [gameState.phase])

  const modeName = MODE_NAMES[gameState.mode] ?? gameState.mode
  const modeDesc = MODE_DESCRIPTIONS[gameState.mode] ?? ''
  const topic = gameState.currentQuestion?.displayTopic ?? gameState.currentQuestion?.topic ?? ''

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      textAlign: 'center',
    }}>
      <AnimatePresence mode="wait">

        {step === 'mode' && (
          <motion.div
            key="mode"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -24, transition: { duration: 0.4 } }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', willChange: 'transform' }}
          >
            {/* Label */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0, duration: 0.45 }}
              style={{
                fontSize: 12, textTransform: 'uppercase',
                letterSpacing: '0.22em', color: '#c4c9d4',
                marginBottom: 24,
              }}
            >
              Режим
            </motion.div>

            {/* Mode name */}
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, ...SPRING }}
              style={{
                fontSize: 58,
                fontWeight: 900,
                color: '#fbbf24',
                letterSpacing: '0.04em',
                lineHeight: 1,
                textShadow: '0 0 80px rgba(251,191,36,0.35)',
                marginBottom: 30,
                willChange: 'transform',
              }}
            >
              {modeName}
            </motion.div>

            {/* Description */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.55, duration: 0.5 }}
              style={{
                fontSize: 16,
                color: '#c4c9d4',
                maxWidth: 460,
                lineHeight: 1.65,
              }}
            >
              {modeDesc}
            </motion.div>
          </motion.div>
        )}

        {step === 'topic' && (
          <motion.div
            key="topic"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -24, transition: { duration: 0.4 } }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
          >
            {/* Label */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10, transition: { duration: 0.3 } }}
              transition={{ delay: 0, duration: 0.45 }}
              style={{
                fontSize: 12, textTransform: 'uppercase',
                letterSpacing: '0.22em', color: '#c4c9d4',
                marginBottom: 24,
              }}
            >
              Тема
            </motion.div>

            {/* Topic name */}
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, transition: { duration: 0.35 } }}
              transition={{ delay: 1.2, ...SPRING }}
              style={{
                fontSize: 54,
                fontWeight: 900,
                color: '#fbbf24',
                letterSpacing: '0.04em',
                lineHeight: 1,
                textShadow: '0 0 80px rgba(251,191,36,0.35)',
                willChange: 'transform',
              }}
            >
              {topic}
            </motion.div>

          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
