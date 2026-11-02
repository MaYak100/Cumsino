import { useEffect, useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { C, DISPLAY } from '../../theme'
import { Sticker } from '../ui/Sticker'

const COUNT = 10
/** вспышка после взрыва (с) */
const FLASH = 1.5
/** через сколько секунд после взрыва — угроза про видюху */
const THREAT = 5

/** Твинк: с этого устройства в комнате уже сидит игрок (join_error twin). Отсчёт — успел нажать «Я больше не буду»,
 *  вернулся на вход; не успел — БУМ, а через 5 с, если всё ещё тут, — про видюху. */
export function NukeScreen() {
  const clear = useGameStore(s => s.clearJoinError)
  // секунды с открытия экрана — от часов (в фоновой вкладке таймеры редкие, отсчёт не должен отставать)
  const [start] = useState(() => Date.now())
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      const el = (Date.now() - start) / 1000
      setT(el)
      if (el >= COUNT + FLASH + THREAT) clearInterval(id)
    }, 250)
    return () => clearInterval(id)
  }, [start])
  const left = Math.max(0, Math.ceil(COUNT - t))
  const boom = t >= COUNT
  const flash = boom && t < COUNT + FLASH
  const threat = t >= COUNT + FLASH + THREAT

  const sorry = (
    <button className="rounded-xl px-6 py-3 font-semibold text-lg" onClick={clear}
      style={{ background: C.brass, color: C.ink, boxShadow: `0 0 24px ${C.brass}66` }}>
      Я больше не буду
    </button>
  )

  return (
    <div className="stage min-h-dvh relative overflow-hidden flex flex-col items-center justify-center gap-6 px-4 text-center"
      style={{ background: flash ? '#fff7e0' : boom ? '#0d0a09' : '#120607', transition: 'background 0.6s' }}>
      <style>{`
        @keyframes nuke-pulse { 0%,100% { opacity: 0.25 } 50% { opacity: 0.85 } }
        @keyframes nuke-spin { to { transform: rotate(360deg) } }
        @keyframes nuke-shake { 0%,100% { transform: translate(0,0) } 25% { transform: translate(-3px,2px) } 75% { transform: translate(3px,-2px) } }
        @keyframes nuke-scan { from { transform: translateY(-100%) } to { transform: translateY(100dvh) } }
        @keyframes nuke-ash { from { transform: translateY(-10vh); opacity: 0 } 20% { opacity: 0.7 } to { transform: translateY(110vh); opacity: 0 } }
        @media (prefers-reduced-motion: reduce) { .nuke-anim { animation: none !important } }
      `}</style>

      {!boom && <>
        <div className="nuke-anim absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at 50% 40%, ${C.hot}55, transparent 65%)`, animation: 'nuke-pulse 1s ease-in-out infinite' }} />
        <div className="nuke-anim absolute left-0 right-0 h-24 pointer-events-none"
          style={{ top: 0, background: `linear-gradient(transparent, ${C.hot}22, transparent)`, animation: 'nuke-scan 2.2s linear infinite' }} />
        <div className="relative flex flex-col items-center gap-5" style={{ animation: left <= 3 ? 'nuke-shake 0.15s infinite' : undefined }}>
          <Radiation size={100} />
          <Sticker seed="nuke-title" slam rotate={-3} jag={6} color={C.hot} textColor={C.ink} padding="10px 22px 12px">
            <span style={{ fontFamily: DISPLAY, fontSize: 'clamp(1.3rem, 4vw, 2.2rem)' }}>Обнаружен твинк</span>
          </Sticker>
          <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(1.1rem, 3.2vw, 1.7rem)', color: C.fg, maxWidth: '36rem', lineHeight: 1.25 }}>
            На ваш дом будет сброшена ядерная боеголовка
          </div>
          <div className="text-sm font-mono" style={{ color: C.muted }}>
            координаты устройства: определены · ракета: в пути · отмена: одна кнопка ниже
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(3.5rem, 14vw, 7rem)', color: C.hot, lineHeight: 1,
            textShadow: `0 0 30px ${C.hot}` }}>
            {left}
          </div>
          <div className="w-[min(28rem,80vw)] h-2 rounded-full overflow-hidden" style={{ background: '#2a1013' }}>
            <div style={{ height: '100%', width: `${Math.min(1, t / COUNT) * 100}%`, background: C.hot, transition: 'width 0.25s linear' }} />
          </div>
          {sorry}
        </div>
      </>}

      {flash && (
        <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(4rem, 18vw, 10rem)', color: '#2a1406' }}>БУМ</div>
      )}

      {boom && !flash && <>
        {/* пепел */}
        {Array.from({ length: 24 }, (_, i) => (
          <div key={i} className="nuke-anim absolute top-0 rounded-full pointer-events-none" style={{
            left: `${(i * 37) % 100}%`, width: 3 + (i % 3) * 2, height: 3 + (i % 3) * 2, background: '#6b625c',
            animation: `nuke-ash ${6 + (i % 5)}s linear ${-(i * 0.7)}s infinite`,
          }} />
        ))}
        <div className="relative flex flex-col items-center gap-6 max-w-[36rem]">
          <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(4rem, 18vw, 9rem)', color: '#3a2a22', lineHeight: 1 }}>БУМ</div>
          <div style={{ color: C.muted }}>Не успел. От дома осталась воронка, от твинка — тоже</div>
          {threat && (
            <Sticker seed="nuke-gpu" slam rotate={-2} jag={6} color={C.hot} textColor={C.ink} padding="12px 22px 14px">
              <span style={{ fontFamily: DISPLAY, fontSize: 'clamp(1.1rem, 3.4vw, 1.6rem)', lineHeight: 1.3 }}>
                Ты всё равно больше не будешь. Или я сожгу тебе видюху
              </span>
            </Sticker>
          )}
          {sorry}
        </div>
      </>}
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
