import type { CSSProperties, ReactNode } from 'react'
import { LayoutGroup, motion, AnimatePresence } from 'framer-motion'
import { GLADIATOR_BONUS, type Player } from '@cumsino/shared'
import { useGameStore } from '../../store/gameStore'
import type { Betting } from '../../lib/useBetting'
import { pileOffset, buildChipsForPlayer } from '../../types/chips'
import type { PhysicalChip } from '../../types/chips'
import type { ChipValue } from '../ui/Chip'
import { chipStyle } from '../../lib/chipStyle'
import { pressable } from '../../lib/pressable'
import { isSpectator } from '../../lib/players'
import { C, DISPLAY, FELT, MODE } from '../../theme'
import { Timer } from '../ui/Timer'
import { Sticker } from '../ui/Sticker'
import { TopicStack } from '../ui/Topic'
import { Money } from '../ui/Money'
import { Marks, useFreshFeed } from '../ui/AnswerProgress'
import { ItemIcon } from '../ui/ItemIcon'
import { ConfirmButton } from '../ui/BetButtons'
import { ItemBar } from '../ui/ItemBar'
import { BotMark, needsBotMark } from '../ui/BotMark'
import { JackpotBadge } from '../ui/JackpotBadge'

const DENOMS: ChipValue[] = [500, 100, 50, 20, 10]
const RACK_PX = 42     // фишка в стопке дока — под палец
const RACK_STEP = 3
const PILE_PX = 34     // фишка в зоне ставки
const spring = { type: 'spring', stiffness: 420, damping: 30 } as const
/** буквы вариантов керри — ими подписаны ставки соперников */
const OPTION_LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е']

/**
 * Ставки на телефоне: вместо круглого стола (на 375 px он ужимается до ×0.29) — колонка. Сверху режим, таймер и тема
 * (в керри — кто отвечает и вопрос), ниже своя зона ставки (в керри — четыре варианта строками: какой выберет керри),
 * соперники полосой со ставками и предметы. Стопки фишек крупными кнопками, быстрые ставки и «Ставлю» —
 * в доке, прибитом к низу экрана. Логика — общая со столом (lib/useBetting).
 * Контейнер прокручивается сам (layoutScroll — перелёт фишек по layoutId учитывает прокрутку).
 */
