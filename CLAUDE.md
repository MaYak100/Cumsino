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

- `src/types.ts` — all interfaces: `Player`, `GameState`, `Question`, `RoundResult`, socket payloads. `GameMode = 'all' | 'kerri' | 'closest' | 'top5'`. `GameState` includes `hostId: string` (first player to join).
- `src/constants.ts` — `STARTING_CHIPS=500`, `WIN_CHIPS=3000`, `GLADIATOR_BONUS=300`, `PHASE_DURATIONS`, etc.
- `src/chips.ts` — `decomposeToChips(amount)`: splits into denominations (80% large: 500/100, 20% small: 50/20/10), then `normalizeMax7()` upgrades excess stacks (>7 chips) to the next larger denom. `decomposeStartingChips()`: fixed breakdown `4×100+1×50+1×20+3×10=500`.

**Import resolution:** Both Vite (client) and vitest (server) alias `@cumsino/shared` → `../shared/index.ts` (raw TS source). The compiled `shared/dist/` is only used in production Render.com builds. The server `tsconfig.json` has **no `paths` block** — npm workspaces symlink handles resolution; adding `paths` here causes TS6059 (file outside rootDir).

### Server (`server/src/`)

Pure in-memory state, no database.

- **`index.ts`** — Express + Socket.IO setup. `CLIENT_ORIGIN` defaults to `/^http:\/\/localhost(:\d+)?$/` for local dev; set `CLIENT_ORIGIN` env var in production.
- **`game/GameRoom.ts`** — Core state machine. Extends EventEmitter. `hostId` = socket id of first `addPlayer` call; `start(requesterId)` rejects if requester is not host. Phase transitions via `schedulePhase()` / `onPhaseEnd()` — **`all` and `kerri` go through BETTING; `closest` skips BETTING** (ANNOUNCE→QUESTION_TEXT directly). In kerri mode, `selectGladiator()` runs at ANNOUNCE→BETTING transition. `placeBankBet(playerId, optionIndex, amount)` stores crowd's side-bet. `stageChip(playerId, amount)` relays `chip_staged` broadcast to others (no state change — visual preview only). `calculateResults()` calls `applyBankBets()` after main pool distribution. `advanceFromQuestion()` broadcasts `round_results` with `correctAnswer`, `correctNumericAnswer`, `mode`, `gladiatorId`. `submitAnswer()` blocks non-gladiator answers in kerri mode. Emits three events wired by GameEngine: `broadcast`, `broadcastExcept`, `sendToPlayer`. `getStateForPlayer(playerId)` returns personalized state — crowd players receive `gladiatorAnswer` (= correct answer string), kerri player does not. `getPublicState()` strips `bankBet` from player objects.
- **`game/GameEngine.ts`** — Manages `rooms: Map<gameCode, GameRoom>` and `playerRoom: Map<socketId, gameCode>`. When last player leaves, calls `room.destroy()` and removes from map.
- **`game/loadQuestions.ts`** — Reads `scripts/data/questions_db.json` at runtime. MC questions: `correct: 0` in DB (correct always first), options are Fisher-Yates shuffled at load time, `answer` stored as the correct text string. Maps DB mode `'gladiator'` → runtime mode `'kerri'`. Multi-level CN questions (`answers[]`) get a random level picked at startup.
- **`game/RoundSelector.ts`** — Simple 3-mode cycle: `['all', 'kerri', 'closest']` repeating. `next()` returns `modes[index % 3]`.
- **`game/economy/`** — Pure functions (tested): `distributePool`, `distributeClosest`, `distributeTop5`, `applyBankBets`. All return `Map<playerId, delta>`. `applyBankBets(deltas, players, gladiatorAnswerIndex)`: hit = net +3×amount, miss = -amount (x4 total payout). `buildResults()` in GameRoom converts deltas to `RoundResult[]` covering all players.
- **`socket/handlers.ts`** — Eight handlers: `join_game`, `start_game` (passes `socket.id` as requester), `place_bet`, `place_bank_bet`, `stage_chip` (relays visual staging amount), `submit_answer`, `gladiator_hover`, `disconnect`.

