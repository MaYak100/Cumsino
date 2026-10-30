import type { Player } from '@cumsino/shared'
import { C } from '../../theme'

/** Пометка нужна боту, у которого в имени «бот» не сказано (сервер зовёт их «Бот 2», но имя может быть любым). */
export const needsBotMark = (p?: Pick<Player, 'bot' | 'name'>): boolean => !!p?.bot && !/бот/i.test(p.name)

/** Пометка бота у имени (лобби, ставки на телефоне, стол, итоги). */
export function BotMark() {
  return (
    <span className="font-bold rounded shrink-0" style={{
      fontSize: '0.625rem', lineHeight: 1.35, padding: '0 0.25rem',
      border: `1px solid ${C.muted}`, color: C.muted, verticalAlign: 'middle',
    }}>
      бот
    </span>
  )
}