export function CompactBetting({ bet }: { bet: Betting }) {
  const { gameState, isGladiator, isKerriMode, isKerriCrowd } = bet
  const q = gameState.currentQuestion
  const mode = MODE[gameState.mode]
  const gladiator = gameState.players.find(p => p.id === gameState.gladiatorId)

  return (
    <motion.div
      layoutScroll
      style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden', pointerEvents: 'auto' }}
    >
      <LayoutGroup>
        <div className="mx-auto flex flex-col" style={{ maxWidth: '30rem', minHeight: '100%' }}>
          <div className="flex-1 flex flex-col gap-4 px-4 pt-3 pb-5">
            {/* шапка: режим и таймер */}
            <div className="flex items-center gap-3">
              <span className="font-display text-[0.8125rem] px-2.5 py-1 rounded-md whitespace-nowrap"
                style={{ background: mode.color, color: C.ink, transform: 'rotate(-2deg)' }}>
                {mode.short}
              </span>
              <span className="text-[0.8125rem]" style={{ color: C.muted }}>Ставки</span>
              {!isKerriMode && <JackpotBadge bank={gameState.jackpotBank} size="1rem" seed={`jp-${gameState.roundIndex}`} />}
              <span className="ml-auto"><Timer seconds={gameState.phaseTimeLeft} endsAt={gameState.phaseEndsAt} total={gameState.phaseDuration} color={mode.color} size={44} /></span>
            </div>

            {/* что на кону */}
            {!isKerriMode && q && (
              <div className="flex flex-col items-center gap-1.5">
                <Sticker seed={`${q.id}-topic`} slam rotate={-3} jag={6} padding="8px 18px 10px" style={{ maxWidth: '100%' }}>
                  <TopicStack topic={q.displayTopic ?? q.topic} size="1.35rem" aspectScale={0.55} />
                </Sticker>
                {gameState.questionBet && q.text ? (
                  <>
                    {/* ставка на вопрос: текст без вариантов */}
                    <div className="font-semibold leading-snug text-[1.05rem] text-center mt-2" style={{ color: C.fg, textWrap: 'balance' } as CSSProperties}>
                      {q.text}
                    </div>
                    <span className="text-[0.8125rem] text-center" style={{ color: C.muted }}>Варианты — после ставок. Ставь, если знаешь ответ</span>
                  </>
                ) : (
                  <span className="text-[0.875rem] mt-1.5" style={{ color: C.fg }}>Ставь на то, что ответишь верно</span>
                )}
              </div>
            )}

            {isKerriMode && isGladiator && (
              <div className="flex flex-col items-center gap-3 pt-6 pb-4 text-center">
                <Sticker seed={`kerri-${gameState.roundIndex}`} slam rotate={-4} jag={7}
                  color={C.hot} textColor={C.ink} padding="10px 24px 12px">
                  <div style={{ fontFamily: DISPLAY, fontSize: '2.2rem', lineHeight: 1 }}>Ты керри</div>
                </Sticker>
                <div className="text-[1rem] mt-2" style={{ color: C.fg }}>
                  Ответишь верно — <b style={{ color: C.mint }}>+<Money v={GLADIATOR_BONUS} /></b>
                </div>
                <div className="text-[0.875rem] leading-snug max-w-[20rem]" style={{ color: C.muted }}>
                  Сейчас на тебя ставят и все смотрят. Рассуждай вслух, тяни интригу.
                </div>
              </div>
            )}

            {isKerriCrowd && q && (
              <div className="flex flex-col gap-1.5">
                {gladiator && (
                  <span className="text-[0.875rem]" style={{ color: C.muted }}>
                    Отвечает <span className="font-display text-[1.05rem]" style={{ color: C.hot }}>{gladiator.name}</span>
                  </span>
                )}
                <div className="font-semibold leading-snug text-[1rem]" style={{ color: C.fg, textWrap: 'pretty' } as CSSProperties}>
                  {q.text}
                </div>
                <span className="text-[0.8125rem] leading-snug" style={{ color: C.muted }}>
                  Ставь, какой вариант выберет керри. Угадавшие делят ставки остальных
                </span>
              </div>
            )}

            {!isGladiator && (isKerriCrowd ? <KerriOptions bet={bet} /> : <MyZone bet={bet} />)}

            <Opponents bet={bet} />
            <ItemBar inline />
          </div>

          {!isGladiator && <Dock bet={bet} />}
        </div>
      </LayoutGroup>
    </motion.div>
  )
}

// ── соперники ──────────────────────────────────────────────────────────────

/** Соперники полосой: имя, эффекты, баланс; ставка мини-кучкой и суммой (черновик — приглушённо), в керри — вариант. */
function Opponents({ bet }: { bet: Betting }) {
  const { gameState, myId, isKerriMode, isKerriCrowd, options } = bet
  const stagedBets = useGameStore(s => s.stagedBets)
  const stagedOptions = useGameStore(s => s.stagedOptions)
  const targeting = useGameStore(s => s.targeting)
  const useItem = useGameStore(s => s.useItem)
  const freshFeed = useFreshFeed()
  const others = gameState.players.filter(p => p.id !== myId)
  if (!others.length) return null

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[0.75rem]" style={{ color: targeting === 'hex' ? C.hot : C.muted }}>
        {targeting === 'hex' ? 'Кого превратить в овцу? Тапни игрока' : 'За столом'}
      </span>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: others.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr' }}>
        {others.map(p => {
          const isGlad = isKerriMode && p.id === gameState.gladiatorId
          // в смоке («для всех») — ставки не видно: ни черновика, ни суммы
          const staged = p.betHidden ? undefined : stagedBets[p.id]
          const chips = p.betHidden ? [] : staged ?? (p.betChips?.length ? p.betChips : buildChipsForPlayer(p.id, p.currentBet).map(c => c.denom))
          const amount = staged ? staged.reduce((a, d) => a + d, 0) : p.currentBet
          const canHex = targeting === 'hex' && !p.effects?.includes('hex') && !isSpectator(p)
          const feed = freshFeed.find(f => f.item === 'hex' ? f.targetId === p.id : f.playerId === p.id)
          // керри вариантов толпы не видит (сервер их не шлёт)
          const opt = !isKerriCrowd ? undefined : staged ? stagedOptions[p.id] : p.betOption
          return (
            <OpponentRow key={p.id} p={p} isGlad={isGlad} chips={chips} amount={amount} draft={!!staged} smoked={!!p.betHidden}
              option={opt !== undefined && options[opt] !== undefined ? opt : undefined}
              onTarget={canHex ? () => useItem('hex', p.id) : undefined}
              feed={feed ? <ItemIcon key={feed.at} id={feed.item} size={20} /> : null} />
          )
        })}
      </div>
    </div>
  )
}

