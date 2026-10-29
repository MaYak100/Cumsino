import { useEffect } from 'react'
import { useGameStore, selectIsGladiator } from './store/gameStore'
import { JoinScreen } from './components/screens/JoinScreen'
import { screenFor } from './components/screens/screenFor'
import { LateJoinScreen } from './components/screens/LateJoinScreen'
import { AnimatePresence, motion } from 'framer-motion'
import { TableFelt } from './components/ui/TableFelt'

export default function App() {
  const gameState = useGameStore(s => s.gameState)
  const isGladiator = useGameStore(selectIsGladiator)
  const isLateJoiner = useGameStore(s => s.isLateJoiner)

  useEffect(() => {
    if (!gameState) return
    const id = setInterval(() => {
      fetch((import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001') + '/health').catch(() => {})
    }, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [!!gameState])

  if (!gameState) return <JoinScreen />

  if (isLateJoiner) return (
    <div style={{ height: '100vh', overflow: 'hidden', position: 'relative', background: '#060606' }}>
      <AnimatePresence>
        <motion.div key="late-join" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>
          <LateJoinScreen />
        </motion.div>
      </AnimatePresence>
    </div>
  )

  const phase = gameState.phase
  const Screen = screenFor(phase, gameState.mode, isGladiator)

  return (
    <div style={{ height: '100vh', overflow: 'hidden', position: 'relative', background: '#060606' }}>
      <TableFelt blurred={phase !== 'BETTING'} />
      <AnimatePresence>
        <motion.div
          key={phase}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -12, pointerEvents: 'none', transition: { duration: 0.15 } }}
          transition={{ duration: 0.4 }}
          style={{ position: 'absolute', inset: 0, overflowY: 'auto', pointerEvents: 'auto' }}
        >
          <Screen />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
