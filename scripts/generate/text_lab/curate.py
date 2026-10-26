#!/usr/bin/env python3
"""
Ручное курирование прогона механик: questions.json + curation.json → bank.json.

curation.json:
  {"drop":    {"Hero · Ability": "причина", …},
   "comment": {"Hero · Ability": "новый комментарий", …}}

  python scripts/generate/text_lab/curate.py scripts/generate/text_lab/out/full1
"""

import json
import sys
from pathlib import Path


def main() -> None:
    run = Path(sys.argv[1])
    cur = json.loads((run / "curation.json").read_text(encoding="utf-8"))
    questions = [q for r in json.loads((run / "questions.json").read_text(encoding="utf-8")) for q in r["questions"]]
    keys = {f"{q['hero']} · {q['ability']}" for q in questions}
    unknown = (set(cur["drop"]) | set(cur["comment"])) - keys
    if unknown:
        sys.exit(f"нет таких вопросов: {sorted(unknown)}")

    bank = []
    for q in questions:
        key = f"{q['hero']} · {q['ability']}"
        if key in cur["drop"]:
            continue
        bank.append({"hero": q["hero"], "ability": q["ability"], "format": q["format"], "question": q["question"],
                     "options": [o["text"] for o in q["options"]],
                     "answer": next(o["text"] for o in q["options"] if o["correct"]),
                     "comment": cur["comment"].get(key, q["comment"])})
    (run / "bank.json").write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(questions)} вопросов → убрано {len(cur['drop'])}, в банке {len(bank)}")


if __name__ == "__main__":
    main()
