#!/usr/bin/env python3
"""
Статистика компании друзей из STRATZ — для персональных вопросов («у кого лучший винрейт на Kez», «сколько игр
Блох сыграл с тобой»).

Пишет scripts/data/friends/ (matches.jsonl и state.json — в .gitignore из-за размера; сводки коммитим):
  matches.jsonl   — все матчи компании (по одному на строку, ключ — id), докачивается при повторном запуске
  profiles.json   — профили STRATZ: ник, ранг, всего матчей, анонимность
  summary.json    — сводка по каждому человеку, парам и пати

Как определяется компания: игроки, стоявшие с --me в одном пати (partyId) не меньше --min-party раз.
Открытые профили — вся их история матчей. Анонимные (в клиенте Dota 2 выключено «Expose Public Match Data»):
STRATZ не отдаёт их историю и агрегаты, поэтому их статистика — только по матчам компании, где они были
с кем-то из открытых игроков. Сольные игры анонимов не видны никому — флаг приватности не обходим.

Использование (из корня репо):
  python scripts/fetch_friends.py --me 1101588971
  python scripts/fetch_friends.py --me 1101588971 --min-party 30 --extra 123456789
  python scripts/fetch_friends.py --me 1101588971 --no-fetch     # только пересчитать сводку
"""

import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stratz_client import Stratz  # noqa: E402

OUT = Path("scripts/data/friends")
DOTA_DIR = Path("scripts/data/dota")
PAGE = 100
MIN_HERO_GAMES = 20   # минимум игр на герое, чтобы говорить о его винрейте
# Настоящие ливы; DISCONNECTED — обычный реконнект, его не считаем
LEAVER_STATUSES = {"ABANDONED", "AFK", "DISCONNECTED_TOO_LONG"}
# Срезы сводки: в Турбо другие цифры (золото, убийства, длительность) — рекорды и винрейты считаем отдельно
SCOPES = {"all": lambda m: True,
          "normal": lambda m: m.get("gameMode") != "TURBO",
          "turbo": lambda m: m.get("gameMode") == "TURBO"}

PLAYER_FIELDS = """steamAccountId steamAccount { name isAnonymous } isRadiant isVictory partyId heroId
  kills deaths assists networth goldPerMinute experiencePerMinute numLastHits numDenies level
  heroDamage towerDamage heroHealing award position lane imp intentionalFeeding leaverStatus isRandom
  item0Id item1Id item2Id item3Id item4Id item5Id neutral0Id"""
MATCH_FIELDS = f"""id startDateTime durationSeconds didRadiantWin gameMode lobbyType averageRank regionId
  firstBloodTime players {{ {PLAYER_FIELDS} }}"""


def day(t):
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d") if t else None


def rate(a, b):
    return round(a / b, 4) if b else None


# ---------- загрузка ----------

class MatchStore:
    def __init__(self, path: Path):
        self.path = path
        self.matches = {}
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    m = json.loads(line)
                    self.matches[m["id"]] = m

    def add(self, ms: list) -> int:
        new = 0
        with self.path.open("a", encoding="utf-8") as f:
            for m in ms:
                if m["id"] not in self.matches:
                    self.matches[m["id"]] = m
                    f.write(json.dumps(m, ensure_ascii=False) + "\n")
                    new += 1
        return new


