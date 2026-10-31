#!/usr/bin/env python3
"""
Банк вопросов на статистике (STRATZ + OpenDota) для игры: снимок scripts/data/stats/<дата>/ → scripts/data/stats/bank.json.

Вопрос собирает сервер при каждом показе (server/src/game/stats/statQuestions.ts) — здесь только подкатегории,
пулы и значения. Правила (docs/questions/stratz-research.md):
  - MC: 4 варианта из пула; ответ — лидер среди показанных (ask: max / min); порог gap — с КАЖДОЙ из трёх обманок:
    rel — лидер на такую долю выше, abs — на столько единиц (оба заданы — оба сразу), band — коридор: обманка от ⅔
    до 0.9 правды (иначе ответ очевиден: Manta 10.0М против 5.6М / 4.9М / 4.7М угадали все 5 из 5); нет такой
    четвёрки — гейт снимается;
  - герой / предмет, попавший в варианты (и герой вопроса), исключается из подкатегории до конца игры;
  - note — истинное значение варианта (до ~6 символов); в игре подписи форматирует сервер по value всей показанной
    четвёрки (одна точность и общий суффикс к/М, формат — поле note подкатегории), note в entries — запасной;
    comment — что за число и за какое окно.

Подкатегория может давать и MC, и «кто ближе» (closest) — как числовые вопросы банка: id подкатегории один, колода
одна. Тема вопроса (субъект «Герои» / «Axe» и аспект «убийства» / «предметы»), веса и заголовки —
server/src/game/questions/categories.ts; здесь только субъект пула (subject — герой вопроса) и тексты.

Формат bank.json:
  {snapshot, patch, subcategories: [{id, comment, gap?, note?, layout?, exclusive?, pools, closest?}]}
  pools:       MC-пулы (пусто — подкатегория только «кто ближе»)
  closest:     {unit?, comment?, pools: [closest-пул]} — unit по словарю единиц игры («%», «урона», «HP»; нет — без
               единицы), comment — если отличается от MC
  gap:         {rel?, abs?, band?: [lo, hi]} — с каждой обманкой; band: меньшее / большее из (правда, обманка) в
               [lo, hi] — «больше всех»: обманка от lo до hi правды, «меньше всех» — правда от lo до hi обманки
  note:        count — числа (к/М по максимуму четвёрки) | pct — доля 0…1 → «53.5%» | pct0 — «62%» | pp — п.п. «+1.4»
  layout:      talent_tree — варианты не перемешиваются, стоят как в дереве талантов (сверху 25 ур., снизу 20 ур.)
  mc-пул:      {subject?, entries: [[name, value, note]], asks: [{ask: max|min, text}]}
  exclusive:   [[a, b]] — не ставить в одну четвёрку (компонент и его улучшение: Maelstrom ≥ Mjollnir всегда)
  closest-пул: {subject, text, answer}; subject — карточка колоды (stat:<подкатегория>:<subject>), как у MC; несколько
               пулов с одним subject (предметы героя) — сервер выбирает сначала героя, потом пул

  python scripts/build_stats_bank.py                  # последний снимок
  python scripts/build_stats_bank.py --snapshot 2026-10-27
"""

import argparse
import json
import random
import sys
from collections import defaultdict
from itertools import combinations
from pathlib import Path

STATS = Path("scripts/data/stats")
DOTA = Path("scripts/data/dota")
OUT = STATS / "bank.json"

