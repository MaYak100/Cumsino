#!/usr/bin/env python3
"""
Текстовые вопросы про механики способностей (не числа): «как это работает», «ложный факт»,
«сработает или нет», «чья механика».

Вход модели — по каждой способности героя: роль, поведение, тип урона, пробивание
невосприимчивости, диспел, полное описание из клиента, примечания (Note0…) и описания
шарда/аганима из английской локализации; метки %value% заменены числами из файлов героя.

Проверка в два слоя:
  1. код: 4 варианта, ровно один отмечен верным, ссылки evidence указывают на существующие
     места данных, верный вариант опирается на данные (не «invented»);
  2. второй проход модели (prompt_mechanics_verify.md): истинность каждого утверждения
     по данным — сходится ли с тем, что вариант должен быть верным/неверным.

  python scripts/generate/text_lab/mechanics_lab.py out/mech1 --heroes earth_spirit,axe,chaos_knight,ancient_apparition,centaur
  python scripts/generate/text_lab/mechanics_lab.py out/mech2 --random 5 --effort xhigh
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
GAME = DOTA / "game"
sys.path.insert(0, str(LAB.parent.parent))   # scripts/ → valve_kv
import valve_kv  # noqa: E402

MODEL = "claude-opus-5-5"
PRICE = {"input": 4.0, "output": 20.0}
FORMATS = ["how", "false_fact", "interaction", "whose"]
TRUTH = ["true", "false", "unknown"]

_PLACEHOLDER = re.compile(r"%([A-Za-z0-9_]+)%")


def _load(name: str) -> dict:
    return json.loads((DOTA / f"{name}.json").read_text(encoding="utf-8"))


def _tokens(path: Path) -> dict:
    root = valve_kv.parse_file(path)
    lang = next(iter(root.values()))
    return lang.get("Tokens", lang)


def _value_text(v) -> str:
    raw = v.get("value", "") if isinstance(v, dict) else v
    parts = str(raw).split()
    return "/".join(parts) if parts else ""


def fill(text: str, values: dict[str, str]) -> str:
    """%damage% → 100/200/300; %%% после метки — знак процента; <br> → перенос."""
    out = _PLACEHOLDER.sub(lambda m: values.get(m.group(1).lower(), m.group(1)), text)
    out = out.replace("%%", "%").replace("\\n", "\n")
    out = re.sub(r"<br\s*/?>|< br>", "\n", out)
    return re.sub(r"<[^>]+>", "", out).strip()


def ability_packet(key: str, role: str, name: str, defn: dict, const: dict, tok: dict) -> dict:
    values = {k.lower(): _value_text(v) for k, v in (defn.get("AbilityValues") or {}).items()}
    for k, v in defn.items():   # AbilityDuration, AbilityCharges, AbilityCooldown…
        if k.startswith("Ability") and isinstance(v, str):
            values.setdefault(k.lower(), _value_text(v))
    base = f"DOTA_Tooltip_ability_{key}"
    desc = tok.get(f"{base}_Description") or const.get("desc", "")
    notes = [fill(tok[f"{base}_Note{i}"], values) for i in range(12) if tok.get(f"{base}_Note{i}")]
    packet = {
        "name": name,
        "role": role,
        "behavior": const.get("behavior"),
        "damage_type": const.get("dmg_type"),
        "bkbpierce": const.get("bkbpierce"),
        "dispellable": const.get("dispellable"),
        "desc": fill(desc, values),
        "notes": {f"note{i}": n for i, n in enumerate(notes)},
    }
    for part in ("shard", "scepter"):
        if tok.get(f"{base}_{part}_description"):
            packet[part] = fill(tok[f"{base}_{part}_description"], values)
    return packet


def hero_packet(npc: str, current: dict, abilities: dict, tok: dict) -> dict:
    raw = valve_kv.parse_file(GAME / f"scripts/npc/heroes/{npc}.txt")["DOTAHeroes"][npc]
    defs = raw.get("AbilityDefinitions", {})
    packets = []
    for a in current["heroes"][npc]["abilities"]:
        if a["role"] not in current["question_ability_roles"]:
            continue
        defn = defs.get(a["key"]) if isinstance(defs.get(a["key"]), dict) else {}
        packets.append(ability_packet(a["key"], a["role"], a["name"], defn, abilities.get(a["key"], {}), tok))
    return {"hero": current["heroes"][npc]["name"], "abilities": packets}


def build_sample(npcs: list[str]) -> dict:
    current, abilities = _load("current"), _load("abilities")
    tok = _tokens(GAME / "resource/localization/abilities_english.txt")
    return {"patch": current["patch"], "heroes": [hero_packet(n, current, abilities, tok) for n in npcs]}


def _sources(ab: dict) -> list[str]:
    out = ["desc", "bkbpierce", "dispellable"] + list(ab["notes"])
    return out + [p for p in ("shard", "scepter") if p in ab]


def schema(sample: dict) -> dict:
    names = sorted({a["name"] for h in sample["heroes"] for a in h["abilities"]})
    option = {"type": "object", "properties": {
        "text": {"type": "string"},
        "correct": {"type": "boolean"},
        "evidence": {"type": "object", "properties": {
            "ability": {"type": "string", "enum": names + ["none"]},
            "source": {"type": "string"}},
            "required": ["ability", "source"], "additionalProperties": False},
    }, "required": ["text", "correct", "evidence"], "additionalProperties": False}
    question = {"type": "object", "properties": {
        "hero": {"type": "string", "enum": [h["hero"] for h in sample["heroes"]]},
        "ability": {"type": "string", "enum": names},
        "format": {"type": "string", "enum": FORMATS},
        "question": {"type": "string"},
        "options": {"type": "array", "items": option},
        "comment": {"type": "string"},
    }, "required": ["hero", "ability", "format", "question", "options", "comment"], "additionalProperties": False}
    return {"type": "object", "properties": {"questions": {"type": "array", "items": question}},
            "required": ["questions"], "additionalProperties": False}


def verify_schema() -> dict:
    check = {"type": "object", "properties": {
        "question": {"type": "integer"}, "option": {"type": "integer"},
        "truth": {"type": "string", "enum": TRUTH}, "note": {"type": "string"}},
        "required": ["question", "option", "truth", "note"], "additionalProperties": False}
    return {"type": "object", "properties": {"checks": {"type": "array", "items": check}},
            "required": ["checks"], "additionalProperties": False}


def check(q: dict, sample: dict) -> dict:
    by_name = {a["name"]: a for h in sample["heroes"] for a in h["abilities"]}
    flags = []
    if len(q["options"]) != 4:
        flags.append(f"вариантов {len(q['options'])}, нужно 4")
    if sum(1 for o in q["options"] if o["correct"]) != 1:
        flags.append("верным должен быть ровно один вариант")
    for o in q["options"]:
        ev = o["evidence"]
        if ev["source"] == "invented" or ev["ability"] == "none":
            if o["correct"] and q["format"] != "false_fact":
                flags.append(f"верный вариант без опоры на данные: «{o['text']}»")
            continue
        ab = by_name.get(ev["ability"])
        if not ab or ev["source"] not in _sources(ab):
            flags.append(f"ссылка {ev['ability']}:{ev['source']} не найдена в данных")
    return {**q, "flags": flags}


def apply_verification(questions: list[dict], checks: list[dict]) -> None:
    for c in checks:
        try:
            q = questions[c["question"]]
            o = q["options"][c["option"]]
        except (IndexError, KeyError):
            continue
        o["truth"], o["verify_note"] = c["truth"], c["note"]
        # в «ложном факте» верный ответ — ложное утверждение, остальные — правда
        should_be_true = (not o["correct"]) if q["format"] == "false_fact" else o["correct"]
        expected = "true" if should_be_true else "false"
        if c["truth"] != expected:
            severity = "⚠" if c["truth"] == "unknown" and not should_be_true else "✖"
            q["flags"].append(f"{severity} проверка: «{o['text']}» — {c['truth']}, ожидалось {expected} ({c['note']})")


def _client():
    import anthropic
    return anthropic.Anthropic(api_key=os.environ.get("NUMLAB_API_KEY") or os.environ.get("ANTHROPIC_API_KEY"),
                               base_url="https://api.anthropic.com")


def _call(client, system: str, payload: dict, out_schema: dict, effort: str) -> tuple[dict, dict]:
    t0 = time.time()
    with client.messages.stream(
        model=MODEL, max_tokens=64000, system=[{"type": "text", "text": system}],
        messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
        output_config={"effort": effort, "format": {"type": "json_schema", "schema": out_schema}},
    ) as stream:
        msg = stream.get_final_message()
    usage = {"input_tokens": msg.usage.input_tokens, "output_tokens": msg.usage.output_tokens,
             "seconds": round(time.time() - t0, 1), "stop": msg.stop_reason}
    text = next((b.text for b in msg.content if b.type == "text"), "{}")
    return (json.loads(text) if msg.stop_reason == "end_turn" else {}), usage


def run_one(client, idx: int, sample: dict, prompt: str, verify_prompt: str, effort: str) -> dict:
    body, gen = _call(client, prompt, sample, schema(sample), effort)
    questions = [check(q, sample) for q in body.get("questions", [])]
    ver = None
    if questions:
        payload = {"heroes": sample["heroes"],
                   "questions": [{"index": i, "hero": q["hero"], "format": q["format"], "question": q["question"],
                                  "options": [{"index": j, "text": o["text"]} for j, o in enumerate(q["options"])]}
                                 for i, q in enumerate(questions)]}
        vbody, ver = _call(client, verify_prompt, payload, verify_schema(), effort)
        apply_verification(questions, vbody.get("checks", []))
    print(f"  запрос {idx}: {len(questions)} вопросов, генерация {gen['seconds']}с, "
          f"проверка {ver['seconds'] if ver else '-'}с", flush=True)
    return {"index": idx, "heroes": [h["hero"] for h in sample["heroes"]], "questions": questions,
            "usage": {"generate": gen, "verify": ver}}


def report(results: list[dict], title: str) -> str:
    def usd(u):
        return (u["input_tokens"] * PRICE["input"] + u["output_tokens"] * PRICE["output"]) / 1e6 if u else 0
    total = sum(usd(r["usage"]["generate"]) + usd(r["usage"]["verify"]) for r in results)
    qs = [q for r in results for q in r["questions"]]
    lines = [f"# Механики: {title}", "",
             f"Запросов: {len(results)}, вопросов: {len(qs)}, с флагами: {sum(1 for q in qs if q['flags'])}, "
             f"стоимость: ${total:.2f}", ""]
    for q in qs:
        lines.append(f"**{q['hero']} · {q['ability']}** [{q['format']}] — {q['question']}")
        for o in q["options"]:
            mark = "✔" if o["correct"] else "·"
            ev = o["evidence"]
            lines.append(f"- {mark} {o['text']}  `{ev['ability']}:{ev['source']}`")
        lines.append(f"- 💬 {q['comment']}")
        for f in q["flags"]:
            lines.append(f"- {f if f[:1] in '⚠✖' else '⚠ ' + f}")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir")
    ap.add_argument("--heroes", help="ключи героев через запятую (axe,earth_spirit,…)")
    ap.add_argument("--random", type=int, help="столько случайных героев")
    ap.add_argument("--per-request", type=int, default=5)
    ap.add_argument("--prompt", default="prompt_mechanics_v3.md")
    ap.add_argument("--effort", default="high")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    run_dir = Path(args.run_dir)
    if not run_dir.is_absolute() and not run_dir.parent.exists():
        run_dir = LAB / run_dir
    run_dir.mkdir(parents=True, exist_ok=True)

    current = _load("current")
    if args.heroes:
        npcs = [f"npc_dota_hero_{h}" for h in args.heroes.split(",")]
    else:
        npcs = list(current["heroes"])
        random.SystemRandom().shuffle(npcs)
        npcs = npcs[:args.random] if args.random else npcs
    samples = [build_sample(npcs[i:i + args.per_request]) for i in range(0, len(npcs), args.per_request)]
    (run_dir / "samples.json").write_text(json.dumps(samples, ensure_ascii=False, indent=1), encoding="utf-8")
    prompt = (LAB / args.prompt).read_text(encoding="utf-8")
    verify_prompt = (LAB / "prompt_mechanics_verify.md").read_text(encoding="utf-8")
    (run_dir / "run.json").write_text(json.dumps({"prompt": args.prompt, "effort": args.effort, "model": MODEL,
                                                  "heroes": npcs}, indent=2), encoding="utf-8")
    print(f"{len(npcs)} героев → {len(samples)} запросов, {args.prompt}, effort {args.effort}")
    if args.dry_run:
        return

    client = _client()

    def safe(a):
        # упавший запрос не должен терять результаты остальных
        try:
            return run_one(client, a[0], a[1], prompt, verify_prompt, args.effort)
        except Exception as exc:  # noqa: BLE001
            print(f"  запрос {a[0]}: ошибка {exc}", flush=True)
            return {"index": a[0], "heroes": [h["hero"] for h in a[1]["heroes"]], "questions": [],
                    "usage": {"generate": None, "verify": None}, "error": str(exc)}

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(safe, enumerate(samples)))
    (run_dir / "questions.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    text = report(results, f"{run_dir.name} ({args.prompt}, effort {args.effort})")
    (run_dir / "report.md").write_text(text, encoding="utf-8")
    print(text.split("\n\n")[1])


if __name__ == "__main__":
    main()
