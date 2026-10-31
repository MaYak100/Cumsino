#!/usr/bin/env python3
"""
Единый банк готовых вопросов для игры: финальные прогоны лабораторий → scripts/data/bank/questions.json.

Источники (по одному на категорию, см. docs/questions/README.md):
  numeric_lab/out/full1        — числа героев, предметов, нейтралок, чар (без вопросов с флагами);
  numeric_lab/out/costs2       — цены предметов (флаг «шаг очень мелкий» для цен не считается: порог 3% не для цен);
  numeric_lab/out/talents-v5   — «какой из этих талантов есть у героя» (правда — строка игры дословно, подделки
                                 в стиле локализации, три разных типа эффекта; честные обманки — шард / аганим /
                                 поведение по умолчанию, не больше одной; было talents-v4, talents-full);
  text_lab/out/full1/bank.json — механики после ручного курирования (curate.py).

Вопросы на статистике сюда не входят: сервер собирает их при каждом показе из scripts/data/stats/bank.json.
Категории, подкатегории и веса — server/src/game/questions/categories.ts; здесь у вопроса только `sub`.

Тема вопроса в игре — «субъект» + «аспект» (categories.ts, picker.ts decorate). topic здесь — субъект: герой (числа
способностей, механики, таланты), предмет (числа предметов и цены — без аспекта, чтобы тема не выдавала цену),
нейтралка или чара. aspect — только если отличается от аспекта подкатегории: у чар «чара» (у подкатегории
neutrals — «нейтралка»).

id вопроса постоянный — по нему игра помнит, что уже было, хранит оценки и архив (Neon). Он строится из
смысла вопроса, а не из текста: правка формулировки id не меняет.
  num:<fact_id>:<level>      tal:<talent_id>      mech:<герой>:<способность>

Ручные правки — scripts/data/bank/overrides.json (переживают перегенерацию прогонов):
  {"questions": {<id>: {"drop": "причина"} | {"why": "причина", text?, step?, unit?, ceil?, sub?, options?, comment?, ok?,
                                                topic?, keep?, scale_ok?}}}
  options — целиком, options[0] правильный; ok — «проверка шага не применяется, потому что …»;
  keep — «правило-фильтр (DROP_RULES) этот вопрос не выкидывает, потому что …» (keep без сработавшего правила — ошибка);
  topic — субъект темы руками, когда тема выдаёт ответ, а topic_gives_answer этого не ловит («Герои»);
  ceil — все варианты строго меньше (проценты, где 100% и больше невозможно: маг. резист, замедление, промах);
  scale_ok — «step мельче шага по масштабу, потому что …» (исключение пользователя у секунд; только вместе со step,
  и step обязан быть мельче правила — иначе ошибка).
  Неизвестный id или поле — ошибка сборки.

При сборке:
  - правила-фильтры (DROP_RULES, решение 2026-10-31 после игры с друзьями) выкидывают числовые вопросы:
      short_time      — секунды и ответ < 5 (станы, хексы, касты с шагом 0.2–0.6 с: «видел или не видел», без логики;
                        длительности от 5 с остаются — чем дольше, тем интуитивнее);
      innate_levelup  — врождёнка, растущая с уровнем героя (hero_levelup в файлах героя): число на 30-м уровне не
                        вывести — такие врождёнки перегенерировать механиками «что делает врождёнка»;
      mech_seed       — число из тултипа без логики, семя для механики (поле seed в архиве): hero_damage — аганим /
                        шард, урон в секунду, порог / коэффициент; hero_pct — процент в секунду без аганима и список
                        id MECH_SEED_IDS (дроби за удар, детали, иллюзии, коэффициенты в урон, замедления);
                        hero_other — только список id (скорость атаки, реген в секунду, хил за единицу,
                        коэффициенты, второстепенное, броня 6–8);
    спасти вопрос от правила — keep в overrides;
  - всё выкинутое (флаги прогона, тип таланта, drop из overrides, правила) — в scripts/data/bank/archive.json с
    причиной: в игру не идёт, но видно, что и почему ушло;
  - врождённые с ростом от уровня героя (hero_levelup в файлах героя) — ответ на 30-м уровне героя,
    текст обязан это называть (правка в overrides; сейчас их выкидывает innate_levelup);
  - единицы приводятся к словарю (UNIT_ALIAS, UNIT_RULES): игрок видит их прямо в вариантах («175 HP», «12 сек.»);
  - шаг по масштабу (решение 2026-10-31): у секунд шаг ≈ 20% ответа красивым числом (строго меньше 20%, минимум
    1 сек., без утечки круглостью — scale_step); правило только поднимает шаг, step в overrides мельче — ошибка
    (кроме scale_ok — исключения пользователя: BKB 95 сек. — шаг 5, Black Hole 180 сек. — шаг 20);
  - проверки (падают, если не исправлено в overrides): ответ ≤ 3 шагов от нуля или ceil (место ответа невозможно;
    принятые ok печатаются), ответ ≤ 5 шагов (место честное, 25%, но наверху раскладка зажата у нуля; исключение — 5 сек. при
    шаге 1 сек.), то же у потолка ceil, «ответ выдаёт круглость», латиница внутри русских слов, старые имена героев.

Формат:
  {built_at, sources, questions: [
    {id, sub, kind: "number", text, topic, aspect?, answer, step, unit, ceil?, comment?},   # MC по шагу и «ближе всех»
    {id, sub, kind: "choice", text, topic, aspect?, options, comment?}               # options[0] — правильный
  ]}
  archive.json: {built_at, dropped: {причина: число}, questions: [{id, sub, kind, text, answer?, step?, unit?, options?,
                 comment?, by, reason, seed?, replaced?}]}
    by — flags (флаги прогона) / talents (флаги проверки талантов) / overrides (drop) / rule:<имя> (DROP_RULES);
    seed — семя для генерации механик: innate (innate_levelup) / виды mech_seed (aghanim, dps, threshold, … — MECH_SEED);
    replaced — вопрос с тем же id есть в банке: отбракован черновик таланта, а в игре вариант из круга догенерации
    (поэтому id в архиве может повторяться)

  python scripts/build_question_bank.py
"""

import json
import re
import sys
from itertools import accumulate, product
from collections import Counter
from datetime import date
from decimal import Decimal
from fractions import Fraction
from pathlib import Path

