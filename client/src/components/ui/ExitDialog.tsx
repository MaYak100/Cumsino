import { useEffect, useState } from 'react'
import { useGameStore, selectMe } from '../../store/gameStore'
import { ignoreHotkey } from '../../lib/pressable'
import { C, DISPLAY } from '../../theme'
import { Sticker } from './Sticker'

/** Esc — выйти из игры, с подтверждением. Посреди игры фишки уходят в джекпот (сервер, GameRoom.leave), вернуться
 *  тем же игроком нельзя. Esc во время выбора цели гема / хекса — отмена выбора, не выход. */
export function ExitDialog() {
  const [open, setOpen] = useState(false)
  const phase = useGameStore(s => s.gameState?.phase)
  const jackpot = useGameStore(s => !!s.gameState?.jackpot)
  const me = useGameStore(selectMe)
  const reset = useGameStore(s => s.reset)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open) {
        if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
        else if (e.key === 'Enter') { e.preventDefault(); reset() }
        return
      }
      if (e.key !== 'Escape' || ignoreHotkey(e) || useGameStore.getState().targeting) return
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, reset])

  if (!open) return null
  const inGame = phase !== 'LOBBY' && phase !== 'GAME_OVER' && !me?.spectator
  const chips = me?.chips ?? 0
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4"
      style={{ background: 'rgba(5,10,9,0.72)', backdropFilter: 'blur(4px)' }} onClick={() => setOpen(false)}>
      <div className="flex flex-col items-center gap-4 rounded-2xl px-6 py-5 text-center max-w-[26rem]"
        style={{ background: C.panel, border: `1px solid ${C.line}`, boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}>
        <Sticker seed="exit" slam rotate={-2} jag={5} color={C.hot} textColor={C.ink} padding="8px 18px 10px">
          <span style={{ fontFamily: DISPLAY, fontSize: '1.35rem' }}>{phase === 'LOBBY' ? 'Выйти из лобби?' : 'Выйти из игры?'}</span>
        </Sticker>
        <div style={{ color: C.fg, lineHeight: 1.4 }}>
          {inGame
            ? <>Твои <b style={{ color: C.brass }}>${chips}</b> {jackpot ? 'уйдут в джекпот' : 'сгорят'}, вернуться этим же игроком
              уже не выйдет.</>
            : phase === 'LOBBY' ? 'Зайти снова можно в любой момент до старта.' : 'Вернёшься на экран входа.'}
        </div>
        <div className="flex gap-2 w-full">
          <button autoFocus className="flex-1 rounded-xl px-4 py-2.5 font-semibold"
            style={{ background: 'transparent', color: C.fg, border: `1px solid ${C.line}` }} onClick={() => setOpen(false)}>
            Остаться <span style={{ color: C.muted }}>· Esc</span>
          </button>
          <button className="flex-1 rounded-xl px-4 py-2.5 font-semibold" style={{ background: C.hot, color: C.ink }}
            onClick={() => reset()}>
            Выйти <span style={{ opacity: 0.6 }}>· Enter</span>
          </button>
        </div>
      </div>
    </div>
  )
}
