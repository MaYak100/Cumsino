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

### Лаборатория вопросов (`/dev`)

```bash
npm run dev:server                 # нужен: вопросы берутся с сервера
npm run dev --workspace=client     # → http://localhost:5173/Cumsino/dev
```

Настоящие вопросы на настоящих экранах игры, без сокета и без прохождения цикла. Слева панель (скрыть — `H`):
**режим** (для всех / керри: толпа / керри: я керри / кто ближе) → **категория** и **подкатегория** (или «по весам, как в
игре») → вопрос. **Стадия раунда**: анонс → ставки (толпа kerri видит там вопрос; в «кто ближе» ставок нет) → вопрос →
ответ (correctAnswer + comment + optionNotes, как в `round_results`) → итоги. Клавиши: `→`/`←` следующий / назад,
`R` показать ответ, `1`–`5` стадия, `C` скопировать id. Смена только режима показывает тот же вопрос в новом режиме
(числовой факт — и MC по шагу, и «кто ближе»). Поле id открывает конкретный вопрос (`num:…`, `mech:…`, `stat:…`,
`fr:…`). «Друзья» — отметить, кто опознан (нужно ≥ 2). Слайдер игроков 2–10. Внизу — экраны вне раунда (лобби, конец
игры, вход посреди игры). Можно кликнуть вариант / ввести число — ответ «принят» локально; оценки никуда не уходят.

Сервер: `server/src/dev/questionLab.ts` — `GET /dev/catalog`, `GET /dev/question?session&mode&cat&sub&id&friends`,
`POST /dev/reset`; подключается в `index.ts` только при `NODE_ENV !== 'production'` (на Render их нет). Вопросы собирает
тот же `RoomQuestions`, но на своём `QuestionHistory` без хранилища: в Neon лаборатория не пишет; в сессии вопросы
среза не повторяются, срез кончился — новый круг. Клиент: `client/src/dev/` — `DevPage.tsx` (панель), `labApi.ts`
(запросы, `VITE_SERVER_URL` или localhost:3001), `labState.ts` (вопрос + режим + стадия → состояние `gameStore`),
`scenarios.ts` (экраны вне раунда). Экран по фазе выбирает `components/screens/screenFor.ts` — общий с `App.tsx`.

### Windows

- Python: `python -X utf8 script.py` — без этого печать кириллицы в консоль cp1251 падает (`fetch_friends.py`, сборщики банков). Многострочный `python -c` в Git Bash ломается — писать скрипт в файл.
- `.env` в корне: `DATABASE_URL` (Neon, проект Cumsino `misty-king-07552108`; строку можно взять через Neon MCP `get_connection_string`) и `STRATZ_API_KEY`.
- Пересъём друзей: `python -X utf8 scripts/fetch_friends.py --me 1101588971 && python -X utf8 scripts/friends_questions.py --build` (`matches.jsonl` / `state.json` в .gitignore — на новой машине качается всё заново, ~200 запросов, один IP).

### Worktree (`.claude/worktrees/<имя>`)

- Своих `node_modules` нет — резолвятся из корня `C:\Dev\Cumsino\node_modules`, а `@cumsino/shared` там ссылается на
  копию из основного checkout. Поэтому vitest/vite (алиас на `../shared/index.ts`) видят shared ворктри, а голый `tsc`
  и `tsx` сервера — нет: для них нужен tsconfig с `paths` на shared ворктри (во временной папке, не в репо — см. TS6059).
- Порт 3001 обычно занят сервером основного checkout; сервер ворктри поднимать на другом (`PORT=3002`) и клиент с
  `VITE_SERVER_URL=http://localhost:3002`. `DATABASE_URL=` (пусто) — история вопросов только в памяти, Neon не трогаем.
- `git stash` общий для всех ворктри — не использовать голый stash.

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

- `src/types.ts` — all interfaces: `Player`, `GameState`, `Question`, `RoundResult`, socket payloads. `GameMode = 'all' | 'kerri' | 'closest' | 'top5'`. `GameState` includes `hostId: string` (first player to join). `Question` has optional `displayTopic?: string` (human-readable topic for UI — hero name, item name, or subcategory) and `comment?: string` (explanatory note shown after correct answer is revealed) and `optionNotes?: string[]` (true value of each option by index — «610», «64%», up to ~6 chars). `comment` and `optionNotes` are excluded from `GameState.currentQuestion` and delivered only in `round_results` (otherwise values leak the answer). `constants.ts`: `ANSWER_REVEAL_MS=4000`, `ANSWER_REVEAL_NOTES_MS=6000`.
- `src/constants.ts` — `STARTING_CHIPS=500`, `WIN_CHIPS=3000`, `GLADIATOR_BONUS=300`, `PHASE_DURATIONS`, etc.
- `src/units.ts` — `withUnit(value, unit)`: «175%», «1.5×» glued, «12 сек.», «2250 золота» spaced. `Question.unit` — unit of a number question: in MC it is already inside each option label, in closest it is shown next to the input and in «Правильный ответ» (`ClosestScreen`).
- `src/chips.ts` — `decomposeToChips(amount)`: splits into denominations (80% large: 500/100, 20% small: 50/20/10), then `normalizeMax7()` upgrades excess stacks (>7 chips) to the next larger denom. `decomposeStartingChips()`: fixed breakdown `4×100+1×50+1×20+3×10=500`.

