import { useState, useEffect, useRef } from 'react'
import { LayoutGroup } from 'framer-motion'
import { useGameStore, selectMe, selectIsGladiator } from '../../store/gameStore'
import { buildPhysicalChips, buildChipsForPlayer } from '../../types/chips'
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
  const stagedBets = useGameStore(s => s.stagedBets)

  const [myStack, setMyStack] = useState<PhysicalChip[]>([])
  const [placedIds, setPlacedIds] = useState<Set<string>>(new Set())
  const [betConfirmed, setBetConfirmed] = useState(false)
  const [pendingTarget, setPendingTarget] = useState<'win' | 'lose' | null>(null)
  const [bankBetTarget, setBankBetTarget] = useState<number | null>(null)
  const [bankBetAmount, setBankBetAmount] = useState(0)
  const phaseRef = useRef<string>('')

  useEffect(() => {
    if (gameState.phase === 'BETTING' && me && phaseRef.current !== 'BETTING') {
      setMyStack(buildPhysicalChips(me.chips))
      setPlacedIds(new Set())
      setBetConfirmed(false)
      setPendingTarget(null)
      setBankBetTarget(null)
      setBankBetAmount(0)
    }
    phaseRef.current = gameState.phase
  }, [gameState.phase])

  const placeChip = (denom: number) => {
    if (betConfirmed) return
    // Find last unplaced chip with this denom (top of visual stack) and place it
    const unplaced = myStack.filter(c => c.denom === denom && !placedIds.has(c.id))
    const chip = unplaced[unplaced.length - 1]
    if (chip) {
      setPlacedIds(prev => new Set([...prev, chip.id]))
      const newAmount = pendingBet + denom
      socket.emit('stage_chip', { amount: newAmount })
    }
  }

  const recallChip = (id: string) => {
    if (betConfirmed) return
    const chip = myStack.find(c => c.id === id)
    setPlacedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    const newAmount = pendingBet - (chip?.denom ?? 0)
    socket.emit('stage_chip', { amount: Math.max(0, newAmount) })
  }

  const placedChips = myStack.filter(c => placedIds.has(c.id))
  const pendingBet = placedChips.reduce((a, c) => a + c.denom, 0)

  const handleConfirm = () => {
    if (pendingBet <= 0) return
    if (isKerriMode && !isGladiator && !pendingTarget) return
    socket.emit('place_bet', { amount: pendingBet, target: pendingTarget ?? undefined })
    if (isKerriMode && !isGladiator && bankBetTarget !== null && bankBetAmount > 0) {
      socket.emit('place_bank_bet', { optionIndex: bankBetTarget, amount: bankBetAmount })
    }
    // Не сбрасываем placedIds — фишки остаются в BetZone как "подтверждённые"
    setBetConfirmed(true)
  }

  const players = gameState.players
  const others = players.filter(p => p.id !== myId)
  const orderedPlayers = me ? [me, ...others] : players
  const N = orderedPlayers.length

  const isKerriMode = gameState.mode === 'kerri'
  const gladiatorName = players.find(p => p.id === gameState.gladiatorId)?.name
  const canConfirm = !betConfirmed && pendingBet > 0 && (!isKerriMode || isGladiator || pendingTarget !== null)

  // Банк: подтверждённые ставки всех + мой незакреплённый пендинг
  // После betConfirmed мой bet уже в player.currentBet через bet_updated, не двоим
  const bankTotal = players.reduce((a, p) => a + p.currentBet, 0) + (betConfirmed ? 0 : pendingBet)

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

      {/* Kerri mode info bar */}
      {isKerriMode && gladiatorName && (
        <div style={{ color: '#fbbf24', fontSize: 14, letterSpacing: '0.05em' }}>
          🎯 Керри: <strong>{gladiatorName}</strong>
          {gameState.gladiatorAnswer && (
            <span style={{ color: '#9ca3af', marginLeft: 12, fontSize: 12 }}>
              Ответ: <strong style={{ color: '#fbbf24' }}>{gameState.gladiatorAnswer}</strong>
            </span>
          )}
        </div>
      )}

      {/* Question panel for crowd in kerri mode */}
      {isKerriMode && !isGladiator && gameState.currentQuestion && (
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#e5e7eb', marginBottom: 8, lineHeight: 1.5 }}>
            {gameState.currentQuestion.text}
          </div>
          {gameState.currentQuestion.options && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {gameState.currentQuestion.options.map((opt, idx) => {
                const isCorrect = opt === gameState.gladiatorAnswer
                return (
                  <div
                    key={idx}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                      border: `1px solid ${isCorrect ? '#4ade80' : '#374151'}`,
                      color: isCorrect ? '#4ade80' : '#6b7280',
                      background: isCorrect ? '#052e16' : 'transparent',
                    }}
                  >
                    {isCorrect ? '✓ ' : ''}{opt}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Table scene */}
      <div style={{ width: SCENE_W * 1.25, height: SCENE_H * 1.25, flexShrink: 0, position: 'relative' }}>
      <LayoutGroup>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: SCENE_W,
            height: SCENE_H,
            transform: 'scale(1.25)',
            transformOrigin: 'top left',
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
            {isGladiator && isKerriMode ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 2 }}>🎯</div>
                <div style={{ fontSize: 15, fontWeight: 'bold', color: '#fbbf24' }}>Ты — Керри!</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>Жди вопроса…</div>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                  банк
                </div>
                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fbbf24', marginTop: 2 }}>
                  {bankTotal}
                </div>
              </div>
            )}
          </div>

          {/* Players + BetZones */}
          {orderedPlayers.map((player, i) => {
            const angle = playerAngle(i, N)
            const { cx, cy } = landingZone(angle)
            const isMe = player.id === myId
            const isThisGladiator = player.id === gameState.gladiatorId

            // Для меня: неподтверждённые фишки в BetZone до confirm, затем они остаются там locked
            // Для других: staged amount if available (live preview), else confirmed bet
            const betChips = isMe
              ? placedChips
              : buildChipsForPlayer(player.id, stagedBets[player.id] ?? player.currentBet)

            return (
              <div key={player.id}>
                <PlayerSlot
                  player={player}
                  angle={angle}
                  isMe={isMe}
                  myChips={isMe ? myStack : undefined}
                  placedIds={isMe ? placedIds : undefined}
                  onDenomClick={isMe && !isThisGladiator && !betConfirmed ? placeChip : undefined}
                />
                <BetZone
                  cx={cx}
                  cy={cy}
                  chips={betChips}
                  mine={isMe && !betConfirmed}
                  onRecall={isMe && !betConfirmed ? recallChip : undefined}
                />
              </div>
            )
          })}

        </div>
      </LayoutGroup>
      </div>

      {/* Bottom controls */}
      {!isGladiator && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {/* WIN/LOSE selector (kerri mode crowd only) */}
          {isKerriMode && !betConfirmed && (
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

          {/* Bank bet section — Ставка на вариант (x4) */}
          {isKerriMode && !isGladiator && !betConfirmed && gameState.currentQuestion?.options && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Ставка на вариант (×4)
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 400 }}>
                {gameState.currentQuestion.options.map((opt, idx) => {
                  const isCorrect = opt === gameState.gladiatorAnswer
                  const isSelected = bankBetTarget === idx
                  return (
                    <button
                      key={idx}
                      onClick={isCorrect ? undefined : () => setBankBetTarget(isSelected ? null : idx)}
                      disabled={isCorrect}
                      style={{
                        padding: '6px 16px',
                        borderRadius: 8,
                        border: `2px solid ${isCorrect ? '#4ade80' : isSelected ? '#fbbf24' : '#374151'}`,
                        background: isCorrect ? '#052e16' : isSelected ? '#1a1200' : '#111827',
                        color: isCorrect ? '#4ade80' : isSelected ? '#fbbf24' : '#9ca3af',
                        fontSize: 12,
                        cursor: isCorrect ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s',
                        maxWidth: 180,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isCorrect ? '✓ ' : ''}{opt}
                    </button>
                  )
                })}
              </div>

              {bankBetTarget !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>Сумма:</span>
                  <span style={{ fontSize: 16, fontWeight: 'bold', color: '#fbbf24', fontFamily: 'monospace', minWidth: 36, textAlign: 'center' }}>
                    {bankBetAmount}
                  </span>
                  {([10, 20, 50, 100] as const).map(d => {
                    const maxBet = Math.max(0, (me?.chips ?? 0) - pendingBet)
                    const canAdd = bankBetAmount + d <= maxBet
                    return (
                      <button
                        key={d}
                        onClick={() => canAdd && setBankBetAmount(a => a + d)}
                        disabled={!canAdd}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          border: `1px solid ${canAdd ? '#374151' : '#1f2937'}`,
                          background: canAdd ? '#1f2937' : '#111',
                          color: canAdd ? '#d1d5db' : '#4b5563',
                          fontSize: 11,
                          cursor: canAdd ? 'pointer' : 'not-allowed',
                        }}
                      >
                        +{d}
                      </button>
                    )
                  })}
                  {bankBetAmount > 0 && (
                    <button
                      onClick={() => setBankBetAmount(0)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: '1px solid #374151',
                        background: '#1f2937',
                        color: '#f87171',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      −все
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Bet summary + confirm */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {betConfirmed ? (
              <div style={{
                padding: '10px 32px',
                borderRadius: 12,
                background: '#14532d',
                border: '2px solid #4ade80',
                color: '#4ade80',
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: '0.05em',
              }}>
                ✓ СТАВКА {pendingBet} ПРИНЯТА
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
