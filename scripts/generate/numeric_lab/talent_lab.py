#!/usr/bin/env python3
"""
Вопросы про таланты: «Какой из этих талантов есть у героя?» — 1 настоящий + 3 выдуманных.

Модель получает героев: способности (описание, примечания, тексты шарда и аганима — как в
text_lab/mechanics_lab.py) и все 8 талантов героя (id, уровень, английский и русский текст игры
с числами из scripts/talent_text.py, вид). Вид размечает код: stat — голый стат без способности
(+200 Health), tweak — правка числа у способности (-3s Meat Hook Cooldown), mechanic — меняет
поведение («Whirling Axes Pierce Magic Immunity»). Вопросы — только про необычные таланты;
подделки — выдуманные механики, не больше одной «честной обманки» (то, что даёт шард, аганим
или способность и так делает).

v5 (prompt_talents_v5.md, справочник docs/questions/talents-style.md): настоящий вариант — официальная
русская строка игры дословно (раскрыть можно только сокращения, кроме «сек.»); подделки — правдоподобные
усиления настоящих механик героя по шаблонам и словарю игры, без сленга. К способностям в пакете
добавлены русские тексты клиента (desc_ru, shard_ru, scepter_ru). v4 — варианты со сленгом
(prompt_talents_v4.md + prompt_talents_verify.md, запускать с --prompt/--verify-prompt).

Главное требование с v4 — одинаковый стиль правды и подделок: длина, числа, конструкция.

Проверка в два слоя:
  1. код: состав 1 + 3, настоящий вариант — талант этого героя и его строка `ru` (с точностью до
     раскрытых сокращений), подделка не совпадает с его талантами и не берёт ту же способность с тем
     же параметром, что его талант; язык — нет сленга (SLANG), сокращений кроме «сек.», «4с» / «секунды»
     после числа, дробей через запятую; стиль — разброс длин (max/min ≤ 1.4), цифры у всех вариантов или
     ни у одного, название способности у всех или ни у одного, шаблон правды есть хотя бы у одной
     подделки, не все три подделки одного типа эффекта (EFFECT_TYPES: статус, область, заряды, развеивание…),
     длина ≤ 75, не больше одной обманки, латиница только в названиях из игры;
  2. второй проход модели (prompt_talents_verify_v5.md): настоящий ли каждый вариант, обманка
     ли (шард / аганим / по умолчанию), не слишком ли подделка близка к таланту, дословна ли правда,
     слова ли игры (language_ok), правдоподобна ли подделка (plausible), выдаёт ли стиль ответ.

  python -X utf8 scripts/generate/numeric_lab/talent_lab.py out/talents-v5-test --npcs npc_dota_hero_lich,...
  python -X utf8 scripts/generate/numeric_lab/talent_lab.py out/talents-v5 --full
  python -X utf8 scripts/generate/numeric_lab/talent_lab.py out/talents-v4 --npcs npc_dota_hero_axe,... --append
  python -X utf8 scripts/generate/numeric_lab/talent_lab.py --stats out/talents-full      # статистика стиля
"""

import argparse
import json
import os
import random
import re
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

LAB  = Path(__file__).parent
DOTA = Path("scripts/data/dota")
sys.path.insert(0, str(LAB.parent.parent))            # scripts/ → talent_text, valve_kv
sys.path.insert(0, str(LAB.parent / "text_lab"))      # mechanics_lab.ability_packet
import talent_text    # noqa: E402
import mechanics_lab  # noqa: E402

LEVELS = {1: 10, 2: 15, 3: 20, 4: 25}
HEROES_PER_REQUEST = 5
MODEL = "claude-opus-5-5"
PRICE = {"input": 4.0, "output": 20.0}   # $ за 1M токенов, обычные вызовы

