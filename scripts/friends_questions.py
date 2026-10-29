#!/usr/bin/env python3
"""
Вопросы про друзей: метрики из матчей компании и сборка вопросов (прототип для переноса в server/).

Блоки (решено 2026-10-27, пересмотрено 2026-10-29):
  А  hero_main     — на каком из героев больше всего игр (MC); если мейн другого режима не лидер здесь —
                     он ловушка на месте одного из соперников (бывший mode_trap)
     hero_games    — сколько игр на герое (closest, единица «игр»)
  Б  hero_wr       — на ком лучший / худший винрейт (MC: лидер от MIN_WR_LEAD_GAMES игр, остальные от MIN_WR_GAMES)
     self_wr       — «знаешь ли ты себя»: какой винрейт на герое (MC, шаг от выборки, не меньше SELF_WR_MIN_STEP)
  В  pair_games    — сколько игр вместе (closest, единица «игр»)
     pair_top      — с кем больше всего общих игр (MC)

Правила выборки (docs/questions/stratz-research.md, «Друзья»):
  - ник — меткой в начале, без склонения: «выбрудок: на каком из героев больше всего игр в рейтинге?»;
  - вопрос про одного: открытый профиль — вся история («в рейтинге»), аноним — игры в пати с кем-то из открытых
    профилей («в пати рейтинге»); окно выборки — в comment;
  - срезы: рейтинг (lobbyType RANKED) и Турбо, не смешиваются; остальное (нерейтинговый All Pick, Single Draft,
    Battle Cup) в вопросы не идёт; пары аноним + аноним не спрашиваем (видны только игры при открытом);
  - отрыв лидера от второго: счётчики ≥ 15%, винрейты ≥ 10 п.п.;
  - hero_games и self_wr — только TOP_CARDS самых игранных героев человека в срезе (иначе DUPEHb со 130 героями
    забивает колоду);
  - как в STRATZ-подкатегориях: герой (человек в pair_top), попавший в варианты, исключается из этого типа
    вопросов до конца игры (Gen.used); ответ — лидер среди показанных вариантов.

  python scripts/friends_questions.py --build          # matches.jsonl → metrics.json
  python scripts/friends_questions.py --sample 2       # по 2 вопроса каждого типа (ответы — в --answers)
"""

import argparse
import json
import math
import random
import sys
from collections import defaultdict
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path

DIR = Path("scripts/data/friends")
DOTA_DIR = Path("scripts/data/dota")
PEOPLE = {1101588971: "выбрудок", 910030283: "Блох Иглы", 841374410: "ональный трахадоr",
          1023791464: "DUPEHb", 875585992: "Питахайль", 1259367416: "гнилой кулич", 1548018309: "Rocinante"}
MODES = {"ranked": lambda m: m.get("lobbyType") == "RANKED", "turbo": lambda m: m.get("gameMode") == "TURBO"}
MODE_TEXT = {"ranked": "в рейтинге", "turbo": "в Турбо"}
PARTY_TEXT = {"ranked": "в пати рейтинге", "turbo": "в пати Турбо"}
MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября",
          "ноября", "декабря"]
MIN_COUNT_GAP = 0.15
MIN_WR_GAP = 0.10
MIN_WR_GAMES = 30        # hero_wr: варианты
MIN_WR_LEAD_GAMES = 50   # hero_wr: правильный ответ (лидер на 31 игре — шум ±9 п.п.)
MIN_SELF_WR_GAMES = 40
SELF_WR_MIN_STEP = 5     # п.п.; на малой выборке шаг ≈ одна стандартная ошибка: round(50 / √игр)
MIN_HERO_GAMES = 20      # hero_main (варианты, кроме ловушки) и hero_games
MIN_PAIR_GAMES = 50
TOP_POOL = 8             # варианты «мейна» — из первых TOP_POOL героев человека
TOP_CARDS = 6            # hero_games, self_wr — герои из первых TOP_CARDS по играм


