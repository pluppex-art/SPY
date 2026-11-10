"""API HTTP do worker (stdlib). Autenticada por Bearer WORKER_TOKEN; segredos nunca saem por aqui."""
from __future__ import annotations

import hmac
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import capture, readonly, sync
from .store import Store, valid_id

ROUTES: list[tuple[str, re.Pattern, str]] = [
    ("GET", re.compile(r"^/health$"), "health"),
    ("GET", re.compile(r"^/v1/integrations$"), "list"),
    ("PUT", re.compile(r"^/v1/integrations/([^/]+)$"), "put"),
    ("GET", re.compile(r"^/v1/integrations/([^/]+)$"), "get"),
    ("POST", re.compile(r"^/v1/integrations/([^/]+)/capture$"), "capture"),
    ("POST", re.compile(r"^/v1/integrations/([^/]+)/approve$"), "approve"),
    ("POST", re.compile(r"^/v1/integrations/([^/]+)/sync$"), "sync"),
    ("GET", re.compile(r"^/v1/jobs/([^/]+)$"), "job"),
]


class Config:
    def __init__(self):
        self.token = os.environ.get("WORKER_TOKEN", "")
        self.secret_key = os.environ.get("WORKER_SECRET_KEY", "")
        self.data_dir = os.environ.get("DATA_DIR", "/data")
        self.spy_base_url = os.environ.get("SPY_BASE_URL", "https://www.spycrm.com.br")
        self.rae_bin = os.environ.get("RAE_BIN", "reverse-api-engineer")
        self.capture_timeout = int(os.environ.get("CAPTURE_TIMEOUT", "1800"))
        self.sync_timeout = int(os.environ.get("SYNC_TIMEOUT", "3600"))
        self.push_concurrency = int(os.environ.get("PUSH_CONCURRENCY", "4"))

    def check(self) -> None:
        if len(self.token) < 24:
            raise SystemExit("WORKER_TOKEN ausente ou curto demais (mín. 24 caracteres)")
        if not self.secret_key:
            raise SystemExit("WORKER_SECRET_KEY ausente (gere com: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')")


def public_view(integ: dict) -> dict:
    return {k: v for k, v in integ.items() if k not in ("secrets", "spyApiKey")}


