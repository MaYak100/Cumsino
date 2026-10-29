#!/usr/bin/env python3
"""
Единый банк готовых вопросов для игры: финальные прогоны лабораторий → scripts/data/bank/questions.json.

Источники (по одному на категорию, см. docs/questions/README.md):
  numeric_lab/out/full1        — числа героев, предметов, нейтралок, чар (без вопросов с флагами);
  numeric_lab/out/costs2       — цены предметов (флаг «шаг очень мелкий» для цен не считается: порог 3% не для цен);
  numeric_lab/out/talents-v4   — «какой из этих талантов есть у героя» (стиль правды и подделок выровнен, честные
                                 обманки — шард / аганим / поведение по умолчанию, не больше одной; было talents-full);
  text_lab/out/full1/bank.json — механики после ручного курирования (curate.py).

Вопросы на статистике сюда не входят: сервер собирает их при каждом показе из scripts/data/stats/bank.json.
Категории, подкатегории и веса — server/src/game/questions/categories.ts; здесь у вопроса только `sub`.

id вопроса постоянный — по нему игра помнит, что уже было, хранит оценки и архив (Neon). Он строится из
смысла вопроса, а не из текста: правка формулировки id не меняет.
  num:<fact_id>:<level>      tal:<talent_id>      mech:<герой>:<способность>

Ручные правки — scripts/data/bank/overrides.json (переживают перегенерацию прогонов):
  {"questions": {<id>: {"drop": "причина"} | {"why": "причина", text?, step?, unit?, sub?, options?, comment?, ok?}}}
  options — целиком, options[0] правильный; ok — «проверка шага не применяется, потому что …».
  Неизвестный id или поле — ошибка сборки.

При сборке:
  - врождённые с ростом от уровня героя (hero_levelup в файлах героя) — ответ на 30-м уровне героя,
    текст обязан это называть (правка в overrides);
  - единицы приводятся к словарю (UNIT_ALIAS, UNIT_RULES): игрок видит их прямо в вариантах («175 HP», «12 сек.»);
  - проверки (падают, если не исправлено в overrides): ответ ≤ 3 шагов (правильный тогда никогда не бывает
    наибольшим), «ответ выдаёт круглость», латиница внутри русских слов, старые имена героев.

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
from decimal import Decimal
from fractions import Fraction
from pathlib import Path

import valve_kv

LAB = Path("scripts/generate")
FULL1 = LAB / "numeric_lab/out/full1/resolved.json"
COSTS = LAB / "numeric_lab/out/costs2/resolved.json"
TALENTS = LAB / "numeric_lab/out/talents-v4/questions.json"
# честная обманка в талантах (вердикт второго прохода) — объясняем после ответа, почему это не талант
DECOY_NOTE = {"shard": "это Aghanim's Shard", "scepter": "это Aghanim's Scepter",
              "default": "так способность работает и без таланта"}
MECHANICS = LAB / "text_lab/out/full1/bank.json"
OVERRIDES = Path("scripts/data/bank/overrides.json")
HERO_FILES = Path("scripts/data/dota/game/scripts/npc/heroes")
ABILITIES = Path("scripts/data/dota/abilities.json")
OUT = Path("scripts/data/bank/questions.json")

IGNORED_FLAGS = {"costs": re.compile(r"^шаг очень мелкий")}
MECH_SUB = {"how": "mech_how", "interaction": "mech_interaction", "false_fact": "mech_false_fact",
            "whose": "mech_how"}   # «чья механика» — 4 вопроса, отдельной колодой повторялись бы каждые пару игр

MAX_HERO_LEVEL = 30
LEVELUP_FIELD = {"cd": "AbilityCooldown"}   # имя факта в прогоне → ключ в AbilityValues

OVERRIDE_FIELDS = {"why", "drop", "text", "step", "unit", "sub", "options", "comment", "ok"}

# --- единицы -------------------------------------------------------------------------------------------------

UNIT_ALIAS = {"x": "×", "× интеллект": "× интеллекта", "ударов": "атак"}
COUNT_WORDS = {"духов", "отскоков", "стаков", "зарядов", "пульсов", "взрывов", "ударов", "целей", "паутин",
               "колючек", "лучей"}
# для «ед.» и «шт.»: первое совпадение по тексту вопроса (в нижнем регистре)
UNIT_RULES = [
    (r"\b(атак|ударов) героев\b|сколько атак\b|атак нужно|атак должен", "атак"),
    (r"(реген|регенерац|в секунду).*\bман|\bман\w*.*(реген|регенерац|в секунду)", "маны/сек."),
    (r"реген|регенерац|в секунду", "HP/сек."),
    (r"брон", "брони"),
    (r"скорост\w* атаки", "скорости атаки"),
    (r"скорост\w* передвижения", "скорости"),
    (r"\bман", "маны"),
    (r"ко всем атрибутам|к каждому атрибуту", "к атрибутам"),
    (r"ловкост", "ловкости"),
    (r"\bсил[ыу]\b", "силы"),
    (r"интеллект", "интеллекта"),
    (r"здоров|\bhp\b|\bхп\b|лечит|барьер|щит", "HP"),
]
UNITS = {"%", "сек.", "урона", "золота", "золота в минуту", "опыта", "×", "× ловкости", "× интеллекта", "атак",
         "раз", "маны", "маны/сек.", "HP", "HP/сек.", "брони", "скорости атаки", "скорости", "силы", "ловкости",
         "интеллекта", "к атрибутам", *COUNT_WORDS}
INTEGER_UNITS = {"атак", "раз", *COUNT_WORDS}
OVERRIDE_ONLY_UNITS = {"ед."}   # только явной правкой: когда ни одно слово не подходит

# --- проверки текста -----------------------------------------------------------------------------------------

MIXED_WORD = re.compile(r"\b\w*(?:[а-яё][a-z]|[a-z][а-яё])\w*\b", re.I)
# старые и внутренние имена (модель пишет имя героя по памяти); текущие — scripts/data/dota/heroes.json
LEGACY_HERO_NAMES = re.compile(r"\b(Outworld Destroyer|Obsidian Destroyer|Skeleton King|Windrunner|Furion|Necrolyte|"
                               r"Nevermore|Rattletrap|Zuus|Magnataur|Doom Bringer|Lord of Avernus)\b")


def run_questions(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    (key,) = data.keys()   # одна модель в финальном прогоне
    return data[key]


def fmt_num(v: float) -> str:
    return f"{v:g}"


def with_unit(v, unit: str) -> str:   # как shared/src/units.ts
    return f"{fmt_num(v)}{unit}" if unit in ("%", "×") else f"{fmt_num(v)} {unit}"


def to_number(d: Decimal):
    d = d.normalize()
    return int(d) if d == d.to_integral_value() else float(d)


HEAL_TEXT = re.compile(r"восстанавлива|лечит|\bHP\b")


def hero_sub(q: dict, unit: str) -> str:
    field = q["fact_id"].split(":")[-1]
    if re.search(r"\bBAT\b|время атаки", q["question"]):
        return "hero_other"   # BAT в секундах, но это не длительность и не кд
    if unit == "сек.":
        return "hero_time"   # кулдауны (21 вопрос) и длительности вместе — время в секундах
    if unit == "%":
        return "hero_pct"
    if unit == "урона" or (("damage" in field or "dmg" in field) and not HEAL_TEXT.search(q["question"])):
        return "hero_damage"   # поле «*_damage» бывает и лечением (Demonic Cleanse) — его в прочие
    return "hero_other"


def normalize_unit(unit: str, text: str) -> str | None:
    unit = UNIT_ALIAS.get(unit, unit)
    if unit not in ("ед.", "шт."):
        return unit
    t = text.lower()
    if unit == "шт.":
        m = re.search(r"сколько (?:максимум )?(\w+)", t)
        if m and m.group(1) in COUNT_WORDS:
            return m.group(1)
        if m and m.group(1) == "атак":
            return "атак"
    for pattern, u in UNIT_RULES:
        if re.search(pattern, t):
            return u
    return None


# --- врождённые с ростом от уровня героя ----------------------------------------------------------------------

def hero_levelups() -> dict[tuple[str, str], tuple[Decimal, Decimal, int]]:
    """(способность, ключ) → (value, hero_levelup, levelup_interval) из сырых файлов героев.

    Значение на уровне героя L = value + hero_levelup · ⌊L / levelup_interval⌋ (интервал по умолчанию 1).
    Сверено с патчноутами (scripts/data/dota/patchnotes.json): «2.5/3/3.5/4% → 3.45% + 0.05% per level» (Static
    Field, на 1-м уровне 3.5%), «Cooldown changed from 7.75s − 0.25s per level up to 8s − 0.25s per level» (Kez:
    тот же 1-й уровень, другая запись), «2% per 3 level ups → 2% per 3 levels: прибавки на 3/6/9…, на 30-м ещё
    одна» (Phantom Lancer)."""
    out = {}

    def walk(node: dict, name: str | None) -> None:
        values = node.get("AbilityValues")
        if name and isinstance(values, dict):
            for key, v in values.items():
                if isinstance(v, dict) and "hero_levelup" in v:
                    out[(name, key)] = (Decimal(v.get("value") or "0"), Decimal(v["hero_levelup"]),
                                        int(v.get("levelup_interval") or 1))
        for k, v in node.items():
            if isinstance(v, dict):
                walk(v, k)

    for path in sorted(HERO_FILES.glob("npc_dota_hero_*.txt")):
        walk(valve_kv.parse_file(path), None)
    return out


def apply_levelup(q: dict, out: dict, levelups: dict, names: dict) -> bool:
    ability, field = q["fact_id"].split(":")
    if "@" in field:   # бонус аганима / шарда — отдельное число, от уровня не зависит
        return False
    lv = levelups.get((ability, LEVELUP_FIELD.get(field, field)))
    if not lv:
        return False
    base, inc, interval = lv
    if Decimal(str(q["answer"])) != base:
        sys.exit(f"{out['id']}: ответ прогона {q['answer']} ≠ базе {base} из файла героя")
    answer = to_number(base + inc * (MAX_HERO_LEVEL // interval))
    every = "за каждый уровень героя" if interval == 1 else f"каждые {interval} уровня героя" \
        if interval < 5 else f"каждые {interval} уровней героя"
    sign = "−" if inc < 0 else "+"
    unit = out["unit"]
    inc_text = with_unit(to_number(abs(inc)), unit)
    out["answer"] = answer
    out["comment"] = (f"{names.get(ability, ability)}: {with_unit(to_number(base), unit)} {sign} {inc_text} {every}"
                      f" → {with_unit(answer, unit)} на {MAX_HERO_LEVEL}-м")
    return True


# --- проверки шага -------------------------------------------------------------------------------------------

ROUND_LEVELS = [(1000, 6), (100, 5), (50, 4), (25, 3), (10, 3), (5, 2), (1, 1)]
COSTS_ROUND_CAP = 5   # цены: шаг 100 при ответе 2000 — нормально, все варианты кратны 100


def round_level(x: Fraction, answer: Fraction | None = None) -> int:
    """Насколько круглое число: 0 — дробное, 1 — целое, 2 — кратно 5, 3 — 10 или 25, 4 — 50, 5 — 100, 6 — 1000.
    Для ответа единица u > 1 засчитывается, только если ответ ≥ 2u: 5 среди 4/6/7 не выделяется."""
    for u, level in ROUND_LEVELS:
        if x.denominator == 1 and x % u == 0 and (answer is None or u == 1 or x >= 2 * u):
            return level
    return 0


def layouts(answer: Fraction, step: Fraction, n: int = 4) -> list[list[Fraction]]:
    """Все раскладки makeStepOptions (server/src/game/questions/stepOptions.ts): фейки при каждой позиции ответа."""
    return [[answer + (i - p) * step for i in range(n) if i != p] for p in range(n) if answer - p * step > 0]


def step_problems(q: dict) -> list[str]:
    a, s = Fraction(str(q["answer"])), Fraction(str(q["step"]))
    problems = []
    if a <= 3 * s:
        problems.append(f"ответ {q['answer']} ≤ 3 × шаг {q['step']}: правильный никогда не бывает наибольшим")
    cap = COSTS_ROUND_CAP if q["sub"] == "costs" else 6
    la = min(round_level(a, a), cap)
    fakes = [f for lay in layouts(a, s) for f in lay]
    if la and fakes and max(min(round_level(f), cap) for f in fakes) < la:
        problems.append(f"ответ {q['answer']} круглее любого фейка при шаге {q['step']}")
    if q["unit"] in INTEGER_UNITS and s.denominator != 1:
        problems.append(f"дробный шаг {q['step']} у целой единицы «{q['unit']}»")
    return problems


def text_problems(q: dict) -> list[str]:
    problems = []
    texts = [q["text"], q.get("comment") or "", *q.get("options", [])]
    for t in texts:
        for m in MIXED_WORD.finditer(t):
            problems.append(f"латиница и кириллица в одном слове: «{m.group(0)}»")
        for m in LEGACY_HERO_NAMES.finditer(t):
            problems.append(f"старое имя героя: «{m.group(0)}»")
    return problems


# --- ручные правки -------------------------------------------------------------------------------------------

def load_overrides() -> dict[str, dict]:
    data = json.loads(OVERRIDES.read_text(encoding="utf-8"))["questions"]
    for qid, o in data.items():
        extra = set(o) - OVERRIDE_FIELDS
        if extra:
            sys.exit(f"overrides {qid}: неизвестные поля {sorted(extra)}")
        if not (isinstance(o.get("drop"), str) and o["drop"]) and not (isinstance(o.get("why"), str) and o["why"]):
            sys.exit(f"overrides {qid}: нужна причина — drop: «…» или why: «…»")
    return data


def apply_override(q: dict, o: dict) -> None:
    for key in ("text", "sub", "comment"):
        if key in o:
            q[key] = o[key]
    if q["kind"] == "number":
        if "options" in o:
            sys.exit(f"overrides {q['id']}: options у числового вопроса")
        for key in ("step", "unit"):
            if key in o:
                q[key] = o[key]
    else:
        if "step" in o or "unit" in o:
            sys.exit(f"overrides {q['id']}: step/unit у вопроса с вариантами")
        if "options" in o:
            q["options"] = o["options"]


def build() -> tuple[list[dict], Counter, list[str]]:
    dropped: Counter = Counter()
    out: list[dict] = []
    levelups = hero_levelups()
    names = {k: v.get("dname") or k for k, v in json.loads(ABILITIES.read_text(encoding="utf-8")).items()}
    levelup_ids: set[str] = set()

    def number_question(q: dict, sub: str | None, topic: str) -> dict:
        unit = normalize_unit(q["unit"], q["question"])
        out_q = {"id": f"num:{q['fact_id']}:{q['level']}", "sub": sub, "kind": "number", "text": q["question"],
                 "topic": topic, "answer": q["answer"], "step": q["step"], "unit": unit}
        if unit is None:
            out_q["unit"] = q["unit"]
            out_q["_unit_unknown"] = q["unit"]
        elif out_q["sub"] is None:
            out_q["sub"] = hero_sub(q, unit)
        values = q.get("all_values") or []
        if len(values) > 1:   # по уровням — после ответа видно, откуда взялось число
            out_q["comment"] = f"{q['entity']}: {' / '.join(fmt_num(v) for v in values)} {out_q['unit']} по уровням"
        if q.get("category") == "heroes" and apply_levelup(q, out_q, levelups, names):
            levelup_ids.add(out_q["id"])
        return out_q

    for q in run_questions(FULL1):
        cat = q["category"]
        if flagged(q, cat):
            dropped[cat] += 1
            continue
        if cat == "heroes":
            out.append(number_question(q, None, q["entity"].split(" · ")[0]))
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
            comment = f"Настоящий талант: {real[0]['text']} ({real[0]['original']})."
            for o in q["options"]:
                if o["kind"] != "real" and o.get("verdict") in DECOY_NOTE:
                    comment += f" «{o['text']}» — {DECOY_NOTE[o['verdict']]}."
            out.append({"id": f"tal:{real[0]['talent_id']}", "sub": "talents_has", "kind": "choice",
                        "text": q["question"], "topic": q["hero"], "options": [real[0]["text"], *fakes],
                        "comment": comment})

    for q in json.loads(MECHANICS.read_text(encoding="utf-8")):
        opts = [q["answer"], *[o for o in q["options"] if o != q["answer"]]]
        assert len(opts) == 4, q
        out.append({"id": f"mech:{q['hero']}:{q['ability']}", "sub": MECH_SUB[q["format"]], "kind": "choice",
                    "text": q["question"], "topic": q["hero"], "options": opts, "comment": q["comment"]})

    ids = Counter(q["id"] for q in out)
    dup = [i for i, n in ids.items() if n > 1]
    if dup:
        sys.exit(f"повторяющиеся id: {dup[:10]}")

    overrides = load_overrides()
    unknown = sorted(set(overrides) - set(ids))
    if unknown:
        sys.exit(f"overrides: нет таких вопросов: {unknown}")

    errors: list[str] = []
    kept: list[dict] = []
    for q in out:
        o = overrides.get(q["id"], {})
        if "drop" in o:
            dropped["overrides"] += 1
            continue
        apply_override(q, o)
        if q.pop("_unit_unknown", None) is not None and "unit" not in o:
            errors.append(f"{q['id']}: единица «{q['unit']}» не распознана — unit в overrides ({q['text']})")
        if q["sub"] is None:
            q["sub"] = hero_sub({"fact_id": q["id"].split(":", 1)[1].rsplit(":", 1)[0], "question": q["text"]},
                                q["unit"])
        problems = text_problems(q)
        if q["kind"] == "number":
            if not (q["step"] > 0 and q["answer"] > 0):
                problems.append("нет шага или ответа")
            allowed = UNITS | (OVERRIDE_ONLY_UNITS if "unit" in o else set())
            if q["unit"] not in allowed:
                problems.append(f"единица «{q['unit']}» не из словаря")
            if q["id"] in levelup_ids and f"{MAX_HERO_LEVEL}-м уровне героя" not in q["text"]:
                problems.append(f"значение растёт с уровнем героя — в тексте нужно «на {MAX_HERO_LEVEL}-м уровне героя»"
                                f" (ответ {q['answer']}, {q.get('comment')})")
            if "ok" not in o:
                problems += step_problems(q)
        else:
            if len(q["options"]) != 4 or len(set(q["options"])) != 4:
                problems.append("нужно 4 разных варианта")
        errors += [f"{q['id']}: {p} — {q['text']}" for p in problems]
        kept.append(q)
    return kept, dropped, errors


def flagged(q: dict, category: str) -> bool:
    ignore = IGNORED_FLAGS.get(category)
    return any(not (ignore and ignore.match(f)) for f in q.get("flags") or [])


def main() -> None:
    questions, dropped, errors = build()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(f"{len(errors)} ошибок — исправь в {OVERRIDES}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    bank = {"built_at": date.today().isoformat(),
            "sources": {k: str(v) for k, v in
                        {"numbers": FULL1, "costs": COSTS, "talents": TALENTS, "mechanics": MECHANICS,
                         "overrides": OVERRIDES}.items()},
            "questions": questions}
    OUT.write_text(json.dumps(bank, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    subs = Counter(q["sub"] for q in questions)
    print(f"{len(questions)} вопросов → {OUT}; убрано: {dict(dropped)}")
    for sub, n in sorted(subs.items()):
        print(f"  {sub:18} {n}")


if __name__ == "__main__":
    main()
