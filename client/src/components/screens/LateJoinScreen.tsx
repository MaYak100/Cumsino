import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'

export function LateJoinScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 24,
    }}>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ textAlign: 'center' }}
      >
        <div style={{ fontSize: 22, fontWeight: 'bold', color: '#fbbf24', marginBottom: 6 }}>
          ИГРА ИДЁТ
        </div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          Ждём нового раунда…
        </div>
      </motion.div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', maxWidth: 480 }}>
        {gameState.players.map((player, i) => {
          const isMe = player.id === myId
          return (
            <motion.div
              key={player.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              style={{
                background: '#1a2e1a',
                border: `1px solid ${isMe ? '#fbbf24' : '#2d4d2d'}`,
                borderRadius: 12,
                padding: '12px 20px',
                minWidth: 140,
                textAlign: 'center',
              }}
            >
              <div style={{ fontWeight: 'bold', color: isMe ? '#fbbf24' : '#e5e7eb', fontSize: 14 }}>
                {player.name} {isMe && '(ты)'}
              </div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#4ade80', marginTop: 4 }}>
                {player.chips}
              </div>
              <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                фишек
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