import valve_kv

LAB = Path("scripts/generate")
FULL1 = LAB / "numeric_lab/out/full1/resolved.json"
COSTS = LAB / "numeric_lab/out/costs2/resolved.json"
TALENTS = LAB / "numeric_lab/out/talents-v5/questions.json"
# честная обманка в талантах (вердикт второго прохода) — объясняем после ответа, почему это не талант
DECOY_NOTE = {"shard": "это Aghanim's Shard", "scepter": "это Aghanim's Scepter",
              "default": "так способность работает и без таланта"}
MECHANICS = LAB / "text_lab/out/full1/bank.json"
OVERRIDES = Path("scripts/data/bank/overrides.json")
HERO_FILES = Path("scripts/data/dota/game/scripts/npc/heroes")
ABILITIES = Path("scripts/data/dota/abilities.json")
OUT = Path("scripts/data/bank/questions.json")
ARCHIVE = Path("scripts/data/bank/archive.json")

IGNORED_FLAGS = {"costs": re.compile(r"^шаг очень мелкий")}
MECH_SUB = {"how": "mech_how", "interaction": "mech_interaction", "false_fact": "mech_false_fact",
            "whose": "mech_how"}   # «чья механика» — 4 вопроса, отдельной колодой повторялись бы каждые пару игр

MAX_HERO_LEVEL = 30
LEVELUP_FIELD = {"cd": "AbilityCooldown"}   # имя факта в прогоне → ключ в AbilityValues

OVERRIDE_FIELDS = {"why", "drop", "text", "step", "unit", "ceil", "sub", "options", "comment", "ok", "topic", "keep",
                   "scale_ok"}

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
UNITS = {"%", "сек.", "урона", "урона/сек.", "золота", "золота в минуту", "опыта", "×", "× ловкости", "× интеллекта", "атак",
         "раз", "маны", "маны/сек.", "HP", "HP/сек.", "брони", "скорости атаки", "скорости", "силы", "ловкости",
         "интеллекта", "к атрибутам", *COUNT_WORDS}
INTEGER_UNITS = {"атак", "раз", *COUNT_WORDS}
OVERRIDE_ONLY_UNITS = {"ед."}   # только явной правкой: когда ни одно слово не подходит

# урон в секунду: модель пишет «урона», а это поток — «урона/сек.» (как HP/сек.); «без учёта урона в секунду» — нет
DPS_TEXT = re.compile(r"урон\w* в секунду|урона за секунду")
DPS_NOT = re.compile(r"без учёта урона в секунду")

# --- проверки текста -----------------------------------------------------------------------------------------

# Опечатки модели, которые повторятся при перегенерации, — правятся при сборке во всех текстах (вопрос, comment,
# варианты). «кд» — среднего рода, как в большинстве вопросов (36 «Какое кд» против 4 «Какой кд»).
TEXT_FIXES = [
    (re.compile(r"\b([Кк])акой кд\b"), r"\1акое кд"),
    (re.compile(r"\b([Нн])асколько (увеличива|уменьша|сокраща|снижа|усилива|продлева|режет|ускоря|замедля)"),
     r"\1а сколько \2"),
    (re.compile(r"\b([Дд])о скольки\b"), r"\1о скольких"),
    (re.compile(r"(\d) %"), r"\1%"),   # «16 %» → «16%», как в вариантах (withUnit)
]


def fix_text(t: str) -> str:
    for pattern, repl in TEXT_FIXES:
        t = pattern.sub(repl, t)
    return t


MIXED_WORD = re.compile(r"\b\w*(?:[а-яё][a-z]|[a-z][а-яё])\w*\b", re.I)
# старые и внутренние имена (модель пишет имя героя по памяти); текущие — scripts/data/dota/heroes.json
LEGACY_HERO_NAMES = re.compile(r"\b(Outworld Destroyer|Obsidian Destroyer|Skeleton King|Windrunner|Furion|Necrolyte|"
                               r"Nevermore|Rattletrap|Zuus|Magnataur|Doom Bringer|Lord of Avernus)\b")
CURRENT = Path("scripts/data/dota/current.json")


def innate_abilities() -> set[str]:
    """Ключи врождённых способностей: вопрос про них называет её прямо — «врождёнка X у героя», как нейтралки."""
    heroes = json.loads(CURRENT.read_text(encoding="utf-8"))["heroes"]
    return {a["key"] for h in heroes.values() for a in h["abilities"] if a.get("role") == "innate"}


INNATE = innate_abilities()


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
    if unit in ("урона", "урона/сек.") or (("damage" in field or "dmg" in field) and not HEAL_TEXT.search(q["question"])):
        return "hero_damage"   # поле «*_damage» бывает и лечением (Demonic Cleanse) — его в прочие
    return "hero_other"


def normalize_unit(unit: str, text: str) -> str | None:
    unit = UNIT_ALIAS.get(unit, unit)
    if unit == "урона" and DPS_TEXT.search(text) and not DPS_NOT.search(text):
        return "урона/сек."
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

# Варианты (makeStepOptions, server/src/game/questions/stepOptions.ts; с 2026-10-31): сначала равновероятно — место
# ответа по величине, потом промежутки 1 или 2 шага (двойной — 66%) среди раскладок, которые с этим местом умещаются в
# (0, ceil). Наибольшим ответ может быть, только если под ним влезают три промежутка: при ответе в k шагов от нуля
#   k ≤ 3 — место невозможно (сервер его исключает, остальные три — по 33%) → ошибка сборки RANK_STEPS: «ответ никогда
#          не наибольший» — подсказка в каждом показе; ok (меньшее зло) сборка печатает при каждом запуске;
#   3 < k ≤ 5 — место честное (25%), но с ответом наверху раскладка зажата: при k = 4 — только 1-1-1, при k = 5 — без
#          двух двойных; плотная кучка у нуля выдаёт наибольший → ошибка MIN_STEPS (ok — можно, с причиной);
#   k > 5 — проверка проходит; при 5 < k ≤ 6 у наибольшего нельзя только 2-2-2.
# То же зеркально у потолка ceil (ответ наименьший). До 2026-10-31 сервер выбирал сначала промежутки, потом место
# среди подходящих — ответ в 5–6 шагах был наибольшим в 18% показов (27 / 27 / 27 / 18), в 5 шагах — в 7%, в 4 — в 1%.
MIN_STEPS = 5
RANK_STEPS = 3
DOUBLE_GAP_CHANCE = Fraction(66, 100)   # как в stepOptions.ts

