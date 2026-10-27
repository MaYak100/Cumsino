#!/usr/bin/env python3
"""
Снимок внешней статистики Dota 2 (винрейты, популярность героев и предметов) для вопросов.

Источник — OpenDota (api.opendota.com, без ключа). Пишет scripts/data/stats/<YYYY-MM-DD>/:
  manifest.json   — по каждому набору: эндпоинт, точный запрос, окно, фильтры, время съёма,
                    HTTP-статус, сырые файлы с sha256, размер выборки
  raw/            — ответы API как есть (источник истины: скользящие окна не воспроизвести)
  heroes.json     — нормализовано: {hero_id, hero, window_id, bracket, games, wins, winrate, pick_rate}
  items.json      — нормализовано: популярность предметов по двум доступным выборкам

Наборы:
  hero_wr_patch    — винрейт и пики героев на буквенном патче (окно от выхода патча + 24 ч до дня съёма),
                     ранговый All Pick, по рангам floor(avg_rank_tier/10) и все вместе. /explorer, SQL
                     по public_matches, кусками по 6 ч (тайм-аут запроса 15 с), кусок упал — делим пополам.
  hero_pop_30d     — то же за последние 30 дней (те же куски, отдельный запрос не нужен).
  hero_stats_7d    — /heroStats как есть: скользящие 7 суток, быстрая сверка.
  item_timings_4w  — /scenarios/itemTimings по каждому герою: покупки предметов от 1400 золота до 30-й
                     минуты в авторазобранных матчах, ~4 недели. Знаменатель — /scenarios/laneRoles.
  item_pro_30d     — /explorer по разобранным про-матчам (player_matches.purchase_log): все предметы,
                     точный знаменатель, но выборка маленькая и только про-сцена.

Чего нет: популярности предметов «за всё время» OpenDota не даёт (public_matches без предметов и
хранится 12 месяцев, сценарии — 4 недели). STRATZ (Bearer-токен, Cloudflare), Dotabuff и D2PT (403)
не используются — см. docs/questions/sources-research.md.

Использование (из корня репо):
  python scripts/fetch_stats.py                       # окно до сегодняшней полуночи UTC
  python scripts/fetch_stats.py --cutoff 2026-10-27   # закрыть окна другой датой (= id снимка)
  python scripts/fetch_stats.py --skip-items          # только герои

Повторный запуск в тот же день докачивает: уже сохранённые куски /explorer не запрашиваются заново.
"""

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

API = "https://api.opendota.com/api"
USER_AGENT = "Cumsino-stats-snapshot/1.0 (+https://github.com/mayak100/Cumsino)"
DOTA_DIR = Path("scripts/data/dota")
STATS_DIR = Path("scripts/data/stats")

# Буквенный патч и его начало. dotaconstants и OpenDota знают только «7.41», поэтому дату буквы
# берём из истории d2vpkr: первый коммит с ключами DOTA_Patch_7_41f_* в patchnotes_english.txt
# (sources-research.md, раздел 3). Окно открываем через 24 ч: точность d2vpkr ~±1 ч, и в первые
# часы не все обновились. С выходом 7.41g сюда нужна новая запись.
PATCH = "7.41f"
PATCH_STARTED_AT = "2026-09-15T19:00:00Z"
PATCH_EVIDENCE = {
    "repo": "dotabuff/d2vpkr",
    "commit": "969480b",
    "file": "dota/resource/localization/patchnotes/patchnotes_english.txt",
    "key": "DOTA_Patch_7_41f_*",
}
PATCH_BUFFER_H = 24

# Ранговый All Pick: lobby_type 7 = Ranked, game_mode 22 = All Pick (ранговый AP — game_mode 22,
# не 1; проверено по распределению public_matches: 7/22 — самая частая пара)
LOBBY_TYPE = 7
GAME_MODE = 22

BRACKETS = {1: "Herald", 2: "Guardian", 3: "Crusader", 4: "Archon",
            5: "Legend", 6: "Ancient", 7: "Divine", 8: "Immortal"}

# Семантика /scenarios сверена по исходникам OpenDota на этом коммите
ODOTA_CORE_COMMIT = "a01970be5e1f7871bad344bc50cb780ae963ab55"

# Без ключа OpenDota пускает 60 запросов в минуту и ~3000 в день — держим ≥1,1 с между запросами
MIN_INTERVAL_S = 1.1
RETRY_DELAYS_S = [2, 4, 8, 16, 32]
SCENARIOS_LIMIT = {"itemTimings": 1600, "laneRoles": 1200}  # LIMIT в SQL OpenDota: ответ упёрся — обрезан

