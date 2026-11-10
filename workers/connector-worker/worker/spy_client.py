"""Cliente HTTP da API pública do Spy (`/api/v1/*`), com a chave de API da empresa."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request


class SpyError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(f"Spy respondeu {status}: {message}")
        self.status = status


class SpyClient:
    def __init__(self, base_url: str, api_key: str, timeout: float = 30.0, retries: int = 3):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.retries = retries

    def post(self, path: str, body: dict) -> dict:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        last: Exception | None = None
        for attempt in range(self.retries):
            req = urllib.request.Request(
                self.base_url + path, data=data, method="POST",
                headers={"Content-Type": "application/json", "x-api-key": self.api_key},
            )
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    raw = resp.read().decode("utf-8") or "{}"
                    return json.loads(raw)
            except urllib.error.HTTPError as e:
                msg = e.read().decode("utf-8", "replace")[:300]
                # 4xx (exceto 429) é erro do registro: não adianta repetir.
                if e.code < 500 and e.code != 429:
                    raise SpyError(e.code, msg) from e
                last = SpyError(e.code, msg)
            except (urllib.error.URLError, TimeoutError) as e:
                last = e
            time.sleep(min(2 ** attempt, 8) * 0.5)
        raise last if last else RuntimeError("falha desconhecida")
