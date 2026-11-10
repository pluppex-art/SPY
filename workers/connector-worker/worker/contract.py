"""Contrato entre o extrator de cada sistema de cliente e o Spy.

O extrator (`extract.py`, gerado pelo rae) imprime UMA linha JSON por registro:

    {"entity": "lead", "data": {"name": "Maria", "phone": "11999990000", ...}}

`entity` é uma das chaves de ENTITIES; `data` usa os mesmos campos da API pública
do Spy (`/api/v1/*`). O worker valida, deduplica e grava — nunca confia no
extrator para decidir o que é válido.
"""
from __future__ import annotations

import json
from dataclasses import dataclass


@dataclass(frozen=True)
class EntitySpec:
    path: str                      # rota da API do Spy
    required: tuple[str, ...] = ()  # campos obrigatórios
    any_of: tuple[tuple[str, ...], ...] = ()  # cada grupo exige ao menos um campo preenchido
    key: tuple[str, ...] = ()      # campos que identificam o registro (dedup dentro do mesmo sync)


ENTITIES: dict[str, EntitySpec] = {
    "client": EntitySpec("/api/v1/clients", ("name",), (("phone", "email", "documento"),), ("documento", "email", "phone")),
    "lead": EntitySpec("/api/v1/leads", ("name",), (("email", "phone"),), ("email", "phone")),
    "product": EntitySpec("/api/v1/products", ("name",), (("sku", "externalId"),), ("sku", "externalId")),
    "finance_entry": EntitySpec("/api/v1/finance-entries", ("externalId", "description"), (), ("externalId",)),
    "meeting": EntitySpec("/api/v1/meetings", ("externalId", "title"), (("scheduledAt", "date"),), ("externalId",)),
    "lead_activity": EntitySpec("/api/v1/lead-activities", ("title",), (("email", "phone"),), ("externalId",)),
}

# Ordem de gravação: cadastros antes do que depende deles (cliente/lead antes de lançamento e atividade).
ORDER = ["client", "product", "lead", "finance_entry", "meeting", "lead_activity"]


def _filled(v: object) -> bool:
    return v is not None and str(v).strip() != ""


def validate(entity: str, data: dict) -> list[str]:
    spec = ENTITIES.get(entity)
    if spec is None:
        return [f"entidade desconhecida: {entity!r}"]
    errors = [f"campo obrigatório ausente: {f}" for f in spec.required if not _filled(data.get(f))]
    for group in spec.any_of:
        if not any(_filled(data.get(f)) for f in group):
            errors.append("informe ao menos um de: " + ", ".join(group))
    return errors


def dedup_key(entity: str, data: dict) -> str | None:
    """Chave estável do registro dentro de um sync (None = sem como deduplicar)."""
    spec = ENTITIES[entity]
    for field in spec.key:
        if _filled(data.get(field)):
            return f"{field}={str(data[field]).strip().lower()}"
    return None


def parse_line(line: str) -> tuple[str, dict]:
    """Lê uma linha do extrator. Levanta ValueError se não for um registro."""
    try:
        obj = json.loads(line)
    except json.JSONDecodeError as e:
        raise ValueError(f"linha não é JSON: {e.msg}") from e
    if not isinstance(obj, dict) or "entity" not in obj or not isinstance(obj.get("data"), dict):
        raise ValueError('esperado {"entity": ..., "data": {...}}')
    return str(obj["entity"]), obj["data"]
