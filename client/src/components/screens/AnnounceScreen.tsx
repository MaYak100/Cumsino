import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { Timer } from '../ui/Timer'

const MODE_LABELS: Record<string, string> = {
  all: 'ВОПРОС ДЛЯ ВСЕХ',
  kerri: 'КЕРРИ',
  closest: 'КТО БЛИЖЕ',
  top5: 'ТОП 5',
}

const MODE_DESCRIPTIONS: Record<string, string> = {
  all: 'Все отвечают — выигравшие делят банк проигравших',
  kerri: 'Один несёт ответственность — остальные ставят на исход',
  closest: 'Угадай ближе всех — забираешь банк',
  top5: 'Назови пятёрку',
}

export function AnnounceScreen() {
  const gameState = useGameStore(s => s.gameState)!

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', gap: 4 }}>
      <Timer seconds={gameState.phaseTimeLeft} />

      {/* Block 1: label "РЕЖИМ" — appears at t=0 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0, duration: 0.4 }}
        style={{ marginTop: 32 }}
      >
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#9ca3af' }}>
          Режим
        </div>
      </motion.div>

      {/* Block 2: mode name + description — appears at t=0.2s */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        style={{ marginBottom: 8 }}
      >
        <div style={{ fontSize: 36, fontWeight: 'bold', color: '#fbbf24', marginBottom: 6 }}>
          {MODE_LABELS[gameState.mode] ?? gameState.mode}
        </div>
        <div style={{ fontSize: 14, color: '#9ca3af' }}>
          {MODE_DESCRIPTIONS[gameState.mode] ?? ''}
        </div>
      </motion.div>

      {/* Block 3: topic — appears at t=1.0s */}
      {gameState.currentQuestion && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0, duration: 0.4 }}
          style={{ marginTop: 16 }}
        >
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#9ca3af', marginBottom: 6 }}>
            Тема
          </div>
          <div style={{
            background: '#1a2e1a',
            border: '1px solid #2d4d2d',
            borderRadius: 16,
            padding: '16px 32px',
          }}>
            <div style={{ fontSize: 22, color: '#ffffff' }}>
              {gameState.currentQuestion.topic}
            </div>
          </div>
        </motion.div>
      )}

      {/* "Готовься к ставкам" — all modes now go through BETTING */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.4 }}
        style={{ marginTop: 24, color: '#6b7280', fontSize: 13 }}
      >
        Готовься к ставкам…
      </motion.p>
    </div>
  )
}
