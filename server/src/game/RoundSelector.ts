// server/src/game/RoundSelector.ts
import type { GameMode, MainMode } from '@cumsino/shared'

export class RoundSelector {
  private index = 0
  private readonly cycle: GameMode[] = ['all', 'kerri', 'closest']
  lastMainMode: MainMode = 'all'

  next(): GameMode {
    const mode = this.cycle[this.index % this.cycle.length]
    this.index++
    if (mode === 'all' || mode === 'kerri') {
      this.lastMainMode = mode
    }
    return mode
  }
}
