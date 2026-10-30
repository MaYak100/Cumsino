# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Cumsino — браузерная казино-викторина по Dota 2 для компании (до 8 игроков): ставки фишками на свой ответ, на
керри, «кто ближе»; гонка до $3000. npm workspaces: `shared/`, `server/` (Express + Socket.IO, состояние игры в
памяти), `client/` (React + Vite + Zustand + Framer Motion + Tailwind).

## Commands

```bash
npm run dev:server                      # сервер (tsx watch), порт 3001
npm run dev --workspace=client          # Vite, порт 5173 или следующий свободный
npm run test:server                     # vitest сервера (455 тестов)
npx vitest run --config server/vitest.config.ts          # из корня: сервер + shared/src/__tests__ (468)
npx vitest run server/src/game/economy/__tests__/applyBankBets.test.ts --config server/vitest.config.ts
npm run test:watch --workspace=server
npm run ratios --workspace=server       # таблица соотношений категорий (docs/questions/system.md, §7)
cd server && npx tsc --noEmit -p tsconfig.dev.json   # проверка типов (shared из исходников); клиент — cd client && npx tsc --noEmit
```

Production build: `npm run build --workspace=shared && npm run build --workspace=server`; клиент —
`npm run build --workspace=client` (Vite берёт shared из исходников).

**`@cumsino/shared` в dev:** vitest и Vite алиасят его на `../shared/index.ts` (исходники); `tsx` сервера
(`dev`, `ratios`) запускается с `server/tsconfig.dev.json` — там `paths` на исходники shared этого checkout (иначе
симлинк workspaces ведёт в `shared/dist` основного checkout со старыми константами). В `server/tsconfig.json`
**нет `paths`** — прод-`tsc` с ними падает с TS6059 (файл вне rootDir); прод берёт собранный `shared/dist`.

### Лаборатория вопросов (`/dev`) и моки (`/mocks`)

Обе страницы — только в dev-сборке (`main.tsx`, lazy-импорт под `import.meta.env.DEV`).

- `/dev` (`http://localhost:5173/Cumsino/dev`, нужен `dev:server`) — настоящие вопросы на настоящих экранах, без
  сокета. Панель слева (скрыть — `H`): режим (для всех / керри: толпа / керри: я керри / кто ближе) → категория и
  подкатегория (или «по весам, как в игре») → вопрос; стадия: анонс → ставки → вопрос → ответ → итоги. Клавиши: `→`/`←`,
  `R` ответ, `1`–`5` стадия, `C` скопировать id. Поле id (`num:…`, `mech:…`, `stat:…`, `fr:…`), «Друзья» (≥ 2),
  слайдер игроков 2–8, внизу — экраны вне раунда. Оценки никуда не уходят (`setRating`
  подменён). Сервер: `server/src/dev/questionLab.ts` — `GET /dev/catalog`, `GET /dev/question?session&mode&cat&sub&id&friends`,
  `POST /dev/reset`, только при `NODE_ENV !== 'production'`; свой `QuestionHistory` без хранилища (в Neon не пишет,
  в сессии срез не повторяется, кончился — новый круг). Клиент: `client/src/dev/` — `DevPage.tsx`, `labApi.ts`,
  `labState.ts` (вопрос + режим + стадия → состояние `gameStore`), `scenarios.ts`.
- `/mocks?s=<id сценария>&n=<игроки>` — без сервера: `dev/MockPage.tsx` + `dev/mockStates.ts` (лавка, предметы,
  блайнды, серии, керри-стол; `betting-bigblind-me`, `betting-all-full`, `betting-kerri-crowd-full`, `lobby-bots`,
  `question-smoke-gemmed` и др.); игроков 1–8. Боты (`ui/BotMark.tsx` — пометка «бот», если в имени не сказано).

### Windows

- Python: `python -X utf8 script.py` — без этого печать кириллицы в cp1251 падает. Многострочный `python -c` в Git
  Bash ломается — писать скрипт в файл.
- `.env` в корне основного checkout: `DATABASE_URL` (Neon, проект Cumsino `misty-king-07552108`; строку можно взять
  через Neon MCP `get_connection_string`) и `STRATZ_API_KEY`.
- Пересъём друзей: `python -X utf8 scripts/fetch_friends.py --me 1101588971 && python -X utf8 scripts/friends_questions.py --build`
  (`matches.jsonl` / `state.json` в .gitignore — на новой машине качается всё заново, ~200 запросов, один IP).

### Worktree (`.claude/worktrees/<имя>`)

- Своих `node_modules` нет — резолвятся из `C:\Dev\Cumsino\node_modules`, а `@cumsino/shared` там ссылается на копию
  основного checkout. vitest/Vite (алиас) и `npm run dev`/`ratios` сервера (`tsconfig.dev.json`) видят shared
  ворктри; голый `tsc --noEmit` сервера — нет: проверять с `-p server/tsconfig.dev.json` (TS6059 там нет, rootDir — корень).
- `.env` сервер ищет вверх по папкам — из worktree находит `.env` основного checkout (`setup.ts`, `findDotEnv`).
  Порт 3001 обычно занят сервером основного checkout: сервер ворктри — `PORT=3002`, клиент —
  `VITE_SERVER_URL=http://localhost:3002`; `DATABASE_URL=` (пусто, явная переменная главнее) — без Neon.