# пороги из решений 2026-10-27; коридор обманок (band) — 2026-10-31: каждая обманка от ⅔ до 0.9 правды («меньше
# всех» — зеркально: правда от ⅔ до 0.9 обманки). Раньше лидер был ограничен сверху только от второго места
# (maxRel ×3) — две другие обманки бывали вдвое ниже (Manta 10.0М против 5.6М / 4.9М / 4.7М — угадали все 5 из 5).
# Верх коридора 0.9 сам даёт отрыв лидера ≥ 11%, отдельный rel у таких подкатегорий не нужен
BAND = [2 / 3, 0.9]
AVG_GAP = {"band": BAND}
# хил союзникам — коридор от половины: хилеров в пуле 20, с ⅔ лидеров 8 (с ½ — 15)
HEAL_GAP = {"band": [0.5, 0.9]}
# добивания — ещё и ≥ 20 крипов с каждой обманкой: 0.9 от 60 крипов — разница 6, на глаз не различить
CS_GAP = {"band": BAND, "abs": 20}
COUNTER_GAP = {"abs": 2.5}         # п.п. преимущества
COUNTER_MIN_GAMES = 5000
COUNTER_MIN_RIVALS = 25            # меньше — пул мал (Chen, Batrider, Elder Titan)
TALENT_GAP = {"abs": 0.10}         # доля внутри пары уровня
BAN_GAP = {"abs": 0.025}
WR_GAP = {"abs": 0.025}            # 1.5 п.п. — почти монетка (2026-10-29)
PICK_GAP = {"band": BAND}
ITEM_GAP = {"band": BAND}
ITEM_HERO_GAP = {"band": BAND}
# ботинки героя убраны (2026-10-31): вопросы очевидны (Arcane у саппортов, Treads у керри), а с коридором обманок
# героев почти не остаётся
HEAL_ALLIES_MIN = 500              # заметный хил союзникам — иначе шум «хилит / не хилит»
ITEM_MIN_COST = 2000
ITEM_BASIC_KEEP = {"blink", "aghanims_shard"}           # без рецепта, но законченные предметы
ITEM_INTERMEDIATE = {"yasha", "sange", "kaya", "lesser_crit", "soul_booster", "oblivion_staff", "pers",
                     "ultimate_scepter_2"}
ITEMS_PER_HERO = 8
CLOSEST_BAN_TOP = 30
CLOSEST_PICK_MIN = 0.05            # пики closest: от 5% (верх и середина; ниже — ошибка в разы на малых числах)
# «кто ближе» по предметам (2026-10-30): доля от 5% (ниже — ошибка в разы) и до 95%: точного знаменателя нет —
# у STRATZ выборка покупок не совпадает с выборкой матчей героя (stratz-research.md, «Знаменатель предметов»)
CLOSEST_ITEM_MIN = 0.05
CLOSEST_ITEM_MAX = 0.95


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
    t = f"{abs(v):.1f}"
    return t if t == "0.0" else f"{'+' if v > 0 else '−'}{t}"


def ru_date(iso: str) -> str:
    """2026-09-17 → 17.09.2026"""
    y, m, d = iso[:10].split("-")
    return f"{d}.{m}.{y}"


def weeks_span(weeks: list) -> str:
    """Недели STRATZ (дата начала недели) → «17.09–21.10.2026»: до конца последней недели."""
    from datetime import date, timedelta
    a, b = date.fromisoformat(weeks[0]), date.fromisoformat(weeks[-1]) + timedelta(days=6)
    return f"{a:%d.%m}–{b:%d.%m.%Y}" if a.year == b.year else f"{a:%d.%m.%Y}–{b:%d.%m.%Y}"


def days_span(frm: str, to: str) -> str:
    """Окно [from, to) с временем → «16.09–26.10.2026» (to не включительно: 2026-10-27T00:00 — конец 26-го)."""
    from datetime import datetime, timedelta
    a = datetime.fromisoformat(frm.replace("Z", "+00:00"))
    b = datetime.fromisoformat(to.replace("Z", "+00:00")) - timedelta(seconds=1)
    return f"{a:%d.%m}–{b:%d.%m.%Y}" if a.year == b.year else f"{a:%d.%m.%Y}–{b:%d.%m.%Y}"


def gap_months(months: list) -> str:
    """[2014-09 … 2024-09, 2025-09 … 2026-08] → «с 09.2014 по 08.2026; нет данных за 10.2024–08.2025»."""
    mm = lambda ym: f"{ym[5:7]}.{ym[:4]}"
    idx = lambda ym: int(ym[:4]) * 12 + int(ym[5:7]) - 1
    ym = lambda i: f"{i // 12}-{i % 12 + 1:02d}"
    holes = [(ym(idx(a) + 1), ym(idx(b) - 1)) for a, b in zip(months, months[1:]) if idx(b) - idx(a) > 1]
    text = f"с {mm(months[0])} по {mm(months[-1])}"
    if holes:
        text += "; нет данных за " + ", ".join(mm(a) if a == b else f"{mm(a)}–{mm(b)}" for a, b in holes)
    return text


MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября",
              "ноября", "декабря"]
MONTHS_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь",
              "ноябрь", "декабрь"]


def month_ru(ym: str, case: list) -> str:
    """2025-09 → «сентября 2025» / «сентябрь 2025»"""
    y, m = ym.split("-")
    return f"{case[int(m) - 1]} {y}"


# ---------- проверка пулов ----------

def gap_ok(lead: float, other: float, gap: dict, ask: str) -> bool:
    """Обманка other годится к ответу lead: все заданные пороги сразу (как gapOk в statQuestions.ts)."""
    d = lead - other if ask == "max" else other - lead
    if d <= 0:
        return False
    if "abs" in gap and d < gap["abs"] - 1e-9:
        return False
    if "rel" in gap:
        base = abs(other) if ask == "max" else abs(lead)
        if base <= 0 or d < gap["rel"] * base - 1e-9:
            return False
    if "band" in gap:
        lo_k, hi_k = gap["band"]
        hi, lo = (lead, other) if ask == "max" else (other, lead)
        if lo <= 0 or not (lo_k * hi - 1e-9 <= lo <= hi_k * hi + 1e-9):
            return False
    return True


def leaders(entries: list, gap: dict, ask: str, exclusive: list | None = None) -> int:
    """Сколько вариантов могут быть ответом: у них ≥ 3 подходящие обманки, без пар компонент / улучшение между собой
    (с exclusive — точно, перебором троек: пулы с exclusive малы, это предметы)."""
    bad = {frozenset(x) for x in exclusive or []}

    def can_lead(e):
        rivals = [o for o in entries if gap_ok(e[1], o[1], gap, ask) and frozenset((e[0], o[0])) not in bad]
        if not bad:
            return len(rivals) >= 3
        return any(all(frozenset((a[0], b[0])) not in bad for a, b in combinations(trio, 2))
                   for trio in combinations(rivals, 3))
    return sum(1 for e in entries if can_lead(e))


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
        ex = sub.get("exclusive")
        for p in sub["pools"]:
            p["asks"] = [a for a in p["asks"]
                         if len(p["entries"]) >= 4 and leaders(p["entries"], sub["gap"], a["ask"], ex)]
        sub["pools"] = [p for p in sub["pools"] if p["asks"]]
        if "closest" in sub and not sub["closest"]["pools"]:
            del sub["closest"]
        if sub["pools"] or sub.get("closest"):
            self.subs.append(sub)


def closest_part(pools: list, unit: str | None = None, comment: str | None = None) -> dict:
    """Часть «кто ближе» подкатегории: пулы {subject, text, answer}, единица и комментарий (если не как у MC)."""
    out = {"pools": pools}
    if unit:
        out["unit"] = unit
    if comment:
        out["comment"] = comment
    return out


# ---------- подкатегории ----------

