import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import {
  playerAngle, landingZone, unitPosition,
  FELT_CX, FELT_CY,
  OUTER_RX, OUTER_RY,
  SCENE_W, SCENE_H,
  useSceneScale,
} from '../../lib/tableGeometry'
import { UNIT_W, CHIP_ROW_H, BALANCE_H, UNIT_H, NamePlate } from './PlayerSlot'
import { chipStyle } from '../../lib/chipStyle'
import { FELT } from '../../theme'

interface Props {
  blurred: boolean
}

/** Овал стола: сукно, латунная нить, кожаный борт. Координаты — сцены 1300×820. */
export function FeltOval({ zIndex = 0 }: { zIndex?: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: FELT_CX - OUTER_RX,
        top: FELT_CY - OUTER_RY,
        width: OUTER_RX * 2,
        height: OUTER_RY * 2,
        borderRadius: '50%',
        zIndex,
        pointerEvents: 'none',
        background: FELT.cloth,
        border: `6px solid ${FELT.edge}`,
        boxShadow: [
          `0 0 0 2px ${FELT.trim}`,
          `0 0 0 18px ${FELT.rail}`,
          `0 0 0 19px ${FELT.trim}55`,
          '0 20px 80px rgba(0,0,0,0.9)',
          'inset 0 0 70px rgba(0,0,0,0.5)',
        ].join(', '),
      }}
    />
  )
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
        opacity: blurred ? 0.13 : 1,
        filter: blurred ? 'blur(14px)' : 'blur(0px)',
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
        <FeltOval />

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
                  style={{ ...chipStyle(denom, 28), position: 'absolute', top: -ci * 5, left: 0 }}
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
              <NamePlate name={player.name} isMe={isMe} balance={player.chips} />
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