def fetch_history(sx: Stratz, store: MatchStore, account: int, label: str) -> int:
    """Все матчи игрока от новых к старым. Пока история не скачана целиком — до пустой страницы
    (страница может состоять из уже известных общих матчей); потом — до первой страницы без новых."""
    state_path = OUT / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
    complete = state.get(str(account), {}).get("complete", False)
    skip, got = 0, 0
    while True:
        data = sx.query(f"{{ player(steamAccountId: {account}) {{ matches(request: {{take: {PAGE}, skip: {skip}}}) "
                        f"{{ {MATCH_FIELDS} }} }} }}")
        ms = (data.get("player") or {}).get("matches") or []
        if not ms:
            break
        new = store.add(ms)
        got += new
        print(f"    {label}: skip {skip}, +{new} новых (до {day(ms[-1]['startDateTime'])})")
        if new == 0 and complete:
            break
        skip += PAGE
    state[str(account)] = {"complete": True, "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    state_path.write_text(json.dumps(state, indent=1), encoding="utf-8")
    return got


def fetch_profiles(sx: Stratz, ids: list) -> dict:
    q = "{ " + " ".join(
        f"p{a}: player(steamAccountId: {a}) {{ steamAccountId steamAccount {{ name isAnonymous seasonRank "
        f"seasonLeaderboardRank smurfFlag }} matchCount winCount firstMatchDate lastMatchDate "
        f"heroesPerformance(request: {{take: 100000}}, take: 300) {{ heroId matchCount winCount }} }}"
        for a in ids) + " }"
    data = sx.query(q)
    return {a: data[f"p{a}"] for a in ids if data.get(f"p{a}")}


# ---------- сводка ----------

def team_of(m: dict, account: int):
    for p in m["players"]:
        if p["steamAccountId"] == account:
            return p
    return None


def person_summary(account: int, matches: list, heroes: dict, items: dict) -> dict:
    """matches — матчи, где игрок был. Возвращает агрегаты по нему."""
    rows = [(m, team_of(m, account)) for m in matches]
    rows = [(m, p) for m, p in rows if p]
    g = len(rows)
    w = sum(1 for _, p in rows if p["isVictory"])
    by_hero = defaultdict(lambda: [0, 0])
    awards, positions, final_items = Counter(), Counter(), Counter()
    k = d = a = 0
    feeds = leaves = randoms = 0
    rec = {}

    def keep(name, value, m, p):
        if value is None:
            return
        if name not in rec or value > rec[name]["value"]:
            rec[name] = {"value": value, "match_id": m["id"], "date": day(m["startDateTime"]),
                         "hero": heroes.get(p["heroId"]), "win": p["isVictory"]}

    for m, p in rows:
        by_hero[p["heroId"]][0] += 1
        by_hero[p["heroId"]][1] += 1 if p["isVictory"] else 0
        k += p["kills"] or 0
        d += p["deaths"] or 0
        a += p["assists"] or 0
        awards[p.get("award") or "NONE"] += 1
        positions[p.get("position") or "UNKNOWN"] += 1
        feeds += 1 if p.get("intentionalFeeding") else 0
        leaves += 1 if p.get("leaverStatus") in LEAVER_STATUSES else 0
        randoms += 1 if p.get("isRandom") else 0
        for slot in ("item0Id", "item1Id", "item2Id", "item3Id", "item4Id", "item5Id"):
            if p.get(slot):
                final_items[p[slot]] += 1
        for f in ("kills", "deaths", "assists", "heroDamage", "heroHealing", "towerDamage", "networth",
                  "goldPerMinute", "numLastHits"):
            keep(f, p.get(f), m, p)
        keep("duration_min", round((m["durationSeconds"] or 0) / 60, 1), m, p)
    hero_rows = sorted(({"hero_id": h, "hero": heroes.get(h), "games": n, "wins": wn, "winrate": rate(wn, n)}
                        for h, (n, wn) in by_hero.items()), key=lambda r: -r["games"])
    eligible = [r for r in hero_rows if r["games"] >= MIN_HERO_GAMES]
    return {
        "games": g, "wins": w, "winrate": rate(w, g),
        "from": day(min((m["startDateTime"] for m, _ in rows), default=None)),
        "to": day(max((m["startDateTime"] for m, _ in rows), default=None)),
        "avg_kda": [round(k / g, 2), round(d / g, 2), round(a / g, 2)] if g else None,
        "heroes_played": len(hero_rows),
        "heroes": hero_rows,
        "best_hero": max(eligible, key=lambda r: r["winrate"], default=None),
        "worst_hero": min(eligible, key=lambda r: r["winrate"], default=None),
        "awards": dict(awards), "positions": dict(positions.most_common()),
        "intentional_feeding_games": feeds, "leaver_games": leaves, "random_games": randoms,
        "final_items_top": [{"item_id": i, "item": items.get(i), "games": n} for i, n in final_items.most_common(15)],
        "records": rec,
    }


def build_summary(store: MatchStore, me: int, group: list, profiles: dict, heroes: dict, items: dict) -> dict:
    all_ms = sorted(store.matches.values(), key=lambda m: m["startDateTime"])
    scopes = {name: build_scope([m for m in all_ms if keep(m)], group, profiles, heroes, items)
              for name, keep in SCOPES.items()}
    modes = Counter(f"{m.get('gameMode')}/{m.get('lobbyType')}" for m in all_ms)
    return {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "me": me,
            "matches_in_store": len(all_ms), "from": day(all_ms[0]["startDateTime"]) if all_ms else None,
            "to": day(all_ms[-1]["startDateTime"]) if all_ms else None, "modes": dict(modes.most_common()),
            "min_hero_games": MIN_HERO_GAMES, "scopes": scopes}


def build_scope(ms: list, group: list, profiles: dict, heroes: dict, items: dict) -> dict:
    names = {}
    for m in ms:
        for p in m["players"]:
            if p["steamAccountId"] in group:
                names[p["steamAccountId"]] = (p.get("steamAccount") or {}).get("name")
    people = {}
    for acc in group:
        prof = profiles.get(acc) or {}
        anon = bool((prof.get("steamAccount") or {}).get("isAnonymous"))
        mine = [m for m in ms if team_of(m, acc)]
        people[str(acc)] = {
            "steam_account_id": acc,
            "name": (prof.get("steamAccount") or {}).get("name") or names.get(acc),
            "anonymous": anon,
            "coverage": "group_matches" if anon else "own_history",
            "season_rank": (prof.get("steamAccount") or {}).get("seasonRank"),
            "stratz_profile": {"match_count": prof.get("matchCount"), "win_count": prof.get("winCount"),
                               "first_match": day(prof.get("firstMatchDate")), "last_match": day(prof.get("lastMatchDate"))},
            **person_summary(acc, mine, heroes, items),
        }
    pairs = []
    for i, a in enumerate(group):
        for b in group[i + 1:]:
            same = opp = sw = 0
            heroes_a = Counter()
            for m in ms:
                pa, pb = team_of(m, a), team_of(m, b)
                if not (pa and pb):
                    continue
                if pa["isRadiant"] == pb["isRadiant"]:
                    same += 1
                    sw += 1 if pa["isVictory"] else 0
                    heroes_a[(pa["heroId"], pb["heroId"])] += 1
                else:
                    opp += 1
            if same or opp:
                pairs.append({"a": a, "b": b, "a_name": people[str(a)]["name"], "b_name": people[str(b)]["name"],
                              "together": same, "wins_together": sw, "winrate_together": rate(sw, same), "against": opp,
                              "top_duos": [{"a_hero": heroes.get(x), "b_hero": heroes.get(y), "games": n}
                                           for (x, y), n in heroes_a.most_common(5)]})
    # стаки: какие наборы друзей играли вместе в одном пати и с каким винрейтом
    stacks = Counter()
    stack_w = Counter()
    gs = set(group)
    for m in ms:
        by_party = defaultdict(set)
        win = {}
        for p in m["players"]:
            if p["steamAccountId"] in gs and p["partyId"] is not None:
                by_party[(p["isRadiant"], p["partyId"])].add(p["steamAccountId"])
                win[(p["isRadiant"], p["partyId"])] = p["isVictory"]
        for key, members in by_party.items():
            if len(members) >= 2:
                s = tuple(sorted(members))
                stacks[s] += 1
                stack_w[s] += 1 if win[key] else 0
    stack_rows = [{"members": [people[str(x)]["name"] for x in s], "games": n, "wins": stack_w[s],
                   "winrate": rate(stack_w[s], n)} for s, n in stacks.most_common(30)]
    return {"matches": len(ms), "people": people, "pairs": pairs, "stacks": stack_rows}


def main() -> None:
    ap = argparse.ArgumentParser(description="Статистика компании друзей (STRATZ)")
    ap.add_argument("--me", type=int, required=True, help="steamAccountId (32-битный, как в STRATZ/OpenDota)")
    ap.add_argument("--min-party", type=int, default=30, help="минимум игр в одном пати, чтобы считать другом")
    ap.add_argument("--extra", type=int, nargs="*", default=[], help="добавить игроков вручную")
    ap.add_argument("--no-fetch", action="store_true", help="не ходить в STRATZ, пересчитать сводку")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    store = MatchStore(OUT / "matches.jsonl")
    heroes = {int(k): v["localized_name"] for k, v in json.loads((DOTA_DIR / "heroes.json").read_text(encoding="utf-8")).items()}
    items = {v["id"]: v.get("dname") for v in json.loads((DOTA_DIR / "items.json").read_text(encoding="utf-8")).values()
             if isinstance(v, dict) and "id" in v}
    sx = None if args.no_fetch else Stratz()

    if sx:
        print(f"— мои матчи ({args.me})")
        fetch_history(sx, store, args.me, "я")
    party = Counter()
    for m in store.matches.values():
        me = team_of(m, args.me)
        if not me or me["partyId"] is None:
            continue
        for p in m["players"]:
            if p["steamAccountId"] not in (None, args.me) and p["isRadiant"] == me["isRadiant"] and p["partyId"] == me["partyId"]:
                party[p["steamAccountId"]] += 1
    friends = [a for a, n in party.most_common() if n >= args.min_party] + [a for a in args.extra if a not in party]
    group = [args.me] + friends
    print(f"— компания: {len(friends)} друзей (≥{args.min_party} игр в пати): " + ", ".join(f"{a} ({party[a]})" for a in friends))

    profiles_path = OUT / "profiles.json"
    if sx:
        profiles = fetch_profiles(sx, group)
        profiles_path.write_text(json.dumps({str(k): v for k, v in profiles.items()}, ensure_ascii=False, indent=1), encoding="utf-8")
        for acc in friends:
            prof = profiles.get(acc) or {}
            if (prof.get("steamAccount") or {}).get("isAnonymous"):
                print(f"    {acc} {(prof.get('steamAccount') or {}).get('name')}: анонимный — только матчи компании")
                continue
            print(f"— история друга {acc} {(prof.get('steamAccount') or {}).get('name')}")
            fetch_history(sx, store, acc, str(acc))
    else:
        profiles = {int(k): v for k, v in json.loads(profiles_path.read_text(encoding="utf-8")).items()} if profiles_path.exists() else {}

    summary = build_summary(store, args.me, group, profiles, heroes, items)
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"\nГотово → {OUT}/: {summary['matches_in_store']} матчей ({summary['from']} … {summary['to']})"
          + (f", {sx.requests} запросов" if sx else ""))
    print(f"  режимы: {summary['modes']}")
    for p in summary["scopes"]["normal"]["people"].values():
        bh = p["best_hero"]
        print(f"  {p['name']!s:24} {p['coverage']:13} {p['games']:5} игр  WR {p['winrate'] or 0:.1%}"
              + (f"  лучший: {bh['hero']} {bh['winrate']:.0%} ({bh['games']})" if bh else ""))


if __name__ == "__main__":
    main()
