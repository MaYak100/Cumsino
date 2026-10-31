import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useGameStore, selectIsGladiator } from './store/gameStore'
import { JoinScreen } from './components/screens/JoinScreen'
import { screenFor } from './components/screens/screenFor'
import { LateJoinScreen } from './components/screens/LateJoinScreen'
import { TableFelt } from './components/ui/TableFelt'
import { ItemBar } from './components/ui/ItemBar'
import { Notice } from './components/ui/Notice'
import { Logo } from './components/ui/Logo'
import { useCompactBetting } from './lib/tableGeometry'
import { C, DISPLAY } from './theme'

export default function App() {
  const gameState = useGameStore(s => s.gameState)
  const isGladiator = useGameStore(selectIsGladiator)
  const isLateJoiner = useGameStore(s => s.isLateJoiner)
  const replaced = useGameStore(s => s.replaced)
  const joinError = useGameStore(s => s.joinError)
  // перезагрузка страницы посреди игры: вкладка помнит игру — сразу обратно, без экрана входа
  const [resuming] = useState(() => useGameStore.getState().resumeActive())
  // на телефоне ставки — колонкой (CompactBetting), стол за ней не нужен: фон остаётся размытым
  const compact = useCompactBetting()

  useEffect(() => {
    if (!gameState) return
    const id = setInterval(() => {
      fetch((import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001') + '/health').catch(() => {})
    }, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [!!gameState])

  if (replaced) return <ReplacedScreen />
  if (!gameState) return resuming && !joinError ? <ResumingScreen /> : <JoinScreen />

  if (isLateJoiner) return (
    <div className="stage" style={{ height: '100dvh', overflow: 'hidden', position: 'relative' }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
        style={{ position: 'absolute', inset: 0, overflowY: 'auto', pointerEvents: 'auto' }}>
        <LateJoinScreen />
      </motion.div>
      <ConnectionBadge />
    </div>
  )

  const Screen = screenFor(gameState.phase, gameState.mode, isGladiator)

  // Экран фазы только появляется (без анимации ухода): старый исчезает сразу. Раньше уход старого экрана мог не
  // доиграть в фоновой вкладке, и его приходилось прятать и пересоздавать сцену — экраны и анимации «перезагружались».
  // Ключ — фаза: внутри фазы экран не перемонтируется ни от чего (вход / обрыв других игроков, новый game_state).
  return (
    <div className="stage" style={{ height: '100dvh', overflow: 'hidden', position: 'relative' }}>
      <TableFelt blurred={gameState.phase !== 'BETTING' || compact} />
      <motion.div
        key={`${gameState.roundIndex}-${gameState.phase}`}
        data-screen
        data-phase={gameState.phase}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        // Framer Motion 11 ставит pointer-events: none элементу с initial opacity 0 — поля и кнопки его наследуют
        style={{ position: 'absolute', inset: 0, overflowY: 'auto', pointerEvents: 'auto' }}
      >
        <Screen />
      </motion.div>
      <ItemBar />
      <Notice />
      <ConnectionBadge />
    </div>
  )
}

/** Связь пропала: игра ждёт тебя «не в сети» (фишки и ставка на месте), сокет переподключается сам. */
function ConnectionBadge() {
  const connected = useGameStore(s => s.connected)
  // короткий обрыв (доли секунды) не мигаем: плашка — если связи нет дольше секунды
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (connected) { setShow(false); return }
    const t = setTimeout(() => setShow(true), 1000)
    return () => clearTimeout(t)
  }, [connected])
  if (!show) return null
  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-3 z-[100] rounded-full px-4 py-1.5 text-sm font-semibold"
      style={{ background: C.panel, color: C.brass, border: `1px solid ${C.brass}` }}>
      Нет связи — переподключаемся. Твои фишки и ставка на месте
    </div>
  )
}

function ResumingScreen() {
  return (
    <div className="stage min-h-dvh flex flex-col items-center justify-center gap-6 p-4">
      <Logo size={48} animated />
      <div style={{ color: C.muted }}>Возвращаемся в игру…</div>
    </div>
  )
}

/** Эту игру открыли в другой вкладке или на другом устройстве — здесь она остановлена. */
function ReplacedScreen() {
  const takeOver = useGameStore(s => s.takeOver)
  const reset = useGameStore(s => s.reset)
  return (
    <div className="stage min-h-dvh flex flex-col items-center justify-center gap-6 p-4 text-center">
      <Logo size={40} />
      <div style={{ fontFamily: DISPLAY, fontSize: '1.5rem' }}>Игра открыта в другом окне</div>
      <div style={{ color: C.muted }}>Здесь она остановлена, чтобы ты не играл за себя дважды</div>
      <div className="flex gap-3">
        <button onClick={takeOver} className="rounded-xl px-5 py-2.5 font-semibold" style={{ background: C.brass, color: C.ink }}>
          Играть здесь
        </button>
        <button onClick={reset} className="rounded-xl px-5 py-2.5" style={{ border: `1px solid ${C.line}`, color: C.muted }}>
          Выйти
        </button>
      </div>
    </div>
  )
}
