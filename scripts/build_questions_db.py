import json

def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)

# --- Загрузка всех источников ---

# Items / scripted: item_questions.json (структура {"numeric": [...]})
item_q_raw = load('scripts/data/item_questions.json')
items_scripted = []
for section in item_q_raw.values():
    items_scripted.extend(section)

# Items / agent: batch1 + batch3
items_agent = load('scripts/data/active_questions_batch1.json') + \
              load('scripts/data/active_questions_batch3.json')

# Items / agent_hard: batch2
items_agent_hard = load('scripts/data/active_questions_batch2.json')

# Abilities / scripted: ability_questions.json (dict по категориям, все CN)
ab_q_raw = load('scripts/data/ability_questions.json')
abilities_scripted = []
for section in ab_q_raw.values():
    abilities_scripted.extend(section)

# Abilities / agent: ability_questions_new.json
abilities_agent = load('scripts/data/ability_questions_new.json')

# Abilities / agent_hard: пусто пока
abilities_agent_hard = []

# --- Сборка структуры ---

def split_by_type(questions):
    cn = [q for q in questions if q.get('type') == 'closest_number']
    mc = [q for q in questions if q.get('type') == 'multiple_choice']
    return cn, mc

is_cn, is_mc = split_by_type(items_scripted)
ia_cn, ia_mc = split_by_type(items_agent)
iah_cn, iah_mc = split_by_type(items_agent_hard)
as_cn, as_mc = split_by_type(abilities_scripted)
aa_cn, aa_mc = split_by_type(abilities_agent)
aah_cn, aah_mc = split_by_type(abilities_agent_hard)

db = {
    "multiple_choice": {
        "items": {
            "scripted":   is_mc,
            "agent":      ia_mc,
            "agent_hard": iah_mc,
        },
        "abilities": {
            "scripted":   as_mc,
            "agent":      aa_mc,
            "agent_hard": aah_mc,
        }
    },
    "closest_number": {
        "items": {
            "scripted":   is_cn,
            "agent":      ia_cn,
            "agent_hard": iah_cn,
        },
        "abilities": {
            "scripted":   as_cn,
            "agent":      aa_cn,
            "agent_hard": aah_cn,
        }
    }
}

# --- Статистика ---
print('=== СТАТИСТИКА ===')
total = 0
for qtype in ['multiple_choice', 'closest_number']:
    for subject in ['items', 'abilities']:
        for source in ['scripted', 'agent', 'agent_hard']:
            n = len(db[qtype][subject][source])
            total += n
            if n:
                print(f'  {qtype} / {subject} / {source}: {n}')

print(f'\nИтого: {total}')

# --- Запись ---
out = 'scripts/data/questions_db.json'
with open(out, 'w', encoding='utf-8') as f:
    json.dump(db, f, ensure_ascii=False, indent=2)
print(f'Записано в {out}')