MAX_RATIO = 1.4     # max/min длины вариантов
MAX_LEN = 75        # символов в варианте
DECOYS = ["invented", "shard", "scepter", "default"]
VERDICTS = ["real_talent", "invented_ok", "shard", "scepter", "default", "too_close"]
# сленг, которого нет ни в одном таланте и ни в одном описании способности русского клиента (talents-style.md §1, §6)
SLANG = {
    "стан": r"\bстан(?:а|у|ом|е|ы|ов|ит|ят|ить|ящ\w*)?\b|\bзастан\w*|\bмини-?стан\w*",
    "рут": r"\bрут(?:а|у|ом|е|ы|ит|ят|ить)?\b",
    "сайленс": r"сайленс", "слоу": r"\bслоу", "хаст": r"\bхаст|\bх[еэ]йст", "диспел": r"диспел",
    "дизарм": r"дизарм", "инвиз": r"инвиз", "кд": r"\bкд\b|кулдаун", "хп / мп": r"\b[хм]п\b",
    "резист": r"резист", "лайфстил": r"лайфстил", "спелл": r"спелл", "брейк": r"брейк", "хекс": r"\bхекс",
    "мут": r"\bмут(?:ит|ят|а)?\b", "фир": r"\bфир\b", "крит": r"\bкрит(?:а|ом|ы|ов|у)?\b(?!\.)",
    "просвет": r"просвет", "трусайт": r"трусайт", "бкб": r"\bбкб\b", "иммун": r"иммун", "аое": r"\bаое\b",
    "клив": r"\bклив", "баш": r"\bбаш(?:ит|ем|а)?\b", "сплеш": r"спл[еэ]ш", "прок": r"\bпрок(?:ает|нет|ать)\b",
    "мувспид": r"мувспид|\bмс\b", "дамаг": r"дамаг|д[эе]медж", "скилл": r"скилл", "абилка": r"абилк",
    "ульт": r"\bульт", "бафф": r"\b(?:де)?баф", "стак": r"\bстак", "каст": r"\bкаст(?!ет)", "хил": r"\bхил(?:ит|ят|ка|а|ом)?\b",
    "армор": r"армор", "агро": r"\bагр(?:о|ит|ят)\b", "тп": r"\bтп\b", "маг. / физ.": r"\b(?:маг|физ)\.",
}
_SLANG = [(k, re.compile(p, re.I)) for k, p in SLANG.items()]
_ABBR = re.compile(r"(?<![A-Za-z])\b([А-Яа-яЁё]+)\.(?=\s|$|[,/)])")
_BAD_UNIT = re.compile(r"\d\s*(?:с|сек)(?![.\wа-яё])|\d\s*секунд", re.I)
_WORD = re.compile(r"[a-zа-я0-9]+(?:\.[0-9]+)?\.?")
# параметры, по которым подделка «близка» к таланту, если говорит о той же способности
PARAMS = {
    "заряды": r"(?<!пере)заряд", "перезарядка": r"перезарядк", "радиус / область": r"радиус|по области",
    "оглушение": r"оглуш", "безмолвие": r"безмолв", "оцепенение": r"оцепен", "замедление": r"замедл",
    "скорость атаки": r"скорост\w* атак|ускоря\w* атак", "скорость передвижения": r"скорост\w* передв|ускоря\w* передв",
    "отскоки": r"отскок", "цели": r"\bцел[еьияй]|\bжертв\w* больше", "развеивание": r"развеива|развеять",
    "невосприимчивость": r"невоспр", "при смерти": r"при смерти", "броня": r"брон", "вампиризм": r"вампиризм",
    "сопротивление": r"сопротивлени|сопр\.", "длительность": r"сек\. действия|длительност|действует дольше",
    "дальность": r"дальн", "лечение": r"лечен|излечива|исцеля|здоровья в секунду", "урон в секунду": r"урон\w* в секунду|урона/сек",
    "невидимость": r"невидим", "страх": r"страх", "ослепление": r"ослеп|промах",
}
_PARAMS = {k: re.compile(p, re.I) for k, p in PARAMS.items()}
# формулы, которые в talents-full встречались почти только у подделок
TELLS = {
    "вторую цель / две / ещё одну": r"втор\w* цел|\bдв(?:а|е|ум|ух|ойн)\w*|ещ[её] одн|дополнительн\w* цел",
    "вокруг цели": r"вокруг",
    "всех врагов": r"\bвсе[хм]?\b",
    "притягивает": r"притяг",
    "перескакивает": r"перескак|рикошет",
    "не требует / больше не": r"не требует|больше не",
    "скобки": r"[()]",
}

# типы эффекта (talents-style.md §3) — по первому совпадению; «срабатывание» ещё и по двум способностям в строке.
# Три подделки одного типа («X накладывает <статус> на N сек.» ×3) — вопрос «угадай, какой статус настоящий».
EFFECT_TYPES = {
    "развеивание": r"развеива|развеять|невоспр",
    "заряды": r"(?<!пере)заряд",
    "срабатывание": r"активиру|призыв|эффекты\b|применить|срабатыва",
    "смерть / убийство": r"при смерти|при гибели|убийств|умира|гибел",
    "доп. цели": r"дополнительн\w* (?:цел|жертв)|по (?:двум|трём|четыр\w*|\d+) цел|отскок|втор\w* (?:волн|цел)"
                 r"|ещ[её] одн|\bдве цели|действует на|бьёт по|постройк",
    "союзники": r"союзник|аурой|\bаура\b",
    "снятие ограничения": r"без перезарядки|не нужн|неогранич|постоянн|не прерыва|без цели|бесконечн",
    "обзор": r"невидим|обзор",
    "множитель": r"умножа|в \d+(?:\.\d+)? раза|двойн|удва|утра[ие]в",
    "область": r"по области|радиус|вокруг|конус",
    "статус": r"оглуш|безмолв|оцепен|бессил|истощ|заглуш|страх|ослеп|провоц|превращ|замедл|обезоруж",
}
_EFFECT_TYPES = {k: re.compile(p, re.I) for k, p in EFFECT_TYPES.items()}
OTHER_EFFECT = "стат / урон"