- `git stash` общий для всех ворктри — не использовать голый stash.

## Architecture

### `@cumsino/shared` (`shared/src/`)

- `types.ts` — `Player`, `GameState`, `Question`, `RoundResult`, payload'ы сокетов. `GamePhase = LOBBY | SHOP |
  ANNOUNCE | BETTING | QUESTION | REVEAL | GAME_OVER`, `GameMode = 'all' | 'kerri' | 'closest'`. `Question`:
  `displayTopic` (тема «субъект\nаспект»), `comment`, `optionNotes` (значение каждого варианта, ≤ ~6 символов),
  `unit`, `category`/`subcategory`. `Player.spectator` — зритель, `Player.bot` — бот (`add_bot`). В
  `GameState.currentQuestion` нет `answer`/`numericAnswer`/`comment`/`optionNotes`, а `id` — ключ раунда (см.
  «Протокол»).
- `constants.ts` — `STARTING_CHIPS=500`, `WIN_CHIPS=3000`, `GLADIATOR_BONUS=300`, `CLOSEST_WINNER_BONUS=200`
  (+`CLOSEST_EXACT_BONUS=200` за точное), `MAX_PLAYERS=8`, `MIN_CHIP=10`, `PHASE_DURATIONS` (SHOP 25, ANNOUNCE 9,
  BETTING 30, QUESTION 45, REVEAL 14 с), `NEW_MODE_ANNOUNCE_EXTRA=3`, `FIRST_SHOP_EXTRA=20`, `ANSWER_REVEAL_MS=4000`
  / `ANSWER_REVEAL_NOTES_MS=6000`, `BRIBE_ENABLED=false`.
- `items.ts` — предметы, цены (`itemPrice` растёт с балансом), блайнды (`blindFor`), молния и серия (от выигрыша,
  `floor10`), BKB (`bkbCap(цена покупки)`), аегис — правила в [docs/items.md](docs/items.md).
- `chips.ts` — `decomposeToChips(amount)` (80% крупными 500/100, 20% мелкими 50/20/10, `normalizeMax7()` — стопка
  > 7 фишек укрупняется), `decomposeStartingChips()` = 4×100+1×50+1×20+3×10.
- `units.ts` — `withUnit(value, unit)`: «175%», «1.5×» слитно, «12 сек.», «2250 золота» через пробел. В MC единица уже в
  тексте варианта, в closest — у поля ввода и в «Правильный ответ».
- `topic.ts` — `joinTopic` / `splitTopic` (тема «субъект\nаспект»).

### Server (`server/src/`)

- **`index.ts`** — Express + Socket.IO. `cors` + `allowRequest` проверяет Origin и у WebSocket (`socket/origin.ts`;
  `CLIENT_ORIGIN`, по умолчанию любой `http://localhost:*`), `maxHttpBufferSize: 32_000`, `/health`, `/dev/*` вне
  production. До `listen` ждёт `createHistory()` (Neon). `uncaughtException` / `unhandledRejection` — в лог, не падение.
  SIGTERM / SIGINT — дописать очередь в Neon (до 5 с) и выйти.
- **`game/GameEngine.ts`** — `rooms: Map<code, GameRoom>`, `playerRoom: Map<socketId, code>`; `MAX_ROOMS=200`.
  `joinRoom` проверяет «комната полна» / «сервер полон» **до** выхода из старой комнаты (`join_error`), переход в
  другую комнату не оставляет «призрака»; повторный join того же сокета не сбрасывает фишки. Вышел последний
  человек (`humanCount === 0`; оставшиеся боты не держат комнату) — `room.destroy()` (закрывает показ вопроса —
  `settle`, снимает таймеры ботов) и удаление. Библиотека вопросов грузится в конструкторе.