HERO_SQL = """SELECT floor(avg_rank_tier / 10)::int AS bracket, h AS hero_id, count(*) AS games,
       sum(CASE WHEN (h = ANY(radiant_team)) = radiant_win THEN 1 ELSE 0 END) AS wins
FROM public_matches, unnest(radiant_team || dire_team) AS h
WHERE start_time >= {start} AND start_time < {end} AND lobby_type = {lobby} AND game_mode = {mode}
GROUP BY 1, 2
UNION ALL
SELECT floor(avg_rank_tier / 10)::int, 0, count(*), sum(CASE WHEN radiant_win THEN 1 ELSE 0 END)
FROM public_matches
WHERE start_time >= {start} AND start_time < {end} AND lobby_type = {lobby} AND game_mode = {mode}
GROUP BY 1"""
# hero_id = 0 — служебная строка: games = число матчей, wins = победы Radiant

ITEM_PRO_SQL = """SELECT p.item, count(*) AS players,
       sum(CASE WHEN (pm.player_slot < 128) = m.radiant_win THEN 1 ELSE 0 END) AS wins
FROM matches m JOIN player_matches pm USING (match_id)
CROSS JOIN LATERAL (SELECT DISTINCT e->>'key' AS item FROM unnest(pm.purchase_log) e) p
WHERE m.start_time >= {start} AND m.start_time < {end}
GROUP BY p.item
UNION ALL
SELECT '*players', count(*), sum(CASE WHEN (pm.player_slot < 128) = m.radiant_win THEN 1 ELSE 0 END)
FROM matches m JOIN player_matches pm USING (match_id)
WHERE m.start_time >= {start} AND m.start_time < {end} AND pm.purchase_log IS NOT NULL
UNION ALL
SELECT '*matches', count(DISTINCT m.match_id), 0
FROM matches m JOIN player_matches pm USING (match_id)
WHERE m.start_time >= {start} AND m.start_time < {end} AND pm.purchase_log IS NOT NULL"""
# '*players' — игроков с purchase_log (знаменатель), '*matches' — матчей

# TODO(STRATZ): api.stratz.com отдаёт страницу Cloudflare «Just a moment» и требует Bearer-токен.
# Когда будет токен (env STRATZ_TOKEN) — добавить наборы heroStats.winDay по bracketIds за окно
# патча и itemFullPurchase по всем героям (sources-research.md, разделы 4.2 и 5). Хук: stratz_hook().


# ---------- HTTP ----------

_last_request = 0.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


def http_get(path: str, params: dict | None = None) -> tuple[int, bytes, str, str]:
    """GET к OpenDota с паузой между запросами и повтором на 429/5xx/сеть.
    Возвращает (статус, тело, полный URL, время съёма). 4xx кроме 429 не повторяет: у /explorer
    тайм-аут запроса приходит как 400 — его обрабатывает вызывающий."""
    global _last_request
    url = f"{API}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    for attempt in range(len(RETRY_DELAYS_S) + 1):
        wait = MIN_INTERVAL_S - (time.monotonic() - _last_request)
        if wait > 0:
            time.sleep(wait)
        _last_request = time.monotonic()
        fetched_at = iso(_now())
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                remaining = resp.headers.get("x-rate-limit-remaining-minute")
                if remaining is not None and remaining.isdigit() and int(remaining) < 5:
                    time.sleep(20)  # почти выбрали минутный лимит — переждать
                return resp.status, resp.read(), url, fetched_at
        except urllib.error.HTTPError as exc:
            body = exc.read()
            if exc.code != 429 and exc.code < 500:
                return exc.code, body, url, fetched_at
            reason = f"HTTP {exc.code}"
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            reason = f"сеть: {exc}"
        if attempt < len(RETRY_DELAYS_S):
            delay = RETRY_DELAYS_S[attempt]
            print(f"    {reason}, повтор через {delay} с", flush=True)
            time.sleep(delay)
    sys.exit(f"Не удалось получить {url}: {reason}")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def save_raw(snap: Path, rel: str, data: bytes) -> dict:
    path = snap / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {"raw_file": rel, "sha256": sha256(data), "bytes": len(data)}


def rate(num: int, den: int) -> float | None:
    return round(num / den, 5) if den else None