def avg_subs(bank: Bank, snap: Path) -> None:
    rows = load(snap / "stratz/hero_avg.json")["rows"]
    weeks = load(snap / "stratz/hero_avg.json")["weeks"]
    window = f"STRATZ, {weeks_span(weeks)}, все ранги"

    def pool(field, ask, text, take, exclude=(), fmt=sig3, where=None):
        rs = [r for r in rows if r["hero"] not in exclude and r.get(field) is not None and (where is None or where(r))]
        if take == "top":
            rs = half(rs, lambda r: r[field], True)
        elif take == "bottom":
            rs = half(rs, lambda r: r[field], False)
        return mc_pool([[r["hero"], round(r[field], 2), fmt(r[field])] for r in rs], (ask, text))

    p = bank.patch
    heal_ok = lambda r: r["healingAllies"] >= HEAL_ALLIES_MIN

    def near(field, text, unit=None, digits=0, where=None):
        """«Кто ближе» по каждому герою: text(герой) — вопрос; ответ округлён до digits знаков после точки."""
        rs = [r for r in rows if r.get(field) is not None and (where is None or where(r))]
        return closest_part([{"subject": r["hero"], "text": text(r["hero"]),
                              "answer": round(r[field], digits) if digits else round(r[field])} for r in rs], unit)

    # «кто ближе» (2026-10-30): убийства (с точностью 0.1), добивания, урон по героям и строениям, хил союзникам
    # (герои от HEAL_ALLIES_MIN, как в MC); самолечения нет — число неинтуитивное. Выбросов в этих полях нет: Meepo
    # суммирует клонов только в самолечении, полученном уроне и атаках, здесь он в общем ряду (9.0 убийств, 306
    # добиваний). Единицы — словарь игры («урона», «HP»); у убийств и добиваний единицы нет: слово уже в вопросе,
    # а «7.4 убийств» не по-русски
    specs = [
        ("avg_heal_allies", "Средний хил союзникам за матч", [
            pool("healingAllies", "max", "Кто из этих героев в среднем лечит союзников больше всех за матч?", "all",
                 where=heal_ok)],
         near("healingAllies", lambda h: f"Сколько здоровья в среднем восстанавливает {h} союзникам за матч на {p}?",
              "HP", where=heal_ok)),
        ("avg_heal_self", "Среднее самолечение за матч (Meepo не берём — суммирует клонов)", [
            pool("healingSelf", "max", "Кто из этих героев в среднем лечит себя больше всех за матч?", "top",
                 exclude={"Meepo"})], None),
        ("avg_tower", "Средний урон по строениям за матч", [
            pool("towerDamage", "max", "Кто из этих героев в среднем наносит больше всего урона по строениям за матч?",
                 "top")],
         near("towerDamage", lambda h: f"Сколько урона по строениям в среднем наносит {h} за матч на {p}?", "урона")),
        ("avg_hero_damage", "Средний урон по героям за матч", [
            pool("heroDamage", "max", "Кто из этих героев в среднем наносит больше всего урона героям за матч?", "top"),
            pool("heroDamage", "min", "Кто из этих героев в среднем наносит меньше всего урона героям за матч?",
                 "bottom")],
         near("heroDamage", lambda h: f"Сколько урона по героям в среднем наносит {h} за матч на {p}?", "урона")),
        ("avg_kills", "Среднее число убийств за матч", [
            pool("kills", "max", "Кто из этих героев в среднем делает больше всего убийств за матч?", "top"),
            pool("kills", "min", "Кто из этих героев в среднем делает меньше всего убийств за матч?", "bottom")],
         near("kills", lambda h: f"Сколько убийств в среднем делает {h} за матч на {p}?", digits=1)),
        ("avg_cs", "Среднее число добитых крипов за матч", [
            pool("cs", "max", "Кто из этих героев в среднем добивает больше всего крипов за матч?", "top"),
            pool("cs", "min", "Кто из этих героев в среднем добивает меньше всего крипов за матч?", "bottom")],
         near("cs", lambda h: f"Сколько крипов в среднем добивает {h} за матч на {p}?")),
    ]
    gaps = {"avg_heal_allies": HEAL_GAP, "avg_cs": CS_GAP}
    for sid, what, pools, closest in specs:
        sub = {"id": sid, "comment": f"{what} на {p} ({window}).", "gap": gaps.get(sid, AVG_GAP), "note": "count",
               "pools": pools}
        if closest:
            sub["closest"] = closest
        bank.add(sub)