_NUM_START = re.compile(r"^[+\-−–]?\d")
_DIGIT = re.compile(r"\d")
# слово с латиницей (E.M.P., Nature's, X-Marks); соседние такие слова — одно название
_LATIN_WORD = r"[A-Za-z0-9'’:.\-]*[A-Za-z][A-Za-z0-9'’:.\-]*"
_LATIN_RUN = re.compile(rf"{_LATIN_WORD}(?:\s+(?:{_LATIN_WORD}|\d+(?=\s+[A-Za-z])))*")


def talent_kind(text: str, ability_names: list[str]) -> str:
    mentions = any(n and n.lower() in text.lower() for n in ability_names)
    if _NUM_START.match(text):
        return "tweak" if mentions else "stat"
    return "mechanic"


def _load(name: str) -> dict:
    return json.loads((DOTA / f"{name}.json").read_text(encoding="utf-8"))


def _talent_texts(talent: str, abilities: dict) -> tuple[str | None, str | None]:
    en = talent_text.render(talent, "english")
    if not en:
        dname = abilities.get(talent, {}).get("dname")
        en = dname if dname and "{" not in dname else None
    return en, talent_text.render(talent, "russian")


class _Caseless(dict):
    """Токены локализации без учёта регистра: у части способностей ключи `_description`,
    `_shard_Description` и т.п. — mechanics_lab ищет `_Description` и теряет описание, шард, аганим."""
    def __init__(self, d: dict):
        super().__init__({k.lower(): v for k, v in d.items()})

    def get(self, k, default=None):
        return super().get(k.lower(), default)

    def __getitem__(self, k):
        return super().__getitem__(k.lower())

    def __contains__(self, k):
        return super().__contains__(k.lower())


def hero_packet(npc: str, current: dict, abilities: dict, tok: dict, hero_talents: dict,
                tok_ru: dict | None = None) -> dict:
    mech = mechanics_lab.hero_packet(npc, current, abilities, tok)
    if tok_ru is not None:   # русские тексты клиента — словарь игры для подделок и обманок
        ru = mechanics_lab.hero_packet(npc, current, abilities, tok_ru)
        for a, r in zip(mech["abilities"], ru["abilities"]):
            a["desc_ru"] = r["desc"]
            for part in ("shard", "scepter"):
                if r.get(part):
                    a[f"{part}_ru"] = r[part]
    names = [a["name"] for a in current["heroes"][npc]["abilities"]]
    talents = []
    for t, level in hero_talents.get(npc, []):
        en, ru = _talent_texts(t, abilities)
        if en:
            talents.append({"id": t, "level": LEVELS.get(level, level), "text": en, "ru": ru or "",
                            "kind": talent_kind(en, names)})
    return {"npc": npc, "hero": mech["hero"], "abilities": mech["abilities"], "talents": talents}


def build_samples(npcs: list[str], per_request: int) -> list[dict]:
    current, abilities = _load("current"), _load("abilities")
    tok = _Caseless(mechanics_lab._tokens(mechanics_lab.GAME / "resource/localization/abilities_english.txt"))
    tok_ru = _Caseless(mechanics_lab._tokens(mechanics_lab.GAME / "resource/localization/abilities_russian.txt"))
    hero_talents = talent_text.hero_talents()
    heroes = [hero_packet(npc, current, abilities, tok, hero_talents, tok_ru) for npc in npcs]
    return [{"patch": current["patch"], "heroes": heroes[i:i + per_request]}
            for i in range(0, len(heroes), per_request)]


def known_names() -> set[str]:
    """Латиница, которой можно появляться в вариантах: герои, способности, предметы."""
    current, abilities, items = _load("current"), _load("abilities"), _load("items")
    out = {h["name"] for h in current["heroes"].values()}
    out |= {a["name"] for h in current["heroes"].values() for a in h["abilities"]}
    out |= {a["dname"] for a in abilities.values() if a.get("dname") and "{" not in a["dname"]}
    out |= {i["dname"] for i in items.values() if i.get("dname")}
    out |= {re.sub(r"\s*\(.*?\)", "", n) for n in out if "(" in n}   # «Whirling Axes (Ranged)» → «Whirling Axes»
    return {n.strip().lower() for n in out}


# ─── Схемы ───────────────────────────────────────────────────────────────────

def schema(sample: dict) -> dict:
    real = sorted({t["id"] for h in sample["heroes"] for t in h["talents"]})
    option = {"anyOf": [
        {"type": "object", "properties": {"kind": {"const": "real"},
                                          "talent_id": {"type": "string", "enum": real},
                                          "text": {"type": "string"}},
         "required": ["kind", "talent_id", "text"], "additionalProperties": False},
        {"type": "object", "properties": {"kind": {"const": "invented"},
                                          "decoy": {"type": "string", "enum": DECOYS},
                                          "text": {"type": "string"}},
         "required": ["kind", "decoy", "text"], "additionalProperties": False},
    ]}
    question = {
        "type": "object",
        "properties": {
            "hero": {"type": "string", "enum": [h["hero"] for h in sample["heroes"]]},
            "type": {"type": "string", "enum": ["has"]},
            "question": {"type": "string"},
            "options": {"type": "array", "items": option},
        },
        "required": ["hero", "type", "question", "options"],
        "additionalProperties": False,
    }
    return {"type": "object", "properties": {"questions": {"type": "array", "items": question}},
            "required": ["questions"], "additionalProperties": False}


