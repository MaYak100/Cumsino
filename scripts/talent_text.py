#!/usr/bin/env python3
"""
Официальный текст талантов героев (русский и английский) с подставленными числами.

Строки талантов — из локализации игры (scripts/data/dota/game/resource/localization/abilities_*.txt,
ключ DOTA_Tooltip_ability_<талант>), в них плейсхолдеры {s:ИМЯ} (изредка %ИМЯ%). Числа берём из файлов
героев (scripts/data/dota/game/scripts/npc/heroes/):
  {s:bonus_X}  — значение таланта у ключа X в AbilityValues одной из способностей героя:
                 "AbilityChannelTime" { "value" "2.75" "special_bonus_unique_pudge_6" "+0.75" }
  {s:X}        — ключ X в собственном блоке таланта (AbilityDefinitions → special_bonus_… → AbilityValues);
                 если блока нет — то же, что bonus_X
  {s:value}    — у общих талантов (special_bonus_armor_5, special_bonus_mp_regen_150 …) блока в файлах героев
                 нет (они в npc_abilities.txt, которого в снимке нет) — число берём из dname dotaconstants
                 (abilities.json), а если его нет — из суффикса имени. Если же у таланта ровно одна связь
                 со способностью (special_bonus_attack_range_50 у Clinkz) — её значение.
Знак и множитель в значении («+0.75», «-4», «+-10», «x1.5», «=80», «+15%») отбрасываются, число — по модулю:
знак, «x» и «%» уже есть в шаблоне строки (так же показывает игра: «-25.0» у Overload → «+25/25%»).
Если ключ с талантом есть у нескольких способностей с разными числами (Savage Roar героя и медведя),
берём способность из слотов героя.
Valve-разметка (<b>, <font>, \\n, %%) вычищается.

Если какой-то плейсхолдер не разрешился — render() возвращает None (текст с {s:…} наружу не отдаётся).

API:
  render(talent_name, lang="russian") -> str | None
  explain(talent_name, lang="russian") -> (текст | None, причина | None)
  hero_talents() -> {hero_key: [(талант, уровень 1–4)]}   — по слотам AbilityN файла героя
  all_talents() -> {талант: {"hero_key", "level", "ru", "en", "heroes": [{"hero_key", "level"}, …]}}
       level 1–4 = уровни героя 10/15/20/25; общий талант у нескольких героев — одна запись,
       hero_key/level — первого героя, полный список в "heroes"

Использование (из корня репо):
  python scripts/talent_text.py                  # покрытие, сверка чисел (STRATZ, dname dotaconstants, ru↔en),
                                                 # ~30 строк уровней 20/25 для проверки глазами
  python scripts/talent_text.py --json out.json  # выгрузить все таланты
"""

import argparse
import json
import random
import re
import sys
from collections import Counter
from functools import cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import valve_kv  # noqa: E402

SCRIPTS = Path(__file__).resolve().parent
DOTA    = SCRIPTS / "data/dota"
GAME    = DOTA / "game"
HEROES  = GAME / "scripts/npc/heroes"
LOC     = GAME / "resource/localization"
STRATZ  = SCRIPTS / "data/stats"   # <снимок>/stratz/talents.json, берём последний

TOKEN_PREFIX = "dota_tooltip_ability_"
_PLACEHOLDER = re.compile(r"\{s:([A-Za-z0-9_]+)\}|%([A-Za-z_][A-Za-z0-9_]*)%")
_NUMBER = re.compile(r"\d*\.?\d+")


# ─── Загрузка данных ─────────────────────────────────────────────────────────

@cache
def _tokens(lang: str) -> dict[str, str]:
    """Строки локализации, ключи в нижнем регистре (Valve сравнивает токены без учёта регистра)."""
    text = (LOC / f"abilities_{lang}.txt").read_text(encoding="utf-8-sig", errors="replace")
    tokens = valve_kv.parse(text)["lang"]["Tokens"]
    return {k.lower(): v for k, v in tokens.items() if isinstance(v, str)}


@cache
def _heroes() -> dict[str, dict]:
    """hero_key → сырой блок героя из его файла."""
    result = {}
    for path in sorted(HEROES.glob("npc_dota_hero_*.txt")):
        for key, hero in valve_kv.parse_file(path).get("DOTAHeroes", {}).items():
            if isinstance(hero, dict) and key.startswith("npc_dota_hero_"):
                result[key] = hero
    return result


@cache
def _index() -> tuple[dict, dict]:
    """
    links[талант] — [(hero_key, способность, ключ, сырое значение)] из AbilityValues способностей;
    own[талант]   — AbilityValues собственного блока таланта (ключи в нижнем регистре).
    """
    links: dict[str, list] = {}
    own: dict[str, dict] = {}
    for hero_key, hero in _heroes().items():
        for ab_name, ab in hero.get("AbilityDefinitions", {}).items():
            if not isinstance(ab, dict):
                continue
            values = ab.get("AbilityValues", {})
            if ab_name.startswith("special_bonus"):
                own.setdefault(ab_name, {}).update(
                    {k.lower(): v for k, v in values.items()} if isinstance(values, dict) else {})
                continue
            if not isinstance(values, dict):
                continue
            for key, spec in values.items():
                if not isinstance(spec, dict):
                    continue
                for sub, raw in spec.items():
                    if sub.startswith("special_bonus") and isinstance(raw, str):
                        links.setdefault(sub, []).append((hero_key, ab_name, key, raw))
    return links, own


