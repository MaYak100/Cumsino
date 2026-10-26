#!/usr/bin/env python3
"""
Вопросы про таланты: «Какой из этих талантов есть у героя?» — 1 настоящий + 3 выдуманных.

Модель получает героев: способности с описаниями и таланты (id, уровень, английский текст,
вид). Вид размечает код: stat — голый стат без способности (+200 Health), tweak — правка числа
у способности (-3s Meat Hook Cooldown), mechanic — меняет поведение («Whirling Axes Pierce
Magic Immunity»). Вопросы — только про необычные таланты; подделки — выдуманные механики.
Варианты модель пишет по-русски со сленгом (prompt_talents_v3.md).

Проверка в два слоя:
  1. код: настоящий вариант — талант этого героя, состав 1 + 3;
  2. второй проход модели (prompt_talents_verify.md): настоящий ли каждый вариант, не делает ли
     способность это и так, не слишком ли подделка близка к настоящему, точен ли перевод.

  python scripts/generate/numeric_lab/talent_lab.py out/talents4 --heroes 10      # один запрос
  python scripts/generate/numeric_lab/talent_lab.py out/talents-full --full       # все герои по 10
"""

import argparse
import json
import os
import random
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

LAB  = Path(__file__).parent
DOTA = Path("scripts/data/dota")
LEVELS = {1: 10, 2: 15, 3: 20, 4: 25}
HEROES_PER_REQUEST = 10
MODEL = "claude-opus-5-5"
PRICE = {"input": 4.0, "output": 20.0}   # $ за 1M токенов, обычные вызовы

_NUM_START = re.compile(r"^[+\-−]?\d")
VERDICTS = ["real_talent", "not_a_talent", "already_default", "too_close"]


def talent_kind(text: str, ability_names: list[str]) -> str:
    mentions = any(n and n.lower() in text.lower() for n in ability_names)
    if _NUM_START.match(text):
        return "tweak" if mentions else "stat"
    return "mechanic"


def _load(name: str) -> dict:
    return json.loads((DOTA / f"{name}.json").read_text(encoding="utf-8"))


def hero_packet(npc: str, current: dict, hero_abs: dict, abilities: dict) -> dict:
    entries = [a for a in current["heroes"][npc]["abilities"] if a["role"] in current["question_ability_roles"]]
    names = [a["name"] for a in current["heroes"][npc]["abilities"]]
    talents = []
    for t in hero_abs[npc]["talents"]:
        text = abilities.get(t["name"], {}).get("dname")
        if text and "{" not in text:
            talents.append({"id": t["name"], "level": LEVELS.get(t["level"], t["level"]), "text": text,
                            "kind": talent_kind(text, names)})
    return {
        "hero": current["heroes"][npc]["name"],
        "abilities": [{"name": a["name"], "role": a["role"], "desc": abilities.get(a["key"], {}).get("desc", "")}
                      for a in entries],
        "talents": talents,
    }


def build_samples(npcs: list[str], per_request: int) -> list[dict]:
    current, hero_abs, abilities = _load("current"), _load("hero_abilities"), _load("abilities")
    heroes = [hero_packet(npc, current, hero_abs, abilities) for npc in npcs]
    return [{"patch": current["patch"], "heroes": heroes[i:i + per_request]}
            for i in range(0, len(heroes), per_request)]


def schema(sample: dict) -> dict:
    real = sorted({t["id"] for h in sample["heroes"] for t in h["talents"]})
    option = {"anyOf": [
        {"type": "object", "properties": {"kind": {"const": "real"},
                                          "talent_id": {"type": "string", "enum": real},
                                          "text": {"type": "string"}},
         "required": ["kind", "talent_id", "text"], "additionalProperties": False},
        {"type": "object", "properties": {"kind": {"const": "invented"}, "text": {"type": "string"}},
         "required": ["kind", "text"], "additionalProperties": False},
    ]}
    question = {
        "type": "object",
        "properties": {
            "hero": {"type": "string", "enum": [h["hero"] for h in sample["heroes"]]},
            "type": {"type": "string", "enum": ["has"]},
            "question": {"type": "string"},
            "options": {"type": "array", "items": option},
        },
        "required": ["hero", "type", "question", "options"],
        "additionalProperties": False,
    }
    return {"type": "object", "properties": {"questions": {"type": "array", "items": question}},
            "required": ["questions"], "additionalProperties": False}


