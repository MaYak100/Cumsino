// client/src/dev/DevPage.tsx
import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { TableFelt } from '../components/ui/TableFelt'
import { SCENARIOS, PLAYER_POOL, type Scenario, type ScenarioState } from './mockStates'

function refreshDynamic(state: ScenarioState): ScenarioState {
  const now = Date.now()
  return {
    ...state,
    ...(state.bribePrompt ? { bribePrompt: { ...state.bribePrompt, startedAt: now } } : {}),
    ...(state.gladiatorBribeMsg ? { gladiatorBribeMsg: { ...state.gladiatorBribeMsg, key: now } } : {}),
  }
}

const GROUPS = [...new Set(SCENARIOS.map(s => s.group))]

function applyCount(scenario: Scenario, count: number): ScenarioState {
  if (!scenario.state.gameState) return scenario.state
  const orig = scenario.state.gameState.players ?? []
  const patched = Array.from({ length: count }, (_, i) =>
    orig[i] ?? { ...PLAYER_POOL[i] }
  )
  return {
    ...scenario.state,
    gameState: { ...scenario.state.gameState, players: patched },
  }
}

export function DevPage() {
  const [collapsed, setCollapsed] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [playerCount, setPlayerCount] = useState(4)

  function activate(scenario: Scenario, count = playerCount) {
    useGameStore.setState(refreshDynamic(applyCount(scenario, count)))
    setActiveId(scenario.id)
    setCollapsed(true)
  }

  function changeCount(count: number) {
    setPlayerCount(count)
    const active = SCENARIOS.find(s => s.id === activeId)
    if (active) useGameStore.setState(refreshDynamic(applyCount(active, count)))
  }

  const active = SCENARIOS.find(s => s.id === activeId)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div style={{
        width: collapsed ? 32 : 220,
        flexShrink: 0,
        background: '#0a0a0a',
        borderRight: '1px solid #1a2a1a',
        transition: 'width 0.18s ease',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
      }}>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            padding: '8px 7px',
            color: '#555',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            flexShrink: 0,
            textAlign: 'left',
          }}
        >
          ≡
        </button>

        <div style={{
          overflowY: 'auto',
          flex: 1,
          opacity: collapsed ? 0 : 1,
          transition: 'opacity 0.1s',
          pointerEvents: collapsed ? 'none' : 'auto',
        }}>

          {/* Player count control */}
          <div style={{
            padding: '8px 10px 10px',
            borderBottom: '1px solid #1a2a1a',
            marginBottom: 6,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 'bold', letterSpacing: 2,
              textTransform: 'uppercase', color: '#333',
              fontFamily: 'monospace', marginBottom: 6,
            }}>
              Игроки
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => changeCount(Math.max(2, playerCount - 1))}
                style={{
                  width: 22, height: 22, borderRadius: 4,
                  background: '#111', border: '1px solid #2a2a2a',
                  color: '#777', fontSize: 14, lineHeight: 1,
                  cursor: 'pointer', flexShrink: 0,
                }}
              >−</button>
              <div style={{
                flex: 1, textAlign: 'center',
                fontFamily: 'monospace', fontSize: 14,
                fontWeight: 'bold', color: '#fbbf24',
              }}>
                {playerCount}
              </div>
              <button
                onClick={() => changeCount(Math.min(10, playerCount + 1))}
                style={{
                  width: 22, height: 22, borderRadius: 4,
                  background: '#111', border: '1px solid #2a2a2a',
                  color: '#777', fontSize: 14, lineHeight: 1,
                  cursor: 'pointer', flexShrink: 0,
                }}
              >+</button>
            </div>
            <input
              type="range" min={2} max={10} value={playerCount}
              onChange={e => changeCount(Number(e.target.value))}
              style={{ width: '100%', marginTop: 6, accentColor: '#fbbf24' }}
            />
          </div>

          {GROUPS.map(group => (
            <div key={group} style={{ marginBottom: 8 }}>
              <div style={{
                padding: '4px 10px 2px',
                color: '#333',
                fontSize: 10,
                fontWeight: 'bold',
                letterSpacing: 2,
                textTransform: 'uppercase',
                userSelect: 'none',
                fontFamily: 'monospace',
              }}>
                {group}
              </div>
              {SCENARIOS.filter(s => s.group === group).map(s => (
                <button
                  key={s.id}
                  onClick={() => activate(s)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '5px 12px',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: activeId === s.id ? '#fbbf24' : '#777',
                    background: activeId === s.id ? 'rgba(251,191,36,0.07)' : 'transparent',
                    border: 'none',
                    borderLeft: `2px solid ${activeId === s.id ? '#fbbf24' : 'transparent'}`,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Game area ───────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        background: '#060606',
      }}>
        {active ? (
          <>
            {!active.withFelt && <TableFelt blurred={true} />}
            {(() => { const Screen = active.Screen; return <Screen /> })()}
          </>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#2a2a2a',
            fontSize: 13,
            fontFamily: 'monospace',
          }}>
            ≡ выбери сценарий
          </div>
        )}
      </div>

    </div>
  )
}
