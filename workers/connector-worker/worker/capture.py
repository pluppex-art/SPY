"""Captura: o rae observa o sistema do cliente e gera o cliente de API + o extrator."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

from . import readonly

CONTRACT_DOC = """\
Contrato do extrator (extract.py):
- Rodar com `python extract.py` e IMPRIMIR NA SAÍDA PADRÃO uma linha JSON por registro:
  {"entity": "<entidade>", "data": { ... }}
- Entidades e campos (mesmos da API do Spy):
  client:        name, phone, email, documento, tipoPessoa(PF|PJ), cep, logradouro, numero, bairro, complemento, city, state, industry, status
  lead:          name, email, phone, company, cnpj, source, status, value, customFields, createdAt
  product:       externalId, sku, name, price, cost, category, type, description, active
  finance_entry: externalId, description, value, date(AAAA-MM-DD), category, type(Receber|Pagar), status(Pago|A Vencer), counterparty,
                 clientName, clientPhone, clientEmail, clientDocument, paymentMethod, documentNumber, competenciaDate
  meeting:       externalId, title, scheduledAt|date+time, durationMinutes, status, notes, name, email, phone, company
  lead_activity: externalId, title, type, description, date, email|phone
- Sempre preencha `externalId` com o id original do registro no sistema de origem (é o que impede duplicar).
- Se o sistema informar o total de cada entidade, imprima UMA linha:
  {"entity": "__expected__", "data": {"client": 1200, "finance_entry": 5400}}
"""

RULES = """\
Regras obrigatórias:
1. SOMENTE LEITURA: use apenas requisições GET (a única exceção é o login/autenticação). Nunca crie, altere ou apague nada no sistema de origem.
2. Traga TUDO: percorra todas as páginas de cada listagem até acabar; nada de "primeira página".
3. Credenciais vêm de variáveis de ambiente (INTEGRATION_USER, INTEGRATION_PASSWORD, INTEGRATION_TOKEN...). Nunca grave senha em código.
4. Não use subprocess, os.system, eval ou exec. Respeite pausas entre chamadas (sem martelar o sistema).
5. Erros de um registro não derrubam o resto: registre em stderr e continue.
"""


def build_prompt(goal: str) -> str:
    return (
        f"{goal.strip()}\n\n"
        "Além do cliente de API, crie na mesma pasta de saída um arquivo `extract.py` que traga os dados do "
        "sistema para o Spy.\n\n" + CONTRACT_DOC + "\n" + RULES
    )


def build_command(rae_bin: str, url: str, goal: str) -> list[str]:
    # --headless: o container não tem servidor gráfico.
    return [rae_bin, "agent", "--prompt", build_prompt(goal), "--url", url, "--json", "--no-interactive", "--headless"]


def parse_agent_json(stdout: str) -> dict:
    """O `agent --json` imprime um único documento JSON; tolera lixo antes dele."""
    text = stdout.strip()
    start = text.find("{")
    if start < 0:
        raise RuntimeError("rae não devolveu JSON")
    return json.loads(text[start:])


def run_capture(root: Path, integration_dir: Path, url: str, goal: str, rae_bin: str, timeout: int) -> dict:
    """Roda o rae e guarda client/ + extract.py na pasta da integração. Devolve o resumo da captura."""
    workdir = integration_dir / "work"
    workdir.mkdir(exist_ok=True)
    cmd = build_command(rae_bin, url, goal)
    env = {k: v for k, v in os.environ.items() if k in ("PATH", "HOME", "LANG", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "RAE_DEBUG")}
    proc = subprocess.run(cmd, cwd=workdir, env=env, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        raise RuntimeError(f"rae falhou (código {proc.returncode}): {(proc.stderr or proc.stdout)[-400:]}")
    result = parse_agent_json(proc.stdout)
    if result.get("status") != "ok" or not result.get("script_path"):
        raise RuntimeError(f"captura sem sucesso: {result.get('error') or 'sem script gerado'}")

    out_dir = Path(result["script_path"]).resolve().parent
    extract = out_dir / "extract.py"
    if not extract.exists():
        raise RuntimeError("o rae não gerou extract.py — rode a captura de novo pedindo o extrator")

    client_dir = integration_dir / "client"
    if client_dir.exists():
        shutil.rmtree(client_dir)
    shutil.copytree(out_dir, client_dir)
    source = (client_dir / "extract.py").read_text("utf-8")
    report = readonly.scan(source)
    shutil.copyfile(client_dir / "extract.py", integration_dir / "extract.py")
    return {"runId": result.get("run_id"), "usage": result.get("usage", {}), "scan": report}
