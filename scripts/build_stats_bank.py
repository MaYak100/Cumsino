#!/usr/bin/env python3
"""
Банк вопросов на статистике (STRATZ + OpenDota) для игры: снимок scripts/data/stats/<дата>/ → scripts/data/stats/bank.json.

Вопрос собирает сервер при каждом показе (server/src/game/stats/statQuestions.ts) — здесь только подкатегории,
пулы и значения. Правила (docs/questions/stratz-research.md):
  - MC: 4 варианта из пула; ответ — лидер среди показанных (ask: max / min); лидер отрывается от каждого из трёх
    остальных на gap (rel — во сколько раз, abs — на сколько единиц); нет такой четвёрки — гейт снимается;
  - герой / предмет, попавший в варианты (и герой вопроса), исключается из подкатегории до конца игры;
  - note — истинное значение варианта (показ после ответа, до ~6 символов), comment — что за число и за какое окно.

Формат bank.json:
  {snapshot, patch, subcategories: [{id, mode: mc|closest, topic, display, comment, weight, gap?, pools}]}
  mc-пул:      {subject?, entries: [[name, value, note]], asks: [{ask: max|min, text}]}
  exclusive:   [[a, b]] — не ставить в одну четвёрку (компонент и его улучшение: Arcane ≥ Guardian Greaves всегда)
  closest-пул: {subject, text, answer}

  python scripts/build_stats_bank.py                  # последний снимок
  python scripts/build_stats_bank.py --snapshot 2026-10-27
"""

import argparse
import json
import random
import sys
from collections import defaultdict
from pathlib import Path

STATS = Path("scripts/data/stats")
DOTA = Path("scripts/data/dota")
OUT = STATS / "bank.json"

# пороги из решений 2026-10-27
AVG_GAP = {"rel": 0.10}
COUNTER_GAP = {"abs": 2.5}         # п.п. преимущества
COUNTER_MIN_GAMES = 5000
COUNTER_MIN_RIVALS = 25            # меньше — пул мал (Chen, Batrider, Elder Titan)
TALENT_GAP = {"abs": 0.10}         # доля внутри пары уровня
BAN_GAP = {"abs": 0.025}
WR_GAP = {"abs": 0.015}
PICK_GAP = {"rel": 0.15}
ITEM_GAP = {"rel": 0.10}
ITEM_HERO_GAP = {"rel": 0.15}
HEAL_ALLIES_MIN = 500              # заметный хил союзникам — иначе шум «хилит / не хилит»
ITEM_MIN_COST = 2000
ITEM_BASIC_KEEP = {"blink", "aghanims_shard"}           # без рецепта, но законченные предметы
ITEM_INTERMEDIATE = {"yasha", "sange", "kaya", "lesser_crit", "soul_booster", "oblivion_staff", "pers",
                     "ultimate_scepter_2"}
BOOTS_SKIP = {"Boots of Speed"}    # база — её покупают все, кто собирает ботинки
ITEMS_PER_HERO = 8
CLOSEST_BAN_TOP = 30
CLOSEST_PICK_TOP = 40


# ---------- форматирование подписей ----------

def sig3(v: float) -> str:
    """3 значащие цифры с русскими суффиксами: 375, 7.4к, 26.2к, 120к, 1.2М, 53.2М, 1.2 млрд."""
    a = abs(v)
    for div, suf in ((1e9, " млрд"), (1e6, "М"), (1e3, "к")):
        if a >= div:
            x = v / div
            return (f"{x:.1f}" if abs(x) < 100 else f"{x:.0f}").rstrip("0").rstrip(".") + suf
    return f"{v:.1f}".rstrip("0").rstrip(".") if a < 100 else f"{v:.0f}"


def pct(v: float, digits: int = 1) -> str:
    return f"{100 * v:.{digits}f}%"


def signed(v: float) -> str:
    return f"{'+' if v >= 0 else '−'}{abs(v):.1f}"


# ---------- проверка пулов ----------

