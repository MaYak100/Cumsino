#!/usr/bin/env python3
"""
Строит scripts/data/dota/current.json — список того, что СЕЙЧАС есть в игре.

dotaconstants хранит и вырезанные предметы/способности (поля просто перестают обновляться),
поэтому опираемся на сырые файлы игры из scripts/data/dota/game/:

Предметы (категория → в вопросы ли):
  shop          — в магазине (shops.txt)                                   да
  upgrade       — улучшение по рецепту вне магазина (BoT 2)                да
  level         — уровень другого предмета (Dagon 2–5 → уровни Dagon)      нет, идёт значениями базового
  neutral       — нейтралка текущих тиров (neutral_items.txt)             да
  enhancement   — улучшение нейтралки (enhancements)                       да
  roshan        — дроп Рошана                                              нет
  removed       — IsObsolete или нейтралка, которой нет в текущих тирах    нет
  other         — служебное/ивентовое (курьер, токены, половинка танго…)   нет

Способности героев — слоты Ability1..N из файла героя, роль из AbilityDefinitions:
  basic, ultimate, innate, shard, scepter — в вопросы
  sub     — служебная кнопка (Stop/Release/Cancel…), скрытая и не из драфта — нет
  review  — не из драфта и не качается по уровням — нет, пока не решено вручную

Ручные решения — scripts/data/dota_overrides.json, переживают обновления патча.

  python scripts/build_game_index.py
"""

import json
import re
from pathlib import Path

import valve_kv

DOTA      = Path("scripts/data/dota")
GAME      = DOTA / "game"
OUT       = DOTA / "current.json"
OVERRIDES = Path("scripts/data/dota_overrides.json")

ROSHAN = {"aegis", "cheese", "refresher_shard", "aghanims_shard_roshan", "ultimate_scepter_roshan"}
# Предметы с уровнями: в вопросах это один предмет, значения по уровням как у способностей
LEVELLED_ITEMS = {"dagon": ["dagon", "dagon_2", "dagon_3", "dagon_4", "dagon_5"]}
_LEVEL_OF = {lvl: base for base, lvls in LEVELLED_ITEMS.items() for lvl in lvls[1:]}
QUESTION_ITEM_CATEGORIES    = {"shop", "upgrade", "neutral", "enhancement"}
QUESTION_ABILITY_ROLES      = {"basic", "ultimate", "innate", "shard", "scepter"}


def _strip(name: str) -> str:
    return name[5:] if name.startswith("item_") else name


# ─── Предметы ────────────────────────────────────────────────────────────────

def classify_items(overrides: dict) -> dict[str, dict]:
    raw = valve_kv.parse_file(GAME / "scripts/npc/items.txt")["DOTAAbilities"]
    constants = json.loads((DOTA / "items.json").read_text(encoding="utf-8"))

    shop = {_strip(n) for n in re.findall(r'"(item_[a-z0-9_]+)"',
                                          (GAME / "scripts/shops.txt").read_text(encoding="utf-8"))}

    tiers = valve_kv.parse_file(GAME / "scripts/npc/neutral_items.txt")["neutral_items"]["neutral_tiers"]
    neutral: dict[str, int] = {}
    enhancement: dict[str, int] = {}
    for tier, spec in tiers.items():
        for n in spec.get("items", {}):
            neutral.setdefault(_strip(n), int(tier))
        for group in spec.get("enhancements", {}).values():
            for n in group:
                enhancement.setdefault(_strip(n), int(tier))

    upgrades = set()
    for key, v in raw.items():
        if isinstance(v, dict) and v.get("ItemRecipe") == "1" and v.get("IsObsolete") != "1":
            upgrades.add(_strip(v.get("ItemResult", "")))

    result: dict[str, dict] = {}
    for name, item in constants.items():
        if name.startswith("recipe_"):
            continue
        v = raw.get(f"item_{name}")
        entry: dict = {"name": item.get("dname") or name}
        if v is None:
            entry["category"] = "removed"
            entry["why"] = "нет в items.txt"
        elif v.get("IsObsolete") == "1":
            entry["category"] = "removed"
            entry["why"] = "IsObsolete"
        elif name in _LEVEL_OF:
            entry["category"] = "level"
            entry["level_of"] = _LEVEL_OF[name]
        elif name in shop:
            entry["category"] = "shop"
        elif name in neutral:
            entry["category"] = "neutral"
            entry["tier"] = neutral[name]
        elif name in enhancement:
            entry["category"] = "enhancement"
            entry["tier"] = enhancement[name]
        elif name in ROSHAN:
            entry["category"] = "roshan"
        elif v.get("ItemIsNeutralActiveDrop") == "1" or v.get("ItemIsNeutralPassiveDrop") == "1":
            entry["category"] = "removed"
            entry["why"] = "нейтралка вне текущих тиров"
        elif name in upgrades and v.get("ItemPurchasable", "1") != "0":
            entry["category"] = "upgrade"
        else:
            entry["category"] = "other"
        if name in LEVELLED_ITEMS:
            entry["levels"] = LEVELLED_ITEMS[name]
        result[name] = entry

    for name, cat in overrides.get("items", {}).items():
        if name in result:
            result[name]["category"] = cat
            result[name]["override"] = True
    return result


