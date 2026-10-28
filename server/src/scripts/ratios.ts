// server/src/scripts/ratios.ts
// Таблица соотношений категорий: прогон N игр настоящим пикером (колоды, сглаживание, ограничения шаблонов)
// с памятью только в процессе. Показывает, что реально выпадает, а не что записано в весах.
//
//   npm run ratios --workspace=server                       # 300 игр по 24 раунда, без друзей
//   npm run ratios --workspace=server -- --friends 2 --rounds 30 --out ../docs/questions/ratios.md
import * as fs from 'fs'
import type { GameMode } from '@cumsino/shared'
import { loadLibrary } from '../game/questions/library'
import { RoomQuestions } from '../game/questions/picker'
import { QuestionHistory } from '../game/questions/history'

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}

const GAMES = Number(arg('games', '300'))
const ROUNDS = Number(arg('rounds', '24'))
const FRIENDS = Number(arg('friends', '0'))
const OUT = arg('out', '')
const CYCLE: GameMode[] = ['all', 'kerri', 'closest']
const FRIEND_IDS = [1101588971, 910030283, 841374410, 1023791464, 875585992, 1259367416, 1548018309]

const lib = loadLibrary()
const history = new QuestionHistory()
const shown = new Map<string, { mc: number; closest: number }>()   // sub → показы
const firstRepeat = new Map<string, number>()                       // sub → номер игры первого повтора
const seen = new Map<string, Set<string>>()

for (let g = 1; g <= GAMES; g++) {
  const room = new RoomQuestions(lib, history)
  const friends = FRIEND_IDS.slice(0, FRIENDS)
  for (let r = 0; r < ROUNDS; r++) {
    const mode = CYCLE[r % 3]
    const q = room.pick(mode, { friends })
    const sub = q.subcategory!
    const rec = shown.get(sub) ?? { mc: 0, closest: 0 }
    rec[mode === 'closest' ? 'closest' : 'mc']++
    shown.set(sub, rec)
    const s = seen.get(sub) ?? new Set<string>()
    if (s.has(q.id) && !firstRepeat.has(sub)) firstRepeat.set(sub, g)
    s.add(q.id)
    seen.set(sub, s)
  }
}

const totalMc = [...shown.values()].reduce((a, r) => a + r.mc, 0)
const totalCn = [...shown.values()].reduce((a, r) => a + r.closest, 0)
const pct = (x: number, t: number) => (t ? `${(100 * x / t).toFixed(1)}%` : '—')
const fmt = (x: number) => (x >= 10 ? x.toFixed(0) : x.toFixed(1))

const lines: string[] = []
lines.push(`# Соотношения категорий`, '')
lines.push(`Прогон ${GAMES} игр по ${ROUNDS} раундов (all → kerri → closest), опознано друзей: ${FRIENDS}. ` +
  `Собрано \`npm run ratios --workspace=server\` по \`server/src/game/questions/categories.ts\` и текущим банкам.`, '')
lines.push('- **MC / ближе** — доля от раундов своего типа (MC = all + kerri, «ближе всех» — closest);')
lines.push('- **за игру** — сколько вопросов подкатегории в среднем за игру;')
lines.push('- **шаблоны / карточки** — разных текстов и того, по чему идёт колода (у готовых вопросов это одно и то же; ' +
  'у статистики — герой вопроса или ответ, у друзей — человек и срез);')
lines.push('- **круг, игр** — через сколько игр колода проходит круг (карточки / за игру); **1-й повтор** — в какой игре ' +
  'подкатегория впервые повторила вопрос (у статистики повтор — тот же ответ или герой вопроса).', '')

for (const cat of lib.categories) {
  const subs = cat.subs
  const catMc = subs.reduce((a, s) => a + (shown.get(s.id)?.mc ?? 0), 0)
  const catCn = subs.reduce((a, s) => a + (shown.get(s.id)?.closest ?? 0), 0)
  lines.push(`## ${cat.title} — вес ${cat.weight}; MC ${pct(catMc, totalMc)}, ближе ${pct(catCn, totalCn)}, ` +
    `за игру ${fmt((catMc + catCn) / GAMES)}`, '')
  lines.push('| Подкатегория | вес | MC | ближе | за игру | шаблоны | карточки | круг, игр | 1-й повтор |')
  lines.push('|---|---|---|---|---|---|---|---|---|')
  for (const s of subs) {
    const r = shown.get(s.id) ?? { mc: 0, closest: 0 }
    const perGame = (r.mc + r.closest) / GAMES
    const cards = s.size.cards || (seen.get(s.id)?.size ?? 0)
    lines.push(`| ${s.title} (\`${s.id}\`) | ${s.weight} | ${pct(r.mc, totalMc)} | ${pct(r.closest, totalCn)} | ` +
      `${fmt(perGame)} | ${s.size.templates || '—'} | ${cards || '—'} | ${perGame ? fmt(cards / perGame) : '—'} | ` +
      `${firstRepeat.get(s.id) ?? '—'} |`)
  }
  lines.push('')
}

const text = lines.join('\n')
if (OUT) fs.writeFileSync(OUT, text + '\n')
console.log(text)
