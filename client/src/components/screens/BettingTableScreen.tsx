import { LayoutGroup, motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { buildChipsForPlayer, pileOffset } from '../../types/chips'
import type { PhysicalChip } from '../../types/chips'
import { useBetting, type Betting } from '../../lib/useBetting'
import { CompactBetting } from './CompactBetting'
import { QuickButton, ConfirmButton } from '../ui/BetButtons'
import { PlayerSlot, UNIT_W, UNIT_H } from '../ui/PlayerSlot'
import { BetZone } from '../ui/BetZone'
import { Timer } from '../ui/Timer'
import { FeltOval } from '../ui/TableFelt'
import { Sticker } from '../ui/Sticker'
import { TopicStack } from '../ui/Topic'
import { chipStyle } from '../../lib/chipStyle'
import { C, DISPLAY } from '../../theme'
import { FeedTag, useFreshFeed } from '../ui/AnswerProgress'
import {
  playerAngle,
  unitPosition,
  landingZone,
  FELT_CX, FELT_CY,
  SCENE_W, SCENE_H,
  useSceneScale,
  useCompactBetting,
  useFlightTransform,
  SceneScaleContext,
} from '../../lib/tableGeometry'
import { Money } from '../ui/Money'
import { GLADIATOR_BONUS } from '@cumsino/shared'
import { pressable } from '../../lib/pressable'
import { isSpectator } from '../../lib/players'

// Раскладка керри-толпы в координатах сцены (сукно: центр 650×415, внутренние полуоси 380×248).
// Кучки соперников лежат у края сукна (landingZone, компактные — BetZone size="sm"); середина рассчитана так, чтобы
// не задевать их при 3–8 игроках: напротив (y≈187, сумма до ≈235), верхние диагонали (x ≤ 435 / ≥ 865 до y≈300),
// бока (x ≤ 330), нижние диагонали (x ≤ 435 / ≥ 865 с y≈528). Сверху вниз: кто отвечает + таймер → вопрос и
// подсказка → 2×2 варианта (узкие: ниже по сукну соседи ближе; справа в варианте — место под свою кучку) → «Ставлю».
const HEAD_TOP = 256
const Q_TOP = 298
const Q_W = 540

const OPT_W = 210
const OPT_H = 80    // до четырёх строк мелкого текста
const OPT_GAP = 8
const OPT_TOP = 418
const OPT_LEFT = FELT_CX - OPT_W - OPT_GAP / 2
const CONFIRM_TOP = OPT_TOP + 2 * OPT_H + OPT_GAP + 10

// своя кучка — внутри выбранного варианта, справа (место оставлено отступом)
const CPIX_OPT = 24
const PILE_PAD = 50

/** буквы вариантов — ими подписаны кучки соперников у края сукна */
const OPTION_LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е']

// «для всех»: «Ставлю» и подпись блайнда — над своей кучкой (сбоку при 7–8 игроках лежит зона соседа)
const ABOVE_MY_PILE = 125

export function BettingTableScreen() {
  const bet = useBetting()
  const compact = useCompactBetting()
  // одна логика ставок на обе раскладки: телефон повернули — черновик на месте
  return compact ? <CompactBetting bet={bet} /> : <RoundTable bet={bet} />
}

/** Круглый стол (сцена 1300×820, масштаб под экран) — десктоп и планшет. */
function RoundTable({ bet }: { bet: Betting }) {
  const {
    gameState, myId, me, isGladiator, isKerriMode, isKerriCrowd,
    myStack, betConfirmed,
    placedIds, placedChips, slots, betAmt,
    options, option, correctIndex, selectOption, optionTotal,
    myBlind, balance, quickAmounts,
    place, recall,
    quickBet, handleConfirm, canConfirm, showBlind,
  } = bet
  const stagedBets    = useGameStore(s => s.stagedBets)
  const stagedOptions = useGameStore(s => s.stagedOptions)
  const targeting     = useGameStore(s => s.targeting)
  const useItem       = useGameStore(s => s.useItem)
  const freshFeed     = useFreshFeed()
  const sceneScale    = useSceneScale()

  const myAngle = playerAngle(0, Math.max(1, gameState.players.length))
  const myUnit = unitPosition(myAngle, UNIT_W, UNIT_H, 0)
  const stdControlsTop = landingZone(myAngle).cy - ABOVE_MY_PILE

  const players       = gameState.players
  const others        = players.filter(p => p.id !== myId)
  const orderedPlayers = me ? [me, ...others] : players
  const N             = orderedPlayers.length
  const gladiatorName = players.find(p => p.id === gameState.gladiatorId)?.name

  // ── Своя кучка в варианте (общий layoutId со стопкой — фишка перелетает; сменил вариант — кучка переезжает) ──
  const flight = useFlightTransform(sceneScale)
  const renderOptionChips = (cx: number, cy: number) =>
    placedChips.map((chip, i) => {
      const o = pileOffset(slots.get(chip.id) ?? i, chip.id, 6)
      return (
        <motion.div
          key={chip.id}
          layoutId={chip.id}
          transformTemplate={flight}
          style={{
            ...chipStyle(chip.denom, CPIX_OPT),
            position: 'absolute',
            left: cx + o.x - CPIX_OPT / 2,
            top:  cy + o.y - CPIX_OPT / 2,
            zIndex: 20 + i,
            cursor: betConfirmed ? 'default' : 'pointer',
          }}
          onClick={() => recall(chip.id)}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        >
          {chip.denom}
        </motion.div>
      )
    })

  /** толпа керри: на какой вариант стоит (или лежит черновиком) ставка соперника */
  const opponentOption = (id: string, currentBet: number, betOption?: number): { opt: number; draft: boolean } | null => {
    if (currentBet > 0 && betOption !== undefined) return { opt: betOption, draft: false }
    if (stagedBets[id]?.length && stagedOptions[id] !== undefined) return { opt: stagedOptions[id], draft: true }
    return null
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100dvh',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Сцена 1300×820, отмасштабированная под экран. Перелёт фишек по layoutId внутри scale() поправляет
          useFlightTransform (масштаб — через SceneScaleContext) */}
      <div style={{
        position: 'absolute',
        width: SCENE_W,
        height: SCENE_H,
        left: `calc(50% - ${SCENE_W / 2}px)`,
        top: `calc(50% - ${SCENE_H / 2}px)`,
        transform: `scale(${sceneScale})`,
      }}>
        <SceneScaleContext.Provider value={sceneScale}>
        <LayoutGroup>
          <div style={{ width: SCENE_W, height: SCENE_H, position: 'relative' }}>

            <FeltOval zIndex={1} />

            {/* ── Керри сам: таймер над стикером ── */}
            {isGladiator && isKerriMode && (
              <div style={{
                position: 'absolute', left: FELT_CX - 25, top: FELT_CY - 150, zIndex: 5, pointerEvents: 'none',
              }}>
                <Timer seconds={gameState.phaseTimeLeft} color={C.hot} size={50} />
              </div>
            )}

            {/* ── In-felt header: all mode — centered in felt ── */}
            {!isKerriMode && gameState.currentQuestion && (
              <div style={{
                position: 'absolute',
                left: 0, top: FELT_CY - 120,
                width: SCENE_W, zIndex: 5, pointerEvents: 'none',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center',
              }}>
                <div style={{ marginBottom: 18 }}><Timer seconds={gameState.phaseTimeLeft} /></div>
                <Sticker seed={`${gameState.currentQuestion.id}-topic`} slam rotate={-3} jag={6} padding="10px 22px 12px"
                  style={{ maxWidth: 520 }}>
                  <TopicStack topic={gameState.currentQuestion.displayTopic ?? gameState.currentQuestion.topic} size={32} aspectScale={0.5} />
                </Sticker>
                <div style={{ fontSize: 15, color: C.fg, marginTop: 22 }}>
                  Ставь на то, что ответишь верно
                </div>
              </div>
            )}

            {/* ── Center: gladiator label (only in kerri mode for the gladiator) ── */}
            {isGladiator && isKerriMode && (
              <div style={{
                position: 'absolute',
                left: FELT_CX, top: FELT_CY,
                transform: 'translate(-50%,-50%)',
                textAlign: 'center', pointerEvents: 'none', zIndex: 5,
              }}>
                <Sticker seed={`kerri-${gameState.roundIndex}`} slam rotate={-4} jag={7}
                  color={C.hot} textColor={C.ink} padding="12px 28px 14px">
                  <div style={{ fontFamily: DISPLAY, fontSize: 44, lineHeight: 1 }}>Ты керри</div>
                </Sticker>
                <div style={{ fontSize: 17, color: C.fg, maxWidth: 360, lineHeight: 1.5, margin: '22px auto 8px' }}>
                  Ответишь верно — <b style={{ color: C.mint }}>+<Money v={GLADIATOR_BONUS} /></b>
                </div>
                <div style={{ fontSize: 14, color: C.muted, maxWidth: 360, lineHeight: 1.55, margin: '0 auto' }}>
                  Сейчас на тебя ставят и все смотрят. Рассуждай вслух, тяни интригу.
                </div>
              </div>
            )}

            {/* ══ KERRI CROWD: ставка на вариант, который выберет керри ══════ */}
            {isKerriCrowd && gameState.currentQuestion && (() => {
              const q = gameState.currentQuestion!
              return (
                <>
                  {/* кто отвечает + таймер — ниже суммы ставки соседа напротив; под ним вопрос и подсказка */}
                  <div style={{
                    position: 'absolute', left: FELT_CX - Q_W / 2, width: Q_W, top: HEAD_TOP, height: Q_TOP - HEAD_TOP - 8,
                    zIndex: 5, pointerEvents: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  }}>
                    <Timer seconds={gameState.phaseTimeLeft} color={C.hot} size={32} />
                    {gladiatorName && (
                      <span style={{ fontSize: 14, color: C.muted, whiteSpace: 'nowrap' }}>
                        Отвечает <span style={{ fontFamily: DISPLAY, fontSize: 19, color: C.hot }}>{gladiatorName}</span>
                      </span>
                    )}
                  </div>
                  <div style={{
                    position: 'absolute', left: FELT_CX - Q_W / 2, width: Q_W, top: Q_TOP, zIndex: 5, pointerEvents: 'none',
                    textAlign: 'center',
                  }}>
                    <div style={{
                      color: C.fg, fontWeight: 600, lineHeight: 1.3, textWrap: 'balance',
                      fontSize: q.text.length > 140 ? 15 : 17,   // три строки до подсказки
                    } as React.CSSProperties}>
                      {q.text}
                    </div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
                      Ставь, какой вариант выберет керри. Угадавшие делят ставки остальных
                    </div>
                  </div>

                  {options.map((opt, idx) => {
                    const isCorrect = idx === correctIndex
                    const isSel = option === idx
                    const total = optionTotal(idx)
                    const zx = OPT_LEFT + (idx % 2) * (OPT_W + OPT_GAP)
                    const zy = OPT_TOP + Math.floor(idx / 2) * (OPT_H + OPT_GAP)
                    const pick = () => selectOption(idx)
                    return (
                      <div key={idx}>
                        <div
                          style={{
                            position: 'absolute', left: zx, top: zy, width: OPT_W, height: OPT_H, zIndex: 6,
                            borderRadius: 10,
                            border: `2px ${isSel ? 'solid' : 'dashed'} ${
                              isSel ? C.brass : isCorrect ? `${C.mint}88` : 'rgba(237,232,222,0.18)'}`,
                            background: isSel ? 'rgba(242,182,48,0.14)' : isCorrect ? 'rgba(62,224,143,0.06)' : 'rgba(8,17,14,0.5)',
                            boxShadow: isSel && !betConfirmed ? '0 0 20px rgba(242,182,48,0.3)' : 'none',
                            cursor: betConfirmed ? 'default' : 'pointer',
                            opacity: betConfirmed && !isSel ? 0.55 : 1,
                            display: 'flex', alignItems: 'center', padding: `7px ${PILE_PAD}px 2px 11px`,   // сверху — буква на кромке
                            transition: 'border-color .18s, background .18s, box-shadow .18s, opacity .18s',
                          }}
                          onClick={betConfirmed ? undefined : pick}
                          {...(betConfirmed ? {} : pressable(pick, `Керри выберет «${opt}»`))}
                        >
                          <span style={{
                            flex: 1, fontSize: 13, fontWeight: 600, lineHeight: 1.2,
                            color: isSel ? C.brass : isCorrect ? C.mint : C.fg,
                            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical',
                          } as React.CSSProperties}>
                            {opt}
                          </span>
                          {/* бейджи на кромке, не в строке — тексту варианта нужна вся ширина */}
                          <span style={{
                            position: 'absolute', top: -9, left: 9, fontFamily: DISPLAY, fontSize: 11, lineHeight: 1,
                            padding: '3px 6px 4px', borderRadius: 999,
                            background: isSel ? C.brass : C.line, color: isSel ? C.ink : C.fg,
                          }}>{OPTION_LETTERS[idx]}</span>
                          {isCorrect && (
                            <span style={{
                              position: 'absolute', top: -9, right: 10, fontSize: 11, fontWeight: 800, lineHeight: 1,
                              padding: '3px 7px', borderRadius: 999, background: C.mint, color: C.ink,
                            }}>верный</span>
                          )}
                          {total > 0 && (
                            <span style={{
                              position: 'absolute', bottom: -10, right: 8, zIndex: 30, fontFamily: DISPLAY, fontSize: 12, lineHeight: 1,
                              padding: '3px 7px 4px', borderRadius: 999, fontVariantNumeric: 'tabular-nums',
                              background: isSel ? C.brass : 'rgba(12,21,19,0.92)', color: isSel ? C.ink : C.fg,
                              border: isSel ? 'none' : `1px solid ${C.line}`,
                            }}>
                              <Money v={total} />
                            </span>
                          )}
                        </div>
                        {isSel && renderOptionChips(zx + OPT_W - PILE_PAD / 2 - 2, zy + OPT_H / 2)}
                      </div>
                    )
                  })}
                </>
              )
            })()}

            {/* ── Player slots + bet zones ── */}
            {orderedPlayers.map((player, i) => {
              const angle        = playerAngle(i, N)
              const { cx, cy }   = landingZone(angle)
              const isMe         = player.id === myId
              const isThisGlad   = player.id === gameState.gladiatorId

              const stagedDenoms = stagedBets[player.id]
              const betChips = isMe
                ? (isKerriCrowd ? [] : placedChips)
                : stagedDenoms !== undefined
                  ? stagedDenoms.map((denom, i) => ({ id: `${i}-${denom}-${player.id}`, denom } as PhysicalChip))
                  : player.betChips?.length
                    // та же схема id, что у черновика: подтверждение не перерисовывает фишки заново
                    ? player.betChips.map((denom, i) => ({ id: `${i}-${denom}-${player.id}`, denom } as PhysicalChip))
                    : buildChipsForPlayer(player.id, player.currentBet)
              // толпе керри — буква варианта рядом с суммой соперника (снаружи от середины: не лезет на варианты)
              const theirs = isKerriCrowd && !isMe ? opponentOption(player.id, player.currentBet, player.betOption) : null

              return (
                <div key={player.id}>
                  <PlayerSlot
                    player={player}
                    angle={angle}
                    isMe={isMe}
                    myChips={isMe ? myStack : undefined}
                    placedIds={isMe ? placedIds : undefined}
                    onDenomClick={isMe && !isThisGlad && !betConfirmed ? place : undefined}
                    onTarget={targeting === 'hex' && !isMe && !player.effects?.includes('hex') && !isSpectator(player)
                      ? () => useItem('hex', player.id) : undefined}
                    above={(() => {
                      // хекс — бирка над целью; остальное — над тем, кто применил
                      const e = freshFeed.find(f => f.item === 'hex' ? f.targetId === player.id : f.playerId === player.id)
                      return e ? <FeedTag key={e.at} item={e.item} side="left" /> : null
                    })()}
                  />
                  {/* своя кучка «для всех» и кучки соперников; своя в керри — в выбранном варианте */}
                  {(!isMe || !isKerriCrowd) && (
                    <BetZone
                      cx={cx} cy={cy}
                      chips={betChips}
                      slots={isMe ? slots : undefined}
                      mine={isMe && !isKerriCrowd}
                      onRecall={isMe && !betConfirmed && !isKerriCrowd ? recall : undefined}
                      size={isKerriMode ? 'sm' : 'md'}
                    />
                  )}
                  {theirs && options[theirs.opt] !== undefined && (
                    <div
                      title={options[theirs.opt]}
                      style={{
                        position: 'absolute', zIndex: 41, pointerEvents: 'none',
                        left: cx < FELT_CX - 5 ? cx - 34 - 26 : cx + 36, top: cy + 21,
                        minWidth: 22, height: 22, borderRadius: 999, padding: '0 6px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: DISPLAY, fontSize: 12, lineHeight: 1,
                        background: theirs.draft ? 'rgba(12,21,19,0.85)' : theirs.opt === option ? C.brass : C.paper,
                        color: theirs.draft ? C.muted : C.ink,
                        border: theirs.draft ? `1.5px dashed ${C.muted}` : 'none',
                      }}
                    >
                      {OPTION_LETTERS[theirs.opt]}
                    </div>
                  )}
                </div>
              )
            })}

          </div>
        </LayoutGroup>

        {/* ── «Ставлю»: толпа керри — под вариантами, «для всех» — над своей кучкой ── */}
        <AnimatePresence>
          {canConfirm && (
            <motion.div
              key={isKerriCrowd ? 'kerri' : 'all'}
              initial={{ opacity: 0, scale: 0.6, rotate: -6 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              style={{
                position: 'absolute', left: FELT_CX, top: isKerriCrowd ? CONFIRM_TOP : stdControlsTop,
                zIndex: 60, translateX: '-50%', pointerEvents: 'auto',
              }}
            >
              <ConfirmButton amount={betAmt} onClick={handleConfirm} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Блайнд: сколько минимум (пока ставка не дотягивает) ── */}
        <AnimatePresence>
          {showBlind && (
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{
                position: 'absolute', zIndex: 60, translateX: '-50%', left: FELT_CX, pointerEvents: 'none',
                top: isKerriCrowd ? CONFIRM_TOP + 6 : stdControlsTop + 6,
                fontSize: 15, fontWeight: 700, color: C.fg, whiteSpace: 'nowrap',
                background: 'rgba(12,21,19,0.8)', borderRadius: 999, padding: '6px 14px',
                border: `1.5px dashed ${C.brass}`,
              }}
            >
              {me?.bigBlind ? 'Большой блайнд' : 'Малый блайнд'}: <span style={{ fontFamily: DISPLAY, color: C.brass }}><Money v={myBlind} /></span>
              {isKerriCrowd && option === null && <span style={{ color: C.muted, fontWeight: 600 }}> — выбери вариант</span>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Быстрая ставка: по две кнопки с боков от моей стопки ── */}
        {!isGladiator && !betConfirmed && me && balance >= 10 && (
          <>
            {[quickAmounts.slice(0, 2), quickAmounts.slice(2)].map((col, ci) => (
              <div key={ci} style={{
                position: 'absolute', zIndex: 30, top: myUnit.top + 2,
                left: ci === 0 ? myUnit.left - 86 : myUnit.left + UNIT_W + 6,
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                {col.map(q => (
                  <QuickButton key={q.label} label={q.label} amount={q.amount}
                    disabled={isKerriCrowd && option === null} onClick={() => quickBet(q.amount)} />
                ))}
              </div>
            ))}
          </>
        )}
        </SceneScaleContext.Provider>
      </div>
    </div>
  )
}