# ─── Способности героев ──────────────────────────────────────────────────────

def _behaviors(ab: dict) -> list[str]:
    b = ab.get("behavior") or []
    return b if isinstance(b, list) else [b]


def _scales_with_level(ab: dict) -> bool:
    """Служебные кнопки (Toggle/Release) не качаются; настоящие способности — да."""
    lists = [ab.get("cd")] + [a.get("value") for a in ab.get("attrib", [])]
    return any(isinstance(v, list) and len(set(v)) > 1 for v in lists)


def classify_hero(hero_key: str, constants_abilities: dict, overrides: dict) -> dict:
    raw = valve_kv.parse_file(GAME / f"scripts/npc/heroes/{hero_key}.txt")["DOTAHeroes"][hero_key]
    defs = raw.get("AbilityDefinitions", {})

    slots = [v for _, v in sorted((int(k[7:]), v) for k, v in raw.items()
                                  if re.fullmatch(r"Ability\d+", k) and isinstance(v, str))]

    # В драфте пары через запятую: "kez_echo_slash,kez_falcon_rush_ad"
    draft = {a for v in raw.get("AbilityDraftAbilities", {}).values() for a in v.split(",")}
    for d in defs.values():
        if isinstance(d, dict):
            draft |= set(d.get("AbilityDraftExtraAbilities", {}))
    draft_names = {constants_abilities.get(a, {}).get("dname") for a in draft} - {None}

    abilities = []
    for name in slots:
        if not name or name.startswith("special_bonus") or name == "generic_hidden":
            continue
        d = defs.get(name, {}) if isinstance(defs.get(name), dict) else {}
        const = constants_abilities.get(name, {})
        if d.get("MaxLevel") == "0":
            continue   # пустые слоты Invoker/Rubick/Doom
        in_draft = name in draft or f"{name}_ad" in draft or const.get("dname") in draft_names
        if d.get("Innate") == "1" or const.get("is_innate"):
            role = "innate"
        elif d.get("IsGrantedByShard") == "1":
            role = "shard"
        elif d.get("IsGrantedByScepter") == "1":
            role = "scepter"
        elif d.get("AbilityType") == "ABILITY_TYPE_ULTIMATE":
            role = "ultimate"
        elif in_draft:
            role = "basic"
        elif "Hidden" in _behaviors(const):
            role = "sub"
        elif _scales_with_level(const):
            role = "basic"
        else:
            role = "review"
        role = overrides.get("abilities", {}).get(name, role)
        abilities.append({"key": name, "name": const.get("dname") or name, "role": role})
    return {"abilities": abilities}


def classify_heroes(overrides: dict) -> dict[str, dict]:
    heroes = json.loads((DOTA / "heroes.json").read_text(encoding="utf-8"))
    constants_abilities = json.loads((DOTA / "abilities.json").read_text(encoding="utf-8"))
    result = {}
    for h in sorted(heroes.values(), key=lambda h: h["localized_name"]):
        result[h["name"]] = {"name": h["localized_name"],
                             **classify_hero(h["name"], constants_abilities, overrides)}
    return result


# ─── Сборка ──────────────────────────────────────────────────────────────────

def _summary(index: dict) -> dict[str, set]:
    return {
        "items": {k for k, v in index["items"].items() if v["category"] in QUESTION_ITEM_CATEGORIES},
        "abilities": {a["key"] for h in index["heroes"].values() for a in h["abilities"]
                      if a["role"] in QUESTION_ABILITY_ROLES},
    }


def main() -> None:
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    manifest = json.loads((DOTA / "manifest.json").read_text(encoding="utf-8"))

    index = {
        "patch": manifest["patch"],
        "question_item_categories": sorted(QUESTION_ITEM_CATEGORIES),
        "question_ability_roles": sorted(QUESTION_ABILITY_ROLES),
        "items": classify_items(overrides),
        "heroes": classify_heroes(overrides),
    }

    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else None
    OUT.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    from collections import Counter
    cats = Counter(v["category"] for v in index["items"].values())
    roles = Counter(a["role"] for h in index["heroes"].values() for a in h["abilities"])
    print(f"current.json ({index['patch']})")
    print("  предметы:    " + ", ".join(f"{k} {v}" for k, v in cats.most_common()))
    print("  способности: " + ", ".join(f"{k} {v}" for k, v in roles.most_common()))

    review = [(h["name"], a["name"], a["key"]) for h in index["heroes"].values()
              for a in h["abilities"] if a["role"] == "review"]
    if review:
        print(f"\n  Требуют решения ({len(review)}) — впиши роль в {OVERRIDES}:")
        for hero, name, key in review:
            print(f"    {hero:<20} {name:<32} {key}")

    if old:
        before, after = _summary(old), _summary(index)
        for kind in ("items", "abilities"):
            gone, new = before[kind] - after[kind], after[kind] - before[kind]
            if gone or new:
                print(f"\n  {kind}: ушло из вопросов {sorted(gone)}, добавилось {sorted(new)}")


if __name__ == "__main__":
    main()
