#!/usr/bin/env python3
"""
Снимок статистики STRATZ (api.stratz.com/graphql) для вопросов. Дополняет OpenDota (fetch_stats.py).

Пишет scripts/data/stats/<YYYY-MM-DD>/stratz/:
  manifest.json      — наборы: запрос, окно (какие недели / месяцы реально вошли), фильтры, время, размер выборки
  raw/               — сырые ответы героев (недели, месяцы, средние, баны, константы)
  heroes.json        — {hero_id, hero, window_id, bracket, position, games, wins, winrate, pick_rate}
  items.json         — {window_id, hero_id|null, item_id, item, purchases, wins, winrate, share, second}
                       (без ботинок и расходников — их itemFullPurchase не отдаёт)
  boots.json         — то же для ботинок (itemBootPurchase) на неделях патча
  lanes.json         — исходы линий героя против героя: win / draw / loss / разгромы
  items_weekly.json  — по неделям: все герои вместе, первые покупки по предметам (тренды)
  hero_avg.json      — средние за матч по героям (урон, хил, станы, стаки…) на неделях патча
  matchups.json      — пары героев против друг друга (vs): преимущество за недели патча
  talents.json       — как часто берут каждый талант
  starting.json      — стартовые предметы и ботинки по героям
  bans.json          — banDay: баны Captains Mode / Battle Cup по дням с 2021 (не рейтинг)
  bans_ranked.json   — баны рейтингового All Pick на патче: выборка матчей, доля матчей с баном героя
Кэш сырых ответов предметов (тысячи файлов) — scripts/data/stratz_cache/ (в .gitignore).

Что выяснено разведкой 2026-10-27 (подробно — docs/questions/stratz-research.md):
  - winGameVersion застрял на 7.40 (id 181) — для 7.41f непригоден; окно патча собираем из winWeek.
  - winWeek / winDay / winMonth отстают: недели до 2026-10-01 (неделя с четверга), дни до 2026-10-10,
    месяцы до 2026-08 с дырой 2024-10…2025-08. Набор пишет, какие периоды реально вошли.
  - itemFullPurchase, stats, talent, banDay — свежие (текущая неделя). Предметы по неделям есть
    с 2025-10-23 без пропусков (плюс 2024-01…2024-10). instance 0 — первая покупка предмета, 1 — вторая.
  - itemFullPurchase отдаёт покупки по минутам; мелкие корзины, видимо, отрезаны — сумма немного занижена,
    порядок предметов надёжен. Знаменателя (число матчей героя) в ответе нет.

Использование (из корня репо):
  python scripts/fetch_stratz.py                     # всё, предметы за 52 закрытые недели
  python scripts/fetch_stratz.py --item-weeks 4      # предметы только за 4 недели
  python scripts/fetch_stratz.py --only heroes,avg   # выборочно: heroes, months, avg, items, perhero, bans
"""

import argparse
import hashlib
import json
import random
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_stats import PATCH, PATCH_STARTED_AT, PATCH_BUFFER_H, PATCH_EVIDENCE, parse_iso, iso  # noqa: E402
from stratz_client import Stratz  # noqa: E402

DOTA_DIR = Path("scripts/data/dota")
STATS_DIR = Path("scripts/data/stats")
CACHE_DIR = Path("scripts/data/stratz_cache")

GAME_MODE = "ALL_PICK_RANKED"
BRACKETS = ["HERALD", "GUARDIAN", "CRUSADER", "ARCHON", "LEGEND", "ANCIENT", "DIVINE", "IMMORTAL"]
POSITIONS = ["POSITION_1", "POSITION_2", "POSITION_3", "POSITION_4", "POSITION_5"]
WEEK_S = 7 * 86400
WEEK_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)  # STRATZ: неделя = четверг 00:00 UTC (1970-01-01 — четверг)
ALL_SECTIONS = ["heroes", "months", "avg", "items", "boots", "perhero", "lanes", "bans", "rankedbans"]

AVG_FIELDS = ["kills", "deaths", "assists", "networth", "xp", "cs", "dn", "goldPerMinute", "heroDamage",
              "towerDamage", "physicalDamage", "magicalDamage", "pureDamage", "healingSelf", "healingAllies",
              "stunCount", "stunDuration", "disableCount", "disableDuration", "slowDuration", "campsStacked",
              "runePower", "runeBounty", "supportGold", "purgeModifiers", "ancients", "courierKills",
              "tripleKill", "ultraKill", "rampage", "godLike", "buybackCount", "invisibleCount", "apm",
              "abilityCasts", "level", "goldLost", "mvp", "topCore", "topSupport",
              "damage", "attackDamage", "castDamage", "physicalItemDamage", "magicalItemDamage", "damageReceived",
              "physicalDamageReceived", "magicalDamageReceived", "pureDamageReceived", "healingItemSelf",
              "healingItemAllies", "neutrals", "attackCount", "comeBackWon", "comeBackLost"]
