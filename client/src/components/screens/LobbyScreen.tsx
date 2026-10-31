import { motion, AnimatePresence } from 'framer-motion'
import { STARTING_CHIPS, WIN_CHIPS, MAX_PLAYERS } from '@cumsino/shared'
import { useGameStore } from '../../store/gameStore'
import { C, DISPLAY } from '../../theme'
import { Logo } from '../ui/Logo'
import { Sticker } from '../ui/Sticker'
import { WhoAreYou } from '../ui/WhoAreYou'
import { Money } from '../ui/Money'
import { BotMark, needsBotMark, OfflineMark } from '../ui/BotMark'

/** Наклон от имени — у каждого свой и не меняется между рендерами. */
const tilt = (s: string) => ((s.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 9) - 4) * 0.9

export function LobbyScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)
  const startGame = useGameStore(s => s.startGame)
  const addBot = useGameStore(s => s.addBot)
  const removeBot = useGameStore(s => s.removeBot)
  const setFirstGame = useGameStore(s => s.setFirstGame)
  const setSettings = useGameStore(s => s.setSettings)
  const firstGame = !!gameState.firstGame
  const jackpot = !!gameState.jackpot
  const questionBet = !!gameState.questionBet
  const isHost = myId !== null && myId === gameState.hostId
  const friendName = (id?: number) => gameState.friendRoster?.find(r => r.id === id)?.name

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 pt-6 pb-6">
      <Logo size={40} animated />

      <div className="flex-1 w-full max-w-2xl flex flex-col items-center justify-center gap-5 py-3">
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm" style={{ color: C.muted }}>Код комнаты</span>
          <Sticker seed={`room-${gameState.id}`} slam rotate={-2} jag={7} padding="10px 30px 14px">
            <span style={{ fontFamily: DISPLAY, fontSize: 'clamp(44px, min(8vw, 8.5vh), 88px)', letterSpacing: '0.18em', lineHeight: 1 }}>
              {gameState.id}
            </span>
          </Sticker>
        </div>

        <div className="w-full flex flex-col items-center gap-4">
          <span className="text-sm tnum" style={{ color: C.muted }}>За столом {gameState.players.length}</span>
          <div className="flex flex-wrap justify-center items-center gap-3" style={{ maxWidth: '37.5rem' }}>
            <AnimatePresence initial={false}>
            {gameState.players.map((p, i) => {
              const me = p.id === myId
              const friend = friendName(p.friendId)
              return (
                <motion.div key={p.id} className="relative" exit={{ opacity: 0, scale: 0.6, rotate: 8, transition: { duration: 0.18 } }}>
                  <Sticker
                    seed={p.id}
                    slam
                    delay={i * 0.05}
                    rotate={tilt(p.id)}
                    jag={4}
                    color={me ? C.brass : C.panel2}
                    textColor={me ? C.ink : p.bot ? C.muted : C.fg}
                    padding={isHost && p.bot ? '8px 34px 9px 16px' : '8px 16px 9px'}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-[1.0625rem] leading-tight max-w-[12.5rem]">
                      <span className="truncate">{p.name}</span>
                      {needsBotMark(p) && <BotMark />}
                      <OfflineMark p={p} />
                      {p.id === gameState.hostId && <span style={{ opacity: 0.55 }} className="font-semibold text-[0.8125rem] shrink-0">хост</span>}
                    </div>
                    {friend && friend !== p.name && (
                      <div className="text-[0.75rem] leading-tight" style={{ opacity: 0.7 }}>это {friend}</div>
                    )}
                  </Sticker>
                  {/* убрать бота — только хост и только в лобби (весь экран — лобби) */}
                  {isHost && p.bot && (
                    <motion.button
                      onClick={() => removeBot(p.id)}
                      whileHover={{ scale: 1.15, rotate: 90 }}
                      whileTap={{ scale: 0.85 }}
                      aria-label={`Убрать бота ${p.name}`}
                      title="Убрать бота"
                      className="absolute flex items-center justify-center rounded-full"
                      style={{
                        right: 6, top: '50%', marginTop: -12, width: 24, height: 24, zIndex: 3,
                        background: C.bg, color: C.hot, border: `1.5px solid ${C.hot}88`,
                        fontWeight: 800, fontSize: 15, lineHeight: 1,
                      }}
                    >
                      ×
                    </motion.button>
                  )}
                </motion.div>
              )
            })}
            </AnimatePresence>
            {/* пустое место за столом: хост сажает бота (соло-тесты, добор до компании) */}
            {isHost && gameState.players.length < MAX_PLAYERS && (
              <motion.button
                onClick={addBot}
                whileHover={{ y: -3, rotate: -2 }}
                whileTap={{ scale: 0.92 }}
                className="rounded-xl px-4 font-bold text-[0.9375rem]"
                style={{ height: '2.6rem', border: `2px dashed ${C.line}`, color: C.muted, background: 'transparent' }}
                title="Посадить за стол бота — он ставит и отвечает сам"
              >
                + бот
              </motion.button>
            )}
          </div>
        </div>

        <WhoAreYou />

        {isHost ? (
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <motion.button
              onClick={startGame}
              whileHover={{ y: -3, rotate: -1 }}
              whileTap={{ scale: 0.95 }}
              className="rounded-2xl px-12 h-16 text-xl"
              style={{ fontFamily: DISPLAY, background: C.brass, color: C.ink, boxShadow: `0 6px 0 #a87a17, 0 14px 30px ${C.brass}40` }}
            >
              Начать игру
            </motion.button>
            <div className="flex flex-col gap-2 [@media(max-height:760px)]:gap-1.5">
              <HostToggle on={jackpot} onToggle={() => setSettings({ jackpot: !jackpot })}
                label="Джекпот" hint="пустые раунды копят банк"
                title="Режим «для всех»: все ошиблись — ставки уходят в банк, его забирают угадавшие следующего раунда. Все угадали — каждому бонус от казино. Работает, когда ставят хотя бы двое" />
              <HostToggle on={questionBet} onToggle={() => setSettings({ questionBet: !questionBet })}
                label="Ставка на вопрос" hint="на ставках виден вопрос без вариантов"
                title="Режим «для всех»: на ставках виден текст вопроса (без вариантов), ставки 20 с, на ответ 15 с, молния — первые 1.5 с. Выключено — ставишь по теме, как раньше" />
              <HostToggle on={firstGame} onToggle={() => setFirstGame(!firstGame)}
                label="Играем впервые" hint="предметы откроются по два за лавку"
                title="Предметы в лавке открываются не сразу, а по два за лавку: манта и гем, потом блинк и BKB, потом хекс и смок. Аегис — всегда" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-[0.9375rem] text-center" style={{ color: C.muted }}>
            <span>Ждём хоста. Пока не рыпайтесь.</span>
            {(jackpot || questionBet) && (
              <span style={{ color: C.brass }}>
                {[jackpot && 'джекпот', questionBet && 'ставка на вопрос'].filter(Boolean).join(' и ').replace(/^./, c => c.toUpperCase())}
              </span>
            )}
            {firstGame && <span style={{ color: C.brass }}>Играем впервые: предметы откроются по два за лавку</span>}
          </div>
        )}
      </div>

      {/* правила одной линией: старт → финиш */}
      <div className="w-full max-w-md">
        <div className="relative h-2 rounded-full" style={{ background: C.line }}>
          <div className="absolute left-0 top-0 h-full rounded-full"
            style={{ width: `${(STARTING_CHIPS / WIN_CHIPS) * 100}%`, background: C.brass }} />
        </div>
        <div className="flex justify-between mt-2 text-[0.8125rem] tnum" style={{ color: C.muted }}>
          <span>У всех по <Money v={STARTING_CHIPS} /></span>
          <span>Первый до <b style={{ color: C.fg }}><Money v={WIN_CHIPS} /></b> побеждает</span>
        </div>
      </div>
    </div>
  )
}

