import React from 'react'
import { useGameStore, selectIsGladiator } from './store/gameStore'
import { JoinScreen } from './components/screens/JoinScreen'
import { LobbyScreen } from './components/screens/LobbyScreen'
import { AnnounceScreen } from './components/screens/AnnounceScreen'
import { BettingScreen } from './components/screens/BettingScreen'
import { GladiatorCrowdScreen } from './components/screens/GladiatorCrowdScreen'
import { QuestionTextScreen } from './components/screens/QuestionTextScreen'
import { QuestionScreen } from './components/screens/QuestionScreen'
import { GladiatorSelfScreen } from './components/screens/GladiatorSelfScreen'
import { ClosestScreen } from './components/screens/ClosestScreen'
import { Top5Screen } from './components/screens/Top5Screen'
import { RevealScreen } from './components/screens/RevealScreen'
import { LeaderboardScreen } from './components/screens/LeaderboardScreen'
import { GameOverScreen } from './components/screens/GameOverScreen'
import { AnimatePresence, motion } from 'framer-motion'

export default function App() {
  const gameState = useGameStore(s => s.gameState)
  const isGladiator = useGameStore(selectIsGladiator)

  if (!gameState) return <JoinScreen />

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
      Screen = (mode === 'gladiator' && !isGladiator) ? GladiatorCrowdScreen : BettingScreen
      break
    case 'QUESTION_TEXT':
      Screen = QuestionTextScreen
      break
    case 'QUESTION':
      if (mode === 'closest') Screen = ClosestScreen
      else if (mode === 'top5') Screen = Top5Screen
      else if (mode === 'gladiator' && isGladiator) Screen = GladiatorSelfScreen
      else Screen = QuestionScreen
      break
    case 'REVEAL':
      Screen = RevealScreen
      break
    case 'LEADERBOARD':
      Screen = LeaderboardScreen
      break
    case 'GAME_OVER':
      Screen = GameOverScreen
      break
    default:
      Screen = LobbyScreen
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={phase}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Screen />
      </motion.div>
    </AnimatePresence>
  )
}
