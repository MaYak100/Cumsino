// client/src/components/screens/screenFor.ts
// Какой экран показать в фазе игры. Один выбор и для App.tsx, и для лаборатории /dev (dev/DevPage.tsx) —
// чтобы лаборатория показывала ровно те экраны, что и игра.
import type { FC } from 'react'
import type { GamePhase, GameMode } from '@cumsino/shared'
import { LobbyScreen } from './LobbyScreen'
import { AnnounceScreen } from './AnnounceScreen'
import { BettingTableScreen } from './BettingTableScreen'
import { QuestionScreen } from './QuestionScreen'
import { GladiatorSelfScreen } from './GladiatorSelfScreen'
import { ClosestScreen } from './ClosestScreen'
import { Top5Screen } from './Top5Screen'
import { RoundResultsScreen } from './RoundResultsScreen'
import { GameOverScreen } from './GameOverScreen'

export function screenFor(phase: GamePhase, mode: GameMode, isGladiator: boolean): FC {
  switch (phase) {
    case 'LOBBY': return LobbyScreen
    case 'ANNOUNCE': return AnnounceScreen
    case 'BETTING': return BettingTableScreen
    case 'QUESTION':
      if (mode === 'closest') return ClosestScreen
      if (mode === 'top5') return Top5Screen
      if (mode === 'kerri' && isGladiator) return GladiatorSelfScreen
      return QuestionScreen
    case 'REVEAL': return RoundResultsScreen
    case 'GAME_OVER': return GameOverScreen
    default: return LobbyScreen
  }
}