/** Галочка хоста в лобби: «Играем впервые» (сервер — lockedItems), «Джекпот», «Ставка на вопрос» (set_settings). */
function HostToggle({ on, onToggle, label, hint, title }: {
  on: boolean; onToggle: () => void; label: string; hint: string; title: string
}) {
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      whileTap={{ scale: 0.95 }}
      className="flex items-center gap-3 text-left"
      title={title}
    >
      <span className="flex items-center justify-center rounded-md shrink-0"
        style={{ width: 28, height: 28, border: `2px solid ${on ? C.brass : C.line}`, background: on ? C.brass : 'transparent' }}>
        <AnimatePresence>
          {on && (
            <motion.svg key="tick" width={18} height={18} viewBox="0 0 18 18"
              initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}>
              <path d="M3.5 9.5 L7.5 13 L14.5 4.5" fill="none" stroke={C.ink} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
          )}
        </AnimatePresence>
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-bold text-[1rem]" style={{ color: on ? C.brass : C.fg }}>{label}</span>
        {/* невысокий экран — без подсказки (полный текст в title): лобби без прокрутки */}
        <span className="text-[0.8125rem] [@media(max-height:760px)]:hidden" style={{ color: C.muted }}>{hint}</span>
      </span>
    </motion.button>
  )
}