def verify_schema() -> dict:
    check_ = {"type": "object",
              "properties": {"question": {"type": "integer"}, "option": {"type": "integer"},
                             "verdict": {"type": "string", "enum": VERDICTS},
                             "translation_ok": {"type": "boolean"}, "language_ok": {"type": "boolean"},
                             "plausible": {"type": "boolean"}, "note": {"type": "string"}},
              "required": ["question", "option", "verdict", "translation_ok", "language_ok", "plausible", "note"],
              "additionalProperties": False}
    style = {"type": "object",
             "properties": {"question": {"type": "integer"}, "style_gives_away": {"type": "boolean"},
                            "note": {"type": "string"}},
             "required": ["question", "style_gives_away", "note"], "additionalProperties": False}
    return {"type": "object",
            "properties": {"checks": {"type": "array", "items": check_},
                           "style": {"type": "array", "items": style}},
            "required": ["checks", "style"], "additionalProperties": False}


# ─── API ─────────────────────────────────────────────────────────────────────

def _client():
    import anthropic
    return anthropic.Anthropic(api_key=os.environ.get("NUMLAB_API_KEY") or os.environ.get("ANTHROPIC_API_KEY"),
                               base_url="https://api.anthropic.com")


def _call(client, system: str, payload: dict, out_schema: dict, effort: str) -> tuple[dict, dict]:
    t0 = time.time()
    with client.messages.stream(
        model=MODEL, max_tokens=32000, system=[{"type": "text", "text": system}],
        messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
        output_config={"effort": effort, "format": {"type": "json_schema", "schema": out_schema}},
    ) as stream:
        msg = stream.get_final_message()
    usage = {"input_tokens": msg.usage.input_tokens, "output_tokens": msg.usage.output_tokens,
             "seconds": round(time.time() - t0, 1), "stop": msg.stop_reason}
    text = next((b.text for b in msg.content if b.type == "text"), "{}")
    return (json.loads(text) if msg.stop_reason == "end_turn" else {}), usage


# ─── Проверка кодом ──────────────────────────────────────────────────────────

def _norm(s: str) -> str:
    return re.sub(r"[^\w]+", " ", s.lower().replace("ё", "е")).strip()


def style_metrics(options: list[dict]) -> dict:
    """Длины, цифры и место правды по длине. options — [{kind, text}, …]."""
    lens = [len(o["text"].strip()) for o in options]
    real = [i for i, o in enumerate(options) if o["kind"] == "real"]
    r = real[0] if real else None
    digits = [bool(_DIGIT.search(o["text"])) for o in options]
    m = {"lengths": lens, "ratio": round(max(lens) / max(1, min(lens)), 2), "digits": digits}
    if r is not None:
        others = [l for i, l in enumerate(lens) if i != r]
        m["real_shortest"] = lens[r] < min(others)
        m["real_longest"] = lens[r] > max(others)
        m["real_rank"] = sorted(lens).index(lens[r]) + 1     # 1 = самый короткий (при равенстве — меньший ранг)
    return m


def _same_as_official(text: str, official: str) -> bool:
    """text — строка игры слово в слово; сокращение игры («невоспр.») может быть раскрыто
    любым словом с той же основой («невосприимчивость»), «сек.» остаётся."""
    ours = _WORD.findall(text.lower().replace("ё", "е"))
    theirs = _WORD.findall(official.lower().replace("ё", "е"))
    if len(ours) != len(theirs):
        return False
    for a, b in zip(ours, theirs):
        if b.endswith(".") and not re.fullmatch(r"[\d.]+", b) and b != "сек.":
            if not a.rstrip(".").startswith(b[:-1]):
                return False
        elif a.rstrip(".") != b.rstrip("."):
            return False
    return True


def _ability_names(hero: dict) -> list[str]:
    """Названия способностей героя без пометок «(Ranged)», длинные первыми."""
    out = {re.sub(r"\s*\(.*?\)", "", a["name"]).strip() for a in hero["abilities"]}
    return sorted((n for n in out if n), key=len, reverse=True)


def _mentions(text: str, abilities: list[str]) -> set[str]:
    low = text.lower()
    return {n for n in abilities if n.lower() in low}


def _template(text: str, abilities: list[str]) -> str:
    """число («+N к …», «2 заряда X») / способность («X <глагол> …») / существительное («Осколки от X …»)."""
    t = text.strip()
    if re.match(r"^[+\-−–]?\d", t):
        return "число"
    if any(t.lower().startswith(n.lower()) for n in abilities):
        return "способность"
    return "существительное"


def _params(text: str) -> set[str]:
    return {k for k, rx in _PARAMS.items() if rx.search(text)}


