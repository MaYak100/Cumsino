#!/usr/bin/env python3
"""
Вопросы про таланты: «какой из талантов есть у героя» / «какого таланта нет у героя».

Модель получает таланты героев (id, уровень, текст, вид) и пул талантов других героев.
Вид таланта размечает код: stat — голый стат без способности (+200 Health), tweak — правка
числа у способности (-3s Meat Hook Cooldown), mechanic — меняет поведение («Whirling Axes
Pierce Magic Immunity»). v2: больше героев в запросе, мало вопросов, только про необычные
таланты; подделки — выдуманные механики (kind: invented без from_talent_id).
Код проверяет состав: что «настоящие» есть у героя, а подставные и выдуманные — нет.

  python scripts/generate/numeric_lab/talent_lab.py out/talents1 --dry-run
  python scripts/generate/numeric_lab/talent_lab.py out/talents1            # один запрос, opus
"""

import argparse
import json
import os
import random
import re
import sys
import time
from pathlib import Path

LAB  = Path(__file__).parent
DOTA = Path("scripts/data/dota")
LEVELS = {1: 10, 2: 15, 3: 20, 4: 25}

sys.path.insert(0, str(LAB))
from build_sample import HEROES as FIXED_HEROES   # noqa: E402

POOL_HEROES = 4   # сколько чужих героев даёт подставные таланты на каждого героя (prompt v1)
_NUM_START = re.compile(r"^[+\-−]?\d")


def talent_kind(text: str, ability_names: list[str]) -> str:
    mentions = any(n and n.lower() in text.lower() for n in ability_names)
    if _NUM_START.match(text):
        return "tweak" if mentions else "stat"
    return "mechanic"


def _load(name: str) -> dict:
    return json.loads((DOTA / f"{name}.json").read_text(encoding="utf-8"))


def build_sample(n: int, exclude: set[str], pool: bool = True) -> dict:
    current, hero_abs, abilities = _load("current"), _load("hero_abilities"), _load("abilities")
    rng = random.SystemRandom()

    def talents(npc: str) -> list[dict]:
        names = [a["name"] for a in current["heroes"][npc]["abilities"]]
        out = []
        for t in hero_abs[npc]["talents"]:
            text = abilities.get(t["name"], {}).get("dname")
            if text and "{" not in text:
                out.append({"id": t["name"], "level": LEVELS[t["level"]], "text": text,
                            "kind": talent_kind(text, names)})
        return out

    npcs = [npc for npc in current["heroes"] if npc[len("npc_dota_hero_"):] not in exclude]
    chosen = rng.sample(npcs, n)
    heroes = []
    for npc in chosen:
        others = rng.sample([x for x in npcs if x != npc], POOL_HEROES)
        hero = {
            "hero": current["heroes"][npc]["name"],
            "abilities": [a["name"] for a in current["heroes"][npc]["abilities"]
                          if a["role"] in current["question_ability_roles"]],
            "talents": talents(npc),
        }
        if pool:
            hero["decoy_pool"] = [{**t, "from_hero": current["heroes"][o]["name"]} for o in others for t in talents(o)]
        heroes.append(hero)
    return {"patch": current["patch"], "heroes": heroes}


def schema(sample: dict) -> dict:
    real = sorted({t["id"] for h in sample["heroes"] for t in h["talents"]})
    pool = sorted({t["id"] for h in sample["heroes"] for t in h.get("decoy_pool", [])}) or ["-"]
    option = {"anyOf": [
        {"type": "object", "properties": {"kind": {"const": "real"}, "talent_id": {"type": "string", "enum": real}},
         "required": ["kind", "talent_id"], "additionalProperties": False},
        {"type": "object", "properties": {"kind": {"const": "decoy"}, "talent_id": {"type": "string", "enum": pool}},
         "required": ["kind", "talent_id"], "additionalProperties": False},
        {"type": "object", "properties": {"kind": {"const": "invented"},
                                          "from_talent_id": {"type": "string", "enum": real + ["none"]},
                                          "text": {"type": "string"}},
         "required": ["kind", "from_talent_id", "text"], "additionalProperties": False},
    ]}
    question = {
        "type": "object",
        "properties": {
            "hero": {"type": "string", "enum": [h["hero"] for h in sample["heroes"]]},
            "type": {"type": "string", "enum": ["has", "has_not"]},
            "question": {"type": "string"},
            "options": {"type": "array", "items": option},
        },
        "required": ["hero", "type", "question", "options"],
        "additionalProperties": False,
    }
    return {"type": "object", "properties": {"questions": {"type": "array", "items": question}},
            "required": ["questions"], "additionalProperties": False}


