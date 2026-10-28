# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development (run from repo root)

```bash
# Start server (hot-reload via tsx watch)
npm run dev:server
# or
npm run dev --workspace=server

# Start client (Vite dev server, port 5173 или следующий свободный)
npm run dev --workspace=client

# Run server tests (vitest)
npm run test:server
# or
npm run test --workspace=server

# Run a single test file
npx vitest run server/src/game/economy/__tests__/applyBankBets.test.ts --config server/vitest.config.ts

# Run shared chips tests (uses server vitest config for @cumsino/shared alias)
npx vitest run shared/src/__tests__/chips.test.ts --config server/vitest.config.ts

# Watch mode for tests
npm run test:watch --workspace=server
```

### UI Preview (без сервера)

```bash
# Запустить клиент и открыть в браузере:
npm run dev --workspace=client
# → http://localhost:5173/cumsino/dev
```

Страница `/dev` позволяет открыть любой экран игры напрямую без сервера и без прохождения игрового цикла. Слева свёрнутая панель `≡` — сценарии по всем фазам: LOBBY, ANNOUNCE (all / kerri / closest / популярность+comment), BETTING (all / kerri-crowd / kerri-гладиатор), QUESTION_TEXT, QUESTION (all / all+ответ+comment / all+ответ+значения / all+значения+длинные варианты / kerri-crowd / kerri-гладиатор / kerri-гладиатор+comment / kerri-гладиатор+значения / closest / closest+ответ), REVEAL (all / all+comment / kerri / closest / 10 игроков), GAME_OVER, LATE JOIN. Вверху панели — слайдер **Игроки 2–10**: меняет количество игроков во всех сценариях в реальном времени. `PLAYER_POOL` из 10 именованных игроков в `mockStates.ts`.

Файлы: `client/src/dev/mockStates.ts` (сценарии), `client/src/dev/DevPage.tsx` (страница). Маршрут: `main.tsx` проверяет `window.location.pathname.endsWith('/dev')`.

Чтобы добавить сценарий — добавить элемент в `SCENARIOS` в `mockStates.ts`.

### TypeScript checks

```bash
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
```

### Production build

```bash
# Must build shared first, then server
npm run build --workspace=shared
npm run build --workspace=server

# Client build (Vite resolves shared via alias, no pre-build needed)
npm run build --workspace=client
```

## Architecture

npm workspaces monorepo: `shared/`, `server/`, `client/`.

### `@cumsino/shared`

Single source of truth for types, constants, and chip decomposition. Consumed by both server and client.

- `src/types.ts` — all interfaces: `Player`, `GameState`, `Question`, `RoundResult`, socket payloads. `GameMode = 'all' | 'kerri' | 'closest' | 'top5'`. `GameState` includes `hostId: string` (first player to join). `Question` has optional `displayTopic?: string` (human-readable topic for UI — hero name, item name, or subcategory) and `comment?: string` (explanatory note shown after correct answer is revealed) and `optionNotes?: string[]` (true value of each option by index — «610», «64%», up to ~6 chars). `comment` and `optionNotes` are excluded from `GameState.currentQuestion` and delivered only in `round_results` (otherwise values leak the answer). `constants.ts`: `ANSWER_REVEAL_MS=2500`, `ANSWER_REVEAL_NOTES_MS=4500`.
- `src/constants.ts` — `STARTING_CHIPS=500`, `WIN_CHIPS=3000`, `GLADIATOR_BONUS=300`, `PHASE_DURATIONS`, etc.
- `src/chips.ts` — `decomposeToChips(amount)`: splits into denominations (80% large: 500/100, 20% small: 50/20/10), then `normalizeMax7()` upgrades excess stacks (>7 chips) to the next larger denom. `decomposeStartingChips()`: fixed breakdown `4×100+1×50+1×20+3×10=500`.

