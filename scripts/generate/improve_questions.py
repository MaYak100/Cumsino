#!/usr/bin/env python3
"""
Улучшалка MC вопросов Dota 2 через Anthropic API.

Принимает готовый JSON с multiple_choice вопросами, улучшает диstractors
и выставляет рейтинг качества. Позиционный баланс числовых ответов
определяет LLM на основе знания игры.

Использование:
  python scripts/generate/improve_questions.py --input scripts/data/generated/items_main.json --list
  python scripts/generate/improve_questions.py --input scripts/data/generated/items_main.json --from-batch 1 --to-batch 3
  python scripts/generate/improve_questions.py --input scripts/data/generated/abilities_main.json --from-batch 1 --to-batch 10

Файл примеров (опционально, кешируется):
  scripts/data/improve_examples.json  — хорошие вопросы как ориентир

Требует: pip install anthropic
         ANTHROPIC_API_KEY в окружении
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import anthropic

# ═══════════════════════════════════════════════════════════
# ГИПЕРПАРАМЕТРЫ — меняй здесь
# ═══════════════════════════════════════════════════════════

MODEL         = "claude-sonnet-4-6"
MAX_TOKENS    = 8192
BATCH_SIZE    = 30    # вопросов на батч
SLEEP_BETWEEN = 2     # секунд между запросами

EXAMPLES_PATH = Path("scripts/data/improve_examples.json")
OUTPUT_DIR    = Path("scripts/data/improved")

# ═══════════════════════════════════════════════════════════
# СИСТЕМНЫЙ ПРОМТ
# ═══════════════════════════════════════════════════════════

SYSTEM_PROMPT = """\
Ты — редактор викторины по Dota 2. Твоя задача: улучшить готовые multiple_choice вопросы.

Если формулировка правильного ответа или вопроса явно неудачная (неестественная, двусмысленная, режет глаз)
— можно её поправить. Чаще - просто редактировать ложные варианты ответов.

═══════════════════════════════════════════════════════
КАК ПОНЯТЬ, КАКИМИ ДОЛЖНЫ БЫТЬ ХОРОШИЕ ДИSTRACTORS
═══════════════════════════════════════════════════════

Приложенные примеры — это уже исправленные, качественные вопросы. Не читай их как список правил.
Вчитайся в них и почувствуй: какой у них тон, как сформулированы варианты ответа, насколько
они разнообразны внутри одного вопроса, звучат ли они как реальные игровые факты. Твоя задача —
уловить эту разницу и воспроизвести её в батче, который ты улучшаешь.

Правильный вопрос заставляет знающего игрока реально задуматься над выбором — не потому что
нет подсказок, а потому что все варианты выглядят правдоподобно для данной механики.

Для числовых вопросов дополнительно: реши сам, на какой позиции при сортировке по возрастанию
должен стоять правильный ответ (1 = минимальный, 4 = максимальный), и подбери дистракторы
так, чтобы по батчу было примерно по 25% на каждую позицию. Не делай все верные ответы, второй
и третьей позицией в такой сортировке. Чередуй.

═══════════════════════════════════════════════════════
ФОРМАТ ОТВЕТА
═══════════════════════════════════════════════════════

Верни JSON-массив. Каждый элемент содержит строго эти поля:
  type, topic, source, heroName (если был), question, difficulty, answer, unit
  "options": [правильный_ответ, дистрактор1, дистрактор2, дистрактор3] — правильный ВСЕГДА на индексе 0

