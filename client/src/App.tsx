import { useEffect, useRef, useState } from 'react'
import { useGameStore, selectIsGladiator } from './store/gameStore'
import { JoinScreen } from './components/screens/JoinScreen'
import { screenFor } from './components/screens/screenFor'
import { LateJoinScreen } from './components/screens/LateJoinScreen'
import { AnimatePresence, motion } from 'framer-motion'
import { TableFelt } from './components/ui/TableFelt'
import { ItemBar } from './components/ui/ItemBar'
import { Notice } from './components/ui/Notice'
import { useCompactBetting } from './lib/tableGeometry'

export default function App() {
  const gameState = useGameStore(s => s.gameState)
  const isGladiator = useGameStore(selectIsGladiator)
  const isLateJoiner = useGameStore(s => s.isLateJoiner)
  // на телефоне ставки — колонкой (CompactBetting), стол за ней не нужен: фон остаётся размытым
  const compact = useCompactBetting()
  const phase = gameState?.phase
  // Старый экран уходит анимацией Framer Motion; в фоновой вкладке (альт-таб) она может не доиграть, и он остаётся на
  // сцене вместе с новым (анонс с темой «залипает» поверх вопроса). Сторож: через секунду после смены фазы и при
  // возврате на вкладку — на сцене больше одного экрана → пересоздать AnimatePresence, он держит только текущий.
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageGen, setStageGen] = useState(0)
  useEffect(() => {
    const check = () => {
      if ((stageRef.current?.querySelectorAll(':scope > [data-screen]').length ?? 0) > 1) setStageGen(g => g + 1)
    }
    const t = setTimeout(check, 1200)
    const onVisible = () => { if (document.visibilityState === 'visible') setTimeout(check, 400) }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [phase])

  useEffect(() => {
    if (!gameState) return
    const id = setInterval(() => {
      fetch((import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001') + '/health').catch(() => {})
    }, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [!!gameState])

  if (!gameState) return <JoinScreen />

  if (isLateJoiner) return (
    <div className="stage" style={{ height: '100dvh', overflow: 'hidden', position: 'relative' }}>
      <AnimatePresence>
        <motion.div key="late-join" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>
          <LateJoinScreen />
        </motion.div>
      </AnimatePresence>
    </div>
  )

  const Screen = screenFor(gameState.phase, gameState.mode, isGladiator)

  return (
    <div ref={stageRef} className="stage" style={{ height: '100dvh', overflow: 'hidden', position: 'relative' }}>
      <TableFelt blurred={gameState.phase !== 'BETTING' || compact} />
      <AnimatePresence key={stageGen}>
        <motion.div
          key={gameState.phase}
          data-screen
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -12, pointerEvents: 'none', transition: { duration: 0.15 } }}
          transition={{ duration: 0.4 }}
          style={{ position: 'absolute', inset: 0, overflowY: 'auto', pointerEvents: 'auto' }}
        >
          <Screen />
        </motion.div>
      </AnimatePresence>
      <ItemBar />
      <Notice />
    </div>
  )
}