def effect_type(text: str, abilities: list[str]) -> str:
    """Тип эффекта строки таланта (talents-style.md §3), грубо по словам."""
    for k, rx in _EFFECT_TYPES.items():
        if rx.search(text) or (k == "срабатывание" and len(_mentions(text, abilities)) >= 2):
            return k
    return OTHER_EFFECT


def language_flags(text: str) -> list[str]:
    flags = []
    for name, rx in _SLANG:
        m = rx.search(text)
        if m:
            flags.append(f"сленг «{m.group(0)}» в «{text}» (в игре его нет)")
    for word in _ABBR.findall(text):
        if word.lower() != "сек":
            flags.append(f"сокращение «{word}.» в «{text}» (раскрыть; можно только «сек.»)")
    m = _BAD_UNIT.search(text)
    if m:
        flags.append(f"единица «{m.group(0)}» в «{text}» (игра пишет «N сек.»)")
    if re.search(r"\d,\d", text):
        flags.append(f"дробь через запятую в «{text}» (игра пишет через точку)")
    return flags


def check(q: dict, sample: dict, names: set[str]) -> dict:
    hero = next(h for h in sample["heroes"] if h["hero"] == q["hero"])
    real = {t["id"]: t for t in hero["talents"]}
    talent_texts = {_norm(t["text"]) for t in hero["talents"]} | {_norm(t["ru"]) for t in hero["talents"] if t["ru"]}
    abilities = _ability_names(hero)
    # таланты героя по способностям: {способность: [(строка, {параметры})]}
    talent_params: dict[str, list] = {}
    for t in hero["talents"]:
        for ab in _mentions(t["ru"] or t["text"], abilities):
            talent_params.setdefault(ab, []).append((t["ru"] or t["text"], _params(t["ru"] or t["text"])))
    flags = []
    for o in q["options"]:
        text = o["text"].strip()
        flags += language_flags(text)
        if o["kind"] == "real":
            t = real.get(o["talent_id"])
            if not t:
                flags.append(f"{o['talent_id']}: не талант этого героя")
            else:
                o["original"] = t["text"]
                o["original_ru"] = t["ru"]
                o["talent_kind"] = t["kind"]
                if t["kind"] == "stat":
                    flags.append(f"настоящий «{t['text']}» — голый стат")
                if t["ru"] and not _same_as_official(text, t["ru"]):
                    flags.append(f"настоящий «{text}» не совпадает со строкой игры «{t['ru']}»")
        else:
            if _norm(text) in talent_texts:
                flags.append(f"выдуманный «{text}» совпадает с настоящим талантом героя")
            mine = _params(text)
            for ab in _mentions(text, abilities):
                for t_text, t_params in talent_params.get(ab, []):
                    common = mine & t_params
                    if common:
                        flags.append(f"подделка «{text}» близка к таланту «{t_text}»: {ab}, {', '.join(sorted(common))}")
        if len(text) > MAX_LEN:
            flags.append(f"«{text}» длиннее {MAX_LEN} символов")
        bare = text
        for n in (n for n in names if "(" in n and n in text.lower()):   # «Whirling Axes (Melee)»
            bare = re.sub(re.escape(n), " ", bare, flags=re.I)
        for run in _LATIN_RUN.findall(bare):
            run = run.strip().rstrip(".:")
            if not any(run.lower() + end in names for end in ("", ".", "!")):
                flags.append(f"«{run}» — нет такого названия в игре (англицизм или опечатка)")
    n_real = sum(1 for o in q["options"] if o["kind"] == "real")
    if len(q["options"]) != 4:
        flags.append(f"вариантов {len(q['options'])}, нужно 4")
    if n_real != 1:
        flags.append(f"настоящих вариантов {n_real}, нужен 1")
    decoys = [o for o in q["options"] if o["kind"] == "invented" and o.get("decoy", "invented") != "invented"]
    if len(decoys) > 1:
        flags.append(f"обманок (шард / аганим / по умолчанию) {len(decoys)}, можно одну")
    m = style_metrics(q["options"])
    if m["ratio"] > MAX_RATIO:
        flags.append(f"стиль: разброс длин {m['ratio']} > {MAX_RATIO} ({m['lengths']})")
    if any(m["digits"]) and not all(m["digits"]):
        flags.append(f"стиль: цифры не у всех вариантов ({m['digits']})")
    has_ab = [bool(_mentions(o["text"], abilities)) for o in q["options"]]
    if any(has_ab) and not all(has_ab):
        flags.append(f"стиль: название способности не у всех вариантов ({has_ab})")
    templates = [_template(o["text"], abilities) for o in q["options"]]
    m["templates"] = templates
    real_t = [t for o, t in zip(q["options"], templates) if o["kind"] == "real"]
    fake_t = [t for o, t in zip(q["options"], templates) if o["kind"] != "real"]
    if real_t and real_t[0] not in fake_t:
        flags.append(f"стиль: шаблон правды «{real_t[0]}» есть только у неё (подделки: {', '.join(fake_t)})")
    m["effects"] = [effect_type(o["text"], abilities) for o in q["options"]]
    fake_e = [e for o, e in zip(q["options"], m["effects"]) if o["kind"] != "real"]
    if len(fake_e) == 3 and len(set(fake_e)) == 1:
        flags.append(f"стиль: все подделки одного типа эффекта ({fake_e[0]})")
    # ответ на пересечении: одна подделка повторяет способность правды, другая — её параметр
    real_o = next((o for o in q["options"] if o["kind"] == "real"), None)
    if real_o:
        r_ab, r_par = _mentions(real_o["text"], abilities), _params(real_o["text"])
        fakes = [o for o in q["options"] if o["kind"] != "real"]
        by_ab = [i for i, o in enumerate(fakes) if _mentions(o["text"], abilities) & r_ab]
        by_par = [i for i, o in enumerate(fakes) if _params(o["text"]) & r_par]
        if any(i != j for i in by_ab for j in by_par):
            flags.append(f"стиль: ответ на пересечении — подделки повторяют способность правды "
                         f"({', '.join(sorted(r_ab))}) и её параметр ({', '.join(sorted(r_par))})")
    return {**q, "style": m, "flags": flags}