def gap_ok(lead: float, other: float, gap: dict, ask: str) -> bool:
    d = lead - other if ask == "max" else other - lead
    if d <= 0:
        return False
    if "abs" in gap:
        return d >= gap["abs"]
    base = abs(other) if ask == "max" else abs(lead)
    return base > 0 and d >= gap["rel"] * base


def leaders(entries: list, gap: dict, ask: str) -> int:
    """Сколько вариантов могут быть ответом (у них ≥ 3 соперника с нужным отрывом)."""
    return sum(1 for _, v, _ in entries if sum(gap_ok(v, o, gap, ask) for _, o, _ in entries) >= 3)


def first_try(entries: list, gap: dict, ask: str, rng: random.Random, n: int = 300) -> float:
    ok = 0
    for _ in range(n):
        s = rng.sample(entries, 4)
        lead = (max if ask == "max" else min)(s, key=lambda e: e[1])
        ok += all(gap_ok(lead[1], e[1], gap, ask) for e in s if e is not lead)
    return ok / n


# ---------- загрузка ----------

def latest_snapshot() -> Path:
    snaps = sorted(p for p in STATS.iterdir() if p.is_dir() and (p / "stratz").is_dir())
    if not snaps:
        raise SystemExit("нет снимков scripts/data/stats/<дата>/stratz")
    return snaps[-1]


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def mc_pool(entries: list, *asks: tuple, subject: str | None = None) -> dict:
    """asks: (ask, text) — формулировки над одним и тем же списком (max / min)."""
    pool = {"entries": entries, "asks": [{"ask": a, "text": t} for a, t in asks]}
    if subject:
        pool = {"subject": subject, **pool}
    return pool


def half(rows: list, key, top: bool) -> list:
    s = sorted(rows, key=key, reverse=True)
    n = len(s) // 2
    return s[:n] if top else s[len(s) - n:]


class Bank:
    def __init__(self, patch: str):
        self.patch = patch
        self.subs = []

    def add(self, sub: dict) -> None:
        if sub["mode"] == "mc":
            for p in sub["pools"]:
                p["asks"] = [a for a in p["asks"] if len(p["entries"]) >= 4 and leaders(p["entries"], sub["gap"], a["ask"])]
            sub["pools"] = [p for p in sub["pools"] if p["asks"]]
        if sub["pools"]:
            self.subs.append(sub)


# ---------- подкатегории ----------

def avg_subs(bank: Bank, snap: Path) -> None:
    rows = load(snap / "stratz/hero_avg.json")["rows"]
    weeks = load(snap / "stratz/hero_avg.json")["weeks"]
    window = f"STRATZ, недели {weeks[0][5:]}…{weeks[-1][5:]}, все ранги"

    def pool(field, ask, text, take, exclude=(), fmt=sig3, where=None):
        rs = [r for r in rows if r["hero"] not in exclude and r.get(field) is not None and (where is None or where(r))]
        if take == "top":
            rs = half(rs, lambda r: r[field], True)
        elif take == "bottom":
            rs = half(rs, lambda r: r[field], False)
        return mc_pool([[r["hero"], round(r[field], 2), fmt(r[field])] for r in rs], (ask, text))

    specs = [
        ("avg_heal_allies", "Хил союзникам", "Средний хил союзникам за матч", [
            pool("healingAllies", "max", "Кто из этих героев в среднем лечит союзников больше всех за матч?", "all",
                 where=lambda r: r["healingAllies"] >= HEAL_ALLIES_MIN)]),
        ("avg_heal_self", "Самолечение", "Среднее самолечение за матч (Meepo не берём — суммирует клонов)", [
            pool("healingSelf", "max", "Кто из этих героев в среднем лечит себя больше всех за матч?", "top",
                 exclude={"Meepo"})]),
        ("avg_tower", "Урон по строениям", "Средний урон по строениям за матч", [
            pool("towerDamage", "max", "Кто из этих героев в среднем наносит больше всего урона по строениям за матч?",
                 "top")]),
        ("avg_hero_damage", "Урон по героям", "Средний урон по героям за матч", [
            pool("heroDamage", "max", "Кто из этих героев в среднем наносит больше всего урона героям за матч?", "top"),
            pool("heroDamage", "min", "Кто из этих героев в среднем наносит меньше всего урона героям за матч?",
                 "bottom")]),
        ("avg_kills", "Убийства", "Среднее число убийств за матч", [
            pool("kills", "max", "Кто из этих героев в среднем делает больше всего убийств за матч?", "top"),
            pool("kills", "min", "Кто из этих героев в среднем делает меньше всего убийств за матч?", "bottom")]),
        ("avg_cs", "Добивания", "Среднее число добитых крипов за матч", [
            pool("cs", "max", "Кто из этих героев в среднем добивает больше всего крипов за матч?", "top"),
            pool("cs", "min", "Кто из этих героев в среднем добивает меньше всего крипов за матч?", "bottom")]),
    ]
    for sid, display, what, pools in specs:
        bank.add({"id": sid, "mode": "mc", "topic": "Средние за матч", "display": display,
                  "comment": f"{what} на {bank.patch} ({window}).", "gap": AVG_GAP, "weight": 1, "pools": pools})