def month(t: int) -> str:
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m")


# ---------- метрики ----------

def build_metrics(profiles: dict) -> dict:
    open_ids = {a for a in PEOPLE if not ((profiles.get(str(a)) or {}).get("steamAccount") or {}).get("isAnonymous")}
    heroes = {m: {a: {"own": defaultdict(lambda: [0, 0]), "company": defaultdict(lambda: [0, 0])} for a in PEOPLE}
              for m in MODES}
    pairs = {m: defaultdict(int) for m in MODES}
    # окно выборки: первый и последний матч (unix) по человеку и базе, по паре
    spans = {m: {a: {} for a in PEOPLE} for m in MODES}
    pair_spans = {m: {} for m in MODES}

    def stretch(rec: dict, key: str, t: int) -> None:
        lo, hi = rec.get(key, (t, t))
        rec[key] = (min(lo, t), max(hi, t))

    with open(DIR / "matches.jsonl", encoding="utf-8") as f:
        for line in f:
            match = json.loads(line)
            mode = next((k for k, keep in MODES.items() if keep(match)), None)
            if mode is None:
                continue
            t = match["startDateTime"]
            ps = {p["steamAccountId"]: p for p in match["players"] if p["steamAccountId"] in PEOPLE}
            for a, p in ps.items():
                if not p.get("heroId"):
                    continue
                with_open = p["partyId"] is not None and any(
                    o in open_ids and o != a and q["partyId"] == p["partyId"] and q["isRadiant"] == p["isRadiant"]
                    for o, q in ps.items())
                bases = (["own"] if a in open_ids else []) + (["company"] if with_open else [])
                for b in bases:
                    rec = heroes[mode][a][b][p["heroId"]]
                    rec[0] += 1
                    rec[1] += bool(p["isVictory"])
                    stretch(spans[mode][a], b, t)
            for a, b in combinations(sorted(ps), 2):
                if ps[a]["isRadiant"] == ps[b]["isRadiant"]:
                    pairs[mode][f"{a}-{b}"] += 1
                    stretch(pair_spans[mode], f"{a}-{b}", t)
    return {"people": {str(a): {"name": n, "open": a in open_ids} for a, n in PEOPLE.items()},
            "heroes": {m: {str(a): {b: {str(h): v for h, v in sorted(hs.items(), key=lambda kv: -kv[1][0])}
                                    for b, hs in by.items()} for a, by in per.items()} for m, per in heroes.items()},
            "pairs": {m: dict(sorted(v.items(), key=lambda kv: -kv[1])) for m, v in pairs.items()},
            "spans": {m: {str(a): {b: [month(lo), month(hi)] for b, (lo, hi) in by.items()} for a, by in per.items()}
                      for m, per in spans.items()},
            "pairSpans": {m: {k: [month(lo), month(hi)] for k, (lo, hi) in v.items()} for m, v in pair_spans.items()}}


# ---------- вопросы ----------

def plural(n: int, one: str, few: str, many: str) -> str:
    m10, m100 = n % 10, n % 100
    w = one if m10 == 1 and m100 != 11 else few if 2 <= m10 <= 4 and not 12 <= m100 <= 14 else many
    return f"{n} {w}"


def since(ym: str | None) -> str:
    """'2022-10' → «с октября 2022»"""
    if not ym:
        return ""
    y, mo = ym.split("-")
    return f"с {MONTHS[int(mo) - 1]} {y}"


def wr_step(games: int) -> int:
    return max(SELF_WR_MIN_STEP, round(50 / math.sqrt(games)))


def wr_options(answer: int, step: int, rng: random.Random) -> list[int]:
    """4 варианта через step, все в (0, 100); позиция ответа по величине — случайная из допустимых."""
    valid = [p for p in range(4) if answer - p * step > 0 and answer + (3 - p) * step < 100] or [0]
    p = rng.choice(valid)
    return [answer + (i - p) * step for i in range(4)]