**Import resolution:** Both Vite (client) and vitest (server) alias `@cumsino/shared` → `../shared/index.ts` (raw TS source). The compiled `shared/dist/` is only used in production Render.com builds. The server `tsconfig.json` has **no `paths` block** — npm workspaces symlink handles resolution; adding `paths` here causes TS6059 (file outside rootDir).

### Server (`server/src/`)

Game state lives in memory. Question history (decks, credits, ratings, archive, showings) is persisted to Neon via `DATABASE_URL` (set on Render; locally — `.env` in repo root, gitignored); without it — process memory only.

- **`index.ts`** — Express + Socket.IO setup. `CLIENT_ORIGIN` defaults to `/^http:\/\/localhost(:\d+)?$/` for local dev; set `CLIENT_ORIGIN` env var in production.
- **`game/GameRoom.ts`** — Core state machine. Extends EventEmitter. `hostId` = socket id of first `addPlayer` call; `start(requesterId)` rejects if requester is not host. Phase transitions via `schedulePhase()` / `onPhaseEnd()` — **`all` and `kerri` go through BETTING; `closest` skips BETTING** (ANNOUNCE→QUESTION_TEXT directly). **Shop:** every `all` round starts with `SHOP` **only after the first `closest` round has been played** (`closestSeen`; round 1 goes LOBBY→ANNOUNCE directly, first shop is after the first `closest` REVEAL): `nextRound()` picks mode + question, bumps `roundIndex` and resets per-round state *before* the shop, then `startShop()` (all `shopReady=false`, `PHASE_DURATIONS.SHOP` 25 s; the first shop of a game + `FIRST_SHOP_EXTRA` 20 s = 45 s); `setShopReady(id, ready)` — everyone ready (or the last not-ready player leaves) → `endShop()` → ANNOUNCE (`announceSeconds`, +3 s the first time a mode is seen). During SHOP `mode='all'`, `currentQuestion` is hidden (`null`) and `players[].shopReady` is public. In kerri mode, `selectGladiator()` runs at ANNOUNCE→BETTING transition. `placeBankBet(playerId, optionIndex, amount)` stores crowd's side-bet. `stageChip(playerId, chips, target?)` relays `chip_staged` broadcast to others (visual preview); in kerri the chosen side is remembered in `items.stagedTarget` — `forceBlinds()` puts an unconfirmed crowd blind on it (no side chosen → `'win'`). `calculateResults()` calls `applyBankBets()` after main pool distribution. `advanceFromQuestion()` broadcasts `round_results` with `correctAnswer`, `correctNumericAnswer`, `comment`, `optionNotes`, `mode`, `gladiatorId`, then waits **`ANSWER_REVEAL_MS` (4000ms)**, or `ANSWER_REVEAL_NOTES_MS` (6000ms) when the question has `optionNotes`, before calling `schedulePhase('REVEAL')` — clients remain in QUESTION phase showing the correct answer highlight. `submitAnswer()` blocks non-gladiator answers in kerri mode. `revealing` flag (set in `advanceFromQuestion`, cleared in `nextRound`): during the reveal window the round is already settled — late answers and a gladiator disconnect are ignored, `advanceFromQuestion` is idempotent (no double payout). Emits three events wired by GameEngine: `broadcast`, `broadcastExcept`, `sendToPlayer`. `getStateForPlayer(playerId)` returns personalized state — crowd players receive `gladiatorAnswer` (= correct answer string), kerri player does not. `getPublicState()` strips `bankBet` from player objects. **Items / bonuses / blinds ([docs/items.md](docs/items.md), constants in `shared/src/items.ts`):** blinds in `all` and for the kerri crowd — `assignBlinds()` at ANNOUNCE→BETTING, after `selectGladiator()` (`blindFor`: 5%, big blind 10% to the unique top-balance player among those who bet — the gladiator has no blind and isn't counted; tie at the top → everyone small), `placeBet` below blind rejected (kerri: a non-zero bet also needs `target`), `forceBlinds()` at BETTING end sets unconfirmed bets to the blind (`bet_updated` without chips; kerri — the staged side or `'win'`, `bet_updated {playerId, amount, target}`, capped by balance minus an unconfirmed bank bet). Streaks: `all` right +1 / wrong or skip 0; kerri gladiator right +1 else 0, crowd guessed outcome +1 / wrong 0 / no bet (broke, blind 0) unchanged; `closest` never resets (closest +1, others unchanged). `calculateResults()` = `baseResults()` + `applyBonuses()` (sources «Молния» → «Серия ×N» → «BKB» → «Аегис», casino-paid); new streaks / consumed aegis are stashed in `pending` and applied by `commitSettlement()` in `advanceFromQuestion` (so tests may call `calculateResults()` repeatedly). Persistent per player: `inventory`, `aegis`/`aegisBought`, `streak`; per round (`items: RoundItems`, reset in `nextRound`): used-once set, hex thrown/hexed/deadline, smoked/`smokeHidesAnswer`, bkb/`bkbCap` (2 × BKB price at activation), `removedOptions`, `answerAt` (ms since QUESTION start, `questionStartAt` set in `schedulePhase('QUESTION')` → `onQuestionStart`). `buyItem(id, item)` (SHOP only; aegis can't leave/keep balance below `AEGIS_THRESHOLD`), `useItem(id, item, targetId?)` (gem/manta/smoke/hex/bkb; blink goes through `submitAnswer(id, answer, blink)`); `canUse()` — in kerri the gladiator may use only blink, the crowd only bkb; targeted items need another non-spectator target. **Spectators:** a player who joins outside LOBBY/SHOP gets `spectator=true` until `nextRound()` — can't bet/answer/use items, no blind, never gladiator, never a gem/hex target, not waited for by `allBettingConfirmed()`/`allAnswered()`. Smoked (before answering): others get `hasAnswered=false` until settled, `player_answered`/own `item_used` only to self. Hexed: answers/blinks after `HEX_SECONDS` (15 s) rejected, counts as answered for `allAnswered()` (timer at the deadline re-checks). `getStateForPlayer` adds own `inventory`/`prices`/`aegisBought`/`hexTimeLeft`/`removedOptions`; public `streak`/`blind`/`bigBlind`/`effects`. **Grace:** all answered → `startGrace()` settles after `LAST_ANSWER_GRACE_MS` (1 s), a blink restarts it; QUESTION timeout still settles (idempotent via `revealing`). BKB used in kerri ANNOUNCE by the future gladiator is refunded in `selectGladiator()`.
- **`game/GameEngine.ts`** — Manages `rooms: Map<gameCode, GameRoom>` and `playerRoom: Map<socketId, gameCode>`. When last player leaves, calls `room.destroy()` and removes from map.
- **`game/questions/`** — question system ([docs/questions/system.md](docs/questions/system.md)). `library.ts` reads once per process (`loadLibrary()`, at `GameEngine` construction): `scripts/data/bank/questions.json` (ready questions with stable ids, `scripts/build_question_bank.py`), `scripts/data/stats/bank.json`, `scripts/data/friends/metrics.json` and `categories.ts` (categories → subcategories with weights; edited by hand). `picker.ts` — `RoomQuestions` (one per room, implements `QuestionSource {pick, report, rate}`): mode is the first filter (`mc` for all/kerri, `closest`), then category by weight, subcategory by weight, both via smoothed choice (`smooth.ts`: credits, exact long-run shares; no fatigue), then a question from the subcategory deck (`drawFromDeck`). Number questions in MC get options by step (`stepOptions.ts`): each gap between neighbouring options is 1 or 2 steps (50/50, decided 2026-10-29 — uniform step was too hard), correct answer at a random valid position, all options > 0 (optional upper bound `ceil`, used by friends' win rate < 100%). Option labels carry the unit (`withUnit`). Friends deck draws a person first, then a card (`drawFromDeck(..., group)`), so people with more cards don't show up more often; nicknames in friends questions are in the genitive (`GENITIVE` table in `friends.ts`). `history.ts` — `QuestionHistory`: decks across games (fresh = not seen in current cycle and not in this/previous game; never repeats within a game), archive, credits, rating sums; persisted by `pgBackend.ts` (Neon, `DATABASE_URL`) or memory only. `setup.ts` creates it at startup (`index.ts` awaits it; local `.env` in repo root). Ratings (`rate_question`): −2 delete vote (archived forever only when > half of the room voted), −1/+1/+2, difficulty ±1. One data point per shown question = team average (sum of scores / room players, no click = 0); score = Σ/(showings+10); multiplier is relative among siblings (`relativeMultipliers`: e^(0.45·score), mean 1 by base weights, bounds [0.5, 2]; ~50 «ахуенный» votes in a lobby of 6 → ×1.5) — equal enthusiasm keeps base weights. Client (`RateQuestion.tsx`) sends the choice once, when the results screen unmounts (no confirm; tap again to clear). Each settled round is reported to `q_showing`. `friends.ts` — friends questions (category active when ≥2 identified via `identify` in lobby). Ratio table: `npm run ratios --workspace=server`.
- **`game/stats/statQuestions.ts`** — `StatQuestionBuilder.build(sub, mode, deck)`: questions on STRATZ/OpenDota statistics from `stats/bank.json` at every pick (the subcategory is chosen by `questions/picker.ts`). Pool with ≥4 unused entries → 4 options whose leader (max/min, random among possible leaders) beats each other option by the subcategory `gap` (`rel`/`abs`); deck card = the question's hero (`subject` pools) or the leader; gated+fresh card → (deck exhausted) new cycle → gated stale → ungated. A template without a subject (same text) at most once per game. Options and the question's hero are excluded from the subcategory until the game ends. `exclusive` pairs (Arcane Boots / Guardian Greaves) never share a set of 4; without the gate the leader must also differ from the runner-up by its note. Upper bound on the leader's lead `gap.maxRel` (items ×3, boots ×2.5) so the answer is not obvious. Option notes are formatted on the server from the 4 shown values (`formatNotes`, sub `note`: count / pct / pct0 / pp — shared suffix and precision). Sub flags: `topLead` (boots_hero: the answer is always the hero's real top boots, 25 heroes with a real choice), `layout: "talent_tree"` (talents 20/25: no shuffle, grid like in-game — top row 25 left/right, bottom row 20; first slot of a pair = right, verified in-game on Anti-Mage). Fills `optionNotes` and `comment`. Closest pools: `{subject, text, answer}`, unit `%`.
- **`game/RoundSelector.ts`** — Simple 3-mode cycle: `['all', 'kerri', 'closest']` repeating. `next()` returns `modes[index % 3]`.
- **`game/economy/`** — Pure functions (tested): `distributePool`, `distributeClosest`, `distributeTop5`, `applyBankBets`. All return `Map<playerId, delta>`. `applyBankBets(deltas, players, gladiatorAnswerIndex)`: hit = net +3×amount, miss = -amount (x4 total payout). `buildResults()` in GameRoom converts deltas to `RoundResult[]` covering all players.
- **`socket/handlers.ts`** — handlers: `join_game` (code `^[A-Z0-9]{2,8}$`; joining another room leaves the old one), `start_game` (passes `socket.id` as requester), `place_bet`, `place_bank_bet`, `stage_chip` (`{chips, target?}` — staged denominations + kerri side), `submit_answer` (`blink?: boolean`), `buy_item` / `use_item` (item ∈ `ITEM_ORDER`, `targetId` string ≤ 64), `shop_ready` (`ready` boolean), `gladiator_hover`, `identify` (lobby «кто ты»), `rate_question`, `pay_bribe`, `disconnect`. Every handler goes through a wrapper: missing payload → `{}`, exceptions are logged (one bad event used to crash the whole process). Stakes must be integers, multiples of 10; chips — valid denominations. `index.ts` also logs `uncaughtException`/`unhandledRejection` instead of dying.
- **Room safety (audit 2026-10-28, [docs/audit-2026-10-28-game.md](docs/audit-2026-10-28-game.md))** — phase timers run through `safely()`; a failing question pick tries the next mode; host is reassigned when the host leaves; after a player leaves, BETTING/QUESTION advance if everyone remaining is done; kerri gladiator leaving during BETTING cancels the round (zero deltas, «Керри сбежал»); gladiator can't bet or bank-bet; bank bet only on a wrong option; answers validated (`answerOk`: option from the list / finite number); other players' `answer` is hidden from `game_state` until the round is settled; re-join from the same socket doesn't reset chips. **Bribe auction is off** (`BRIBE_ENABLED=false` in `shared/constants.ts`) — it worked badly; code and tests kept.

### Client (`client/src/`)

- **`socket.ts`** — Socket.IO singleton, `autoConnect: false`. URL from `VITE_SERVER_URL` env var, falls back to `http://localhost:3001`.
- **`store/gameStore.ts`** — Zustand store. All socket listeners live here. `roundResults` cleared on ANNOUNCE. `bankBets: Record<playerId, {optionIndex, amount}>` updated via `bank_bet_updated` events, cleared on ANNOUNCE. `stagedBets: Record<playerId, number[]>` — live visual chip **denominations** from opponents before confirm (array of denom values, not a total), updated by `chip_staged` events, cleared on ANNOUNCE and when `bet_updated` fires for that player. `isLateJoiner: boolean` — true when player's first `game_state` has phase != LOBBY; reset to false on ANNOUNCE. `roundCorrectAnswer`, `roundComment`, `roundOptionNotes`, `roundMode`, `roundGladiatorId` — set from `round_results` event; also used during QUESTION phase (2.5s window) to show correct answer highlight before transitioning to REVEAL. Selectors: `selectMe`, `selectIsGladiator`. Betting chip state is component-local in `BettingTableScreen`.
- **`App.tsx`** — Routes `GamePhase → Screen` (выбор экрана — `components/screens/screenFor.ts`, общий с лабораторией `/dev`). `TableFelt` always rendered behind screens (blurred when `phase !== 'BETTING'`). AnimatePresence motion.div has explicit `pointerEvents: 'auto'` — required because Framer Motion 11 sets `pointer-events: none` on elements with `initial={{ opacity: 0 }}`, which propagates to all children (inputs, buttons become unclickable). If `isLateJoiner=true` (joined mid-game), always shows `LateJoinScreen` regardless of phase, until next ANNOUNCE. Full routing: `LOBBY→LobbyScreen`, `SHOP→ShopScreen`, `ANNOUNCE→AnnounceScreen`, `BETTING→BettingTableScreen`, `QUESTION_TEXT` falls through to same branch as `QUESTION` (shared animation key `'QUESTION'` — no remount between phases), `QUESTION` branches by mode (`closest→ClosestScreen`, `top5→Top5Screen`, `kerri&&isGladiator→GladiatorSelfScreen`, else `QuestionScreen`), `REVEAL` and `LEADERBOARD` → `RoundResultsScreen`, `GAME_OVER→GameOverScreen`. `QuestionTextScreen` component exists but is not used (ни в App, ни в лаборатории).
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
LOBBY → [SHOP (25s; 45s the first time; only before `all`, and only after the first `closest`) →] ANNOUNCE (9s) → [BETTING (30s) →] QUESTION (45s) → [4s reveal] → REVEAL (14s) → [next round or GAME_OVER]
```

`all` and `kerri` modes go through BETTING; `closest` skips BETTING (ANNOUNCE→QUESTION directly). In kerri mode, `selectGladiator()` runs at ANNOUNCE→BETTING transition. After all answer (or timer expires), `round_results` is broadcast immediately while phase stays QUESTION for 2.5s — clients show correct answer highlight — then transitions to REVEAL.

Mode rotation: `all → kerri → closest → all → kerri → ...`

### Дизайн (редизайн 2026-10-29: «подпольное казино в стикерах»)

Палитра — `client/src/theme.ts` (`C`, зеркало `:root` в `index.css` и цвета Tailwind): сукно `#0c1513` / панели `#13201c`
/ линии `#24352f`, текст `#ede8de`, вспомогательный `#93a39c`, бумага стикеров `#f3ede2`, чернила `#121a17`; акценты —
латунь `#f2b630`, малиновый `#ff3d6e` (керри, ошибка, потеря), голубой `#49c6e5`, мята `#3ee08f` (верно, прирост).
**У режима свой цвет** (`MODE` в `theme.ts`: all — латунь, kerri — малиновый, closest — голубой) — анонс, таймер, акценты
раунда. Шрифты: `Dela Gothic One` (`DISPLAY` / `.font-display` — режимы, темы, суммы, код комнаты) + `Rubik` (всё
остальное). Без эмодзи, без капса-лейблов.

- **`ui/Sticker.tsx`** — наклейка с рваной вырезкой (`roughClip(seed)` — детерминированный clip-path) и «шлепком» (`slam`).
  Стикеры: тема в анонсе и на столе, бирки значений вариантов, код комнаты, игроки в лобби, «Ты керри», победитель.
- **Гонка до 3000** — сквозной мотив: `ui/GameHud.tsx` (`MiniRace` в шапке вопроса/анонса), общая ось 0→3000 на итогах,
  линия в лобби и в конце игры. `ui/TimeBar.tsx` — таймер-фитиль под шапкой; `ui/Timer.tsx` — кольцо на столе.
- **Экран вопроса без сдвигов** — раскладка прибита к верху; `ui/AnswerOptions.tsx` (общий для всех / керри / толпы):
  строки одной высоты (`gridAutoRows: 1fr`), значения вариантов — бирки-стикеры поверх кромки (absolute), выбор 1–4 с
  клавиатуры, толпа видит верный вариант пунктиром и куда смотрит керри. Ниже — лоток: кто ответил → пояснение
  (`RevealNote`) и оценка. `GladiatorSelfScreen` = реэкспорт `QuestionScreen`.
- **Оценка** (`ui/RateQuestion.tsx`) — по краям «Легко» / «Сложно», по центру шкала из четырёх мер (выделение переезжает
  `layoutId`). Показывается сразу при раскрытии ответа и на итогах; выбор в сторе (`rating`, `setRating`), уходит на
  сервер один раз — на следующем ANNOUNCE / GAME_OVER / LOBBY или `pagehide` (`flushRating`).
- **«Кто ближе»** — большое поле под число (Enter); раскрытие: правильное число, «ты сказал / мимо на N», `ui/GuessLine.tsx`
  (все догадки на одной оси).
- **Фишки** — одна отрисовка `lib/chipStyle.ts` (насечки на ребре, кольцо); сукно — `FeltOval` в `TableFelt.tsx`
  (цвета `FELT` в теме), плашки игроков «имя | $баланс» — `NamePlate` в `PlayerSlot.tsx`; ставка ложится кучкой (и на фоне — `TableFelt`)
  (`pileOffset` — спираль по порядку выкладки); подтверждение — «Ставлю $N». Керри-толпа: сверху кто отвечает + вопрос,
  две крупные зоны «Завалит / Ответит» с суммой на кону, ниже квитки «где ошибётся ×4» (верный помечен).
  У толпы керри `place_bet.chips` = основная + банк в порядке черновика; сервер хранит в `betChips` префикс на сумму
  «основная + принятая банк-ставка» (`chipsPrefix`), так что у соперников после подтверждения ничего не пропадает.
- **Масштаб:** `html { font-size: clamp(16px, 5px + 0.5vw + 0.55vh, 22px) }` — экраны вне стола размечены в rem и растут
  с экраном; вопрос / «кто ближе» / итоги центрированы по вертикали, лоток под вариантами фиксированной высоты. Стол —
  `useSceneScale` (до ×1.4, по высоте с запасом под плашки). Деньги всегда с `$`.
- **Предметы в интерфейсе.** `ShopScreen` — карточки по центру (flex-wrap), цена от баланса, «Готов» (после «Готов»
  клиент покупать не даёт). `ui/ItemIcon.tsx` — иконки скетчем маркера по силуэтам игровых. `ui/ItemBar.tsx` — внизу
  экрана в ANNOUNCE / BETTING / QUESTION, только купленные предметы; недоступное сейчас — тусклое с бумажной подсказкой
  почему; клавиши из `ITEMS[id].key`: Z манта, X гем, C смок, V хекс, B BKB (у блинка нет — он через «изменить ответ»);
  цель гема/хекса — выбор игрока, Esc — отмена. Порядок предметов (лавка и бар): манта, гем, BKB, блинк, хекс, смок,
  аегис. `ui/SelfEffects.tsx` — наклейки над вопросом про эффекты на тебе («Ты в хексе» / «Время вышло», «Твой ответ
  просветили», «Ты в смоке», «BKB включён»). Эффекты на других — значки у ника (`Player.effects`).
- **Таймлайн** (`ui/TimeBar.tsx`) — полосы фиксированной длины (45 с вопроса, `HEX_SECONDS` хекса), у каждой свой
  `key`, ход линейный; метка-молния на отметке `LIGHTNING_MS`; под хексом после окна молнии сразу красный.
- **Серия** — `ui/StreakFlame.tsx`: бумажная рамка-пламя вокруг плашки (серия 2 — тлеет, 3+ — горит выше, 5+ — синее),
  основа — суперэллипс, языки выше в центре, «перерезается» раз в секунду. Только на плашках стола и в итогах.
- **Принудительная ставка** — если сервер выставил блайнд за тебя (`bet_updated` без твоего подтверждения, стор
  `betSent`), `ui/Notice.tsx` на 3 с показывает наклейку «Поставили $30» / «Поставили на ответит». Рядом со стопкой —
  быстрые ставки min / 25% / 50% / all-in.
- Текст не выделяется (`user-select: none` в `index.css`, кроме полей ввода).
- Моки интерфейса: `/mocks?s=<id сценария>&n=<игроки>` (`dev/MockPage.tsx` + `dev/mockStates.ts`: лавка, предметы, блайнды, серии, керри-стол) — без сервера. Настоящие вопросы — лаборатория `/dev`.

### Открытые вопросы (ждут решения пользователя, 2026-10-29)

- Кнопка «пропускаю» у толпы керри — при обязательном блайнде не нужна?
- Манта после ответа и покупка после «Готов»: клиент запрещает, сервер разрешает — закрыть и на сервере?
- Переподключение = новый сокет = новый игрок с $500.
- 10 игроков: подпись блайнда / кнопка подтверждения наезжают на зону ставки соседа.
- Новые предметы (предлагались Linken's, Lotus, Midas, Rapier, Dust), баланс камбэка и награды «кто ближе», звук.

### Tests

Located in `server/src/game/economy/__tests__/` and `server/src/game/__tests__/` and `shared/src/__tests__/`. vitest resolves `@cumsino/shared` via alias in `server/vitest.config.ts` — no need to build shared before running tests.

**Покрытие (274 теста сервера + `shared/__tests__/` chips и units):**

| Файл | Что покрыто |
|---|---|
| `economy/__tests__/distributePool.test.ts` | пул победителей, пропорции, zero-sum, крайние случаи |
| `economy/__tests__/distributeClosest.test.ts` | точное попадание, ближайший, ничья |
| `economy/__tests__/distributeTop5.test.ts` | слоты, несколько игроков |
| `economy/__tests__/applyBankBets.test.ts` | x3 попадание, -1x промах, суммирование дельт |
| `game/questions/__tests__/picker.test.ts` | `shuffleOptions`, `makeStepOptions` (промежутки 1 или 2 шага ~50/50, > 0, верхняя граница, позиция), единица в вариантах и в closest, `drawFromDeck` с группами (человек выпадает поровну), сглаженный выбор (доли по весам, серии короче рандома), колоды между играми (круг, блок двух последних игр, без повторов в игре), режим как фильтр, «удалить» → архив, множитель оценок, переоценка заменяет, друзья (≥ 2 опознанных, только про них; ник в родительном падеже, ловушка мейна, лидер винрейта от 50 игр, шаг и границы вариантов винрейта, топ-6 героев в колоде, единица «игр»), прогон настоящего банка (10 игр × 24 раунда) |
| `game/stats/__tests__/statQuestions.test.ts` | `gapOk`; гейт и лидер (max/min), подписи по порядку вариантов, исключение вариантов и героя вопроса, снятие гейта, подкатегория без 4 свободных не собирается, несовместимые пары (компонент + улучшение), ничья по подписи без гейта, closest, верхний предел отрыва, формат подписей по четвёрке, раскладка дерева талантов, `topLead` у ботинок; прогон настоящего `bank.json` |
| `game/__tests__/RoundSelector.test.ts` | цикл all→kerri→closest, lastMainMode |
| `game/__tests__/GameRoom.test.ts` | управление игроками, `calculateResults` (all/kerri/closest), `applyDeltas` (флор 0), `checkWinner`, `getStateForPlayer` (gladiatorAnswer), `optionNotes`/`comment` только в `round_results` и пауза перед REVEAL, окно показа ответа (поздний ответ / дисконнект гладиатора не считают раунд второй раз), `allBettingConfirmed`, `submitAnswer`, `removePlayer` (дисконнект гладиатора), **аудит** (смена хоста, досрочный конец фаз после ухода, керри сбежал в BETTING, ставки керри и банк на верный вариант, проверка ответов, скрытые чужие ответы, повторный join, ошибка пикера), **bribe-аукцион** (выключен флагом, тесты вызывают методы напрямую: (условия запуска, payBribe обеих сторон, эскалация цены, таймаут→betrayed/helped)) |
| `game/__tests__/items.test.ts` | блайнды (суммы, большой у лидера / ничья, отказ ниже блайнда, принудительный в конце BETTING, не в «ближе»), **блайнды керри** (только толпа, керри выбран до блайндов, большой — лидер толпы, отказ ниже блайнда / без стороны, принудительный на случайную сторону, банк-ставка необязательна, безденежный не ждётся и серия нейтральна), молния (быстрый/медленный, блинк сбрасывает время, керри), серия (+1/сброс, бонусы ×2/×3/×5, керри и толпа, «ближе всех» не сбрасывает, BKB держит серию), покупка (фазы, цена от баланса, max, аегис раз за игру, запас только себе), предметы (blink, gem + смок цели и onYou, manta + отказ ответа убранным, smoke маскирует ответ и рассылки, hex 15 с и досрочный конец, bkb сейв 2 × цена на момент включения и возврат избранному керри, aegis порог и порядок источников), окно 1 с после последнего ответа (блинк перезапускает, таймер фазы не считает дважды); **лавка** (нет перед раундом 1, первая после первого «кто ближе» = SHOP+20 с, следующая 25 с, не перед керри/«ближе»; режим/раунд/скрытый вопрос, «Готов» туда-обратно, все готовы / ушёл последний неготовый / таймер, вошедший в лавке участвует, покупки не стираются, GAME_OVER до лавки, покупка ровно в $0 и не от $3000); **керри** (керри — только блинк, толпа — только bkb, BKB от основной + банк с капом, серии толпы и неответившего керри); **«кто ближе»** (блинк числа, гем числа, смок, хекс/манта/bkb нельзя, аегис); **края** блайндов (< $10, олл-ин, ротация при уходах и пропусках), хекса (зритель/ушедший — не цель, цель ушла, хекс + смок, блинк после 15 с), гема (ушедший, зритель, смотрящий в смоке, окно показа), смока (все ответили, смок после ответа), аегиса (порог при покупке, второй раз, + BKB, с нуля, отменённый раунд); **вошёл посреди раунда** (зритель: пустой запас, не отвечает/не ставит/не керри/без блайнда, никого не задерживает) |
| `shared/__tests__/chips.test.ts` | decomposeToChips, decomposeStartingChips |
| `shared/__tests__/units.test.ts` | `withUnit`: слитно % и ×, 'x' → ×, через пробел, без единицы |

**Паттерн для GameRoom тестов:** `(room as any)` для доступа к private-полям (phase, currentMode, gladiatorId, currentQuestion, bribeAuction и т.д.) и private-методам (calculateResults, checkAndStartBribeEvent, advanceFromQuestion). `vi.useFakeTimers()` в beforeEach для контроля таймеров bribe-аукциона.

## Questions System

**Стандарты, выводы и бэклог — [docs/questions/README.md](docs/questions/README.md) и [docs/questions/BACKLOG.md](docs/questions/BACKLOG.md).** Читать их перед любой работой с вопросами.

Кратко:
- **Источник истины** — снимок `scripts/data/dota/` на зафиксированных коммитах (`manifest.json`), обновление `python scripts/fetch_dota_data.py`. Что сейчас в игре — `scripts/data/dota/current.json` (`scripts/build_game_index.py`), ручные решения — `scripts/data/dota_overrides.json`. dotaconstants не удаляет вырезанное и не выгружает бонусы аганима/шарда — они берутся из сырых файлов игры (`scripts/data/dota/game/`, парсер `scripts/valve_kv.py`).
- **Генерация** — `scripts/generate/numeric_lab/`: модель выбирает `fact_id` и пишет вопрос и `step`, число подставляется из данных (`resolve.py`). Категории — `heroes`, `items`, `neutrals`, `enhancements`, `costs`, `talents`; размер запроса и квота — `CATEGORY_SETUP` в `run_api.py`. Модель `claude-opus-5-5`, effort high, обычные параллельные вызовы (`--sync`), без Batch API и без `cache_control`. Ключ — `NUMLAB_API_KEY` или `ANTHROPIC_API_KEY` (на Windows-машине пользователя — переменная окружения пользователя).
- **Текстовые вопросы про механики** — `scripts/generate/text_lab/` (`mechanics_lab.py`, промпт `prompt_mechanics_v4.md`, второй проход проверки, ручное курирование `curate.py` → `bank.json`). Готовый прогон — `text_lab/out/full1` (116 вопросов).
- **Варианты ответа** строит игра по шагу при каждом показе (эталон `options.py`): случайная позиция ответа по величине, соседи через один или два шага (50/50), отдельное перемешивание показа. Если не понравится — обсуждали «всегда двойной шаг» или ограничение невозможных значений (например, % > 100 там, где это невозможно).
- **Язык вопросов** — словарь в [docs/questions/README.md](docs/questions/README.md), «Язык и сленг» (решения пользователя 2026-10-29): разговорный сленг (стан, кд, стак, каст, бафф, ульта…) — да; «замедление», «безмолвие», «увеличение урона заклинаний», «базовое время атаки» — без сленга; чего нет в словаре — как в локализации. Врождённые способности — «врождёнка X у героя» (сборка банка падает без этого), нейтралки — «нейтралка N-го тира X». Таланты — исключение: правда = строка русской локализации дословно ([talents-style.md](docs/questions/talents-style.md)).
- **Сборка банка падает** на: ответ ≤ 3 × шаг, ответ круглее любого фейка во всех раскладках, единица не из словаря, латиница внутри русского слова, старые имена героев, врождёнка без слова «врождёнка». Чинить через `scripts/data/bank/overrides.json` (`drop` / `why` + text / step / unit / sub / options / comment / ok) — правки переживают перегенерацию.
- **Готовые прогоны:** `out/full1` (герои, предметы, нейтралки, чары), `out/costs2` (цены), `out/talents-v5` (таланты, 2026-10-29: правда — строка игры дословно, подделки в стиле локализации трёх разных типов эффекта; промпты `prompt_talents_v5.md` + `prompt_talents_verify_v5.md`, справочник `docs/questions/talents-style.md`).
- **Вопросы на статистике** (средние за матч, контрпики, таланты 20/25, баны, винрейт и пики героев, предметы и ботинки) — снимок `scripts/data/stats/<дата>/` (`scripts/fetch_stats.py` — OpenDota, `scripts/fetch_stratz.py` — STRATZ) → `python scripts/build_stats_bank.py` → `scripts/data/stats/bank.json` → `server/src/game/stats/statQuestions.ts`. Правила пулов и порогов — [docs/questions/stratz-research.md](docs/questions/stratz-research.md). Русские тексты талантов — `scripts/talent_text.py`. Вопросы про друзей — `server/src/game/questions/friends.ts` (прототип и метрики — `scripts/friends_questions.py`).
- **Игра читает** единый банк `scripts/data/bank/questions.json` (`python scripts/build_question_bank.py` из финальных прогонов: `numeric_lab/out/full1`, `costs2`, `talents-v5`, `text_lab/out/full1/bank.json`; вопросы с флагами выкидываются; ручные правки по id — `scripts/data/bank/overrides.json`) + статистику + друзей. Категории, веса, колоды, оценки, Neon — [docs/questions/system.md](docs/questions/system.md). Старая база (`scripts/data/generated/`) удалена 2026-10-28.

## Deployment

- **Server:** Render.com free tier, Frankfurt region. Service name: `Cumsino`, URL: `https://cumsino.onrender.com`. Build: `npm install && npm run build --workspace=shared && npm run build --workspace=server`. Start: `npm run start --workspace=server`. Env vars: `NODE_ENV=production`, `PORT=10000`, `CLIENT_ORIGIN=https://mayak100.github.io`. render.yaml exists at `server/render.yaml` but was configured manually on first deploy.
- **Client:** GitHub Actions → GitHub Pages. `.github/workflows/deploy.yml` triggers on push to `main` when `client/**` or `shared/**` change (also supports `workflow_dispatch` for manual trigger). Repo secret: `VITE_SERVER_URL=https://cumsino.onrender.com`. Published to: `https://mayak100.github.io/Cumsino/`. Vite base: `/Cumsino/` (case-sensitive — must match repo name exactly).
- **Git:** remote branch is `main`; push with `git push origin HEAD:main` (works from any local branch name — older clones had local `master`, a fresh clone is on `main`).
- Render.com free tier sleeps after 15 min idle — just open the site ~30s before playing (socket connection on page load wakes it up).