**Import resolution:** Both Vite (client) and vitest (server) alias `@cumsino/shared` → `../shared/index.ts` (raw TS source). The compiled `shared/dist/` is only used in production Render.com builds. The server `tsconfig.json` has **no `paths` block** — npm workspaces symlink handles resolution; adding `paths` here causes TS6059 (file outside rootDir).

### Server (`server/src/`)

Pure in-memory state, no database.

- **`index.ts`** — Express + Socket.IO setup. `CLIENT_ORIGIN` defaults to `/^http:\/\/localhost(:\d+)?$/` for local dev; set `CLIENT_ORIGIN` env var in production.
- **`game/GameRoom.ts`** — Core state machine. Extends EventEmitter. `hostId` = socket id of first `addPlayer` call; `start(requesterId)` rejects if requester is not host. Phase transitions via `schedulePhase()` / `onPhaseEnd()` — **`all` and `kerri` go through BETTING; `closest` skips BETTING** (ANNOUNCE→QUESTION_TEXT directly). In kerri mode, `selectGladiator()` runs at ANNOUNCE→BETTING transition. `placeBankBet(playerId, optionIndex, amount)` stores crowd's side-bet. `stageChip(playerId, chips)` relays `chip_staged` broadcast to others (no state change — visual preview only). `calculateResults()` calls `applyBankBets()` after main pool distribution. `advanceFromQuestion()` broadcasts `round_results` with `correctAnswer`, `correctNumericAnswer`, `comment`, `optionNotes`, `mode`, `gladiatorId`, then waits **`ANSWER_REVEAL_MS` (2500ms)**, or `ANSWER_REVEAL_NOTES_MS` (4500ms) when the question has `optionNotes`, before calling `schedulePhase('REVEAL')` — clients remain in QUESTION phase showing the correct answer highlight. `submitAnswer()` blocks non-gladiator answers in kerri mode. `revealing` flag (set in `advanceFromQuestion`, cleared in `nextRound`): during the reveal window the round is already settled — late answers and a gladiator disconnect are ignored, `advanceFromQuestion` is idempotent (no double payout). Emits three events wired by GameEngine: `broadcast`, `broadcastExcept`, `sendToPlayer`. `getStateForPlayer(playerId)` returns personalized state — crowd players receive `gladiatorAnswer` (= correct answer string), kerri player does not. `getPublicState()` strips `bankBet` from player objects.
- **`game/GameEngine.ts`** — Manages `rooms: Map<gameCode, GameRoom>` and `playerRoom: Map<socketId, gameCode>`. When last player leaves, calls `room.destroy()` and removes from map.
- **`game/loadQuestions.ts`** — Exports `createQuestionPicker()`: **one picker per room (= per game)**, created in `GameEngine.createRoom()`; source files are read once per process (`loadSources()`): 4 flat JSON files from `scripts/data/generated/` + the stats bank `scripts/data/stats/bank.json` (missing bank → stats off with a warning). Returns a `(mode: GameMode) => Question` function. Questions never repeat within a game (`pickUnused`). With weight `STATS_MC_WEIGHT=40` (MC) / `STATS_CN_WEIGHT=20` (closest) against the old pools' 100 the round goes to `StatQuestionPicker`; if it is exhausted, an old question is used. Old pools — for `all`/`kerri`: weighted MC pick (7 general_main, 55 abilities_main, 38 items_main); for `closest`: weighted CN pick (30 costs_main, 35 abilities_main, 35 items_main). MC: `options[0]` is always correct in source files (no `correct` field), options are Fisher-Yates shuffled per call, `answer` set to `options[0]` before shuffle. CN: `answer` is always a plain number (no `answers[]` multi-level in generated files). `displayTopic` is computed per source: abilities → `heroName` field; general → `subcategory` field; items → `toTitleCase(source)` (e.g. `"voodoo_mask"` → `"Voodoo Mask"`); costs → `"Цена"` (topic as-is). `comment` field passed through as-is (present in general_main.json, e.g. for "Популярность героев"). Optional raw `optionNotes` (aligned with raw `options`) are shuffled together with options via exported `shuffleOptions()`.
- **`game/stats/statQuestions.ts`** — `StatQuestionPicker`: questions on STRATZ/OpenDota statistics built from `bank.json` (built by `scripts/build_stats_bank.py`) at every pick. Subcategory by weight (each use in this game divides its weight by 1+2n) → pool with ≥4 unused entries → 4 options whose leader (max/min, random among possible leaders) beats each other option by the subcategory `gap` (`rel`/`abs`); no such set in any pool → same without the gate; subcategory without a free pool is skipped. Options and the question's hero (`subject`) are excluded from the subcategory until the game ends. `exclusive` pairs (component + its upgrade: Arcane Boots / Guardian Greaves) never share a set of 4; without the gate the leader must also differ from the runner-up by its note (no «49.8%» vs «49.8%»). Fills `optionNotes` (true values) and `comment` (what the number is, source, window). Closest pools: `{subject, text, answer}`.
- **`game/RoundSelector.ts`** — Simple 3-mode cycle: `['all', 'kerri', 'closest']` repeating. `next()` returns `modes[index % 3]`.
- **`game/economy/`** — Pure functions (tested): `distributePool`, `distributeClosest`, `distributeTop5`, `applyBankBets`. All return `Map<playerId, delta>`. `applyBankBets(deltas, players, gladiatorAnswerIndex)`: hit = net +3×amount, miss = -amount (x4 total payout). `buildResults()` in GameRoom converts deltas to `RoundResult[]` covering all players.
- **`socket/handlers.ts`** — Eight handlers: `join_game`, `start_game` (passes `socket.id` as requester), `place_bet`, `place_bank_bet`, `stage_chip` (relays visual staging amount), `submit_answer`, `gladiator_hover`, `disconnect`.