def apply_verification(questions: list[dict], ver: dict) -> None:
    for c in ver.get("checks", []):
        try:
            q = questions[c["question"]]
            o = q["options"][c["option"]]
        except (IndexError, KeyError):
            continue
        o["verdict"], o["verify_note"] = c["verdict"], c["note"]
        if o["kind"] == "real":
            if c["verdict"] != "real_talent":
                q["flags"].append(f"проверка: настоящий «{o['text']}» — {c['verdict']} ({c['note']})")
            if not c["translation_ok"]:
                q["flags"].append(f"проверка: настоящий «{o['text']}» не совпадает со строкой игры ({c['note']})")
        elif c["verdict"] == "real_talent":
            q["flags"].append(f"проверка: подделка «{o['text']}» — реальный талант героя ({c['note']})")
        elif c["verdict"] == "too_close":
            q["flags"].append(f"проверка: подделка «{o['text']}» слишком близка к таланту ({c['note']})")
        if "language_ok" in c:
            o["language_ok"], o["plausible"] = c["language_ok"], c.get("plausible", True)
            if not c["language_ok"]:
                q["flags"].append(f"проверка: язык «{o['text']}» — не слова игры ({c['note']})")
            if o["kind"] != "real" and not c.get("plausible", True):
                q["flags"].append(f"проверка: подделка «{o['text']}» неправдоподобна ({c['note']})")
    for q in questions:
        decoys = [o for o in q["options"] if o["kind"] == "invented" and o.get("verdict") in ("shard", "scepter", "default")]
        if len(decoys) > 1:
            q["flags"].append(f"проверка: обманок {len(decoys)} ({', '.join(o['verdict'] for o in decoys)}), можно одну")
    for s in ver.get("style", []):
        try:
            q = questions[s["question"]]
        except IndexError:
            continue
        q["style_verdict"] = {"gives_away": s["style_gives_away"], "note": s["note"]}
        if s["style_gives_away"]:
            q["flags"].append(f"проверка: стиль выдаёт ответ ({s['note']})")


def run_one(client, idx: int, sample: dict, prompt: str, verify_prompt: str, effort: str, names: set[str]) -> dict:
    body, gen_usage = _call(client, prompt, sample, schema(sample), effort)
    questions = [check(q, sample, names) for q in body.get("questions", [])]
    ver_usage = None
    if questions:
        heroes = {q["hero"] for q in questions}
        payload = {"heroes": [h for h in sample["heroes"] if h["hero"] in heroes],
                   "questions": [{"index": i, "hero": q["hero"],
                                  "options": [{"index": j, "text": o["text"]} for j, o in enumerate(q["options"])]}
                                 for i, q in enumerate(questions)]}
        ver, ver_usage = _call(client, verify_prompt, payload, verify_schema(), effort)
        apply_verification(questions, ver)
    print(f"  запрос {idx}: {len(questions)} вопросов, генерация {gen_usage['seconds']}с, "
          f"проверка {ver_usage['seconds'] if ver_usage else '-'}с", flush=True)
    return {"index": idx, "heroes": [h["hero"] for h in sample["heroes"]], "questions": questions,
            "usage": {"generate": gen_usage, "verify": ver_usage}}


# ─── Статистика и отчёт ──────────────────────────────────────────────────────