def check(q: dict, sample: dict) -> dict:
    hero = next(h for h in sample["heroes"] if h["hero"] == q["hero"])
    real = {t["id"]: t for t in hero["talents"]}
    real_texts = {t["text"].strip().lower() for t in hero["talents"]}
    pool = {t["id"]: t for t in hero.get("decoy_pool", [])}
    flags, rendered = [], []
    for o in q["options"]:
        if o["kind"] == "real":
            t = real.get(o["talent_id"])
            if not t:
                flags.append(f"{o['talent_id']}: не талант этого героя")
                rendered.append(("?", o["talent_id"]))
                continue
            rendered.append(("есть", f"{t['text']} ({t['level']}, {t['kind']})"))
            if t["kind"] == "stat":
                flags.append(f"настоящий «{t['text']}» — голый стат")
        elif o["kind"] == "decoy":
            t = pool.get(o["talent_id"])
            text = t["text"] if t else o["talent_id"]
            if not t:
                flags.append(f"{o['talent_id']}: не из пула этого героя")
            if text.strip().lower() in real_texts:
                flags.append(f"подставной «{text}» на самом деле есть у героя")
            rendered.append(("нет", f"{text} (от {t['from_hero'] if t else '?'})"))
        else:
            if o["text"].strip().lower() in real_texts:
                flags.append(f"выдуманный «{o['text']}» совпадает с настоящим талантом")
            src = real.get(o["from_talent_id"], {}).get("text")
            rendered.append(("нет", f"{o['text']} (выдуман" + (f" из «{src}»)" if src else ")")))
    n_real = sum(1 for kind, _ in rendered if kind == "есть")
    need = 1 if q["type"] == "has" else 3
    if len(q["options"]) != 4:
        flags.append(f"вариантов {len(q['options'])}, нужно 4")
    if n_real != need:
        flags.append(f"настоящих талантов {n_real}, для «{q['type']}» нужно {need}")
    return {**q, "rendered": rendered, "flags": flags}


def report(run_dir: Path, checked: list[dict], usage: dict) -> str:
    lines = ["# Таланты", "", f"Токены: {usage}", ""]
    for q in checked:
        correct = "есть" if q["type"] == "has" else "нет"
        lines.append(f"**{q['hero']}** ({'какой есть' if q['type'] == 'has' else 'какого нет'}) — {q['question']}")
        for kind, text in q["rendered"]:
            mark = "✔" if kind == correct else "·"
            lines.append(f"- {mark} {text}")
        for f in q["flags"]:
            lines.append(f"- ⚠ {f}")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir")
    ap.add_argument("--heroes", type=int, default=10)
    ap.add_argument("--prompt", default="prompt_talents_v2.md")
    ap.add_argument("--pool", action="store_true", help="пул чужих талантов для подставных (prompt v1)")
    ap.add_argument("--model", default="claude-opus-5-5")
    ap.add_argument("--effort", default="high")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    run_dir = Path(args.run_dir)
    if not run_dir.is_absolute() and not run_dir.parent.exists():
        run_dir = LAB / run_dir
    run_dir.mkdir(parents=True, exist_ok=True)

    step_sample = json.loads((LAB / "sample_step.json").read_text(encoding="utf-8"))
    current = _load("current")
    used_names = {h["hero"] for h in step_sample["heroes"]}
    exclude = set(FIXED_HEROES) | {npc[len("npc_dota_hero_"):] for npc, h in current["heroes"].items()
                                   if h["name"] in used_names}
    for prev in LAB.glob("out/talents*/sample.json"):
        names = {h["hero"] for h in json.loads(prev.read_text(encoding="utf-8"))["heroes"]}
        exclude |= {npc[len("npc_dota_hero_"):] for npc, h in current["heroes"].items() if h["name"] in names}
    sample = build_sample(args.heroes, exclude, pool=args.pool)
    (run_dir / "sample.json").write_text(json.dumps(sample, ensure_ascii=False, indent=1), encoding="utf-8")
    prompt = (LAB / args.prompt).read_text(encoding="utf-8")
    (run_dir / "prompt.md").write_text(prompt, encoding="utf-8")
    params = {
        "model": args.model,
        "max_tokens": 16000,
        "system": [{"type": "text", "text": prompt}],
        "messages": [{"role": "user", "content": json.dumps(sample, ensure_ascii=False)}],
        "output_config": {"effort": args.effort, "format": {"type": "json_schema", "schema": schema(sample)}},
    }
    print(f"Герои: {', '.join(h['hero'] for h in sample['heroes'])}")
    if args.dry_run:
        return

    import anthropic
    client = anthropic.Anthropic(api_key=os.environ.get("NUMLAB_API_KEY") or os.environ.get("ANTHROPIC_API_KEY"),
                                 base_url="https://api.anthropic.com")
    t0 = time.time()
    with client.messages.stream(**params) as stream:
        msg = stream.get_final_message()
    text = next((b.text for b in msg.content if b.type == "text"), "")
    usage = {k: getattr(msg.usage, k, 0) for k in ("input_tokens", "output_tokens")}
    usage["seconds"] = round(time.time() - t0, 1)
    usage["usd"] = round((usage["input_tokens"] * 4 + usage["output_tokens"] * 20) / 1e6, 4)
    questions = json.loads(text)["questions"] if msg.stop_reason == "end_turn" else []
    (run_dir / "questions.json").write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding="utf-8")
    checked = [check(q, sample) for q in questions]
    (run_dir / "report.md").write_text(report(run_dir, checked, usage), encoding="utf-8")
    print(f"{len(questions)} вопросов, stop={msg.stop_reason}, {usage}")


if __name__ == "__main__":
    main()
