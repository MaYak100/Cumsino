import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ITEMS, ITEM_ORDER, WIN_CHIPS, AEGIS_THRESHOLD, UNLOCK_PER_SHOP, type ItemId } from '@cumsino/shared'
import { useGameStore, selectMe } from '../../store/gameStore'
import { C, DISPLAY } from '../../theme'
import { TimeBar } from '../ui/TimeBar'
import { roughClip } from '../ui/Sticker'
import { ItemIcon } from '../ui/ItemIcon'
import { Money } from '../ui/Money'

/** Лавка перед раундом «для всех»: единственное место, где покупают. Карточки предметов с описанием и ценой,
 *  «Готов» — все готовы, лавка закрывается раньше таймера. «Играем впервые» — закрытые предметы на своих местах,
 *  серой бумагой с замком (lockedItems, по UNLOCK_PER_SHOP за лавку). */
export function ShopScreen() {
  const gs = useGameStore(s => s.gameState)!
  const me = useGameStore(selectMe)
  const myId = useGameStore(s => s.myId)
  const buyItem = useGameStore(s => s.buyItem)
  const shopReady = useGameStore(s => s.shopReady)
  const inv = gs.inventory ?? {}
  const chips = me?.chips ?? 0
  const ready = !!me?.shopReady
  const aegisOn = me?.effects?.includes('aegis') ?? false
  const locked = gs.lockedItems ?? []

  return (
    <div className="min-h-dvh flex flex-col">
      <TimeBar seconds={gs.phaseTimeLeft} endsAt={gs.phaseEndsAt} total={gs.phaseDuration} color={C.brass} />

      <main className="flex-1 w-full max-w-[72rem] mx-auto px-4 sm:px-8 py-4 flex flex-col justify-center gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <motion.div
              initial={{ x: -40, opacity: 0, skewX: 12 }} animate={{ x: 0, opacity: 1, skewX: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              style={{ fontFamily: DISPLAY, fontSize: 'clamp(2.4rem, 4.2vw, 3.4rem)', lineHeight: 1, color: C.brass, rotate: '-2deg' }}
            >
              Лавка
            </motion.div>
            <div className="mt-3 text-base" style={{ color: C.muted }}>
              Дальше раунд «для всех». Следующая лавка — только после «кто ближе»
            </div>
            {locked.length > 0 && (
              <div className="mt-1 text-base" style={{ color: C.muted }}>
                Играем впервые: в каждой лавке открываются ещё {UNLOCK_PER_SHOP === 2 ? 'два' : UNLOCK_PER_SHOP} предмета
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-sm" style={{ color: C.muted }}>У тебя</div>
            <div className="tnum" style={{ fontFamily: DISPLAY, fontSize: '2.4rem', lineHeight: 1 }}><Money v={chips} /></div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-5">
          {ITEM_ORDER.map((id, i) => {
            const lockAt = locked.indexOf(id)
            // закрыт: через сколько лавок откроется (1 — в следующей)
            if (lockAt >= 0) return <ShopCard key={id} id={id} index={i} price={0} have={0} full={false} can={false}
              lockIn={Math.floor(lockAt / UNLOCK_PER_SHOP) + 1} onBuy={() => {}} />
            const price = gs.prices?.[id] ?? ITEMS[id].basePrice
            const have = id === 'aegis' ? (gs.aegisBought ? 1 : 0) : inv[id] ?? 0
            const full = id === 'aegis' ? !!gs.aegisBought : have >= ITEMS[id].max
            // аегис нельзя купить «в прибыль» (останется меньше $50), а с активным аегисом не уйти покупками ниже $50
            const floorOk = (id === 'aegis' || aegisOn) ? chips - price >= AEGIS_THRESHOLD : true
            const can = !ready && !full && chips >= price && chips < WIN_CHIPS && floorOk
            return (
              <ShopCard key={id} id={id} index={i} price={price} have={have} full={full} can={can}
                onBuy={() => buyItem(id)} />
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-5">
          <motion.button
            onClick={() => shopReady(!ready)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="rounded-2xl px-10 h-14 text-lg"
            style={{
              fontFamily: DISPLAY,
              background: ready ? 'transparent' : C.brass, color: ready ? C.brass : C.ink,
              border: `2px solid ${C.brass}`,
              boxShadow: ready ? 'none' : `0 5px 0 #a87a17, 0 12px 26px ${C.brass}40`,
            }}
          >
            {ready ? 'Ещё подумаю' : 'Готов'}
          </motion.button>
          <div className="flex flex-wrap gap-1.5">
            {gs.players.map(p => (
              <span key={p.id} className="text-[0.8125rem] font-semibold rounded-full px-2.5 py-0.5"
                style={{
                  background: p.shopReady ? C.brass : 'transparent', color: p.shopReady ? C.ink : C.muted,
                  border: `1.5px ${p.shopReady ? 'solid' : 'dashed'} ${p.shopReady ? C.brass : C.line}`,
                }}>
                {p.id === myId ? 'Ты' : p.name}
              </span>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

function ShopCard({ id, index, price, have, full, can, lockIn, onBuy }: {
  id: ItemId; index: number; price: number; have: number; full: boolean; can: boolean
  /** закрыт («играем впервые»): откроется через столько лавок */
  lockIn?: number
  onBuy: () => void
}) {
  const def = ITEMS[id]
  const [shape, setShape] = useState(0)
  const [tilt, setTilt] = useState(() => (index % 2 ? 1.5 : -1.5))
  const [bought, setBought] = useState(0)   // ключ для «+1»

  const ph = def.usePhases
  const when = ph === 'passive' ? 'сам'
    : ph.includes('QUESTION') ? (ph.includes('BETTING') ? 'ставки, вопрос' : 'на вопросе')
    : ph.includes('ANNOUNCE') ? 'до вопроса' : 'на ставках'

  return (
    <motion.button
      type="button"
      disabled={!can}
      onClick={() => { if (can) { onBuy(); setBought(b => b + 1) } }}
      onHoverStart={() => { setShape(s => s + 1); setTilt(Math.random() * 6 - 3) }}
      initial={{ y: 30, opacity: 0, rotate: tilt - 6 }}
      animate={{ y: 0, opacity: can || have > 0 || lockIn ? 1 : 0.45, rotate: tilt }}
      whileHover={can ? { scale: 1.05, y: -6 } : undefined}
      whileTap={can ? { scale: 0.95, rotate: tilt + 3 } : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 20, delay: 0.04 * index }}
      className="relative text-left"
      aria-label={lockIn ? `${def.name} — пока закрыт` : undefined}
      style={{
        width: '15rem',
        cursor: can ? 'pointer' : 'default',
        filter: 'drop-shadow(0 4px 0 rgba(0,0,0,.35)) drop-shadow(0 14px 20px rgba(0,0,0,.45))',
      }}
    >
      <div
        className="flex flex-col h-full"
        style={{
          clipPath: roughClip(`shop-${id}-${shape}`, 6, 6),
          background: `linear-gradient(120deg, rgba(255,255,255,.25), rgba(255,255,255,0) 45%), ${lockIn ? LOCKED_PAPER : C.paper}`,
          color: C.ink, padding: '0.95rem 1.05rem 0.9rem',
        }}
      >
        {lockIn ? <LockedFace id={id} lockIn={lockIn} /> : <>
        <div className="flex items-start justify-between">
          <ItemIcon id={id} size={66} />
          <span className="text-[0.7rem] font-bold rounded px-1.5 py-0.5" style={{ background: C.ink, color: C.paper }}>
            {when}
          </span>
        </div>
        <div className="mt-2" style={{ fontFamily: DISPLAY, fontSize: '1.05rem', lineHeight: 1.1 }}>{def.name}</div>
        <div className="mt-1.5 text-[0.85rem] leading-snug flex-1" style={{ color: '#3d4a44' }}>{def.desc}</div>
        <div className="mt-3 flex items-center justify-between">
          <span className="tnum" style={{ fontFamily: DISPLAY, fontSize: '1.3rem', color: full ? '#7a8580' : C.ink }}>
            {full ? (id === 'aegis' ? 'куплен' : 'максимум') : <Money v={price} />}
          </span>
          <span className="text-[0.8rem] font-semibold" style={{ color: '#5b6862' }}>
            {id === 'aegis' ? 'один на игру' : `в запасе ${have}/${def.max}`}
          </span>
        </div>
        </>}
      </div>
      <AnimatePresence>
        {bought > 0 && (
          <motion.span
            key={bought}
            initial={{ opacity: 1, y: 0, scale: 0.8 }} animate={{ opacity: 0, y: -50, scale: 1.4 }}
            transition={{ duration: 0.8 }}
            className="absolute pointer-events-none"
            style={{ right: '1rem', top: '0.5rem', fontFamily: DISPLAY, fontSize: '1.6rem', color: C.mint, textShadow: `0 2px 0 ${C.ink}` }}
          >
            +1
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

/** серая бумага закрытого предмета */
const LOCKED_PAPER = '#9fa59f'

/** Закрытая карточка: та же раскладка, иконка выцвела, на ней замок, вместо цены — когда откроется. */
function LockedFace({ id, lockIn }: { id: ItemId; lockIn: number }) {
  const def = ITEMS[id]
  return (
    <>
      <div className="flex items-start justify-between">
        <div className="relative">
          <div style={{ filter: 'grayscale(1) contrast(.7)', opacity: 0.45 }}><ItemIcon id={id} size={66} /></div>
          <Padlock className="absolute" style={{ left: 18, top: 16 }} />
        </div>
      </div>
      <div className="mt-2" style={{ fontFamily: DISPLAY, fontSize: '1.05rem', lineHeight: 1.1, color: '#3a423e' }}>{def.name}</div>
      <div className="mt-1.5 text-[0.85rem] leading-snug flex-1" style={{ color: '#4a534f', opacity: 0.75 }}>{def.desc}</div>
      <div className="mt-3 text-[0.9rem] font-bold" style={{ color: '#2e3532' }}>
        {lockIn === 1 ? 'В следующей лавке' : lockIn === 2 ? 'Через одну лавку' : `Через ${lockIn - 1} лавки`}
      </div>
    </>
  )
}

/** Замок скетчем — чернильный контур, как у иконок предметов. */
function Padlock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={32} height={36} viewBox="0 0 32 36" aria-hidden className={className} style={{ overflow: 'visible', ...style }}>
      <path d="M9 16 V11 a7 7 0 0 1 14 0 V16" fill="none" stroke={C.ink} strokeWidth={3.2} strokeLinecap="round" />
      <rect x={4.5} y={15.5} width={23} height={17} rx={3} fill="#5d6560" transform="translate(1 1.2)" />
      <rect x={4} y={15} width={23} height={17} rx={3} fill="none" stroke={C.ink} strokeWidth={2.4} />
      <path d="M15.5 21.5 v4.5" stroke={C.ink} strokeWidth={2.6} strokeLinecap="round" />
    </svg>
  )
}
