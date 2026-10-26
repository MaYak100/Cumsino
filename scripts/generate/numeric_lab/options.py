"""
Варианты ответа по шагу: модель задаёт только `step` (насколько ошибается игрок, который
помнит примерно), а варианты строит код — заново при каждом показе вопроса в игре.

Правильный ответ встаёт на случайную позицию из четырёх (крайнюю или центральную),
промежутки между соседними вариантами — 1 или 2 шага, поэтому ни позиция, ни шаг
не выдают ответ. Варианты не уходят в ноль и ниже.

Эталон для переноса в игру (server/), здесь — для отчётов лаборатории.
"""

import random


def _decimals(x: float) -> int:
    s = repr(float(x)).rstrip("0").rstrip(".")
    return len(s.split(".")[1]) if "." in s else 0


def make_options(answer: float, step: float, rng: random.Random, n: int = 4,
                 floor: float = 0.0) -> tuple[list[float], int]:
    """→ (варианты по возрастанию, индекс правильного)."""
    step = abs(step)
    gaps = [rng.choice((1, 1, 2)) * step for _ in range(n - 1)]
    # позиции, при которых самый маленький вариант остаётся выше floor
    valid = [p for p in range(n) if answer - sum(gaps[:p]) > floor] or [0]
    p = rng.choice(valid)
    below = [answer - sum(gaps[i:p]) for i in range(p)]
    above = [answer + sum(gaps[p:p + j]) for j in range(1, n - p)]
    digits = max(_decimals(step), _decimals(answer))
    options = [round(v, digits) for v in below + [answer] + above]
    return options, p