### Client (`client/src/`)

- **`socket.ts`** — Socket.IO singleton, `autoConnect: false`. URL from `VITE_SERVER_URL` env var, falls back to `http://localhost:3001`.
- **`store/gameStore.ts`** — Zustand store. All socket listeners live here. `roundResults` cleared on ANNOUNCE. `bankBets: Record<playerId, {optionIndex, amount}>` updated via `bank_bet_updated` events, cleared on ANNOUNCE. `stagedBets: Record<playerId, number[]>` — live visual chip **denominations** from opponents before confirm (array of denom values, not a total), updated by `chip_staged` events, cleared on ANNOUNCE and when `bet_updated` fires for that player. `isLateJoiner: boolean` — true when player's first `game_state` has phase != LOBBY; reset to false on ANNOUNCE. `roundCorrectAnswer`, `roundComment`, `roundOptionNotes`, `roundMode`, `roundGladiatorId` — set from `round_results` event; also used during QUESTION phase (2.5s window) to show correct answer highlight before transitioning to REVEAL. Selectors: `selectMe`, `selectIsGladiator`. Betting chip state is component-local in `BettingTableScreen`.
- **`App.tsx`** — Routes `GamePhase → Screen`. `TableFelt` always rendered behind screens (blurred when `phase !== 'BETTING'`). AnimatePresence motion.div has explicit `pointerEvents: 'auto'` — required because Framer Motion 11 sets `pointer-events: none` on elements with `initial={{ opacity: 0 }}`, which propagates to all children (inputs, buttons become unclickable). If `isLateJoiner=true` (joined mid-game), always shows `LateJoinScreen` regardless of phase, until next ANNOUNCE. Full routing: `LOBBY→LobbyScreen`, `ANNOUNCE→AnnounceScreen`, `BETTING→BettingTableScreen`, `QUESTION_TEXT` falls through to same branch as `QUESTION` (shared animation key `'QUESTION'` — no remount between phases), `QUESTION` branches by mode (`closest→ClosestScreen`, `top5→Top5Screen`, `kerri&&isGladiator→GladiatorSelfScreen`, else `QuestionScreen`), `REVEAL` and `LEADERBOARD` → `RoundResultsScreen`, `GAME_OVER→GameOverScreen`. `QuestionTextScreen` component exists but is only used in dev scenarios (not in App routing).
- **`components/screens/`** — Screen components. `LobbyScreen` shows START button only to host; non-host sees "Ожидаем хоста и ждем игроков. Пока не рыпайтесь."; player grid 3 columns with `hideChips` (no chip stacks shown in lobby). `AnnounceScreen` — два последовательных экрана без таймера: **режим** (t=0: лейбл, t=1.2s: название пружиной, t=1.55s: описание) → **тема** (через 4s: лейбл + название пружиной). Тема берётся из `displayTopic ?? topic` — т.е. для способностей показывает имя героя, для предметов название предмета, для general — subcategory. Переход — старый экран уходит вверх, новый влетает снизу. Нет footer-текста, нет "Готовься к ставкам". `BettingTableScreen` handles all modes; in kerri mode crowd sees the question text + options (correct highlighted green) above the table, plus WIN/LOSE selector + bank bet x4 UI; gladiator sees informационный текст (без вопроса). В режиме `all` — в центре felt: таймер + "Тема" + название темы + "Ставьте ставку на то, что ответите верно". `QuestionScreen` in kerri crowd mode shows read-only options (disabled) with header "Наблюдай за Керри"; when `roundCorrectAnswer` is set (2.5s reveal window), correct option gets green border + glow, others fade to 40% opacity, input disabled. If `roundComment` exists, it appears below "Правильный ответ: X" with 0.25s delay. If `roundOptionNotes` exist, each option shows its value via `ui/OptionNote.tsx` (from `sm` — right inside the box, narrower — badge on the top edge; box is `relative`); wrong options with a note dim only their label/text (border gray) so the value stays readable. `GladiatorSelfScreen` — same reveal behavior as QuestionScreen when `roundCorrectAnswer` arrives, including `roundComment` and option notes. `ClosestScreen` also shows `roundComment` under the correct answer. `ClosestScreen` uses `type="text"` + `inputMode="decimal"` input (not `type="number"` — avoids browser quirks with spin buttons); shows "Правильный ответ: X" when `roundCorrectAnswer` is set. `RoundResultsScreen` — covers both REVEAL and LEADERBOARD phases; shows all players sorted by prevBalance initially, then re-sorted by newBalance at 3.5s; 3-phase internal animation: phase 1 (render), phase 2 at 1.5s (animate ProgressBars), phase 3 at 3.5s (resort); each player row shows name, total delta (green/red), `sources` breakdown (✓/✗ per outcome), animated ProgressBar (gold fill, range 0–WIN_CHIPS=3000) extending green or shrinking to red; two-column layout for >5 players; rank colors gold/silver/bronze for top 3. `roundCorrectAnswer` / `roundMode` / `roundGladiatorId` come from `round_results` socket event. `LateJoinScreen` — shown to players who join mid-game, displays current player list with chip counts.
- **`components/ui/`** — `Chip.tsx` (5 denominations), `Timer.tsx` (круговой прогресс, без scale-анимации — только цвет меняется на красный при ≤5s), `PlayerCard.tsx` (проп `hideChips` — скрывает фишки и баланс, используется в LobbyScreen), `PhysicalChipStack.tsx`, `BetZone.tsx` (показывает `$total` под фишками в зоне ставки), `PlayerSlot.tsx` (показывает `$player.chips` баланс между стопкой фишек и карточкой ника), `TableFelt.tsx` (игроки упорядочены так же как в BettingTableScreen: я первый, затем остальные; позиция карточек через `unitPosition` как в PlayerSlot).

