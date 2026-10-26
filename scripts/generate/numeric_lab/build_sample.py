#!/usr/bin/env python3
"""
Собирает выборки числовых фактов из снимка scripts/data/dota/. Что есть в игре и роль
способности — из current.json. Модель получает только эти факты и ссылается на них
по fact_id — само число в вопрос подставляет resolve.py, а не модель.

  python scripts/generate/numeric_lab/build_sample.py
    → sample.json        фиксированная выборка героев и предметов (без цен)
    → costs_sample.json  цены всех предметов, которые идут в вопросы (отдельная категория)
  python scripts/generate/numeric_lab/build_sample.py --random 6 6 3 --out sample_step.json
    → случайные герои, предметы и нейтралки (кроме фиксированной выборки)

  python scripts/generate/numeric_lab/build_sample.py --full --out full_sample.json
    → все актуальные герои, предметы, нейтралки и чары (для полного прогона)

Категории — отдельные ключи выборки и отдельные запросы: heroes, items (магазин и улучшения
по рецепту), neutrals (нейтралки), enhancements (чары), costs (цены, в costs_sample.json).

Значения берутся из dotaconstants, а бонусы Aghanim's Scepter / Shard — из сырых файлов
героев (dotaconstants их не выгружает): fact_id вида "<способность>:<ключ>@scepter".
"""

import argparse
import json
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))   # scripts/ → valve_kv
import valve_kv

DOTA  = Path("scripts/data/dota")
GAME  = DOTA / "game"
OUT   = Path(__file__).parent / "sample.json"
COSTS = Path(__file__).parent / "costs_sample.json"

HEROES = ["axe", "tusk", "leshrac", "bounty_hunter", "faceless_void", "kez"]
ITEMS  = ["mjollnir", "shivas_guard", "bloodstone", "kaya", "satanic", "boots_of_bearing", "pipe", "dagon"]

# Категории, которые не спрашиваем: расстояния неинтуитивны
_DISTANCE = re.compile(r"radius|range|distance|width|aoe|area_of_effect|castpoint|cast_point|cast time", re.I)
_MANA_COST = re.compile(r"mana_cost|manacost", re.I)
# Скорость снарядов/полёта — тоже расстояния; оставляем только скорость передвижения/атаки и замедления
_SPEED      = re.compile(r"speed", re.I)
_SPEED_KEEP = re.compile(r"move|movement|attack|slow", re.I)
# Флаги-переключатели в AbilityValues: "applies_battle_hunger" "+1" — не числа для вопроса
_SWITCH = re.compile(r"^(applies|should|is|has|can|does|allow|enable)_", re.I)

UPGRADES = {"special_bonus_scepter": ("scepter", "Aghanim's Scepter"),
            "special_bonus_shard":   ("shard", "Aghanim's Shard")}


def _excluded(key: str, label: str) -> bool:
    text = f"{key} {label}"
    if _DISTANCE.search(text) or _MANA_COST.search(text):
        return True
    if _SPEED.search(text) and not _SPEED_KEEP.search(text):
        return True
    return False


def _values(raw, sep: str = " / ") -> list[float] | None:
    vals = raw if isinstance(raw, list) else str(raw).split(sep)   # "400 / 500 / 600" — значения по уровням
    try:
        # "-65%" → 65, "+12" → 12: знак и процент несут подпись и вопрос, не число
        out = [abs(float(str(v).strip().lstrip("+").rstrip("%"))) for v in vals if str(v).strip()]
    except (TypeError, ValueError):
        return None
    if not out or all(v == 0 for v in out):
        return None
    return out


def _fact(fact_id: str, label: str, raw, hidden: bool = False, sep: str = " / ") -> dict | None:
    vals = _values(raw, sep)
    if vals is None:
        return None
    f = {"fact_id": fact_id, "label": label, "values": [v if v % 1 else int(v) for v in vals]}
    if hidden:
        f["hidden"] = True   # значение не показано в тултипе игры
    return f


def upgrade_facts(key: str, raw_values: dict, headers: dict[str, str]) -> list[dict]:
    """Бонусы Aghanim's Scepter / Shard из AbilityValues сырого файла героя."""
    facts = []
    for vkey, spec in raw_values.items():
        if not isinstance(spec, dict) or _SWITCH.search(vkey) or _excluded(vkey, headers.get(vkey, "")):
            continue
        base = _values(spec.get("value", "0"), sep=" ")
        for field, (tag, item_name) in UPGRADES.items():
            bonus = spec.get(field)
            if bonus is None or str(bonus).strip().startswith("x"):   # множители "x2.5" пропускаем
                continue
            signed = str(bonus).strip()[:1] in "+-"
            label = headers.get(vkey) or {"AbilityCooldown": "COOLDOWN"}.get(vkey, vkey)
            label += (f" — прибавка от {item_name}" if base and signed else f" — значение с {item_name}")
            f = _fact(f"{key}:{vkey}@{tag}", label, bonus, sep=" ")
            if f:
                facts.append(f)
    return facts


