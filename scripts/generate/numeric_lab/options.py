"""
Варианты ответа по шагу: модель задаёт только `step` (насколько ошибается игрок, который
помнит примерно), а варианты строит код — заново при каждом показе вопроса в игре.

Позиция правильного ответа среди вариантов по величине выбирается случайно (крайняя или
центральная), промежуток между соседними вариантами — один или два шага с равным шансом
(с 2026-10-29; раньше ровно шаг — соседи были почти неотличимы), затем игра перемешивает
порядок показа. Варианты не уходят в ноль и ниже.

Эталон для переноса в игру (server/), здесь — для отчётов лаборатории.
"""

import random


def _decimals(x: float) -> int:
    s = repr(float(x)).rstrip("0").rstrip(".")
    return len(s.split(".")[1]) if "." in s else 0


def make_options(answer: float, step: float, rng: random.Random, n: int = 4,
                 floor: float = 0.0, ceil: float = float("inf")) -> tuple[list[float], int]:
    """→ (варианты по возрастанию, индекс правильного). Порядок показа перемешивает игра. Все варианты строго
    между floor и ceil (ceil — у процентов, где 100% и больше невозможно: поле ceil в банке)."""
    step = abs(step)
    gaps = [rng.choice((1, 2)) for _ in range(n - 1)]
    offsets = [0]
    for g in gaps:
        offsets.append(offsets[-1] + g)

    def valid_for(offs):   # позиции, при которых все варианты остаются между floor и ceil
        return [p for p in range(n) if answer - offs[p] * step > floor and answer + (offs[-1] - offs[p]) * step < ceil]

    valid = valid_for(offsets)
    if not valid:
        offsets = list(range(n))
        valid = valid_for(offsets) or [0]
    p = rng.choice(valid)
    digits = max(_decimals(step), _decimals(answer))
    options = [round(answer + (o - offsets[p]) * step, digits) for o in offsets]
    return options, p
