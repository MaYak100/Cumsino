import json

with open('scripts/data/questions_db.json', encoding='utf-8') as f:
    db = json.load(f)

mc = db['multiple_choice']
multilevel = []
slash_only = []

for s in ['items', 'abilities']:
    for b in ['scripted', 'agent', 'agent_hard']:
        for q in mc[s][b]:
            has_level = '{level}' in q.get('question', '')
            has_slash = any('/' in str(o) for o in q.get('options', []))
            if has_level:
                multilevel.append(q)
            elif has_slash:
                slash_only.append(q)

print(f'MC с {{level}} в вопросе: {len(multilevel)}')
for q in multilevel:
    print(json.dumps(q, ensure_ascii=False, indent=2))

print(f'\nMC с / но без {{level}}: {len(slash_only)}')
for q in slash_only:
    print(json.dumps(q, ensure_ascii=False, indent=2))
