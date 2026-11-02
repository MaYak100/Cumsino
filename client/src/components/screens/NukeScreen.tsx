import { useEffect, useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { C, DISPLAY } from '../../theme'
import { Sticker } from '../ui/Sticker'

const COUNT = 10

/** Твинк: с этого устройства в комнате уже сидит игрок (join_error twin). Отсчёт, вспышка — и честное объяснение. */
export function NukeScreen() {
  const clear = useGameStore(s => s.clearJoinError)
  const [left, setLeft] = useState(COUNT)
  useEffect(() => {
    if (left <= -2) return
    const t = setTimeout(() => setLeft(l => l - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  const boom = left <= 0
  const done = left <= -2

  return (
    <div className="stage min-h-dvh relative overflow-hidden flex flex-col items-center justify-center gap-6 px-4 text-center"
      style={{ background: boom && !done ? '#fff7e0' : '#120607', transition: 'background 0.6s' }}>
      <style>{`
        @keyframes nuke-pulse { 0%,100% { opacity: 0.25 } 50% { opacity: 0.85 } }
        @keyframes nuke-spin { to { transform: rotate(360deg) } }
        @keyframes nuke-shake { 0%,100% { transform: translate(0,0) } 25% { transform: translate(-3px,2px) } 75% { transform: translate(3px,-2px) } }
        @keyframes nuke-scan { from { transform: translateY(-100%) } to { transform: translateY(100dvh) } }
        @media (prefers-reduced-motion: reduce) { .nuke-anim { animation: none !important } }
      `}</style>

      {/* тревожный красный свет и полоса радара */}
      {!boom && <>
        <div className="nuke-anim absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at 50% 40%, ${C.hot}55, transparent 65%)`, animation: 'nuke-pulse 1s ease-in-out infinite' }} />
        <div className="nuke-anim absolute left-0 right-0 h-24 pointer-events-none"
          style={{ top: 0, background: `linear-gradient(transparent, ${C.hot}22, transparent)`, animation: 'nuke-scan 2.2s linear infinite' }} />
      </>}

      {!boom && (
        <div className="relative flex flex-col items-center gap-5" style={{ animation: left <= 3 ? 'nuke-shake 0.15s infinite' : undefined }}>
          <Radiation size={110} />
          <Sticker seed="nuke-title" slam rotate={-3} jag={6} color={C.hot} textColor={C.ink} padding="10px 22px 12px">
            <span style={{ fontFamily: DISPLAY, fontSize: 'clamp(1.3rem, 4vw, 2.2rem)' }}>Обнаружен твинк</span>
          </Sticker>
          <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(1.1rem, 3.2vw, 1.7rem)', color: C.fg, maxWidth: '36rem', lineHeight: 1.25 }}>
            На ваш дом будет сброшена ядерная боеголовка
          </div>
          <div className="text-sm font-mono" style={{ color: C.muted }}>
            координаты устройства: определены · ракета: в пути · отмена: невозможна
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(4rem, 16vw, 8rem)', color: C.hot, lineHeight: 1,
            textShadow: `0 0 30px ${C.hot}` }}>
            {left}
          </div>
          <div className="w-[min(28rem,80vw)] h-2 rounded-full overflow-hidden" style={{ background: '#2a1013' }}>
            <div style={{ height: '100%', width: `${((COUNT - left) / COUNT) * 100}%`, background: C.hot, transition: 'width 1s linear' }} />
          </div>
        </div>
      )}

      {boom && !done && (
        <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(3rem, 14vw, 7rem)', color: '#2a1406' }}>БУМ</div>
      )}

      {done && (
        <div className="flex flex-col items-center gap-5 max-w-[34rem]">
          <Sticker seed="nuke-joke" slam rotate={2} jag={5} color={C.paper} textColor={C.ink} padding="10px 20px 12px">
            <span style={{ fontFamily: DISPLAY, fontSize: '1.4rem' }}>Шучу. Дом цел</span>
          </Sticker>
          <div style={{ color: C.fg, fontSize: '1.05rem', lineHeight: 1.4 }}>
            С этого устройства в комнате уже сидит игрок. Один человек — одна наклейка, без твинков.
          </div>
          <div style={{ color: C.muted }}>
            Вернись в свою вкладку. Если это ты и та вкладка закрыта — подожди пару секунд и зайди под своим именем.
          </div>
          <button className="rounded-xl px-5 py-2.5 font-semibold" style={{ background: C.brass, color: C.ink }} onClick={clear}>
            Я больше не буду
          </button>
        </div>
      )}
    </div>
  )
}

/** Знак радиации: три лопасти вокруг точки, медленно крутится. */
function Radiation({ size }: { size: number }) {
  const blade = (rot: number) => (
    <path key={rot} d="M50 50 L50 8 A42 42 0 0 1 86.4 29 Z" transform={`rotate(${rot} 50 50)`} fill={C.ink} />
  )
  return (
    <svg className="nuke-anim" width={size} height={size} viewBox="0 0 100 100" style={{ animation: 'nuke-spin 6s linear infinite' }}>
      <circle cx="50" cy="50" r="48" fill={C.brass} stroke={C.ink} strokeWidth="3" />
      {[0, 120, 240].map(blade)}
      <circle cx="50" cy="50" r="12" fill={C.brass} />
      <circle cx="50" cy="50" r="8" fill={C.ink} />
    </svg>
  )
}