function OpponentRow({ p, isGlad, chips, amount, draft, smoked, option, onTarget, feed }: {
  p: Player; isGlad: boolean; chips: number[]; amount: number; draft: boolean; smoked?: boolean
  option?: number; onTarget?: () => void; feed: ReactNode
}) {
  return (
    <motion.div
      onClick={onTarget}
      {...(onTarget ? pressable(onTarget, `Цель: ${p.name}`) : {})}
      whileTap={onTarget ? { scale: 0.96 } : undefined}
      className="flex flex-col justify-center gap-1 rounded-xl px-2.5 min-w-0"
      style={{
        height: '3.25rem', background: C.panel,
        border: `1.5px solid ${onTarget ? C.hot : isGlad ? `${C.hot}88` : C.line}`,
        boxShadow: onTarget ? `0 0 14px ${C.hot}66` : undefined,
        cursor: onTarget ? 'crosshair' : undefined,
        opacity: isSpectator(p) ? 0.5 : 1,
      }}
    >
      <span className="flex items-center gap-1 min-w-0 leading-none">
        <span className="font-bold text-[0.8125rem] truncate" style={{ color: C.fg }}>{p.name}</span>
        {needsBotMark(p) && <BotMark />}
        {p.bigBlind && <span className="font-display text-[0.625rem] px-1 rounded shrink-0" style={{ background: C.paper, color: C.ink }}>ББ</span>}
        <span className="shrink-0"><Marks p={p} size={15} /></span>
        {feed}
        <span className="ml-auto pl-1 text-[0.6875rem] tnum shrink-0" style={{ color: C.muted }}><Money v={p.chips} /></span>
      </span>
      <span className="flex items-center gap-1.5 leading-none min-w-0">
        {isGlad ? (
          <span className="font-display text-[0.8125rem]" style={{ color: C.hot }}>керри</span>
        ) : smoked ? (
          <span className="text-[0.75rem] font-semibold rounded-full px-2 py-0.5" style={{
            color: C.fg, background: 'radial-gradient(ellipse, rgba(147,163,156,.38), rgba(147,163,156,.12))',
          }}>в смоке</span>
        ) : (
          <>
            <MiniPile chips={chips} />
            <span className="font-display text-[0.875rem] tnum shrink-0" style={{ color: amount > 0 ? (draft ? C.muted : C.fg) : '#56665f' }}>
              {amount > 0 ? <Money v={amount} /> : <span className="text-[0.75rem]" style={{ fontFamily: 'Rubik' }}>без ставки</span>}
            </span>
            {option !== undefined && amount > 0 && (
              <span className="font-display text-[0.6875rem] leading-none px-1.5 py-0.5 rounded-full shrink-0" style={{
                background: draft ? 'transparent' : C.paper, color: draft ? C.muted : C.ink,
                border: draft ? `1px dashed ${C.muted}` : 'none',
              }}>
                {OPTION_LETTERS[option]}
              </span>
            )}
            {draft && amount > 0 && <span className="text-[0.6875rem] truncate" style={{ color: C.muted }}>думает</span>}
          </>
        )}
      </span>
    </motion.div>
  )
}

