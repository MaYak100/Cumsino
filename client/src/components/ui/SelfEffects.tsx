import { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ItemId } from '@cumsino/shared'
import { useGameStore, selectMe } from '../../store/gameStore'
import { C } from '../../theme'
import { ItemIcon } from './ItemIcon'

/** Что сейчас действует на тебя — наклейками в шапке экрана вопроса (справа над вопросом). */
export function SelfEffects({ hexLeft }: { hexLeft?: number }) {
  const me = useGameStore(selectMe)
  const gemmedOnMe = useGameStore(s => s.gemmedOnMe)
  const fx = me?.effects ?? []
  const smoked = fx.includes('smoke')

  // Гем в смоке ответа не видит: сервер шлёт цели то же «на тебя смотрели», но смотревший получил пустоту. Запоминаем,
  // был ли хоть один гем, пока ты был не в смоке (смок держится до конца раунда — гем после него всегда мимо).
  // Экран смонтировался уже после гема — судим по смоку сейчас.
  const gems = useRef({ count: gemmedOnMe, exposed: gemmedOnMe > 0 && !smoked })
  if (gemmedOnMe !== gems.current.count) {
    gems.current = {
      count: gemmedOnMe,
      exposed: gemmedOnMe === 0 ? false : gems.current.exposed || (gemmedOnMe > gems.current.count && !smoked),
    }
  }

  const tags: Array<{ key: string; item: ItemId; text: string; hot?: boolean }> = []
  if (hexLeft !== undefined) tags.push({ key: 'hex', item: 'hex', text: hexLeft > 0 ? 'Ты в хексе' : 'Время вышло', hot: true })
  if (gemmedOnMe > 0) tags.push(gems.current.exposed
    ? { key: 'gem', item: 'gem', text: 'Твой ответ просветили', hot: true }
    : { key: 'gem-smoke', item: 'gem', text: 'Твой ответ пытались просветить' })
  if (smoked) tags.push({ key: 'smoke', item: 'smoke', text: 'Ты в смоке' })
  if (fx.includes('bkb')) tags.push({ key: 'bkb', item: 'bkb', text: 'BKB включён' })

  return (
    <div className="ml-auto flex flex-wrap justify-end gap-2">
      <AnimatePresence>
        {tags.map((t, i) => (
          <motion.span
            key={t.key}
            initial={{ scale: 1.8, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: i % 2 ? 2 : -3 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            className="flex items-center gap-1.5 font-bold rounded-lg pl-1 pr-3 py-0.5 whitespace-nowrap"
            style={{ background: C.paper, color: t.hot ? '#b8264b' : C.ink, boxShadow: '0 4px 10px rgba(0,0,0,.45)' }}
          >
            <ItemIcon id={t.item} size={30} />
            {t.text}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  )
}
