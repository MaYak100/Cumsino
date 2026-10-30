// client/src/dev/DevPage.tsx
// Лаборатория вопросов (/dev): настоящие вопросы с сервера (server/src/dev/questionLab.ts) на настоящих экранах игры.
// Выбираешь режим, категорию и подкатегорию, листаешь вопросы и стадии раунда; состояние кладётся прямо в gameStore,
// сокет не подключается. Сбоку — метаданные вопроса и id, чтобы сообщить о плохом вопросе.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { FriendProfile } from '@cumsino/shared'
import { useGameStore, selectIsGladiator } from '../store/gameStore'
import { screenFor } from '../components/screens/screenFor'
import { LateJoinScreen } from '../components/screens/LateJoinScreen'
import { TableFelt } from '../components/ui/TableFelt'
import { ItemBar } from '../components/ui/ItemBar'
import { Notice } from '../components/ui/Notice'
import { fetchCatalog, fetchQuestion, resetSession, LabError, SERVER_URL, type LabCatalog, type LabQuestion } from './labApi'
import { labState, LAB_MODES, STAGES, gameModeOf, stageAllowed, MY_ID, type LabMode, type Stage } from './labState'
import { SCENARIOS } from './scenarios'

const GOLD = '#fbbf24'
const TEXT = '#e5e7eb'
const MUTED = '#c4c9d4'
const OK = '#4ade80'
const BAD = '#f87171'

const PREFS_KEY = 'cumsino-lab'

interface Prefs { mode: LabMode; cat: string; sub: string; count: number; friends: number[]; panel: boolean }
const DEFAULT_PREFS: Prefs = { mode: 'all', cat: '', sub: '', count: 4, friends: [], panel: true }

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
  } catch {
    return DEFAULT_PREFS
  }
}

function savePrefs(p: Prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* приватное окно — не страшно */ }
}

const newSession = () => `lab-${Math.random().toString(36).slice(2, 10)}`

// ── экран игры, как в App.tsx ────────────────────────────────────────────────

function GameView({ screenKey }: { screenKey: string }) {
  const gameState = useGameStore(s => s.gameState)
  const isGladiator = useGameStore(selectIsGladiator)
  const isLateJoiner = useGameStore(s => s.isLateJoiner)
  if (!gameState) return null
  const Screen = isLateJoiner ? LateJoinScreen : screenFor(gameState.phase, gameState.mode, isGladiator)
  return (
    <div className="stage" style={{ height: '100dvh', overflow: 'hidden', position: 'relative' }}>
      {!isLateJoiner && <TableFelt blurred={gameState.phase !== 'BETTING'} />}
      <AnimatePresence>
        <motion.div
          key={screenKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -12, pointerEvents: 'none', transition: { duration: 0.15 } }}
          transition={{ duration: 0.4 }}
          style={{ position: 'absolute', inset: 0, overflowY: 'auto', pointerEvents: 'auto' }}
        >
          <Screen />
        </motion.div>
      </AnimatePresence>
      <ItemBar />
      <Notice />
    </div>
  )
}

// ── мелкие куски панели ──────────────────────────────────────────────────────

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid #1f2a1f' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: MUTED, opacity: 0.7 }}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  )
}

function Pill({ active, disabled, onClick, children, title }: {
  active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode; title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '4px 9px', borderRadius: 6, fontSize: 12, lineHeight: 1.3,
        border: `1px solid ${active ? GOLD : '#2c3a2c'}`,
        background: active ? 'rgba(251,191,36,0.12)' : '#0f150f',
        color: disabled ? '#4b5563' : active ? GOLD : TEXT,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

const selectStyle: CSSProperties = {
  width: '100%', background: '#0f150f', color: TEXT, border: '1px solid #2c3a2c', borderRadius: 6,
  padding: '5px 6px', fontSize: 12,
}

const kbd: CSSProperties = {
  display: 'inline-block', minWidth: 16, padding: '0 4px', marginRight: 4, borderRadius: 3, textAlign: 'center',
  border: '1px solid #3a4a3a', fontSize: 10, color: MUTED, fontFamily: 'monospace',
}

function Row({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, lineHeight: 1.45, marginBottom: 2 }}>
      <span style={{ color: MUTED, flexShrink: 0, width: 74 }}>{k}</span>
      <span style={{ color: TEXT, wordBreak: 'break-word', fontFamily: mono ? 'monospace' : undefined }}>{v}</span>
    </div>
  )
}

