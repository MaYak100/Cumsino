import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { C } from '../../theme'

const SCALE: Array<{ score: number; label: string; color: string }> = [
  { score: -2, label: 'Удалить', color: C.hot },
  { score: -1, label: 'Слабый', color: '#e893a6' },
  { score: 1, label: 'Хороший', color: '#93e6bb' },
  { score: 2, label: 'Ахуенный', color: C.mint },
]

function SideButton({ label, active, color, onClick, order }: {
  label: string; active: boolean; color: string; onClick: () => void; order: string
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.93 }}
      aria-pressed={active}
      className={`${order} flex-1 sm:flex-none font-bold text-[0.9375rem] rounded-xl transition-colors`}
      style={{
        minWidth: '7rem', height: '3.75rem',
        border: `2px solid ${active ? color : C.line}`,
        background: active ? color : 'transparent',
        color: active ? C.ink : color,
      }}
    >
      {label}
    </motion.button>
  )
}

/** Оценка вопроса раунда: по краям сложность, по центру шкала из четырёх мер. Повторное нажатие снимает выбор;
 *  «нормально» — ничего не жать. Выбор живёт в сторе, каждое изменение (и снятие) уходит на сервер через 0.8 с
 *  и сразу действует на веса — исход игры не важен.
 *  «Удалить» — голос: вопрос уходит навсегда, когда при закрытии показа за удаление больше половины бывших при
 *  показе и не меньше двух (соло не удаляет; server/src/game/questions/history.ts). */
export function RateQuestion({ delay = 0 }: { delay?: number }) {
  const qid = useGameStore(s => s.gameState?.currentQuestion?.id)
  const rating = useGameStore(s => s.rating)
  const setRating = useGameStore(s => s.setRating)
  if (!qid) return null

  const mine = rating?.questionId === qid ? rating : null
  const score = mine?.score ?? null
  const difficulty = mine?.difficulty ?? null

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 260, damping: 26 }}
      className="w-full"
      style={{ maxWidth: '47.5rem' }}
    >
      <div className="text-sm mb-2.5 text-center" style={{ color: C.muted }}>Как вопрос?</div>
      <div className="flex flex-wrap sm:flex-nowrap items-stretch gap-2.5">
        <SideButton order="order-2 sm:order-1" label="Легко" color={C.sky} active={difficulty === -1}
          onClick={() => setRating(qid, { difficulty: -1 })} />

        <div
          className="order-1 sm:order-2 w-full sm:flex-1 grid grid-cols-4 rounded-xl overflow-hidden"
          style={{ height: '3.75rem', border: `2px solid ${C.line}`, background: C.panel }}
          role="radiogroup"
          aria-label="Оценка вопроса"
        >
          {SCALE.map(({ score: s, label, color }, i) => {
            const active = score === s
            return (
              <motion.button
                key={s}
                role="radio"
                aria-checked={active}
                onClick={() => setRating(qid, { score: s })}
                whileTap={{ scale: 0.94 }}
                className="relative font-bold text-[0.8125rem] sm:text-[0.9375rem]"
                style={{
                  color: active ? C.ink : color,
                  borderLeft: i ? `1px solid ${C.line}` : undefined,
                }}
              >
                {active && (
                  <motion.span
                    layoutId={`rate-pick-${qid}`}
                    className="absolute"
                    style={{ inset: 4, borderRadius: 8, background: color }}
                    transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                  />
                )}
                <span className="relative">{label}</span>
              </motion.button>
            )
          })}
        </div>

        <SideButton order="order-3" label="Сложно" color={C.brass} active={difficulty === 1}
          onClick={() => setRating(qid, { difficulty: 1 })} />
      </div>
    </motion.div>
  )
}
