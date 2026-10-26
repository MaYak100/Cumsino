#!/usr/bin/env python3
"""
Прогон числовых вопросов через Anthropic API — те же технологии, что пойдут в боевую генерацию:
  • Message Batches API (асинхронно, −50% к цене всех токенов)
  • кэширование системного промпта (cache_control)
  • structured outputs: JSON-схема, fact_id ограничен фактами из запроса (enum)
  • effort (глубина размышлений) и count_tokens (оценка цены до запуска)

Сравнивает модели и размер группы (сколько героев/предметов в одном запросе).

  python scripts/generate/numeric_lab/run_api.py out/v3 --dry-run     # собрать запросы, без API
  python scripts/generate/numeric_lab/run_api.py out/v3 --estimate    # + count_tokens, оценка цены
  python scripts/generate/numeric_lab/run_api.py out/v3               # отправить батч и дождаться
  python scripts/generate/numeric_lab/run_api.py out/v3 --resume      # забрать результаты уже отправленного батча
  python scripts/generate/numeric_lab/run_api.py out/v3s --sync       # обычные вызовы параллельно, без батча (×2 цена)
  python scripts/generate/numeric_lab/resolve.py out/v3               # отчёт

Выход в папке прогона: <модель>-g<размер>.json (формат resolve.py), usage.json, cost.md,
копии sample.json и промпта. Требует ANTHROPIC_API_KEY (кроме --dry-run).
"""

import argparse
import json
import shutil
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

LAB = Path(__file__).parent

ALIASES = {"claude-sonnet-5-5": "sonnet", "claude-opus-5-5": "opus"}

# $ за 1M токенов (claude-api skill, данные на 2026-10-06). Batch API — половина от всего.
PRICES = {
    "claude-sonnet-5-5": {"input": 2.00, "output": 10.00, "cache_read": 0.20},
    "claude-opus-5-5":   {"input": 4.00, "output": 20.00, "cache_read": 0.20},
}
CACHE_WRITE_MULT = 1.25   # запись в кэш с TTL 5 минут
BATCH_MULT = 0.5


def schema(fact_ids: list[str]) -> dict:
    question = {
        "type": "object",
        "properties": {
            "fact_id": {"type": "string", "enum": fact_ids},
            "level": {"anyOf": [{"type": "string", "enum": ["max"]}, {"type": "integer"}]},
            "question": {"type": "string"},
            "unit": {"type": "string"},
            "distractors": {"type": "array", "items": {"type": "number"}},
        },
        "required": ["fact_id", "level", "question", "unit", "distractors"],
        "additionalProperties": False,
    }
    return {
        "type": "object",
        "properties": {"questions": {"type": "array", "items": question}},
        "required": ["questions"],
        "additionalProperties": False,
    }


def _chunks(xs: list, n: int) -> list[list]:
    return [xs[i:i + n] for i in range(0, len(xs), n)]


def _fact_ids(entities: list[dict]) -> list[str]:
    ids = []
    for e in entities:
        for ab in e.get("abilities", []):
            if isinstance(ab, dict) and "facts" in ab:
                ids += [f["fact_id"] for f in ab["facts"]]
        ids += [f["fact_id"] for f in e.get("facts", [])]
    return ids


def build_requests(sample: dict, prompt: str, models: list[str], groups: list[int], effort: str) -> list[dict]:
    system = [{"type": "text", "text": prompt, "cache_control": {"type": "ephemeral"}}]
    requests = []
    for model in models:
        alias = ALIASES[model]
        for g in groups:
            for kind, entities in (("heroes", sample["heroes"]), ("items", sample["items"])):
                for i, chunk in enumerate(_chunks(entities, g)):
                    payload = {"patch": sample["patch"], kind: chunk}
                    requests.append({
                        "custom_id": f"{alias}-g{g}-{kind}-{i}",
                        "params": {
                            "model": model,
                            "max_tokens": 16000,
                            "system": system,
                            "messages": [{"role": "user",
                                          "content": json.dumps(payload, ensure_ascii=False)}],
                            "output_config": {
                                "effort": effort,
                                "format": {"type": "json_schema", "schema": schema(_fact_ids(chunk))},
                            },
                        },
                    })
    return requests


def _group_key(custom_id: str) -> str:
    alias, g, _kind, _i = custom_id.split("-")
    return f"{alias}-{g}"


def cost_of(model: str, usage: dict, batch: bool) -> float:
    p = PRICES[model]
    dollars = (usage.get("input_tokens", 0) * p["input"]
               + usage.get("cache_creation_input_tokens", 0) * p["input"] * CACHE_WRITE_MULT
               + usage.get("cache_read_input_tokens", 0) * p["cache_read"]
               + usage.get("output_tokens", 0) * p["output"]) / 1_000_000
    return dollars * (BATCH_MULT if batch else 1)


