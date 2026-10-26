"""
Варианты ответа по шагу: модель задаёт только `step` (насколько ошибается игрок, который
помнит примерно), а варианты строит код — заново при каждом показе вопроса в игре.

Позиция правильного ответа среди вариантов по величине выбирается случайно (крайняя или
центральная), остальные варианты откладываются от него ровно на заданный шаг, затем
игра перемешивает порядок показа. Варианты не уходят в ноль и ниже.

Эталон для переноса в игру (server/), здесь — для отчётов лаборатории.
"""

import random


def _decimals(x: float) -> int:
    s = repr(float(x)).rstrip("0").rstrip(".")
    return len(s.split(".")[1]) if "." in s else 0


def make_options(answer: float, step: float, rng: random.Random, n: int = 4,
                 floor: float = 0.0) -> tuple[list[float], int]:
    """→ (варианты по возрастанию, индекс правильного). Порядок показа перемешивает игра."""
    step = abs(step)
    # позиции, при которых самый маленький вариант остаётся выше floor
    valid = [p for p in range(n) if answer - p * step > floor] or [0]
    p = rng.choice(valid)
    digits = max(_decimals(step), _decimals(answer))
    options = [round(answer + (i - p) * step, digits) for i in range(n)]
    return options, p