ROUND_LEVELS = [(1000, 6), (100, 5), (50, 4), (25, 3), (10, 3), (5, 2), (1, 1)]
COSTS_ROUND_CAP = 5   # цены: шаг 100 при ответе 2000 — нормально, все варианты кратны 100


def round_level(x: Fraction, answer: Fraction | None = None) -> int:
    """Насколько круглое число: 0 — дробное, 1 — целое, 2 — кратно 5, 3 — 10 или 25, 4 — 50, 5 — 100, 6 — 1000.
    Для ответа единица u > 1 засчитывается, только если ответ ≥ 2u: 5 среди 4/6/7 не выделяется."""
    for u, level in ROUND_LEVELS:
        if x.denominator == 1 and x % u == 0 and (answer is None or u == 1 or x >= 2 * u):
            return level
    return 0


def gap_layouts(n: int = 4) -> list[tuple[list[int], Fraction]]:
    """Все раскладки промежутков (1 или 2 шага) → (смещения от наименьшего, вероятность): [1, 2, 1] → [0, 1, 3, 4]."""
    out = []
    for gaps in product((1, 2), repeat=n - 1):
        chance = Fraction(1)
        for g in gaps:
            chance *= DOUBLE_GAP_CHANCE if g == 2 else 1 - DOUBLE_GAP_CHANCE
        out.append(([0, *accumulate(gaps)], chance))
    return out


def possible_ranks(answer: Fraction, step: Fraction, n: int = 4, ceil: Fraction | None = None) -> list[int]:
    """Места ответа по возрастанию, для которых хоть одна раскладка умещается в (0, ceil)."""
    return [p for p in range(n) if any(fits(answer, step, offs, p, ceil) for offs, _ in gap_layouts(n))]


def fits(answer: Fraction, step: Fraction, offsets: list[int], p: int, ceil: Fraction | None) -> bool:
    return all(0 < answer + (o - offsets[p]) * step and (ceil is None or answer + (o - offsets[p]) * step < ceil)
               for o in offsets)


def shows(answer: Fraction, step: Fraction, n: int = 4, ceil: Fraction | None = None
          ) -> list[tuple[Fraction, int, list[Fraction]]]:
    """Все показы makeStepOptions (server/src/game/questions/stepOptions.ts) с вероятностями: (вероятность, место ответа
    по возрастанию, варианты по возрастанию). Место — равновероятно среди возможных (possible_ranks), раскладка
    промежутков — по весам 66 / 34 среди умещающихся с этим местом; не умещается ничего — ответ наименьший,
    промежутки по одному шагу."""
    ranks = possible_ranks(answer, step, n, ceil)
    if not ranks:
        return [(Fraction(1), 0, [answer + i * step for i in range(n)])]
    out = []
    for p in ranks:
        ok = [(offs, chance) for offs, chance in gap_layouts(n) if fits(answer, step, offs, p, ceil)]
        total = sum(chance for _, chance in ok)
        out += [(chance / total / len(ranks), p, [answer + (o - offs[p]) * step for o in offs]) for offs, chance in ok]
    return out


def layouts(answer: Fraction, step: Fraction, n: int = 4, ceil: Fraction | None = None) -> list[list[Fraction]]:
    """Фейки каждого возможного показа."""
    return [[v for i, v in enumerate(values) if i != p] for _, p, values in shows(answer, step, n, ceil)]


def round_cap(q: dict) -> int:
    return COSTS_ROUND_CAP if q["sub"] == "costs" else 6


def round_leak(answer: Fraction, step: Fraction, cap: int = 6, ceil: Fraction | None = None) -> Fraction:
    """Доля показов, где ответ круглее всех трёх фейков (13 среди 15.5 / 20.5 / 25.5; 75 среди 65 / 85 / 95)."""
    la = min(round_level(answer, answer), cap)
    if not la:
        return Fraction(0)
    return sum((chance for chance, p, values in shows(answer, step, ceil=ceil)
                if max(min(round_level(v), cap) for i, v in enumerate(values) if i != p) < la), Fraction(0))


# --- шаг по масштабу: секунды ---------------------------------------------------------------------------------
# Решение пользователя 2026-10-31: длительности и кд — ориентировка по масштабу, а не память до десятых. Шаг ≈ 20%
# ответа, красивым числом, минимум 1 сек. (даже у 5.25 сек.), дробность ответа не важна. Шаг строго меньше 20%: при
# ровно 20% ответ = 5 шагов, и наверху раскладка зажата (MIN_STEPS выше); меньше 20% — у наибольшего нельзя только 2-2-2.
# Кандидаты — красивые шаги в [10%, 20%) ответа; из них тот, при котором ответ реже всего выделяется круглостью
# (round_leak), при равенстве — крупнее. Утечка у лучшего больше SEC_LEAK_MAX (75 при шаге 10 — единственный кратный 25
# в 78% показов) — шаг не трогаем, только не мельче 1 сек. Правило только поднимает шаг: шаг из прогона или overrides
# крупнее — остаётся; step в overrides мельче шага по масштабу — ошибка сборки (правка устарела).
# Что выходит (целые ответы, кратные 5, — свои шаги, чтобы ответ не выделялся круглостью):
#   5–10 → 1; 10–12.5 → 2; 12.5–15 → 2.5 (целые 13, 14 → 2); 15–25 → 3 (15, 25 → 2.5); 25–50 → 5; 50–75 → 10;
#   75–100 → 15 (80, 90 → 10); 100–125 → 20; 125–150 → 25 (130, 140 → 20); 150–250 → 30 (175, 225, 250 → 25); 250+ → 50;
#   ровно 10, 20, 75, 100, 125, 200 — не трогаем (любой кандидат выдаёт ответ круглостью).
SEC_UNIT = "сек."
SEC_STEPS = [Fraction(x) for x in ("1", "2", "2.5", "3", "5", "10", "15", "20", "25", "30", "50", "100")]
SEC_MIN_STEP = Fraction(1)
SEC_MAX_SHARE = Fraction(1, MIN_STEPS)   # шаг < 20% ответа ⇔ ответ дальше MIN_STEPS шагов от нуля
SEC_MIN_SHARE = Fraction(1, 10)
SEC_LEAK_MAX = Fraction(12, 100)   # как у шага 2.5 при ответе, кратном 5 (15 среди 12.5 / 17.5 / 22.5 — 11% показов)


