#!/usr/bin/env python3
"""
Генератор вопросов Dota 2 через Anthropic API.

Использование:
  python scripts/generate/gen_questions.py abilities --from-batch 1 --to-batch 5
  python scripts/generate/gen_questions.py items    --from-batch 1 --to-batch 3
  python scripts/generate/gen_questions.py abilities --list
  python scripts/generate/gen_questions.py items    --list

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

MODEL            = "claude-haiku-4-5"
MAX_TOKENS       = 8192

HEROES_PER_BATCH = 3
ITEMS_PER_BATCH  = 10

N_MC             = 8    # multiple_choice на батч
N_CN             = 5    # closest_number  на батч

PCT_EASY         = 0
PCT_MEDIUM       = 60
PCT_HARD         = 40

SLEEP_BETWEEN    = 2  # секунд между запросами (защита от rate limit)

OUTPUT_DIR       = Path("scripts/data/generated")

# ─── Пути к исходным данным ────────────────────────────────
_HEROES_PATH    = Path("scripts/data/heroes.json")
_ABILITIES_PATH = Path("scripts/data/abilities.json")
_ITEMS_PATH     = Path("scripts/data/items.json")

# ─── Фильтры предметов (из export_batch_data.py) ───────────
_ROSHAN_BLACKLIST = {
    "cheese", "royale_with_cheese", "refresher_shard",
    "aghanims_shard_roshan", "ultimate_scepter_roshan",
    "ultimate_scepter_2", "aegis",
}
_SKIP_VERSIONS = {
    "dagon_2", "dagon_3", "dagon_4", "dagon_5",
    "necronomicon_2", "necronomicon_3",
}

# ═══════════════════════════════════════════════════════════
# СИСТЕМНЫЕ ПРОМТЫ (меняй здесь же при необходимости)
# ═══════════════════════════════════════════════════════════

def _make_system_ability(n_mc: int = N_MC, n_cn: int = N_CN) -> str:
    return f"""You are a Dota 2 trivia question designer. Given hero ability data, find the most interesting things to ask about.

## What makes a question good

Good questions target:
- **Conditions and triggers**: When exactly does X happen? What must be true for X to work?
- **Forgotten details**: Minor effects of innate abilities, secondary mechanics players ignore
- **What it does NOT do**: Ruling out options reveals true understanding
- **What is fixed vs. random**: Great for abilities with RNG components
- **Counterintuitive facts**: Something that surprises even experienced players
- **Find the false statement**: "Which of these is wrong" works especially well for complex abilities
- **Stack behavior**: How multiple applications interact

For multi-level abilities use level 4 values only.

## Avoid these numeric values
Do not build questions around values of 0, 1, 50, 100, or 1200 — they are too round or too common to be interesting.

## Distractors — the most important part
Wrong options must sound **equally plausible** as the correct answer. A player who half-remembers the ability should genuinely hesitate on every option.

Rules:
- All 4 options must belong to the same "type". If you mix types (e.g. percentages and flat numbers), use a 2+2 split — never 3 of one type + 1 obvious outlier. One outlier destroys the question: players skip it immediately.
- Never use internal/system parameter names (like "MAX MANA BURNED PER HIT") — players never see those.
- The correct answer must NOT sound more "natural" or "basic" than the distractors.
- For "что НЕ делает" questions: every wrong inclusion must be something that type of ability COULD plausibly do. "Восстановление здоровья" as a wrong answer for an offensive slow is obviously impossible — player skips it, question is broken.
- For "при каком условии" questions: distractors should be other real mechanics from the hero's kit, not invented conditions.

## Good question examples

"При каком проценте маны врага способность Persecutor начинает замедлять его скорость передвижения?"
Options: "50%" / "75%" / "25%" / "100% (всегда)"
→ Player can only guess — feels the right answer but can't be certain

"При каком условии цель способности Cold Feet у Ancient Apparition получит стан?"
Options: "Если не покидала радиус дистанции разрыва в течение 4 секунд" / "Если получила магический урон от Ice Vortex" / "Если находится в радиусе действия Ice Blast" / "Если получила три стака эффекта Bone Chill"
→ All four are real mechanics from the kit — player genuinely hesitates