### Client (`client/src/`)

- **`socket.ts`** — Socket.IO singleton, `autoConnect: false`. URL from `VITE_SERVER_URL` env var, falls back to `http://localhost:3001`.
- **`store/gameStore.ts`** — Zustand store. All socket listeners live here. `roundResults` cleared on ANNOUNCE. `bankBets: Record<playerId, {optionIndex, amount}>` updated via `bank_bet_updated` events, cleared on ANNOUNCE. `stagedBets: Record<playerId, number>` — live visual chip amounts from opponents before confirm, updated by `chip_staged` events, cleared on ANNOUNCE and when `bet_updated` fires for that player. `isLateJoiner: boolean` — true when player's first `game_state` has phase != LOBBY; reset to false on ANNOUNCE. `roundCorrectAnswer`, `roundMode`, `roundGladiatorId` — set from `round_results` event, used by RevealScreen. Selectors: `selectMe`, `selectIsGladiator`. Betting chip state is component-local in `BettingTableScreen`.
- **`App.tsx`** — Routes `GamePhase → Screen`. `TableFelt` always rendered behind screens (blurred when `phase !== 'BETTING'`). If `isLateJoiner=true` (joined mid-game), always shows `LateJoinScreen` regardless of phase, until next ANNOUNCE. Full routing: `LOBBY→LobbyScreen`, `ANNOUNCE→AnnounceScreen`, `BETTING→BettingTableScreen`, `QUESTION_TEXT→QuestionTextScreen`, `QUESTION` branches by mode (`closest→ClosestScreen`, `top5→Top5Screen`, `kerri&&isGladiator→GladiatorSelfScreen`, else `QuestionScreen`), `REVEAL→RevealScreen`, `LEADERBOARD→LeaderboardScreen`, `GAME_OVER→GameOverScreen`.
- **`components/screens/`** — Screen components. `LobbyScreen` shows START button only to host (`myId === gameState.hostId`). `AnnounceScreen` has sequential staggered animation: label (t=0) → mode name + description (t=0.2s) → topic (t=1.0s). Mode names have no emoji. Footer text is mode-specific: closest → "Угадай число — победитель забирает банк", others → "Готовься к ставкам…". `BettingTableScreen` handles all modes; in kerri mode crowd sees the question text + options (correct highlighted green) above the table, plus WIN/LOSE selector + bank bet x4 UI. `QuestionScreen` in kerri crowd mode shows read-only options (disabled) with header "Наблюдай за Керри". `RevealScreen` shows win delta as animated physical chips (`WinChips` component, 60ms stagger) for ALL positive-delta players; player cards have green/red borders based on correct/wrong answer; shows status label per mode. `LateJoinScreen` — shown to players who join mid-game, displays current player list with chip counts.
- **`components/ui/`** — `Chip.tsx` (5 denominations), `Timer.tsx`, `PlayerCard.tsx`, `PhysicalChipStack.tsx`, `BetZone.tsx`, `PlayerSlot.tsx`, `TableFelt.tsx`.

### Physical Chips UI (`client/src/`)

The betting phase uses a physical chip system on a round poker table (desktop only). The geometry constants in `tableGeometry.ts` define a **1040×660** logical scene, but the scene container in `BettingTableScreen` is wrapped in a 1.25× CSS transform (`transform: scale(1.25), transformOrigin: top left`), making the visual size **1300×825**.