// ── страница ─────────────────────────────────────────────────────────────────

export function DevPage() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const { mode, cat, sub, count, friends, panel } = prefs
  const patch = useCallback((p: Partial<Prefs>) => setPrefs(prev => {
    const next = { ...prev, ...p }
    savePrefs(next)
    return next
  }), [])

  const [catalog, setCatalog] = useState<LabCatalog | null>(null)
  const [offline, setOffline] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState(newSession)
  const [list, setList] = useState<LabQuestion[]>([])
  const [pos, setPos] = useState(-1)
  const [stage, setStage] = useState<Stage>('question')
  const [myAnswer, setMyAnswer] = useState<string | number | undefined>(undefined)
  const [scenario, setScenario] = useState<string | null>(null)
  const [idInput, setIdInput] = useState('')
  const [copied, setCopied] = useState(false)

  const current = pos >= 0 ? list[pos] : null
  const gm = gameModeOf(mode)
  const kind = gm === 'closest' ? 'closest' : 'mc'

  // ── каталог ──
  const loadCatalog = useCallback(() => {
    setOffline(null)
    fetchCatalog().then(setCatalog).catch((e: Error) => setOffline(e.message))
  }, [])
  useEffect(loadCatalog, [loadCatalog])

  const roster: FriendProfile[] = useMemo(() => catalog?.friends.map(f => ({ id: f.id, name: f.name })) ?? [], [catalog])
  const categories = useMemo(() => (catalog?.categories ?? []).filter(c => c.subs.some(s => s.kinds.includes(kind))), [catalog, kind])
  const category = categories.find(c => c.id === cat) ?? null
  const subs = category?.subs.filter(s => s.kinds.includes(kind)) ?? []
  const friendsShort = !!category?.requires && friends.length < (catalog?.minFriends ?? 2)

  // ── действия стора: без сокета ──
  useEffect(() => {
    useGameStore.setState({
      connect: () => {},
      startGame: () => {},
      sendHover: () => {},
      payBribe: () => {},
      submitAnswer: answer => setMyAnswer(answer as string | number),
      identify: friendId => useGameStore.setState(s => s.gameState ? {
        gameState: { ...s.gameState, players: s.gameState.players.map(p => p.id === MY_ID ? { ...p, friendId: friendId ?? undefined } : p) },
      } : {}),
      // оценку экран ставит через setRating: подменяем его — выбор виден на
      // шкале, но на сервер не уходит (настоящий setRating отправил бы rate_question через сокет)
      setRating: (questionId, patch) => {
        useGameStore.setState(s => {
          const cur = s.rating?.questionId === questionId ? s.rating : { questionId, score: null, difficulty: null }
          const next = { ...cur }
          if (patch.score !== undefined) next.score = cur.score === patch.score ? null : patch.score
          if (patch.difficulty !== undefined) next.difficulty = cur.difficulty === patch.difficulty ? null : patch.difficulty
          return { rating: next }
        })
        console.info('[лаборатория] оценка не отправляется:', questionId, patch)
      },
      reset: () => setScenario(null),
    })
  }, [])

  // ── вопрос ──
  const validSub = subs.some(s => s.id === sub) ? sub : null
  /** byId — конкретный вопрос; keep — тот же вопрос в другом режиме, а не вышло — следующий из среза */
  const fetchNext = useCallback(async (byId?: string, keep = false) => {
    if (!catalog) return
    setLoading(true)
    setError(null)
    setNotice(null)
    // список и позиция — от одной базы: смена режима может запустить два запроса разом, и pos не должен
    // уехать за конец списка («6 из 5», пустой экран)
    const base = pos
    try {
      const ask = (id?: string) => fetchQuestion({ session, mode: gm, cat: category?.id ?? null, sub: validSub, id, friends })
      const got = keep && byId ? await ask(byId).catch(() => ask()) : await ask(byId)
      setList(prev => [...prev.slice(0, base + 1), got])
      setPos(base + 1)
      setMyAnswer(undefined)
      setScenario(null)
      setStage(st => (st === 'answer' ? 'question' : st))   // новый вопрос — сначала без ответа
      if (got.wrapped) setNotice('Срез пройден целиком — пошёл новый круг, вопросы повторяются')
    } catch (e) {
      if (e instanceof LabError && e.offline) setOffline(e.message)
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [catalog, session, gm, category, validSub, friends, pos])

  const next = useCallback(() => {
    if (pos < list.length - 1 && list[pos + 1].question.mode === gm) {
      setPos(pos + 1)
      setMyAnswer(undefined)
      setScenario(null)
      setStage(st => (st === 'answer' ? 'question' : st))
    } else fetchNext()
  }, [pos, list, gm, fetchNext])

  const prev = useCallback(() => {
    if (pos <= 0) return
    setPos(pos - 1)
    setMyAnswer(undefined)
    setScenario(null)
  }, [pos])

  // первый вопрос — как только есть каталог. Сменился срез — новый вопрос из него; сменился только режим — тот же
  // вопрос в новом режиме (числовой факт годится и в MC, и в «кто ближе»), если он там бывает
  // друзья меняют срез только в категории «Друзья»: в остальных они на вопрос не влияют
  const sliceKey = `${cat}|${sub}|${category?.requires === 'friends' ? friends.join(',') : ''}`
  const lastSlice = useRef<{ slice: string; gm: string } | null>(null)
  useEffect(() => {
    if (!catalog) return
    const was = lastSlice.current
    lastSlice.current = { slice: sliceKey, gm }
    if (!was) { if (!current) fetchNext(); return }
    if (was.slice !== sliceKey) fetchNext()
    else if (was.gm !== gm) {
      if (current) fetchNext(current.question.id, true)
      else fetchNext()
    }
  }, [catalog, sliceKey, gm])

  // ставки в «кто ближе» не бывает
  useEffect(() => {
    if (!stageAllowed(mode, stage)) setStage('question')
  }, [mode, stage])

  // текущий вопрос + стадия → стор
  useEffect(() => {
    if (scenario) {
      const sc = SCENARIOS.find(s => s.id === scenario)
      if (sc) useGameStore.setState(sc.build(count, roster))
      return
    }
    if (!current || current.question.mode !== gm) return
    useGameStore.setState(labState({ q: current.question, mode, stage, count, friends, myAnswer }))
  }, [current, mode, gm, stage, count, friends, myAnswer, scenario, roster])

  const copyId = useCallback(() => {
    if (!current) return
    navigator.clipboard?.writeText(current.question.id).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }).catch(() => {})
  }, [current])

  const reveal = useCallback(() => {
    setScenario(null)
    setStage(s => (s === 'answer' ? 'question' : 'answer'))
  }, [])

  // ── горячие клавиши ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'arrowright' || k === 'n' || k === 'т') { e.preventDefault(); next() }
      else if (k === 'arrowleft' || k === 'b' || k === 'и') { e.preventDefault(); prev() }
      else if (k === 'r' || k === 'к') reveal()
      else if (k === 'c' || k === 'с') copyId()
      else if (k === 'h' || k === 'р') patch({ panel: !panel })
      else {
        const st = STAGES.find(s => s.key === k)
        if (st && stageAllowed(mode, st.id)) { setScenario(null); setStage(st.id) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, reveal, copyId, patch, panel, mode])

  const q = current?.question
  const meta = current?.meta
  const showGame = !!scenario || (!!q && q.mode === gm)
  const screenKey = scenario ? `sc|${scenario}|${count}` : `${stage === 'answer' ? 'question' : stage}|${q?.id}|${q?.text}|${mode}`

  return (
    <div style={{ height: '100dvh', overflow: 'hidden', position: 'relative', background: '#060606' }}>
      {showGame ? <GameView screenKey={screenKey} /> : (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 14, padding: 24, textAlign: 'center' }}>
          {offline ?? (loading ? 'Загружаю вопрос…' : error ?? 'Нет вопроса')}
        </div>
      )}

      {/* ── Панель ── */}
      {!panel ? (
        <button
          onClick={() => patch({ panel: true })}
          title="Панель лаборатории (H)"
          style={{
            position: 'fixed', top: 10, left: 10, zIndex: 100, padding: '6px 10px', borderRadius: 8,
            background: 'rgba(10,14,10,0.9)', border: '1px solid #2c3a2c', color: GOLD, fontSize: 13, cursor: 'pointer',
          }}
        >
          ≡ лаборатория
        </button>
      ) : (
        <div style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, width: 330, zIndex: 100, overflowY: 'auto',
          background: 'rgba(8,11,8,0.96)', borderRight: '1px solid #1f2a1f', color: TEXT,
          fontFamily: 'system-ui, sans-serif', boxShadow: '4px 0 24px rgba(0,0,0,0.5)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #1f2a1f' }}>
            <div>
              <div style={{ color: GOLD, fontWeight: 800, fontSize: 15, letterSpacing: '.04em' }}>Лаборатория вопросов</div>
              <div style={{ color: MUTED, fontSize: 11 }}>
                {catalog?.stats ? `статистика ${catalog.stats.patch}, снимок ${catalog.stats.snapshot}` : SERVER_URL}
              </div>
            </div>
            <button onClick={() => patch({ panel: false })} title="Скрыть (H)" style={{ background: 'none', border: 'none', color: MUTED, fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>

          {offline && (
            <div style={{ margin: 12, padding: 10, borderRadius: 8, border: `1px solid ${BAD}`, background: 'rgba(127,29,29,0.25)', fontSize: 12, lineHeight: 1.5 }}>
              <div style={{ color: BAD, fontWeight: 700, marginBottom: 4 }}>Нет связи с сервером</div>
              <div style={{ color: TEXT }}>{offline}</div>
              <div style={{ color: MUTED, marginTop: 6 }}>В корне репозитория: <code style={{ color: GOLD }}>npm run dev:server</code></div>
              <div style={{ marginTop: 8 }}><Pill onClick={loadCatalog}>Проверить снова</Pill></div>
            </div>
          )}

          <Section title="Режим">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {LAB_MODES.map(m => (
                <Pill key={m.id} active={mode === m.id && !scenario} onClick={() => { setScenario(null); patch({ mode: m.id }) }}>{m.label}</Pill>
              ))}
            </div>
          </Section>

          <Section title="Категория и подкатегория">
            <select
              value={category ? cat : ''}
              onChange={e => patch({ cat: e.target.value, sub: '' })}
              style={{ ...selectStyle, marginBottom: 6 }}
            >
              <option value="">Любая — по весам, как в игре</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.title}{c.requires ? ' (нужны друзья)' : ''}</option>)}
            </select>
            {category && (
              <select value={subs.some(s => s.id === sub) ? sub : ''} onChange={e => patch({ sub: e.target.value })} style={selectStyle}>
                <option value="">Любая подкатегория — по весам</option>
                {subs.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.title} · {kind === 'mc' ? s.counts.mc : s.counts.closest}{s.source === 'stats' ? ' карт.' : s.source === 'friends' ? ' сочет.' : ' вопр.'}
                    {(kind === 'mc' ? s.weight : s.closestWeight) !== 1 ? ` · вес ${kind === 'mc' ? s.weight : s.closestWeight}` : ''}
                  </option>
                ))}
              </select>
            )}
            {category && (
              <div style={{ fontSize: 11, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>
                {category.subs.map(s => (
                  <div key={s.id} style={{ opacity: s.kinds.includes(kind) ? 1 : 0.45 }}>
                    <span style={{ fontFamily: 'monospace' }}>{s.id}</span> — {s.source}
                    {s.counts.number !== undefined
                      ? `: ${s.counts.number} числ. / ${s.counts.choice} с вариантами`
                      : `: ${s.counts.mc || s.counts.closest} (${s.kinds.join(', ')})`}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {roster.length > 0 && (
            <Section title="Друзья — кто опознан" right={
              <span style={{ fontSize: 11, color: friends.length >= (catalog?.minFriends ?? 2) ? OK : MUTED }}>
                {friends.length} / нужно ≥ {catalog?.minFriends ?? 2}
              </span>
            }>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {roster.map(f => {
                  const on = friends.includes(f.id)
                  return (
                    <Pill key={f.id} active={on} onClick={() => patch({ friends: on ? friends.filter(x => x !== f.id) : [...friends, f.id] })}
                      title={catalog?.friends.find(x => x.id === f.id)?.open ? 'открытый профиль' : 'аноним: только игры в пати'}>
                      {f.name}
                    </Pill>
                  )
                })}
              </div>
              {friendsShort && <div style={{ fontSize: 11, color: BAD, marginTop: 6 }}>«Друзья» выпадают, только когда опознаны ≥ {catalog?.minFriends ?? 2}</div>}
            </Section>
          )}

          <Section title="Стадия раунда">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {STAGES.map(s => (
                <Pill key={s.id} active={!scenario && stage === s.id} disabled={!stageAllowed(mode, s.id)}
                  title={stageAllowed(mode, s.id) ? `клавиша ${s.key}` : 'в «кто ближе» ставок нет'}
                  onClick={() => { setScenario(null); setStage(s.id) }}>
                  <span style={{ opacity: 0.5, marginRight: 4 }}>{s.key}</span>{s.label}
                </Pill>
              ))}
            </div>
          </Section>

          <Section title="Вопросы" right={<span style={{ fontSize: 11, color: MUTED }}>{list.length ? `${pos + 1} из ${list.length}` : ''}</span>}>
            <div style={{ display: 'flex', gap: 6 }}>
              <Pill onClick={prev} disabled={pos <= 0}>← Назад</Pill>
              <Pill onClick={next} disabled={!catalog || loading || friendsShort} active>{loading ? '…' : 'Следующий →'}</Pill>
              <Pill onClick={reveal} disabled={!q}>{stage === 'answer' ? 'Скрыть ответ' : 'Показать ответ'}</Pill>
            </div>
            <form
              onSubmit={e => { e.preventDefault(); if (idInput.trim()) fetchNext(idInput.trim()) }}
              style={{ display: 'flex', gap: 6, marginTop: 8 }}
            >
              <input
                value={idInput}
                onChange={e => setIdInput(e.target.value)}
                placeholder="id вопроса, напр. num:heart:cost:max"
                style={{ ...selectStyle, fontFamily: 'monospace', flex: 1 }}
              />
              <Pill onClick={() => idInput.trim() && fetchNext(idInput.trim())} disabled={!catalog || !idInput.trim()}>Найти</Pill>
            </form>
            {error && <div style={{ fontSize: 12, color: BAD, marginTop: 6 }}>{error}</div>}
            {notice && <div style={{ fontSize: 12, color: GOLD, marginTop: 6 }}>{notice}</div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
              <Pill onClick={() => { resetSession(session).catch(() => {}); setSession(newSession()); setNotice('Колоды сброшены: следующие вопросы — с чистого листа') }}>
                Сбросить колоды
              </Pill>
              <span style={{ fontSize: 11, color: MUTED }}>без повторов в пределах сессии</span>
            </div>
          </Section>

          {q && meta && q.mode === gm && (
            <Section title="Вопрос" right={
              <button onClick={copyId} title="Скопировать id (C)" style={{ background: 'none', border: 'none', color: copied ? OK : GOLD, fontSize: 11, cursor: 'pointer' }}>
                {copied ? '✓ скопировано' : 'копировать id'}
              </button>
            }>
              <div style={{ fontFamily: 'monospace', fontSize: 12, color: GOLD, wordBreak: 'break-all', marginBottom: 6 }}>{q.id}</div>
              <Row k="Категория" v={`${meta.categoryTitle} → ${meta.subTitle}`} />
              <Row k="id подкат." v={meta.sub} mono />
              <Row k="Источник" v={meta.source === 'bank' ? `банк, ${meta.bankKind === 'number' ? 'числовой факт' : 'готовые варианты'}` : meta.source === 'stats' ? 'статистика (собран сейчас)' : 'друзья (собран сейчас)'} />
              <Row k="Тема" v={(q.displayTopic ?? q.topic).replace('\n', ' / ')} />
              {meta.step !== undefined && <Row k="Шаг" v={`${meta.step}${meta.unit ? ` (${meta.unit})` : ''}`} />}
              <Row k="Ответ" v={<span style={{ color: OK }}>{q.answer ?? q.numericAnswer}{q.numericAnswer !== undefined && meta.unit ? ` ${meta.unit}` : ''}</span>} />
              {q.options && (
                <div style={{ margin: '6px 0' }}>
                  {q.options.map((o, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, fontSize: 12, lineHeight: 1.4, color: o === q.answer ? OK : TEXT }}>
                      <span style={{ color: MUTED, width: 12 }}>{'ABCD'[i]}</span>
                      <span style={{ flex: 1 }}>{o}</span>
                      {q.optionNotes?.[i] && <span style={{ color: MUTED, fontFamily: 'monospace' }}>{q.optionNotes[i]}</span>}
                    </div>
                  ))}
                </div>
              )}
              {q.comment && <Row k="Коммент." v={<span style={{ color: MUTED }}>{q.comment}</span>} />}
              {myAnswer !== undefined && (
                <Row k="Мой ответ" v={<span style={{ color: myAnswer === (q.answer ?? q.numericAnswer) ? OK : BAD }}>{String(myAnswer)}</span>} />
              )}
            </Section>
          )}

          <Section title="Игроки" right={<span style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>{count}</span>}>
            <input type="range" min={2} max={10} value={count} onChange={e => patch({ count: Number(e.target.value) })}
              style={{ width: '100%', accentColor: GOLD }} />
          </Section>

          <Section title="Экраны вне раунда">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {SCENARIOS.map(s => (
                <Pill key={s.id} active={scenario === s.id} onClick={() => setScenario(scenario === s.id ? null : s.id)}>{s.label}</Pill>
              ))}
            </div>
          </Section>

          <div style={{ padding: '10px 12px', fontSize: 11, color: MUTED, lineHeight: 1.8 }}>
            <div><span style={kbd}>→</span>следующий <span style={kbd}>←</span>назад <span style={kbd}>R</span>ответ</div>
            <div><span style={kbd}>1</span>–<span style={kbd}>5</span>стадия <span style={kbd}>C</span>копировать id <span style={kbd}>H</span>панель</div>
            <div style={{ opacity: 0.7 }}>Оценки, ставки и ответы никуда не уходят: сокета нет, в Neon ничего не пишется.</div>
            {catalog?.warnings.map(w => <div key={w} style={{ color: BAD }}>{w}</div>)}
          </div>
        </div>
      )}
    </div>
  )
}