"Какой эффект прогрессирует на Tempest Double по мере его существования?"
Options: "Увеличение шанса промаха и замедление скорости передвижения" / "Снижение защиты и увеличение получаемого урона" / "Потеря маны и замедление восстановления здоровья" / "Отравление и снижение характеристик"
→ All four sound equally plausible for a clone ability

"Как работает врожденная способность Bone Chill при наличии нескольких стаков на одной цели?"
Options: "Стаки имеют независимые длительности и суммируются" / "Каждый новый стак перезагружает длительность предыдущего" / "Максимум 2 стака действует одновременно" / "Эффект не суммируется, только один стак может быть активен"
→ All four are mechanically plausible stack behaviors

"Что у Chaos Knight не зависит от рандома в момент использования?"
Options: "Урон от стана" / "Длительность стана" / "Размер крита" / "Вампиризм при крите"
→ All four are real parts of his kit, only one is actually fixed

"Назовите ложный факт о Magnetize (Earth Spirit)."
Options: "Намагниченные герои делят другие дебаффы Земели" / "Пока стоишь рядом с камнем, Magnetize обновляется" / "Эта способность не замедляет героев" / "Противник, у которого эффект уже закончился, может получить его вновь"
→ One is false; player must know all four mechanics

## Bad question examples
"Какой тип урона наносит Culling Blade?" → Everyone knows damage types
"Что происходит с целью при применении Nightmare?" → Primary mechanic, no depth
"Что из перечисленного НЕ дает Ice Vortex?" with "Восстановление здоровья" as option → Offensive AoE slow giving HP regen is obviously impossible, player skips it immediately
"При каком показателе здоровья срабатывает добивание?" with options "14%" / "25%" / "50%" / "12 единиц здоровья" → 3 percentages + 1 flat value is a 3+1 split; the outlier is instantly disqualified
"Что отражает Counterspell?" with options "к врагу с уроном 100%" / "с усилением 50%" / "в случайном направлении" / "полностью блокируется" → The correct answer is the only realistic one; question asks about the primary, well-known mechanic
"В Mana Break урон зависит от параметра..." with system parameter names as options → Nobody ever sees internal parameter names

## Difficulty
{PCT_EASY}% easy, {PCT_MEDIUM}% medium, {PCT_HARD}% hard.

## Output
All text in Russian. Return a JSON array — no markdown, no preamble, just the raw JSON array.

For multiple_choice — THE CORRECT ANSWER IS ALWAYS THE FIRST ELEMENT (index 0) of the options array:
{{
  "type": "multiple_choice",
  "topic": "способность",
  "heroName": "Axe",
  "source": "axe_culling_blade",
  "question": "...",
  "options": ["ПРАВИЛЬНЫЙ ВАРИАНТ — ВСЕГДА ПЕРВЫЙ", "дистрактор1", "дистрактор2", "дистрактор3"],
  "difficulty": "medium"
}}

For closest_number:
{{
  "type": "closest_number",
  "topic": "способность",
  "heroName": "Drow Ranger",
  "source": "drow_ranger_frost_arrows",
  "question": "...",
  "answer": 1.5,
  "unit": "сек.",
  "difficulty": "medium"
}}

## CRITICAL RULES FOR RESPONSE FIELDS:
1. For 'multiple_choice' format:
   - "options" field is MANDATORY and MUST contain exactly 4 options.
   - THE CORRECT ANSWER MUST ALWAYS BE options[0] — the very first element. NEVER place the correct answer at index 1, 2, or 3.
   - "answer" field MUST NOT be provided (completely omit it).
   - "unit" field MUST NOT be provided (completely omit it).
2. For 'closest_number' format:
   - "answer" field is MANDATORY and MUST contain the EXACT, correct numerical value (e.g. 15, 3.5, 0.75, 260). NEVER omit it!
   - "unit" field is MANDATORY and MUST contain the measurement unit in Russian (e.g. "сек.", "ед.", "золота", "%").
   - "options" field MUST NOT be provided (completely omit it).
3. Do not include any extra fields not listed here.

Generate {n_mc} multiple_choice and {n_cn} closest_number questions."""


def _make_system_item() -> str:
    return f"""You are a Dota 2 trivia question designer. Given item data, find the most interesting things to ask about.

## What makes a question good

The test: does the player know the exact value without looking it up, or do they only know "roughly"? If they'd have to guess between a few plausible numbers — that's a good question.

Good targets:

