import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { C } from '../../theme'

/** Кто уже ответил: имя заливается цветом режима. */
export function AnswerProgress({ color, only }: { color: string; only?: string[] }) {
  const players = useGameStore(s => s.gameState?.players ?? [])
  const answeredIds = useGameStore(s => s.answeredIds)
  const myId = useGameStore(s => s.myId)
  const list = only ? players.filter(p => only.includes(p.id)) : players

  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {list.map(p => {
        const done = answeredIds.has(p.id)
        return (
          <motion.span
            key={p.id}
            animate={done ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={{ duration: 0.3 }}
            className="text-[13px] font-semibold rounded-full px-2.5 py-0.5"
            style={{
              background: done ? color : 'transparent',
              color: done ? C.ink : C.muted,
              border: `1.5px ${done ? 'solid' : 'dashed'} ${done ? color : C.line}`,
              transition: 'background-color .2s, color .2s',
            }}
          >
            {p.id === myId ? 'Ты' : p.name}
          </motion.span>
        )
      })}
    </div>
  )
}
