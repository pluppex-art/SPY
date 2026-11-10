"""Armazenamento em disco (volume do container): integrações, jobs e credenciais.

Credenciais do sistema do cliente e a chave de API do Spy ficam cifradas (Fernet,
chave em WORKER_SECRET_KEY) e NUNCA saem pela API do worker.
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
import uuid
from pathlib import Path

from cryptography.fernet import Fernet

_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_lock = threading.Lock()


def valid_id(value: str) -> bool:
    return bool(_ID.match(value or ""))


class Store:
    def __init__(self, data_dir: str, secret_key: str):
        self.root = Path(data_dir)
        self.root.mkdir(parents=True, exist_ok=True)
        self.fernet = Fernet(secret_key.encode())

    # ── integrações ────────────────────────────────────────────────────────
    def integration_dir(self, integration_id: str) -> Path:
        if not valid_id(integration_id):
            raise ValueError("id de integração inválido")
        d = self.root / "integrations" / integration_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _read_json(self, p: Path, default):
        try:
            return json.loads(p.read_text("utf-8"))
        except FileNotFoundError:
            return default

    def _write_json(self, p: Path, obj) -> None:
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2), "utf-8")
        os.replace(tmp, p)

    def get_integration(self, integration_id: str) -> dict | None:
        return self._read_json(self.integration_dir(integration_id) / "integration.json", None)

    def save_integration(self, integration_id: str, patch: dict) -> dict:
        with _lock:
            cur = self.get_integration(integration_id) or {"id": integration_id, "createdAt": time.time(), "approved": False}
            cur.update(patch)
            self._write_json(self.integration_dir(integration_id) / "integration.json", cur)
            return cur

    def list_integrations(self) -> list[dict]:
        base = self.root / "integrations"
        if not base.exists():
            return []
        out = []
        for d in sorted(base.iterdir()):
            if d.is_dir():
                item = self._read_json(d / "integration.json", None)
                if item:
                    out.append(item)
        return out

    # ── credenciais (cifradas) ─────────────────────────────────────────────
    def set_secrets(self, integration_id: str, secrets: dict[str, str]) -> None:
        blob = self.fernet.encrypt(json.dumps(secrets).encode())
        p = self.integration_dir(integration_id) / "secrets.enc"
        p.write_bytes(blob)
        os.chmod(p, 0o600)

    def get_secrets(self, integration_id: str) -> dict[str, str]:
        p = self.integration_dir(integration_id) / "secrets.enc"
        if not p.exists():
            return {}
        return json.loads(self.fernet.decrypt(p.read_bytes()).decode())

    # ── jobs ───────────────────────────────────────────────────────────────
    def new_job(self, kind: str, integration_id: str) -> dict:
        job = {"id": uuid.uuid4().hex[:12], "kind": kind, "integrationId": integration_id,
               "status": "running", "startedAt": time.time()}
        (self.root / "jobs").mkdir(exist_ok=True)
        self._write_json(self.root / "jobs" / f"{job['id']}.json", job)
        return job

    def update_job(self, job_id: str, patch: dict) -> dict:
        p = self.root / "jobs" / f"{job_id}.json"
        with _lock:
            job = self._read_json(p, {})
            job.update(patch)
            self._write_json(p, job)
            return job

    def get_job(self, job_id: str) -> dict | None:
        if not valid_id(job_id):
            return None
        return self._read_json(self.root / "jobs" / f"{job_id}.json", None)
