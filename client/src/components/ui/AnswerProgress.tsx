import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ItemId, Player } from '@cumsino/shared'
import { useGameStore } from '../../store/gameStore'
import { C } from '../../theme'
import { ItemIcon, ITEM_LABEL } from './ItemIcon'
import { isSpectator } from '../../lib/players'
import { SmokeVeil } from './SmokeVeil'

const FEED_MS = 2800

/** Игроки раунда: имя заливается цветом режима, когда ответил. Над ником — кто чем воспользовался (свежая бирка),
 *  рядом — серия и активные эффекты, под ником — что показал твой гем. В режиме гема ники — мишени. */
export function AnswerProgress({ color, only }: { color: string; only?: string[] }) {
  const players = useGameStore(s => s.gameState?.players ?? [])
  const answeredIds = useGameStore(s => s.answeredIds)
  const myId = useGameStore(s => s.myId)
  const gemResults = useGameStore(s => s.gemResults)
  const targeting = useGameStore(s => s.targeting)
  const useItem = useGameStore(s => s.useItem)
  const options = useGameStore(s => s.gameState?.currentQuestion?.options)
  // ответ раскрыт — дым рассеивается: кто как ответил, видно всем
  const revealed = useGameStore(s => s.roundCorrectAnswer !== null)
  // зритель (вошёл посреди раунда) не отвечает — в «кто ответил» его нет, целью гема он тоже не бывает
  const list = (only ? players.filter(p => only.includes(p.id)) : players).filter(p => !isSpectator(p))

  const fresh = useFreshFeed()

  return (
    <div className="flex flex-wrap justify-center gap-x-2.5 gap-y-7 pt-6 pb-5">
      {list.map(p => {
        const done = answeredIds.has(p.id)
        const me = p.id === myId
        const target = targeting === 'gem' && !me
        const last = fresh.find(e => e.playerId === p.id)
        const gem = gemResults[p.id]
        // в смоке: соперникам ник закрыт дымом (и ответил ли — тоже); при выборе цели гема дым расходится
        const smoked = !!p.effects?.includes('smoke') && !revealed && !target
        return (
          <div key={p.id} className="relative flex flex-col items-center">
            <AnimatePresence>
              {last && <FeedTag key={last.at} item={last.item} />}
            </AnimatePresence>
            <SmokeVeil on={smoked} self={me} seed={p.id}>
            <motion.button
              type="button"
              disabled={!target}
              onClick={target ? () => useItem('gem', p.id) : undefined}
              animate={done ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              whileHover={target ? { scale: 1.08, y: -2 } : undefined}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-1.5 text-[0.8125rem] font-semibold rounded-full pl-2.5 pr-2.5 py-0.5"
              style={{
                background: done ? color : C.bg,   // непрозрачный: под пилюлей может гореть рамка серии
                color: done ? C.ink : C.muted,
                border: `1.5px ${done ? 'solid' : 'dashed'} ${target ? C.hot : done ? color : C.line}`,
                boxShadow: target ? `0 0 0 3px ${C.hot}55` : 'none',
                cursor: target ? 'crosshair' : 'default',
                transition: 'background-color .2s, color .2s',
              }}
            >
              {me ? 'Ты' : p.name}
              <Marks p={p} />
            </motion.button>
            </SmokeVeil>
            {gem && (
              <motion.span
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="absolute top-full mt-1 whitespace-nowrap text-[0.75rem] font-bold"
                style={{ color: C.sky }}
              >
                {gem.smoked ? 'в смоке' : gem.answer === null ? 'ещё думает'
                  : typeof gem.answer === 'string' && options?.includes(gem.answer)
                    ? `выбрал №${options.indexOf(gem.answer) + 1}` : `выбрал ${gem.answer}`}
              </motion.span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Свежие применения предметов (последние FEED_MS) — тикает сам, чтобы бирки исчезали без новых событий. */
export function useFreshFeed() {
  const itemFeed = useGameStore(s => s.itemFeed)
  const [now, setNow] = useState(Date.now())
  const fresh = itemFeed.filter(e => now - e.at < FEED_MS)
  useEffect(() => {
    if (!fresh.length) return
    const id = setTimeout(() => setNow(Date.now()), 400)
    return () => clearTimeout(id)
  })
  useEffect(() => setNow(Date.now()), [itemFeed])
  return fresh
}

/** Активные эффекты рядом с ником (серия — не здесь: она рамкой-пламенем, StreakFlame). */
export function Marks({ p, size = 16 }: { p: Player; size?: number }) {
  const fx = p.effects ?? []
  if (!fx.length) return null
  return (
    <span className="flex items-center gap-0.5">
      {fx.map(f => <ItemIcon key={f} id={f as ItemId} size={size} />)}
    </span>
  )
}

/** Свежая бирка «Блинк» / «Гем» — шлепок и исчезновение (живёт FEED_MS). side: над пилюлей ника на вопросе;
 *  слева от плашки за столом (над плашкой там стопка фишек — бирка её бы закрывала). */
export function FeedTag({ item, side = 'top' }: { item: ItemId; side?: 'top' | 'left' }) {
  return (
    <motion.span
      initial={{ scale: 1.9, opacity: 0, rotate: -12, y: 4 }}
      animate={{ scale: 1, opacity: 1, rotate: -4, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', stiffness: 520, damping: 18 }}
      className={`absolute flex items-center gap-1 rounded pl-0.5 pr-2 whitespace-nowrap ${side === 'top' ? 'bottom-full mb-1' : ''}`}
      style={{
        background: C.paper, color: C.ink, fontWeight: 800, fontSize: '0.75rem', boxShadow: '0 4px 10px rgba(0,0,0,.5)',
        zIndex: 60, pointerEvents: 'none',
        ...(side === 'left' ? { right: 'calc(100% + 8px)', top: '50%', marginTop: -13 } : {}),
      }}
    >
      <ItemIcon id={item} size={20} />
      {ITEM_LABEL[item]}
    </motion.span>
  )
}