**Stats and bonuses** — fine if the number is non-round, notably large, or minor enough that nobody remembers it exactly:
- "Сколько скорости атаки даёт Mjollnir?" (answer: 90) → not small, not abstract, players know it's "a lot" but not exactly how much
- Minor passive bonus that defines the item but isn't advertised front and center

**Duration of buffs/debuffs** — good if the duration is 6 seconds or longer. Short durations (<6s) feel too fleeting to be interesting.

**Percentage values** — great when non-round or in an unusual range:
- "Какой процент статус-резиста даёт Aeon Disk во время активации?" (answer: 75) → unique, feels like it should be 100 but isn't

**Active ability cooldown** — when it defines how often you can use the item
**Proc chance** — when it's non-round and the player might guess wrong
**Subtle tooltip lines** — "goes through spell immunity", "doesn't interrupt channeling", "destroys trees"
**Combination MC** — present two dimensions together: "X% замедления на Y сек." as 4 options

## Avoid
- Mana cost
- Item price
- Numeric values of 0, 1, 2, 50, 100, 1200
- Round numbers that everyone knows intuitively (e.g. +25 damage on a damage item, 1200 range, exactly 50%)
- Buff durations under 5 seconds

## Distractors
For numeric options use nearby plausible values — what a player who half-remembers would guess. Never use obviously wrong numbers.

## Good question examples

"Сколько скорости атаки даёт Mjollnir?"
Options: "75" / "80" / "90" / "100"
→ Everyone knows it's a lot, nobody remembers exactly

"Какой процент статус-резиста даёт Aeon Disk при срабатывании?"
Options: "60%" / "70%" / "75%" / "80%"
→ Unique stat, feels like it should be a round number but isn't

"Какой множитель доп. крита у Revenant's Brooch?"
Options: "70%" / "75%" / "80%" / "85%"
--> Non-round, distinctive, you have to remember it

"Сколько секунд длится замедление от активки Nullifier?"
--> CN, exact duration matters in fights

"Что НЕ делает активная способность Crimson Guard?"
Options: "Блокирует часть физического урона союзникам" / "Замедляет атакующих" / "Действует на здания" / "Имеет откат"
--> Tests real knowledge of the active's scope

## Difficulty
{PCT_EASY}% easy, {PCT_MEDIUM}% medium, {PCT_HARD}% hard.

## Output
All text in Russian. Return a JSON array — no markdown, no preamble, just the raw JSON array.

For multiple_choice — THE CORRECT ANSWER IS ALWAYS THE FIRST ELEMENT (index 0) of the options array:
{{
  "type": "multiple_choice",
  "topic": "предмет",
  "source": "daedalus",
  "question": "...",
  "options": ["ПРАВИЛЬНЫЙ ВАРИАНТ — ВСЕГДА ПЕРВЫЙ", "дистрактор1", "дистрактор2", "дистрактор3"],
  "difficulty": "medium"
}}

For closest_number:
{{
  "type": "closest_number",
  "topic": "предмет",
  "source": "blink_dagger",
  "question": "...",
  "answer": 12,
  "unit": "сек.",
  "difficulty": "easy"
}}

## CRITICAL RULES FOR RESPONSE FIELDS:
1. For 'multiple_choice' format:
   - "options" field is MANDATORY and MUST contain exactly 4 options.
   - THE CORRECT ANSWER MUST ALWAYS BE options[0] — the very first element. NEVER place the correct answer at index 1, 2, or 3.
   - "answer" field MUST NOT be provided (completely omit it).
   - "unit" field MUST NOT be provided (completely omit it).
2. For 'closest_number' format:
   - "answer" field is MANDATORY and MUST contain the EXACT, correct numerical value (e.g. 15, 3.5, 0.75, 260). NEVER omit it!
   - "unit" field is MANDATORY and MUST contain the measurement unit in Russian (e.g. "сек.", "ед.", "золота", "%").
   - "options" field MUST NOT be provided (completely omit it).
3. Do not include any extra fields not listed here.