/** До пяти фишек внахлёст — чем ставка набрана. */
function MiniPile({ chips }: { chips: number[] }) {
  if (!chips.length) return null
  const shown = [...chips].sort((a, b) => b - a).slice(0, 5)
  return (
    <span className="flex shrink-0" style={{ paddingLeft: 7 }}>
      {shown.map((d, i) => (
        <span key={i} style={{ ...chipStyle(d, 16), marginLeft: -7, fontSize: 0, zIndex: shown.length - i, flexShrink: 0 }} />
      ))}
    </span>
  )
}

// ── своя ставка ────────────────────────────────────────────────────────────

/** Кучка своих фишек в зоне (общий layoutId со стопкой — фишка перелетает). Тап по фишке — вернуть. */
function Pile({ chips, slots, spread, px = PILE_PX, onRecall }: {
  chips: PhysicalChip[]; slots: Map<string, number>; spread: number; px?: number; onRecall?: (id: string) => void
}) {
  return (
    <div style={{ position: 'relative', width: 0, height: 0 }}>
      {chips.map((chip, i) => {
        const o = pileOffset(slots.get(chip.id) ?? i, chip.id, spread)
        return (
          <motion.div
            key={chip.id}
            layoutId={chip.id}
            transition={spring}
            onClick={onRecall ? e => { e.stopPropagation(); onRecall(chip.id) } : undefined}
            {...(onRecall ? pressable(() => onRecall(chip.id), `Убрать фишку $${chip.denom}`) : {})}
            style={{
              ...chipStyle(chip.denom, px), position: 'absolute', left: o.x - px / 2, top: o.y - px / 2,
              zIndex: 10 + i, cursor: onRecall ? 'pointer' : undefined,
            }}
          >
            {chip.denom}
          </motion.div>
        )
      })}
    </div>
  )
}