### Physical Chips UI (`client/src/`)

The betting phase uses a physical chip system on a round poker table (desktop only). The geometry constants in `tableGeometry.ts` define a **1300×820** logical scene.

- **`types/chips.ts`** — `PhysicalChip { id, denom }`, `buildPhysicalChips(total)` (random UUIDs), `buildChipsForPlayer(playerId, amount)` (stable IDs for opponents — no scatter jitter), `chipScatter(id, range)` (deterministic hash).
- **`lib/tableGeometry.ts`** — Ellipse constants: `SCENE_W=1300, SCENE_H=820, FELT_CX=650, FELT_CY=415, FELT_RX=380, FELT_RY=248, OUTER_RX=424, OUTER_RY=285, LAND_INSET=20, CARD_GAP_X=28, CARD_GAP_Y=28`. `CARD_GAP_X/Y` — расстояние блока игрока от края стола отдельно по горизонтали и вертикали. `LAND_INSET` — насколько зона ставок утоплена от края felt внутрь. Functions: `playerAngle(i,N)`, `landingZone(angle)`, `cardAnchor(angle)`, `unitPosition(angle, unitW, chipRowH, cardH)`.
- **`components/ui/PhysicalChipStack.tsx`** — Chips grouped by denom. Clicking the **denomination group container** calls `onDenomClick(denom)` — the parent finds the topmost unplaced chip of that denom. Non-placed chips use `layoutId={chip.id}` for Framer Motion flight animation. Placed chips are static dim placeholders (no layoutId).
- **`components/ui/BetZone.tsx`** — Absolutely positioned at `landingZone(angle)`. Mine: `layoutId` + recall click. Opponents: `AnimatePresence` + staggered `initial={{opacity:0, y:-8}}` entry animation (delay: `i * 0.04s`).
- **`components/ui/PlayerSlot.tsx`** — `PhysicalChipStack` + name card at `unitPosition()`. Prop: `onDenomClick?: (denom: ChipValue) => void`.
- **`components/ui/TableFelt.tsx`** — Always-mounted, reads `gameStore`. Renders green felt ellipse + player name cards. `blurred=true` → `filter:blur(8px), opacity:0.35` (animated). `pointerEvents:none`, `zIndex:0`.
- **`components/screens/BettingTableScreen.tsx`** — `LayoutGroup` wraps all chip elements. Scene wrapped in 1.25× CSS scale wrapper. Local state: `myStack`, `placedIds`, `pendingTarget`, `bankBetTarget`, `bankBetAmount`. `placeChip(denom)` finds **last** unplaced chip of that denom (top of visual stack). After each place/recall, emits `stage_chip` with array of denominations for real-time opponent preview. Opponent `betChips`: if `stagedBets[player.id]` is defined → maps denoms to `PhysicalChip` with IDs `${i}-${denom}-${player.id}` (variable part first → good chipScatter hash diversity); else `buildChipsForPlayer(player.id, player.currentBet)`. Bank bet UI (kerri crowd): shows 4 MC options; correct one (matching `gladiatorAnswer`) has green border + non-clickable; wrong options clickable → select `bankBetTarget` (index); chips fly into the selected option zone. Confirm emits `place_bet` and optionally `place_bank_bet`. Kerri crowd sees question text + options above the table during BETTING phase.

