"""Sincronização: roda o extrator aprovado, valida e grava no Spy, e confere as contagens."""
from __future__ import annotations

import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable

from . import contract, readonly
from .spy_client import SpyClient, SpyError
from .store import Store

SAMPLE_LIMIT = 20


class SyncRefused(Exception):
    """O sync não pode rodar (extrator não aprovado ou alterado depois da aprovação)."""


def _blank_stats() -> dict:
    return {"read": 0, "invalid": 0, "duplicate": 0, "sent": 0, "failed": 0}


def check_approved(store: Store, integration_id: str) -> tuple[dict, Path]:
    integ = store.get_integration(integration_id)
    if not integ:
        raise SyncRefused("integração não encontrada")
    extract = store.integration_dir(integration_id) / "extract.py"
    if not extract.exists():
        raise SyncRefused("a integração ainda não tem extrator — rode a captura")
    sha = readonly.sha256(extract.read_text("utf-8"))
    if not integ.get("approved") or integ.get("approvedSha") != sha:
        raise SyncRefused("extrator não aprovado (ou alterado depois da aprovação) — revise e aprove de novo")
    return integ, extract


def run_sync(
    store: Store,
    integration_id: str,
    spy_base_url: str,
    *,
    python_bin: str = sys.executable,
    timeout: int = 1800,
    concurrency: int = 4,
    client_factory: Callable[[str, str], object] = SpyClient,
) -> dict:
    integ, extract = check_approved(store, integration_id)
    idir = store.integration_dir(integration_id)
    secrets = store.get_secrets(integration_id)
    spy_key = secrets.pop("SPY_API_KEY", "")
    if not spy_key:
        raise SyncRefused("a integração não tem a chave de API do Spy")

    # O extrator só enxerga as credenciais do sistema do cliente — nunca a chave do Spy nem os segredos do worker.
    env = {k: os.environ[k] for k in ("PATH", "LANG", "LC_ALL", "HOME", "TZ") if k in os.environ}
    env.update({k: str(v) for k, v in secrets.items()})

    spool = idir / "spool" / str(int(time.time()))
    spool.mkdir(parents=True, exist_ok=True)
    raw_path, err_path = spool / "raw.jsonl", spool / "stderr.txt"
    started = time.time()
    exit_code: int | None = None
    timed_out = False
    with raw_path.open("wb") as out, err_path.open("wb") as err:
        try:
            proc = subprocess.run([python_bin, str(extract)], cwd=idir, env=env, stdout=out, stderr=err, timeout=timeout)
            exit_code = proc.returncode
        except subprocess.TimeoutExpired:
            timed_out = True

    stats = {e: _blank_stats() for e in contract.ENTITIES}
    expected: dict[str, int] = {}
    samples: list[dict] = []
    seen: dict[str, set[str]] = {e: set() for e in contract.ENTITIES}
    files = {e: (spool / f"{e}.jsonl").open("w", encoding="utf-8") for e in contract.ENTITIES}
    try:
        with raw_path.open("r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    entity, data = contract.parse_line(line)
                except ValueError as e:
                    if len(samples) < SAMPLE_LIMIT:
                        samples.append({"stage": "extract", "error": str(e), "line": line[:120]})
                    continue
                if entity == "__expected__":
                    expected = {k: int(v) for k, v in data.items() if k in contract.ENTITIES and str(v).isdigit()}
                    continue
                if entity not in contract.ENTITIES:
                    if len(samples) < SAMPLE_LIMIT:
                        samples.append({"stage": "extract", "error": f"entidade desconhecida: {entity!r}"})
                    continue
                st = stats[entity]
                st["read"] += 1
                errors = contract.validate(entity, data)
                if errors:
                    st["invalid"] += 1
                    if len(samples) < SAMPLE_LIMIT:
                        samples.append({"stage": "validate", "entity": entity, "error": "; ".join(errors)})
                    continue
                key = contract.dedup_key(entity, data)
                if key is not None:
                    if key in seen[entity]:
                        st["duplicate"] += 1
                        continue
                    seen[entity].add(key)
                import json as _json
                files[entity].write(_json.dumps(data, ensure_ascii=False) + "\n")
    finally:
        for f in files.values():
            f.close()

    client = client_factory(spy_base_url, spy_key)

    def push(entity: str, line: str) -> tuple[bool, dict | None]:
        import json as _json
        data = _json.loads(line)
        try:
            client.post(contract.ENTITIES[entity].path, data)
            return True, None
        except SpyError as e:
            return False, {"stage": "spy", "entity": entity, "error": str(e), "key": contract.dedup_key(entity, data)}
        except Exception as e:  # rede/timeout depois das tentativas
            return False, {"stage": "spy", "entity": entity, "error": f"{type(e).__name__}: {e}", "key": contract.dedup_key(entity, data)}

    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        for entity in contract.ORDER:
            path = spool / f"{entity}.jsonl"
            if not path.exists() or path.stat().st_size == 0:
                continue
            with path.open("r", encoding="utf-8") as fh:
                batch: list[str] = []
                def flush():
                    for ok, sample in pool.map(lambda ln: push(entity, ln), batch):
                        if ok:
                            stats[entity]["sent"] += 1
                        else:
                            stats[entity]["failed"] += 1
                            if sample and len(samples) < SAMPLE_LIMIT:
                                samples.append(sample)
                    batch.clear()
                for ln in fh:
                    batch.append(ln)
                    if len(batch) >= 100:
                        flush()
                if batch:
                    flush()

    # Conferência: o que o sistema de origem diz que tem x o que chegou ao Spy.
    mismatches = []
    for entity, total in expected.items():
        got = stats[entity]["sent"] + stats[entity]["duplicate"]
        if got < total:
            mismatches.append({"entity": entity, "expected": total, "received": got, "missing": total - got})

    read_total = sum(s["read"] for s in stats.values())
    failed_total = sum(s["failed"] + s["invalid"] for s in stats.values())
    if timed_out or (exit_code not in (0, None) and read_total == 0):
        status = "error"
    elif exit_code not in (0, None) or failed_total or mismatches:
        status = "partial"
    else:
        status = "ok"

    stderr_tail = err_path.read_bytes()[-1500:].decode("utf-8", "replace")
    return {
        "status": status,
        "durationSeconds": round(time.time() - started, 1),
        "extractorExitCode": exit_code,
        "timedOut": timed_out,
        "stats": {e: s for e, s in stats.items() if s["read"]},
        "expected": expected,
        "mismatches": mismatches,
        "samples": samples,
        "stderrTail": stderr_tail,
    }