class Gen:
    """Генератор на одну игру: used — что уже было в вариантах (по типу вопроса и человеку)."""

    def __init__(self, metrics: dict, hero_names: dict, rng: random.Random):
        self.m, self.names, self.rng = metrics, hero_names, rng
        self.people = {int(a): p for a, p in metrics["people"].items()}
        self.used = defaultdict(set)

    def where(self, a: int, mode: str) -> str:
        return MODE_TEXT[mode] if self.people[a]["open"] else PARTY_TEXT[mode]

    def base(self, a: int) -> str:
        return "own" if self.people[a]["open"] else "company"

    def heroes(self, a: int, mode: str) -> dict[int, tuple[int, int]]:
        return {int(h): tuple(v) for h, v in self.m["heroes"][mode][str(a)][self.base(a)].items()}

    def top_heroes(self, a: int, mode: str, min_games: int) -> list[tuple[int, int, int]]:
        hs = sorted(((h, g, w) for h, (g, w) in self.heroes(a, mode).items() if g >= min_games), key=lambda x: -x[1])
        return hs[:TOP_CARDS]

    def window(self, a: int, mode: str) -> str:
        """Окно выборки для comment."""
        span = self.m.get("spans", {}).get(mode, {}).get(str(a), {}).get(self.base(a))
        frm = since(span[0]) if span else ""
        if self.people[a]["open"]:
            return f"Вся история STRATZ{' — ' + frm if frm else ''}."
        return f"Профиль скрыт: только игры в пати с открытыми профилями{', ' + frm if frm else ''}."

    def pair(self, a: int, b: int, mode: str) -> int:
        x, y = sorted((a, b))
        return self.m["pairs"][mode].get(f"{x}-{y}", 0)

    def who(self, a: int) -> str:
        return self.people[a]["name"]

    def leader_set(self, cands: list, gap_ok, lead_ok=lambda c: True) -> list | None:
        """4 варианта (id, значение): лидер (cands по убыванию «лучшести») отрывается от остальных трёх.
        Перебор: лидер — по порядку (из тех, кто проходит lead_ok), тройки — в случайном порядке."""
        for i, lead in enumerate(cands):
            if not lead_ok(lead):
                continue
            rest = [c for c in cands[i + 1:] if gap_ok(lead[1], c[1])]
            if len(rest) >= 3:
                return [lead] + self.rng.sample(rest, 3)
        return None

    def mc(self, kind: str, key, text: str, picked: list, label, note=lambda v: str(v)) -> dict:
        """picked[0] — правильный; optionNotes — истинные значения вариантов (показ после ответа)."""
        self.used[key] |= {i for i, _ in picked}
        pairs = [(label(i), note(v)) for i, v in picked]
        answer = pairs[0][0]
        self.rng.shuffle(pairs)
        return {"kind": kind, "text": text, "options": [o for o, _ in pairs], "optionNotes": [n for _, n in pairs],
                "answer": answer}

    # А
    def hero_main(self, a: int, mode: str) -> dict | None:
        key = ("hero_main", a, mode)
        other = "turbo" if mode == "ranked" else "ranked"
        games = {h: g for h, (g, _) in self.heroes(a, mode).items()}
        hs = sorted(((h, g) for h, g in games.items() if g >= MIN_HERO_GAMES and h not in self.used[key]),
                    key=lambda kv: -kv[1])[:TOP_POOL]
        pick = self.leader_set(hs, lambda l, o: l >= o * (1 + MIN_COUNT_GAP))
        if not pick:
            return None
        # ловушка: мейн другого режима — на место случайного соперника (сколько бы игр у него ни было здесь)
        oth = sorted(self.heroes(a, other).items(), key=lambda kv: -kv[1][0])
        trap = oth[0][0] if oth else None
        lead = pick[0]
        trap_ok = (trap is not None and trap != lead[0] and trap not in self.used[key]
                   and lead[1] >= games.get(trap, 0) * (1 + MIN_COUNT_GAP))
        if trap_ok and trap not in {h for h, _ in pick}:
            pick[3] = (trap, games.get(trap, 0))
        q = self.mc("hero_main", key, f"{self.who(a)}: на каком из героев больше всего игр {self.where(a, mode)}?",
                    pick, self.names.get)
        q["comment"] = ((f"{self.names[trap]} — мейн {self.where(a, other)}, а не {self.where(a, mode)}. "
                         if trap_ok else "") + self.window(a, mode))
        return q

    def hero_games(self, a: int, mode: str) -> dict | None:
        key = ("hero_games", a, mode)
        hs = [(h, g) for h, g, _ in self.top_heroes(a, mode, MIN_HERO_GAMES) if h not in self.used[key]]
        if not hs:
            return None
        h, g = self.rng.choice(hs)
        self.used[key].add(h)
        return {"kind": "hero_games", "mode": "closest", "answer": g, "unit": "игр",
                "text": f"{self.who(a)}: сколько игр на {self.names[h]} {self.where(a, mode)}?",
                "comment": self.window(a, mode)}

    # Б
    def hero_wr(self, a: int, mode: str, best: bool) -> dict | None:
        key = ("hero_wr", a, mode)
        stats = {h: (g, w) for h, (g, w) in self.heroes(a, mode).items() if g >= MIN_WR_GAMES and h not in self.used[key]}
        hs = sorted(((h, w / g) for h, (g, w) in stats.items()), key=lambda kv: -kv[1] if best else kv[1])
        sign = 1 if best else -1
        # лидер — только от MIN_WR_LEAD_GAMES игр: более редкие и «лучше» лидера в варианты не попадают
        pick = self.leader_set(hs, lambda l, o: sign * (l - o) >= MIN_WR_GAP,
                               lambda c: stats[c[0]][0] >= MIN_WR_LEAD_GAMES)
        if not pick:
            return None
        word = "лучший" if best else "худший"
        g, _ = stats[pick[0][0]]
        q = self.mc("hero_wr", key, f"{self.who(a)}: на ком {word} винрейт {self.where(a, mode)}?",
                    pick, self.names.get, note=lambda v: f"{round(100 * v)}%")
        q["comment"] = (f"{self.names[pick[0][0]]} — {round(100 * pick[0][1])}% за {plural(g, 'игру', 'игры', 'игр')}; "
                        f"в вариантах — герои от {MIN_WR_GAMES} игр. {self.window(a, mode)}")
        return q

    def self_wr(self, a: int, mode: str) -> dict | None:
        key = ("self_wr", a, mode)
        hs = [x for x in self.top_heroes(a, mode, MIN_SELF_WR_GAMES) if x[0] not in self.used[key]]
        if not hs:
            return None
        h, g, w = self.rng.choice(hs)
        self.used[key].add(h)
        answer = round(100 * w / g)
        options = [f"{o}%" for o in wr_options(answer, wr_step(g), self.rng)]
        self.rng.shuffle(options)                                    # и отдельно — порядок показа
        return {"kind": "self_wr", "options": options, "answer": f"{answer}%",
                "text": f"{self.who(a)}: какой винрейт на {self.names[h]} {self.where(a, mode)}?",
                "comment": f"{plural(g, 'игра', 'игры', 'игр')}, {plural(w, 'победа', 'победы', 'побед')}. "
                           + self.window(a, mode)}

    # В
    def pair_ok(self, a: int, b: int) -> bool:
        return self.people[a]["open"] or self.people[b]["open"]

    def pair_games(self, mode: str) -> dict | None:
        key = ("pair_games", mode)
        cand = [(a, b) for a, b in combinations(sorted(self.people), 2) if (a, b) not in self.used[key]
                and self.pair_ok(a, b) and self.pair(a, b, mode) >= MIN_PAIR_GAMES]
        if not cand:
            return None
        a, b = self.rng.choice(cand)
        self.used[key].add((a, b))
        span = self.m.get("pairSpans", {}).get(mode, {}).get(f"{a}-{b}")
        return {"kind": "pair_games", "mode": "closest", "answer": self.pair(a, b, mode), "unit": "игр",
                "text": f"{self.who(a)} и {self.who(b)}: сколько игр вместе {MODE_TEXT[mode]}?",
                "comment": "В одной команде" + (f", {since(span[0])}." if span else ".")}

    def pair_top(self, a: int, mode: str) -> dict | None:
        key = ("pair_top", mode)
        mates = sorted(((b, self.pair(a, b, mode)) for b in self.people
                        if b != a and b not in self.used[key] and self.pair_ok(a, b)), key=lambda kv: -kv[1])
        pick = self.leader_set(mates, lambda l, o: l >= o * (1 + MIN_COUNT_GAP))
        if not pick:
            return None
        q = self.mc("pair_top", key, f"{self.who(a)}: с кем больше всего общих игр {MODE_TEXT[mode]}?", pick, self.who)
        q["comment"] = (f"В одной команде. {self.window(a, mode)}" if self.people[a]["open"]
                        else "В одной команде, по историям открытых профилей.")
        return q

    def any_of(self, kind: str) -> dict | None:
        """Вопрос типа kind про случайного человека в случайном срезе (перебор, пока не соберётся)."""
        if kind == "pair_games":
            modes = list(MODES)
            self.rng.shuffle(modes)
            return next((q for q in (self.pair_games(m) for m in modes) if q), None)
        subjects = [(a, m) for a in self.people for m in MODES]
        self.rng.shuffle(subjects)
        for a, mode in subjects:
            q = {"hero_main": lambda: self.hero_main(a, mode), "hero_games": lambda: self.hero_games(a, mode),
                 "hero_wr": lambda: self.hero_wr(a, mode, self.rng.random() < 0.5),
                 "self_wr": lambda: self.self_wr(a, mode), "pair_top": lambda: self.pair_top(a, mode)}[kind]()
            if q:
                return q
        return None