def counter_sub(bank: Bank, snap: Path, names: dict) -> None:
    by_hero = defaultdict(list)
    for h, h2, kind, games, wins, syn in load(snap / "stratz/matchups.json")["rows"]:
        if kind == "vs" and games >= COUNTER_MIN_GAMES and syn is not None:
            by_hero[h].append([names[h2], round(syn, 2), signed(syn)])
    pools = [mc_pool(entries, *((ask, f"Против кого из этих героев {names[h]} выигрывает {word} всего?")
                                for ask, word in (("min", "реже"), ("max", "чаще"))), subject=names[h])
             for h, entries in sorted(by_hero.items()) if len(entries) >= COUNTER_MIN_RIVALS]
    bank.add({"id": "counter",
              "comment": f"Подписи — преимущество героя против соперника в процентных пунктах: винрейт с поправкой "
                         f"на силу обоих (STRATZ, {bank.patch}, все ранги).",
              "gap": COUNTER_GAP, "note": "pp", "pools": pools})


def talent_sub(bank: Bank, snap: Path, names: dict, hero_keys: dict) -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from talent_text import hero_talents, render   # уровни и русский текст — из файлов игры
    slots = hero_talents()
    games = defaultdict(int)
    for r in load(snap / "stratz/talents.json")["rows"]:
        games[(r["hero_id"], r["ability"])] += r["games"]
    pools, missing = [], []
    # entries — в порядке слотов AbilityN файла героя: [20 первый, 20 второй, 25 первый, 25 второй];
    # layout talent_tree — сервер ставит их как в дереве игры: первый слот пары — справа (statQuestions.ts)
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
        pools.append(mc_pool(entries, *((ask, f"Какой из талантов {names[hid]} на 20 и 25 уровнях берут {word} всего?")
                                        for ask, word in (("max", "чаще"), ("min", "реже"))), subject=names[hid]))
    if missing:
        print(f"  таланты: нет текстов или данных STRATZ по всем 4 талантам у {len(missing)} героев")
    bank.add({"id": "talents",
              "comment": f"Доля внутри пары талантов одного уровня (STRATZ, {bank.patch}, все ранги).",
              "gap": TALENT_GAP, "note": "pct0", "layout": "talent_tree", "pools": pools})


def ban_subs(bank: Bank, snap: Path) -> None:
    d = load(snap / "stratz/bans_ranked.json")
    rows = sorted(d["rows"], key=lambda r: -r["ban_rate"])
    win = next(x["window"] for x in load(snap / "stratz/manifest.json")["datasets"] if x["id"] == "bans_ranked_patch")
    comment = (f"Доля рейтинговых матчей, где героя забанили ({bank.patch}, выборка {d['sample_matches']} матчей "
               f"STRATZ за {days_span(win['from'], win['to'])}).")
    top = rows[:30]
    bank.add({"id": "bans", "comment": comment, "gap": BAN_GAP, "note": "pct",
              "pools": [mc_pool([[r["hero"], round(r["ban_rate"], 4), pct(r["ban_rate"])] for r in top],
                                ("max", f"Кого из этих героев чаще всего банят в рейтинге на {bank.patch}?"))]})
    # отдельный id (а не closest внутри bans) — история колод и оценок в Neon уже записана под bans_closest
    bank.add({"id": "bans_closest", "comment": comment, "pools": [], "closest": closest_part(
        [{"subject": r["hero"], "answer": round(100 * r["ban_rate"]),
          "text": f"В каком проценте рейтинговых матчей банят {r['hero']} на {bank.patch}?"}
         for r in rows[:CLOSEST_BAN_TOP]], "%")})