- **`game/GameRoom.ts`** — машина фаз и экономика комнаты (EventEmitter: `broadcast`, `broadcastExcept`,
  `sendToPlayer`; `sendToCrowd` — толпе керри без керри и зрителей). Главное:
  - **Фазы** через `schedulePhase()` / `onPhaseEnd()`, таймеры через `safely()`. `nextRound()` выбирает режим
    (`RoundSelector`: `all → kerri → closest` по кругу) и вопрос (ошибка пикера — следующий режим, до 3 попыток),
    увеличивает `roundIndex`, сбрасывает раундовое состояние и ключ раунда, снимает `spectator`. Раунд `all` после
    первого сыгранного `closest` начинается с **SHOP** (см. docs/items.md), иначе ANNOUNCE (+3 с, если режим в игре
    впервые). ANNOUNCE → (kerri: `selectGladiator()` — из «мешка»; затем `assignBlinds()`) → BETTING, а
    `closest` или «ставить некому» (`bettingNeeded()` пуст) — сразу QUESTION. Конец BETTING — `forceBlinds()`.
  - **Конец вопроса:** все ответили → `startGrace()` (`LAST_ANSWER_GRACE_MS` 1 с, блинк перезапускает) →
    `advanceFromQuestion()`: `revealing = true` (идемпотентно: поздний ответ / дисконнект не считают раунд второй
    раз), `calculateResults()` = `baseResults()` + `applyBonuses()` (молния → серия → BKB → аегис; серии и аегисы в
    `pending`, применяет `commitSettlement()` — тесты могут звать `calculateResults()` повторно), `applyDeltas`
    (флор 0), `reportRound()` (показ для оценок), `game_state` и `round_results`; фаза остаётся QUESTION ещё 4 с
    (6 с с `optionNotes`) — клиенты показывают ответ — потом REVEAL. Ошибка расчёта — нулевые итоги «Ошибка расчёта».
  - **Керри — «мешок»** (`kerriBag`): каждый участник по разу в случайном порядке, потом новый круг из всех. Ушедший
    выпадает из мешка; вошедший посреди круга добавляется в текущий круг (к тем, кто ещё не был керри), вошедший
    после конца круга — в следующий. Зритель керри не становится и остаётся в мешке. Боты — тоже керри.
  - **Победа** проверяется в конце REVEAL: **единственный** самый богатый из ≥ `WIN_CHIPS`; точная ничья наверху —
    игра идёт ещё раунд (и дальше, пока лидер не один). `game_over.winner` — публичная проекция. Следующий вопрос не
    собрался — GAME_OVER с лидером.
  - **Отмена раунда** (`cancelRound`: нулевые дельты, причина в `sources` и `comment`, ставки и банк-ставки не
    списываются, **потраченные в раунде предметы возвращаются в запас** — `refundRoundItems`): керри ушёл в BETTING
    или в QUESTION до расчёта («Керри сбежал»), не осталось участников (одни зрители) в ANNOUNCE/BETTING/QUESTION,
    «Некому играть», ошибка расчёта.
  - **Уход игрока:** хост переназначается (только на человека); фазы перепроверяются (SHOP — все готовы, BETTING —
    все подтвердили, QUESTION — все ответили). Людей не осталось — ничего не перепроверяется (движок закрывает).
  - **Боты** (соло-тесты): `addBot(hostId)` / `removeBot(hostId, botId)` — только хост и только в LOBBY, лимит
    `MAX_PLAYERS`, имя «Бот N» (наименьший свободный номер), id `bot-N`, публично `Player.bot = true`. `runBots()` на
    каждой `schedulePhase()`: через 0.5–3 с (`botLater`, таймеры по боту в `botTimers`, снимаются на смене фазы, при
    уходе бота и в `destroy`) — SHOP: «Готов» (не покупает); BETTING: блайнд (толпа керри — случайная сторона, без
    банк-ставки); QUESTION (в kerri — только керри-бот): MC — 40% верный, иначе случайный вариант; «кто ближе» — 40% в
    ±10% от ответа, иначе ±50%. Предметы и оценки — никогда. Ботам не шлются события (`sendToPlayer` / `game_state`
    пропускают); в `reportRound` (делитель оценки `roomPlayers`, `present`, статистика ответов) их нет, `rateQuestion`
    бота игнорируется, «кто ты» бот не выбирает.
  - **Ставки** `placeBet(id, amount, target?, chips?, bankBet?)`: только BETTING, не зритель, не керри; не меньше
    блайнда (если на него хватает); в kerri ненулевая ставка требует `target`; банк-ставка толпы ×4 приходит в том
    же `place_bet` (`bankBet {optionIndex, amount}`) — только на неверный вариант, > 0, вместе с основной в пределах
    баланса, иначе отклоняется только банк. `betChips` — префикс присланных фишек на сумму «основная + принятая
    банк» (`chipsPrefix`). Все, кого ждём, подтвердили → QUESTION сразу. `stageChip(id, chips, target?)` — превью
    `chip_staged` соперникам; в kerri запоминает сторону для `forceBlinds()` (нет стороны — `'win'`).
  - **Ответы** `submitAnswer(id, answer, blink)`: только QUESTION до расчёта, не зритель, в kerri — только керри;
    `answerOk` (вариант из списка / конечное число), не вариант, убранный мантой, не после хекса; повторный — только
    блинком и на другой ответ.
  - **Зрители:** вошедший вне LOBBY/SHOP — `spectator` до `nextRound()` (публичный флаг): не ставит, не отвечает, без
    предметов и блайнда, не керри, не цель гема/хекса, не получает `gladiatorAnswer`/`bank_bet_updated`, его не ждут.
  - **Видимость:** `getPublicState()` — без запаса, банк-ставок и раундовых предметов; чужой `answer` — только после
    расчёта; в SHOP `currentQuestion = null`; смок до ответа прячет чужой `hasAnswered`. `getStateForPlayer()` добавляет
    своё: `inventory`, `prices`, `aegisBought`, `hexTimeLeft`, `removedOptions`; толпе керри (не керри, не зрителю) в
    BETTING/QUESTION — `gladiatorAnswer` (= верный ответ).
  - **Оценка** `rateQuestion(id, questionId, vote)` — только последний посчитанный вопрос (`ratable`), по настоящему id
    или ключу раунда.
  - **Предметы / блайнды / бонусы / лавка** (`buyItem`, `useItem`, `setShopReady`, `canUse`, хекс с `hexDeadline` /
    `hexDone`) — [docs/items.md](docs/items.md). Аукцион взяток выключен флагом (`BRIBE_ENABLED`), код и тесты
    сохранены.
