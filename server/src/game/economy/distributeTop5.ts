import { TOP5_SLOT_BONUS, TOP5_PERFECT_BONUS } from '@cumsino/shared'

interface AnswerEntry { id: string; answer: string[] }

/**
 * Спец-режим ТОП 5: каждый игрок получает бонус независимо.
 * +20 за каждый верный слот. Все 5 верно → 150 (вместо 100).
 */
export function distributeTop5(
  players: AnswerEntry[],
  orderedItems: string[]
): Map<string, number> {
  const result = new Map<string, number>()

  for (const player of players) {
    const correctSlots = player.answer.filter(
      (item, idx) => item === orderedItems[idx]
    ).length

    const reward = correctSlots === 5
      ? TOP5_PERFECT_BONUS
      : correctSlots * TOP5_SLOT_BONUS

    result.set(player.id, reward)
  }

  return result
}
