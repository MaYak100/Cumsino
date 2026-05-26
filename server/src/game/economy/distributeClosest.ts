import { CLOSEST_WINNER_BONUS, CLOSEST_EXACT_BONUS } from '@cumsino/shared'

interface AnswerEntry { id: string; answer: number }

/**
 * Спец-режим КТО БЛИЖЕ: победитель(и) получают бонус из системы.
 * При ничьей бонус делится поровну (округление вниз до кратного 10).
 */
export function distributeClosest(
  players: AnswerEntry[],
  correctAnswer: number
): Map<string, number> {
  const result = new Map<string, number>(players.map(p => [p.id, 0]))

  if (players.length === 0) return result

  const diffs = players.map(p => ({
    id: p.id,
    diff: Math.abs(p.answer - correctAnswer),
    exact: p.answer === correctAnswer,
  }))

  const minDiff = Math.min(...diffs.map(d => d.diff))
  const winners = diffs.filter(d => d.diff === minDiff)
  const isExact = winners.every(w => w.exact)

  const totalBonus = CLOSEST_WINNER_BONUS + (isExact ? CLOSEST_EXACT_BONUS : 0)
  const perWinner = Math.floor(totalBonus / winners.length / 10) * 10

  for (const winner of winners) {
    result.set(winner.id, perWinner)
  }

  return result
}