- **`game/economy/`** — чистые функции, `Map<playerId, delta>`: `distributePool` (пул проигравших делится между
  победителями пропорционально ставкам, кратно 10, остаток — крупнейшему), `distributeClosest` (ближайший +200,
  точно +200 сверху, ничья — поровну), `applyBankBets` (попадание +3× ставки, промах −ставка). «Все ошиблись» /
  «все угадали» `GameRoom` решает сам — дельт нет.
- **`socket/handlers.ts`** — обёртка на каждое событие: token bucket на сокет (`EVENTS_BURST=40`, +20 в с, лишнее
  молча), пустой payload → `{}`, исключение → лог. Проверки: код комнаты `^[A-Z0-9]{2,8}$`, имя `cleanName` (без
  управляющих / невидимых символов и «залго», ≤ 24), ставки — целые кратные 10, фишки — номиналы (≤ 40 шт.), ответ ≤
  300 символов, предмет из `ITEM_ORDER`, `targetId` ≤ 64, `remove_bot.id` — строка 1–64. Оценка копится и уходит в комнату не чаще раза в секунду
  (`RATE_FLUSH_MS`), недосланная — при disconnect.
- **`game/questions/`** — система вопросов ([docs/questions/system.md](docs/questions/system.md)): `library.ts`
  (банк, статистика, друзья, `categories.ts`), `picker.ts` (`RoomQuestions`: режим → категория → подкатегория по
  сглаженным весам `smooth.ts` и множителям оценок → колода), `stepOptions.ts` (варианты числа по шагу),
  `history.ts` (колоды, кредиты, оценки, архив), `pgBackend.ts` (Neon), `setup.ts` (`.env`, 4 попытки загрузки
  базы), `friends.ts`. **`game/stats/statQuestions.ts`** — вопросы на статистике STRATZ / OpenDota
  ([docs/questions/stratz-research.md](docs/questions/stratz-research.md), раздел 5).

### Протокол сокетов

Клиент → сервер: `join_game {name, gameCode}`, `start_game` (только хост), `identify {friendId|null}` (лобби),
`shop_ready {ready}`, `buy_item {item}`, `use_item {item, targetId?}`, `stage_chip {chips, target?}`,
`place_bet {amount, target?, chips?, bankBet?}`, `gladiator_hover {optionIndex|null}`, `submit_answer {answer, blink?}`,
`rate_question {questionId, score?, difficulty?}` (`null` — снять), `pay_bribe`, `add_bot` (хост, лобби),
`remove_bot {id}` (хост, лобби; в сторе `addBot()` / `removeBot(id)`).

Сервер → клиент: `game_state` (личный, `getStateForPlayer`; без изменений `identify` / `shop_ready` / повторный join
не рассылаются всем), `join_error {reason: room_full | server_full | bad_name | bad_code, message}`,
`bet_updated {playerId, amount, target?, chips?}` (и принудительный блайнд — без `chips`), `bank_bet_updated` (только
толпе керри), `chip_staged`, `player_answered` (игроку в смоке — только себе), `gladiator_hovering`,
`round_results {results, questionId, questionKey, correctAnswer, correctNumericAnswer, comment, optionNotes, mode,
gladiatorId}`, `game_over {winner}`, `item_used`, `gem_result`, `manta_result`, `bribe_*`.

**id вопроса:** до расчёта `currentQuestion.id` — непрозрачный ключ раунда `r<roundIndex>-<случайное>` (у статистики
настоящий id содержит ответ); настоящий — в `round_results.questionId`, `questionKey` = ключ раунда.

### Phase flow

```
LOBBY → [SHOP 25 с (45 с первая) →] ANNOUNCE 9 с (+3 новый режим) → [BETTING 30 с →] QUESTION 45 с → [показ ответа 4/6 с] → REVEAL 14 с → следующий раунд | GAME_OVER
```

SHOP — только перед `all` и только после первого `closest`. BETTING — у `all` и `kerri`, если есть кому ставить.
Режимы: `all → kerri → closest → …`. Новой игры после GAME_OVER нет (комната терминальна, клиент выходит в JoinScreen).

### Client (`client/src/`)

- **`socket.ts`** — синглтон, `autoConnect: false`, URL `VITE_SERVER_URL` или `http://localhost:3001`.
- **`store/gameStore.ts`** — Zustand, все слушатели сокета здесь. После обрыва (`socket.io` `reconnect`) сам повторяет
  `join_game` с тем же именем и кодом — но это новый сокет = новый игрок (зритель до следующего раунда).
  `isLateJoiner` = `me.spectator` с сервера. Раунд (`roundResults`, `roundCorrectAnswer`, `roundComment`,
  `roundOptionNotes`, `roundQuestionId`, `bankBets`, `stagedBets`, `betSent`, лента предметов) сбрасывается на ANNOUNCE
  и смене `roundIndex`. `answeredIds` — из `players[].hasAnswered` + `player_answered`. `stagedBets: Record<id,
  number[]>` — номиналы черновиков соперников, стираются на `bet_updated` этого игрока. `betSent` — отличить свою ставку
  от принудительного блайнда (`Notice`). `joinError`. Оценка: `rating` / `setRating` — уходит через 0.8 с после
  изменения (снятие тоже), отложенная досылается на ANNOUNCE / GAME_OVER / LOBBY / смене раунда и `pagehide`; ключ
  раунда заменяется настоящим id из `round_results`. Селекторы `selectMe`, `selectIsGladiator`.