# ---------- Окна и куски ----------

def make_chunks(start: datetime, end: datetime, hours: int, cuts: list[datetime]) -> list[tuple[datetime, datetime]]:
    """Режет [start, end) по сетке UTC с шагом hours, плюс обязательные границы cuts
    (начала окон), чтобы каждое окно было ровным объединением кусков."""
    points = {start, end} | {c for c in cuts if start < c < end}
    t = start.replace(minute=0, second=0, microsecond=0)
    t -= timedelta(hours=t.hour % hours)
    while t < end:
        if t > start:
            points.add(t)
        t += timedelta(hours=hours)
    p = sorted(points)
    return list(zip(p, p[1:]))


def chunk_name(a: datetime, b: datetime) -> str:
    return f"{a:%Y%m%dT%H%MZ}_{b:%Y%m%dT%H%MZ}"


def fetch_hero_chunk(snap: Path, a: datetime, b: datetime, done: dict, log: list) -> list[dict]:
    """Один кусок /explorer. Тайм-аут (15 с на стороне OpenDota) — делим пополам, минимум 30 мин.
    Возвращает записи кусков (после деления их может быть несколько)."""
    name = chunk_name(a, b)
    rel = f"raw/explorer_hero/{name}.json"
    if name in done and (snap / rel).exists():
        data = (snap / rel).read_bytes()
        if sha256(data) == done[name]["sha256"]:
            return [done[name]]  # докачка: кусок уже сохранён
    sql = HERO_SQL.format(start=int(a.timestamp()), end=int(b.timestamp()), lobby=LOBBY_TYPE, mode=GAME_MODE)
    t0 = time.monotonic()
    status, body, _url, fetched_at = http_get("/explorer", {"sql": sql})
    took = time.monotonic() - t0
    try:
        payload = json.loads(body)
    except ValueError:
        payload = {}
    err = payload.get("err") if isinstance(payload, dict) else None
    if status != 200 or err or not isinstance(payload.get("rows"), list):
        msg = err or body[:200].decode("utf-8", "replace")
        if (b - a) > timedelta(minutes=30):
            mid = a + (b - a) / 2
            mid = mid.replace(minute=(mid.minute // 30) * 30, second=0, microsecond=0)
            if not a < mid < b:
                mid = a + (b - a) / 2
            print(f"    {name}: {status} {msg!r} за {took:.1f} с — делим пополам", flush=True)
            log.append({"chunk": name, "http_status": status, "error": str(msg)[:200], "action": "split"})
            return fetch_hero_chunk(snap, a, mid, done, log) + fetch_hero_chunk(snap, mid, b, done, log)
        sys.exit(f"Кусок {name} не получен даже после деления: {status} {msg}")
    meta = save_raw(snap, rel, body)
    matches = sum(int(r["games"]) for r in payload["rows"] if int(r["hero_id"]) == 0)
    entry = {"from": iso(a), "to": iso(b), "fetched_at": fetched_at, "http_status": status,
             **meta, "rows": len(payload["rows"]), "matches": matches, "query_seconds": round(took, 1)}
    done[name] = entry
    print(f"    {name}: {matches:>7} матчей, {took:4.1f} с", flush=True)
    return [entry]


def aggregate_hero_chunks(snap: Path, chunks: list[dict], start: datetime, end: datetime) -> dict:
    """Суммирует куски внутри [start, end): {bracket: {hero_id: [games, wins]}}; hero_id 0 — матчи."""
    agg: dict[str, dict[int, list[int]]] = {}
    for c in chunks:
        if parse_iso(c["from"]) < start or parse_iso(c["to"]) > end:
            continue
        for r in json.loads((snap / c["raw_file"]).read_bytes())["rows"]:
            b = r["bracket"]
            key = "unknown" if b is None else str(int(b))
            for k in (key, "all"):
                cell = agg.setdefault(k, {}).setdefault(int(r["hero_id"]), [0, 0])
                cell[0] += int(r["games"])
                cell[1] += int(r["wins"] or 0)
    return agg


def hero_rows(agg: dict, window_id: str, names: dict) -> tuple[list[dict], dict]:
    rows, sample = [], {}
    order = [str(b) for b in BRACKETS] + ["all", "unknown"]
    for bracket in [b for b in order if b in agg]:
        heroes = agg[bracket]
        matches, radiant_wins = heroes.get(0, [0, 0])
        slots = sum(g for h, (g, _) in heroes.items() if h != 0)
        hero_games = [g for h, (g, _) in heroes.items() if h != 0]
        sample[bracket] = {
            "matches": matches,
            "hero_slots": slots,                       # должно быть ≈ 10 × matches
            "radiant_winrate": rate(radiant_wins, matches),
            "heroes": len(hero_games),
            "min_games_per_hero": min(hero_games) if hero_games else 0,
        }
        for hero_id, (games, wins) in sorted(heroes.items()):
            if hero_id == 0:
                continue
            rows.append({
                "hero_id": hero_id, "hero": names.get(hero_id, f"#{hero_id}"),
                "window_id": window_id, "bracket": bracket,
                "games": games, "wins": wins,
                "winrate": rate(wins, games), "pick_rate": rate(games, matches),
            })
    return rows, sample


# ---------- Наборы ----------

def heroes_from_explorer(snap: Path, args, cutoff: datetime, names: dict, partial_path: Path) -> tuple[list, list]:
    patch_from = parse_iso(PATCH_STARTED_AT) + timedelta(hours=PATCH_BUFFER_H)
    pop_from = cutoff - timedelta(days=args.days)
    start = min(patch_from, pop_from)
    plan = make_chunks(start, cutoff, args.chunk_hours, [patch_from, pop_from])

    done = {}
    if partial_path.exists():
        done = json.loads(partial_path.read_text(encoding="utf-8"))
    print(f"\n/explorer public_matches: {iso(start)} → {iso(cutoff)}, {len(plan)} кусков по ≤{args.chunk_hours} ч"
          + (f" (уже есть {len(done)})" if done else ""))
    chunks, log = [], []
    for a, b in plan:
        chunks += fetch_hero_chunk(snap, a, b, done, log)
        partial_path.write_text(json.dumps(done, ensure_ascii=False, indent=1), encoding="utf-8")

    template = HERO_SQL.format(start=":from", end=":to", lobby=LOBBY_TYPE, mode=GAME_MODE)
    filters = {"lobby_type": LOBBY_TYPE, "game_mode": GAME_MODE,
               "brackets": "floor(avg_rank_tier/10): 1..8 + all (+ unknown — матчи без ранга)"}
    datasets, rows = [], []
    for ds_id, w_from, kind in [("hero_wr_patch", patch_from, "patch"), ("hero_pop_30d", pop_from, f"last_{args.days}d")]:
        mine = [c for c in chunks if parse_iso(c["from"]) >= w_from]
        agg = aggregate_hero_chunks(snap, mine, w_from, cutoff)
        r, sample = hero_rows(agg, ds_id, names)
        rows += r
        datasets.append({
            "id": ds_id,
            "source": "opendota",
            "endpoint": f"{API}/explorer",
            "query": template,
            "query_params": "по кускам: :from/:to — unix-время границ куска (поля chunks[].from/to)",
            "window": {"from": iso(w_from), "to": iso(cutoff), "kind": kind,
                       **({"patch": PATCH} if kind == "patch" else {})},
            "filters": filters,
            "fetched_at": min(c["fetched_at"] for c in mine),
            "fetched_until": max(c["fetched_at"] for c in mine),
            "http_status": 200 if all(c["http_status"] == 200 for c in mine) else "mixed",
            "raw_files": "chunks[].raw_file",
            "sample": sample,
            "chunks": mine,
            **({"chunk_errors": log} if log and ds_id == "hero_wr_patch" else {}),
        })
    return datasets, rows


def hero_stats_7d(snap: Path, names: dict) -> tuple[dict, list, list]:
    print("\n/heroStats (скользящие 7 суток)")
    status, body, url, fetched_at = http_get("/heroStats")
    if status != 200:
        sys.exit(f"/heroStats: HTTP {status}")
    meta = save_raw(snap, "raw/opendota_heroStats.json", body)
    data = json.loads(body)
    groups = {str(b): (f"{b}_pick", f"{b}_win") for b in BRACKETS}
    groups |= {"pub": ("pub_pick", "pub_win"), "turbo": ("turbo_picks", "turbo_wins"), "pro": ("pro_pick", "pro_win")}
    rows, sample = [], {}
    for g, (pk, wk) in groups.items():
        total = sum(int(h.get(pk) or 0) for h in data)
        # Матчей /heroStats не отдаёт: оцениваем как слоты / 10 (10 героев в матче)
        est_matches = total / 10
        sample[g] = {"hero_slots": total, "matches_est": round(est_matches)}
        for h in data:
            games, wins = int(h.get(pk) or 0), int(h.get(wk) or 0)
            rows.append({"hero_id": h["id"], "hero": names.get(h["id"], h.get("localized_name")),
                         "window_id": "hero_stats_7d", "bracket": g, "games": games, "wins": wins,
                         "winrate": rate(wins, games),
                         "pick_rate": round(games / est_matches, 5) if est_matches else None})
    print(f"  {len(data)} героев, pub: {sample['pub']['matches_est']} матчей (оценка)")
    ds = {
        "id": "hero_stats_7d", "source": "opendota", "endpoint": url, "query": None,
        "window": {"kind": "rolling_7d_utc", "to": fetched_at,
                   "note": "сумма дневных счётчиков Redis за 7 суток UTC, включая текущие неполные сутки"},
        "filters": {"brackets": "1_pick…8_pick (ранг матча / 10), pub = все значимые паблики, turbo, pro"},
        "fetched_at": fetched_at, "http_status": status, **meta,
        "sample": sample,
        "notes": "Окно скользит — ответ не воспроизвести, сырой файл и есть источник истины. "
                 "pick_rate — от оценки матчей (слоты/10). Только для сверки с hero_pop_30d.",
    }
    return ds, rows, data


def items_from_scenarios(snap: Path, hero_ids: list[int], meta_items: dict) -> tuple[dict, list]:
    print(f"\n/scenarios/itemTimings по {len(hero_ids)} героям + /scenarios/laneRoles (знаменатель)")
    files, statuses, fetched = [], [], []
    per_item: dict[str, dict] = {}
    truncated = []
    for i, hid in enumerate(hero_ids, 1):
        status, body, url, fetched_at = http_get("/scenarios/itemTimings", {"hero_id": hid})
        if status != 200:
            sys.exit(f"itemTimings hero_id={hid}: HTTP {status}")
        files.append({"hero_id": hid, "fetched_at": fetched_at, "http_status": status,
                      **save_raw(snap, f"raw/scenarios_itemTimings/hero_{hid}.json", body)})
        statuses.append(status)
        fetched.append(fetched_at)
        data = json.loads(body)
        if len(data) >= SCENARIOS_LIMIT["itemTimings"]:
            truncated.append(hid)
        for r in data:
            it = per_item.setdefault(r["item"], {"purchases": 0, "wins": 0, "by_time": {}, "heroes": set()})
            g = int(r["games"])
            it["purchases"] += g
            it["wins"] += int(r["wins"])
            it["by_time"][str(r["time"])] = it["by_time"].get(str(r["time"]), 0) + g
            it["heroes"].add(hid)
        if i % 25 == 0:
            print(f"  {i}/{len(hero_ids)}", flush=True)

    lane_files, player_games, player_wins = [], 0, 0
    for lane in (1, 2, 3, 4):
        status, body, url, fetched_at = http_get("/scenarios/laneRoles", {"lane_role": lane})
        if status != 200:
            sys.exit(f"laneRoles lane_role={lane}: HTTP {status}")
        data = json.loads(body)
        if len(data) >= SCENARIOS_LIMIT["laneRoles"]:
            truncated.append(f"lane_{lane}")
        lane_files.append({"lane_role": lane, "fetched_at": fetched_at, "http_status": status,
                           **save_raw(snap, f"raw/scenarios_laneRoles/lane_{lane}.json", body)})
        player_games += sum(int(r["games"]) for r in data)
        player_wins += sum(int(r["wins"]) for r in data)
    if truncated:
        print(f"  ВНИМАНИЕ: ответ упёрся в LIMIT OpenDota у {truncated} — данные обрезаны")

    total = sum(v["purchases"] for v in per_item.values())
    rows = []
    for key, v in sorted(per_item.items(), key=lambda kv: -kv[1]["purchases"]):
        rows.append({
            **item_meta(key, meta_items), "window_id": "item_timings_4w",
            "purchases": v["purchases"], "wins": v["wins"], "winrate": rate(v["wins"], v["purchases"]),
            "share_of_purchases": rate(v["purchases"], total),
            "per_player_game_est": rate(v["purchases"], player_games),
            "heroes": len(v["heroes"]),
            "by_time": dict(sorted(v["by_time"].items(), key=lambda kv: int(kv[0]))),
        })
    print(f"  {len(rows)} предметов, {total} покупок, ~{player_games} игроко-матчей")
    ds = {
        "id": "item_timings_4w", "source": "opendota",
        "endpoint": f"{API}/scenarios/itemTimings?hero_id=<id> (по каждому герою) + {API}/scenarios/laneRoles?lane_role=1..4",
        "query": "SELECT hero_id, item, time, sum(games) games, sum(wins) wins FROM scenarios WHERE item IS NOT NULL "
                 "AND hero_id = :heroId GROUP BY hero_id, item, time ORDER BY time, hero_id, item LIMIT 1600 "
                 f"(svc/util/queries.ts, odota/core@{ODOTA_CORE_COMMIT[:10]})",
        "window": {"kind": "rolling_4w", "to": max(fetched),
                   "note": "строки таблицы scenarios с epoch_week (недели от четверга 00:00 UTC); "
                           "старше 4 недель удаляются (MAXIMUM_AGE_SCENARIOS_ROWS=4) — примерно 4 недели "
                           "плюс текущая неполная"},
        "filters": {
            "matches": "авторазобранные матчи от сканера OpenDota (origin=scanner, type=parsed) — не случайная "
                       "выборка пабликов, режимы и ранги не фильтруются",
            "items": "только предметы со стоимостью ≥ 1400 по dotaconstants",
            "time": "только покупки до 30:00 (корзины 7.5/10/12/15/20/25/30 мин)",
            "count": "каждая покупка из purchase_log (повторная покупка того же предмета считается снова)",
        },
        "fetched_at": min(fetched), "fetched_until": max(fetched),
        "http_status": 200 if all(s == 200 for s in statuses) else "mixed",
        "raw_files": files + lane_files,
        "sample": {"purchases": total, "items": len(rows), "player_games_est": player_games,
                   "player_games_note": "сумма /scenarios/laneRoles по lane_role 1..4: игроки в разобранных матчах "
                                        "длиной ≤ 90 мин с определённой линией",
                   "truncated_responses": truncated},
        "notes": "per_player_game_est = покупки / игроко-матчи — оценка «доли игроков, купивших до 30-й минуты». "
                 "Надёжнее порядок и share_of_purchases внутри набора, а не абсолютные значения.",
    }
    return ds, rows


def items_from_pro(snap: Path, cutoff: datetime, days: int, meta_items: dict) -> tuple[dict, list]:
    start = cutoff - timedelta(days=days)
    print(f"\n/explorer про-матчи: покупки предметов {iso(start)} → {iso(cutoff)}")
    sql = ITEM_PRO_SQL.format(start=int(start.timestamp()), end=int(cutoff.timestamp()))
    status, body, url, fetched_at = http_get("/explorer", {"sql": sql})
    payload = json.loads(body)
    if status != 200 or payload.get("err"):
        sys.exit(f"item_pro_30d: HTTP {status} {payload.get('err')}")
    meta = save_raw(snap, "raw/explorer_item_pro_30d.json", body)
    special = {r["item"]: r for r in payload["rows"] if r["item"].startswith("*")}
    players = int(special["*players"]["players"])
    matches = int(special["*matches"]["players"])
    rows = []
    for r in sorted((r for r in payload["rows"] if not r["item"].startswith("*") and r["item"]),
                    key=lambda r: -int(r["players"])):
        n, w = int(r["players"]), int(r["wins"])
        rows.append({**item_meta(r["item"], meta_items), "window_id": "item_pro_30d",
                     "players": n, "wins": w, "winrate": rate(w, n), "purchase_rate": rate(n, players)})
    print(f"  {matches} матчей, {players} игроков, {len(rows)} предметов")
    ds = {
        "id": "item_pro_30d", "source": "opendota", "endpoint": f"{API}/explorer", "query": sql,
        "window": {"from": iso(start), "to": iso(cutoff), "kind": f"last_{days}d"},
        "filters": {"matches": "таблица matches в /explorer — только матчи лиг (про и полупро), все разобраны",
                    "count": "игрок считается один раз, если предмет есть в его purchase_log хотя бы раз"},
        "fetched_at": fetched_at, "http_status": status, **meta,
        "sample": {"matches": matches, "players": players, "items": len(rows)},
        "notes": "Все предметы, включая расходники; знаменатель точный. Выборка маленькая и только про-сцена — "
                 "для вопросов про паблики не годится, только как отдельная тема «у профи».",
    }
    return ds, rows


def item_meta(key: str, meta_items: dict) -> dict:
    const, current = meta_items["const"].get(key, {}), meta_items["current"].get(key)
    category = current["category"] if current else None
    return {"item": key, "item_id": const.get("id"), "name": const.get("dname") or (current or {}).get("name"),
            "cost": const.get("cost"), "category": category,
            "in_game": category in meta_items["question_categories"] if category else False}


def stratz_hook() -> None:
    """Заготовка под STRATZ. Сейчас api.stratz.com за Cloudflare и без токена недоступен."""
    if os.environ.get("STRATZ_TOKEN"):
        print("\nSTRATZ_TOKEN задан, но съём STRATZ ещё не реализован (TODO в начале файла) — пропускаем.")


# ---------- main ----------

def main() -> None:
    parser = argparse.ArgumentParser(description="Снимок внешней статистики Dota 2 (OpenDota)")
    parser.add_argument("--cutoff", help="конец окон, дата YYYY-MM-DD (00:00 UTC) — она же id снимка; "
                                         "по умолчанию сегодня по UTC")
    parser.add_argument("--days", type=int, default=30, help="окно популярности, дней (по умолчанию 30)")
    parser.add_argument("--chunk-hours", type=int, default=6, help="размер куска /explorer, ч (по умолчанию 6)")
    parser.add_argument("--skip-items", action="store_true", help="не снимать предметы")
    args = parser.parse_args()

    cutoff = (parse_iso(args.cutoff + "T00:00:00Z") if args.cutoff
              else _now().replace(hour=0, minute=0, second=0, microsecond=0))
    snapshot_id = f"{cutoff:%Y-%m-%d}"
    snap = STATS_DIR / snapshot_id
    snap.mkdir(parents=True, exist_ok=True)
    partial_path = snap / ".explorer_chunks.partial.json"

    dota_manifest = json.loads((DOTA_DIR / "manifest.json").read_text(encoding="utf-8"))
    if dota_manifest["patch"] != PATCH:
        print(f"ВНИМАНИЕ: снимок игры на патче {dota_manifest['patch']}, а окно статистики настроено на {PATCH} — "
              "обновите PATCH / PATCH_STARTED_AT / PATCH_EVIDENCE")
    heroes_const = json.loads((DOTA_DIR / "heroes.json").read_text(encoding="utf-8"))
    names = {int(k): v["localized_name"] for k, v in heroes_const.items()}
    current = json.loads((DOTA_DIR / "current.json").read_text(encoding="utf-8"))
    meta_items = {"const": json.loads((DOTA_DIR / "items.json").read_text(encoding="utf-8")),
                  "current": current["items"],
                  "question_categories": set(current["question_item_categories"])}

    print(f"Снимок {snapshot_id}: патч {PATCH} (вышел {PATCH_STARTED_AT}), окна до {iso(cutoff)}")
    started = iso(_now())

    datasets, hero_rows_all = heroes_from_explorer(snap, args, cutoff, names, partial_path)
    ds, rows, hs_data = hero_stats_7d(snap, names)
    datasets.append(ds)
    hero_rows_all += rows

    item_rows = []
    if not args.skip_items:
        hero_ids = sorted(int(h["id"]) for h in hs_data)
        ds, rows = items_from_scenarios(snap, hero_ids, meta_items)
        datasets.append(ds)
        item_rows += rows
        ds, rows = items_from_pro(snap, cutoff, args.days, meta_items)
        datasets.append(ds)
        item_rows += rows
    stratz_hook()

    ds_short = {d["id"]: {k: d[k] for k in ("window", "sample") if k in d} for d in datasets}
    heroes_out = {"snapshot_id": snapshot_id, "patch": PATCH, "brackets": {str(k): v for k, v in BRACKETS.items()},
                  "datasets": {k: v for k, v in ds_short.items() if k.startswith("hero")},
                  "rows": hero_rows_all}
    (snap / "heroes.json").write_text(json.dumps(heroes_out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    if item_rows:
        items_out = {"snapshot_id": snapshot_id, "patch": PATCH,
                     "datasets": {k: v for k, v in ds_short.items() if k.startswith("item")},
                     "rows": item_rows}
        (snap / "items.json").write_text(json.dumps(items_out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    manifest = {
        "snapshot_id": snapshot_id,
        "game_patch": PATCH,
        "game_data_snapshot": {"manifest": str(DOTA_DIR / "manifest.json"), "patch": dota_manifest["patch"],
                               "fetched_at": dota_manifest["fetched_at"]},
        "patch_started_at": PATCH_STARTED_AT,
        "patch_window_buffer_hours": PATCH_BUFFER_H,
        "patch_evidence": PATCH_EVIDENCE,
        "opendota_source_commit": f"odota/core@{ODOTA_CORE_COMMIT}",
        "run": {"started_at": started, "finished_at": iso(_now()), "script": "scripts/fetch_stats.py"},
        "normalized": {"heroes.json": sha256((snap / "heroes.json").read_bytes()),
                       **({"items.json": sha256((snap / "items.json").read_bytes())} if item_rows else {})},
        "datasets": datasets,
        "unavailable": [
            {"what": "популярность предметов за всё время",
             "why": "OpenDota не хранит предметы пабликов: public_matches без предметов и только 12 месяцев, "
                    "scenarios — 4 недели. Единственный источник — Dotabuff items?date=all, вручную"},
            {"what": "популярность героев за всё время",
             "why": "public_matches хранится 12 месяцев (svc/cleanup.ts) — максимум «за последний год»"},
            {"what": "STRATZ (winDay, itemFullPurchase)",
             "why": "api.stratz.com отдаёт Cloudflare «Just a moment» и требует Bearer-токен — TODO в скрипте"},
            {"what": "Dotabuff, Dota2ProTracker", "why": "из окружения 403; скрапинг не планируем"},
        ],
    }
    (snap / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    partial_path.unlink(missing_ok=True)

    print_summary(snap, datasets, hero_rows_all, item_rows)


def print_summary(snap: Path, datasets: list, hero_rows_all: list, item_rows: list) -> None:
    print(f"\n=== Снимок → {snap}/")
    for d in datasets:
        s = d["sample"]
        if "all" in s:
            print(f"  {d['id']:<16} {d['window'].get('from', '')} → {d['window']['to']}: "
                  f"{s['all']['matches']} матчей, слотов/матч {s['all']['hero_slots'] / max(s['all']['matches'], 1):.2f}, "
                  f"Radiant {s['all']['radiant_winrate']:.3f}, мин. игр у героя {s['all']['min_games_per_hero']}")
            print("  " + " " * 17 + "по рангам: " + ", ".join(
                f"{BRACKETS.get(int(b), b) if b.isdigit() else b} {v['matches']}" for b, v in s.items() if b != "all"))
        elif "pub" in s:
            print(f"  {d['id']:<16} скользящие 7 суток: pub ~{s['pub']['matches_est']} матчей (слоты/10), "
                  f"ранги 1–8: " + ", ".join(str(s[str(k)]["matches_est"]) for k in BRACKETS))
        else:
            print(f"  {d['id']:<16} {json.dumps({k: v for k, v in s.items() if not isinstance(v, (dict, list, str))}, ensure_ascii=False)}")
    patch_all = sorted((r for r in hero_rows_all if r["window_id"] == "hero_wr_patch" and r["bracket"] == "all"),
                       key=lambda r: -r["winrate"])
    if patch_all:
        fmt = lambda r: f"{r['hero']} {r['winrate'] * 100:.2f}% ({r['games']})"
        print("\n  Винрейт на патче, все ранги — лучшие: " + "; ".join(fmt(r) for r in patch_all[:5]))
        print("                                худшие: " + "; ".join(fmt(r) for r in patch_all[-5:]))
    pop = sorted((r for r in hero_rows_all if r["window_id"] == "hero_pop_30d" and r["bracket"] == "all"),
                 key=lambda r: -r["pick_rate"])
    if pop:
        print("  Популярность за 30 дней: " + "; ".join(f"{r['hero']} {r['pick_rate'] * 100:.1f}%" for r in pop[:5]))
    for wid, metric in (("item_timings_4w", "per_player_game_est"), ("item_pro_30d", "purchase_rate")):
        top = [r for r in item_rows if r["window_id"] == wid][:10]
        if top:
            print(f"  {wid}: " + "; ".join(f"{r['name'] or r['item']} {r[metric] * 100:.1f}%" for r in top))
    total = sum(p.stat().st_size for p in snap.rglob("*") if p.is_file())
    raw = sum(p.stat().st_size for p in (snap / "raw").rglob("*") if p.is_file())
    print(f"\n  Размер: всего {total / 1e6:.1f} МБ, из них raw/ {raw / 1e6:.1f} МБ")


if __name__ == "__main__":
    main()
