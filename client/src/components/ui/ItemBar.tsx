import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ITEMS, ITEM_ORDER, BUY_PHASES, type ItemId } from '@cumsino/shared'
import { useGameStore, selectMe, selectIsGladiator } from '../../store/gameStore'
import { C, DISPLAY } from '../../theme'
import { roughClip } from './Sticker'
import { ItemIcon } from './ItemIcon'
import { Money } from './Money'

type SlotState = 'buy' | 'cantBuy' | 'use' | 'ready' | 'idle' | 'targeting'

/** Можно ли применить предмет прямо сейчас (без учёта запаса). Блинк применяется кликом по другому варианту. */
function usableNow(id: ItemId, phase: string, mode: string, isGladiator: boolean, answered: boolean): boolean {
  const def = ITEMS[id]
  if (def.usePhases === 'passive' || id === 'blink') return false
  if (!def.usePhases.includes(phase as never) || !def.modes.includes(mode as never)) return false
  if (mode === 'kerri') return id === 'bkb' ? !isGladiator : isGladiator
  if (id === 'gem' || id === 'manta' || id === 'smoke') return !answered || id !== 'manta'
  return true
}

/** Предметы в углу: на итогах и в анонсе — покупка (под наклейкой цена), на ставках и вопросе — применение.
 *  Клавиши Z X C V B N; гем и хекс просят выбрать игрока (Esc — отмена). */
export function ItemBar() {
  const gs = useGameStore(s => s.gameState)
  const me = useGameStore(selectMe)
  const isGladiator = useGameStore(selectIsGladiator)
  const answeredIds = useGameStore(s => s.answeredIds)
  const myId = useGameStore(s => s.myId)
  const targeting = useGameStore(s => s.targeting)
  const setTargeting = useGameStore(s => s.setTargeting)
  const buyItem = useGameStore(s => s.buyItem)
  const useItem = useGameStore(s => s.useItem)

  const phase = gs?.phase ?? 'LOBBY'
  const visible = !!gs && !!me && !['LOBBY', 'GAME_OVER'].includes(phase)
  const buyPhase = (BUY_PHASES as string[]).includes(phase)
  const inv = gs?.inventory ?? {}
  const answered = !!myId && answeredIds.has(myId)
  const aegisOn = me?.effects?.includes('aegis') ?? false

  const stateOf = (id: ItemId): SlotState => {
    const n = inv[id] ?? 0
    const price = gs?.prices?.[id] ?? ITEMS[id].basePrice
    if (buyPhase) {
      const full = id === 'aegis' ? !!gs?.aegisBought : n >= ITEMS[id].max
      return !full && (me?.chips ?? 0) >= price ? 'buy' : 'cantBuy'
    }
    if (targeting === id) return 'targeting'
    if (id === 'blink') return n > 0 && answered && phase === 'QUESTION' ? 'ready' : 'idle'
    if (n > 0 && usableNow(id, phase, gs!.mode, isGladiator, answered)) return 'use'
    return 'idle'
  }

  const act = (id: ItemId) => {
    const st = stateOf(id)
    if (st === 'buy') return buyItem(id)
    if (st === 'targeting') return setTargeting(null)
    if (st !== 'use') return
    if (ITEMS[id].targeted) setTargeting(id)
    else useItem(id)
  }

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'Escape') return setTargeting(null)
      const id = ITEM_ORDER.find(i => ITEMS[i].key === e.code.replace('Key', ''))
      if (id && !buyPhase) act(id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!visible) return null

  return (
    <div className="fixed z-50 flex flex-col items-start gap-2" style={{ left: '1.25rem', bottom: '1.1rem' }}>
      <AnimatePresence>
        {targeting && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="text-sm font-semibold px-3 py-1 rounded-full"
            style={{ background: C.hot, color: C.ink }}
          >
            {targeting === 'gem' ? 'Чей ответ подсмотреть?' : 'Кого превратить в овцу?'} Клик по игроку, Esc — отмена
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-end gap-2.5">
        {ITEM_ORDER.map(id => (
          <ItemSlot
            key={id}
            id={id}
            count={id === 'aegis' ? (aegisOn ? 1 : 0) : inv[id] ?? 0}
            price={gs!.prices?.[id] ?? ITEMS[id].basePrice}
            state={stateOf(id)}
            buyPhase={buyPhase}
            onClick={() => act(id)}
          />
        ))}
      </div>
    </div>
  )
}

const tilt = () => (Math.random() * 10 - 5)

function ItemSlot({ id, count, price, state, buyPhase, onClick }: {
  id: ItemId; count: number; price: number; state: SlotState; buyPhase: boolean; onClick: () => void
}) {
  const [shape, setShape] = useState(0)        // на наведении бумажка «рвётся» заново
  const [rot, setRot] = useState(() => tilt())
  const def = ITEMS[id]
  const live = state === 'buy' || state === 'use' || state === 'targeting'
  const dim = state === 'idle' ? (count > 0 ? 0.6 : 0.32) : state === 'cantBuy' ? 0.38 : 1
  const glow = state === 'targeting' ? C.hot : state === 'ready' ? C.sky : state === 'use' ? C.brass : null

  return (
    <div className="flex flex-col items-center gap-1" title={`${def.name} — ${def.desc}`}>
      <motion.button
        type="button"
        onClick={onClick}
        onHoverStart={() => { setShape(s => s + 1); setRot(tilt()) }}
        animate={{ rotate: rot, opacity: dim, scale: state === 'targeting' ? 1.12 : 1 }}
        whileHover={live ? { scale: 1.16, y: -8 } : { scale: 1.05 }}
        whileTap={live ? { scale: 0.9 } : undefined}
        transition={{ type: 'spring', stiffness: 420, damping: 18 }}
        className="relative"
        style={{
          width: '4rem', height: '4rem', cursor: live ? 'pointer' : 'default',
          filter: `drop-shadow(0 3px 0 rgba(0,0,0,.35)) drop-shadow(0 10px 14px rgba(0,0,0,.45))${glow ? ` drop-shadow(0 0 8px ${glow})` : ''}`,
        }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            clipPath: roughClip(`${id}-${shape}`, 4, 5),
            background: `linear-gradient(120deg, rgba(255,255,255,.25), rgba(255,255,255,0) 45%), ${C.paper}`,
          }}
        >
          <ItemIcon id={id} size={46} />
        </div>
        {/* количество */}
        {!buyPhase && id !== 'aegis' || count > 0 ? (
          <span
            className="absolute flex items-center justify-center tnum"
            style={{
              top: -7, right: -7, minWidth: 22, height: 22, padding: '0 5px', borderRadius: 11,
              background: count > 0 ? C.ink : '#3a4741', color: count > 0 ? C.paper : C.muted,
              border: `2px solid ${C.paper}`, fontFamily: DISPLAY, fontSize: 12, lineHeight: 1,
            }}
          >
            {id === 'aegis' ? '✓' : count}
          </span>
        ) : null}
        {def.key && !buyPhase && (
          <span className="absolute" style={{
            left: 5, bottom: 3, fontFamily: DISPLAY, fontSize: 10, color: C.ink, opacity: 0.55,
          }}>
            {def.key}
          </span>
        )}
      </motion.button>
      {buyPhase && (
        <span className="text-[0.8rem] font-semibold" style={{ color: state === 'buy' ? C.brass : C.muted }}>
          <Money v={price} />
        </span>
      )}
    </div>
  )
}
