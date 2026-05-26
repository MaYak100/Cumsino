// server/src/game/RoundSelector.ts
import type { GameMode, MainMode } from '@cumsino/shared'
import { SPECIAL_MODE_CHANCE } from '@cumsino/shared'

export class RoundSelector {
  private roundIndex = 0
  lastMainMode: MainMode = 'gladiator' // после gladiator → следующий основной = all

  constructor(private specialModes: GameMode[]) {}

  next(): GameMode {
    const mode = this.pickMode()
    this.roundIndex++
    return mode
  }

  nextForceSpecial(): GameMode {
    const mode = this.specialModes[Math.floor(Math.random() * this.specialModes.length)]
    this.roundIndex++
    return mode
  }

  nextForceMain(): GameMode {
    const mode: MainMode = this.lastMainMode === 'all' ? 'gladiator' : 'all'
    this.lastMainMode = mode
    this.roundIndex++
    return mode
  }

  private pickMode(): GameMode {
    if (this.roundIndex === 0) return 'all'
    if (this.roundIndex === 1) {
      this.lastMainMode = 'gladiator'
      return 'gladiator'
    }

    const useSpecial = this.specialModes.length > 0 && Math.random() < SPECIAL_MODE_CHANCE
    if (useSpecial) {
      return this.specialModes[Math.floor(Math.random() * this.specialModes.length)]
    }

    const next: MainMode = this.lastMainMode === 'all' ? 'gladiator' : 'all'
    this.lastMainMode = next
    return next
  }
}