- **`App.tsx`** — без `gameState` → `JoinScreen` (будит сервер на Render, показывает `join_error` и ошибку
  соединения); зритель → `LateJoinScreen`; иначе `screenFor(phase, mode, isGladiator)` (`components/screens/screenFor.ts`,
  общий с `/dev`): LOBBY → `LobbyScreen`, SHOP → `ShopScreen`, ANNOUNCE → `AnnounceScreen`, BETTING →
  `BettingTableScreen`, QUESTION → `ClosestScreen` / `QuestionScreen` (`GladiatorSelfScreen` — реэкспорт), REVEAL →
  `RoundResultsScreen`, GAME_OVER → `GameOverScreen`. Под экранами всегда `TableFelt` (вне BETTING — `blur(14px)`,
  opacity 0.13; на BETTING рисует только сукно — плашки и кучки там у `BettingTableScreen`, общий `PLATE_TOP` с
  `PlayerSlot`; на компактных ставках фон размыт), поверх — `ItemBar` и `Notice`. Экран — в `motion.div` с `pointerEvents: 'auto'`: Framer Motion 11
  ставит `pointer-events: none` элементу с `initial={{opacity: 0}}`, и это наследуют поля и кнопки. Раз в 10 мин —
  `/health` (Render не засыпает посреди игры).
- **Экраны:** `LobbyScreen` (игроки-стикеры; хосту — «+ бот» пустым местом и крестик на наклейке бота; «кто ты» —
  `WhoAreYou`: люди компании наклейками — свободные бумага, своя латунь со шлепком, занятые зачёркнуты с подписью кем,
  «Я не …», точки «назвались N/2»; ботам не показывается; старт только у хоста), `AnnounceScreen` (режим во
  весь экран, затем стикер темы; модульный `seenModes` — дольше в первый раз, сбрасывается с новой игрой),
  `ShopScreen`, `BettingTableScreen`, `QuestionScreen` (все / керри / толпа керри), `ClosestScreen`,
  `RoundResultsScreen` (общая ось 0 → 3000, пересортировка по новому балансу), `GameOverScreen`, `LateJoinScreen`.
- **lib:** `tableGeometry.ts` (геометрия стола, `useSceneScale`, `SceneScaleContext` / `useFlightTransform`),
  `pileSlots.ts` (`useStableSlots` — фишка держит место в кучке), `chipStyle.ts`, `pressable.ts` (`pressable()` —
  div как кнопка с клавиатуры; `ignoreHotkey()` — хоткеи не срабатывают с Ctrl/Alt/Meta, на автоповторе и в поле
  ввода), `useAnswerAck.ts` (ответ, не засчитанный сервером, снимается через 2.5 с — «Ответ не засчитан»),
  `parseNumber.ts` (строгий разбор числа «кто ближе»), `players.ts` (`isSpectator`), `useCountdown.ts`,
  `useBetting.ts` (вся логика ставок — черновик `stage_chip`, подтверждение, автоподтверждение, быстрые ставки,
  блайнд; общая для круглого стола и компактных ставок, черновик переживает поворот телефона).

### Стол ставок (BETTING)

Логическая сцена **1300×820** (`lib/tableGeometry.ts`: `FELT_CX=650, FELT_CY=415, FELT_RX=380, FELT_RY=248,
OUTER_RX=424, OUTER_RY=285, LAND_INSET=20, CARD_GAP_X=CARD_GAP_Y=45`), масштаб `useSceneScale()` — до ×1.4, по
ширине и высоте (+90 под плашки). Функции: `playerAngle(i, N)` (я — первый, снизу), `landingZone(angle)` (зона
ставки, утоплена на `LAND_INSET`), `cardAnchor`, `unitPosition` (стопка + плашка; так же в `TableFelt`).

- Своя стопка `myStack` — локальное состояние `BettingTableScreen`, собирается из `me.chips` на каждый BETTING
  (id фишек — счётчик + метка сессии, без `crypto.randomUUID`: его нет на http по LAN). Клик по номиналу кладёт
  верхнюю невыложенную фишку (LIFO). Фишка перелетает стопка ↔ кучка по общему `layoutId={chip.id}`
  (`PhysicalChipStack` ↔ `BetZone`/кучка); внутри `scale()` сдвиг перелёта делится на масштаб (`useFlightTransform`
  через `transformTemplate`), иначе рывок.
- Кучка — спираль `pileOffset` по порядку выкладки, место держится (`useStableSlots`). Соперники: черновик
  (`stagedBets`, id `${i}-${denom}-${playerId}`) → после подтверждения `player.betChips` → иначе
  `buildChipsForPlayer(id, currentBet)` (стабильные id). Каждая выкладка шлёт `stage_chip`.