def ability_packet(key: str, ab: dict, role: str, raw_values: dict) -> dict | None:
    facts = []
    if ab.get("cd"):
        facts.append(_fact(f"{key}:cd", "COOLDOWN", ab["cd"]))
    headers = {}
    for at in ab.get("attrib", []):
        label = (at.get("header") or at.get("display") or at["key"]).rstrip(":")
        headers[at["key"]] = label
        if _excluded(at["key"], label):
            continue
        facts.append(_fact(f"{key}:{at['key']}", label, at.get("value"), at.get("generated", False)))
    facts += upgrade_facts(key, raw_values, headers)
    facts = [f for f in facts if f]
    if not facts:
        return None
    return {
        "key": key,
        "name": ab.get("dname"),
        "role": role,   # basic / ultimate / innate / shard / scepter
        "desc": ab.get("desc", ""),
        "facts": facts,
    }


def _load() -> dict:
    return {name: json.loads((DOTA / f"{name}.json").read_text(encoding="utf-8"))
            for name in ("heroes", "current", "abilities", "items", "manifest", "aghs_desc")}


def hero_packet(npc: str, d: dict) -> dict:
    raw = valve_kv.parse_file(GAME / f"scripts/npc/heroes/{npc}.txt")["DOTAHeroes"][npc]
    defs = raw.get("AbilityDefinitions", {})
    packets = []
    for entry in d["current"]["heroes"][npc]["abilities"]:
        ab = d["abilities"].get(entry["key"])
        if not ab or entry["role"] not in d["current"]["question_ability_roles"]:
            continue
        raw_values = (defs.get(entry["key"]) or {}).get("AbilityValues", {})
        p = ability_packet(entry["key"], ab, entry["role"], raw_values)
        if p:
            packets.append(p)
    aghs = next((a for a in d["aghs_desc"] if a["hero_name"] == npc), {})
    return {
        "hero": d["current"]["heroes"][npc]["name"],
        "aghanim": {"scepter": aghs.get("scepter_desc"), "shard": aghs.get("shard_desc")},
        "abilities": packets,
    }


def _enhancement_tiers() -> dict[str, dict[int, int]]:
    """Чара → {уровень чары: тир нейтралок}, из neutral_items.txt (каждый уровень — ровно в одном тире)."""
    tiers = valve_kv.parse_file(GAME / "scripts/npc/neutral_items.txt")["neutral_items"]["neutral_tiers"]
    out: dict[str, dict[int, int]] = {}
    for tier, spec in tiers.items():
        for group in spec.get("enhancements", {}).values():
            for name, level in group.items():
                out.setdefault(name[len("item_"):], {}).setdefault(int(level), int(tier))
    return out


def _level_names(ik: str, d: dict) -> list[str] | None:
    entry = d["current"]["items"][ik]
    name = d["items"][ik].get("dname")
    if entry["category"] == "enhancement":
        by_level = _enhancement_tiers().get(ik, {})
        if len(by_level) > 1:
            return [f"чара на нейтралки {by_level[lvl]}-го тира {name}" for lvl in sorted(by_level)]
        return None
    levels = entry.get("levels")
    return [f"{name} {i + 1}" for i in range(len(levels))] if levels else None


def item_packet(ik: str, d: dict) -> dict:
    assert d["current"]["items"][ik]["category"] in d["current"]["question_item_categories"], ik
    it = d["items"][ik]
    facts = []
    if it.get("cd"):
        facts.append(_fact(f"{ik}:cd", "COOLDOWN", it["cd"]))
    for at in it.get("attrib", []):
        label = at.get("display") or at["key"]
        if _excluded(at["key"], label):
            continue
        facts.append(_fact(f"{ik}:{at['key']}", label, at.get("value")))
    packet = {
        "key": ik,
        "name": it.get("dname"),
        "abilities": it.get("abilities", []),
        "notes": it.get("notes", ""),
        "facts": [f for f in facts if f],
    }
    if names := _level_names(ik, d):
        packet["level_names"] = names
    entry = d["current"]["items"][ik]
    if entry["category"] == "neutral":
        packet["call_as"] = f"нейтралка {entry['tier']}-го тира {packet['name']}"
    elif entry["category"] == "enhancement" and "level_names" not in packet:
        tier = next(iter(_enhancement_tiers().get(ik, {}).values()), entry.get("tier"))
        packet["call_as"] = f"чара на нейтралки {tier}-го тира {packet['name']}"
    return packet


