// server/src/game/RoundSelector.ts
import type { GameMode } from '@cumsino/shared'

/** Цикл режимов: all → kerri → closest → all … */
export class RoundSelector {
  private index = 0
  private readonly cycle: GameMode[] = ['all', 'kerri', 'closest']

  next(): GameMode {
    return this.cycle[this.index++ % this.cycle.length]
  }
}