- Быстрые ставки min / 25% / 50% / all-in раскладывают фишки каскадом (пока раскладываются, «Ставлю» спрятана);
  ставка уходит только по «Ставлю $N» (над своей кучкой, z 60, вместе с подписью блайнда). Автоподтверждение
  черновика перед концом фазы — на клиенте; не успел — сервер ставит блайнд.
- Плашка игрока «имя | $баланс» (`NamePlate` в `PlayerSlot.tsx`), бирка «ББ» на углу у большого блайнда, `StreakFlame`
  вокруг плашки при серии ≥ 2.
- **Телефон — `CompactBetting`** вместо круглого стола, когда ширина < 640 px или масштаб сцены < `COMPACT_SCALE`
  (0.55; `useCompactBetting` в `tableGeometry.ts`): шапка (режим, таймер, тема; в керри — кто отвечает и вопрос), своя
  зона-сукно (в керри — «Завалит / Ответит» и квитки ×4 колонкой), соперники полосой (мини-кучка, сумма, «думает»,
  исход, цель хекса), `ItemBar` в потоке (`inline`); док снизу — стопки, min / 25% / 50% / all-in, «Ставлю $N»,
  «Отмена», блайнд (`ui/BetButtons.tsx`). В альбомной ориентации ниже 560 px док прокручивается со страницей.
- Керри-толпа: шапка (кто отвечает + вопрос, верный отмечен), две зоны «Завалит / Ответит» с суммой на кону, ниже
  2×2 квитка 210×64 «где ошибётся ×4» (верный не кликается, банк-фишки лежат внутри квитка); кучки соперников
  компактные (`BetZone size="sm"`). `place_bet.chips` = основная + банк в порядке черновика. Керри видит только
  информационный текст.

### Дизайн («подпольное казино в стикерах», редизайн 2026-10-29)

Палитра — `client/src/theme.ts` (`C`, зеркало `:root` в `index.css` и цвета Tailwind): сукно `#0c1513` / панели
`#13201c` / линии `#24352f`, текст `#ede8de`, вспомогательный `#93a39c`, бумага стикеров `#f3ede2`, чернила `#121a17`;
акценты — латунь `#f2b630`, малиновый `#ff3d6e` (керри, ошибка, потеря), голубой `#49c6e5`, мята `#3ee08f` (верно,
прирост). **У режима свой цвет** (`MODE`: all — латунь, kerri — малиновый, closest — голубой). Шрифты:
`Dela Gothic One` (`DISPLAY` / `.font-display` — режимы, темы, суммы, код комнаты) + `Rubik`. Без эмодзи, без
капса-лейблов. Деньги всегда с `$` (`ui/Money.tsx`).

- **`ui/Sticker.tsx`** — наклейка с рваной вырезкой (`roughClip(seed)`) и «шлепком»: тема в анонсе и на столе
  (`ui/Topic.tsx`: субъект крупно, аспект мельче; над вопросом — в строку «Lion · способности»), бирки значений
  вариантов, код комнаты, игроки в лобби, «Ты керри», победитель.
- **Гонка до 3000** — `ui/GameHud.tsx` (`MiniRace` в шапке), общая ось на итогах, линия в лобби и в конце игры.
  `ui/TimeBar.tsx` — фитиль под шапкой (полосы фиксированной длины: 45 с вопроса, `HEX_SECONDS` хекса; метка-молния
  на `LIGHTNING_MS`); `ui/Timer.tsx` — кольцо на столе.
- **Экран вопроса без сдвигов**: раскладка прибита к верху; `ui/AnswerOptions.tsx` — общий для всех / керри / толпы:
  строки одной высоты, значения вариантов — бирки поверх кромки, выбор 1–4 с клавиатуры, толпа видит верный пунктиром
  и куда смотрит керри. Ниже лоток: кто ответил (`AnswerProgress`) → пояснение (`RevealNote`) и оценка.
- **Оценка** (`ui/RateQuestion.tsx`): по краям «Легко» / «Сложно», по центру шкала Удалить / Слабый / Хороший /
  Ахуенный; видна с раскрытия ответа и на итогах.
- **«Кто ближе»** — большое поле (`type="text"` + `inputMode="decimal"`, Enter); раскрытие: число, «ты сказал / мимо
  на N», `ui/GuessLine.tsx` (все догадки на одной оси).
- **Предметы:** `ShopScreen` — карточки, цена от баланса, «Готов» (после — купить нельзя). `ui/ItemIcon.tsx` — иконки
  скетчем. `ui/ItemBar.tsx` — внизу в ANNOUNCE / BETTING / QUESTION, только купленное; недоступное — тусклое с
  подсказкой почему (на таче — первый тап подсказка, второй применяет); клавиши `ITEMS[id].key`: Z манта, X гем,
  C смок, V хекс, B BKB (блинк — через смену ответа); цель гема/хекса — выбор игрока (зрители не цели), Esc — отмена.
  Под панелью место — `.below-itembar` / `--itembar-pad`. `ui/SelfEffects.tsx` — наклейки про эффекты на тебе (гем
  в того, кто в смоке, — «Твой ответ пытались просветить»: клиент помнит, был ли смок, когда пришёл гем);
  эффекты на других — значки у ника (`Player.effects`). Порядок (лавка и бар): манта, гем, BKB, блинк, хекс, смок,
  аегис.
