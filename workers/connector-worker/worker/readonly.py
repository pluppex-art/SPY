"""Checagem estática do extrator gerado pela IA, antes de uma pessoa aprová-lo.

Não é um sandbox: é um alerta para a revisão humana. O Spy só LÊ o sistema do cliente
(mesma regra da Max Data) — então qualquer escrita, ou chamada perigosa, tem que
aparecer aqui para quem aprova decidir.
"""
from __future__ import annotations

import hashlib
import re

_WRITE = [
    (re.compile(r"\.(post|put|patch|delete)\s*\(", re.I), "chamada HTTP de escrita ({0})"),
    (re.compile(r"""method\s*=\s*["'](POST|PUT|PATCH|DELETE)["']""", re.I), "método HTTP de escrita ({0})"),
    (re.compile(r"""["'](POST|PUT|PATCH|DELETE)["']"""), "método HTTP de escrita ({0})"),
    (re.compile(r"-X\s+(POST|PUT|PATCH|DELETE)"), "curl com método de escrita ({0})"),
]
_DANGER = [
    (re.compile(r"\bos\.system\s*\("), "os.system"),
    (re.compile(r"\bsubprocess\b"), "subprocess"),
    (re.compile(r"\beval\s*\("), "eval"),
    (re.compile(r"\bexec\s*\("), "exec"),
    (re.compile(r"\bshutil\.rmtree\b|\bos\.remove\b|\bos\.unlink\b"), "apaga arquivos"),
    (re.compile(r"\bsocket\b"), "socket direto"),
    (re.compile(r"__import__"), "import dinâmico"),
]


def sha256(source: str) -> str:
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def scan(source: str) -> dict:
    """Devolve {sha256, writes: [...], dangers: [...]}. Linhas começam em 1."""
    writes: list[dict] = []
    dangers: list[dict] = []
    for n, line in enumerate(source.splitlines(), 1):
        code = line.split("#", 1)[0]
        for rx, label in _WRITE:
            m = rx.search(code)
            if m:
                writes.append({"line": n, "what": label.format(m.group(1).upper()), "code": line.strip()[:160]})
                break
        for rx, label in _DANGER:
            if rx.search(code):
                dangers.append({"line": n, "what": label, "code": line.strip()[:160]})
    return {"sha256": sha256(source), "writes": writes, "dangers": dangers}