Никаких дополнительных полей в ответе. Только JSON-массив — никакого markdown, никаких преамбул.\
"""

# ═══════════════════════════════════════════════════════════
# ПРИМЕРЫ
# ═══════════════════════════════════════════════════════════

def _build_examples_block() -> str | None:
    if not EXAMPLES_PATH.exists():
        return None
    raw = EXAMPLES_PATH.read_text(encoding="utf-8").strip()
    if not raw or raw == "[]":
        return None
    return "## Примеры качественных вопросов (ориентир)\n\n" + raw


# ═══════════════════════════════════════════════════════════
# ВЫЗОВ API
# ═══════════════════════════════════════════════════════════

def _call_api(client: anthropic.Anthropic, system_blocks: list, user_msg: str) -> str:
    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=system_blocks,
        messages=[{"role": "user", "content": user_msg}],
    )
    for block in response.content:
        if block.type == "text":
            return block.text
    return ""


def _extract_json(text: str) -> list:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    start = text.find("[")
    end   = text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError(f"JSON array not found:\n{text[:400]}")
    return json.loads(text[start:end + 1])


def _merge(original: dict, improved: dict) -> dict:
    result = dict(original)
    if "options" in improved and len(improved["options"]) == 4:
        result["options"] = improved["options"]
    if "rating" in improved:
        result["rating"] = improved["rating"]
    if "rating_note" in improved:
        result["rating_note"] = improved["rating_note"]
    return result


# ═══════════════════════════════════════════════════════════
# КОМАНДЫ
# ═══════════════════════════════════════════════════════════

def _load_mc(input_path: Path) -> list[dict]:
    data = json.loads(input_path.read_text(encoding="utf-8"))
    return [q for q in data if q.get("type") == "multiple_choice"]


def _mc_start_lines(input_path: Path) -> list[int]:
    """Возвращает номера строк (1-based) начала каждого MC-объекта в JSON-массиве."""
    content = input_path.read_text(encoding="utf-8")
    data    = json.loads(content)

    obj_lines: list[int] = []
    depth = 0
    line  = 1
    in_str = False
    esc    = False

    for ch in content:
        if ch == "\n":
            line += 1
        if esc:
            esc = False
            continue
        if ch == "\\" and in_str:
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "{":
            if depth == 1:
                obj_lines.append(line)
            depth += 1
        elif ch == "}":
            depth -= 1
        elif ch in "[]":
            depth += (1 if ch == "[" else -1)

    return [obj_lines[i] for i, q in enumerate(data) if q.get("type") == "multiple_choice"]


def _is_deleted(q: dict) -> bool:
    return q.get("_del") is True


def _make_batches(questions: list[dict]) -> list[list[dict]]:
    return [questions[i:i + BATCH_SIZE] for i in range(0, len(questions), BATCH_SIZE)]


def cmd_list(input_path: Path) -> None:
    mc        = _load_mc(input_path)
    mc_lines  = _mc_start_lines(input_path)
    batches   = _make_batches(mc)
    print(f"Файл: {input_path}")
    print(f"MC вопросов: {len(mc)} -> {len(batches)} батчей по {BATCH_SIZE}")
    for i, b in enumerate(batches, 1):
        start_idx  = (i - 1) * BATCH_SIZE
        end_idx    = start_idx + len(b) - 1
        first_line = mc_lines[start_idx]
        sources    = [q.get("source", q.get("heroName", "?")) for q in b[:5]]
        tail       = f" +{len(b) - 5}" if len(b) > 5 else ""
        print(f"  Батч {i:>2} [MC #{start_idx+1}–{end_idx+1}, строка {first_line}]: {', '.join(sources)}{tail}")


def cmd_improve(input_path: Path, from_batch: int, to_batch: int) -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        sys.exit("Ошибка: ANTHROPIC_API_KEY не задан в окружении")

    mc = _load_mc(input_path)
    batches = _make_batches(mc)
    total = len(batches)

    if from_batch < 1 or to_batch > total or from_batch > to_batch:
        sys.exit(f"Батчи {from_batch}-{to_batch} вне диапазона 1-{total}. Запусти --list.")

    system_blocks = [
        {"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}
    ]
    examples_text = _build_examples_block()
    if examples_text:
        system_blocks.append({
            "type": "text",
            "text": examples_text,
            "cache_control": {"type": "ephemeral"},
        })

    client = anthropic.Anthropic(api_key=api_key)
    all_improved: list[dict] = []
    skipped: list[int] = []

    print(f"Файл: {input_path.name} | Модель: {MODEL} | Батч: {BATCH_SIZE} вопросов")
    print(f"Батчи {from_batch}-{to_batch} из {total}")
    if EXAMPLES_PATH.exists() and EXAMPLES_PATH.stat().st_size > 4:
        print(f"Примеры: {EXAMPLES_PATH.name}")
    print()

    for batch_num in range(from_batch, to_batch + 1):
        batch = batches[batch_num - 1]

        # Вопросы с "_del": true пропускаем — кладём в вывод как есть
        to_process = [q for q in batch if not _is_deleted(q)]
        deleted_in_batch = [q for q in batch if _is_deleted(q)]

        label = f"[{batch_num}/{total}] {len(batch)} вопросов"
        if deleted_in_batch:
            label += f" ({len(deleted_in_batch)} помечены _del, пропускаются)"
        print(label)

        if not to_process:
            all_improved.extend(batch)
            print("  -> всё помечено как удалённое, батч пропущен")
            continue

        user_msg = (
            "Улучши эти вопросы согласно инструкциям. "
            "Для числовых вопросов сам определи на какой позиции (1-4) поставить правильный ответ, "
            "следя за балансом ~25% на каждую позицию по батчу.\n\n"
            + json.dumps(to_process, ensure_ascii=False, indent=2)
        )

        try:
            raw = _call_api(client, system_blocks, user_msg)
            improved_list = _extract_json(raw)

            if len(improved_list) != len(to_process):
                print(f"  ! Получено {len(improved_list)} вопросов, ожидалось {len(to_process)}")

            merged = [_merge(orig, imp) for orig, imp in zip(to_process, improved_list)]
            # Восстанавливаем порядок: удалённые возвращаем на свои места
            merged_iter = iter(merged)
            for q in batch:
                if _is_deleted(q):
                    all_improved.append(q)
                else:
                    try:
                        all_improved.append(next(merged_iter))
                    except StopIteration:
                        all_improved.append(q)

            ratings = [q["rating"] for q in merged if isinstance(q.get("rating"), int)]
            if ratings:
                avg = sum(ratings) / len(ratings)
                dist = {r: ratings.count(r) for r in sorted(set(ratings))}
                print(f"  -> рейтинг avg={avg:.1f} | {dist}")

        except Exception as exc:
            print(f"  x Ошибка батча {batch_num}: {exc}")
            skipped.append(batch_num)
            all_improved.extend(batch)

        if batch_num < to_batch:
            time.sleep(SLEEP_BETWEEN)

    if not all_improved:
        print("\nНет вопросов для сохранения.")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = OUTPUT_DIR / f"{input_path.stem}_improved_b{from_batch}_{to_batch}_{ts}.json"
    out_path.write_text(json.dumps(all_improved, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n{'-' * 55}")
    print(f"Сохранено {len(all_improved)} вопросов -> {out_path}")
    if skipped:
        print(f"Пропущено батчей: {skipped}")

    all_ratings = [q["rating"] for q in all_improved if isinstance(q.get("rating"), int)]
    if all_ratings:
        avg = sum(all_ratings) / len(all_ratings)
        dist = {r: all_ratings.count(r) for r in sorted(set(all_ratings))}
        print(f"Итого рейтинги: avg={avg:.1f} | {dist}")


# ═══════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Улучшение MC вопросов Dota 2 через Anthropic API",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "--input", required=True, metavar="FILE",
        help="JSON файл с вопросами (items_main.json, abilities_main.json и т.п.)"
    )
    parser.add_argument(
        "--list", action="store_true",
        help="Показать батчи без запуска API"
    )
    parser.add_argument("--from-batch", type=int, default=1, metavar="N")
    parser.add_argument("--to-batch",   type=int, default=1, metavar="N")

    args = parser.parse_args()
    input_path = Path(args.input)
    if not input_path.exists():
        sys.exit(f"Файл не найден: {input_path}")

    if args.list:
        cmd_list(input_path)
    else:
        cmd_improve(input_path, args.from_batch, args.to_batch)


if __name__ == "__main__":
    main()