def estimate(client, requests: list[dict], batch: bool) -> None:
    by_group: dict[str, list[int]] = defaultdict(list)
    model_of = {}
    for r in requests:
        p = r["params"]
        n = client.messages.count_tokens(model=p["model"], system=p["system"], messages=p["messages"],
                                         output_config=p["output_config"]).input_tokens
        key = _group_key(r["custom_id"])
        by_group[key].append(n)
        model_of[key] = p["model"]
    print("Оценка входа (count_tokens), без кэша и без выхода:")
    for key, ns in by_group.items():
        dollars = cost_of(model_of[key], {"input_tokens": sum(ns)}, batch)
        print(f"  {key:<10} {len(ns):>2} запросов, {sum(ns):>7} токенов входа  ≈ ${dollars:.3f}")


def save_results(run_dir: Path, requests: list[dict], results: dict[str, dict], batch: bool,
                 wall_seconds: float | None = None) -> None:
    """results: custom_id → {"status", "message"?, "error"?, "seconds"?}"""
    model_of = {r["custom_id"]: r["params"]["model"] for r in requests}
    questions: dict[str, list] = defaultdict(list)
    usage_rows = {}
    for cid in sorted(results):
        res = results[cid]
        row = {"status": res["status"]}
        msg = res.get("message")
        if msg is not None:
            u = msg.usage
            row["usage"] = {k: getattr(u, k, 0) or 0 for k in
                            ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")}
            row["stop_reason"] = msg.stop_reason
            row["cost"] = round(cost_of(model_of[cid], row["usage"], batch), 5)
            text = next((b.text for b in msg.content if b.type == "text"), "")
            if msg.stop_reason == "end_turn" and text:
                qs = json.loads(text)["questions"]
                for q in qs:
                    q["request"] = cid
                questions[_group_key(cid)] += qs
                row["questions"] = len(qs)
        if res.get("error"):
            row["error"] = res["error"]
        if "seconds" in res:
            row["seconds"] = res["seconds"]
        usage_rows[cid] = row

    for key, qs in questions.items():
        (run_dir / f"{key}.json").write_text(json.dumps(qs, ensure_ascii=False, indent=2), encoding="utf-8")
    (run_dir / "usage.json").write_text(json.dumps(usage_rows, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = ["# Стоимость прогона", "", f"Цены: {'Batch API (−50%)' if batch else 'обычные вызовы'}.", ""]
    if wall_seconds is not None:
        lines += [f"Время прогона целиком: {wall_seconds:.0f} с.", ""]
    lines += [
             "| Конфигурация | Запросов | Вход | Запись в кэш | Чтение кэша | Выход (с размышлениями) | Вопросов | $ |",
             "|---|---|---|---|---|---|---|---|"]
    if not batch:
        lines[-2] = lines[-2] + " Время запроса, с (сред / макс) |"
        lines[-1] = lines[-1] + "---|"
    agg: dict[str, dict] = defaultdict(lambda: defaultdict(float))
    for cid, row in usage_rows.items():
        a = agg[_group_key(cid)]
        a["n"] += 1
        for k, v in row.get("usage", {}).items():
            a[k] += v
        a["questions"] += row.get("questions", 0)
        a["cost"] += row.get("cost", 0)
        a["failed"] += 0 if row.get("stop_reason") == "end_turn" else 1
        a["seconds"] += row.get("seconds", 0)
        a["max_seconds"] = max(a["max_seconds"], row.get("seconds", 0))
    for key, a in sorted(agg.items()):
        lines.append(f"| {key} | {int(a['n'])} | {int(a['input_tokens'])} | {int(a['cache_creation_input_tokens'])} | "
                     f"{int(a['cache_read_input_tokens'])} | {int(a['output_tokens'])} | {int(a['questions'])} | "
                     f"{a['cost']:.3f} |" + ("" if batch else f" {a['seconds'] / a['n']:.0f} / {a['max_seconds']:.0f} |"))
    failed = {cid: r for cid, r in usage_rows.items() if r.get("stop_reason") != "end_turn"}
    if failed:
        lines += ["", "Неуспешные запросы:"] + [f"- {cid}: {r}" for cid, r in failed.items()]
    (run_dir / "cost.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


def run_batch(client, run_dir: Path, requests: list[dict], resume: bool) -> dict[str, dict]:
    state_path = run_dir / "batch.json"
    if resume:
        batch_id = json.loads(state_path.read_text(encoding="utf-8"))["id"]
    else:
        batch = client.messages.batches.create(requests=requests)
        batch_id = batch.id
        state_path.write_text(json.dumps({"id": batch_id}, indent=2), encoding="utf-8")
        print(f"Батч {batch_id} отправлен ({len(requests)} запросов)")

    started = time.time()
    while True:
        batch = client.messages.batches.retrieve(batch_id)
        c = batch.request_counts
        print(f"  {int(time.time() - started):>5}с  {batch.processing_status}: processing {c.processing}, "
              f"succeeded {c.succeeded}, errored {c.errored}", flush=True)
        if batch.processing_status == "ended":
            break
        time.sleep(30)

    results = {}
    for r in client.messages.batches.results(batch_id):
        if r.result.type == "succeeded":
            results[r.custom_id] = {"status": "succeeded", "message": r.result.message}
        else:
            err = getattr(r.result, "error", None)
            results[r.custom_id] = {"status": r.result.type, "error": str(err) if err else None}
    return results


def run_sync(client, requests: list[dict], workers: int) -> dict[str, dict]:
    """Обычные вызовы Messages API параллельно; время каждого запроса — в "seconds"."""
    started = time.time()

    def call(r: dict) -> tuple[str, dict]:
        t0 = time.time()
        try:
            with client.messages.stream(**r["params"]) as stream:
                msg = stream.get_final_message()
            res = {"status": "succeeded", "message": msg}
        except Exception as e:  # noqa: BLE001 — ошибку пишем в отчёт, не роняем остальные запросы
            res = {"status": "errored", "error": f"{type(e).__name__}: {e}"}
        res["seconds"] = round(time.time() - t0, 1)
        print(f"  {int(time.time() - started):>5}с  {r['custom_id']}: {res['status']} за {res['seconds']}с", flush=True)
        return r["custom_id"], res

    with ThreadPoolExecutor(max_workers=workers) as pool:
        return dict(pool.map(call, requests))


def main() -> None:
    ap = argparse.ArgumentParser(description="Числовые вопросы через Anthropic API")
    ap.add_argument("run_dir")
    ap.add_argument("--prompt", default="prompt_v3.md")
    ap.add_argument("--models", default="claude-sonnet-5-5,claude-opus-5-5")
    ap.add_argument("--groups", default="1,3", help="сколько героев/предметов в одном запросе")
    ap.add_argument("--effort", default="high", choices=["low", "medium", "high", "xhigh", "max"])
    ap.add_argument("--dry-run", action="store_true", help="только собрать запросы")
    ap.add_argument("--estimate", action="store_true", help="count_tokens и оценка цены, без генерации")
    ap.add_argument("--resume", action="store_true", help="забрать результаты отправленного батча")
    ap.add_argument("--sync", action="store_true", help="обычные вызовы без Batch API (быстро, полная цена)")
    ap.add_argument("--workers", type=int, default=8, help="параллельных запросов в --sync")
    args = ap.parse_args()

    run_dir = Path(args.run_dir)
    if not run_dir.is_absolute() and not run_dir.parent.exists():
        run_dir = LAB / run_dir
    run_dir.mkdir(parents=True, exist_ok=True)

    sample_src = run_dir / "sample.json" if args.resume else LAB / "sample.json"
    sample = json.loads(sample_src.read_text(encoding="utf-8"))
    prompt_path = run_dir / "prompt.md" if args.resume else LAB / args.prompt
    prompt = prompt_path.read_text(encoding="utf-8")
    if not args.resume:
        shutil.copy(LAB / "sample.json", run_dir / "sample.json")
        shutil.copy(LAB / args.prompt, run_dir / "prompt.md")

    models = args.models.split(",")
    groups = [int(g) for g in args.groups.split(",")]
    requests = build_requests(sample, prompt, models, groups, args.effort)
    (run_dir / "requests.json").write_text(json.dumps(requests, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(requests)} запросов: модели {', '.join(ALIASES[m] for m in models)}, группы {groups}, "
          f"effort {args.effort} → {run_dir / 'requests.json'}")
    if args.dry_run:
        return

    import anthropic
    client = anthropic.Anthropic()
    if args.estimate:
        estimate(client, requests, batch=not args.sync)
        return

    if args.sync:
        started = time.time()
        results = run_sync(client, requests, args.workers)
        save_results(run_dir, requests, results, batch=False, wall_seconds=time.time() - started)
        return

    results = run_batch(client, run_dir, requests, args.resume)
    save_results(run_dir, requests, results, batch=True)


if __name__ == "__main__":
    sys.exit(main())