**Key design decisions:**
- `myStack` is component-local (not Zustand) — rebuilt from `me.chips` each time BETTING phase starts.
- `layoutId=chip.id` shared between `PhysicalChipStack` (unplaced) and `BetZone` (placed) → Framer Motion animates chip flight.
- During kerri BETTING: `gameState.gladiatorAnswer` = correct answer (sent to crowd by server, withheld from kerri).
- Real-time staging: `stage_chip` socket event relays array of denominations to opponents before confirm; `stagedBets: Record<playerId, number[]>` in store, cleared on ANNOUNCE and on `bet_updated`. Staged chip IDs: `${i}-${denom}-${player.id}` (index and denom first for chipScatter diversity).
- Chip selection: LIFO — last unplaced chip (top of visual stack) is picked on denom click.

### Phase flow

```
LOBBY → ANNOUNCE (9s) → [BETTING (30s) →] QUESTION (45s) → [2.5s reveal] → REVEAL (14s) → [next round or GAME_OVER]
```

`all` and `kerri` modes go through BETTING; `closest` skips BETTING (ANNOUNCE→QUESTION_TEXT directly). In kerri mode, `selectGladiator()` runs at ANNOUNCE→BETTING transition. After all answer (or timer expires), `round_results` is broadcast immediately while phase stays QUESTION for 2.5s — clients show correct answer highlight — then transitions to REVEAL.

