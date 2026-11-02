import { useGameStore } from '../../store/gameStore'
import { C, DISPLAY } from '../../theme'

/** Только хосту: игрок давно без связи (≥ 60 с или пропустил раунд) — кикнуть (его фишки в джекпот) или ждать ещё раунд.
 *  Не модалка: висит сверху, игра идёт. Сервер спрашивает на итогах раунда (GameState.offlineAsk). */
export function OfflineAsk() {
  const ask = useGameStore(s => s.gameState?.offlineAsk)
  const jackpot = useGameStore(s => !!s.gameState?.jackpot)
  const decide = useGameStore(s => s.kickDecision)
  if (!ask?.length) return null
  const p = ask[0]
  const mins = Math.max(1, Math.round(p.offlineSec / 60))
  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-[90] w-[min(30rem,calc(100vw-2rem))] rounded-2xl px-4 py-3"
      style={{ top: '0.75rem', background: C.panel, border: `1px solid ${C.hot}`, boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}>
      <div style={{ fontFamily: DISPLAY, fontSize: '1.05rem', color: C.fg }}>
        {p.name} без связи {p.offlineSec < 60 ? 'целый раунд' : `${mins} мин.`}
      </div>
      <div className="text-sm mt-0.5" style={{ color: C.muted }}>
        {jackpot ? `Кикнуть — его $${p.chips} уйдут в джекпот.` : `Кикнуть — его $${p.chips} сгорят.`} Или подождать ещё раунд
        {ask.length > 1 ? ` · ещё ${ask.length - 1} на очереди` : ''}
      </div>
      <div className="flex gap-2 mt-2.5">
        <button className="flex-1 rounded-xl px-3 py-2 font-semibold"
          style={{ background: C.hot, color: C.ink }} onClick={() => decide(p.id, true)}>
          Кикнуть
        </button>
        <button className="flex-1 rounded-xl px-3 py-2 font-semibold"
          style={{ background: 'transparent', color: C.fg, border: `1px solid ${C.line}` }} onClick={() => decide(p.id, false)}>
          Ждать ещё раунд
        </button>
      </div>
    </div>
  )
}
