// client/src/dev/Showcase.tsx — /mocks: витрины огня серии и дыма смока (сравнить варианты рядом).
import type { Player } from '@cumsino/shared'
import { NamePlate } from '../components/ui/PlayerSlot'
import { StreakFlame, FLAME_DEFAULT, type FlameStyle } from '../components/ui/StreakFlame'
import { SmokeVeil, SmokeCloud } from '../components/ui/SmokeVeil'
import { C, DISPLAY } from '../theme'

const VARIANTS: { id: FlameStyle; name: string; note: string }[] = [
  { id: 'a', name: 'a — языки', note: 'отдельные языки из трёх листов, каждый качается от основания в своей фазе' },
  { id: 'b', name: 'b — венец', note: 'сплошной венец на лист, листы дышат и клонятся вразнобой' },
  { id: 'c', name: 'c — угли', note: 'низкий венец и обрезки-искры, поднимаются и гаснут' },
]
const STREAKS = [2, 3, 5, 7]
/** ?zoom=2 — рассмотреть вблизи */
const ZOOM = Number(new URLSearchParams(window.location.search).get('zoom')) || 1

const player = (id: string, name: string, chips: number, extra: Partial<Player> = {}): Player =>
  ({ id, name, chips, currentBet: 0, hasAnswered: false, ...extra })

/** Огонь: строки — варианты, колонки — серия 2 / 3 / 5 / 7; плашка стола и ник в итогах. */
export function FlameShowcase() {
  return (
    <div className="absolute inset-0 overflow-auto" style={{ pointerEvents: 'auto', background: C.bg }}>
      <div className="flex flex-col gap-10 px-4 py-8 mx-auto" style={{ maxWidth: 1100, zoom: ZOOM }}>
        {VARIANTS.map(v => (
          <section key={v.id} className="flex flex-col gap-6">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span style={{ fontFamily: DISPLAY, fontSize: 20, color: C.fg }}>{v.name}</span>
              <span className="text-[0.8125rem]" style={{ color: C.muted }}>
                {v.note}{v.id === FLAME_DEFAULT ? ' · в игре' : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-10 gap-y-12 items-end pt-6">
              {STREAKS.map(n => (
                <div key={n} className="flex flex-col items-center gap-8">
                  <PlateWithFlame variant={v.id} p={player(`fl-${v.id}-${n}`, ['Артём', 'Света', 'Никита', 'Даша'][STREAKS.indexOf(n)], 400 + n * 70, { streak: n })} />
                  <StreakFlame streak={n} radius={6} variant={v.id}>
                    <div className="inline-block font-bold px-1.5 rounded-md" style={{ background: C.bg, fontSize: 17, color: C.fg }}>
                      серия {n}
                    </div>
                  </StreakFlame>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function PlateWithFlame({ variant, p }: { variant: FlameStyle; p: Player }) {
  // NamePlate берёт вариант из контекста — здесь подменяем явно через обёртку
  return (
    <StreakFlame streak={p.streak} variant={variant}>
      <NamePlate name={p.name} isMe={false} balance={p.chips} player={{ ...p, streak: 0 }} />
    </StreakFlame>
  )
}

/** Дым: чужая плашка, своя, ник на вопросе, строка телефона, клуб на месте кучки. */
export function SmokeShowcase() {
  const them = player('sm-1', 'Света', 740, { effects: ['smoke'], bigBlind: true, streak: 3 })
  const me = player('sm-me', 'Ты', 580, { effects: ['smoke'], streak: 2 })
  const long = player('sm-2', 'ональный трахадоr', 1240, { effects: ['smoke'] })
  return (
    <div className="absolute inset-0 overflow-auto" style={{ pointerEvents: 'auto', background: C.bg }}>
      <div className="flex flex-col gap-12 px-4 py-10 mx-auto" style={{ maxWidth: 1000, zoom: ZOOM }}>
        <Row title="Стол: соперник в смоке / он же без смока / свой в смоке">
          <NamePlate name={them.name} isMe={false} balance={them.chips} player={them} smoked />
          <NamePlate name={long.name} isMe={false} balance={long.chips} player={long} smoked />
          <NamePlate name={them.name} isMe={false} balance={them.chips} player={them} />
          <NamePlate name={me.name} isMe balance={me.chips} player={me} smoked />
        </Row>
        <Row title="Вопрос: кто ответил">
          {['Артём', 'Света', 'Никита'].map((n, i) => (
            <SmokeVeil key={n} on={i === 1} seed={`q-${n}`}>
              <span className="text-[0.8125rem] font-semibold rounded-full px-2.5 py-0.5"
                style={{ background: i === 0 ? C.brass : C.bg, color: i === 0 ? C.ink : C.muted, border: `1.5px ${i === 0 ? 'solid' : 'dashed'} ${i === 0 ? C.brass : C.line}` }}>
                {n}
              </span>
            </SmokeVeil>
          ))}
          <SmokeVeil on self seed="q-me">
            <span className="text-[0.8125rem] font-semibold rounded-full px-2.5 py-0.5"
              style={{ background: C.brass, color: C.ink, border: `1.5px solid ${C.brass}` }}>Ты</span>
          </SmokeVeil>
        </Row>
        <Row title="Телефон: строка соперника / клуб на месте кучки">
          <SmokeVeil on seed="row" style={{ display: 'flex', width: 175 }}>
            <div className="w-full rounded-xl px-2.5 flex flex-col justify-center" style={{ height: '3.25rem', background: C.panel, border: `1.5px solid ${C.line}` }}>
              <span className="font-bold text-[0.8125rem]" style={{ color: C.fg }}>Света</span>
            </div>
          </SmokeVeil>
          <div style={{ position: 'relative', width: 58, height: 28 }}>
            <SmokeCloud w={58} h={28} seed="pile" />
          </div>
        </Row>
      </div>
    </div>
  )
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-6">
      <span className="text-[0.875rem]" style={{ color: C.muted }}>{title}</span>
      <div className="flex flex-wrap items-center gap-x-12 gap-y-10 pt-4">{children}</div>
    </section>
  )
}