- **`types/chips.ts`** — `PhysicalChip { id, denom }`, `buildPhysicalChips(total)` (random UUIDs), `buildChipsForPlayer(playerId, amount)` (stable IDs for opponents — no scatter jitter), `chipScatter(id, range)` (deterministic hash).
- **`lib/tableGeometry.ts`** — Ellipse constants: `SCENE_W=1040, SCENE_H=660, FELT_CX=520, FELT_CY=330, FELT_RX=240, FELT_RY=148, OUTER_RX=272, OUTER_RY=182, LAND_INSET=46, CARD_GAP=30`. Functions: `playerAngle(i,N)`, `landingZone(angle)`, `cardAnchor(angle)`, `unitPosition(angle, unitW, chipRowH, cardH)`.
- **`components/ui/PhysicalChipStack.tsx`** — Chips grouped by denom. Clicking the **denomination group container** calls `onDenomClick(denom)` — the parent finds the topmost unplaced chip of that denom. Non-placed chips use `layoutId={chip.id}` for Framer Motion flight animation. Placed chips are static dim placeholders (no layoutId).
- **`components/ui/BetZone.tsx`** — Absolutely positioned at `landingZone(angle)`. Mine: `layoutId` + recall click. Opponents: `AnimatePresence` + staggered `initial={{opacity:0, y:-8}}` entry animation (delay: `i * 0.04s`).
- **`components/ui/PlayerSlot.tsx`** — `PhysicalChipStack` + name card at `unitPosition()`. Prop: `onDenomClick?: (denom: ChipValue) => void`.
- **`components/ui/TableFelt.tsx`** — Always-mounted, reads `gameStore`. Renders green felt ellipse + player name cards. `blurred=true` → `filter:blur(8px), opacity:0.35` (animated). `pointerEvents:none`, `zIndex:0`.
- **`components/screens/BettingTableScreen.tsx`** — `LayoutGroup` wraps all chip elements. Scene wrapped in 1.25× CSS scale wrapper. Local state: `myStack`, `placedIds`, `pendingTarget`, `bankBetTarget`, `bankBetAmount`. `placeChip(denom)` finds **last** unplaced chip of that denom (top of visual stack). After each place/recall, emits `stage_chip` with new pending amount for real-time opponent preview. Opponent `betChips` uses `stagedBets[player.id] ?? player.currentBet`. Bank bet UI (kerri crowd): shows 4 MC options; correct one (matching `gladiatorAnswer`) has green border + non-clickable; wrong options clickable → select `bankBetTarget` (index); `+10/+20/+50/+100` buttons for `bankBetAmount`. Confirm emits `place_bet` and optionally `place_bank_bet`. Kerri crowd sees question text + options above the table during BETTING phase.

**Key design decisions:**
- `myStack` is component-local (not Zustand) — rebuilt from `me.chips` each time BETTING phase starts.
- `layoutId=chip.id` shared between `PhysicalChipStack` (unplaced) and `BetZone` (placed) → Framer Motion animates chip flight.
- During kerri BETTING: `gameState.gladiatorAnswer` = correct answer (sent to crowd by server, withheld from kerri).
- Real-time staging: `stage_chip` socket event relays visual pending amount to opponents before confirm; `stagedBets` in store, cleared on ANNOUNCE and on `bet_updated`.
- Chip selection: LIFO — last unplaced chip (top of visual stack) is picked on denom click.

**RevealScreen:** Win delta shown as animated physical chip objects with 60ms stagger (`WinChips` component) for all positive-delta players. Cards have green border (correct) / red border (wrong) per mode logic. `roundCorrectAnswer` / `roundMode` / `roundGladiatorId` come from `round_results` socket event.

### Phase flow

```
LOBBY → ANNOUNCE (5s) → [BETTING (30s) →] QUESTION_TEXT (5s) → QUESTION (40s) → REVEAL (8s) → LEADERBOARD (5s) → [next round or GAME_OVER]
```

`all` and `kerri` modes go through BETTING; `closest` skips BETTING (ANNOUNCE→QUESTION_TEXT directly). In kerri mode, `selectGladiator()` runs at ANNOUNCE→BETTING transition.

Mode rotation: `all → kerri → closest → all → kerri → ...`

### Tests

Located in `server/src/game/economy/__tests__/` and `server/src/game/__tests__/` and `shared/src/__tests__/`. vitest resolves `@cumsino/shared` via alias in `server/vitest.config.ts` — no need to build shared before running tests.

## Questions System (`scripts/data/`)

Dota 2 вопросы. Источник данных — GitHub-зеркало OpenDota: `raw.githubusercontent.com/odota/dotaconstants/master/build/`.

