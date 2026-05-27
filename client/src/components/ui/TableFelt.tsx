import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import {
  playerAngle, cardAnchor,
  FELT_CX, FELT_CY,
  OUTER_RX, OUTER_RY,
  SCENE_W, SCENE_H,
} from '../../lib/tableGeometry'

interface Props {
  blurred: boolean
}

export function TableFelt({ blurred }: Props) {
  const gameState = useGameStore(s => s.gameState)
  const myId = useGameStore(s => s.myId)

  if (!gameState) return null

  const players = gameState.players
  const N = players.length

  return (
    <motion.div
      animate={{
        opacity: blurred ? 0.35 : 1,
        filter: blurred ? 'blur(8px)' : 'blur(0px)',
      }}
      transition={{ duration: 0.4 }}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 0,
      }}
    >
      <div style={{ position: 'relative', width: SCENE_W, height: SCENE_H }}>
        {/* Green felt ellipse */}
        <div
          style={{
            position: 'absolute',
            left: FELT_CX - OUTER_RX,
            top: FELT_CY - OUTER_RY,
            width: OUTER_RX * 2,
            height: OUTER_RY * 2,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at 35% 38%, #278320 0%, #0e4a0a 55%, #071e06 100%)',
            border: '9px solid #071507',
            boxShadow: [
              '0 0 0 14px #3d2600',
              '0 0 0 18px #1a1000',
              '0 10px 80px rgba(0,0,0,0.98)',
              'inset 0 0 60px rgba(0,0,0,0.55)',
            ].join(', '),
          }}
        />

        {/* Player name cards */}
        {players.map((player, i) => {
          const angle = playerAngle(i, N)
          const anchor = cardAnchor(angle)
          const isMe = player.id === myId
          return (
            <div
              key={player.id}
              style={{
                position: 'absolute',
                left: anchor.x - 55,
                top: anchor.y - 15,
                background: isMe ? '#100e00' : 'linear-gradient(135deg,#121212,#0a0a0a)',
                border: `1.5px solid ${isMe ? '#fbbf24' : '#333'}`,
                borderRadius: 8,
                padding: '4px 12px',
                color: isMe ? '#fbbf24' : '#aaa',
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                boxShadow: isMe
                  ? '0 0 18px rgba(251,191,36,0.12), 0 4px 24px rgba(0,0,0,0.8)'
                  : '0 4px 24px rgba(0,0,0,0.8)',
              }}
            >
              {player.name}
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
