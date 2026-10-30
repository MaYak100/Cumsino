import { motion, AnimatePresence } from 'framer-motion'
import { STARTING_CHIPS, WIN_CHIPS, MAX_PLAYERS } from '@cumsino/shared'
import { useGameStore } from '../../store/gameStore'
import { C, DISPLAY } from '../../theme'
import { Logo } from '../ui/Logo'
import { Sticker } from '../ui/Sticker'
import { WhoAreYou } from '../ui/WhoAreYou'
import { Money } from '../ui/Money'
import { BotMark, needsBotMark } from '../ui/BotMark'

/** Наклон от имени — у каждого свой и не меняется между рендерами. */
const tilt = (s: string) => ((s.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 9) - 4) * 0.9

export function LobbyScreen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)
  const startGame = useGameStore(s => s.startGame)
  const addBot = useGameStore(s => s.addBot)
  const removeBot = useGameStore(s => s.removeBot)
  const isHost = myId !== null && myId === gameState.hostId
  const friendName = (id?: number) => gameState.friendRoster?.find(r => r.id === id)?.name

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 pt-8 pb-12">
      <Logo size={40} animated />

      <div className="flex-1 w-full max-w-2xl flex flex-col items-center justify-center gap-8 py-6">
        <div className="flex flex-col items-center gap-3">
          <span className="text-sm" style={{ color: C.muted }}>Код комнаты</span>
          <Sticker seed={`room-${gameState.id}`} slam rotate={-2} jag={7} padding="10px 30px 14px">
            <span style={{ fontFamily: DISPLAY, fontSize: 'clamp(56px, 8vw, 88px)', letterSpacing: '0.18em', lineHeight: 1 }}>
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
          <motion.button
            onClick={startGame}
            whileHover={{ y: -3, rotate: -1 }}
            whileTap={{ scale: 0.95 }}
            className="rounded-2xl px-12 h-16 text-xl"
            style={{ fontFamily: DISPLAY, background: C.brass, color: C.ink, boxShadow: `0 6px 0 #a87a17, 0 14px 30px ${C.brass}40` }}
          >
            Начать игру
          </motion.button>
        ) : (
          <div className="text-[0.9375rem] text-center" style={{ color: C.muted }}>
            Ждём хоста. Пока не рыпайтесь.
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
