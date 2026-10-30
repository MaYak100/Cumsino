import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ITEMS, ITEM_ORDER, type ItemId } from '@cumsino/shared'
import { useGameStore, selectMe, selectIsGladiator } from '../../store/gameStore'
import { C, DISPLAY } from '../../theme'
import { roughClip } from './Sticker'
import { ItemIcon } from './ItemIcon'
import { ignoreHotkey } from '../../lib/pressable'
import { isSpectator } from '../../lib/players'
import { useCompactBetting } from '../../lib/tableGeometry'

type SlotState = 'use' | 'ready' | 'idle' | 'targeting'

const USE_PHASES = ['ANNOUNCE', 'BETTING', 'QUESTION']

/** Почему предмет сейчас не жмётся — строка для подсказки; null — можно. Блинк применяется кликом по другому варианту. */
/** Узкий экран (телефон): слоты мельче — панель не закрывает варианты и оценку. Граница — как у .below-itembar. */
const NARROW = '(max-width: 767px)'
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(NARROW).matches)
  useEffect(() => {
    const mq = window.matchMedia(NARROW)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

function blocker(id: ItemId, phase: string, mode: string, isGladiator: boolean, answered: boolean, spent: boolean, settled: boolean): string | null {
  const def = ITEMS[id]
  if (def.usePhases === 'passive') return 'Работает сам'
  if (settled) return 'Раунд уже посчитан'
  if (mode === 'kerri') {
    if (isGladiator && id !== 'blink') return 'Керри может только блинк'
    if (!isGladiator && id !== 'bkb') return 'В керри толпе доступен только BKB'
  }
  if (!def.modes.includes(mode as never)) return 'Не в этом режиме'
  if (!def.usePhases.includes(phase as never)) {
    const ph = def.usePhases
    return ph.includes('QUESTION') ? (ph.includes('BETTING') ? 'На ставках или на вопросе' : 'Только на вопросе')
      : ph.includes('ANNOUNCE') ? 'Только до вопроса' : 'Только на ставках'
  }
  if (id === 'blink') return answered ? null : 'Сначала ответь, потом передумывай'
  if (id === 'manta' && answered) return 'Только до ответа'
  // сервер молча не примет второй раз за раунд — не делаем вид, что можно
  if (spent) return id === 'hex' ? 'Хекс уже брошен в этом раунде' : 'Уже применён в этом раунде'
  return null
}

/** Свой запас в углу: только то, что есть, и только в фазах применения (анонс, ставки, вопрос). Покупка — в лавке.
 *  Клавиши — ITEMS[id].key (Z манта, X гем, C смок, V хекс, B BKB; у блинка клавиши нет); гем и хекс просят выбрать
 *  игрока (Esc — отмена). Подсказка на бумажке — по наведению мыши, на тач-экране — по первому тапу (второй применяет).
 *  Пока панель на экране, она выставляет --itembar-pad: экраны вопроса оставляют под ней место (.below-itembar).
 *  На ставках на телефоне (CompactBetting) угловой панели нет — там своя, inline, в потоке колонки над доком. */
export function ItemBar({ inline }: { inline?: boolean } = {}) {
  const gs = useGameStore(s => s.gameState)
  const me = useGameStore(selectMe)
  const isGladiator = useGameStore(selectIsGladiator)
  const answeredIds = useGameStore(s => s.answeredIds)
  const myId = useGameStore(s => s.myId)
  const targeting = useGameStore(s => s.targeting)
  const narrow = useNarrow()
  const setTargeting = useGameStore(s => s.setTargeting)
  const useItem = useGameStore(s => s.useItem)
  const itemFeed = useGameStore(s => s.itemFeed)
  const roundResults = useGameStore(s => s.roundResults)
  const compact = useCompactBetting()

  const phase = gs?.phase ?? 'LOBBY'
  const inv = gs?.inventory ?? {}
  const answered = !!myId && answeredIds.has(myId)
  const aegisOn = me?.effects?.includes('aegis') ?? false
  const owned = ITEM_ORDER.filter(id => id === 'aegis' ? aegisOn : (inv[id] ?? 0) > 0)
  // угловая панель уступает место inline-панели компактных ставок (inline рисует только CompactBetting)
  const yieldsToInline = !inline && compact && phase === 'BETTING'
  const visible = !!gs && !!me && USE_PHASES.includes(phase) && owned.length > 0 && !yieldsToInline

  // «раз за раунд»: манта (убранный вариант), смок и BKB (свой эффект), хекс (свой бросок в ленте применений)
  const fx = me?.effects ?? []
  const spent = (id: ItemId) =>
    id === 'manta' ? (gs?.removedOptions?.length ?? 0) > 0
    : id === 'smoke' || id === 'bkb' ? fx.includes(id)
    : id === 'hex' ? itemFeed.some(e => e.item === 'hex' && e.playerId === myId)
    : false
  // окно показа ответа: раунд посчитан, сервер ничего не применяет
  const settled = phase === 'QUESTION' && roundResults.length > 0
  // гем и хекс — только в другого игрока, не зрителя (сервер иначе молча откажет, а прицел погаснет)
  const hasTarget = !!gs?.players.some(p => p.id !== myId && !isSpectator(p))
  const why = (id: ItemId) => !gs ? 'нет'
    : blocker(id, phase, gs.mode, isGladiator, answered, spent(id), settled)
      ?? (ITEMS[id].targeted && !hasTarget ? 'Не в кого: остальные зрители' : null)
  const stateOf = (id: ItemId): SlotState => {
    if (targeting === id) return 'targeting'
    if (why(id)) return 'idle'
    return id === 'blink' ? 'ready' : 'use'
  }
  const act = (id: ItemId) => {
    const st = stateOf(id)
    if (st === 'targeting') return setTargeting(null)
    if (st !== 'use') return
    if (ITEMS[id].targeted) setTargeting(id)
    else useItem(id)
  }

  useEffect(() => {
    if (!visible || inline) return
    const root = document.documentElement
    root.style.setProperty('--itembar-pad', narrow ? '4.5rem' : '5.75rem')
    return () => { root.style.removeProperty('--itembar-pad') }
  }, [visible, narrow])

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+C — не смок, Ctrl+Z — не манта; зажатая клавиша не тратит предмет повтором
      if (ignoreHotkey(e)) return
      if (e.key === 'Escape') return setTargeting(null)
      const id = owned.find(i => ITEMS[i].key === e.code.replace('Key', ''))
      if (id) act(id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!visible) return null

  return (
    // сам контейнер клики пропускает (промежутки между слотами лежат поверх стола / ников) — ловят только слоты
    <div className={`${inline ? 'relative' : 'fixed z-50'} flex flex-col items-start gap-2`}
      style={inline ? { pointerEvents: 'none' } : { left: '1.25rem', bottom: '1.1rem', pointerEvents: 'none' }}>
      {inline && <span className="text-[0.75rem]" style={{ color: C.muted }}>Предметы</span>}
      <AnimatePresence>
        {targeting && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="text-sm font-semibold px-3 py-1 rounded-full"
            style={{ background: C.hot, color: C.ink }}
          >
            {targeting === 'gem' ? 'Чей ответ просветить?' : 'Кого превратить в овцу?'} Клик по игроку, Esc — отмена
          </motion.div>
        )}
      </AnimatePresence>
      {/* прицел: панель отходит в сторону — при 7–10 игроках и полном запасе она лежит на плашке соседа снизу слева,
          а он тоже цель. Отмена — Esc или та же клавиша */}
      <div className={`flex items-end gap-2.5${inline ? ' flex-wrap pt-1.5' : ''}`} style={targeting ? { opacity: 0.4 } : undefined}>
        {owned.map(id => (
          <ItemSlot key={id} id={id} count={id === 'aegis' ? 1 : inv[id] ?? 0}
            state={stateOf(id)} reason={why(id)} onClick={() => act(id)} passThrough={!!targeting} />
        ))}
      </div>
    </div>
  )
}

const tilt = () => (Math.random() * 10 - 5)

function ItemSlot({ id, count, state, reason, onClick, passThrough }: {
  id: ItemId; count: number; state: SlotState; reason: string | null; onClick: () => void; passThrough: boolean
}) {
  const [shape, setShape] = useState(0)        // на наведении бумажка «рвётся» заново
  const [rot, setRot] = useState(() => tilt())
  const [hover, setHover] = useState(false)
  // тач: наведения нет — первый тап показывает подсказку, второй (пока она видна) применяет
  const [tapTip, setTapTip] = useState(false)
  const touch = useRef(false)
  const narrow = useNarrow()
  useEffect(() => {
    if (!tapTip) return
    const t = setTimeout(() => setTapTip(false), 3000)
    return () => clearTimeout(t)
  }, [tapTip])
  const def = ITEMS[id]
  const live = state === 'use' || state === 'targeting'
  const glow = state === 'targeting' ? C.hot : state === 'ready' ? C.sky : state === 'use' ? C.brass : null

  // подсказка шириной 17rem: у слота в правой половине экрана (inline-панель на телефоне) — влево от него
  const box = useRef<HTMLDivElement>(null)
  const rect = (hover || tapTip) ? box.current?.getBoundingClientRect() : undefined
  const tipRight = !!rect && rect.left > window.innerWidth / 2

  return (
    <div ref={box} className="relative" style={{ pointerEvents: passThrough ? 'none' : 'auto' }}>
      <AnimatePresence>
        {(hover || tapTip) && <Tip id={id} reason={reason} tapAgain={tapTip && state === 'use'} right={tipRight} />}
      </AnimatePresence>
      <motion.button
        type="button"
        onPointerDown={e => { touch.current = e.pointerType !== 'mouse' }}
        onClick={() => {
          if (!touch.current || tapTip || state === 'targeting') { setTapTip(false); onClick(); return }
          setShape(s => s + 1)
          setTapTip(true)
        }}
        onHoverStart={() => { if (touch.current) return; setShape(s => s + 1); setRot(tilt()); setHover(true) }}
        onHoverEnd={() => setHover(false)}
        animate={{ rotate: rot, opacity: state === 'idle' ? 0.55 : 1, scale: state === 'targeting' ? 1.12 : 1 }}
        whileHover={{ scale: live ? 1.16 : 1.06, y: live ? -8 : -3 }}
        whileTap={live ? { scale: 0.9 } : undefined}
        transition={{ type: 'spring', stiffness: 420, damping: 18 }}
        className="relative"
        style={{
          width: narrow ? '3rem' : '4rem', height: narrow ? '3rem' : '4rem', cursor: live ? 'pointer' : 'default',
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
          <ItemIcon id={id} size={narrow ? 38 : 50} />
        </div>
        {id !== 'aegis' && (
          <span className="absolute flex items-center justify-center tnum" style={{
            top: -7, right: -7, minWidth: 22, height: 22, padding: '0 5px', borderRadius: 11,
            background: C.ink, color: C.paper, border: `2px solid ${C.paper}`,
            fontFamily: DISPLAY, fontSize: 12, lineHeight: 1,
          }}>
            {count}
          </span>
        )}
        {def.key && (
          <span className="absolute" style={{ left: 5, bottom: 3, fontFamily: DISPLAY, fontSize: 10, color: C.ink, opacity: 0.55 }}>
            {def.key}
          </span>
        )}
      </motion.button>
    </div>
  )
}

/** Подсказка — бумажка над слотом: название, что делает, клавиша, почему сейчас нельзя. */
function Tip({ id, reason, tapAgain, right }: { id: ItemId; reason: string | null; tapAgain?: boolean; right?: boolean }) {
  const def = ITEMS[id]
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, rotate: -4, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, rotate: -1.5, scale: 1 }}
      exit={{ opacity: 0, y: 6, transition: { duration: 0.1 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 26 }}
      className="absolute pointer-events-none"
      style={{
        ...(right ? { right: -6 } : { left: -6 }), bottom: 'calc(100% + 14px)', width: '17rem', zIndex: 70,
        maxWidth: 'calc(100vw - 1.5rem)',
        filter: 'drop-shadow(0 3px 0 rgba(0,0,0,.35)) drop-shadow(0 12px 18px rgba(0,0,0,.5))',
      }}
    >
      <div style={{
        clipPath: roughClip(`tip-${id}`, 4, 6),
        background: C.paper, color: C.ink, padding: '0.8rem 0.95rem 0.85rem',
      }}>
        <div className="flex items-center justify-between gap-2">
          <span style={{ fontFamily: DISPLAY, fontSize: '1rem', lineHeight: 1.1 }}>{def.name}</span>
          {def.key && (
            <span className="rounded px-1.5" style={{ fontFamily: DISPLAY, fontSize: 12, background: C.ink, color: C.paper }}>{def.key}</span>
          )}
        </div>
        <div className="mt-1 text-[0.85rem] leading-snug" style={{ color: '#3d4a44' }}>{def.desc}</div>
        {reason && <div className="mt-1.5 text-[0.8rem] font-bold" style={{ color: '#b8264b' }}>{reason}</div>}
        {!reason && tapAgain && <div className="mt-1.5 text-[0.8rem] font-bold" style={{ color: C.ink }}>Тапни ещё раз — применить</div>}
      </div>
    </motion.div>
  )
}
