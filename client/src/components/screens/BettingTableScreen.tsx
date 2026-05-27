import { useState, useEffect, useRef } from 'react'
import { LayoutGroup } from 'framer-motion'
import { useGameStore, selectMe, selectIsGladiator } from '../../store/gameStore'
import { buildPhysicalChips } from '../../types/chips'
import type { PhysicalChip } from '../../types/chips'
import { PlayerSlot } from '../ui/PlayerSlot'
import { BetZone } from '../ui/BetZone'
import { Timer } from '../ui/Timer'
import { socket } from '../../socket'
import {
  playerAngle,
  landingZone,
  FELT_CX, FELT_CY,
  OUTER_RX, OUTER_RY,
  SCENE_W, SCENE_H,
} from '../../lib/tableGeometry'

export function BettingTableScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)
  const me = useGameStore(selectMe)
  const isGladiator = useGameStore(selectIsGladiator)

  const [myStack, setMyStack] = useState<PhysicalChip[]>([])
  const [placedIds, setPlacedIds] = useState<Set<string>>(new Set())
  const [pendingTarget, setPendingTarget] = useState<'win' | 'lose' | null>(null)
  const phaseRef = useRef<string>('')

  useEffect(() => {
    if (gameState.phase === 'BETTING' && me && phaseRef.current !== 'BETTING') {
      setMyStack(buildPhysicalChips(me.chips))
      setPlacedIds(new Set())
      setPendingTarget(null)
    }
    phaseRef.current = gameState.phase
  }, [gameState.phase])

  const placeChip = (id: string) => {
    setPlacedIds(prev => new Set([...prev, id]))
  }

  const recallChip = (id: string) => {
    setPlacedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const placedChips = myStack.filter(c => placedIds.has(c.id))
  const pendingBet = placedChips.reduce((a, c) => a + c.denom, 0)

  const handleConfirm = () => {
    if (pendingBet <= 0) return
    if (gameState.mode === 'gladiator' && !isGladiator && !pendingTarget) return
    socket.emit('place_bet', { amount: pendingBet, target: pendingTarget ?? undefined })
    setPlacedIds(new Set())
    setPendingTarget(null)
  }

  // Me first (i=0 → bottom), then others in game order
  const players = gameState.players
  const others = players.filter(p => p.id !== myId)
  const orderedPlayers = me ? [me, ...others] : players
  const N = orderedPlayers.length

  const isGladiatorMode = gameState.mode === 'gladiator'
  const gladiatorName = players.find(p => p.id === gameState.gladiatorId)?.name
  const canConfirm = pendingBet > 0 && (!isGladiatorMode || isGladiator || pendingTarget !== null)

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at 50% 35%, #1c1600 0%, #060606 70%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        userSelect: 'none',
      }}
    >
      {/* Timer + round info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Timer seconds={gameState.phaseTimeLeft} />
        {gameState.currentQuestion && (
          <div style={{ color: '#9ca3af', fontSize: 13 }}>
            Тема: <span style={{ color: '#fbbf24' }}>{gameState.currentQuestion.topic}</span>
          </div>
        )}
      </div>

      {/* Gladiator mode info bar */}
      {isGladiatorMode && gladiatorName && (
        <div style={{ color: '#fbbf24', fontSize: 14, letterSpacing: '0.05em' }}>
          ⚔️ Гладиатор: <strong>{gladiatorName}</strong>
          {gameState.gladiatorAnswer && (
            <span style={{ color: '#9ca3af', marginLeft: 12, fontSize: 12 }}>
              Ответ: <strong style={{ color: '#fbbf24' }}>{gameState.gladiatorAnswer}</strong>
            </span>
          )}
        </div>
      )}

      {/* Table scene */}
      <LayoutGroup>
        <div
          style={{
            position: 'relative',
            width: SCENE_W,
            height: SCENE_H,
            flexShrink: 0,
          }}
        >
          {/* Green felt */}
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            {/* Pot display */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                банк
              </div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fbbf24', marginTop: 2 }}>
                {players.reduce((a, p) => a + p.currentBet, 0) + pendingBet}
              </div>
            </div>
          </div>

          {/* Players + BetZones */}
          {orderedPlayers.map((player, i) => {
            const angle = playerAngle(i, N)
            const { cx, cy } = landingZone(angle)
            const isMe = player.id === myId
            const isThisGladiator = player.id === gameState.gladiatorId

            const betChips = isMe
              ? placedChips
              : buildPhysicalChips(player.currentBet)

            return (
              <div key={player.id}>
                <PlayerSlot
                  player={player}
                  angle={angle}
                  isMe={isMe}
                  myChips={isMe ? myStack : undefined}
                  placedIds={isMe ? placedIds : undefined}
                  onChipClick={isMe && !isThisGladiator ? placeChip : undefined}
                />
                <BetZone
                  cx={cx}
                  cy={cy}
                  chips={betChips}
                  mine={isMe}
                  onRecall={isMe ? recallChip : undefined}
                />
              </div>
            )
          })}

          {/* Gladiator self overlay — replaces chip interaction */}
          {isGladiator && isGladiatorMode && (
            <div
              style={{
                position: 'absolute',
                bottom: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                textAlign: 'center',
                zIndex: 20,
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 4 }}>⚔️</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fbbf24' }}>Ты — Гладиатор!</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4, animation: 'pulse 2s infinite' }}>
                Жди вопроса…
              </div>
            </div>
          )}
        </div>
      </LayoutGroup>

      {/* Bottom controls */}
      {!isGladiator && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {/* Gladiator target selector for crowd */}
          {isGladiatorMode && (
            <div style={{ display: 'flex', gap: 12 }}>
              {(['win', 'lose'] as const).map(target => (
                <button
                  key={target}
                  onClick={() => setPendingTarget(target)}
                  style={{
                    borderRadius: 12,
                    padding: '10px 28px',
                    border: `2px solid ${pendingTarget === target
                      ? target === 'win' ? '#4ade80' : '#f87171'
                      : '#374151'}`,
                    background: pendingTarget === target
                      ? target === 'win' ? '#14532d' : '#7f1d1d'
                      : '#111827',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: 13,
                    transition: 'all 0.15s',
                  }}
                >
                  {target === 'win' ? '👍 ОН ОТВЕТИТ' : '💀 ОН ЗАВАЛИТ'}
                </button>
              ))}
            </div>
          )}

          {/* Bet summary + confirm */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Ставка
              </div>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: '#fbbf24', fontFamily: 'monospace' }}>
                {pendingBet}
              </div>
            </div>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              style={{
                padding: '10px 32px',
                borderRadius: 12,
                border: 'none',
                background: canConfirm
                  ? 'linear-gradient(135deg, #d97706, #b45309)'
                  : '#374151',
                color: canConfirm ? '#000' : '#6b7280',
                fontWeight: 700,
                fontSize: 14,
                cursor: canConfirm ? 'pointer' : 'not-allowed',
                letterSpacing: '0.05em',
                transition: 'all 0.15s',
              }}
            >
              ✓ ПОДТВЕРДИТЬ СТАВКУ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
