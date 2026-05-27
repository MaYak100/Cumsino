import json, os

with open('scripts/data/heroes.json', encoding='utf-8') as f:
    heroes_raw = json.load(f)

with open('scripts/data/abilities.json', encoding='utf-8') as f:
    abilities = json.load(f)

with open('scripts/data/ability_questions.json', encoding='utf-8') as f:
    aq = json.load(f)

# hero_key -> hero_name из heroes.json
hero_name_map = {}
for hid, h in heroes_raw.items():
    name = h.get('name', '')
    if name.startswith('npc_dota_hero_'):
        key = name.replace('npc_dota_hero_', '')
        hero_name_map[key] = h.get('localized_name', key)

# Собрать всех героев из ability_questions
all_hero_keys = set()
for cat, items in aq.items():
    for q in items:
        if 'hero' in q:
            all_hero_keys.add(q['hero'])

hero_keys_sorted = sorted(all_hero_keys)
print(f'Героев в ability_questions: {len(hero_keys_sorted)}')

# Разбить на 5 батчей
n = len(hero_keys_sorted)
batch_size = n // 5
batches = []
for i in range(5):
    start = i * batch_size
    end = start + batch_size if i < 4 else n
    batches.append(hero_keys_sorted[start:end])

# Для каждого героя собрать данные
def get_hero_data(hero_key):
    hero_name = hero_name_map.get(hero_key, hero_key)

    # Способности из abilities.json с непустым desc или полезным attrib
    hero_abilities = []
    for ab_key, ab in abilities.items():
        if not ab_key.startswith(hero_key + '_'):
            continue
        # Пропускаем служебные/пустые
        if ab_key in ('dota_base_ability', 'dota_empty_ability'):
            continue
        dname = ab.get('dname') or ''
        desc = ab.get('desc') or ''
        attrib = ab.get('attrib', [])
        # Оставляем только если есть описание или не-generated атрибуты
        real_attrib = [a for a in attrib if not a.get('generated')]
        if not desc and not real_attrib:
            continue
        if not dname:
            continue
        hero_abilities.append({
            'key': ab_key,
            'name': dname,
            'desc': desc[:400],
            'attrib': attrib[:10],
        })

    # Существующие вопросы для этого героя (все категории, плоский список)
    existing = []
    for cat, items in aq.items():
        for q in items:
            if q.get('hero') == hero_key:
                existing.append(dict(q))

    return {
        'hero_key': hero_key,
        'hero_name': hero_name,
        'abilities': hero_abilities,
        'existing_questions': existing,
    }

os.makedirs('scripts/data/batches', exist_ok=True)

for i, batch_heroes in enumerate(batches):
    batch_data = [get_hero_data(hk) for hk in batch_heroes]
    out_path = f'scripts/data/batches/ability_batch_{i+1}_data.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(batch_data, f, ensure_ascii=False, indent=2)

    total_existing = sum(len(h['existing_questions']) for h in batch_data)
    total_abilities = sum(len(h['abilities']) for h in batch_data)
    print(f'Batch {i+1}: {len(batch_data)} heroes, {total_abilities} abilities, {total_existing} existing questions -> {out_path}')
