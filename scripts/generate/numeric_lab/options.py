"""
Варианты ответа по шагу: модель задаёт только `step` (насколько ошибается игрок, который
помнит примерно), а варианты строит код — заново при каждом показе вопроса в игре.

Сначала равновероятно выбирается место правильного ответа среди вариантов по величине (с 2026-10-31; раньше —
сначала промежутки, потом место среди подходящих, и у ответа в 5–6 шагах от нуля наибольшим он бывал в 7–18% показов
вместо 25%). Места, при которых ни одна раскладка не умещается между floor и ceil, исключаются (ответ ≤ 3 шагов от
нуля или потолка — сборка банка такие вопросы не пропускает). Потом промежутки: два шага с шансом 66%, иначе один
(с 2026-10-29 — 50 / 50, раньше ровно шаг — соседи были почти неотличимы; с 2026-10-30 — 66%), с теми же весами среди
раскладок, которые с выбранным местом умещаются. Затем игра перемешивает порядок показа. Варианты не уходят в ноль
и ниже.

Эталон для переноса в игру (server/src/game/questions/stepOptions.ts), здесь — для отчётов лаборатории; точное
распределение показов — shows() в scripts/build_question_bank.py.
"""

import random
from itertools import accumulate, product

DOUBLE_GAP_CHANCE = 0.66


def _decimals(x: float) -> int:
    s = repr(float(x)).rstrip("0").rstrip(".")
    return len(s.split(".")[1]) if "." in s else 0


def gap_layouts(n: int = 4) -> list[tuple[list[int], float]]:
    """Все раскладки промежутков (1 или 2 шага) → (смещения от наименьшего, вероятность): [1, 2, 1] → [0, 1, 3, 4]."""
    out = []
    for gaps in product((1, 2), repeat=n - 1):
        w = 1.0
        for g in gaps:
            w *= DOUBLE_GAP_CHANCE if g == 2 else 1 - DOUBLE_GAP_CHANCE
        out.append(([0, *accumulate(gaps)], w))
    return out


def make_options(answer: float, step: float, rng: random.Random, n: int = 4,
                 floor: float = 0.0, ceil: float = float("inf")) -> tuple[list[float], int]:
    """→ (варианты по возрастанию, индекс правильного). Порядок показа перемешивает игра. Все варианты строго
    между floor и ceil (ceil — у процентов, где 100% и больше невозможно: поле ceil в банке)."""
    step = abs(step)
    digits = max(_decimals(step), _decimals(answer))

    def at(d: int) -> float:   # вариант в d шагах от ответа, округлённый до точности шага и ответа
        return round(answer + d * step, digits)

    def fits(offs: list[int], p: int) -> bool:
        return all(floor < at(o - offs[p]) < ceil for o in offs)

    layouts = gap_layouts(n)
    ranks = [p for p in range(n) if any(fits(offs, p) for offs, _ in layouts)]
    if not ranks:   # окно уже трёх шагов: ответ наименьший, промежутки по одному шагу
        return [at(i) for i in range(n)], 0
    p = rng.choice(ranks)
    ok = [(offs, w) for offs, w in layouts if fits(offs, p)]
    offs = rng.choices([o for o, _ in ok], weights=[w for _, w in ok])[0]
    return [at(o - offs[p]) for o in offs], p
