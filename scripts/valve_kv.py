"""Минимальный парсер Valve KeyValues (формат .txt-файлов игры: items.txt, npc_dota_hero_*.txt).

Повторяющиеся ключи на одном уровне перезаписываются последним значением —
для списков вида `"item" "item_x"` (shops.txt) используй регулярки.
"""

import re

_TOKEN = re.compile(r'"((?:[^"\\]|\\.)*)"|(\{)|(\})|//[^\n]*|(\[[^\]]*\])|(\S+)')


def parse(text: str) -> dict:
    stack: list[dict] = [{}]
    key: str | None = None
    for m in _TOKEN.finditer(text):
        quoted, opening, closing, condition, bare = m.groups()
        if opening:
            cur = stack[-1]
            node = cur[key] if isinstance(cur.get(key), dict) else {}
            cur[key] = node
            stack.append(node)
            key = None
        elif closing:
            if len(stack) > 1:
                stack.pop()
            key = None
        elif condition:
            continue   # платформенные условия вида [$WIN32]
        elif quoted is not None or bare is not None:
            value = quoted if quoted is not None else bare
            if key is None:
                key = value
            else:
                stack[-1][key] = value
                key = None
    return stack[0]


def parse_file(path) -> dict:
    with open(path, encoding="utf-8", errors="replace") as f:
        return parse(f.read())