- **Серия** — `ui/StreakFlame.tsx`: бумажное пламя вокруг плашки (2 — тлеет, 3+ — выше, 5+ — синее); только на
  столе и в итогах.
- **Принудительная ставка** — `ui/Notice.tsx` на 3 с: «Поставили $30» / «Поставили на ответит».
- **Масштаб:** `html { font-size: clamp(16px, 5px + 0.5vw + 0.55vh, 22px) }` — экраны вне стола в rem; вопрос /
  «кто ближе» / итоги центрированы по вертикали; `100dvh` / `min-h-dvh`. Текст не выделяется (`user-select: none`,
  кроме полей).

## Questions System

**Перед любой работой с вопросами — [docs/questions/README.md](docs/questions/README.md) (стандарты, язык, шаг,
проверки сборки) и [docs/questions/BACKLOG.md](docs/questions/BACKLOG.md).** Как игра выбирает вопросы, колоды,
оценки, «Удалить», Neon — [docs/questions/system.md](docs/questions/system.md). Статистика STRATZ / OpenDota —
[docs/questions/stratz-research.md](docs/questions/stratz-research.md).

- **Источник истины** — снимок `scripts/data/dota/` на зафиксированных коммитах (`manifest.json`, обновление
  `python scripts/fetch_dota_data.py`); что сейчас в игре — `current.json` (`scripts/build_game_index.py`); ручные
  решения — `scripts/data/dota_overrides.json`. Бонусы аганима/шарда и вырезанное — из сырых файлов игры
  (`scripts/data/dota/game/`, парсер `scripts/valve_kv.py`).
- **Генерация** — `scripts/generate/numeric_lab/` (модель выбирает `fact_id`, пишет текст и `step`, число
  подставляет `resolve.py`; категории и квоты — `CATEGORY_SETUP` в `run_api.py`) и `scripts/generate/text_lab/`
  (механики: `mechanics_lab.py`, `prompt_mechanics_v4.md`, проверка, `curate.py`). Модель `claude-opus-5-5`, effort
  high, параллельные вызовы (`--sync`), без Batch API и `cache_control`. Ключ — `NUMLAB_API_KEY` или
  `ANTHROPIC_API_KEY`. Финальные прогоны: `numeric_lab/out/full1`, `costs2`, `talents-v5`, `text_lab/out/full1`.
- **Банк** — `scripts/data/bank/questions.json` (`python scripts/build_question_bank.py`): постоянные id, вопросы с
  флагами выкинуты, ручные правки — `scripts/data/bank/overrides.json` (`drop` / `why` + text / step / unit / ceil /
  sub / options / comment / ok). Сборка падает на: ответ ≤ 5 шагов (и до потолка `ceil`), ответ круглее любого
  фейка, единица не из словаря `UNITS`, латиница в русском слове, старые имена героев, врождёнка без «врождёнка X у
  героя», слова не по словарю сленга (`SLANG`, кроме талантов). Опечатки модели правит `TEXT_FIXES`; тему, которая
  выдаёт ответ («Чья способность…» среди чужих способностей), сборка сама меняет на «Герои».
- **Варианты** числа строит сервер при каждом показе (`stepOptions.ts`, эталон `options.py`): случайная позиция ответа,
  соседи через 1 или 2 шага (50/50), все > 0 и < `ceil`, отдельное перемешивание показа.
- **Язык** — словарь в docs/questions/README.md, «Язык и сленг»: сленг (стан, кд — среднего рода, стак, каст…) — да;
  «замедление», «безмолвие», «увеличение урона заклинаний», «базовое время атаки» — без сленга; таланты — строка
  русской локализации дословно ([talents-style.md](docs/questions/talents-style.md)).
- **Статистика** — снимок `scripts/data/stats/<дата>/` (`fetch_stats.py` — OpenDota, `fetch_stratz.py` — STRATZ) →
  `python scripts/build_stats_bank.py` → `scripts/data/stats/bank.json` → `statQuestions.ts`. **Друзья** —
  `scripts/data/friends/metrics.json` → `server/src/game/questions/friends.ts` (категория при ≥ 2 опознанных в лобби;
  «мейн», «винрейт героя», «тиммейты» — про всех из компании, опознанные ×3 чаще; «игры вместе» — пары с хотя бы одним
  опознанным; «свой винрейт» и «игры на герое» — только опознанные).
- Категории, подкатегории, веса (MC и closest) и тема — `server/src/game/questions/categories.ts` (правится руками; id
  не переименовывать — по ним ключи в Neon).

## Tests

`server/src/**/__tests__/` и `shared/src/__tests__/`; vitest алиасит `@cumsino/shared` на исходники (собирать shared
не нужно). 468 тестов из корня (`npx vitest run --config server/vitest.config.ts`), из них 455 — `npm run test:server`.