Mode rotation: `all → kerri → closest → all → kerri → ...`

### UI Color Standards

Три стандартных цвета для текста во всех экранах:

| Роль | Hex | Применение |
|---|---|---|
| Золото / акцент | `#fbbf24` | Заголовки режима, темы, баланс своих фишек, имя в лобби |
| Белый / основной текст | `#e5e7eb` | Основные фразы, описания, тексты на кнопках |
| Серый / вспомогательный | `#c4c9d4` | Лейблы ("Режим", "Тема"), подсказки, неактивные элементы |
| Серый светлый (противники) | `#d1d5db` | Баланс противников в PlayerSlot |

Функциональные цвета не трогаем: `#4ade80` (правильный ответ / победа), `#f87171` (неверный / проигрыш).

### Tests

Located in `server/src/game/economy/__tests__/` and `server/src/game/__tests__/` and `shared/src/__tests__/`. vitest resolves `@cumsino/shared` via alias in `server/vitest.config.ts` — no need to build shared before running tests.

**Покрытие (119 тестов):**

| Файл | Что покрыто |
|---|---|
| `economy/__tests__/distributePool.test.ts` | пул победителей, пропорции, zero-sum, крайние случаи |
| `economy/__tests__/distributeClosest.test.ts` | точное попадание, ближайший, ничья |
| `economy/__tests__/distributeTop5.test.ts` | слоты, несколько игроков |
| `economy/__tests__/applyBankBets.test.ts` | x3 попадание, -1x промах, суммирование дельт |
| `game/__tests__/loadQuestions.test.ts` | `shuffleOptions`: подпись остаётся у своего варианта; `createQuestionPicker`: без повторов в игре, статистика попадает, у комнат своя история |
| `game/stats/__tests__/statQuestions.test.ts` | `gapOk`; гейт и лидер (max/min), подписи по порядку вариантов, исключение вариантов и героя вопроса, снятие гейта, пропуск подкатегории без 4 свободных, несовместимые пары (компонент + улучшение), ничья по подписи без гейта, closest; прогон настоящего `bank.json` |
| `game/__tests__/RoundSelector.test.ts` | цикл all→kerri→closest, lastMainMode |
| `game/__tests__/GameRoom.test.ts` | управление игроками, `calculateResults` (all/kerri/closest), `applyDeltas` (флор 0), `checkWinner`, `getStateForPlayer` (gladiatorAnswer), `optionNotes`/`comment` только в `round_results` и пауза перед REVEAL, окно показа ответа (поздний ответ / дисконнект гладиатора не считают раунд второй раз), `allBettingConfirmed`, `submitAnswer`, `removePlayer` (дисконнект гладиатора), **bribe-аукцион** (условия запуска, payBribe обеих сторон, эскалация цены, таймаут→betrayed/helped) |
| `shared/__tests__/chips.test.ts` | decomposeToChips, decomposeStartingChips |

**Паттерн для GameRoom тестов:** `(room as any)` для доступа к private-полям (phase, currentMode, gladiatorId, currentQuestion, bribeAuction и т.д.) и private-методам (calculateResults, checkAndStartBribeEvent, advanceFromQuestion). `vi.useFakeTimers()` в beforeEach для контроля таймеров bribe-аукциона.

## Questions System

**Стандарты, выводы и бэклог — [docs/questions/README.md](docs/questions/README.md) и [docs/questions/BACKLOG.md](docs/questions/BACKLOG.md).** Читать их перед любой работой с вопросами.