@cache
def _constants() -> dict:
    return json.loads((DOTA / "abilities.json").read_text(encoding="utf-8"))


@cache
def hero_talents() -> dict[str, list[tuple[str, int]]]:
    """hero_key → [(талант, уровень 1–4)] по слотам AbilityN файла героя (пары слотов = уровни 10/15/20/25)."""
    result = {}
    for hero_key, hero in _heroes().items():
        slots = sorted((int(k[7:]), v) for k, v in hero.items()
                       if re.fullmatch(r"Ability\d+", k) and isinstance(v, str))
        talents = [v for _, v in slots if v.startswith("special_bonus") and v != "special_bonus_attributes"]
        result[hero_key] = [(t, i // 2 + 1) for i, t in enumerate(talents[:8])]
    return result


@cache
def _slot_abilities(talent: str) -> frozenset[str]:
    """Способности из слотов AbilityN героев, у которых есть этот талант."""
    result = set()
    for hero_key, talents in hero_talents().items():
        if any(t == talent for t, _ in talents):
            result |= {v for k, v in _heroes()[hero_key].items()
                       if re.fullmatch(r"Ability\d+", k) and isinstance(v, str)}
    return frozenset(result)


# ─── Числа ───────────────────────────────────────────────────────────────────

def _fmt(x: float) -> str:
    s = f"{x:.4f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def _parse_value(raw) -> list[float] | None:
    """«+0.75» → [0.75]; «+-10» → [-10]; «x1.5» → [1.5]; «=80 =120» → [80, 120]; «+15%» → [15]."""
    if isinstance(raw, dict):
        raw = raw.get("value")
    if not isinstance(raw, str):
        return None
    out = []
    for tok in raw.split():
        m = re.fullmatch(r"[+=x×]*(-?)[+]*(\d*\.?\d+)%?", tok.strip())
        if not m:
            return None
        out.append(-float(m.group(2)) if m.group(1) else float(m.group(2)))
    return out or None


def _generic_value(talent: str) -> list[float] | None:
    """Общий талант без блока в файлах героев: число из dname dotaconstants, иначе из суффикса имени."""
    dname = _constants().get(talent, {}).get("dname") or ""
    nums = _NUMBER.findall(dname)
    if len(nums) == 1:
        return [float(nums[0])]
    m = re.search(r"_(\d+)$", talent)
    if m and not talent.startswith("special_bonus_unique"):
        return [float(m.group(1))]
    return None


def _resolve(talent: str, name: str) -> tuple[list[float] | None, str]:
    """Значение плейсхолдера; второй элемент — откуда взято или почему не нашлось."""
    links, own = _index()
    lname = name.lower()
    candidates = [lname[6:]] if lname.startswith("bonus_") else []
    candidates.append(lname)

    block = own.get(talent, {})
    for key in candidates:
        if key in block:
            return _parse_value(block[key]), "own"

    talent_links = links.get(talent, [])
    for key in candidates:
        found = [raw for _, _, k, raw in talent_links if k.lower() == key]
        if found:
            parsed = [_parse_value(r) for r in found]
            if any(p != parsed[0] for p in parsed):
                own_slots = _slot_abilities(talent)
                parsed = [_parse_value(raw) for _, ab, k, raw in talent_links
                          if k.lower() == key and ab in own_slots]
                if not parsed or any(p != parsed[0] for p in parsed):
                    return None, f"разные значения {key}: {found}"
            return parsed[0], "link"

    if lname == "value":
        if len({raw for *_, raw in talent_links}) == 1:
            return _parse_value(talent_links[0][3]), "single-link"
        if not talent.startswith("special_bonus_unique") and talent not in links:
            v = _generic_value(talent)
            if v:
                return v, "generic"
    where = f"ключи связей: {sorted({k for _, _, k, _ in talent_links})}" if talent_links else "нет связей"
    if block:
        where += f", свой блок: {sorted(block)}"
    return None, f"{{s:{name}}} не найден ({where})"


# ─── Рендер ──────────────────────────────────────────────────────────────────

def _clean(text: str) -> str:
    text = text.replace("\\n", " ").replace("\n", " ").replace("%%", "%")
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s{2,}", " ", text).strip()


def explain(talent_name: str, lang: str = "russian") -> tuple[str | None, str | None]:
    """(текст, None) или (None, причина неудачи)."""
    template = _tokens(lang).get(TOKEN_PREFIX + talent_name.lower())
    if template is None and lang != "english":
        template = _tokens("english").get(TOKEN_PREFIX + talent_name.lower())
        if template is not None:
            return None, f"нет строки в {lang}"
    if template is None:
        return None, "нет строки локализации"

    out, pos = [], 0
    for m in _PLACEHOLDER.finditer(template):
        name = m.group(1) or m.group(2)
        values, why = _resolve(talent_name, name)
        if not values:
            return None, why
        out.append(template[pos:m.start()] + " / ".join(_fmt(abs(v)) for v in values))
        pos = m.end()
    out.append(template[pos:])
    text = _clean("".join(out))
    if "{s:" in text:
        return None, "остался плейсхолдер"
    return text, None


def render(talent_name: str, lang: str = "russian") -> str | None:
    return explain(talent_name, lang)[0]


def all_talents() -> dict[str, dict]:
    result: dict[str, dict] = {}
    for hero_key, talents in hero_talents().items():
        for talent, level in talents:
            entry = result.get(talent)
            if entry is None:
                entry = result[talent] = {"hero_key": hero_key, "level": level,
                                          "ru": render(talent, "russian"), "en": render(talent, "english"),
                                          "heroes": []}
            entry["heroes"].append({"hero_key": hero_key, "level": level})
    return result


# ─── Сверка и отчёт ──────────────────────────────────────────────────────────

def _stratz() -> dict[tuple[str, str], str]:
    """(hero_key, талант) → английский текст STRATZ из последнего снимка."""
    snaps = sorted(STRATZ.glob("*/stratz/talents.json"))
    if not snaps:
        return {}
    heroes = json.loads((DOTA / "heroes.json").read_text(encoding="utf-8"))
    by_id = {h["id"]: h["name"] for h in heroes.values()}
    rows = json.loads(snaps[-1].read_text(encoding="utf-8"))["rows"]
    return {(by_id.get(r["hero_id"]), r["ability"]): r["talent"] for r in rows if r.get("talent")}


def _numbers(text: str) -> list[float]:
    return sorted(float(n) for n in _NUMBER.findall(text.replace(",", ".")))


def report(sample: int = 30, seed: int = 7) -> None:
    stratz = _stratz()
    rows = [(hero_key, talent, level) for hero_key, ts in hero_talents().items() for talent, level in ts]
    print(f"Талантов у героев: {len(rows)} (уникальных {len({t for _, t, _ in rows})}), героев {len(hero_talents())}")

    fails: list[tuple] = []
    checks = {"STRATZ": [], "dotaconstants": [], "ru↔en": []}   # расхождения чисел
    checked: Counter = Counter()
    ok_by_level: Counter = Counter()
    total_by_level: Counter = Counter()
    for hero_key, talent, level in rows:
        total_by_level[level] += 1
        ru, why_ru = explain(talent, "russian")
        en, _ = explain(talent, "english")
        if ru is None:
            fails.append((hero_key, level, talent, why_ru))
            continue
        ok_by_level[level] += 1
        refs = {"STRATZ": stratz.get((hero_key, talent)),
                "dotaconstants": _constants().get(talent, {}).get("dname"),
                "ru↔en": ru}
        for name, theirs in refs.items():
            if en and theirs:
                checked[name] += 1
                if _numbers(en) != _numbers(theirs):
                    checks[name].append((level, talent, en, theirs))

    print("\nОтрендерено (ru) по уровням:")
    for level in sorted(total_by_level):
        ok, total = ok_by_level[level], total_by_level[level]
        print(f"  ур. {level} ({5 + 5 * level:>2}): {ok}/{total}  {100 * ok / total:.1f}%")
    late_ok = ok_by_level[3] + ok_by_level[4]
    late_total = total_by_level[3] + total_by_level[4]
    print(f"  20/25 вместе: {late_ok}/{late_total}  {100 * late_ok / late_total:.1f}%")

    if fails:
        print(f"\nНе отрендерено ({len(fails)}):")
        reasons = Counter(re.sub(r"\{s:[^}]+\}", "{s:…}", why.split(" (")[0].split(":")[0]) for *_, why in fails)
        for why, n in reasons.most_common():
            print(f"  {n:>3}  {why}")
        for hero_key, level, talent, why in fails:
            print(f"    ур.{level} {talent:<58} {why}")

    print("\nСверка чисел (en против источника; слова не сравниваются):")
    for name, bad in checks.items():
        print(f"  {name:<14} проверено {checked[name]:>4}, расхождений {len(bad)}")
    for name, bad in checks.items():
        for level, talent, en, theirs in bad:
            print(f"    [{name}] ур.{level} {talent:<50} наш: {en!r}  у них: {theirs!r}")

    rng = random.Random(seed)
    late = [r for r in rows if r[2] >= 3]
    picked = rng.sample(late, min(sample, len(late)))
    print(f"\nВыборка уровней 20/25 ({len(picked)}): талант | ru | STRATZ en")
    for hero_key, talent, level in picked:
        print(f"  {talent} | {render(talent) or '—'} | {stratz.get((hero_key, talent)) or '—'}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--json", metavar="PATH", help="выгрузить все таланты в JSON")
    ap.add_argument("--sample", type=int, default=30, help="сколько строк показать для проверки глазами")
    args = ap.parse_args()
    if args.json:
        data = all_talents()
        Path(args.json).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        done = sum(1 for v in data.values() if v["ru"])
        print(f"{args.json}: {len(data)} талантов, отрендерено {done}")
        return
    report(args.sample)


if __name__ == "__main__":
    main()
