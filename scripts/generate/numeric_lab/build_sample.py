#!/usr/bin/env python3
"""
Собирает фиксированную выборку героев и предметов со списком числовых фактов
из снимка scripts/data/dota/. Что есть в игре и роль способности — из current.json. Модель получает только эти факты и ссылается на них
по fact_id — само число в вопрос подставляет resolve.py, а не модель.

  python scripts/generate/numeric_lab/build_sample.py   → numeric_lab/sample.json
"""

import json
import re
from pathlib import Path

DOTA = Path("scripts/data/dota")
OUT  = Path(__file__).parent / "sample.json"

HEROES = ["axe", "tusk", "leshrac", "bounty_hunter", "faceless_void", "kez"]
ITEMS  = ["mjollnir", "shivas_guard", "bloodstone", "kaya", "satanic", "boots_of_bearing", "pipe"]

# Категории, которые не спрашиваем: расстояния неинтуитивны
_DISTANCE = re.compile(r"radius|range|distance|width|aoe|area_of_effect|castpoint|cast_point|cast time", re.I)
# Скорость снарядов/полёта — тоже расстояния; оставляем только скорость передвижения/атаки и замедления
_SPEED      = re.compile(r"speed", re.I)
_SPEED_KEEP = re.compile(r"move|movement|attack|slow", re.I)


def _excluded(key: str, label: str) -> bool:
    text = f"{key} {label}"
    if _DISTANCE.search(text):
        return True
    if _SPEED.search(text) and not _SPEED_KEEP.search(text):
        return True
    return False


def _values(raw) -> list[float] | None:
    vals = raw if isinstance(raw, list) else [raw]
    try:
        # "-65%" → 65: знак и процент несут подпись и вопрос, не число
        out = [abs(float(str(v).strip().rstrip("%"))) for v in vals]
    except (TypeError, ValueError):
        return None
    if all(v == 0 for v in out):
        return None
    return out


def _fact(fact_id: str, label: str, raw, hidden: bool = False) -> dict | None:
    vals = _values(raw)
    if vals is None:
        return None
    f = {"fact_id": fact_id, "label": label, "values": [v if v % 1 else int(v) for v in vals]}
    if hidden:
        f["hidden"] = True   # значение не показано в тултипе игры
    return f


def ability_packet(key: str, ab: dict, role: str) -> dict | None:
    facts = []
    if ab.get("cd"):
        facts.append(_fact(f"{key}:cd", "COOLDOWN", ab["cd"]))
    for at in ab.get("attrib", []):
        label = at.get("header") or at.get("display") or at["key"]
        if _excluded(at["key"], label):
            continue
        facts.append(_fact(f"{key}:{at['key']}", label.rstrip(":"), at.get("value"), at.get("generated", False)))
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


def build() -> dict:
    heroes_raw = json.loads((DOTA / "heroes.json").read_text(encoding="utf-8"))
    current    = json.loads((DOTA / "current.json").read_text(encoding="utf-8"))
    abilities  = json.loads((DOTA / "abilities.json").read_text(encoding="utf-8"))
    items      = json.loads((DOTA / "items.json").read_text(encoding="utf-8"))
    manifest   = json.loads((DOTA / "manifest.json").read_text(encoding="utf-8"))

    names = {h["name"]: h["localized_name"] for h in heroes_raw.values()}

    heroes = []
    for hk in HEROES:
        npc = f"npc_dota_hero_{hk}"
        packets = []
        for entry in current["heroes"][npc]["abilities"]:
            ab = abilities.get(entry["key"])
            if not ab or entry["role"] not in current["question_ability_roles"]:
                continue
            p = ability_packet(entry["key"], ab, entry["role"])
            if p:
                packets.append(p)
        heroes.append({"hero": names[npc], "abilities": packets})

    item_packets = []
    for ik in ITEMS:
        assert current["items"][ik]["category"] in current["question_item_categories"], ik
        it = items[ik]
        facts = []
        if it.get("cost"):
            facts.append(_fact(f"{ik}:cost", "COST (gold)", it["cost"]))
        if it.get("cd"):
            facts.append(_fact(f"{ik}:cd", "COOLDOWN", it["cd"]))
        for at in it.get("attrib", []):
            label = at.get("display") or at["key"]
            if _excluded(at["key"], label):
                continue
            facts.append(_fact(f"{ik}:{at['key']}", label, at.get("value")))
        item_packets.append({
            "key": ik,
            "name": it.get("dname"),
            "abilities": it.get("abilities", []),
            "notes": it.get("notes", ""),
            "facts": [f for f in facts if f],
        })

    return {"patch": manifest["patch"], "heroes": heroes, "items": item_packets}


def main() -> None:
    sample = build()
    OUT.write_text(json.dumps(sample, ensure_ascii=False, indent=1), encoding="utf-8")
    n = sum(len(p["facts"]) for h in sample["heroes"] for p in h["abilities"]) + \
        sum(len(i["facts"]) for i in sample["items"])
    print(f"{len(sample['heroes'])} героев, {len(sample['items'])} предметов, {n} фактов → {OUT}")


if __name__ == "__main__":
    main()
