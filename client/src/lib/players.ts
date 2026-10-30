import type { Player } from '@cumsino/shared'

/** Зритель — вошёл посреди раунда (Player.spectator до следующего раунда). Не отвечает, не ставит, не цель гема
 *  и хекса, никого не задерживает — в «кто ответил» и в выборе цели его нет. */
export const isSpectator = (p: Player): boolean => !!p.spectator