def scale_step(q: dict) -> Fraction | None:
    """Шаг по масштабу для вопроса в секундах (без учёта текущего шага) или None — подходящего нет."""
    a = Fraction(str(q["answer"]))
    ceil = Fraction(str(q["ceil"])) if q.get("ceil") is not None else None
    if a * SEC_MAX_SHARE <= SEC_MIN_STEP:
        cands = [SEC_MIN_STEP]   # 5 сек.: меньше 1 сек. не берём, хоть ответ и 5 шагов (step_problems это знает)
    else:
        cands = [s for s in SEC_STEPS if max(SEC_MIN_STEP, a * SEC_MIN_SHARE) <= s < a * SEC_MAX_SHARE]
    scored = sorted(((round_leak(a, s, round_cap(q), ceil), -s) for s in cands))
    if not scored or scored[0][0] > SEC_LEAK_MAX:
        return None
    return -scored[0][1]


def sec_floor_forced(q: dict) -> bool:
    """Шаг упёрся в минимум 1 сек. у ответа ≤ 5 сек.: ответ ровно в MIN_STEPS шагах — принято решением пользователя."""
    a, s = Fraction(str(q["answer"])), Fraction(str(q["step"]))
    return q["unit"] == SEC_UNIT and s == SEC_MIN_STEP and a * SEC_MAX_SHARE <= SEC_MIN_STEP


def rank_problems(q: dict) -> list[str]:
    """Место ответа, невозможное ни при одной раскладке (ответ ≤ RANK_STEPS шагов от нуля или ceil): игрок, знающий
    это, отбрасывает крайний вариант в каждом показе. Без ok — ошибка; с ok (шаг мельче выдаёт ответ круглостью) —
    сборка печатает вопрос при каждом запуске."""
    a, s = Fraction(str(q["answer"])), Fraction(str(q["step"]))
    ceil = Fraction(str(q["ceil"])) if q.get("ceil") is not None else None
    ranks = possible_ranks(a, s, ceil=ceil)
    if len(ranks) == 4:
        return []
    missing = ", ".join({0: "наименьшим", 3: "наибольшим"}.get(p, f"{p + 1}-м") for p in range(4) if p not in ranks)
    where = f"ответ {q['answer']} при шаге {q['step']}" + (f" и потолке {q['ceil']}" if ceil is not None else "")
    return [f"{where} не бывает {missing} ни при одной раскладке (≤ {RANK_STEPS} шагов от края) — шаг мельче, drop "
            f"или ok с причиной"]


def step_problems(q: dict) -> list[str]:
    a, s = Fraction(str(q["answer"])), Fraction(str(q["step"]))
    ceil = Fraction(str(q["ceil"])) if q.get("ceil") is not None else None
    problems = []
    # секунды с ответом 5 сек.: шаг 1 сек. — жёсткий минимум (решение 2026-10-31), ответ наибольший в 7% показов
    if a <= MIN_STEPS * s and not sec_floor_forced(q):
        problems.append(f"ответ {q['answer']} ≤ {MIN_STEPS} × шаг {q['step']}: наибольший ответ — в зажатой раскладке у нуля")
    if ceil is not None and ceil - a <= MIN_STEPS * s:
        problems.append(f"до потолка {q['ceil']} от ответа {q['answer']} ≤ {MIN_STEPS} × шаг {q['step']}: "
                        f"наименьший ответ — в зажатой раскладке у потолка")
    cap = round_cap(q)
    la = min(round_level(a, a), cap)
    fakes = [f for lay in layouts(a, s, ceil=ceil) for f in lay]
    if la and fakes and max(min(round_level(f), cap) for f in fakes) < la:
        problems.append(f"ответ {q['answer']} круглее любого фейка при шаге {q['step']}")
    if q["unit"] in INTEGER_UNITS and s.denominator != 1:
        problems.append(f"дробный шаг {q['step']} у целой единицы «{q['unit']}»")
    return problems


# Словарь сленга (docs/questions/README.md, «Язык и сленг»): чего писать нельзя. Таланты не проверяются — у них правда
# и подделки в стиле строки локализации дословно.
SLANG = [(re.compile(p, re.I), rule) for p, rule in [
    (r"\bканал\w*|\bподдержани\w*|\bченнел\w*", "канал / поддержание → каст"),
    (r"\bневидим\w*", "невидимый → в инвизе"),
    (r"\bразвеива\w*|\bразвеян\w*|\bразвеять\b", "развеивание → диспел"),
    (r"\bоглуш\w*", "оглушение → стан"),
    (r"\bобезоруж\w*", "обезоруживание → дизарм"),
    (r"\bобездвиж\w*", "обездвиживание → рут"),
    (r"\bпревращени\w*", "превращение → хекс"),
    (r"\bвампиризм\w*", "вампиризм → лайфстил"),
    (r"\bсопротивлени\w* (?:эффект|маги)\w*", "сопротивление эффектам / магии → статус-резист / маг. резист"),
    (r"\bистинн\w* зрени\w*", "истинное зрение → просвет"),
    (r"\bкритическ\w* удар\w*", "критический удар → крит"),
    (r"\bперезарядк\w*", "перезарядка → кд"),
    (r"\bслоу\w*", "слоу → замедление"),
    (r"\bсайленс\w*", "сайленс → безмолвие"),
    (r"\bспелл-?амп\w*", "спелл-амп → увеличение урона заклинаний"),
    (r"\bхаст\w*", "«хаст» — выдумка, как в локализации"),
]]


def text_problems(q: dict) -> list[str]:
    problems = []
    texts = [q["text"], q.get("comment") or "", *q.get("options", [])]
    for t in texts:
        for m in MIXED_WORD.finditer(t):
            problems.append(f"латиница и кириллица в одном слове: «{m.group(0)}»")
        for m in LEGACY_HERO_NAMES.finditer(t):
            problems.append(f"старое имя героя: «{m.group(0)}»")
        if q["sub"] != "talents_has":
            for pattern, rule in SLANG:
                for m in pattern.finditer(t):
                    problems.append(f"не по словарю ({rule}): «{m.group(0)}»")
    if q["id"].startswith("num:") and q["id"].split(":")[1] in INNATE and "врождёнк" not in q["text"].lower():
        problems.append("врождённая способность: в тексте нужна «врождёнка X у героя»")
    return problems