### Финальная база — `questions_db.json`

Единый файл для сервера. Структура: `{ MC: { items: { scripted, agent, agent_hard }, abilities: {...} }, CN: { ... } }`.

Итого 3786 вопросов (2026-05-26):
- `multiple_choice / items / agent`: 128
- `multiple_choice / abilities / agent`: 107
- `closest_number / items / scripted`: 641
- `closest_number / items / agent`: 76
- `closest_number / items / agent_hard`: 11
- `closest_number / abilities / scripted`: 2433
- `closest_number / abilities / agent`: 390

Пересобирать после каждого нового батча: `python scripts/build_questions_db.py`

### Исходные файлы (не удалять, не перегенерировать)

| Файл | Описание | Кол-во |
|---|---|---|
| `item_questions.json` | Предметы: цена, кд, статы. Структура `{"numeric":[...]}` | 641 |
| `ability_questions.json` | Способности героев по категориям `{category:[...]}` | 2433 |
| `active_questions_batch1.json` | Активки предметов, MC+CN | 18 |
| `active_questions_batch2.json` | Вычислительные производные, CN (agent_hard) | 12 |
| `active_questions_batch3.json` | Активки всех магазинных предметов, MC+CN | 186 |
| `ability_questions_new.json` | Эффекты способностей героев, MC+CN | 497 |

**`generate_item_questions.py` — не запускать** (пользователь вручную почистил вопросы).

### Типы вопросов

**`closest_number`** — игроки угадывают число, побеждает ближайший:
```json
{ "type": "closest_number", "question": "...", "answer": 260, "unit": "ед.", "item": "shivas_guard", "category": "active_mechanics" }
```
Для многоуровневых способностей — `answers: [v1,v2,v3,v4]` и `{level}` в тексте вопроса.

**`multiple_choice`** — 4 варианта, `correct: 0` в БД (верный всегда первый), **опции перемешиваются при загрузке** в `loadQuestions.ts`:
```json
{ "type": "multiple_choice", "question": "...", "options": ["правильный","дистрактор1","д2","д3"], "correct": 0 }
```

### Фильтры для генерации по предметам
- `cost > 0` — отсеивает нейтралки и удалённые предметы
- Не `recipe_` префикс
- Roshan blacklist: `cheese, royale_with_cheese, refresher_shard, aghanims_shard_roshan, ultimate_scepter_roshan, ultimate_scepter_2, aegis`
- Версионные дубли (оставить только base): `dagon_2-5, necronomicon_2-3`. Boots of Travel 1 и 2 — оба.

### Стандартный сетап героя для производных вопросов
300 МС, 200 базовый урон, 10 брони, 150 скорость атаки, BAT 1.7.

### Формулы
- Снижение урона от брони: `0.06*armor / (1 + 0.06*armor)`
- Атаки в секунду: `(1 + attack_speed/100) / BAT`
- Эффективный HP: `HP * (1 + 0.06 * armor)`

### Скрипты (`scripts/`)
- `build_questions_db.py` — пересборка `questions_db.json` из всех источников
- `export_batch_data.py` — подготовка батчей предметов для агентов
- `export_ability_batches.py` — подготовка батчей героев для агентов
- `merge_batches.py` — мерж item-батчей агентов
- `merge_ability_batches.py` — мерж ability-батчей + применение delete-листов
- `generate_ability_questions.py` — генерация ability_questions.json
- `cleanup_ability_questions.py` — фильтрация мусора из ability_questions

## Deployment

- **Server:** Render.com free tier. `render.yaml` at repo root. Build: `npm install && npm run build --workspace=shared && npm run build --workspace=server`. Shared must build first.
- **Client:** GitHub Actions → GitHub Pages. `.github/workflows/deploy.yml` triggers on push to `main` when `client/**` or `shared/**` change. Set `VITE_SERVER_URL` secret in GitHub repo settings.
- Render.com free tier sleeps after 15 min idle — open the site ~30s before playing.
