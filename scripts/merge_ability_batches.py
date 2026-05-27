import json, os
from collections import Counter

# 1. Собрать все новые вопросы
all_new = []
for i in range(1, 6):
    path = f'scripts/data/batches/ability_batch_{i}_new.json'
    with open(path, encoding='utf-8') as f:
        q = json.load(f)
    print(f'Batch {i}_new: {len(q)} вопросов')
    all_new.extend(q)

# Проверка дублей внутри новых
texts = [q.get('question', '') for q in all_new]
dupes = {t: c for t, c in Counter(texts).items() if c > 1}
if dupes:
    print(f'\nДубли между батчами ({len(dupes)}):')
    for t, c in list(dupes.items())[:10]:
        print(f'  [{c}x] {t[:80]}')
else:
    print('\nДублей между батчами нет.')

# Записать объединённый файл
out_new = 'scripts/data/ability_questions_new.json'
with open(out_new, 'w', encoding='utf-8') as f:
    json.dump(all_new, f, ensure_ascii=False, indent=2)
types = Counter(q.get('type') for q in all_new)
print(f'\nЗаписано {len(all_new)} вопросов в {out_new}')
print(f'  closest_number: {types.get("closest_number", 0)} ({types.get("closest_number", 0)/len(all_new)*100:.0f}%)')
print(f'  multiple_choice: {types.get("multiple_choice", 0)} ({types.get("multiple_choice", 0)/len(all_new)*100:.0f}%)')

# 2. Применить delete-листы к ability_questions.json
with open('scripts/data/ability_questions.json', encoding='utf-8') as f:
    aq = json.load(f)

to_delete = set()
for i in range(1, 6):
    del_path = f'scripts/data/batches/ability_batch_{i}_delete.json'
    if os.path.exists(del_path):
        with open(del_path, encoding='utf-8') as f:
            dels = json.load(f)
        to_delete.update(dels)
        print(f'\nBatch {i}_delete: {len(dels)} к удалению')

print(f'\nВсего уникальных вопросов к удалению: {len(to_delete)}')

total_before = sum(len(v) for v in aq.values())
removed = 0
for cat in aq:
    before = len(aq[cat])
    aq[cat] = [q for q in aq[cat] if q.get('question') not in to_delete]
    removed += before - len(aq[cat])

total_after = sum(len(v) for v in aq.values())
print(f'ability_questions.json: {total_before} -> {total_after} (removed {removed})')

with open('scripts/data/ability_questions.json', 'w', encoding='utf-8') as f:
    json.dump(aq, f, ensure_ascii=False, indent=2)
print('ability_questions.json сохранён.')
