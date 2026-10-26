#!/usr/bin/env python3
"""
Скачивает игровые данные Dota 2 и фиксирует снимок с версией патча.

Два источника, оба на конкретном коммите:
  odota/dotaconstants  → scripts/data/dota/*.json        (разобранные данные: значения, описания)
  dotabuff/d2vpkr      → scripts/data/dota/game/...       (сырые файлы игры: что сейчас в игре)

dotaconstants не удаляет вырезанные предметы и способности, поэтому «что есть в игре»
определяем по сырым файлам: магазин, нейтралки, слоты героев (см. build_game_index.py).

Использование (из корня репо):
  python scripts/fetch_dota_data.py
  python scripts/fetch_dota_data.py --constants-ref <sha> --vpk-ref <sha>

В конце пересобирает scripts/data/dota/current.json и печатает, что изменилось.
"""

import argparse
import hashlib
import json
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import build_game_index

CONSTANTS_REPO = "odota/dotaconstants"
VPK_REPO       = "dotabuff/d2vpkr"
RAW_URL        = "https://raw.githubusercontent.com/{repo}/{ref}/{path}"
OUT_DIR        = Path("scripts/data/dota")
GAME_DIR       = OUT_DIR / "game"

CONSTANTS_FILES = [
    "heroes.json",
    "hero_abilities.json",   # герой → способности + таланты
    "abilities.json",
    "aghs_desc.json",        # описания Aghanim's Scepter / Shard
    "items.json",
    "patch.json",
    "patchnotes.json",
]

VPK_FILES = [
    "dota/scripts/npc/items.txt",
    "dota/scripts/npc/neutral_items.txt",
    "dota/scripts/shops.txt",
    "dota/resource/localization/abilities_russian.txt",  # официальные русские названия и тултипы
]
VPK_HERO_PATH = "dota/scripts/npc/heroes/{hero}.txt"

# Файлы, по которым считаем diff между снимками
DIFF_FILES = ["heroes.json", "abilities.json", "items.json"]


def resolve_ref(repo: str, ref: str) -> str:
    """Ветку/тег превращает в sha коммита, чтобы снимок был воспроизводимым."""
    if len(ref) == 40 and all(c in "0123456789abcdef" for c in ref):
        return ref
    try:
        out = subprocess.run(
            ["git", "ls-remote", f"https://github.com/{repo}.git", ref],
            capture_output=True, text=True, timeout=60, check=True,
        ).stdout.split()
    except (subprocess.SubprocessError, FileNotFoundError) as exc:
        sys.exit(f"Не удалось получить sha для {repo}@{ref}: {exc}")
    if not out:
        sys.exit(f"Ref '{ref}' не найден в {repo}")
    return out[0]


def download(repo: str, sha: str, path: str) -> bytes:
    url = RAW_URL.format(repo=repo, ref=sha, path=path)
    with urllib.request.urlopen(url, timeout=120) as resp:
        return resp.read()


def detect_patch(patch_raw: bytes, patchnotes_raw: bytes) -> str:
    """'7.41' из patch.json, уточняем буквой из patchnotes.json ('7_41f' → '7.41f')."""
    major = json.loads(patch_raw)[-1]["name"]
    notes = list(json.loads(patchnotes_raw))
    prefix = major.replace(".", "_")
    letters = [k for k in notes if k.startswith(prefix)]
    return letters[-1].replace("_", ".") if letters else major


def diff_entries(old: dict, new: dict) -> dict:
    def strip(v):
        # img содержит timestamp и меняется без изменения данных
        return {k: x for k, x in v.items() if k != "img"} if isinstance(v, dict) else v
    common = old.keys() & new.keys()
    return {
        "added":   sorted(new.keys() - old.keys()),
        "removed": sorted(old.keys() - new.keys()),
        "changed": sorted(k for k in common if strip(old[k]) != strip(new[k])),
    }


def _sha256(data: bytes) -> dict:
    return {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Снимок данных Dota 2")
    parser.add_argument("--constants-ref", default="master", help="ветка, тег или sha dotaconstants")
    parser.add_argument("--vpk-ref", default="master", help="ветка, тег или sha d2vpkr")
    args = parser.parse_args()

    c_sha = resolve_ref(CONSTANTS_REPO, args.constants_ref)
    v_sha = resolve_ref(VPK_REPO, args.vpk_ref)

    print(f"{CONSTANTS_REPO} @ {c_sha[:10]}")
    constants: dict[str, bytes] = {}
    for name in CONSTANTS_FILES:
        constants[name] = download(CONSTANTS_REPO, c_sha, f"build/{name}")
        print(f"  {name:<24} {len(constants[name]) / 1024:>8.0f} KB")

    heroes = sorted(json.loads(constants["hero_abilities.json"]))
    vpk_paths = VPK_FILES + [VPK_HERO_PATH.format(hero=h) for h in heroes]
    print(f"{VPK_REPO} @ {v_sha[:10]}  ({len(vpk_paths)} файлов, из них {len(heroes)} героев)")
    with ThreadPoolExecutor(max_workers=16) as pool:
        game = dict(zip(vpk_paths, pool.map(lambda p: download(VPK_REPO, v_sha, p), vpk_paths)))

    patch = detect_patch(constants["patch.json"], constants["patchnotes.json"])

    manifest_path = OUT_DIR / "manifest.json"
    old_manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else None
    if old_manifest:
        print(f"\nИзменения данных относительно {old_manifest['patch']}:")
        for name in DIFF_FILES:
            old_path = OUT_DIR / name
            if not old_path.exists():
                continue
            d = diff_entries(json.loads(old_path.read_text(encoding="utf-8")), json.loads(constants[name]))
            print(f"  {name:<16} +{len(d['added'])} -{len(d['removed'])} ~{len(d['changed'])}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, data in constants.items():
        (OUT_DIR / name).write_bytes(data)
    for path, data in game.items():
        dest = GAME_DIR / Path(path).relative_to("dota")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)

    manifest = {
        "patch": patch,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sources": {
            "dotaconstants": {"repo": CONSTANTS_REPO, "commit": c_sha},
            "d2vpkr":        {"repo": VPK_REPO, "commit": v_sha},
        },
        "files": {name: _sha256(data) for name, data in constants.items()},
        "game_files": {str(Path(p).relative_to("dota")): _sha256(d) for p, d in game.items()},
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nПатч {patch} → {OUT_DIR}/")

    print()
    build_game_index.main()


if __name__ == "__main__":
    main()
