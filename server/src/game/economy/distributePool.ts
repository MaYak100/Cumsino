interface StakeEntry { id: string; stake: number }

export function distributePool(
  winners: StakeEntry[],
  losers: StakeEntry[]
): Map<string, number> {
  const result = new Map<string, number>()
  const pool = losers.reduce((sum, p) => sum + p.stake, 0)
  const totalWinnerStake = winners.reduce((sum, p) => sum + p.stake, 0)

  for (const loser of losers) {
    result.set(loser.id, -loser.stake || 0)
  }

  for (const winner of winners) {
    if (pool === 0 || totalWinnerStake === 0) {
      result.set(winner.id, 0)
      continue
    }
    // Round down to nearest multiple of 10 (smallest chip denomination)
    const share = Math.floor((winner.stake / totalWinnerStake) * pool / 10) * 10
    result.set(winner.id, share)
  }

  // Correct rounding remainder: give it to the winner with the largest stake
  if (winners.length > 0 && pool > 0 && totalWinnerStake > 0) {
    const distributed = winners.reduce((sum, w) => sum + (result.get(w.id) ?? 0), 0)
    const remainder = pool - distributed
    if (remainder !== 0) {
      const topWinner = winners.reduce((max, w) => w.stake > max.stake ? w : max, winners[0])
      result.set(topWinner.id, (result.get(topWinner.id) ?? 0) + remainder)
    }
  }

  return result
}