def style_stats(questions: list[dict]) -> list[str]:
    qs = [q for q in questions if sum(o["kind"] == "real" for o in q["options"]) == 1 and len(q["options"]) == 4]
    if not qs:
        return ["Стиль: вопросов нет"]
    ms = [style_metrics(q["options"]) for q in qs]
    n = len(qs)
    reals = [o["text"] for q in qs for o in q["options"] if o["kind"] == "real"]
    fakes = [o["text"] for q in qs for o in q["options"] if o["kind"] != "real"]
    pct = lambda k, d: f"{k}/{d} ({100 * k / d:.0f}%)"   # noqa: E731
    ranks = [sum(m["real_rank"] == r for m in ms) for r in (1, 2, 3, 4)]
    lines = [
        f"Стиль ({n} вопросов):",
        f"- правда самая короткая (строго): {pct(sum(m['real_shortest'] for m in ms), n)}, "
        f"самая длинная (строго): {pct(sum(m['real_longest'] for m in ms), n)}; место правды по длине 1..4: {ranks}",
        f"- цифры: у правды {pct(sum(bool(_DIGIT.search(t)) for t in reals), n)}, "
        f"у подделок {pct(sum(bool(_DIGIT.search(t)) for t in fakes), len(fakes))}; "
        f"смешанные вопросы (цифры не у всех) {pct(sum(any(m['digits']) and not all(m['digits']) for m in ms), n)}",
        f"- разброс длин max/min: средний {statistics.mean(m['ratio'] for m in ms):.2f}, "
        f"медиана {statistics.median(m['ratio'] for m in ms):.2f}, > {MAX_RATIO}: {pct(sum(m['ratio'] > MAX_RATIO for m in ms), n)}",
        f"- средняя длина: правда {statistics.mean(map(len, reals)):.0f}, подделки {statistics.mean(map(len, fakes)):.0f}",
        "- формулы (правда / подделки): " + ", ".join(
            f"{k} {sum(bool(re.search(p, t.lower())) for t in reals)}/{sum(bool(re.search(p, t.lower())) for t in fakes)}"
            for k, p in TELLS.items()),
    ]
    typed = [q for q in qs if (q.get("style") or {}).get("effects")]
    if typed:
        fake_e = [[e for o, e in zip(q["options"], q["style"]["effects"]) if o["kind"] != "real"] for q in typed]
        distinct = [len(set(f)) for f in fake_e]
        flat = [e for f in fake_e for e in f]
        real_e = [e for q in typed for o, e in zip(q["options"], q["style"]["effects"]) if o["kind"] == "real"]
        lines.append(f"- типы эффекта у подделок в вопросе: 3 разных {pct(distinct.count(3), len(typed))}, "
                     f"2 {pct(distinct.count(2), len(typed))}, все одного {pct(distinct.count(1), len(typed))}; "
                     f"≥2 подделок со статусом {pct(sum(f.count('статус') >= 2 for f in fake_e), len(typed))}")
        lines.append("- типы подделок: " + ", ".join(f"{e} {flat.count(e)}" for e in sorted(set(flat), key=lambda e: -flat.count(e))))
        lines.append("- типы правды: " + ", ".join(f"{e} {real_e.count(e)}" for e in sorted(set(real_e), key=lambda e: -real_e.count(e))))
    decoys = [o.get("decoy") for q in qs for o in q["options"] if o["kind"] != "real" and o.get("decoy")]
    verdicts = [o.get("verdict") for q in qs for o in q["options"] if o["kind"] != "real" and o.get("verdict")]
    if decoys:
        lines.append("- обманки по пометке генератора: " + ", ".join(f"{d} {decoys.count(d)}" for d in DECOYS))
    if verdicts:
        lines.append("- вердикты проверки у подделок: " + ", ".join(f"{v} {verdicts.count(v)}" for v in VERDICTS if verdicts.count(v)))
    return lines


def _usd(u):
    return (u["input_tokens"] * PRICE["input"] + u["output_tokens"] * PRICE["output"]) / 1e6 if u else 0


def report(results: list[dict]) -> str:
    total = sum(_usd(r["usage"]["generate"]) + _usd(r["usage"]["verify"]) for r in results)
    tokens = {k: sum((r["usage"][s] or {}).get(k, 0) for r in results for s in ("generate", "verify"))
              for k in ("input_tokens", "output_tokens")}
    qs = [q for r in results for q in r["questions"]]
    clean = [q for q in qs if not q["flags"]]
    lines = ["# Таланты", "",
             f"Запросов: {len(results)}, вопросов: {len(qs)}, с флагами: {len(qs) - len(clean)}, "
             f"чистых: {len(clean)} (героев {len({q['hero'] for q in clean})}), стоимость: ${total:.2f} "
             f"(вход {tokens['input_tokens']}, выход {tokens['output_tokens']} токенов)", "",
             "## Все вопросы", "", *style_stats(qs), "", "## Чистые", "", *style_stats(clean), ""]
    for r in results:
        for q in r["questions"]:
            m = q.get("style") or {}
            lines.append(f"**{q['hero']}** — {q['question']} · длины {m.get('lengths')}, разброс {m.get('ratio')}")
            effects = m.get("effects") or [None] * len(q["options"])
            for o, eff in zip(q["options"], effects):
                mark = "✔" if o["kind"] == "real" else "·"
                same = o.get("original_ru") and o["text"].strip() == o["original_ru"].strip()
                extra = ((f" ← {'дословно' if same else '«' + str(o.get('original_ru')) + '»'} · «{o.get('original', '?')}» "
                          f"({o.get('talent_kind', '?')})") if o["kind"] == "real"
                         else f" [{o.get('decoy', 'invented')}]")
                ver = f" {{{o['verdict']}}}" if o.get("verdict") else ""
                lines.append(f"- {mark} {o['text']}{extra}{ver}{f' ‹{eff}›' if eff else ''}")
            for f in q["flags"]:
                lines.append(f"- ⚠ {f}")
            lines.append("")
    return "\n".join(lines)


