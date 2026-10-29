import { motion } from 'framer-motion'
import { useGameStore, selectMe } from '../../store/gameStore'
import { C } from '../../theme'

/** «Кто ты» в лобби: назваться человеком из компании (для вопросов про друзей) или пропустить. */
export function WhoAreYou() {
  const gameState = useGameStore(s => s.gameState)!
  const me = useGameStore(selectMe)
  const identify = useGameStore(s => s.identify)
  const roster = gameState.friendRoster ?? []
  if (!roster.length || !me) return null

  const takenBy = new Map(gameState.players.filter(p => p.friendId !== undefined && p.id !== me.id)
    .map(p => [p.friendId!, p.name]))
  const known = gameState.players.filter(p => p.friendId !== undefined).length

  return (
    <div className="w-full max-w-xl flex flex-col items-center gap-3">
      <span className="text-sm text-center" style={{ color: C.muted }}>
        Кто ты из компании? Для вопросов про своих, можно не выбирать
      </span>
      <div className="flex flex-wrap justify-center gap-2">
        {roster.map(f => {
          const mine = me.friendId === f.id
          const taken = takenBy.get(f.id)
          return (
            <motion.button
              key={f.id}
              disabled={!!taken}
              whileTap={{ scale: 0.94 }}
              onClick={() => identify(mine ? null : f.id)}
              title={taken ? `уже выбрал ${taken}` : undefined}
              className="px-3.5 h-10 rounded-full text-[0.9375rem] font-semibold transition-colors disabled:cursor-not-allowed"
              style={{
                background: mine ? C.brass : 'transparent',
                color: mine ? C.ink : taken ? '#4b5a54' : C.fg,
                border: `2px solid ${mine ? C.brass : C.line}`,
                textDecoration: taken ? 'line-through' : undefined,
              }}
            >
              {f.name}
            </motion.button>
          )
        })}
      </div>
      <span className="text-[0.8125rem] tnum" style={{ color: known >= 2 ? C.mint : C.muted }}>
        {known >= 2 ? 'Вопросы про своих включены' : `Вопросы про своих включатся, когда назовутся двое (сейчас ${known})`}
      </span>
    </div>
  )
}