def verify_schema() -> dict:
    check = {"type": "object",
             "properties": {"question": {"type": "integer"}, "option": {"type": "integer"},
                            "verdict": {"type": "string", "enum": VERDICTS},
                            "translation_ok": {"type": "boolean"}, "note": {"type": "string"}},
             "required": ["question", "option", "verdict", "translation_ok", "note"],
             "additionalProperties": False}
    return {"type": "object", "properties": {"checks": {"type": "array", "items": check}},
            "required": ["checks"], "additionalProperties": False}


def _client():
    import anthropic
    return anthropic.Anthropic(api_key=os.environ.get("NUMLAB_API_KEY") or os.environ.get("ANTHROPIC_API_KEY"),
                               base_url="https://api.anthropic.com")


def _call(client, system: str, payload: dict, out_schema: dict, effort: str) -> tuple[dict, dict]:
    t0 = time.time()
    with client.messages.stream(
        model=MODEL, max_tokens=32000, system=[{"type": "text", "text": system}],
        messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
        output_config={"effort": effort, "format": {"type": "json_schema", "schema": out_schema}},
    ) as stream:
        msg = stream.get_final_message()
    usage = {"input_tokens": msg.usage.input_tokens, "output_tokens": msg.usage.output_tokens,
             "seconds": round(time.time() - t0, 1), "stop": msg.stop_reason}
    text = next((b.text for b in msg.content if b.type == "text"), "{}")
    return (json.loads(text) if msg.stop_reason == "end_turn" else {}), usage


def check(q: dict, sample: dict) -> dict:
    hero = next(h for h in sample["heroes"] if h["hero"] == q["hero"])
    real = {t["id"]: t for t in hero["talents"]}
    real_texts = {t["text"].strip().lower() for t in hero["talents"]}
    flags = []
    for o in q["options"]:
        if o["kind"] == "real":
            t = real.get(o["talent_id"])
            if not t:
                flags.append(f"{o['talent_id']}: не талант этого героя")
            else:
                o["original"] = t["text"]
                o["talent_kind"] = t["kind"]
                if t["kind"] == "stat":
                    flags.append(f"настоящий «{t['text']}» — голый стат")
        elif o["text"].strip().lower() in real_texts:
            flags.append(f"выдуманный «{o['text']}» совпадает с настоящим талантом")
    n_real = sum(1 for o in q["options"] if o["kind"] == "real")
    if len(q["options"]) != 4:
        flags.append(f"вариантов {len(q['options'])}, нужно 4")
    if n_real != 1:
        flags.append(f"настоящих вариантов {n_real}, нужен 1")
    return {**q, "flags": flags}


def apply_verification(questions: list[dict], checks: list[dict]) -> None:
    for c in checks:
        try:
            q = questions[c["question"]]
            o = q["options"][c["option"]]
        except (IndexError, KeyError):
            continue
        o["verdict"], o["verify_note"] = c["verdict"], c["note"]
        expected = "real_talent" if o["kind"] == "real" else "not_a_talent"
        if c["verdict"] != expected:
            q["flags"].append(f"проверка: «{o['text']}» — {c['verdict']} ({c['note']})")
        if o["kind"] == "real" and not c["translation_ok"]:
            q["flags"].append(f"проверка: перевод «{o['text']}» неточен ({c['note']})")


