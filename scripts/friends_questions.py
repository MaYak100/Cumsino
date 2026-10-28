#!/usr/bin/env python3
"""
Вопросы про друзей: метрики из матчей компании и сборка вопросов (прототип для переноса в server/).

Блоки (решено 2026-10-27):
  А  hero_main     — на каком из героев у X больше всего игр (MC)
     hero_games    — сколько игр X сыграл на герое (closest)
  Б  hero_wr       — на ком из героев у X лучший / худший винрейт (MC, герои от MIN_WR_GAMES игр)
     self_wr       — «знаешь ли ты себя»: какой у X винрейт на герое (kerri, варианты по шагу 2 п.п.)
  В  pair_games    — сколько игр вместе сыграли A и B (closest)
     pair_top      — с кем X сыграл больше всего игр (MC)
  Е  mode_trap     — мейн в Турбо / в рейтинге, среди вариантов — мейн другого режима (MC)

Правила выборки (docs/questions/stratz-research.md, «Друзья»):
  - вопрос про одного: открытый профиль — вся история («в рейтинге»), аноним — игры в пати с кем-то из открытых
    профилей («в пати рейтинге»);
  - срезы: рейтинг (lobbyType RANKED) и Турбо, не смешиваются; остальное (нерейтинговый All Pick, Single Draft,
    Battle Cup) в вопросы не идёт; пары аноним + аноним не спрашиваем (видны только игры при открытом);
  - отрыв лидера от второго: счётчики ≥ 15%, винрейты ≥ 10 п.п.; винрейт — от 30 игр;
  - как в STRATZ-подкатегориях: герой (человек в pair_top), попавший в варианты, исключается из этого типа
    вопросов до конца игры (Gen.used); ответ — лидер среди показанных вариантов.

  python scripts/friends_questions.py --build          # matches.jsonl → metrics.json
  python scripts/friends_questions.py --sample 2       # по 2 вопроса каждого типа (ответы — в --answers)
"""

import argparse
import json
import random
import sys
from collections import defaultdict
from itertools import combinations
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "generate" / "numeric_lab"))
from options import make_options  # noqa: E402

DIR = Path("scripts/data/friends")
DOTA_DIR = Path("scripts/data/dota")
PEOPLE = {1101588971: "выбрудок", 910030283: "Блох Иглы", 841374410: "ональный трахадоr",
          1023791464: "DUPEHb", 875585992: "Питахайль", 1259367416: "гнилой кулич", 1548018309: "Rocinante"}
MODES = {"ranked": lambda m: m.get("lobbyType") == "RANKED", "turbo": lambda m: m.get("gameMode") == "TURBO"}
MODE_TEXT = {"ranked": "в рейтинге", "turbo": "в Турбо"}
PARTY_TEXT = {"ranked": "в пати рейтинге", "turbo": "в пати Турбо"}
MIN_COUNT_GAP = 0.15
MIN_WR_GAP = 0.10
MIN_WR_GAMES = 30
SELF_WR_STEP = 2       # п.п.
MIN_HERO_GAMES = 20     # для «сколько игр на герое»
MIN_PAIR_GAMES = 50
TOP_POOL = 8            # варианты «мейна» — из первых TOP_POOL героев человека


# ---------- метрики ----------

def build_metrics(profiles: dict) -> dict:
    open_ids = {a for a in PEOPLE if not ((profiles.get(str(a)) or {}).get("steamAccount") or {}).get("isAnonymous")}
    heroes = {m: {a: {"own": defaultdict(lambda: [0, 0]), "company": defaultdict(lambda: [0, 0])} for a in PEOPLE}
              for m in MODES}
    pairs = {m: defaultdict(int) for m in MODES}
    with open(DIR / "matches.jsonl", encoding="utf-8") as f:
        for line in f:
            match = json.loads(line)
            mode = next((k for k, keep in MODES.items() if keep(match)), None)
            if mode is None:
                continue
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
            for a, b in combinations(sorted(ps), 2):
                if ps[a]["isRadiant"] == ps[b]["isRadiant"]:
                    pairs[mode][f"{a}-{b}"] += 1
    return {"people": {str(a): {"name": n, "open": a in open_ids} for a, n in PEOPLE.items()},
            "heroes": {m: {str(a): {b: {str(h): v for h, v in sorted(hs.items(), key=lambda kv: -kv[1][0])}
                                    for b, hs in by.items()} for a, by in per.items()} for m, per in heroes.items()},
            "pairs": {m: dict(sorted(v.items(), key=lambda kv: -kv[1])) for m, v in pairs.items()}}


