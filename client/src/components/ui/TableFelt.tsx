import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import {
  playerAngle, landingZone, unitPosition,
  FELT_CX, FELT_CY,
  OUTER_RX, OUTER_RY,
  SCENE_W, SCENE_H,
  useSceneScale,
} from '../../lib/tableGeometry'
import { UNIT_W, CHIP_ROW_H, BALANCE_H, UNIT_H } from './PlayerSlot'

const CHIP_BG: Record<number, string> = {
  10:  'radial-gradient(circle at 35% 35%, #d1d5db, #6b7280)',
  20:  'radial-gradient(circle at 35% 35%, #4ade80, #15803d)',
  50:  'radial-gradient(circle at 35% 35%, #60a5fa, #1d4ed8)',
  100: 'radial-gradient(circle at 35% 35%, #f87171, #b91c1c)',
  500: 'radial-gradient(circle at 35% 35%, #374151, #030712)',
}

interface Props {
  blurred: boolean
}

export function TableFelt({ blurred }: Props) {
  const gameState = useGameStore(s => s.gameState)
  const myId = useGameStore(s => s.myId)
  const scale = useSceneScale()

  if (!gameState) return null

  const allPlayers = gameState.players
  const me = allPlayers.find(p => p.id === myId)
  const others = allPlayers.filter(p => p.id !== myId)
  const players = me ? [me, ...others] : allPlayers
  const N = players.length

  return (
    <motion.div
      animate={{
        opacity: blurred ? 0.35 : 1,
        filter: blurred ? 'blur(8px)' : 'blur(0px)',
      }}
      transition={blurred ? { duration: 0.4 } : { duration: 0.9, delay: 0.35 }}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 0,
      }}
    >
      <div style={{
        position: 'absolute',
        width: SCENE_W,
        height: SCENE_H,
        left: '50%',
        top: '50%',
        transform: `translate(-50%, -50%) scale(${scale})`,
      }}>
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

        {/* Bet chip stacks */}
        {players.map((player, i) => {
          const chips = player.betChips
          if (!chips?.length) return null
          const angle = playerAngle(i, N)
          const zone = landingZone(angle)
          return (
            <div key={`chips-${player.id}`} style={{ position: 'absolute', left: zone.cx - 14, top: zone.cy - 14 }}>
              {chips.map((denom, ci) => (
                <div
                  key={ci}
                  style={{
                    position: 'absolute',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: CHIP_BG[denom] ?? CHIP_BG[100],
                    border: '2px solid rgba(255,255,255,0.18)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.7)',
                    top: -ci * 5,
                    left: 0,
                  }}
                />
              ))}
            </div>
          )
        })}

        {/* Player name cards — same ordering and positioning as BettingTableScreen/PlayerSlot */}
        {players.map((player, i) => {
          const angle = playerAngle(i, N)
          const { left: unitLeft, top: unitTop } = unitPosition(angle, UNIT_W, UNIT_H, 0)
          const isMe = player.id === myId
          return (
            <div
              key={player.id}
              style={{
                position: 'absolute',
                left: unitLeft,
                top: unitTop + CHIP_ROW_H + BALANCE_H + 8,
                width: UNIT_W,
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <div style={{
                background: isMe ? '#100e00' : 'linear-gradient(135deg,#121212,#0a0a0a)',
                border: `1.5px solid ${isMe ? '#fbbf24' : '#333'}`,
                borderRadius: 8,
                padding: '5px 14px',
                color: isMe ? '#fbbf24' : '#aaa',
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                maxWidth: UNIT_W,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                boxShadow: isMe
                  ? '0 0 18px rgba(251,191,36,0.12), 0 4px 24px rgba(0,0,0,0.8)'
                  : '0 4px 24px rgba(0,0,0,0.8)',
              }}>
                {player.name}
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
