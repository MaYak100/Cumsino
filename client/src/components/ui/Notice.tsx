import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { C, DISPLAY } from '../../theme'
import { Sticker } from './Sticker'

const LIFE_MS = 3000

/** Короткая наклейка поверх экрана на 3 секунды («Поставили на ответит», «Поставили $30»). */
export function Notice() {
  const notice = useGameStore(s => s.notice)
  const [shown, setShown] = useState<{ text: string; at: number } | null>(null)

  useEffect(() => {
    if (!notice || Date.now() - notice.at > LIFE_MS) return
    setShown(notice)
    const id = setTimeout(() => setShown(cur => (cur?.at === notice.at ? null : cur)), LIFE_MS - (Date.now() - notice.at))
    return () => clearTimeout(id)
  }, [notice])

  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-[80] pointer-events-none" style={{ top: '5.5rem' }}>
      <AnimatePresence>
        {shown && (
          <Sticker key={shown.at} seed={`notice-${shown.at}`} slam rotate={-3} jag={5}
            color={C.brass} textColor={C.ink} padding="8px 18px 10px">
            <span style={{ fontFamily: DISPLAY, fontSize: '1.15rem', whiteSpace: 'nowrap' }}>{shown.text}</span>
          </Sticker>
        )}
      </AnimatePresence>
    </div>
  )
}