def cost_packet(ik: str, d: dict) -> dict | None:
    levels = d["current"]["items"][ik].get("levels", [ik])
    costs = [d["items"][lvl].get("cost") for lvl in levels]
    if not all(costs):
        return None
    it = d["items"][ik]
    packet = {
        "key": ik,
        "name": it.get("dname"),
        "category": d["current"]["items"][ik]["category"],
        "components": it.get("components") or [],
        "facts": [_fact(f"{ik}:cost", "COST (gold)", costs)],
    }
    if names := _level_names(ik, d):
        packet["level_names"] = names
    return packet


NEUTRAL_CATEGORIES = {"neutral", "enhancement"}
SAMPLE_KEY = {"neutral": "neutrals", "enhancement": "enhancements"}   # остальное → items


def build(heroes: list[str] = HEROES, items: list[str] = ITEMS) -> dict:
    """items может содержать нейтралки и чары — они уходят в свои ключи neutrals / enhancements."""
    d = _load()
    packets = {"items": [], "neutrals": [], "enhancements": []}
    for ik in items:
        packets[SAMPLE_KEY.get(d["current"]["items"][ik]["category"], "items")].append(item_packet(ik, d))
    return {
        "patch": d["manifest"]["patch"],
        "heroes": [hero_packet(f"npc_dota_hero_{hk}", d) for hk in heroes],
        **packets,
    }


def pick_random(n_heroes: int, n_items: int, n_neutrals: int) -> tuple[list[str], list[str]]:
    """Случайные герои, предметы и нейтралки/чары из актуальных, кроме фиксированной выборки."""
    d = _load()
    rng = random.SystemRandom()
    heroes = [npc[len("npc_dota_hero_"):] for npc in d["current"]["heroes"]
              if npc[len("npc_dota_hero_"):] not in HEROES]
    cats = set(d["current"]["question_item_categories"])
    pool = [k for k, v in d["current"]["items"].items()
            if v["category"] in cats and k not in ITEMS and item_packet(k, d)["facts"]]
    items = [k for k in pool if d["current"]["items"][k]["category"] not in NEUTRAL_CATEGORIES]
    neutrals = [k for k in pool if d["current"]["items"][k]["category"] == "neutral"]
    return rng.sample(heroes, n_heroes), rng.sample(items, n_items) + rng.sample(neutrals, n_neutrals)


def build_costs() -> dict:
    d = _load()
    cats = set(d["current"]["question_item_categories"])
    keys = sorted(k for k, v in d["current"]["items"].items() if v["category"] in cats)
    return {"patch": d["manifest"]["patch"], "costs": [p for k in keys if (p := cost_packet(k, d))]}


def _count(sample: dict) -> int:
    return sum(len(p["facts"]) for h in sample.get("heroes", []) for p in h["abilities"]) + \
        sum(len(i["facts"]) for k in ("items", "neutrals", "enhancements") for i in sample.get(k, []))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--random", nargs=3, type=int, metavar=("HEROES", "ITEMS", "NEUTRALS"),
                    help="случайная выборка вместо фиксированной")
    ap.add_argument("--full", action="store_true", help="все актуальные сущности всех категорий")
    ap.add_argument("--out", default=OUT.name)
    args = ap.parse_args()
    out = Path(__file__).parent / args.out
    if args.full:
        d = _load()
        cats = set(d["current"]["question_item_categories"])
        heroes = sorted(npc[len("npc_dota_hero_"):] for npc in d["current"]["heroes"])
        items = sorted(k for k, v in d["current"]["items"].items()
                       if v["category"] in cats and item_packet(k, d)["facts"])
        sample = build(heroes, items)
        out.write_text(json.dumps(sample, ensure_ascii=False, indent=1), encoding="utf-8")
        print(", ".join(f"{k}: {len(v)}" for k, v in sample.items() if k != "patch") + f" → {out}")
        return
    if args.random:
        heroes, items = pick_random(*args.random)
        sample = build(heroes, items)
        out.write_text(json.dumps(sample, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"случайно: {', '.join(h['hero'] for h in sample['heroes'])} | "
              f"{', '.join(i['name'] for i in sample['items'])} | "
              f"{', '.join(i['name'] for i in sample['neutrals'])} → {out}")
        return
    sample = build()
    out.write_text(json.dumps(sample, ensure_ascii=False, indent=1), encoding="utf-8")
    upgrades = sum(1 for h in sample["heroes"] for p in h["abilities"] for f in p["facts"] if "@" in f["fact_id"])
    print(f"{len(sample['heroes'])} героев, {len(sample['items'])} предметов, {_count(sample)} фактов "
          f"(из них аганим/шард: {upgrades}) → {out}")
    costs = build_costs()
    COSTS.write_text(json.dumps(costs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"цены: {len(costs['costs'])} предметов → {COSTS}")


if __name__ == "__main__":
    main()