def hero_subs(bank: Bank, snap: Path) -> None:
    od = [r for r in load(snap / "heroes.json")["rows"] if r["window_id"] == "hero_wr_patch" and r["bracket"] == "all"]
    st = load(snap / "stratz/heroes.json")["rows"]
    od_win = load(snap / "manifest.json")
    od_from = ru_date(next(d["window"]["from"] for d in od_win["datasets"] if d["id"] == "hero_wr_patch"))
    p = bank.patch

    def entries(rs, key, fmt):
        return [[r["hero"], round(key(r), 5), fmt(key(r))] for r in rs]

    def top_bottom(rs, key, fmt, text_max, text_min):
        return [mc_pool(entries(half(rs, key, True), key, fmt), ("max", text_max)),
                mc_pool(entries(half(rs, key, False), key, fmt), ("min", text_min))]

    wr = lambda r: r["winrate"]
    bank.add({"id": "hero_wr",
              "comment": f"Винрейт за патч {p} (OpenDota, с {od_from}, все ранги).", "gap": WR_GAP, "note": "pct",
              "pools": top_bottom(od, wr, pct, f"У кого из этих героев самый высокий винрейт на {p}?",
                                  f"У кого из этих героев самый низкий винрейт на {p}?")})

    # винрейт на Immortal убран (2026-10-29): винрейты кучкуются у 50%, варианты выглядят одинаково

    pr = lambda r: r["pick_rate"]
    pick_comment = f"Доля матчей, где героя выбрали (OpenDota, {p} с {od_from}, все ранги)."
    bank.add({"id": "hero_pick", "comment": pick_comment, "gap": PICK_GAP, "note": "pct",
              "pools": top_bottom(od, pr, pct, f"Кого из этих героев чаще всего пикают на {p}?",
                                  f"Кого из этих героев реже всего пикают на {p}?")})
    # отдельный id (а не closest внутри hero_pick) — история колод и оценок в Neon уже записана под hero_pick_closest
    bank.add({"id": "hero_pick_closest", "comment": pick_comment, "pools": [], "closest": closest_part(
        [{"subject": r["hero"], "answer": round(100 * r["pick_rate"]),
          "text": f"В каком проценте матчей пикают {r['hero']} на {p}?"}
         for r in sorted(od, key=pr, reverse=True) if pr(r) >= CLOSEST_PICK_MIN], "%")})

    months = load(snap / "stratz/manifest.json")["datasets"]
    yw = next(d["window"]["months"] for d in months if d["id"] == "hero_year_months")
    # герой, вышедший внутри окна (Largo — 2025-12), в «пиках за год» занижен — не берём
    year = [r for r in st if r["window_id"] == "hero_year_months" and r["bracket"] == "all"
            and (r.get("first_month") or "9999") <= yw[0]]
    # окно — честное: снимок 2026-10-27, а год кончается 2026-08 — «за последний год» было бы неправдой
    span = f"с {month_ru(yw[0], MONTHS_GEN)} по {month_ru(yw[-1], MONTHS_NOM)}"
    bank.add({"id": "hero_pick_year",
              "comment": f"Доля матчей с героем {span} (STRATZ, все ранги).", "gap": PICK_GAP, "note": "pct",
              "pools": top_bottom(year, pr, pct, f"Кого из этих героев чаще всего пикали {span}?",
                                  f"Кого из этих героев реже всего пикали {span}?")})

    aw = next(d["window"]["months"] for d in months if d["id"] == "hero_all_months")
    allm = [r for r in st if r["window_id"] == "hero_all_months" and r["bracket"] == "all"]
    # только верх: внизу — новые герои (Largo, Kez), там вопрос про дату выхода, а не про популярность
    # «с 2014 года» обещало «по сей день», а у STRATZ данные кончаются раньше снимка и с дырой почти в год
    # (10.2024–08.2025) — в тексте годы окна, в комментарии честно: что за месяцы и чего в доле нет
    bank.add({"id": "hero_pick_all",
              "comment": f"Доля матчей с героем по STRATZ {gap_months(aw)} — эти месяцы в долю не входят.",
              "gap": PICK_GAP, "note": "pct",
              "pools": [mc_pool(entries(half(allm, pr, True), pr, pct),
                                ("max", f"Кого из этих героев пикали чаще всего за {aw[0][:4]}–{aw[-1][:4]} годы?"))]})


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
    window = f"STRATZ, {weeks_span(weeks)}"
    p = bank.patch

    # «кто ближе»: доля = покупки / матчи героя. Числа матчей в выборке покупок STRATZ не отдаёт; берём матчи героя
    # в рейтинге (winWeek, 3 недели — он отстаёт), покупки — 5 недель патча. На одной неделе покупки ≈ половина
    # рейтинговых матчей героя (выборка покупок меньше), 5 недель против 3 это почти компенсируют — получается
    # оценка, а не точная доля; пары выше CLOSEST_ITEM_MAX (Blink у Tidehunter — 102%) выкидываются
    # (docs/questions/stratz-research.md, «Знаменатель предметов»)
    games = {r["hero_id"]: r["games"] for r in load(snap / "stratz/heroes.json")["rows"]
             if r["window_id"] == "hero_wr_patch_weeks" and r["bracket"] == "all" and r["position"] is None}
    gweeks = next(d["window"]["weeks"] for d in load(snap / "stratz/manifest.json")["datasets"]
                  if d["id"] == "hero_wr_patch_weeks")
    share_ok = lambda x: CLOSEST_ITEM_MIN <= x <= CLOSEST_ITEM_MAX
    near_comment = (f"Оценка: покупки предмета за патч {p} ({window}) к матчам в рейтинге ({weeks_span(gweeks)}) — "
                    f"STRATZ не даёт числа матчей в выборке покупок.")

    glob = sorted((r for r in rows if r["hero_id"] is None and good(r)), key=lambda r: -r["purchases"])[:30]
    slots = sum(games.values())   # игроко-матчи: у каждого героя в матче свой слот
    bank.add({"id": "items",
              "comment": f"Число покупок за патч {p} ({window}; без ботинок и расходников).",
              "gap": ITEM_GAP, "note": "count", "exclusive": upgrade_pairs({r["item"] for r in glob}),
              "pools": [mc_pool([[r["item"], r["purchases"], sig3(r["purchases"])] for r in glob],
                                ("max", f"Какой из этих предметов чаще всего покупают на {p}?"))],
              "closest": closest_part([{"subject": r["item"], "answer": round(100 * r["purchases"] / slots),
                                        "text": f"Сколько процентов игроков покупают {r['item']} за матч на {p}?"}
                                       for r in glob if share_ok(r["purchases"] / slots)], "%", near_comment)})

    by_hero = defaultdict(list)
    for r in rows:
        if r["hero_id"] is not None and good(r):
            by_hero[r["hero_id"]].append(r)
    pools, near = [], []
    for h, rs in sorted(by_hero.items()):
        rs = sorted(rs, key=lambda r: -r["purchases"])[:ITEMS_PER_HERO]
        entries = [[r["item"], r["purchases"], sig3(r["purchases"])] for r in rs]
        pools.append(mc_pool(entries, ("max", f"Какой из этих предметов чаще всего покупают на {names[h]}?"),
                             subject=names[h]))
        # те же законченные предметы (ITEMS_PER_HERO самых покупаемых на герое), что и в MC
        near += [{"subject": names[h], "answer": round(100 * r["purchases"] / games[h]),
                  "text": f"В каком проценте матчей на {names[h]} покупают {r['item']} на {p}?"}
                 for r in rs if games.get(h) and share_ok(r["purchases"] / games[h])]
    bank.add({"id": "items_hero",
              "comment": f"Число покупок на герое за патч {p} ({window}; без ботинок и расходников).",
              "gap": ITEM_HERO_GAP, "note": "count", "pools": pools,
              "exclusive": upgrade_pairs({e[0] for pl in pools for e in pl["entries"]}),
              "closest": closest_part(near, "%", near_comment.replace("к матчам", "к матчам героя"))})


# ---------- main ----------

def report(bank: Bank) -> None:
    rng = random.Random(1)
    print(f"\n{'подкатегория':20} {'режим':7} {'пулов':>5} {'вариантов':>9}  ответов*  с 1-й попытки")
    for s in bank.subs:
        if s.get("closest"):
            cl = s["closest"]["pools"]
            answers = sorted(c["answer"] for c in cl)
            print(f"{s['id']:20} {'closest':7} {len(cl):5}  {len({c['subject'] for c in cl})} карточек, ответы "
                  f"{answers[0]}…{answers[-1]} {s['closest'].get('unit', '')}")
        if not s["pools"]:
            continue
        sizes = [len(p["entries"]) for p in s["pools"]]
        lead = [leaders(p["entries"], s["gap"], a["ask"], s.get("exclusive")) for p in s["pools"] for a in p["asks"]]
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