# --- тема не должна выдавать ответ ---------------------------------------------------------------------------
# «Чья способность…» с вариантами-способностями разных героев: тема «Ogre Magi» выдаёт Ignite. Если герой темы
# владеет только верным вариантом, а неверные — чужие, субъект темы — «Герои» (как у пиков и банов: тема не повторяет
# вопрос). Владельцы — способности и имена героев из scripts/data/dota/current.json, самое длинное совпадение.

TOPIC_GROUP = "Герои"


def _owners_index() -> tuple[dict[str, set[str]], list[str]]:
    owner: dict[str, set[str]] = {}
    for h in json.loads(CURRENT.read_text(encoding="utf-8"))["heroes"].values():
        owner.setdefault(h["name"], set()).add(h["name"])
        for a in h["abilities"]:
            owner.setdefault(a["name"], set()).add(h["name"])
    return owner, sorted(owner, key=len, reverse=True)


def mentioned_heroes(text: str, owner: dict[str, set[str]], names: list[str]) -> set[str]:
    found: set[str] = set()
    taken: list[tuple[int, int]] = []
    for n in names:
        for m in re.finditer(r"(?<!\w)" + re.escape(n) + r"(?!\w)", text):
            if any(s < m.end() and m.start() < e for s, e in taken):
                continue
            taken.append((m.start(), m.end()))
            found |= owner[n]
    return found


def topic_gives_answer(q: dict, owner: dict[str, set[str]], names: list[str]) -> bool:
    hero = q["topic"]
    if q["kind"] != "choice" or hero not in owner:
        return False
    right = mentioned_heroes(q["options"][0], owner, names)
    wrong = [mentioned_heroes(o, owner, names) for o in q["options"][1:]]
    return hero in right and all(hero not in w for w in wrong) and any(w for w in wrong)


# --- правила-фильтры -----------------------------------------------------------------------------------------
# Решение пользователя 2026-10-31 по итогам игры с друзьями. Правило видит вопрос после правок overrides; первое
# сработавшее — причина в archive.json. Спасти вопрос от правила — keep в overrides (с причиной).

SHORT_TIME = 5   # сек.: короче — станы / хексы / касты с шагом 0.2–0.6 с, «видел или не видел»


def _innate_levelup(q: dict, levelup_ids: set[str]) -> bool:
    return q["id"] in levelup_ids   # признак из данных: hero_levelup у значения в файле героя (apply_levelup)


def _short_time(q: dict, levelup_ids: set[str]) -> bool:
    return q["kind"] == "number" and q["unit"].startswith("сек") and q["answer"] < SHORT_TIME


# mech_seed — разбор «урона способностей» пользователем (2026-10-31): числа, где нет логики, кроме «видел ли тултип».
# Вопрос не пропадает, а становится семенем для механики (вместе с innate_levelup): по archive.json (поле seed)
# потом генерируются вопросы «что делает / как работает». Разобраны hero_damage, hero_pct и hero_other (только списком
# id); в остальных подкатегориях (аганим в hero_time…) правило не действует. В hero_damage — правилом, вид — первый подошедший:
#   aghanim    — способность или прибавка от Aghanim's Scepter / Shard (в тексте «Aghanim»; «без аганима» у Finger of
#                Death — кириллицей, это обычный вопрос про ульту);
#   dps        — урон в секунду (единица «урона/сек.», её ставит DPS_TEXT; «без учёта урона в секунду» у Gorgon's Grasp —
#                мгновенный урон, остаётся);
#   threshold  — порог или коэффициент: «сколько урона должен получить» (Kraken Shell), «урон за потраченную ману»
#                (Nether Ward). Reaper's Scythe (за недостающее HP), Fury Swipes (за стак), Duel (за победу) — остаются.
#
# hero_pct — второй разбор пользователя (2026-10-31). Аганим / шард здесь остаются (кроме Fire Shield у Ogre Magi);
# правилом — только процент в секунду без аганима (Healing Ward / Song of the Siren / Black Hole с аганимом остаются),
# остальное — по списку id (MECH_SEED_IDS): мелкие дроби за удар, второстепенные детали, урон иллюзий, коэффициенты
# «процент маны / атрибута в урон», замедления (кроме Enchant). Шансы, криты, пороги (Ice Blast, Sunder), снижения и
# усиления урона, резисты, сплеши (Tidebringer, Great Cleave, Split Shot), Mana Break — остаются.
MECH_SEED_THRESHOLD = re.compile(r"должен получить|за (?:кажд\w+ )?потраченн", re.I)
MECH_SEED_PER_SEC = re.compile(r"в секунду", re.I)
MECH_SEED = {"aghanim": "аганим / шард", "dps": "урон в секунду", "threshold": "порог / коэффициент",
             "pct_per_sec": "процент HP / маны в секунду", "pct_per_hit": "дробный процент HP за удар",
             "detail": "второстепенная деталь", "illusion": "урон иллюзий", "ratio": "процент маны / атрибута в урон",
             "slow": "замедление", "attack_speed": "скорость атаки", "regen": "реген в секунду",
             "per_unit": "за единицу", "coef": "коэффициент", "minor": "второстепенное",
             "armor": "броня 6–8, лотерея"}
