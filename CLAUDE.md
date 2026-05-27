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

Single source of truth for types, constants, and the chip decomposition algorithm. Consumed by both server and client.

- `src/types.ts` — all interfaces: `Player`, `GameState`, `Question`, `RoundResult`, socket payloads
- `src/constants.ts` — `STARTING_CHIPS=500`, `WIN_CHIPS=3000`, `GLADIATOR_BONUS=300`, `PHASE_DURATIONS`, etc.
- `src/chips.ts` — `decomposeToChips(amount)` splits an amount into chip denominations (80% large: 500/100, 20% small: 50/20/10)

**Import resolution:** Both Vite (client) and vitest (server) alias `@cumsino/shared` → `../shared/index.ts` (raw TS source). The compiled `shared/dist/` is only used in production Render.com builds. The server `tsconfig.json` has **no `paths` block** — npm workspaces symlink handles resolution; adding `paths` here causes TS6059 (file outside rootDir).

### Server (`server/src/`)

Pure in-memory state, no database.

- **`index.ts`** — Express + Socket.IO setup. `CLIENT_ORIGIN` defaults to `/^http:\/\/localhost(:\d+)?$/` for local dev; set `CLIENT_ORIGIN` env var in production.
- **`game/GameRoom.ts`** — Core state machine. Extends EventEmitter. Manages phase transitions via `schedulePhase()` / `onPhaseEnd()`. Emits three events that `GameEngine` wires to Socket.IO: `broadcast`, `broadcastExcept`, `sendToPlayer`. Key method: `getStateForPlayer(playerId)` returns personalized `GameState` — crowd players in gladiator mode receive `gladiatorAnswer`, the gladiator itself does not.
- **`game/GameEngine.ts`** — Manages `rooms: Map<gameCode, GameRoom>` and `playerRoom: Map<socketId, gameCode>`. Calls `createRoom()` which wires the three GameRoom events to `io.to()` / `io.to().except()` / `io.to(playerId)`. When last player leaves, calls `room.destroy()` and removes the room from the map.
- **`game/loadQuestions.ts`** — Reads `scripts/data/questions_db.json` at runtime, transforms to `Question[]`. MC questions are duplicated for both `'all'` and `'gladiator'` modes. Multi-level CN questions (`answers[]`) get a random level picked at startup. ~4500 questions total.
- **`game/RoundSelector.ts`** — Round 1 = `'all'`, Round 2 = `'gladiator'`, Round 3+ = 70% opposite-of-last-main / 30% random special. Special modes: `['closest']` only — `top5` убран (нет вопросов в БД).
- **`game/economy/`** — Pure functions (tested): `distributePool`, `distributeClosest`, `distributeTop5`. All return `Map<playerId, delta>`. `buildResults()` in GameRoom converts the map to `RoundResult[]` covering **all players** (delta=0 for those not in the map).
- **`socket/handlers.ts`** — Six handlers: `join_game`, `start_game`, `place_bet`, `submit_answer`, `gladiator_hover`, `disconnect`.

### Client (`client/src/`)

- **`socket.ts`** — Socket.IO singleton, `autoConnect: false`. URL from `VITE_SERVER_URL` env var, falls back to `http://localhost:3001`.
- **`store/gameStore.ts`** — Zustand store. All socket listeners live here. `roundResults` is only cleared when `phase === 'ANNOUNCE'` (not on every `game_state` event) so RevealScreen can read them. Selectors: `selectMe`, `selectIsGladiator`.
- **`App.tsx`** — Routes `GamePhase → Screen` with `AnimatePresence`. No router library. Special cases: BETTING in gladiator mode → `GladiatorCrowdScreen` for crowd, `BettingScreen` for gladiator; QUESTION branches by mode.
- **`components/screens/`** — 13 screen components, one per game phase/role combination.
- **`components/ui/`** — `Chip.tsx` (5 denominations: 10=white, 20=green, 50=blue, 100=red, 500=black), `Timer.tsx`, `PlayerCard.tsx`.

### Phase flow

```
LOBBY → ANNOUNCE (5s) → BETTING (30s) → QUESTION_TEXT (5s) → QUESTION (40s) → REVEAL (8s) → LEADERBOARD (5s) → [next round or GAME_OVER]
```

In gladiator mode, `selectGladiator()` runs during the ANNOUNCE→BETTING transition (before crowd sees BETTING phase).

### Tests

Located in `server/src/game/economy/__tests__/` and `server/src/game/__tests__/`. vitest resolves `@cumsino/shared` via alias in `server/vitest.config.ts` — no need to build shared before running tests.

## Questions System (`scripts/data/`)

Dota 2 вопросы для режима "кто ближе" и вопросов для всех. Источник данных — GitHub-зеркало OpenDota: `raw.githubusercontent.com/odota/dotaconstants/master/build/`.

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

**`multiple_choice`** — 4 варианта, `correct: 0` (верный всегда первый, игра перемешивает):
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