def counter_sub(bank: Bank, snap: Path, names: dict) -> None:
    by_hero = defaultdict(list)
    for h, h2, kind, games, wins, syn in load(snap / "stratz/matchups.json")["rows"]:
        if kind == "vs" and games >= COUNTER_MIN_GAMES and syn is not None:
            by_hero[h].append([names[h2], round(syn, 2), signed(syn)])
    pools = [mc_pool(entries, *((ask, f"Против кого из этих героев {names[h]} выигрывает {word} всего?")
                                for ask, word in (("min", "реже"), ("max", "чаще"))), subject=names[h])
             for h, entries in sorted(by_hero.items()) if len(entries) >= COUNTER_MIN_RIVALS]
    bank.add({"id": "counter", "mode": "mc", "topic": "Контрпики", "display": "Контрпики",
              "comment": f"Преимущество героя против соперника, п.п. — винрейт с поправкой на силу обоих "
                         f"(STRATZ, {bank.patch}, все ранги).",
              "gap": COUNTER_GAP, "weight": 2, "pools": pools})


def talent_sub(bank: Bank, snap: Path, names: dict, hero_keys: dict) -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from talent_text import hero_talents, render   # уровни и русский текст — из файлов игры
    slots = hero_talents()
    games = defaultdict(int)
    for r in load(snap / "stratz/talents.json")["rows"]:
        games[(r["hero_id"], r["ability"])] += r["games"]
    pools, missing = [], []
    for hid, key in sorted(hero_keys.items()):
        entries = []
        for lvl, label in ((3, 20), (4, 25)):
            pair = [n for n, level in slots.get(key, []) if level == lvl]
            tot = sum(games[(hid, n)] for n in pair)
            texts = [render(n) for n in pair]
            # нет строки STRATZ хотя бы по одному таланту пары (новые таланты патча) — доля 0% была бы ложной
            if len(pair) != 2 or not all(games[(hid, n)] for n in pair) or not all(texts):
                break
            entries += [[f"{label} ур.: {text}", round(games[(hid, n)] / tot, 4), pct(games[(hid, n)] / tot, 0)]
                        for n, text in zip(pair, texts)]
        if len(entries) != 4 or len({e[0] for e in entries}) != 4:
            missing.append(names[hid])
            continue
        pools.append(mc_pool(entries, *((ask, f"Какой из талантов {names[hid]} на 20 и 25 уровне берут {word} всего?")
                                        for ask, word in (("max", "чаще"), ("min", "реже"))), subject=names[hid]))
    if missing:
        print(f"  таланты: нет текстов или данных STRATZ по всем 4 талантам у {len(missing)} героев")
    bank.add({"id": "talents", "mode": "mc", "topic": "Таланты", "display": "Таланты",
              "comment": f"Доля внутри пары талантов одного уровня (STRATZ, {bank.patch}, все ранги).",
              "gap": TALENT_GAP, "weight": 2, "pools": pools})