def run_one(client, idx: int, sample: dict, prompt: str, verify_prompt: str, effort: str) -> dict:
    body, gen_usage = _call(client, prompt, sample, schema(sample), effort)
    questions = [check(q, sample) for q in body.get("questions", [])]
    ver_usage = None
    if questions:
        heroes = {q["hero"] for q in questions}
        payload = {"heroes": [h for h in sample["heroes"] if h["hero"] in heroes],
                   "questions": [{"index": i, "hero": q["hero"],
                                  "options": [{"index": j, "text": o["text"]} for j, o in enumerate(q["options"])]}
                                 for i, q in enumerate(questions)]}
        ver, ver_usage = _call(client, verify_prompt, payload, verify_schema(), effort)
        apply_verification(questions, ver.get("checks", []))
    print(f"  запрос {idx}: {len(questions)} вопросов, генерация {gen_usage['seconds']}с, "
          f"проверка {ver_usage['seconds'] if ver_usage else '-'}с", flush=True)
    return {"index": idx, "heroes": [h["hero"] for h in sample["heroes"]], "questions": questions,
            "usage": {"generate": gen_usage, "verify": ver_usage}}


def report(results: list[dict]) -> str:
    def usd(u):
        return (u["input_tokens"] * PRICE["input"] + u["output_tokens"] * PRICE["output"]) / 1e6 if u else 0
    total = sum(usd(r["usage"]["generate"]) + usd(r["usage"]["verify"]) for r in results)
    qs = [q for r in results for q in r["questions"]]
    flagged = sum(1 for q in qs if q["flags"])
    lines = ["# Таланты", "",
             f"Запросов: {len(results)}, вопросов: {len(qs)}, с флагами: {flagged}, стоимость: ${total:.2f}", ""]
    for r in results:
        for q in r["questions"]:
            lines.append(f"**{q['hero']}** — {q['question']}")
            for o in q["options"]:
                mark = "✔" if o["kind"] == "real" else "·"
                extra = f" ← «{o.get('original', '?')}» ({o.get('talent_kind', '?')})" if o["kind"] == "real" else ""
                lines.append(f"- {mark} {o['text']}{extra}")
            for f in q["flags"]:
                lines.append(f"- ⚠ {f}")
            lines.append("")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir")
    ap.add_argument("--heroes", type=int, default=HEROES_PER_REQUEST, help="случайных героев (один запрос)")
    ap.add_argument("--full", action="store_true", help="все актуальные герои, по 10 в запросе")
    ap.add_argument("--prompt", default="prompt_talents_v3.md")
    ap.add_argument("--effort", default="high")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    run_dir = Path(args.run_dir)
    if not run_dir.is_absolute() and not run_dir.parent.exists():
        run_dir = LAB / run_dir
    run_dir.mkdir(parents=True, exist_ok=True)

    current = _load("current")
    npcs = list(current["heroes"])
    random.SystemRandom().shuffle(npcs)
    if not args.full:
        npcs = npcs[:args.heroes]
    samples = build_samples(npcs, HEROES_PER_REQUEST)
    (run_dir / "samples.json").write_text(json.dumps(samples, ensure_ascii=False, indent=1), encoding="utf-8")
    prompt = (LAB / args.prompt).read_text(encoding="utf-8")
    verify_prompt = (LAB / "prompt_talents_verify.md").read_text(encoding="utf-8")
    (run_dir / "prompt.md").write_text(prompt, encoding="utf-8")
    print(f"{len(npcs)} героев → {len(samples)} запросов")
    if args.dry_run:
        return

    client = _client()
    started = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(lambda a: run_one(client, a[0], a[1], prompt, verify_prompt, args.effort),
                                enumerate(samples)))
    (run_dir / "questions.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    text = report(results)
    (run_dir / "report.md").write_text(text, encoding="utf-8")
    print(text.split("\n\n")[1], f"| {time.time() - started:.0f} с")


if __name__ == "__main__":
    main()
