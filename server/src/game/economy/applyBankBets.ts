interface PlayerWithBankBet {
  id: string
  bankBet?: { optionIndex: number; amount: number }
}

export function applyBankBets(
  deltas: Map<string, number>,
  players: Iterable<PlayerWithBankBet>,
  gladiatorAnswerIndex: number,
): Map<string, number> {
  const result = new Map(deltas)
  for (const player of players) {
    if (!player.bankBet) continue
    const { optionIndex, amount } = player.bankBet
    const hit = gladiatorAnswerIndex !== -1 && gladiatorAnswerIndex === optionIndex
    const existing = result.get(player.id) ?? 0
    result.set(player.id, existing + (hit ? amount * 3 : -amount))
  }
  return result
}
