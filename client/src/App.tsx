import { useEffect, useRef, useState } from 'react'
import { useGameStore, selectIsGladiator } from './store/gameStore'
import { JoinScreen } from './components/screens/JoinScreen'
import { screenFor } from './components/screens/screenFor'
import { LateJoinScreen } from './components/screens/LateJoinScreen'
import { AnimatePresence, motion } from 'framer-motion'
import { TableFelt } from './components/ui/TableFelt'
import { ItemBar } from './components/ui/ItemBar'
import { Notice } from './components/ui/Notice'
import { useCompactBetting } from './lib/tableGeometry'

export default function App() {
  const gameState = useGameStore(s => s.gameState)
  const isGladiator = useGameStore(selectIsGladiator)
  const isLateJoiner = useGameStore(s => s.isLateJoiner)
  // на телефоне ставки — колонкой (CompactBetting), стол за ней не нужен: фон остаётся размытым
  const compact = useCompactBetting()
  const phase = gameState?.phase
  // Старый экран уходит анимацией Framer Motion; в фоновой вкладке (альт-таб) она может не доиграть, и он остаётся на
  // сцене вместе с новым (анонс с темой «залипает» поверх вопроса). Сторож: через 1.2 с после смены фазы и при
  // возврате на вкладку старые экраны (data-phase не текущей фазы) прячутся. Пересоздавать AnimatePresence сразу нельзя:
  // на медленной машине уход длится дольше 1.2 с, и пересоздание проигрывало текущий экран заново (лавка, «кто ближе»
  // появлялись дважды) и сбрасывало его состояние. Пересоздание — только если старый экран завис на 10 с.
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageGen, setStageGen] = useState(0)
  useEffect(() => {
    const stale = () => [...(stageRef.current?.querySelectorAll<HTMLElement>(':scope > [data-screen]') ?? [])]
      .filter(el => el.dataset.phase !== phase)
    const hide = () => stale().forEach(el => { el.style.visibility = 'hidden' })
    const t = setTimeout(hide, 1200)
    const stuck = setTimeout(() => { if (stale().length) setStageGen(g => g + 1) }, 10_000)
    // возврат на вкладку — прятать сразу, до первого кадра (иначе мелькает старый экран, например стол ставок)
    const onVisible = () => { if (document.visibilityState === 'visible') hide() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(t); clearTimeout(stuck); document.removeEventListener('visibilitychange', onVisible) }
  }, [phase])

  useEffect(() => {
    if (!gameState) return
    const id = setInterval(() => {
      fetch((import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001') + '/health').catch(() => {})
    }, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [!!gameState])

  if (!gameState) return <JoinScreen />

  if (isLateJoiner) return (
    <div className="stage" style={{ height: '100dvh', overflow: 'hidden', position: 'relative' }}>
      <AnimatePresence>
        <motion.div key="late-join" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>
          <LateJoinScreen />
        </motion.div>
      </AnimatePresence>
    </div>
  )

  const Screen = screenFor(gameState.phase, gameState.mode, isGladiator)
  // фаза сменилась в свёрнутой вкладке: кадры анимаций там не идут — без анимаций, старый экран прячется правилом сразу
  const hidden = typeof document !== 'undefined' && document.hidden

  return (
    <div ref={stageRef} className="stage" style={{ height: '100dvh', overflow: 'hidden', position: 'relative' }}>
      <TableFelt blurred={gameState.phase !== 'BETTING' || compact} />
      {hidden && <style>{`.stage > [data-screen]:not([data-phase="${gameState.phase}"]) { visibility: hidden }`}</style>}
      <AnimatePresence key={stageGen} custom={hidden}>
        <motion.div
          key={gameState.phase}
          data-screen
          data-phase={gameState.phase}
          initial={hidden ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          // custom приходит от AnimatePresence в момент ухода (а не из последнего рендера экрана)
          variants={{ exit: (instant: boolean) => ({ opacity: 0, y: -12, pointerEvents: 'none', transition: { duration: instant ? 0 : 0.15 } }) }}
          exit="exit"
          transition={{ duration: 0.4 }}
          style={{ position: 'absolute', inset: 0, overflowY: 'auto', pointerEvents: 'auto' }}
        >
          <Screen />
        </motion.div>
      </AnimatePresence>
      <ItemBar />
      <Notice />
    </div>
  )
}