| Файл | Что покрыто |
|---|---|
| `economy/__tests__/` (`distributePool`, `distributeClosest`, `applyBankBets`) | пул и пропорции, zero-sum; ближайший, точное, ничья; банк-ставка +3× / −1× |
| `game/__tests__/RoundSelector.test.ts` | цикл all → kerri → closest |
| `game/__tests__/GameRoom.test.ts` (96) | игроки, расчёт по режимам, флор 0, победитель, `gladiatorAnswer`, `optionNotes`/`comment` только в `round_results` и пауза перед REVEAL, окно показа ответа, ставки и ответы, уход игроков (керри ушёл в QUESTION — отмена), блок «аудит» (хост, керри сбежал, банк на верный, проверка ответов, повторный join, ошибка пикера), аукцион взяток (методы напрямую) |
| `game/__tests__/items.test.ts` (111) | блайнды (в т.ч. керри, принудительный на выделенную сторону / «ответит»), молния и серия от выигрыша (вниз до $10, без проигравших — нет), лавка (первая после «кто ближе», «Готов», таймер), покупка, все предметы (BKB — сейв от цены покупки, аегис — не выше баланса перед раундом, обход «купил на последние»), окно 1 с после ответа, керри (керри — только блинк, толпа — только BKB), «кто ближе», края, вошедший посреди раунда |
| `game/__tests__/review.test.ts` (36) | утечки до расчёта по фазе × роли (id, notes, `gladiatorAnswer`, `bank_bet_updated`, чужие ответы, лавка), оценка по ключу / id, `present` и `settle`, зрители и отмена раунда, BETTING без ставящих, лимиты ставок, сброс раунда, сумма `sources` = delta, граница аегиса, победитель (точная ничья — играем дальше), хекс, ошибки не вешают комнату, без лишних `game_state` |
| `game/__tests__/rules.test.ts` (13) | решения 2026-10-30: возврат предметов отменённого раунда (керри сбежал в BETTING / QUESTION, ошибка расчёта), «мешок» керри (круг, ушедший, вошедший, зритель), боты (хост / лобби / лимит / имена, без стейта, полный цикл режимов сами, не в оценках, комната из одних ботов закрывается, таймеры) |
| `game/__tests__/GameEngine.test.ts` | вход, полная комната / `MAX_ROOMS` → `join_error`, переход между комнатами, удаление пустой |
| `socket/__tests__/handlers.test.ts` (77) | проверки payload всех событий, token bucket, `cleanName`, троттлинг оценок, `join_error`, Origin |
| `game/questions/__tests__/picker.test.ts` | шаг и `ceil`, единицы, сглаженный выбор, колоды (круг, соседние игры, группы с весами), веса MC / closest, тема, оценки и пределы множителей, друзья (про всех / только опознанные, доля опознанных ≈ ×3), прогон настоящего банка |
| `game/questions/__tests__/history.test.ts` | `.env`, попытки загрузки базы, колоды соседних игр и комнат, кредиты, оценка по id игрока, «удалить» при закрытии показа, блок «прошлой игры», карточки комнаты |
| `game/stats/__tests__/statQuestions.test.ts` | гейт и лидер, подписи, исключения, несовместимые пары, closest, предел отрыва, дерево талантов, `topLead`, настоящий `bank.json` |
| `shared/src/__tests__/` | `chips`, `units`, `topic` |

Паттерн GameRoom-тестов: `(room as any)` для private-полей и методов (`phase`, `currentMode`, `gladiatorId`,
`calculateResults`, `advanceFromQuestion`…), `vi.useFakeTimers()`.

## Открытые вопросы (ждут решения пользователя)

- **П1: переподключение = новый игрок** с $500 (сессий нет) — главный пункт [аудита](docs/audit-2026-10-28-game.md).
- Минимум игроков для старта (сейчас можно одному; для соло-тестов есть боты).
- Смок: скрывает ли хекс / BKB (сейчас нет).
- Телефон: на экране вопроса угловая панель предметов ещё может перекрывать низ контента.
- Позже: звук, баланс камбэка.

## Deployment

- **Server:** Render.com free tier, Frankfurt, сервис `Cumsino`, `https://cumsino.onrender.com`. Build:
  `npm install && npm run build --workspace=shared && npm run build --workspace=server`. Start:
  `npm run start --workspace=server`. Env: `NODE_ENV=production`, `PORT=10000`,
  `CLIENT_ORIGIN=https://mayak100.github.io`, `DATABASE_URL`. `server/render.yaml` есть, но сервис настроен руками.
  Засыпает после 15 мин простоя — открыть сайт за ~30 с до игры (`JoinScreen` будит).
- **Client:** GitHub Actions → GitHub Pages (`.github/workflows/deploy.yml`, push в `main` с изменениями `client/**`
  или `shared/**`, либо `workflow_dispatch`). Секрет `VITE_SERVER_URL=https://cumsino.onrender.com`. Адрес
  `https://mayak100.github.io/Cumsino/`, Vite base `/Cumsino/` (регистр важен).
- **Git:** удалённая ветка `main`; пуш — `git push origin HEAD:main` (с любой локальной ветки).