Кратко:
- **Источник истины** — снимок `scripts/data/dota/` на зафиксированных коммитах (`manifest.json`), обновление `python scripts/fetch_dota_data.py`. Что сейчас в игре — `scripts/data/dota/current.json` (`scripts/build_game_index.py`), ручные решения — `scripts/data/dota_overrides.json`. dotaconstants не удаляет вырезанное и не выгружает бонусы аганима/шарда — они берутся из сырых файлов игры (`scripts/data/dota/game/`, парсер `scripts/valve_kv.py`).
- **Генерация** — `scripts/generate/numeric_lab/`: модель выбирает `fact_id` и пишет вопрос и `step`, число подставляется из данных (`resolve.py`). Категории — `heroes`, `items`, `neutrals`, `enhancements`, `costs`, `talents`; размер запроса и квота — `CATEGORY_SETUP` в `run_api.py`. Модель `claude-opus-5-5`, effort high, обычные параллельные вызовы (`--sync`), без Batch API и без `cache_control`. Ключ — `NUMLAB_API_KEY`.
- **Текстовые вопросы про механики** — `scripts/generate/text_lab/` (`mechanics_lab.py`, промпт `prompt_mechanics_v4.md`, второй проход проверки, ручное курирование `curate.py` → `bank.json`). Готовый прогон — `text_lab/out/full1` (116 вопросов).
- **Варианты ответа** строит игра по шагу при каждом показе (эталон `options.py`): случайная позиция ответа по величине, варианты ровно через шаг, отдельное перемешивание показа.
- **Готовые прогоны:** `out/full1` (герои, предметы, нейтралки, чары), `out/costs2` (цены), `out/talents-full` (таланты).
- **Вопросы на статистике** (средние за матч, контрпики, таланты 20/25, баны, винрейт и пики героев, предметы и ботинки) — снимок `scripts/data/stats/<дата>/` (`scripts/fetch_stats.py` — OpenDota, `scripts/fetch_stratz.py` — STRATZ) → `python scripts/build_stats_bank.py` → `scripts/data/stats/bank.json` → `server/src/game/stats/statQuestions.ts`. Правила пулов и порогов — [docs/questions/stratz-research.md](docs/questions/stratz-research.md). Русские тексты талантов — `scripts/talent_text.py`. Вопросы про друзей — прототип `scripts/friends_questions.py`, в игру не подключён.
- **Старые вопросы игра читает из** `scripts/data/generated/*_main.json` (MC: `options[0]` правильный, перемешивается при выдаче; CN: `answer`; веса выбора — в `loadQuestions.ts`). Перенос нового банка — в бэклоге. Старые скрипты (`scripts/generate/gen_questions.py`, `improve_questions.py`, сборщики `scripts/*.py` старой базы) и архив `scripts/data/*.json` — не использовать.

## Deployment

- **Server:** Render.com free tier, Frankfurt region. Service name: `Cumsino`, URL: `https://cumsino.onrender.com`. Build: `npm install && npm run build --workspace=shared && npm run build --workspace=server`. Start: `npm run start --workspace=server`. Env vars: `NODE_ENV=production`, `PORT=10000`, `CLIENT_ORIGIN=https://mayak100.github.io`. render.yaml exists at `server/render.yaml` but was configured manually on first deploy.
- **Client:** GitHub Actions → GitHub Pages. `.github/workflows/deploy.yml` triggers on push to `main` when `client/**` or `shared/**` change (also supports `workflow_dispatch` for manual trigger). Repo secret: `VITE_SERVER_URL=https://cumsino.onrender.com`. Published to: `https://mayak100.github.io/Cumsino/`. Vite base: `/Cumsino/` (case-sensitive — must match repo name exactly).
- **Git:** remote branch is `main`; push with `git push origin HEAD:main` (works from any local branch name — older clones had local `master`, a fresh clone is on `main`).
- Render.com free tier sleeps after 15 min idle — just open the site ~30s before playing (socket connection on page load wakes it up).
