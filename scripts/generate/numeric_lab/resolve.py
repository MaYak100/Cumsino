#!/usr/bin/env python3
"""
Подставляет правильные ответы в вопросы моделей из sample.json (по fact_id + level),
проверяет их и собирает сравнительный отчёт.

  python scripts/generate/numeric_lab/resolve.py out/v1   → out/v1/report.md + out/v1/<model>.resolved.json

Вход: out/<run>/<model>.json — JSON-массив в формате из prompt_*.md.
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

LAB = Path(__file__).parent

_LEVEL_WORDS = re.compile(r"уров|макс|ранг|прокач", re.I)
_NUM = re.compile(r"\d+(?:[.,]\d+)?")


def load_facts() -> dict[str, dict]:
    sample = json.loads((LAB / "sample.json").read_text(encoding="utf-8"))
    facts = {}
    for h in sample["heroes"]:
        for ab in h["abilities"]:
            for f in ab["facts"]:
                facts[f["fact_id"]] = {**f, "entity": f"{h['hero']} · {ab['name']}",
                                       "siblings": ab["facts"]}
    for it in sample["items"]:
        for f in it["facts"]:
            facts[f["fact_id"]] = {**f, "entity": it["name"], "siblings": it["facts"]}
    return facts


def _decimals(x: float) -> int:
    s = repr(float(x)).rstrip("0").rstrip(".")
    return len(s.split(".")[1]) if "." in s else 0


def _fmt(x: float) -> str:
    return str(int(x)) if float(x) == int(x) else str(x)


def resolve_one(q: dict, facts: dict) -> dict:
    flags: list[str] = []
    fact = facts.get(q.get("fact_id"))
    if not fact:
        return {**q, "answer": None, "flags": ["неизвестный fact_id"]}

    vals = fact["values"]
    level = q.get("level", "max")
    if level == "max":
        idx = len(vals) - 1
    elif isinstance(level, int) and 1 <= level <= len(vals):
        idx = level - 1
    else:
        return {**q, "answer": None, "entity": fact["entity"], "flags": [f"уровень {level} вне 1..{len(vals)}"]}
    answer = vals[idx]

    text = q.get("question", "")
    if len(set(vals)) > 1 and not _LEVEL_WORDS.search(text):
        flags.append("значение зависит от уровня, а уровень не указан")
    if fact.get("hidden"):
        flags.append("скрытое значение (нет в тултипе)")

    # Числа в тексте вопроса, совпадающие с данными способности/предмета, — возможная подсказка
    sibling_nums = {float(v) for f in fact["siblings"] for v in f["values"]}
    leaked = [n for n in _NUM.findall(text) if float(n.replace(",", ".")) in sibling_nums]
    if leaked:
        flags.append(f"в тексте числа из данных: {', '.join(leaked)}")

    d = q.get("distractors") or []
    mc = None
    if len(d) != 3:
        flags.append(f"неверных вариантов {len(d)}, нужно 3")
    elif any(float(x) == float(answer) for x in d):
        flags.append("неверный вариант совпадает с ответом")
    else:
        opts = sorted([float(answer)] + [float(x) for x in d])
        pos = opts.index(float(answer)) + 1
        dec = [_decimals(x) for x in opts]
        round5 = [x % 5 == 0 for x in opts]
        if dec.count(_decimals(answer)) == 1:
            flags.append("ответ выделяется точностью (знаки после запятой)")
        if round5.count(float(answer) % 5 == 0) == 1:
            flags.append("ответ выделяется «круглостью»")
        spread = opts[-1] / opts[0] if opts[0] else float("inf")
        mc = {"options": opts, "position": pos, "spread": round(spread, 2)}

    return {**q, "answer": answer, "entity": fact["entity"], "all_values": vals,
            "mc": mc, "flags": flags}


def render(run_dir: Path, results: dict[str, list[dict]]) -> str:
    lines = [f"# Числовые вопросы: {run_dir.name}", ""]
    lines += ["| Модель | Вопросов | С флагами | Позиция ответа 1/2/3/4 | Средний разброс max/min |",
              "|---|---|---|---|---|"]
    for model, rs in results.items():
        flagged = sum(1 for r in rs if r["flags"])
        pos = Counter(r["mc"]["position"] for r in rs if r.get("mc"))
        spreads = [r["mc"]["spread"] for r in rs if r.get("mc") and r["mc"]["spread"] != float("inf")]
        avg = sum(spreads) / len(spreads) if spreads else 0
        lines.append(f"| {model} | {len(rs)} | {flagged} | "
                     f"{'/'.join(str(pos.get(i, 0)) for i in range(1, 5))} | {avg:.2f} |")
    for model, rs in results.items():
        lines += ["", f"## {model}", ""]
        for r in rs:
            ans = _fmt(r["answer"]) if r.get("answer") is not None else "?"
            lines.append(f"**{r.get('entity', r.get('fact_id'))}** — {r.get('question')}")
            opts = ""
            if r.get("mc"):
                opts = " · ".join(f"**{_fmt(o)}**" if o == float(r["answer"]) else _fmt(o)
                                  for o in r["mc"]["options"])
            lines.append(f"- ответ: **{ans} {r.get('unit', '')}**"
                         + (f" (по уровням: {', '.join(map(_fmt, r['all_values']))})"
                            if len(r.get("all_values", [])) > 1 else "")
                         + (f" · варианты: {opts}" if opts else ""))
            if r.get("why"):
                lines.append(f"- зачем: {r['why']}")
            for f in r["flags"]:
                lines.append(f"- ⚠ {f}")
            lines.append("")
    return "\n".join(lines)


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Использование: resolve.py <папка прогона, например out/v1>")
    run_dir = Path(sys.argv[1])
    if not run_dir.is_absolute() and not run_dir.exists():
        run_dir = LAB / run_dir
    facts = load_facts()

    results: dict[str, list[dict]] = {}
    for path in sorted(run_dir.glob("*.json")):
        if path.name.endswith(".resolved.json"):
            continue
        qs = json.loads(path.read_text(encoding="utf-8"))
        rs = [resolve_one(q, facts) for q in qs]
        results[path.stem] = rs
        (run_dir / f"{path.stem}.resolved.json").write_text(
            json.dumps(rs, ensure_ascii=False, indent=2), encoding="utf-8")

    report = render(run_dir, results)
    (run_dir / "report.md").write_text(report, encoding="utf-8")
    print(report.split("\n## ")[0])


if __name__ == "__main__":
    main()