MECH_SEED_IDS = {
    "num:ogre_magi_smash:damage_absorb_pct:max": "aghanim",                       # Fire Shield, шард
    "num:huskar_burning_spear:burn_damage_max_pct:max": "pct_per_hit",
    "num:life_stealer_feast:hp_damage_percent:max": "pct_per_hit",
    "num:kez_raptor_dance:max_health_damage_pct:max": "pct_per_hit",
    "num:ursa_maul:health_as_damage_pct:max": "pct_per_hit",
    "num:beastmaster_wild_axes:damage_amp:max": "detail",
    "num:clinkz_wind_walk:damage_percent:max": "detail",                          # Skeleton Archers
    "num:luna_moon_glaive:damage_reduction_percent:max": "detail",
    "num:largo_croak_of_genius:damage_portion_pct:max": "detail",
    "num:mirana_starfall:secondary_starfall_damage_percent:max": "detail",
    "num:bane_ichor_of_nyctasha:status_resistance:max": "detail",
    "num:chaos_knight_phantasm:incoming_damage_tooltip:max": "illusion",
    "num:terrorblade_conjure_image:illusion_incoming_damage_total_tooltip:max": "illusion",
    "num:dark_seer_wall_of_replica:tooltip_outgoing:max": "illusion",
    "num:centaur_return:return_damage_str:max": "ratio",
    "num:silencer_glaives_of_wisdom:intellect_damage_pct:max": "ratio",
    # E.M.P., Mind Flare, Mystic Snake и Time Dilation (откат) — расширение решения пользователя, можно вернуть keep
    "num:invoker_emp:damage_per_mana_pct:max": "ratio",
    "num:nyx_assassin_jolt:max_mana_as_damage_pct:max": "ratio",
    "num:medusa_mystic_snake:snake_mana_steal:max": "ratio",
    "num:batrider_sticky_napalm:turn_rate_pct:max": "slow",
    "num:tusk_tag_team:movement_slow:max": "slow",
    "num:gyrocopter_call_down:slow:max": "slow",
    "num:pugna_decrepify:bonus_movement_speed:max": "slow",
    "num:dawnbreaker_celestial_hammer:move_slow:max": "slow",
    "num:faceless_void_time_dilation:cooldown_percentage:max": "slow",
    # hero_other — третий разбор пользователя (2026-10-31): остаются «количество» (атаки до сноса, отскоки, пульсы,
    # стаки, заряды), HP призывов, золото, большие разовые хилы / бонусы HP, скорость атаки Overpower / Berserker's
    # Blood / Strafe / Untouchable / Unleash, броня Corrosive Haze / Divine Favor. В архив — остальное ниже.
    "num:ogre_magi_bloodlust:bonus_attack_speed:max": "attack_speed",
    "num:bloodseeker_bloodrage:attack_speed:max": "attack_speed",
    "num:phoenix_fire_spirits:attackspeed_slow:max": "attack_speed",
    "num:tiny_grow:attack_speed_reduction:max": "attack_speed",
    "num:enchantress_little_friends:bonus_attack_speed:max": "attack_speed",
    "num:abaddon_frostmourne:curse_attack_speed:max": "attack_speed",          # Curse of Avernus
    "num:troll_warlord_fervor:attack_speed:max": "attack_speed",
    "num:lone_druid_savage_roar:shard_attack_speed@shard:max": "attack_speed",
    "num:visage_grave_chill:attackspeed_bonus:max": "attack_speed",
    "num:storm_spirit_overload:shard_attack_speed_bonus@shard:max": "attack_speed",
    "num:chen_penitence:bonus_attack_speed:max": "attack_speed",
    "num:legion_commander_overwhelming_odds:bonus_attack_speed:max": "attack_speed",
    "num:slark_shadow_dance:bonus_regen:max": "regen",
    "num:alchemist_chemical_rage:bonus_health_regen:max": "regen",
    "num:enchantress_natures_attendants:heal:max": "regen",
    "num:doom_bringer_scorched_earth:bonus_health_regen:max": "regen",
    "num:alchemist_berserk_potion:hp_regen:max": "regen",
    "num:dawnbreaker_solar_guardian:base_heal:max": "per_unit",                # за пульс
    "num:void_spirit_resonant_pulse:absorb_per_hero_hit:max": "per_unit",      # за героя
    "num:dazzle_innate_weave:ally_heal@shard:max": "per_unit",                 # за стак
    "num:meepo_ransack:health_steal_heroes:max": "per_unit",                   # за удар
    "num:silencer_last_word:int_multiplier:max": "coef",
    "num:skywrath_mage_arcane_bolt:int_multiplier:max": "coef",
    "num:ancient_apparition_bone_chill:str_reduction@scepter:max": "coef",
    "num:undying_decay:str_steal@scepter:max": "coef",
    "num:windrunner_tailwind:movespeed_bonus:max": "coef",
    "num:lion_mana_drain:mana_per_second:max": "coef",
    "num:shadow_demon_demonic_cleanse:purge_damage:max": "minor",
    "num:snapfire_firesnap_cookie:target_heal@shard:max": "minor",
    "num:riki_backstab:bonus_xp_kill:max": "minor",                            # опыт Cloak and Dagger
    "num:treant_overgrowth:movement_speed@scepter:max": "minor",
    # барьеры Warcry (шард) и Reactive Armor (аганим) — расширение решения пользователя, можно вернуть keep
    "num:sven_warcry:base_barrier_amount@shard:max": "minor",
    "num:shredder_reactive_armor:max_shield@scepter:max": "minor",
    "num:chaos_knight_reality_rift:armor_reduction:max": "armor",
    "num:lycan_howl:armor:max": "armor",
    "num:naga_siren_rip_tide:armor_reduction:max": "armor",
    "num:vengefulspirit_wave_of_terror:armor_reduction:max": "armor",
    "num:nevermore_dark_lord:presence_armor_reduction:max": "armor",
    "num:tusk_drinking_buddies:armor_bonus:max": "armor",
}


def _mech_seed(q: dict, levelup_ids: set[str]) -> str | None:
    if q["kind"] != "number":
        return None
    if q["id"] in MECH_SEED_IDS:
        return MECH_SEED_IDS[q["id"]]
    if q["sub"] == "hero_damage":
        if "Aghanim" in q["text"]:
            return "aghanim"
        if q["unit"] == "урона/сек.":
            return "dps"
        if MECH_SEED_THRESHOLD.search(q["text"]):
            return "threshold"
    if q["sub"] == "hero_pct" and MECH_SEED_PER_SEC.search(q["text"]) and "Aghanim" not in q["text"]:
        return "pct_per_sec"
    return None


# (имя, проверка, причина, семя механики): проверка возвращает True или вид (строку) — тогда причина и семя по виду
DROP_RULES = [
    ("innate_levelup", _innate_levelup,
     "врождёнка растёт с уровнем героя: число на 30-м уровне не вывести — перегенерировать механикой «что делает "
     "врождёнка»", "innate"),
    ("short_time", _short_time,
     f"меньше {SHORT_TIME} сек.: «видел или не видел», без логики (от {SHORT_TIME} сек. — остаются)", None),
    ("mech_seed", _mech_seed,
     "семя для механики ({kind}): число из тултипа без логики — перегенерировать механикой", "{seed}"),
]


