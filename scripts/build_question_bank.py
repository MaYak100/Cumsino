#!/usr/bin/env python3
"""
Единый банк готовых вопросов для игры: финальные прогоны лабораторий → scripts/data/bank/questions.json.

Источники (по одному на категорию, см. docs/questions/README.md):
  numeric_lab/out/full1        — числа героев, предметов, нейтралок, чар (без вопросов с флагами);
  numeric_lab/out/costs2       — цены предметов (флаг «шаг очень мелкий» для цен не считается: порог 3% не для цен);
  numeric_lab/out/talents-full — «какой из этих талантов есть у героя»;
  text_lab/out/full1/bank.json — механики после ручного курирования (curate.py).

Вопросы на статистике сюда не входят: сервер собирает их при каждом показе из scripts/data/stats/bank.json.
Категории, подкатегории и веса — server/src/game/questions/categories.ts; здесь у вопроса только `sub`.

id вопроса постоянный — по нему игра помнит, что уже было, хранит оценки и архив (Neon). Он строится из
смысла вопроса, а не из текста: правка формулировки id не меняет.
  num:<fact_id>:<level>      tal:<talent_id>      mech:<герой>:<способность>

Формат:
  {built_at, sources, questions: [
    {id, sub, kind: "number", text, topic, answer, step, unit, comment?},   # MC по шагу и «ближе всех»
    {id, sub, kind: "choice", text, topic, options, comment?}               # options[0] — правильный
  ]}

  python scripts/build_question_bank.py
"""

import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

LAB = Path("scripts/generate")
FULL1 = LAB / "numeric_lab/out/full1/resolved.json"
COSTS = LAB / "numeric_lab/out/costs2/resolved.json"
TALENTS = LAB / "numeric_lab/out/talents-full/questions.json"
MECHANICS = LAB / "text_lab/out/full1/bank.json"
OUT = Path("scripts/data/bank/questions.json")

IGNORED_FLAGS = {"costs": re.compile(r"^шаг очень мелкий")}
MECH_SUB = {"how": "mech_how", "interaction": "mech_interaction", "false_fact": "mech_false_fact",
            "whose": "mech_how"}   # «чья механика» — 4 вопроса, отдельной колодой повторялись бы каждые пару игр


def run_questions(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    (key,) = data.keys()   # одна модель в финальном прогоне
    return data[key]


def fmt_num(v: float) -> str:
    return f"{v:g}"


def hero_sub(q: dict) -> str:
    field = q["fact_id"].split(":")[-1]
    if q["unit"] == "сек.":
        return "hero_time"   # кулдауны (21 вопрос) и длительности вместе — время в секундах
    if q["unit"] == "%":
        return "hero_pct"
    if q["unit"] == "урона" or "damage" in field or "dmg" in field:
        return "hero_damage"
    return "hero_other"


def number_question(q: dict, sub: str, topic: str) -> dict:
    out = {"id": f"num:{q['fact_id']}:{q['level']}", "sub": sub, "kind": "number", "text": q["question"],
           "topic": topic, "answer": q["answer"], "step": q["step"], "unit": q["unit"]}
    values = q.get("all_values") or []
    if len(values) > 1:   # по уровням — после ответа видно, откуда взялось число
        out["comment"] = f"{q['entity']}: {' / '.join(fmt_num(v) for v in values)} {q['unit']} по уровням"
    return out


def flagged(q: dict, category: str) -> bool:
    ignore = IGNORED_FLAGS.get(category)
    return any(not (ignore and ignore.match(f)) for f in q.get("flags") or [])


def build() -> tuple[list[dict], Counter]:
    dropped: Counter = Counter()
    out: list[dict] = []

    for q in run_questions(FULL1):
        cat = q["category"]
        if flagged(q, cat):
            dropped[cat] += 1
            continue
        if cat == "heroes":
            out.append(number_question(q, hero_sub(q), q["entity"].split(" · ")[0]))
        elif cat == "items":
            out.append(number_question(q, "item_numbers", q["entity"]))
        else:   # neutrals, enhancements
            out.append(number_question(q, "neutrals", q["entity"]))

    for q in run_questions(COSTS):
        if flagged(q, "costs"):
            dropped["costs"] += 1
            continue
        out.append(number_question(q, "costs", "Цена"))

    for group in json.loads(TALENTS.read_text(encoding="utf-8")):
        for q in group["questions"]:
            if q["flags"] or q["type"] != "has":
                dropped["talents"] += 1
                continue
            real = [o for o in q["options"] if o["kind"] == "real"]
            assert len(real) == 1, q
            fakes = [o["text"] for o in q["options"] if o["kind"] != "real"]
            out.append({"id": f"tal:{real[0]['talent_id']}", "sub": "talents_has", "kind": "choice",
                        "text": q["question"], "topic": q["hero"], "options": [real[0]["text"], *fakes],
                        "comment": f"Настоящий талант: {real[0]['text']} ({real[0]['original']})"})

    for q in json.loads(MECHANICS.read_text(encoding="utf-8")):
        opts = [q["answer"], *[o for o in q["options"] if o != q["answer"]]]
        assert len(opts) == 4, q
        out.append({"id": f"mech:{q['hero']}:{q['ability']}", "sub": MECH_SUB[q["format"]], "kind": "choice",
                    "text": q["question"], "topic": q["hero"], "options": opts, "comment": q["comment"]})

    ids = Counter(q["id"] for q in out)
    dup = [i for i, n in ids.items() if n > 1]
    if dup:
        sys.exit(f"повторяющиеся id: {dup[:10]}")
    for q in out:
        if q["kind"] == "number" and not (q["step"] > 0 and q["answer"] > 0):
            sys.exit(f"нет шага или ответа: {q['id']}")
    return out, dropped


def main() -> None:
    questions, dropped = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    bank = {"built_at": date.today().isoformat(),
            "sources": {k: str(v) for k, v in
                        {"numbers": FULL1, "costs": COSTS, "talents": TALENTS, "mechanics": MECHANICS}.items()},
            "questions": questions}
    OUT.write_text(json.dumps(bank, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    subs = Counter(q["sub"] for q in questions)
    print(f"{len(questions)} вопросов → {OUT}; убрано с флагами: {dict(dropped)}")
    for sub, n in sorted(subs.items()):
        print(f"  {sub:18} {n}")


if __name__ == "__main__":
    main()
