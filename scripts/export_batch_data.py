import json, os

ROSHAN_BLACKLIST = {
    'cheese', 'royale_with_cheese', 'refresher_shard',
    'aghanims_shard_roshan', 'ultimate_scepter_roshan', 'ultimate_scepter_2', 'aegis',
}
KEEP_ONE_ONLY = {
    'dagon_2', 'dagon_3', 'dagon_4', 'dagon_5',
    'necronomicon_2', 'necronomicon_3',
}

with open('scripts/data/items.json', encoding='utf-8') as f:
    items = json.load(f)
with open('scripts/data/active_questions_batch1.json', encoding='utf-8') as f:
    batch1 = json.load(f)
with open('scripts/data/active_questions_batch2.json', encoding='utf-8') as f:
    batch2 = json.load(f)

covered = set(q.get('item') for q in batch1 + batch2)

candidates = []
for name, item in items.items():
    if name.startswith('recipe_'):
        continue
    if name in ROSHAN_BLACKLIST or name in KEEP_ONE_ONLY:
        continue
    cost = item.get('cost')
    if not cost or cost <= 0:
        continue
    if not item.get('abilities'):
        continue
    if name in covered:
        continue
    candidates.append((name, item.get('dname', name), cost, item))

candidates.sort(key=lambda x: -x[2])

BATCH_SIZE = 20
batches = [candidates[i:i+BATCH_SIZE] for i in range(0, len(candidates), BATCH_SIZE)]

os.makedirs('scripts/data/batches', exist_ok=True)

for i, batch in enumerate(batches):
    batch_data = []
    for name, dname, cost, item in batch:
        batch_data.append({
            'key': name,
            'dname': dname,
            'cost': cost,
            'cd': item.get('cd'),
            'mc': item.get('mc'),
            'attrib': item.get('attrib', []),
            'abilities': item.get('abilities', []),
        })
    out_path = f'scripts/data/batches/batch_{i+1}_items.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(batch_data, f, ensure_ascii=False, indent=2)
    print(f'Batch {i+1}: {len(batch_data)} items -> {out_path}')
