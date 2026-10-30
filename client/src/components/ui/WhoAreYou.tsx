import { motion, AnimatePresence } from 'framer-motion'
import type { FriendProfile } from '@cumsino/shared'
import { useGameStore, selectMe } from '../../store/gameStore'
import { C } from '../../theme'
import { Sticker } from './Sticker'

/** Наклон наклейки от id — у каждого свой и не меняется между рендерами. */
const tilt = (id: number) => ((id % 7) - 3) * 0.8

/** Сколько должно назваться, чтобы включились вопросы про своих (server: friends.ts). */
const NEED = 2

/**
 * «Кто ты» в лобби: назваться человеком из компании (для вопросов про своих) или пропустить. Компания — наклейками
 * на столе: свободные — бумага, своя — латунь со шлепком, занятые другими — тёмные, зачёркнутые, с подписью кем.
 * Боту выбор не показывается (бот — не клиент), назвавшихся считаем только среди людей.
 */
export function WhoAreYou() {
  const gameState = useGameStore(s => s.gameState)!
  const me = useGameStore(selectMe)
  const identify = useGameStore(s => s.identify)
  const roster = gameState.friendRoster ?? []
  if (!roster.length || !me || me.bot) return null

  const takenBy = new Map(gameState.players.filter(p => p.friendId !== undefined && p.id !== me.id)
    .map(p => [p.friendId!, p.name]))
  const known = gameState.players.filter(p => p.friendId !== undefined && !p.bot).length
  const myFriend = roster.find(f => f.id === me.friendId)

  return (
    <section className="w-full flex flex-col items-center gap-4" style={{ maxWidth: '36rem' }}>
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="font-display text-[1.25rem] leading-tight" style={{ color: C.fg }}>Кто ты из компании?</span>
        <span className="text-[0.875rem]" style={{ color: C.muted }}>Для вопросов про своих. Не из компании — пропусти</span>
      </div>

      <div className="flex flex-wrap justify-center items-start gap-x-2.5 gap-y-3 px-1">
        {roster.map(f => (
          <FriendTag
            key={f.id}
            f={f}
            mine={me.friendId === f.id}
            takenBy={takenBy.get(f.id)}
            onPick={() => identify(me.friendId === f.id ? null : f.id)}
          />
        ))}
      </div>

      <div className="flex flex-col items-center gap-1.5 min-h-[3rem]">
        <AnimatePresence mode="wait" initial={false}>
          {myFriend ? (
            <motion.button
              key="skip"
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              onClick={() => identify(null)}
              className="text-[0.875rem] font-semibold underline underline-offset-4 decoration-dotted"
              style={{ color: C.muted }}
            >
              Я не {myFriend.name}
            </motion.button>
          ) : (
            <motion.span key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-[0.8125rem]" style={{ color: '#6f817a' }}>
              Тапни себя — или ничего не жми
            </motion.span>
          )}
        </AnimatePresence>
        <span className="flex items-center gap-2 text-[0.8125rem] tnum" style={{ color: known >= NEED ? C.mint : C.muted }}>
          <span className="flex gap-1">
            {Array.from({ length: NEED }, (_, i) => (
              <motion.span key={i}
                animate={{ scale: i < known ? 1 : 0.8, background: i < known ? (known >= NEED ? C.mint : C.brass) : C.line }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                style={{ width: 8, height: 8, borderRadius: 999, display: 'block' }} />
            ))}
          </span>
          {known >= NEED ? 'Вопросы про своих включены' : 'Вопросы про своих включатся, когда назовутся двое'}
        </span>
      </div>
    </section>
  )
}

function FriendTag({ f, mine, takenBy, onPick }: { f: FriendProfile; mine: boolean; takenBy?: string; onPick: () => void }) {
  const taken = !!takenBy
  const rot = tilt(f.id)
  return (
    <motion.button
      type="button"
      disabled={taken}
      onClick={onPick}
      title={taken ? `Уже выбрал ${takenBy}` : undefined}
      aria-pressed={mine}
      whileHover={taken ? undefined : { y: -4, rotate: rot > 0 ? -1.5 : 1.5 }}
      whileTap={taken ? undefined : { scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 520, damping: 20 }}
      className="relative flex flex-col items-center disabled:cursor-not-allowed"
      style={{ zIndex: mine ? 2 : 1 }}
    >
      {/* ключ по состоянию: выбрал себя — наклейка шлёпается заново, латунная */}
      <Sticker
        key={mine ? 'mine' : taken ? 'taken' : 'free'}
        seed={`friend-${f.id}`}
        slam={mine}
        rotate={mine ? rot - 2 : rot}
        jag={4}
        color={mine ? C.brass : taken ? C.panel2 : C.paper}
        textColor={mine ? C.ink : taken ? '#5d6d66' : C.ink}
        padding="7px 15px 8px"
        style={{ opacity: taken ? 0.85 : 1 }}
      >
        <span className="block font-bold text-[1rem] leading-tight whitespace-nowrap truncate"
          style={{ maxWidth: '11rem', textDecoration: taken ? 'line-through' : undefined }}>
          {f.name}
        </span>
      </Sticker>
      {mine && (
        <motion.span
          initial={{ opacity: 0, scale: 1.6, rotate: 12 }} animate={{ opacity: 1, scale: 1, rotate: 6 }}
          transition={{ delay: 0.12, type: 'spring', stiffness: 500, damping: 16 }}
          className="absolute -top-3.5 -right-3 font-display text-[0.6875rem] px-1.5 py-px rounded"
          style={{ background: C.ink, color: C.brass, boxShadow: '0 3px 8px rgba(0,0,0,.5)' }}
        >
          это я
        </motion.span>
      )}
      {taken && (
        <span className="mt-1 text-[0.6875rem] leading-none max-w-[10rem] truncate" style={{ color: C.muted }}>
          это {takenBy}
        </span>
      )}
    </motion.button>
  )
}
