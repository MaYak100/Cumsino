// client/src/dev/DevPage.tsx
import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { TableFelt } from '../components/ui/TableFelt'
import { SCENARIOS, type Scenario } from './mockStates'

const GROUPS = [...new Set(SCENARIOS.map(s => s.group))]

export function DevPage() {
  const [collapsed, setCollapsed] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)

  function activate(scenario: Scenario) {
    useGameStore.setState(scenario.state)
    setActiveId(scenario.id)
    setCollapsed(true)
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
            <TableFelt blurred={!active.withFelt} />
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
