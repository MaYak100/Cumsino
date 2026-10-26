#!/usr/bin/env python3
"""
Скачивает игровые данные Dota 2 из odota/dotaconstants и фиксирует снимок с версией патча.

Снимок — источник истины для генерации и проверки вопросов:
  scripts/data/dota/*.json       — файлы как есть из dotaconstants/build/
  scripts/data/dota/manifest.json — патч, коммит upstream, дата, sha256 файлов

Использование (из корня репо):
  python scripts/fetch_dota_data.py              # последний master
  python scripts/fetch_dota_data.py --ref <sha>  # конкретный коммит dotaconstants

Если снимок уже был, печатает сводку изменений (какие способности/предметы поменялись).
"""

import argparse
import hashlib
import json
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO      = "odota/dotaconstants"
RAW_URL   = "https://raw.githubusercontent.com/{repo}/{ref}/build/{name}"
OUT_DIR   = Path("scripts/data/dota")

FILES = [
    "heroes.json",
    "hero_abilities.json",   # герой → способности + таланты
    "abilities.json",
    "aghs_desc.json",        # описания Aghanim's Scepter / Shard
    "items.json",
    "patch.json",
    "patchnotes.json",
]

# Файлы, по которым считаем diff между снимками
DIFF_FILES = ["heroes.json", "abilities.json", "items.json"]


def resolve_ref(ref: str) -> str:
    """Ветку/тег превращает в sha коммита, чтобы снимок был воспроизводимым."""
    if len(ref) == 40 and all(c in "0123456789abcdef" for c in ref):
        return ref
    try:
        out = subprocess.run(
            ["git", "ls-remote", f"https://github.com/{REPO}.git", ref],
            capture_output=True, text=True, timeout=60, check=True,
        ).stdout.split()
    except (subprocess.SubprocessError, FileNotFoundError) as exc:
        sys.exit(f"Не удалось получить sha для '{ref}': {exc}")
    if not out:
        sys.exit(f"Ref '{ref}' не найден в {REPO}")
    return out[0]


def download(name: str, sha: str) -> bytes:
    url = RAW_URL.format(repo=REPO, ref=sha, name=name)
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Снимок данных Dota 2 из dotaconstants")
    parser.add_argument("--ref", default="master", help="ветка, тег или sha dotaconstants")
    args = parser.parse_args()

    sha = resolve_ref(args.ref)
    print(f"{REPO} @ {sha[:10]}")

    blobs: dict[str, bytes] = {}
    for name in FILES:
        blobs[name] = download(name, sha)
        print(f"  {name:<20} {len(blobs[name]) / 1024:>8.0f} KB")

    patch = detect_patch(blobs["patch.json"], blobs["patchnotes.json"])

    old_manifest_path = OUT_DIR / "manifest.json"
    old_manifest = json.loads(old_manifest_path.read_text(encoding="utf-8")) if old_manifest_path.exists() else None

    if old_manifest:
        print(f"\nИзменения относительно {old_manifest['patch']} ({old_manifest['source']['commit'][:10]}):")
        for name in DIFF_FILES:
            old_path = OUT_DIR / name
            if not old_path.exists():
                continue
            d = diff_entries(json.loads(old_path.read_text(encoding="utf-8")), json.loads(blobs[name]))
            print(f"  {name:<16} +{len(d['added'])} -{len(d['removed'])} ~{len(d['changed'])}")
            for k in d["removed"][:10]:
                print(f"      - {k}")
            for k in d["added"][:10]:
                print(f"      + {k}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, data in blobs.items():
        (OUT_DIR / name).write_bytes(data)

    manifest = {
        "patch": patch,
        "source": {
            "repo": REPO,
            "commit": sha,
            "url": f"https://github.com/{REPO}/tree/{sha}/build",
        },
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "files": {
            name: {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
            for name, data in blobs.items()
        },
    }
    old_manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nПатч {patch} → {OUT_DIR}/")


if __name__ == "__main__":
    main()