/** «Для всех»: кусок сукна — сюда ложатся фишки; справа внизу сумма. */
function MyZone({ bet }: { bet: Betting }) {
  const { placedChips, slots, betAmt, betConfirmed, recall } = bet
  return (
    <div className="relative rounded-[1.4rem] flex items-center" style={{
      height: '8rem', background: FELT.cloth, border: `3px solid ${FELT.edge}`,
      boxShadow: `0 0 0 2px ${FELT.trim}, 0 0 0 9px ${FELT.rail}, 0 14px 30px rgba(0,0,0,.6), inset 0 0 40px rgba(0,0,0,.45)`,
      margin: '0.6rem 0.6rem 0.4rem',
    }}>
      <div className="flex-1 h-full flex items-center justify-center">
        {placedChips.length > 0
          ? <Pile chips={placedChips} slots={slots} spread={13} onRecall={betConfirmed ? undefined : recall} />
          : <span className="text-[0.8125rem] text-center px-6" style={{ color: 'rgba(237,232,222,.55)' }}>
              Тапай по фишкам внизу — они лягут сюда
            </span>}
      </div>
      <AnimatePresence>
        {betAmt > 0 && (
          <motion.span
            initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="absolute right-3 bottom-2.5 font-display text-[1.1rem] tnum px-2.5 py-0.5 rounded-full"
            style={{ background: 'rgba(12,21,19,.8)', color: betConfirmed ? C.mint : C.fg, zIndex: 40 }}
          >
            <Money v={betAmt} />
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Толпа керри: варианты строками — какой выберет керри. Выбранный — латунью, в нём своя кучка; верный отмечен. */
function KerriOptions({ bet }: { bet: Betting }) {
  const { options, option, correctIndex, selectOption, optionTotal, betConfirmed, placedChips, slots, recall } = bet
  const onRecall = betConfirmed ? undefined : recall

  return (
    <div className="flex flex-col gap-2.5 pt-1">
      {options.map((opt, idx) => {
        const isCorrect = idx === correctIndex
        const isSel = option === idx
        const total = optionTotal(idx)
        const pick = () => selectOption(idx)
        const clickable = !betConfirmed
        return (
          <motion.div
            key={idx}
            onClick={clickable ? pick : undefined}
            {...(clickable ? pressable(pick, `Керри выберет «${opt}»`) : {})}
            whileTap={clickable ? { scale: 0.98 } : undefined}
            className="relative flex items-center gap-2.5 rounded-xl pl-2.5"
            style={{
              minHeight: '3.5rem', paddingRight: '4.5rem', paddingTop: 8, paddingBottom: 8,
              border: `2px ${isSel ? 'solid' : 'dashed'} ${isSel ? C.brass : isCorrect ? `${C.mint}88` : 'rgba(237,232,222,0.18)'}`,
              background: isSel ? 'rgba(242,182,48,0.14)' : isCorrect ? 'rgba(62,224,143,0.06)' : C.panel,
              boxShadow: isSel && !betConfirmed ? '0 0 18px rgba(242,182,48,0.25)' : 'none',
              opacity: betConfirmed && !isSel ? 0.55 : 1,
              cursor: clickable ? 'pointer' : 'default',
              transition: 'border-color .18s, background .18s, opacity .18s',
            }}
          >
            <span className="font-display text-[0.75rem] leading-none px-1.5 py-1 rounded-full shrink-0"
              style={{ background: isSel ? C.brass : C.line, color: isSel ? C.ink : C.fg }}>
              {OPTION_LETTERS[idx]}
            </span>
            <span className="text-[0.8125rem] font-semibold leading-snug"
              style={{ color: isSel ? C.brass : isCorrect ? C.mint : C.fg }}>
              {opt}
            </span>
            {isCorrect && (
              <span className="absolute -top-2.5 right-2.5 text-[0.6875rem] font-extrabold px-2 py-0.5 rounded-full"
                style={{ background: C.mint, color: C.ink }}>верный</span>
            )}
            {total > 0 && (
              <span className="absolute -bottom-2.5 right-2.5 font-display text-[0.75rem] tnum px-2 py-0.5 rounded-full"
                style={{
                  background: isSel ? C.brass : C.bg, color: isSel ? C.ink : C.fg, zIndex: 40,
                  border: isSel ? 'none' : `1px solid ${C.line}`,
                }}>
                <Money v={total} />
              </span>
            )}
            {isSel && (
              <div className="absolute" style={{ right: '2.25rem', top: '50%' }}>
                <Pile chips={placedChips} slots={slots} spread={6} px={26} onRecall={onRecall} />
              </div>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}

// ── док: стопка, быстрые ставки, подтверждение ─────────────────────────────

function Dock({ bet }: { bet: Betting }) {
  const {
    me, myStack, placedIds, isKerriCrowd, betConfirmed, option,
    place, quickAmounts, quickBet, balance, canConfirm, confirmAmount, handleConfirm, showBlind, myBlind,
    hasDraft, clearDraft, betAmt, dealing,
  } = bet
  const left = myStack.filter(c => !placedIds.has(c.id))
  const leftSum = left.reduce((a, c) => a + c.denom, 0)
  const noZone = isKerriCrowd && option === null
  const rackOff = betConfirmed || noZone
  const quickOff = noZone

  // док прибит к низу экрана; на телефоне боком (ниже 560 px) он занял бы почти весь экран — там он просто в потоке
  const shell = (children: ReactNode) => (
    <div className="relative [@media(min-height:560px)]:sticky bottom-0 z-20 px-4 pt-3 flex flex-col gap-2.5" style={{
      paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      background: C.panel, borderTop: `1.5px solid ${C.line}`, borderRadius: '1.25rem 1.25rem 0 0',
      boxShadow: '0 -14px 30px rgba(0,0,0,.55)',
    }}>
      {children}
    </div>
  )

  if (betConfirmed) {
    const amount = betAmt
    return shell(
      <div className="flex flex-col items-center gap-1.5 py-2">
        <Sticker seed={`bet-ok-${amount}`} slam rotate={-3} jag={5} color={C.mint} textColor={C.ink} padding="8px 20px 10px">
          <span className="font-display text-[1.1rem] whitespace-nowrap">
            {amount > 0 ? <>Ставка принята <Money v={amount} /></> : 'Ставка принята'}
          </span>
        </Sticker>
        <span className="text-[0.8125rem]" style={{ color: C.muted }}>Ждём остальных</span>
      </div>,
    )
  }

  return shell(
    <>
      {/* стопки: тап — фишка этого номинала в зону */}
      <div className="flex justify-between items-end">
        {DENOMS.map(d => {
          const stack = left.filter(c => c.denom === d)
          const on = stack.length > 0 && !rackOff
          const tap = () => place(d)
          return (
            <motion.div
              key={d}
              onClick={on ? tap : undefined}
              {...(on ? pressable(tap, `Поставить фишку $${d}`) : {})}
              whileTap={on ? { scale: 0.9 } : undefined}
              className="flex flex-col items-center gap-1 flex-1"
              style={{ cursor: on ? 'pointer' : 'default', opacity: stack.length === 0 ? 0.22 : rackOff ? 0.45 : 1 }}
            >
              <div style={{ position: 'relative', width: RACK_PX, height: RACK_PX + Math.max(0, stack.length - 1) * RACK_STEP }}>
                {stack.length === 0 && (
                  <div style={{ ...chipStyle(d, RACK_PX), position: 'absolute', bottom: 0, filter: 'grayscale(1)' }}>{d}</div>
                )}
                {stack.map((chip, i) => (
                  <motion.div key={chip.id} layoutId={chip.id} transition={spring}
                    style={{ ...chipStyle(d, RACK_PX), position: 'absolute', bottom: i * RACK_STEP, zIndex: i + 1 }}>
                    {d}
                  </motion.div>
                ))}
              </div>
              <span className="text-[0.6875rem] tnum font-semibold leading-none" style={{ color: C.muted }}>×{stack.length}</span>
            </motion.div>
          )
        })}
      </div>

      {/* быстрые ставки */}
      {me && balance >= 10 && (
        <div className="grid grid-cols-4 gap-2">
          {quickAmounts.map(qa => (
            <motion.button
              key={qa.label}
              onClick={quickOff ? undefined : () => quickBet(qa.amount)}
              whileTap={quickOff ? undefined : { scale: 0.92 }}
              className="flex flex-col items-center justify-center rounded-xl leading-tight"
              style={{
                height: '2.75rem', background: C.bg, opacity: quickOff ? 0.4 : 1,
                border: `1.5px solid ${qa.label === 'all-in' ? C.hot : C.line}`,
              }}
            >
              <span className="font-display text-[0.8125rem]" style={{ color: qa.label === 'all-in' ? C.hot : C.brass }}>{qa.label}</span>
              <span className="text-[0.6875rem] font-bold tnum" style={{ color: C.muted }}><Money v={qa.amount} /></span>
            </motion.button>
          ))}
        </div>
      )}

      {/* в стопке / отмена — слева; «Ставлю» или блайнд — справа */}
      <div className="flex items-center gap-3" style={{ minHeight: 48 }}>
        <div className="flex flex-col items-start leading-tight min-w-0">
          {noZone ? (
            <span className="text-[0.8125rem] font-semibold" style={{ color: C.brass }}>Сначала выбери вариант</span>
          ) : (
            <span className="text-[0.75rem] whitespace-nowrap" style={{ color: C.muted }}>
              В стопке{' '}
              <span className="font-display text-[0.9375rem] tnum" style={{ color: C.fg }}><Money v={leftSum} /></span>
            </span>
          )}
          {hasDraft && !dealing && (
            <button onClick={clearDraft} className="text-[0.8125rem] font-semibold underline underline-offset-4 py-1"
              style={{ color: C.muted }}>
              Отмена
            </button>
          )}
        </div>
        <div className="ml-auto">
          <AnimatePresence mode="popLayout">
            {canConfirm ? (
              <motion.div key="ok" initial={{ opacity: 0, scale: 0.6, rotate: -6 }} animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.7 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                style={{ pointerEvents: 'auto' }}>
                <ConfirmButton amount={confirmAmount} onClick={handleConfirm} />
              </motion.div>
            ) : showBlind ? (
              <motion.div key="blind" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="text-[0.8125rem] font-bold whitespace-nowrap rounded-full px-3 py-1.5"
                style={{ color: C.fg, background: C.bg, border: `1.5px dashed ${C.brass}` }}>
                {me?.bigBlind ? 'Большой блайнд' : 'Малый блайнд'}: <span className="font-display" style={{ color: C.brass }}><Money v={myBlind} /></span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </>,
  )
}
