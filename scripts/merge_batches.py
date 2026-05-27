import json

batch_files = [
    'scripts/data/batches/batch_1_questions.json',
    'scripts/data/batches/batch_2_questions.json',
    'scripts/data/batches/batch_3_questions.json',
    'scripts/data/batches/batch_4_questions.json',
    'scripts/data/batches/batch_5_questions.json',
    'scripts/data/batches/batch_6_questions.json',
]

all_questions = []
for path in batch_files:
    with open(path, encoding='utf-8') as f:
        questions = json.load(f)
    print(f'{path}: {len(questions)} вопросов')
    all_questions.extend(questions)

# Проверка на дубли по тексту вопроса
texts = [q.get('question', '') for q in all_questions]
from collections import Counter
dupes = {t: c for t, c in Counter(texts).items() if c > 1}
if dupes:
    print(f'\nДубли внутри новых батчей ({len(dupes)}):')
    for t, c in dupes.items():
        print(f'  [{c}x] {t}')
else:
    print('\nДублей нет.')

# Статистика по типам
types = Counter(q.get('type') for q in all_questions)
print(f'\nИтого: {len(all_questions)} вопросов')
print(f'  closest_number: {types.get("closest_number", 0)}')
print(f'  multiple_choice: {types.get("multiple_choice", 0)}')

out = 'scripts/data/active_questions_batch3.json'
with open(out, 'w', encoding='utf-8') as f:
    json.dump(all_questions, f, ensure_ascii=False, indent=2)
print(f'\nЗаписано в {out}')
