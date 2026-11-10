# Connector Worker — dados do sistema do cliente para o Spy

Serviço que roda **fora da Vercel** (VPS/Easypanel) e usa o
[reverse-api-engineer](https://github.com/kalil0321/reverse-api-engineer) (rae) para
ler o sistema que o cliente já usa e levar tudo para o Spy pela API pública (`/api/v1/*`).
Genérico: nada aqui é específico de empresa ou de sistema de origem.

## Como funciona

```
sistema do cliente ──(1 captura)──► rae gera client + extract.py ──► REVISÃO HUMANA ──► aprovado
                                                                                   │
sistema do cliente ◄──(só GET)── extract.py ──JSONL──► worker valida/deduplica ──► Spy /api/v1/*
                                                                                   │
                                                  relatório: lidos x enviados x esperados
```

1. **Captura** (uma vez por sistema): o rae navega o sistema e gera o cliente de API e o
   `extract.py` no [contrato](worker/contract.py). Fica **pendente de aprovação**, com relatório
   de escrita HTTP e chamadas perigosas encontradas no código.
2. **Aprovação** (pessoa): lê o `extract.py`, confere o relatório e aprova informando o `sha256`.
   Se o arquivo mudar, a aprovação cai e o sync é recusado.
3. **Sync** (quantas vezes quiser/agendado): roda o extrator aprovado, valida cada registro,
   deduplica, grava no Spy (cadastros antes de lançamentos) e **confere contagens**.

## Regras

- **Somente leitura** no sistema do cliente (como a Max Data): o prompt manda usar GET; o relatório
  de revisão aponta qualquer POST/PUT/PATCH/DELETE (login costuma ser POST — a pessoa decide).
- **Traga tudo**: o extrator pagina até o fim e, quando o sistema informa totais, emite `__expected__`;
  o worker marca `partial` se o que chegou for menor que o esperado.
- **Segredos cifrados** (Fernet) em `/data`; o extrator só recebe `INTEGRATION_*`, nunca a chave do
  Spy nem os segredos do worker. Nada de segredo sai pela API nem entra em log.
- **Só com autorização do cliente** e com login fornecido por ele.
- Idempotente: reenviar não duplica (o Spy deduplica por telefone/e-mail/documento e `externalId`).

## Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `WORKER_TOKEN` | sim (≥24 chars) | Bearer das chamadas à API do worker |
| `WORKER_SECRET_KEY` | sim | Chave Fernet: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `ANTHROPIC_API_KEY` | para capturar | Modelo que escreve o cliente (rae `sdk=claude`). Troque por `RAE_SDK=opencode` + chave do provedor se preferir |
| `SPY_BASE_URL` | não | Padrão `https://www.spycrm.com.br` |
| `RAE_MODEL`, `RAE_SDK` | não | Modelo/SDK do rae |
| `CAPTURE_TIMEOUT`, `SYNC_TIMEOUT`, `PUSH_CONCURRENCY` | não | 1800s / 3600s / 4 |

## Deploy no Easypanel

1. Novo serviço **App** a partir deste repositório, contexto de build `workers/connector-worker`.
2. Volume persistente em `/data`. Porta `8080`. Domínio com HTTPS (a API tem Bearer, mas só exponha via TLS).
3. Defina as variáveis acima.

## Uso (exemplo)

```bash
H="Authorization: Bearer $WORKER_TOKEN"; W=https://worker.seudominio.com

# 1) cadastrar a integração (chave de API do Spy da empresa + credenciais do sistema do cliente)
curl -X PUT $W/v1/integrations/acme -H "$H" -d '{
  "name":"Acme ERP","sourceUrl":"https://erp.acme.com.br",
  "goal":"Trazer clientes, leads, produtos e todas as vendas/recebimentos",
  "spyApiKey":"<chave de API da empresa no Spy>",
  "secrets":{"INTEGRATION_USER":"...","INTEGRATION_PASSWORD":"..."}}'

# 2) capturar (gera o extrator) e acompanhar
curl -X POST $W/v1/integrations/acme/capture -H "$H"      # → {"jobId":"..."}
curl $W/v1/jobs/<jobId> -H "$H"                           # status + relatório (sha256, writes, dangers)

# 3) revisar extract.py, aprovar com o sha256 do relatório
curl -X POST $W/v1/integrations/acme/approve -H "$H" -d '{"sha256":"<sha do relatório>","by":"gustavo"}'

# 4) sincronizar e ver a conferência
curl -X POST $W/v1/integrations/acme/sync -H "$H"
curl $W/v1/jobs/<jobId> -H "$H"   # stats por entidade, expected, mismatches, samples de erro
```

## Limites conhecidos

- A captura **autenticada** exige que o agente use o login: as credenciais passam pela IA nessa etapa.
  Se isso não for aceitável para o cliente, capture manualmente (rae em modo `manual`) e rode `engineer <run_id>`.
- Sites com bot detection agressivo podem exigir captura manual.
- O revisor humano é a barreira final: a checagem estática é alerta, não sandbox.

## Testes

```bash
pip install cryptography
python -I -m unittest discover -s tests -t . -v
```