def _questions(run_dir: Path) -> list[dict]:
    return [q for g in json.loads((run_dir / "questions.json").read_text(encoding="utf-8")) for q in g["questions"]]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir")
    ap.add_argument("--heroes", type=int, default=8, help="случайных героев (тестовый прогон)")
    ap.add_argument("--full", action="store_true", help="все актуальные герои")
    ap.add_argument("--npcs", help="список героев через запятую (npc_dota_hero_…)")
    ap.add_argument("--per-request", type=int, default=HEROES_PER_REQUEST)
    ap.add_argument("--append", action="store_true", help="дописать группы к questions.json прогона")
    ap.add_argument("--prompt", default="prompt_talents_v5.md")
    ap.add_argument("--verify-prompt", default="prompt_talents_verify_v5.md")
    ap.add_argument("--effort", default="high")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--stats", action="store_true", help="только статистика стиля по готовому прогону")
    ap.add_argument("--report", action="store_true", help="пересобрать report.md по questions.json")
    ap.add_argument("--recheck", action="store_true",
                    help="заново применить проверку кодом к questions.json (флаги проверки моделью сохраняются)")
    args = ap.parse_args()

    run_dir = Path(args.run_dir)
    if not run_dir.is_absolute() and not run_dir.parent.exists():
        run_dir = LAB / run_dir
    if args.stats:
        qs = _questions(run_dir)
        print("\n".join(["Все:", *style_stats(qs), "", "Без флагов:", *style_stats([q for q in qs if not q.get("flags")])]))
        return
    if args.recheck:
        results = json.loads((run_dir / "questions.json").read_text(encoding="utf-8"))
        samples = [s for f in sorted(run_dir.glob("samples*.json")) for s in json.loads(f.read_text(encoding="utf-8"))]
        names = known_names()
        for r in results:
            sample = {"heroes": [h for s in samples for h in s["heroes"] if h["hero"] in r["heroes"]]}
            for i, q in enumerate(r["questions"]):
                kept = [f for f in q["flags"] if f.startswith("проверка:")]
                fresh = check({k: v for k, v in q.items() if k not in ("flags", "style")}, sample, names)
                r["questions"][i] = {**fresh, "flags": fresh["flags"] + kept}
        (run_dir / "questions.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        args.report = True
    if args.report:
        results = json.loads((run_dir / "questions.json").read_text(encoding="utf-8"))
        (run_dir / "report.md").write_text(report(results), encoding="utf-8")
        return
    run_dir.mkdir(parents=True, exist_ok=True)

    current = _load("current")
    if args.npcs:
        npcs = [n.strip() for n in args.npcs.split(",") if n.strip()]
    else:
        npcs = list(current["heroes"])
        random.SystemRandom().shuffle(npcs)
        if not args.full:
            npcs = npcs[:args.heroes]
    samples = build_samples(npcs, args.per_request)
    prev = json.loads((run_dir / "questions.json").read_text(encoding="utf-8")) if args.append and (run_dir / "questions.json").exists() else []
    offset = len(prev)
    tag = f"samples{'-' + str(offset) if offset else ''}.json"
    (run_dir / tag).write_text(json.dumps(samples, ensure_ascii=False, indent=1), encoding="utf-8")
    prompt = (LAB / args.prompt).read_text(encoding="utf-8")
    verify_prompt = (LAB / args.verify_prompt).read_text(encoding="utf-8")
    (run_dir / "prompt.md").write_text(prompt, encoding="utf-8")
    (run_dir / "prompt_verify.md").write_text(verify_prompt, encoding="utf-8")
    print(f"{len(npcs)} героев → {len(samples)} запросов")
    if args.dry_run:
        return

    client = _client()
    names = known_names()
    started = time.time()

    def safe(a):
        for attempt in range(3):
            try:
                return run_one(client, a[0], a[1], prompt, verify_prompt, args.effort, names)
            except Exception as e:  # noqa: BLE001
                print(f"  запрос {a[0]}: ошибка {e!r}, попытка {attempt + 1}", flush=True)
                time.sleep(5)
        return {"index": a[0], "heroes": [h["hero"] for h in a[1]["heroes"]], "questions": [],
                "usage": {"generate": None, "verify": None}, "error": True}

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(safe, [(offset + i, s) for i, s in enumerate(samples)]))
    results = prev + results
    (run_dir / "questions.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    text = report(results)
    (run_dir / "report.md").write_text(text, encoding="utf-8")
    print(text.split("\n## Все вопросы")[0], f"| {time.time() - started:.0f} с")
    print("\n".join(style_stats([q for r in results for q in r["questions"] if not q["flags"]])))


if __name__ == "__main__":
    main()