def drop_rule(q: dict, levelup_ids: set[str]) -> tuple[str, str, str, str | None] | None:
    """(имя правила, подпись для сводки, причина, семя механики или None) первого сработавшего правила."""
    for name, check, reason, seed in DROP_RULES:
        hit = check(q, levelup_ids)
        if hit is True:
            return name, name, reason, seed
        if hit:
            return name, f"{name} ({MECH_SEED[hit]})", reason.format(kind=MECH_SEED[hit]), seed.format(seed=hit)
    return None


ARCHIVE_FIELDS = ("id", "sub", "kind", "text", "topic", "answer", "step", "unit", "ceil", "options", "comment")


def archived(q: dict, by: str, reason: str, seed: str | None = None) -> dict:
    """seed — семя для генерации механик (innate / aghanim / dps / threshold): отбор — по этому полю."""
    out = {**{k: q[k] for k in ARCHIVE_FIELDS if q.get(k) is not None}, "by": by, "reason": reason}
    if seed:
        out["seed"] = seed
    return out


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
    for key in ("text", "sub", "comment", "topic"):   # topic — субъект темы руками, если тема выдаёт ответ
        if key in o:
            q[key] = o[key]
    if q["kind"] == "number":
        if "options" in o:
            sys.exit(f"overrides {q['id']}: options у числового вопроса")
        for key in ("step", "unit", "ceil"):
            if key in o:
                q[key] = o[key]
    else:
        if "step" in o or "unit" in o or "ceil" in o:
            sys.exit(f"overrides {q['id']}: step/unit/ceil у вопроса с вариантами")
        if "options" in o:
            q["options"] = o["options"]


def build() -> tuple[list[dict], Counter, list[str], list[dict]]:
    dropped: Counter = Counter()
    archive: list[dict] = []
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
        if len(values) > 1:   # по уровням — после ответа видно, откуда взялось число; «%» и «×» слитно
            levels = " / ".join(fmt_num(v) for v in values)
            sep = "" if out_q["unit"] in ("%", "×") else " "
            out_q["comment"] = f"{q['entity']}: {levels}{sep}{out_q['unit']} по уровням"
        if q.get("category") == "heroes" and apply_levelup(q, out_q, levelups, names):
            levelup_ids.add(out_q["id"])
        return out_q

    def flagged_number(q: dict, sub: str | None) -> None:
        """Вопрос прогона с флагами — в архив как есть (без правок и врождёнок на 30-м уровне)."""
        unit = normalize_unit(q["unit"], q["question"]) or q["unit"]
        dropped[f"флаги прогона ({q.get('category') or 'costs'})"] += 1
        archive.append(archived({"id": f"num:{q['fact_id']}:{q['level']}", "sub": sub or hero_sub(q, unit),
                                 "kind": "number", "text": q["question"], "answer": q["answer"], "step": q["step"],
                                 "unit": unit}, "flags", "; ".join(q["flags"])))

    for q in run_questions(FULL1):
        cat = q["category"]
        if flagged(q, cat):
            flagged_number(q, {"heroes": None, "items": "item_numbers"}.get(cat, "neutrals"))
            continue
        if cat == "heroes":
            out.append(number_question(q, None, q["entity"].split(" · ")[0]))
        elif cat == "items":
            out.append(number_question(q, "item_numbers", q["entity"]))
        else:   # neutrals, enhancements — одна подкатегория, тема различается аспектом
            out_q = number_question(q, "neutrals", q["entity"])
            if cat == "enhancements":
                out_q["aspect"] = "чара"
            out.append(out_q)

    for q in run_questions(COSTS):
        if flagged(q, "costs"):
            flagged_number(q, "costs")
            continue
        out.append(number_question(q, "costs", q["entity"]))   # тема — предмет (данные прогона), не «Цена»

    for group in json.loads(TALENTS.read_text(encoding="utf-8")):
        for q in group["questions"]:
            real = [o for o in q["options"] if o["kind"] == "real"]
            if q["flags"] or q["type"] != "has":
                dropped["таланты: флаги проверки или не «has»"] += 1
                tid = real[0].get("talent_id") if len(real) == 1 else None
                archive.append(archived({"id": f"tal:{tid}" if tid else None, "sub": "talents_has", "kind": "choice",
                                         "text": q["question"], "topic": q["hero"],
                                         "options": [o["text"] for o in real + [o for o in q["options"]
                                                                                 if o["kind"] != "real"]]},
                                        "talents", "; ".join(q["flags"]) or f"тип «{q['type']}» (в игре — только «has»)"))
                continue
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
    stale = sorted(set(MECH_SEED_IDS) - set(ids))
    if stale:
        sys.exit(f"MECH_SEED_IDS: нет таких вопросов: {stale}")
    unknown = sorted(set(overrides) - set(ids))
    if unknown:
        sys.exit(f"overrides: нет таких вопросов: {unknown}")

    errors: list[str] = []
    kept: list[dict] = []
    scaled: list[dict] = []   # шаг поднят правилом «шаг по масштабу»
    excepted: list[dict] = []   # scale_ok: шаг мельче правила — решение пользователя
    owner, owner_names = _owners_index()
    for q in out:
        o = overrides.get(q["id"], {})
        def set_hero_sub() -> None:
            if q["sub"] is None:
                q["sub"] = hero_sub({"fact_id": q["id"].split(":", 1)[1].rsplit(":", 1)[0], "question": q["text"]},
                                    q["unit"])

        if "drop" in o:
            set_hero_sub()
            dropped["drop в overrides"] += 1
            archive.append(archived(q, "overrides", o["drop"]))
            continue
        apply_override(q, o)
        for key in ("text", "comment"):   # и после правок; варианты не трогаем: правда талантов — строка игры дословно
            if q.get(key):
                q[key] = fix_text(q[key])
        unit_unknown = q.pop("_unit_unknown", None) is not None and "unit" not in o
        set_hero_sub()
        rule = None if unit_unknown else drop_rule(q, levelup_ids)
        if rule and "keep" not in o:
            name, label, reason, seed = rule
            dropped[f"правило {label}"] += 1
            archive.append(archived(q, f"rule:{name}", reason, seed))
            continue
        if "keep" in o and not rule:
            errors.append(f"{q['id']}: keep в overrides, а правило-фильтр не срабатывает — убери keep")
        if unit_unknown:
            errors.append(f"{q['id']}: единица «{q['unit']}» не распознана — unit в overrides ({q['text']})")
        if "scale_ok" in o and not (q["kind"] == "number" and q["unit"] == SEC_UNIT and "step" in o):
            errors.append(f"{q['id']}: scale_ok — только у вопроса в секундах и вместе со step в overrides")
        elif "scale_ok" in o:   # исключение из шага по масштабу — решение пользователя, step меньше правила
            new = scale_step(q) or SEC_MIN_STEP
            if not Fraction(str(o["step"])) < new:
                errors.append(f"{q['id']}: scale_ok, а step {o['step']} не мельче шага по масштабу {frac_number(new)} — "
                              f"убери scale_ok")
            excepted.append({"id": q["id"], "answer": q["answer"], "step": q["step"], "rule": frac_number(new)})
        elif q["kind"] == "number" and q["unit"] == SEC_UNIT:
            new = scale_step(q) or SEC_MIN_STEP   # подходящего нет (ровно 10, 20, 75 сек.) — хотя бы минимум 1 сек.
            if "step" in o and Fraction(str(o["step"])) < new:
                errors.append(f"{q['id']}: step {o['step']} в overrides мельче шага по масштабу {frac_number(new)} — "
                              f"убери step из overrides (правило задаёт минимум, правка может только увеличить)")
            if new > Fraction(str(q["step"])):
                scaled.append({"id": q["id"], "sub": q["sub"], "answer": q["answer"], "was": q["step"],
                               "step": frac_number(new)})
                q["step"] = frac_number(new)
        problems = text_problems(q)
        if q["kind"] == "number":
            if not (q["step"] > 0 and q["answer"] > 0):
                problems.append("нет шага или ответа")
            if q.get("ceil") is not None and not q["answer"] < q["ceil"]:
                problems.append(f"ответ {q['answer']} не ниже потолка {q['ceil']}")
            allowed = UNITS | (OVERRIDE_ONLY_UNITS if "unit" in o else set())
            if q["unit"] not in allowed:
                problems.append(f"единица «{q['unit']}» не из словаря")
            if q["id"] in levelup_ids and f"{MAX_HERO_LEVEL}-м уровне героя" not in q["text"]:
                problems.append(f"значение растёт с уровнем героя — в тексте нужно «на {MAX_HERO_LEVEL}-м уровне героя»"
                                f" (ответ {q['answer']}, {q.get('comment')})")
            if "ok" not in o:
                problems += rank_problems(q) + step_problems(q)
            for msg in rank_problems(q) if "ok" in o else []:   # принято ok — но видно при каждой сборке
                print(f"  место ответа невозможно, принято ok: {q['id']} — {msg.split(' — ')[0]}")
        else:
            if len(q["options"]) != 4 or len(set(q["options"])) != 4:
                problems.append("нужно 4 разных варианта")
            if topic_gives_answer(q, owner, owner_names):
                print(f"  тема → «{TOPIC_GROUP}» (герой темы владеет только верным вариантом): {q['id']}")
                q["topic"] = TOPIC_GROUP
        errors += [f"{q['id']}: {p} — {q['text']}" for p in problems]
        kept.append(q)
    live = {q["id"] for q in kept}
    for a in archive:   # отбракованный черновик таланта, а вопрос с тем же id в игре — из круга догенерации
        if a.get("id") in live:
            a["replaced"] = True
    return kept, dropped, errors, archive, scaled, excepted