def ban_subs(bank: Bank, snap: Path) -> None:
    d = load(snap / "stratz/bans_ranked.json")
    rows = sorted(d["rows"], key=lambda r: -r["ban_rate"])
    comment = f"Доля рейтинговых матчей, где героя забанили ({bank.patch}, выборка {d['sample_matches']} матчей STRATZ)."
    top = rows[:30]
    bank.add({"id": "bans", "mode": "mc", "topic": "Баны", "display": "Баны", "comment": comment, "gap": BAN_GAP,
              "weight": 1, "pools": [mc_pool([[r["hero"], round(r["ban_rate"], 4), pct(r["ban_rate"])] for r in top],
                                             ("max", f"Кого из этих героев чаще всего банят в рейтинге на {bank.patch}?"))]})
    bank.add({"id": "bans_closest", "mode": "closest", "topic": "Баны", "display": "Баны", "comment": comment,
              "weight": 1, "pools": [{"subject": r["hero"], "answer": round(100 * r["ban_rate"]),
                                      "text": f"В каком проценте рейтинговых матчей банят {r['hero']} на {bank.patch}?"}
                                     for r in rows[:CLOSEST_BAN_TOP]]})


def hero_subs(bank: Bank, snap: Path) -> None:
    od = [r for r in load(snap / "heroes.json")["rows"] if r["window_id"] == "hero_wr_patch" and r["bracket"] == "all"]
    st = load(snap / "stratz/heroes.json")["rows"]
    od_win = load(snap / "manifest.json")
    od_from = next(d["window"]["from"][:10] for d in od_win["datasets"] if d["id"] == "hero_wr_patch")
    p = bank.patch

    def entries(rs, key, fmt):
        return [[r["hero"], round(key(r), 5), fmt(key(r))] for r in rs]

    def top_bottom(rs, key, fmt, text_max, text_min):
        return [mc_pool(entries(half(rs, key, True), key, fmt), ("max", text_max)),
                mc_pool(entries(half(rs, key, False), key, fmt), ("min", text_min))]

    wr = lambda r: r["winrate"]
    bank.add({"id": "hero_wr", "mode": "mc", "topic": "Винрейт героев", "display": f"Винрейт на {p}",
              "comment": f"Винрейт за патч {p} (OpenDota, с {od_from}, все ранги).", "gap": WR_GAP, "weight": 2,
              "pools": top_bottom(od, wr, pct, f"У кого из этих героев самый высокий винрейт на {p}?",
                                  f"У кого из этих героев самый низкий винрейт на {p}?")})

    # винрейт на Immortal убран (2026-10-29): винрейты кучкуются у 50%, варианты выглядят одинаково

    pr = lambda r: r["pick_rate"]
    pick_comment = f"Доля матчей, где героя выбрали (OpenDota, {p} с {od_from}, все ранги)."
    bank.add({"id": "hero_pick", "mode": "mc", "topic": "Популярность героев", "display": f"Пики на {p}",
              "comment": pick_comment, "gap": PICK_GAP, "weight": 2,
              "pools": top_bottom(od, pr, pct, f"Кого из этих героев чаще всего пикают на {p}?",
                                  f"Кого из этих героев реже всего пикают на {p}?")})
    bank.add({"id": "hero_pick_closest", "mode": "closest", "topic": "Популярность героев", "display": f"Пики на {p}",
              "comment": pick_comment, "weight": 1,
              "pools": [{"subject": r["hero"], "answer": round(100 * r["pick_rate"]),
                         "text": f"В каком проценте матчей пикают {r['hero']} на {p}?"}
                        for r in sorted(od, key=pr, reverse=True)[:CLOSEST_PICK_TOP]]})

    months = load(snap / "stratz/manifest.json")["datasets"]
    yw = next(d["window"]["months"] for d in months if d["id"] == "hero_year_months")
    # герой, вышедший внутри окна (Largo — 2025-12), в «пиках за год» занижен — не берём
    year = [r for r in st if r["window_id"] == "hero_year_months" and r["bracket"] == "all"
            and (r.get("first_month") or "9999") <= yw[0]]
    bank.add({"id": "hero_pick_year", "mode": "mc", "topic": "Популярность героев", "display": "Пики за год",
              "comment": f"Доля матчей с героем за {yw[0]} … {yw[-1]} (STRATZ, все ранги).", "gap": PICK_GAP,
              "weight": 1,
              "pools": top_bottom(year, pr, pct, "Кого из этих героев чаще всего пикали за последний год?",
                                  "Кого из этих героев реже всего пикали за последний год?")})

    aw = next(d["window"]["months"] for d in months if d["id"] == "hero_all_months")
    allm = [r for r in st if r["window_id"] == "hero_all_months" and r["bracket"] == "all"]
    # только верх: внизу — новые герои (Largo, Kez), там вопрос про дату выхода, а не про популярность
    bank.add({"id": "hero_pick_all", "mode": "mc", "topic": "Популярность героев", "display": "Пики за всё время",
              "comment": f"Доля матчей с героем с {aw[0]} по {aw[-1]} (STRATZ; нет данных за 2024-10 … 2025-08).",
              "gap": PICK_GAP, "weight": 1,
              "pools": [mc_pool(entries(half(allm, pr, True), pr, pct),
                                ("max", "Кого из этих героев пикали чаще всего за всю историю Dota 2?"))]})