# Пустые у STRATZ (всегда 0): goldPerMinute, buybackCount, rampage, ultraKill (почти), kDAAverage,
# killContributionAverage, stompWon/Lost. Meepo суммирует клонов (получаемый урон, атаки), Venomancer — смерти
# варды (deaths ≈ 48), у Kez и Largo пустые награды — см. docs/questions/stratz-research.md, «Средние за матч».

HERO_PER_QUERY = 6          # героев в одном запросе per-hero наборов
ITEM_ALIASES_PER_QUERY = 8  # (герой, неделя) в одном запросе предметов


def week_start(dt: datetime) -> datetime:
    n = int((dt - WEEK_EPOCH).total_seconds() // WEEK_S)
    return WEEK_EPOCH + timedelta(seconds=n * WEEK_S)


def ts(dt: datetime) -> int:
    return int(dt.timestamp())


def day(t: int) -> str:
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def rate(a, b):
    return round(a / b, 6) if b else None


class Snapshot:
    def __init__(self, path: Path):
        self.path = path
        (path / "raw").mkdir(parents=True, exist_ok=True)
        self.datasets = []

    def raw(self, name: str, data) -> dict:
        body = json.dumps(data, ensure_ascii=False).encode()
        (self.path / "raw" / f"{name}.json").write_bytes(body)
        return {"file": f"raw/{name}.json", "sha256": sha256(body), "bytes": len(body)}

    def write(self, name: str, data) -> None:
        (self.path / name).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


# ---------- герои: недели (окно патча) ----------

def heroes_weeks(sx: Stratz, snap: Snapshot, names: dict, patch_from: datetime, cutoff: datetime) -> list:
    slices = [("all", None, None)] + [(b, b, None) for b in BRACKETS] + [(f"all/{p}", None, p) for p in POSITIONS]
    q = "{ heroStats { " + " ".join(
        f'{key.replace("/", "_")}: winWeek(gameModeIds:[{GAME_MODE}]'
        + (f", bracketIds:[{b}]" if b else "") + (f", positionIds:[{p}]" if p else "")
        + ") { week heroId matchCount winCount }"
        for key, b, p in slices) + " } }"
    data = sx.query(q)["heroStats"]
    raw = snap.raw("hero_win_week", data)
    first_week = week_start(patch_from) + (timedelta(days=7) if week_start(patch_from) < patch_from else timedelta())
    last_closed = week_start(cutoff) - timedelta(days=7)
    rows, weeks_used = [], set()
    for key, b, p in slices:
        agg = defaultdict(lambda: [0, 0])
        for r in data[key.replace("/", "_")] or []:
            if ts(first_week) <= r["week"] <= ts(last_closed):
                weeks_used.add(r["week"])
                agg[r["heroId"]][0] += r["matchCount"]
                agg[r["heroId"]][1] += r["winCount"]
        slots = sum(v[0] for v in agg.values())
        for h, (g, w) in sorted(agg.items()):
            rows.append({"hero_id": h, "hero": names.get(h), "window_id": "hero_wr_patch_weeks",
                         "bracket": b or "all", "position": p, "games": g, "wins": w,
                         "winrate": rate(w, g), "pick_rate": rate(g * 10, slots)})
    weeks = sorted(weeks_used)
    avail = sorted({r["week"] for r in data["all"] or []})
    snap.datasets.append({
        "id": "hero_wr_patch_weeks", "source": "stratz", "query": q, "raw": raw,
        "window": {"kind": "patch", "patch": PATCH, "from": day(weeks[0]) if weeks else None,
                   "to": day(weeks[-1] + WEEK_S) if weeks else None, "weeks": [day(w) for w in weeks]},
        "available_weeks": [day(w) for w in avail],
        "filters": {"gameModeIds": GAME_MODE, "brackets": ["all"] + BRACKETS, "positions": POSITIONS},
        "sample": {"matches_all": sum(r["games"] for r in rows if r["bracket"] == "all" and not r["position"]) // 10},
        "note": "winGameVersion не знает 7.41*, поэтому окно — целые недели (с четверга) внутри патча, "
                "доступные на момент съёма. STRATZ отстаёт: последние недели ещё не посчитаны.",
    })
    return rows


# ---------- герои: месяцы (год и вся доступная история) ----------

def heroes_months(sx: Stratz, snap: Snapshot, names: dict, cutoff: datetime) -> list:
    slices = [("all", None)] + [(b, b) for b in BRACKETS]
    q = "{ heroStats { " + " ".join(
        f'{key}: winMonth(take: 1000, gameModeIds:[{GAME_MODE}]' + (f", bracketIds:[{b}]" if b else "")
        + ") { month heroId matchCount winCount }" for key, b in slices) + " } }"
    data = sx.query(q)["heroStats"]
    raw = snap.raw("hero_win_month", data)
    months = sorted({r["month"] for r in data["all"] or []})
    year = months[-12:]
    first = {}   # первый месяц с играми — по нему сборщик банка отсекает героев, вышедших внутри окна
    for r in data["all"] or []:
        if r["matchCount"] and r["month"] < first.get(r["heroId"], float("inf")):
            first[r["heroId"]] = r["month"]
    rows = []
    for window_id, use in (("hero_year_months", set(year)), ("hero_all_months", set(months))):
        for key, b in slices:
            agg = defaultdict(lambda: [0, 0])
            for r in data[key] or []:
                if r["month"] in use:
                    agg[r["heroId"]][0] += r["matchCount"]
                    agg[r["heroId"]][1] += r["winCount"]
            slots = sum(v[0] for v in agg.values())
            for h, (g, w) in sorted(agg.items()):
                rows.append({"hero_id": h, "hero": names.get(h), "window_id": window_id, "bracket": b or "all",
                             "position": None, "games": g, "wins": w, "winrate": rate(w, g),
                             "pick_rate": rate(g * 10, slots),
                             "first_month": day(first[h])[:7] if h in first else None})
    for window_id, use in (("hero_year_months", year), ("hero_all_months", months)):
        snap.datasets.append({
            "id": window_id, "source": "stratz", "query": q, "raw": raw,
            "window": {"kind": "months", "from": day(use[0]) if use else None, "months": [day(m)[:7] for m in use]},
            "filters": {"gameModeIds": GAME_MODE, "brackets": ["all"] + BRACKETS},
            "sample": {"matches_all": sum(r["games"] for r in rows
                                          if r["window_id"] == window_id and r["bracket"] == "all") // 10},
            "note": "Месяцы STRATZ: последние посчитанные — см. months; дыра 2024-10…2025-08. "
                    "«Год» = последние 12 доступных месяцев, а не 12 месяцев до даты съёма.",
        })
    return rows


# ---------- средние показатели героя за матч ----------

def hero_avg(sx: Stratz, snap: Snapshot, names: dict, weeks: list[int]) -> dict:
    fields = " ".join(AVG_FIELDS)
    q = "{ heroStats { " + " ".join(f"w{w}: stats(week: {w}) {{ heroId week matchCount winCount {fields} }}"
                                    for w in weeks) + " } }"
    data = sx.query(q)["heroStats"]
    raw = snap.raw("hero_avg_weeks", data)
    acc = defaultdict(lambda: defaultdict(float))
    for w in weeks:
        for r in data[f"w{w}"] or []:
            a = acc[r["heroId"]]
            n = r["matchCount"] or 0
            a["matches"] += n
            a["wins"] += r["winCount"] or 0
            for f in AVG_FIELDS:
                if r.get(f) is not None:
                    a[f] += float(r[f]) * n
    out = []
    for h, a in sorted(acc.items()):
        n = a["matches"]
        out.append({"hero_id": h, "hero": names.get(h), "matches": int(n), "winrate": rate(a["wins"], n),
                    **{f: round(a[f] / n, 5) if n else None for f in AVG_FIELDS}})
    snap.datasets.append({"id": "hero_avg", "source": "stratz", "query": q, "raw": raw,
                          "window": {"kind": "weeks", "weeks": [day(w) for w in weeks]},
                          "note": "heroStats.stats: средние за матч, взвешены по matchCount недель. Выборка — "
                                  "матчи со статистикой STRATZ (меньше, чем winWeek). Длительности в секундах? "
                                  "stunDuration и пр. — единицы STRATZ, сравнивать только между героями."})
    return {"weeks": [day(w) for w in weeks], "fields": AVG_FIELDS, "rows": out}


# ---------- предметы по неделям ----------

def items_weeks(sx: Stratz, snap: Snapshot, hero_ids: list, weeks: list[int], patch_weeks: list[int],
                item_names: dict, names: dict, field: str = "itemFullPurchase", prefix: str = "items") -> tuple[list, dict]:
    """field: itemFullPurchase (всё, кроме ботинок и расходников) или itemBootPurchase (ботинки)."""
    pairs = [(h, w) for w in weeks for h in hero_ids]
    cache = CACHE_DIR / ("items" if field == "itemFullPurchase" else field)
    # per[(hero, week)][item] = [first, wins_first, second]
    per = {}
    todo = []
    for h, w in pairs:
        cached = cache / f"{w}" / f"{h}.json"
        if cached.exists():
            per[(h, w)] = json.loads(cached.read_text(encoding="utf-8"))
        else:
            todo.append((h, w))
    print(f"  {field}: {len(pairs)} пар (герой, неделя), в кэше {len(pairs) - len(todo)}, запросить {len(todo)}")
    for i in range(0, len(todo), ITEM_ALIASES_PER_QUERY):
        chunk = todo[i:i + ITEM_ALIASES_PER_QUERY]
        q = "{ heroStats { " + " ".join(
            f"h{h}_{w}: {field}(heroId: {h}, week: {w}) {{ itemId instance matchCount winCount }}"
            for h, w in chunk) + " } }"
        data = sx.query(q, allow_errors=True)
        failed = {tuple(e.get("path") or [])[-1] for e in data.get("_errors", [])}
        hs = data.get("heroStats") or {}
        for h, w in chunk:
            alias = f"h{h}_{w}"
            if alias in failed or alias not in hs:
                print(f"    не получено: герой {h}, неделя {day(w)}")
                continue
            agg = {}
            for r in hs[alias] or []:
                a = agg.setdefault(str(r["itemId"]), [0, 0, 0])
                if r["instance"] == 0:
                    a[0] += r["matchCount"] or 0
                    a[1] += r["winCount"] or 0
                else:
                    a[2] += r["matchCount"] or 0
            per[(h, w)] = agg
            path = cache / f"{w}" / f"{h}.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(agg), encoding="utf-8")
        done = min(i + ITEM_ALIASES_PER_QUERY, len(todo))
        if done % 200 < ITEM_ALIASES_PER_QUERY:
            print(f"    {done}/{len(todo)}")

    last4 = weeks[-4:]
    windows = {f"{prefix}_patch": set(patch_weeks) & set(weeks), f"{prefix}_4w": set(last4)}
    if len(weeks) > len(last4):
        windows[f"{prefix}_year"] = set(weeks)
    rows = []
    for window_id, use in windows.items():
        overall = defaultdict(lambda: [0, 0, 0])
        by_hero = defaultdict(lambda: defaultdict(lambda: [0, 0, 0]))
        for (h, w), agg in per.items():
            if w not in use:
                continue
            for it, (n, wn, sec) in agg.items():
                for tgt in (overall[it], by_hero[h][it]):
                    tgt[0] += n
                    tgt[1] += wn
                    tgt[2] += sec
        total = sum(v[0] for v in overall.values())
        for it, (n, wn, sec) in sorted(overall.items(), key=lambda kv: -kv[1][0]):
            rows.append({"window_id": window_id, "hero_id": None, "item_id": int(it), "item": item_names.get(int(it)),
                         "purchases": n, "wins": wn, "winrate": rate(wn, n), "share": rate(n, total), "second": sec})
        for h, items in sorted(by_hero.items()):
            ht = sum(v[0] for v in items.values())
            for it, (n, wn, sec) in sorted(items.items(), key=lambda kv: -kv[1][0]):
                if n < 50:
                    continue
                rows.append({"window_id": window_id, "hero_id": h, "item_id": int(it), "item": item_names.get(int(it)),
                             "purchases": n, "wins": wn, "winrate": rate(wn, n), "share": rate(n, ht), "second": sec})
    weekly = {}
    for (h, w), agg in per.items():
        wk = weekly.setdefault(day(w), defaultdict(int))
        for it, (n, _, _) in agg.items():
            wk[it] += n
    weekly = {w: dict(sorted(v.items(), key=lambda kv: -kv[1])) for w, v in sorted(weekly.items())}
    got_weeks = sorted({w for (_, w) in per})
    for window_id, use in windows.items():
        snap.datasets.append({
            "id": window_id, "source": "stratz",
            "query": f"heroStats.{field}(heroId, week) {{ itemId instance matchCount winCount }} — по каждому герою и неделе",
            "window": {"kind": "weeks", "weeks": [day(w) for w in sorted(use) if w in got_weeks]},
            "sample": {"hero_weeks": sum(1 for (_, w) in per if w in use),
                       "first_purchases": sum(r["purchases"] for r in rows if r["window_id"] == window_id and r["hero_id"] is None)},
            "note": ("Только ботинки (itemFullPurchase их не содержит). " if field != "itemFullPurchase" else
                     "Без ботинок и расходников (Tango, варды, TP, Smoke, Gem): их itemFullPurchase не отдаёт. ") +
                    "purchases — первые покупки предмета (instance 0), second — повторные. Все ранги, режимы — как "
                    "в STRATZ (знаменателя нет): сравнивать предметы между собой, а не «% матчей». У героя строки "
                    "с purchases < 50 отброшены.",
        })
    return rows, weekly


# ---------- по героям: матчапы, таланты, стартовые предметы, ботинки ----------

def per_hero(sx: Stratz, snap: Snapshot, hero_ids: list, names: dict, weeks: list[int]) -> tuple[list, list, list]:
    """Матчапы (только vs) и таланты — сумма по неделям патча (одна неделя STRATZ больше его выборки по
    умолчанию, 5 недель — в ~6 раз); стартовые предметы и ботинки — текущая выборка STRATZ."""
    mu = defaultdict(lambda: [0, 0, 0.0])      # (h, h2) -> games, wins, synergy·games
    ta = defaultdict(lambda: [0, 0])           # (h, abilityId) -> games, wins
    starting = []
    for i in range(0, len(hero_ids), HERO_PER_QUERY):
        chunk = hero_ids[i:i + HERO_PER_QUERY]
        q = "{ heroStats { " + " ".join(
            f"s{h}: itemStartingPurchase(heroId: {h}) {{ itemId instance wasGiven matchCount winCount }} "
            f"b{h}: itemBootPurchase(heroId: {h}) {{ itemId instance matchCount winCount timeAverage }}"
            for h in chunk) + " } }"
        data = sx.query(q, cache_key=f"perhero_start/{'_'.join(map(str, chunk))}")["heroStats"]
        for h in chunk:
            for kind in ("s", "b"):
                for r in data[f"{kind}{h}"] or []:
                    starting.append({"hero_id": h, "kind": "start" if kind == "s" else "boots", "item_id": r["itemId"],
                                     "instance": r["instance"], "was_given": r.get("wasGiven"),
                                     "games": r["matchCount"], "wins": r["winCount"],
                                     "time_avg": r.get("timeAverage")})
        for w in weeks:
            q = "{ heroStats { " + " ".join(
                f"m{h}: heroVsHeroMatchup(heroId: {h}, week: {w}, take: 200) {{ advantage {{ "
                f"vs {{ heroId2 matchCount winCount synergy }} }} }} "
                f"t{h}: talent(heroId: {h}, week: {w}) {{ abilityId matchCount winCount }}"
                for h in chunk) + " } }"
            data = sx.query(q, cache_key=f"perhero_week/{w}/{'_'.join(map(str, chunk))}")["heroStats"]
            for h in chunk:
                adv = (data[f"m{h}"] or {}).get("advantage") or [{}]
                for r in adv[0].get("vs") or []:
                    a = mu[(h, r["heroId2"])]
                    a[0] += r["matchCount"]; a[1] += r["winCount"]; a[2] += (r["synergy"] or 0) * r["matchCount"]
                for r in data[f"t{h}"] or []:
                    a = ta[(h, r["abilityId"])]
                    a[0] += r["matchCount"]; a[1] += r["winCount"]
        print(f"    по героям: {min(i + HERO_PER_QUERY, len(hero_ids))}/{len(hero_ids)}")
    matchups = [[h, h2, "vs", g, wn, round(s / g, 3) if g else None] for (h, h2), (g, wn, s) in sorted(mu.items())]
    talents = [{"hero_id": h, "hero": names.get(h), "ability_id": ab, "games": g, "wins": wn}
               for (h, ab), (g, wn) in sorted(ta.items())]
    snap.datasets.append({"id": "per_hero_patch_weeks", "source": "stratz",
                          "query": "heroVsHeroMatchup(week), talent(week) по неделям патча",
                          "window": {"kind": "weeks", "weeks": [day(w) for w in weeks]},
                          "note": "matchups: только vs; synergy — преимущество героя против героя2, п.п., среднее "
                                  "по неделям, взвешенное по матчам. talents: сумма по неделям."})
    snap.datasets.append({"id": "per_hero_current", "source": "stratz",
                          "query": "itemStartingPurchase, itemBootPurchase — без week (текущая выборка STRATZ)",
                          "window": {"kind": "stratz_default", "fetched_at": iso(datetime.now(timezone.utc))},
                          "note": "Окно не указывается — STRATZ отдаёт свою текущую выборку."})
    return matchups, talents, starting


def lanes(sx: Stratz, snap: Snapshot, hero_ids: list) -> list:
    rows = []
    for i in range(0, len(hero_ids), HERO_PER_QUERY):
        chunk = hero_ids[i:i + HERO_PER_QUERY]
        q = "{ heroStats { " + " ".join(
            f"l{h}: laneOutcome(heroId: {h}, isWith: false) {{ heroId2 matchCount winCount drawCount lossCount "
            f"stompWinCount stompLossCount }}" for h in chunk) + " } }"
        data = sx.query(q, cache_key=f"lanes/{'_'.join(map(str, chunk))}")["heroStats"]
        for h in chunk:
            for r in data[f"l{h}"] or []:
                rows.append([h, r["heroId2"], r["matchCount"], r["winCount"], r["drawCount"], r["lossCount"],
                             r["stompWinCount"], r["stompLossCount"]])
    snap.datasets.append({"id": "lanes_vs", "source": "stratz",
                          "query": "heroStats.laneOutcome(heroId, isWith: false) — по каждому герою, без week",
                          "window": {"kind": "stratz_default", "fetched_at": iso(datetime.now(timezone.utc))},
                          "note": "Исход линии героя против героя2 (стоят на одной линии): win/draw/loss и разгромы."})
    return rows


def bans(sx: Stratz, snap: Snapshot, names: dict, patch_from: datetime, cutoff: datetime) -> list:
    q = "{ heroStats { banDay(heroId: 1, groupByDay: true, take: 100000) { heroId day matchCount winCount } } }"
    data = sx.query(q)["heroStats"]["banDay"] or []
    raw = snap.raw("ban_day", data)
    to_day = lambda dt: int((dt - WEEK_EPOCH).total_seconds() // 86400)
    windows = {"bans_patch": (to_day(patch_from), to_day(cutoff)), "bans_year": (to_day(cutoff) - 365, to_day(cutoff)),
               "bans_all": (0, to_day(cutoff))}
    rows = []
    for window_id, (a, b) in windows.items():
        agg = defaultdict(int)
        days = set()
        for r in data:
            if r["day"] is not None and a <= r["day"] < b:
                agg[r["heroId"]] += r["matchCount"] or 0
                days.add(r["day"])
        total = sum(agg.values())
        rows += [{"window_id": window_id, "hero_id": h, "hero": names.get(h), "bans": n, "share": rate(n, total)}
                 for h, n in sorted(agg.items(), key=lambda kv: -kv[1])]
        days = sorted(days)
        snap.datasets.append({"id": window_id, "source": "stratz", "query": q, "raw": raw,
                              "window": {"kind": "days", "from": str((WEEK_EPOCH + timedelta(days=days[0])).date()) if days else None,
                                         "to": str((WEEK_EPOCH + timedelta(days=days[-1])).date()) if days else None,
                                         "days": len(days)},
                              "note": "banDay игнорирует heroId и отдаёт всех героев по дням (история с 2021). "
                                      "matchCount — число банов героя; по ритму (~4 тыс. в будни, 50–65 тыс. по субботам) это "
                                      "Captains Mode / Battle Cup, не рейтинг. Рейтинговые баны — bans_ranked_patch."})
    return rows


RANKED_BAN_SAMPLE = 10000   # рейтинговых матчей в выборке банов
MATCHES_PER_QUERY = 100     # match(id) через алиасы; matches(ids:) требует прав админа


def match_id_at(sx: Stratz, moment: datetime) -> int:
    """Первый id матча, начавшегося не раньше moment (id растут со временем). Бинарный поиск по пробам
    из 25 подряд идущих id: часть id пустые, берём самый ранний найденный."""
    target, lo, hi = ts(moment), 7_000_000_000, 9_900_000_000
    while hi - lo > 1000:
        mid = (lo + hi) // 2
        q = "{ " + " ".join(f"m{i}: match(id: {i}) {{ startDateTime }}" for i in range(mid, mid + 25)) + " }"
        found = [v["startDateTime"] for k, v in sx.query(q, allow_errors=True).items() if k.startswith("m") and v]
        if found and min(found) < target:
            lo = mid
        else:
            hi = mid   # пусто — считаем, что это будущее
    return hi


def ranked_bans(sx: Stratz, snap: Snapshot, names: dict, patch_from: datetime, cutoff: datetime) -> dict:
    """Баны рейтинговых матчей: случайные id в окне патча → match(id) { pickBans }. banDay для этого не
    годится — там Captains Mode / Battle Cup (~4 тыс. банов в будни, 50–65 тыс. по субботам)."""
    lo, hi = match_id_at(sx, patch_from), match_id_at(sx, cutoff)
    print(f"    id матчей окна: {lo}…{hi}")
    rng = random.Random(f"{snap.path.name}-{lo}-{hi}")
    banned, nominated, per_match, seen, n_req = defaultdict(int), defaultdict(int), [], set(), 0
    while len(per_match) < RANKED_BAN_SAMPLE:
        ids = sorted(rng.sample(range(lo, hi), MATCHES_PER_QUERY))
        q = "{ " + " ".join(f"m{i}: match(id: {i}) {{ id lobbyType gameMode startDateTime "
                            f"pickBans {{ isPick bannedHeroId wasBannedSuccessfully }} }}" for i in ids) + " }"
        data = sx.query(q, cache_key=f"ranked_bans/{snap.path.name}_{n_req}", allow_errors=True)
        n_req += 1
        for k, m in data.items():
            if not k.startswith("m") or not m or m["id"] in seen or not m.get("pickBans"):
                continue
            if m["lobbyType"] != "RANKED" or m["gameMode"] != "ALL_PICK_RANKED":
                continue
            seen.add(m["id"])
            bans = [b for b in m["pickBans"] if not b["isPick"] and b.get("bannedHeroId")]
            for b in bans:
                nominated[b["bannedHeroId"]] += 1
            ok = {b["bannedHeroId"] for b in bans if b.get("wasBannedSuccessfully")}
            for h in ok:
                banned[h] += 1
            per_match.append(len(ok))
        if n_req % 25 == 0:
            print(f"    запросов {n_req}, матчей {len(per_match)}")
    n = len(per_match)
    rows = [{"hero_id": h, "hero": names.get(h), "banned_matches": c, "ban_rate": rate(c, n),
             "nominations": nominated[h]} for h, c in sorted(banned.items(), key=lambda kv: -kv[1])]
    snap.datasets.append({"id": "bans_ranked_patch", "source": "stratz",
                          "query": "match(id) { lobbyType gameMode pickBans } по случайным id окна",
                          "window": {"kind": "match_ids", "from": iso(patch_from), "to": iso(cutoff), "ids": [lo, hi]},
                          "sample": {"matches": n, "requests": n_req, "bans_per_match_avg": round(sum(per_match) / n, 2)},
                          "note": "Только рейтинговый All Pick с разобранным драфтом (pickBans есть у распарсенных "
                                  "матчей). ban_rate — доля матчей, где герой забанен. Ранг матчей STRATZ не отдаёт."})
    return {"snapshot_id": snap.path.name, "sample_matches": n,
            "bans_per_match": dict(sorted(Counter(per_match).items())), "rows": rows}


def constants(sx: Stratz, snap: Snapshot) -> tuple[dict, dict]:
    data = sx.query("{ constants { items { id shortName displayName } abilities { id name language { displayName } } } }")
    snap.raw("constants", data)
    items = {i["id"]: i["displayName"] for i in data["constants"]["items"] or []}
    abilities = {a["id"]: {"name": a["name"], "display": (a.get("language") or {}).get("displayName")}
                 for a in data["constants"]["abilities"] or []}
    return items, abilities


# ---------- main ----------

def main() -> None:
    ap = argparse.ArgumentParser(description="Снимок статистики STRATZ")
    ap.add_argument("--cutoff", help="дата съёма YYYY-MM-DD (id снимка), по умолчанию сегодня UTC")
    ap.add_argument("--item-weeks", type=int, default=52, help="сколько последних закрытых недель предметов (52)")
    ap.add_argument("--only", help="разделы через запятую: " + ",".join(ALL_SECTIONS))
    args = ap.parse_args()
    sections = args.only.split(",") if args.only else ALL_SECTIONS

    cutoff = (parse_iso(args.cutoff + "T00:00:00Z") if args.cutoff
              else datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0))
    snapshot_id = f"{cutoff:%Y-%m-%d}"
    snap = Snapshot(STATS_DIR / snapshot_id / "stratz")
    patch_from = parse_iso(PATCH_STARTED_AT) + timedelta(hours=PATCH_BUFFER_H)
    first_patch_week = week_start(patch_from) + (timedelta(days=7) if week_start(patch_from) < patch_from else timedelta())
    last_closed = week_start(cutoff) - timedelta(days=7)
    patch_weeks = list(range(ts(first_patch_week), ts(last_closed) + 1, WEEK_S))
    item_weeks = list(range(ts(last_closed) - (args.item_weeks - 1) * WEEK_S, ts(last_closed) + 1, WEEK_S))

    names = {int(k): v["localized_name"] for k, v in
             json.loads((DOTA_DIR / "heroes.json").read_text(encoding="utf-8")).items()}
    hero_ids = sorted(names)
    sx = Stratz(CACHE_DIR)
    started = iso(datetime.now(timezone.utc))
    print(f"STRATZ, снимок {snapshot_id}: патч {PATCH} с {iso(patch_from)}, недели патча "
          f"{day(patch_weeks[0])}…{day(patch_weeks[-1])}, предметы {day(item_weeks[0])}…{day(item_weeks[-1])}")

    item_names, ability_names = constants(sx, snap)
    hero_rows = []
    if "heroes" in sections:
        print("— герои: недели патча по рангам и позициям")
        hero_rows += heroes_weeks(sx, snap, names, patch_from, cutoff)
    if "months" in sections:
        print("— герои: месяцы")
        hero_rows += heroes_months(sx, snap, names, cutoff)
    if hero_rows:
        # частичный запуск (--only months) не должен терять окна другого раздела
        path = snap.path / "heroes.json"
        fresh = {r["window_id"] for r in hero_rows}
        kept = [r for r in json.loads(path.read_text(encoding="utf-8"))["rows"] if r["window_id"] not in fresh] \
            if path.exists() else []
        snap.write("heroes.json", {"snapshot_id": snapshot_id, "patch": PATCH, "rows": kept + hero_rows})
    if "avg" in sections:
        print("— средние показатели героев")
        snap.write("hero_avg.json", hero_avg(sx, snap, names, patch_weeks))
    if "items" in sections:
        print("— предметы по неделям")
        rows, weekly = items_weeks(sx, snap, hero_ids, item_weeks, patch_weeks, item_names, names)
        snap.write("items.json", {"snapshot_id": snapshot_id, "patch": PATCH, "rows": rows})
        snap.write("items_weekly.json", {"snapshot_id": snapshot_id, "item_names": {str(k): v for k, v in item_names.items()},
                                         "weeks": weekly})
    if "boots" in sections:
        print("— ботинки по неделям патча")
        rows, _ = items_weeks(sx, snap, hero_ids, patch_weeks, patch_weeks, item_names, names,
                              field="itemBootPurchase", prefix="boots")
        snap.write("boots.json", {"snapshot_id": snapshot_id, "patch": PATCH, "rows": rows})
    if "perhero" in sections:
        print("— по героям: матчапы, таланты, стартовые предметы")
        m, t, s = per_hero(sx, snap, hero_ids, names, patch_weeks)
        snap.write("matchups.json", {"snapshot_id": snapshot_id, "columns": ["hero_id", "hero_id2", "kind", "games", "wins", "synergy"],
                                     "rows": m})
        for r in t:
            r["ability"] = (ability_names.get(r["ability_id"]) or {}).get("name")
            r["talent"] = (ability_names.get(r["ability_id"]) or {}).get("display")
        snap.write("talents.json", {"snapshot_id": snapshot_id, "rows": t})
        for r in s:
            r["item"] = item_names.get(r["item_id"])
        snap.write("starting.json", {"snapshot_id": snapshot_id, "rows": s})
    if "lanes" in sections:
        print("— лайнинг: исходы линий по парам героев")
        snap.write("lanes.json", {"snapshot_id": snapshot_id,
                                  "columns": ["hero_id", "hero_id2", "games", "win", "draw", "loss", "stomp_win", "stomp_loss"],
                                  "rows": lanes(sx, snap, hero_ids)})
    if "rankedbans" in sections:
        print(f"— баны рейтинговых матчей (выборка {RANKED_BAN_SAMPLE})")
        snap.write("bans_ranked.json", ranked_bans(sx, snap, names, patch_from, cutoff))
    if "bans" in sections:
        print("— баны")
        snap.write("bans.json", {"snapshot_id": snapshot_id, "rows": bans(sx, snap, names, patch_from, cutoff)})

    manifest_path = snap.path / "manifest.json"
    old = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    ds = {d["id"]: d for d in old.get("datasets", [])}
    ds.update({d["id"]: d for d in snap.datasets})
    manifest = {
        "snapshot_id": snapshot_id, "source": "STRATZ GraphQL https://api.stratz.com/graphql",
        "game_patch": PATCH, "patch_started_at": PATCH_STARTED_AT, "patch_window_buffer_hours": PATCH_BUFFER_H,
        "patch_evidence": PATCH_EVIDENCE,
        "run": {"started_at": started, "finished_at": iso(datetime.now(timezone.utc)),
                "script": "scripts/fetch_stratz.py", "sections": sections, "requests": sx.requests},
        "normalized": {p.name: sha256(p.read_bytes()) for p in sorted(snap.path.glob("*.json")) if p.name != "manifest.json"},
        "datasets": list(ds.values()),
    }
    snap.write("manifest.json", manifest)
    print(f"\nГотово → {snap.path}/ ({sx.requests} запросов)")


if __name__ == "__main__":
    main()