KINDS = ["hero_main", "hero_games", "hero_wr", "self_wr", "pair_games", "pair_top"]


def main() -> None:
    ap = argparse.ArgumentParser(description="Вопросы про друзей")
    ap.add_argument("--build", action="store_true", help="пересобрать metrics.json из matches.jsonl")
    ap.add_argument("--sample", type=int, default=0, help="сколько вопросов каждого типа показать")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--answers", help="куда записать ответы к --sample (иначе печатаются)")
    args = ap.parse_args()

    if args.build:
        profiles = json.loads((DIR / "profiles.json").read_text(encoding="utf-8"))
        metrics = build_metrics(profiles)
        (DIR / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"→ {DIR / 'metrics.json'}")
    if args.sample:
        metrics = json.loads((DIR / "metrics.json").read_text(encoding="utf-8"))
        names = {int(k): v["localized_name"] for k, v in json.loads((DOTA_DIR / "heroes.json").read_text(encoding="utf-8")).items()}
        gen = Gen(metrics, names, random.Random(args.seed))
        answers, n = [], 0
        for kind in KINDS:
            for _ in range(args.sample):
                q = gen.any_of(kind)
                if not q:
                    print(f"[{kind}] не собрался")
                    continue
                n += 1
                print(f"{n}. [{kind}] {q['text']}" + (f"\n   {' / '.join(map(str, q['options']))}" if "options" in q else ""))
                answers.append(f"{n}. {q['answer']}" + (f" {q['unit']}" if q.get("unit") else "")
                               + (f"\n   {q['comment']}" if q.get("comment") else ""))
                if q.get("optionNotes"):
                    answers.append(f"   значения: {' / '.join(f'{o} {v}' for o, v in zip(q['options'], q['optionNotes']))}")
        if args.answers:
            Path(args.answers).write_text("\n".join(answers) + "\n", encoding="utf-8")
        else:
            print("\nОтветы:\n" + "\n".join(answers))


if __name__ == "__main__":
    main()
