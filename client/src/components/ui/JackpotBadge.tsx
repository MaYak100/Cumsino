import { C, DISPLAY } from '../../theme'
import { Money } from './Money'
import { Sticker } from './Sticker'

/** Банк джекпота «для всех» (GameState.jackpotBank): латунный стикер «Джекпот $N». Пустой — не рисуется.
 *  size — кегль суммы (px или rem строкой); slam — с размаху (анонс). */
export function JackpotBadge({ bank, size = 22, slam, rotate = 3, seed = 'jackpot' }: {
  bank?: number; size?: number | string; slam?: boolean; rotate?: number; seed?: string
}) {
  if (!bank || bank <= 0) return null
  return (
    <Sticker seed={`${seed}-${bank}`} slam={slam} rotate={rotate} jag={4} color={C.brass} textColor={C.ink}
      padding="5px 12px 6px">
      <span className="flex items-baseline gap-1.5 whitespace-nowrap leading-none">
        <span style={{ fontWeight: 700, fontSize: typeof size === 'number' ? size * 0.55 : `calc(${size} * 0.55)` }}>
          Джекпот
        </span>
        <span style={{ fontFamily: DISPLAY, fontSize: size }}><Money v={bank} /></span>
      </span>
    </Sticker>
  )
}
