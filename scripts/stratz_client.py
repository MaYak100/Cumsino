"""
Клиент STRATZ GraphQL (api.stratz.com/graphql) для скриптов снимков.

- Токен — STRATZ_API_KEY из окружения или из .env в корне репо.
- Обязателен заголовок User-Agent: STRATZ_API, иначе Cloudflare отдаёт страницу «Just a moment».
- Токен работает не больше чем с 2 IP за 15 минут: запускать с одной машины (локально или GitHub Actions).
- Аналитическая база иногда отвечает «Statistics are temporarily unavailable - the analytics database is at
  capacity» — это ошибка внутри 200-ответа по отдельным полям; повторяем запрос с паузой.
- Кэш: ответ сохраняется в файл по ключу, повторный запуск его не запрашивает (снимки большие, сотни запросов).
"""

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

URL = "https://api.stratz.com/graphql"
USER_AGENT = "STRATZ_API"
MIN_INTERVAL_S = 0.35
RETRY_DELAYS_S = [3, 6, 12, 24, 48, 96]
CAPACITY_MARK = "temporarily unavailable"

_last_request = 0.0


def load_token() -> str:
    tok = os.environ.get("STRATZ_API_KEY")
    if tok:
        return tok
    env = Path(__file__).resolve().parent.parent / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("STRATZ_API_KEY="):
                return line.split("=", 1)[1].strip().strip("'\"")
    raise SystemExit("Нет STRATZ_API_KEY (окружение или .env в корне репо)")


class Stratz:
    def __init__(self, cache_dir: Path | None = None):
        self.token = load_token()
        self.cache_dir = cache_dir
        self.requests = 0
        if cache_dir:
            cache_dir.mkdir(parents=True, exist_ok=True)

    def _post(self, query: str) -> dict:
        global _last_request
        body = json.dumps({"query": query}).encode()
        headers = {"Authorization": f"Bearer {self.token}", "User-Agent": USER_AGENT,
                   "Content-Type": "application/json"}
        for attempt in range(len(RETRY_DELAYS_S) + 1):
            wait = MIN_INTERVAL_S - (time.monotonic() - _last_request)
            if wait > 0:
                time.sleep(wait)
            _last_request = time.monotonic()
            self.requests += 1
            try:
                with urllib.request.urlopen(urllib.request.Request(URL, data=body, headers=headers), timeout=120) as r:
                    data = json.loads(r.read().decode())
            except urllib.error.HTTPError as e:
                text = e.read().decode(errors="replace")[:300]
                if e.code in (429, 500, 502, 503, 504) and attempt < len(RETRY_DELAYS_S):
                    print(f"    HTTP {e.code}, повтор через {RETRY_DELAYS_S[attempt]} с")
                    time.sleep(RETRY_DELAYS_S[attempt])
                    continue
                raise RuntimeError(f"STRATZ HTTP {e.code}: {text}") from e
            except (urllib.error.URLError, TimeoutError) as e:
                if attempt < len(RETRY_DELAYS_S):
                    print(f"    сеть: {e}, повтор через {RETRY_DELAYS_S[attempt]} с")
                    time.sleep(RETRY_DELAYS_S[attempt])
                    continue
                raise
            errors = data.get("errors") or []
            if any(CAPACITY_MARK in (e.get("message") or "") for e in errors) and attempt < len(RETRY_DELAYS_S):
                print(f"    STRATZ: база перегружена ({len(errors)} полей), повтор через {RETRY_DELAYS_S[attempt]} с")
                time.sleep(RETRY_DELAYS_S[attempt])
                continue
            return data
        raise RuntimeError("STRATZ: исчерпаны повторы")

    def query(self, query: str, cache_key: str | None = None, allow_errors: bool = False) -> dict:
        """Выполнить запрос; вернуть data. С cache_key ответ берётся из кэша или пишется в него.
        Ошибки GraphQL — исключение (allow_errors=True — вернуть data как есть, ошибки в '_errors')."""
        path = self.cache_dir / f"{cache_key}.json" if (self.cache_dir and cache_key) else None
        if path and path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        resp = self._post(query)
        errors = resp.get("errors") or []
        if errors and not allow_errors:
            raise RuntimeError(f"STRATZ GraphQL: {json.dumps(errors, ensure_ascii=False)[:600]}")
        data = resp.get("data") or {}
        if errors:
            data["_errors"] = errors
        if path and not errors:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return data