def make_handler(cfg: Config, store: Store):
    class Handler(BaseHTTPRequestHandler):
        server_version = "connector-worker"

        def log_message(self, fmt, *args):  # sem logar corpo/headers (há credenciais)
            pass

        def _send(self, code: int, obj) -> None:
            body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _authorized(self) -> bool:
            got = self.headers.get("Authorization", "")
            return hmac.compare_digest(got.encode(), f"Bearer {cfg.token}".encode())

        def _body(self) -> dict:
            n = int(self.headers.get("Content-Length") or 0)
            if n > 1_000_000:
                raise ValueError("corpo grande demais")
            return json.loads(self.rfile.read(n) or b"{}") if n else {}

        def _dispatch(self, method: str) -> None:
            path = self.path.split("?", 1)[0]
            for m, rx, name in ROUTES:
                match = rx.match(path)
                if m == method and match:
                    if name != "health" and not self._authorized():
                        return self._send(401, {"error": "não autorizado"})
                    try:
                        return getattr(self, f"h_{name}")(*match.groups())
                    except ValueError as e:
                        return self._send(400, {"error": str(e)})
                    except sync.SyncRefused as e:
                        return self._send(409, {"error": str(e)})
            self._send(404, {"error": "rota não encontrada"})

        do_GET = lambda self: self._dispatch("GET")
        do_POST = lambda self: self._dispatch("POST")
        do_PUT = lambda self: self._dispatch("PUT")

        # ── handlers ───────────────────────────────────────────────────────
        def h_health(self):
            self._send(200, {"ok": True})

        def h_list(self):
            self._send(200, [public_view(i) for i in store.list_integrations()])

        def h_get(self, iid):
            integ = store.get_integration(iid) if valid_id(iid) else None
            self._send(200, public_view(integ)) if integ else self._send(404, {"error": "não encontrada"})

        def h_put(self, iid):
            body = self._body()
            if not valid_id(iid):
                raise ValueError("id inválido (use letras, números, - e _)")
            patch = {k: body[k] for k in ("name", "sourceUrl", "goal") if k in body}
            if "spyBaseUrl" in body:
                patch["spyBaseUrl"] = str(body["spyBaseUrl"]).rstrip("/")
            integ = store.save_integration(iid, patch)
            secrets = {**store.get_secrets(iid)}
            if body.get("spyApiKey"):
                secrets["SPY_API_KEY"] = str(body["spyApiKey"])
            for k, v in (body.get("secrets") or {}).items():
                if not re.match(r"^INTEGRATION_[A-Z0-9_]{1,40}$", k):
                    raise ValueError(f"nome de credencial inválido: {k} (use INTEGRATION_*)")
                secrets[k] = str(v)
            store.set_secrets(iid, secrets)
            self._send(200, public_view(integ))

        def _start_job(self, kind: str, iid: str, fn):
            job = store.new_job(kind, iid)

            def run():
                try:
                    result = fn()
                    store.update_job(job["id"], {"status": "done", "finishedAt": __import__("time").time(), "result": result})
                except Exception as e:  # o job termina sempre com um estado legível
                    store.update_job(job["id"], {"status": "error", "finishedAt": __import__("time").time(), "error": f"{type(e).__name__}: {e}"})
            threading.Thread(target=run, daemon=True).start()
            self._send(202, {"jobId": job["id"]})

        def h_capture(self, iid):
            body = self._body()
            integ = store.get_integration(iid) if valid_id(iid) else None
            if not integ:
                raise ValueError("integração não encontrada — crie com PUT antes")
            url = body.get("url") or integ.get("sourceUrl")
            goal = body.get("goal") or integ.get("goal")
            if not url or not goal:
                raise ValueError("informe url e goal (ou salve-os na integração)")

            def fn():
                res = capture.run_capture(store.root, store.integration_dir(iid), url, goal, cfg.rae_bin, cfg.capture_timeout)
                store.save_integration(iid, {"approved": False, "approvedSha": None, "scan": res["scan"], "lastCapture": {"runId": res["runId"], "usage": res["usage"]}})
                return {"scan": res["scan"], "needsApproval": True}
            self._start_job("capture", iid, fn)

        def h_approve(self, iid):
            body = self._body()
            integ = store.get_integration(iid) if valid_id(iid) else None
            extract = store.integration_dir(iid) / "extract.py" if integ else None
            if not integ or not extract or not extract.exists():
                raise ValueError("nada para aprovar — rode a captura")
            sha = readonly.sha256(extract.read_text("utf-8"))
            if body.get("sha256") != sha:
                raise ValueError("sha256 informado não confere com o extrator atual (revise o arquivo e informe o sha256 do relatório)")
            integ = store.save_integration(iid, {"approved": True, "approvedSha": sha, "approvedBy": str(body.get("by") or "")[:80]})
            self._send(200, public_view(integ))

        def h_sync(self, iid):
            sync.check_approved(store, iid)  # recusa já na chamada (409), antes de abrir o job
            integ = store.get_integration(iid)
            base = integ.get("spyBaseUrl") or cfg.spy_base_url

            def fn():
                report = sync.run_sync(store, iid, base, timeout=cfg.sync_timeout, concurrency=cfg.push_concurrency)
                store.save_integration(iid, {"lastSync": {"at": __import__("time").time(), "status": report["status"], "stats": report["stats"], "mismatches": report["mismatches"]}})
                return report
            self._start_job("sync", iid, fn)

        def h_job(self, jid):
            job = store.get_job(jid)
            self._send(200, job) if job else self._send(404, {"error": "job não encontrado"})

    return Handler


def main() -> None:
    cfg = Config()
    cfg.check()
    store = Store(cfg.data_dir, cfg.secret_key)
    port = int(os.environ.get("PORT", "8080"))
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(cfg, store)).serve_forever()


if __name__ == "__main__":
    main()