Generate {N_MC} multiple_choice and {N_CN} closest_number questions."""


# ═══════════════════════════════════════════════════════════
# ЗАГРУЗКА И РАЗБИВКА ДАННЫХ
# ═══════════════════════════════════════════════════════════

def _load_ability_batches() -> list[list[dict]]:
    heroes_raw  = json.loads(_HEROES_PATH.read_text(encoding="utf-8"))
    abilities   = json.loads(_ABILITIES_PATH.read_text(encoding="utf-8"))

    hero_name_map: dict[str, str] = {}
    for h in heroes_raw.values():
        name = h.get("name", "")
        if name.startswith("npc_dota_hero_"):
            key = name.replace("npc_dota_hero_", "")
            hero_name_map[key] = h.get("localized_name", key)

    hero_keys = sorted(hero_name_map.keys())

    def _hero_data(hk: str) -> dict:
        hero_abilities = []
        for ab_key, ab in abilities.items():
            if not ab_key.startswith(hk + "_"):
                continue
            dname = ab.get("dname") or ""
            desc  = ab.get("desc")  or ""
            attrib = ab.get("attrib", [])
            real_attrib = [a for a in attrib if not a.get("generated")]
            if not desc and not real_attrib:
                continue
            if not dname:
                continue
            hero_abilities.append({
                "key":       ab_key,
                "name":      dname,
                "desc":      desc[:500],
                "behavior":  ab.get("behavior", ""),
                "bkbpierce": ab.get("bkbpierce", ""),
                "dispellable": ab.get("dispellable", ""),
                "attrib":    attrib[:12],
            })
        return {
            "hero_key":  hk,
            "hero_name": hero_name_map[hk],
            "abilities": hero_abilities,
        }

    batches: list[list[dict]] = []
    for i in range(0, len(hero_keys), HEROES_PER_BATCH):
        chunk = hero_keys[i : i + HEROES_PER_BATCH]
        batches.append([_hero_data(k) for k in chunk])
    return batches


def _load_item_batches() -> list[list[dict]]:
    items = json.loads(_ITEMS_PATH.read_text(encoding="utf-8"))

    candidates: list[dict] = []
    for name, item in items.items():
        if name.startswith("recipe_"):
            continue
        if name in _ROSHAN_BLACKLIST or name in _SKIP_VERSIONS:
            continue
        cost = item.get("cost") or 0
        if cost <= 0:
            continue
        candidates.append({
            "key":       name,
            "name":      item.get("dname", name),
            "cost":      cost,
            "cd":        item.get("cd"),
            "mc":        item.get("mc"),
            "attrib":    item.get("attrib", [])[:15],
            "abilities": item.get("abilities", [])[:5],
        })

    candidates.sort(key=lambda x: x["key"])

    batches: list[list[dict]] = []
    for i in range(0, len(candidates), ITEMS_PER_BATCH):
        batches.append(candidates[i : i + ITEMS_PER_BATCH])
    return batches


# ═══════════════════════════════════════════════════════════
# ВЫЗОВ API
# ═══════════════════════════════════════════════════════════

def _call_api(client: anthropic.Anthropic, system_prompt: str, user_message: str) -> str:
    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=[
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_message}],
    )
    for block in response.content:
        if block.type == "text":
            return block.text
    return ""


def _extract_json(text: str) -> list:
    text = text.strip()
    # Убираем ```json ... ``` обёртки
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    # Ищем первый '[' и последний ']'
    start = text.find("[")
    end   = text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError(f"JSON array not found in response:\n{text[:300]}")
    return json.loads(text[start : end + 1])


def _normalize(q: dict) -> dict:
    """Делает поля одинаковыми: options=[] у CN, answer=null у MC."""
    qtype = q.get("type", "")
    if qtype == "multiple_choice":
        q.setdefault("options", [])
        q["answer"] = None
        q["unit"]   = None
    elif qtype == "closest_number":
        q["options"] = []
        q.setdefault("answer", None)
        q.setdefault("unit", None)
    return q


# ═══════════════════════════════════════════════════════════
# ОСНОВНАЯ ЛОГИКА
# ═══════════════════════════════════════════════════════════

def cmd_list(mode: str) -> None:
    if mode == "abilities":
        batches = _load_ability_batches()
        print(f"Батчи для abilities ({HEROES_PER_BATCH} героев каждый):")
        for i, batch in enumerate(batches, 1):
            names = [h["hero_key"] for h in batch]
            print(f"  Батч {i:>2}: {', '.join(names)}")
        print(f"\nИтого: {len(batches)} батчей, {sum(len(b) for b in batches)} героев")
    else:
        batches = _load_item_batches()
        print(f"Батчи для items ({ITEMS_PER_BATCH} предметов каждый):")
        for i, batch in enumerate(batches, 1):
            names = [it["key"] for it in batch]
            print(f"  Батч {i:>2}: {', '.join(names[:6])}{'...' if len(names) > 6 else ''}")
        print(f"\nИтого: {len(batches)} батчей, {sum(len(b) for b in batches)} предметов")


def cmd_generate(mode: str, from_batch: int, to_batch: int) -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        sys.exit("Ошибка: ANTHROPIC_API_KEY не задан в окружении")

    if mode == "abilities":
        batches = _load_ability_batches()
        def build_user(batch: list[dict]) -> str:
            return json.dumps({"heroes": batch}, ensure_ascii=False, indent=2)
    else:
        batches       = _load_item_batches()
        system_prompt = _make_system_item()
        def build_user(batch: list[dict]) -> str:
            return json.dumps({"items": batch}, ensure_ascii=False, indent=2)

    total = len(batches)
    from_idx = from_batch - 1   # 0-based
    to_idx   = to_batch - 1

    if from_idx < 0 or to_idx >= total or from_idx > to_idx:
        sys.exit(
            f"Ошибка: батчи от {from_batch} до {to_batch}, "
            f"но всего батчей {total}. Запусти --list чтобы увидеть диапазон."
        )

    print(f"Режим: {mode} | Модель: {MODEL}")
    print(f"Батчи {from_batch}–{to_batch} из {total} (всего {to_batch - from_batch + 1} запросов)")
    if mode == "abilities":
        print(f"Вопросов на полный батч ({HEROES_PER_BATCH} героя): {N_MC} MC + {N_CN} CN = {N_MC + N_CN} (масштабируется)")
    else:
        print(f"Вопросов на батч: {N_MC} MC + {N_CN} CN = {N_MC + N_CN}")
    print()

    client = anthropic.Anthropic(api_key=api_key)
    all_questions: list[dict] = []
    skipped: list[int] = []

    for batch_num in range(from_batch, to_batch + 1):
        batch = batches[batch_num - 1]
        if mode == "abilities":
            label = ", ".join(h["hero_key"] for h in batch)
        else:
            label = ", ".join(it["key"] for it in batch[:4])
            if len(batch) > 4:
                label += f" +{len(batch) - 4}"

        print(f"[{batch_num}/{total}] {label}")

        if mode == "abilities":
            scale = len(batch) / HEROES_PER_BATCH
            n_mc = max(1, round(N_MC * scale))
            n_cn = max(1, round(N_CN * scale))
            system_prompt = _make_system_ability(n_mc, n_cn)
        else:
            n_mc, n_cn = N_MC, N_CN

        try:
            raw = _call_api(client, system_prompt, build_user(batch))
            questions = _extract_json(raw)
            questions = [_normalize(q) for q in questions]
            all_questions.extend(questions)
            print(f"  → {len(questions)} вопросов получено")
        except Exception as exc:
            print(f"  ✗ Ошибка батча {batch_num}: {exc}")
            skipped.append(batch_num)

        if batch_num < to_batch:
            time.sleep(SLEEP_BETWEEN)

    if not all_questions:
        print("\nНет вопросов для сохранения.")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = OUTPUT_DIR / f"{mode}_b{from_batch}_{to_batch}_{ts}.json"
    out_path.write_text(json.dumps(all_questions, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n{'─' * 50}")
    print(f"Сохранено {len(all_questions)} вопросов → {out_path}")
    if skipped:
        print(f"Пропущено батчей (ошибка API): {skipped}")


# ═══════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Генерация вопросов Dota 2 через Anthropic API",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument("mode", choices=["abilities", "items"], help="Тип вопросов")
    parser.add_argument("--list", action="store_true", help="Показать батчи без генерации")
    parser.add_argument("--from-batch", type=int, default=1, metavar="N", help="Начальный батч (включительно)")
    parser.add_argument("--to-batch",   type=int, default=1, metavar="N", help="Конечный батч (включительно)")

    args = parser.parse_args()

    if args.list:
        cmd_list(args.mode)
    else:
        cmd_generate(args.mode, args.from_batch, args.to_batch)


if __name__ == "__main__":
    main()
