import { motion } from 'framer-motion'
import { C, DISPLAY } from '../../theme'
import { Sticker } from './Sticker'

const KEYS = ['1', '2', '3', '4']

interface Props {
  options: string[]
  /** можно выбрать вариант */
  interactive: boolean
  myPick: number | null
  onPick?: (idx: number) => void
  onHover?: (idx: number | null) => void
  /** правильный ответ — раскрытие */
  correct: string | null
  notes?: string[] | null
  /** куда смотрит керри (видит толпа) */
  hoverIdx?: number | null
  eliminatedIdx?: number | null
  /** верный ответ известен заранее (толпа в керри) — помечаем пунктиром */
  knownCorrect?: string | null
  color: string
  /** id вопроса — для стабильных «вырезок» бирок */
  seed: string
}

/** Сетка вариантов 2×2. Все строки одной высоты (grid-auto-rows: 1fr), а подписи значений после раскрытия —
 *  бирки поверх верхней кромки (absolute), поэтому раскрытие ничего не сдвигает. */
export function AnswerOptions({
  options, interactive, myPick, onPick, onHover, correct, notes, hoverIdx, eliminatedIdx, knownCorrect, color, seed,
}: Props) {
  const revealed = correct !== null

  return (
    <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-3 sm:gap-4" style={{ gridAutoRows: '1fr' }}>
      {options.map((option, idx) => {
        const isCorrect = revealed && option === correct
        const isMine = myPick === idx
        const isEliminated = !revealed && eliminatedIdx === idx
        const watched = !revealed && hoverIdx === idx
        const canPick = interactive && !revealed && !isEliminated && myPick === null
        const note = revealed ? notes?.[idx] : undefined
        const missed = revealed && isMine && !isCorrect
        const hint = !revealed && !!knownCorrect && option === knownCorrect && !watched

        const border = isCorrect ? C.mint
          : missed ? C.hot
          : isMine ? color
          : watched ? C.hot
          : hint ? C.mint
          : C.line
        const bg = isCorrect ? C.mint
          : isMine && !revealed ? `${color}1f`
          : C.panel
        const dim = (revealed && !isCorrect && !isMine) || isEliminated || (!revealed && myPick !== null && !isMine)

        return (
          <motion.button
            key={idx}
            type="button"
            disabled={!canPick}
            onClick={canPick ? () => onPick?.(idx) : undefined}
            onMouseEnter={() => onHover?.(idx)}
            onMouseLeave={() => onHover?.(null)}
            whileHover={canPick ? { y: -3 } : undefined}
            whileTap={canPick ? { scale: 0.97 } : undefined}
            animate={isCorrect ? { scale: [1, 1.035, 1] } : watched ? { scale: 1.02 } : { scale: 1 }}
            transition={{ duration: isCorrect ? 0.45 : 0.2 }}
            className="group relative text-left rounded-2xl"
            style={{
              minHeight: '5.75rem',
              padding: '16px 18px',
              border: `2px ${hint ? 'dashed' : 'solid'} ${border}`,
              background: bg,
              color: isCorrect ? C.ink : C.fg,
              cursor: canPick ? 'pointer' : 'default',
              boxShadow: isCorrect ? `0 0 0 4px ${C.mint}33, 0 10px 40px ${C.mint}40`
                : watched ? `0 0 0 4px ${C.hot}33` : 'none',
              transition: 'border-color .18s, background-color .25s, color .25s',
            }}
          >
            <span
              className="flex items-center gap-4 h-full"
              style={{ opacity: dim ? (note ? 0.5 : 0.38) : 1, transition: 'opacity .3s' }}
            >
              <span
                className="shrink-0 flex items-center justify-center rounded-lg transition-colors"
                style={{
                  width: '2.25rem', height: '2.25rem', fontFamily: DISPLAY, fontSize: '1rem',
                  background: isCorrect ? C.ink : isMine ? (missed ? C.hot : color) : C.panel2,
                  color: isCorrect ? C.mint : isMine ? C.ink : C.muted,
                  border: `1px solid ${isCorrect || isMine ? 'transparent' : C.line}`,
                }}
              >
                {KEYS[idx]}
              </span>
              <span
                className="font-semibold text-[1rem] sm:text-[1.0625rem] leading-snug"
                style={{ textDecoration: isEliminated ? 'line-through' : undefined }}
              >
                {option}
              </span>
            </span>

            {canPick && (
              <span className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ boxShadow: `inset 0 0 0 2px ${color}` }} />
            )}

            {watched && (
              <motion.span
                className="absolute rounded-full"
                style={{ top: 10, right: 10, width: '0.625rem', height: '0.625rem', background: C.hot }}
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ repeat: Infinity, duration: 0.9 }}
              />
            )}

            {note && (
              <span className="absolute" style={{ top: -14, right: 12, zIndex: 2 }}>
                <Sticker
                  seed={`${seed}-${idx}`}
                  slam
                  delay={0.25 + idx * 0.07}
                  rotate={idx % 2 ? 3 : -3}
                  jag={3}
                  color={isCorrect ? C.ink : C.paper}
                  textColor={isCorrect ? C.mint : C.ink}
                  padding="3px 10px 4px"
                >
                  <span className="tnum" style={{ fontFamily: DISPLAY, fontSize: '0.9375rem', whiteSpace: 'nowrap' }}>{note}</span>
                </Sticker>
              </span>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}