def flagged(q: dict, category: str) -> bool:
    ignore = IGNORED_FLAGS.get(category)
    return any(not (ignore and ignore.match(f)) for f in q.get("flags") or [])


def frac_number(x: Fraction):
    return int(x) if x.denominator == 1 else float(x)


def rank_shares(qs: list[dict]) -> list[float]:
    """Средняя по вопросам доля показов, где ответ 1-й … 4-й по величине."""
    total = [Fraction(0)] * 4
    for q in qs:
        ceil = Fraction(str(q["ceil"])) if q.get("ceil") is not None else None
        for chance, p, _ in shows(Fraction(str(q["answer"])), Fraction(str(q["step"])), ceil=ceil):
            total[p] += chance
    return [float(t / len(qs)) for t in total] if qs else []


def main() -> None:
    questions, dropped, errors, archive, scaled, excepted = build()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(f"{len(errors)} ошибок — исправь в {OVERRIDES}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()
    bank = {"built_at": today,
            "sources": {k: str(v) for k, v in
                        {"numbers": FULL1, "costs": COSTS, "talents": TALENTS, "mechanics": MECHANICS,
                         "overrides": OVERRIDES}.items()},
            "questions": questions}
    OUT.write_text(json.dumps(bank, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    ARCHIVE.write_text(json.dumps({"built_at": today, "dropped": dict(dropped), "questions": archive},
                                  ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    subs = Counter(q["sub"] for q in questions)
    print(f"{len(questions)} вопросов → {OUT}; выкинуто {len(archive)} → {ARCHIVE}:")
    for reason, n in dropped.most_common():
        print(f"  {n:4}  {reason}")
    for sub, n in sorted(subs.items()):
        print(f"  {sub:18} {n}")
    sec = [q for q in questions if q["kind"] == "number" and q["unit"] == SEC_UNIT]
    ranks = " / ".join(f"{x * 100:.1f}" for x in rank_shares(sec))
    print(f"шаг по масштабу ({SEC_UNIT}): поднят у {len(scaled)} из {len(sec)}; место ответа по величине, % показов: "
          f"{ranks}")
    for s in scaled:
        print(f"  {s['answer']:>6}: {s['was']} → {s['step']}  {s['sub']:12} {s['id']}")
    for s in excepted:
        print(f"  исключение scale_ok: {s['answer']} при шаге {s['step']} (по правилу {s['rule']})  {s['id']}")
    seeds = Counter(a["seed"] for a in archive if a.get("seed"))
    print("семена механик (archive.json, seed): " + ", ".join(f"{k} {n}" for k, n in seeds.most_common()))


if __name__ == "__main__":
    main()
