import React from 'react'
import { useGameStore, selectIsGladiator } from './store/gameStore'
import { JoinScreen } from './components/screens/JoinScreen'
import { LobbyScreen } from './components/screens/LobbyScreen'
import { AnnounceScreen } from './components/screens/AnnounceScreen'
import { BettingTableScreen } from './components/screens/BettingTableScreen'
import { QuestionScreen } from './components/screens/QuestionScreen'
import { GladiatorSelfScreen } from './components/screens/GladiatorSelfScreen'
import { ClosestScreen } from './components/screens/ClosestScreen'
import { Top5Screen } from './components/screens/Top5Screen'
import { RoundResultsScreen } from './components/screens/RoundResultsScreen'
import { GameOverScreen } from './components/screens/GameOverScreen'
import { LateJoinScreen } from './components/screens/LateJoinScreen'
import { AnimatePresence, motion } from 'framer-motion'
import { TableFelt } from './components/ui/TableFelt'

export default function App() {
  const gameState = useGameStore(s => s.gameState)
  const isGladiator = useGameStore(selectIsGladiator)
  const isLateJoiner = useGameStore(s => s.isLateJoiner)

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
  const mode = gameState.mode

  let Screen: React.FC

  switch (phase) {
    case 'LOBBY':
      Screen = LobbyScreen
      break
    case 'ANNOUNCE':
      Screen = AnnounceScreen
      break
    case 'BETTING':
      Screen = BettingTableScreen
      break
    case 'QUESTION_TEXT':
    case 'QUESTION':
      if (mode === 'closest') Screen = ClosestScreen
      else if (mode === 'top5') Screen = Top5Screen
      else if (mode === 'kerri' && isGladiator) Screen = GladiatorSelfScreen
      else Screen = QuestionScreen
      break
    case 'REVEAL':
    case 'LEADERBOARD':
      Screen = RoundResultsScreen
      break
    case 'GAME_OVER':
      Screen = GameOverScreen
      break
    default:
      Screen = LobbyScreen
  }

  return (
    <div style={{ height: '100vh', overflow: 'hidden', position: 'relative', background: '#060606' }}>
      <TableFelt blurred={phase !== 'BETTING'} />
      <AnimatePresence>
        <motion.div
          key={phase === 'QUESTION_TEXT' ? 'QUESTION' : phase}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.5 }}
          style={{ position: 'absolute', inset: 0, overflowY: 'auto', pointerEvents: 'auto' }}
        >
          <Screen />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