def upgrade_pairs(names: set) -> list:
    """Пары [компонент, улучшение] среди names — компонент всегда покупают не реже, ответ угадывается логикой."""
    items = load(DOTA / "items.json")
    dname = {k: v.get("dname") for k, v in items.items() if isinstance(v, dict)}
    return sorted([dname[c], v["dname"]] for k, v in items.items() if isinstance(v, dict) and v.get("dname") in names
                  for c in (v.get("components") or []) if dname.get(c) in names and dname[c] != v["dname"])


def item_ok(key: str, meta: dict) -> bool:
    if not meta or meta.get("qual") == "consumable" or key in ITEM_INTERMEDIATE:
        return False
    if key in ITEM_BASIC_KEEP:
        return True
    return bool(meta.get("components")) and (meta.get("cost") or 0) >= ITEM_MIN_COST


def item_subs(bank: Bank, snap: Path, names: dict) -> None:
    meta = {v["dname"]: (k, v) for k, v in load(DOTA / "items.json").items() if isinstance(v, dict) and v.get("dname")}
    rows = [r for r in load(snap / "stratz/items.json")["rows"] if r["window_id"] == "items_patch"]
    good = lambda r: item_ok(*meta.get(r["item"], (None, None)))
    weeks = next(d["window"]["weeks"] for d in load(snap / "stratz/manifest.json")["datasets"] if d["id"] == "items_patch")
    window = f"STRATZ, недели {weeks[0][5:]}…{weeks[-1][5:]}"
    glob = sorted((r for r in rows if r["hero_id"] is None and good(r)), key=lambda r: -r["purchases"])[:30]
    bank.add({"id": "items", "mode": "mc", "topic": "Предметы", "display": "Популярные предметы",
              "comment": f"Число покупок за патч {bank.patch} ({window}; без ботинок и расходников).",
              "gap": ITEM_GAP, "weight": 1, "exclusive": upgrade_pairs({r["item"] for r in glob}),
              "pools": [mc_pool([[r["item"], r["purchases"], sig3(r["purchases"])] for r in glob],
                                ("max", f"Какой из этих предметов чаще всего покупают на {bank.patch}?"))]})

    by_hero = defaultdict(list)
    for r in rows:
        if r["hero_id"] is not None and good(r):
            by_hero[r["hero_id"]].append(r)
    pools = []
    for h, rs in sorted(by_hero.items()):
        rs = sorted(rs, key=lambda r: -r["purchases"])[:ITEMS_PER_HERO]
        entries = [[r["item"], r["purchases"], sig3(r["purchases"])] for r in rs]
        pools.append(mc_pool(entries, ("max", f"Какой из этих предметов чаще всего покупают на {names[h]}?"),
                             subject=names[h]))
    bank.add({"id": "items_hero", "mode": "mc", "topic": "Предметы", "display": "Предметы героя",
              "comment": f"Число покупок на герое за патч {bank.patch} ({window}; без ботинок и расходников).",
              "gap": ITEM_HERO_GAP, "weight": 2, "pools": pools,
              "exclusive": upgrade_pairs({e[0] for p in pools for e in p["entries"]})})

    boots = defaultdict(list)
    for r in load(snap / "stratz/boots.json")["rows"]:
        if r["window_id"] == "boots_patch" and r["hero_id"] is not None and r["item"] not in BOOTS_SKIP:
            boots[r["hero_id"]].append([r["item"], r["purchases"], sig3(r["purchases"])])
    pools = []
    for h, entries in sorted(boots.items()):
        entries.sort(key=lambda e: -e[1])
        pools.append(mc_pool(entries, ("max", f"Какие из этих ботинок чаще всего собирают на {names[h]}?"),
                             subject=names[h]))
    bank.add({"id": "boots_hero", "mode": "mc", "topic": "Предметы", "display": "Ботинки героя",
              "comment": f"Число покупок ботинок на герое за патч {bank.patch} ({window}).",
              "gap": ITEM_HERO_GAP, "weight": 1, "pools": pools,
              "exclusive": upgrade_pairs({e[0] for p in pools for e in p["entries"]})})


