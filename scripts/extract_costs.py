import json
from pathlib import Path

src = json.loads(Path("scripts/data/item_questions.json").read_text(encoding="utf-8"))
cost_items = [q for q in src["numeric"] if q.get("category") == "cost"]

out = []
for q in cost_items:
    out.append({
        "type": "closest_number",
        "topic": "цена",
        "source": q["item"],
        "question": q["question"],
        "answer": q["answer"],
        "unit": q["unit"],
        "difficulty": "",
    })

out_path = Path("scripts/data/generated/costs_main.json")
out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Сохранено {len(out)} вопросов -> {out_path}")