# ---------- вопросы ----------

class Gen:
    """Генератор на одну игру: used — что уже было в вариантах (по типу вопроса и человеку)."""

    def __init__(self, metrics: dict, hero_names: dict, rng: random.Random):
        self.m, self.names, self.rng = metrics, hero_names, rng
        self.people = {int(a): p for a, p in metrics["people"].items()}
        self.used = defaultdict(set)

    def where(self, a: int, mode: str) -> str:
        return MODE_TEXT[mode] if self.people[a]["open"] else PARTY_TEXT[mode]

    def heroes(self, a: int, mode: str) -> dict[int, tuple[int, int]]:
        b = "own" if self.people[a]["open"] else "company"
        return {int(h): tuple(v) for h, v in self.m["heroes"][mode][str(a)][b].items()}

    def pair(self, a: int, b: int, mode: str) -> int:
        x, y = sorted((a, b))
        return self.m["pairs"][mode].get(f"{x}-{y}", 0)

    def who(self, a: int) -> str:
        return self.people[a]["name"]

    def leader_set(self, cands: list, gap_ok) -> list | None:
        """4 варианта (id, значение): лидер (cands по убыванию «лучшести») отрывается от остальных трёх.
        Перебор: лидер — по порядку, тройки — в случайном порядке."""
        for i, lead in enumerate(cands):
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
        hs = sorted(((h, g) for h, (g, _) in self.heroes(a, mode).items() if h not in self.used[key]),
                    key=lambda kv: -kv[1])[:TOP_POOL]
        pick = self.leader_set(hs, lambda l, o: l >= o * (1 + MIN_COUNT_GAP))
        if not pick:
            return None
        return self.mc("hero_main", key, f"На каком из героев у {self.who(a)} больше всего игр {self.where(a, mode)}?",
                       pick, self.names.get)

    def hero_games(self, a: int, mode: str) -> dict | None:
        key = ("hero_games", a, mode)
        hs = [(h, g) for h, (g, _) in self.heroes(a, mode).items() if g >= MIN_HERO_GAMES and h not in self.used[key]]
        if not hs:
            return None
        h, g = self.rng.choice(hs)
        self.used[key].add(h)
        return {"kind": "hero_games", "mode": "closest", "answer": g,
                "text": f"Сколько игр {self.who(a)} сыграл на {self.names[h]} {self.where(a, mode)}?"}

    # Б
    def hero_wr(self, a: int, mode: str, best: bool) -> dict | None:
        key = ("hero_wr", a, mode)
        hs = sorted(((h, w / g) for h, (g, w) in self.heroes(a, mode).items()
                     if g >= MIN_WR_GAMES and h not in self.used[key]), key=lambda kv: -kv[1] if best else kv[1])
        sign = 1 if best else -1
        pick = self.leader_set(hs, lambda l, o: sign * (l - o) >= MIN_WR_GAP)
        if not pick:
            return None
        word = "лучший" if best else "худший"
        return self.mc("hero_wr", key, f"На ком из героев у {self.who(a)} {word} винрейт {self.where(a, mode)}?",
                       pick, self.names.get, note=lambda v: f"{round(100 * v)}%")

    def self_wr(self, a: int, mode: str) -> dict | None:
        key = ("self_wr", a, mode)
        hs = [(h, g, w) for h, (g, w) in self.heroes(a, mode).items() if g >= MIN_WR_GAMES and h not in self.used[key]]
        if not hs:
            return None
        h, g, w = self.rng.choice(hs)
        self.used[key].add(h)
        answer = round(100 * w / g)
        options, _ = make_options(answer, SELF_WR_STEP, self.rng)   # позиция ответа по величине — случайная
        options = [f"{o}%" for o in options]
        self.rng.shuffle(options)                                    # и отдельно — порядок показа
        return {"kind": "self_wr", "mode": "kerri", "options": options, "answer": f"{answer}%",
                "text": f"{self.who(a)}, какой у тебя винрейт на {self.names[h]} {self.where(a, mode)}?"}

    # В
    def pair_ok(self, a: int, b: int) -> bool:
        return self.people[a]["open"] or self.people[b]["open"]

    def pair_games(self, mode: str) -> dict | None:
        key = ("pair_games", mode)
        cand = [(a, b) for a, b in combinations(self.people, 2) if (a, b) not in self.used[key]
                and self.pair_ok(a, b) and self.pair(a, b, mode) >= MIN_PAIR_GAMES]
        if not cand:
            return None
        a, b = self.rng.choice(cand)
        self.used[key].add((a, b))
        return {"kind": "pair_games", "mode": "closest", "answer": self.pair(a, b, mode),
                "text": f"Сколько игр {self.who(a)} и {self.who(b)} сыграли вместе {MODE_TEXT[mode]}?"}

    def pair_top(self, a: int, mode: str) -> dict | None:
        key = ("pair_top", mode)
        mates = sorted(((b, self.pair(a, b, mode)) for b in self.people
                        if b != a and b not in self.used[key] and self.pair_ok(a, b)), key=lambda kv: -kv[1])
        pick = self.leader_set(mates, lambda l, o: l >= o * (1 + MIN_COUNT_GAP))
        if not pick:
            return None
        return self.mc("pair_top", key, f"С кем {self.who(a)} сыграл больше всего игр {MODE_TEXT[mode]}?",
                       pick, self.who)

    # Е
    def mode_trap(self, a: int, mode: str) -> dict | None:
        key = ("mode_trap", a)
        other = "turbo" if mode == "ranked" else "ranked"
        hs = {h: g for h, (g, _) in self.heroes(a, mode).items() if h not in self.used[key]}
        oth = [h for h, _ in sorted(self.heroes(a, other).items(), key=lambda kv: -kv[1][0]) if h not in self.used[key]]
        top = sorted(hs.items(), key=lambda kv: -kv[1])[:TOP_POOL]
        if not top or not oth:
            return None
        lead, trap = top[0], oth[0]
        g_trap = hs.get(trap, 0)
        if trap == lead[0] or lead[1] < g_trap * (1 + MIN_COUNT_GAP):
            return None
        rest = [x for x in top[1:] if x[0] != trap and lead[1] >= x[1] * (1 + MIN_COUNT_GAP)]
        if len(rest) < 2:
            return None
        q = self.mc("mode_trap", key, f"На каком из героев у {self.who(a)} больше всего игр {self.where(a, mode)}?",
                    [lead, (trap, g_trap)] + self.rng.sample(rest, 2), self.names.get)
        q["trap"] = self.names[trap]
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
                 "self_wr": lambda: self.self_wr(a, mode), "pair_top": lambda: self.pair_top(a, mode),
                 "mode_trap": lambda: self.mode_trap(a, mode)}[kind]()
            if q:
                return q
        return None


KINDS = ["hero_main", "hero_games", "hero_wr", "self_wr", "pair_games", "pair_top", "mode_trap"]


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
                answers.append(f"{n}. {q['answer']}" + (f" (ловушка: {q['trap']})" if q.get("trap") else ""))
                if q.get("optionNotes"):
                    answers.append(f"   значения: {' / '.join(f'{o} {v}' for o, v in zip(q['options'], q['optionNotes']))}")
        if args.answers:
            Path(args.answers).write_text("\n".join(answers) + "\n", encoding="utf-8")
        else:
            print("\nОтветы:\n" + "\n".join(answers))


if __name__ == "__main__":
    main()