# ---------- main ----------

def report(bank: Bank) -> None:
    rng = random.Random(1)
    print(f"\n{'подкатегория':20} {'режим':7} {'пулов':>5} {'вариантов':>9}  ответов*  с 1-й попытки")
    for s in bank.subs:
        if s["mode"] == "closest":
            print(f"{s['id']:20} {'closest':7} {len(s['pools']):5}")
            continue
        sizes = [len(p["entries"]) for p in s["pools"]]
        lead = [leaders(p["entries"], s["gap"], a["ask"]) for p in s["pools"] for a in p["asks"]]
        ft = [first_try(p["entries"], s["gap"], a["ask"], rng, 100) for p in s["pools"][:40] for a in p["asks"]]
        print(f"{s['id']:20} {'mc':7} {len(sizes):5} {min(sizes):4}–{max(sizes):<4}  {min(lead):3}–{max(lead):<4} "
              f"{sum(ft) / len(ft):6.0%}")
    print("* сколько вариантов пула могут быть правильным ответом при гейте")


def main() -> None:
    ap = argparse.ArgumentParser(description="Банк вопросов на статистике")
    ap.add_argument("--snapshot", help="дата снимка (папка в scripts/data/stats/), по умолчанию последний")
    args = ap.parse_args()
    snap = STATS / args.snapshot if args.snapshot else latest_snapshot()
    heroes = load(DOTA / "heroes.json")
    names = {int(k): v["localized_name"] for k, v in heroes.items()}
    hero_keys = {int(k): v["name"] for k, v in heroes.items()}
    patch = load(snap / "stratz/heroes.json")["patch"]

    bank = Bank(patch)
    avg_subs(bank, snap)
    counter_sub(bank, snap, names)
    talent_sub(bank, snap, names, hero_keys)
    ban_subs(bank, snap)
    hero_subs(bank, snap)
    item_subs(bank, snap, names)
    report(bank)

    OUT.write_text(json.dumps({"snapshot": snap.name, "patch": patch, "subcategories": bank.subs},
                              ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"\n→ {OUT} ({OUT.stat().st_size // 1024} КБ, {len(bank.subs)} подкатегорий)")


if __name__ == "__main__":
    main()
