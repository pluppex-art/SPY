# Repasse (relay) da Max Data — liberar gravação

A Max Data só aceita chamadas de IPs liberados. O S.P.Y. roda em nuvem sem IP fixo, então as chamadas passam por um
servidor pequeno (VPS de IP fixo) configurado em `MAXDATA_RELAY_URL` + `MAXDATA_RELAY_SECRET`. Esse servidor **não está
neste repositório**; ele hoje só encaminha leitura (GET) e o login (`POST /v2/auth`).

Para o S.P.Y. cadastrar/alterar na Max Data, o repasse precisa encaminhar também estas rotas de escrita — e **só estas**:

| Método | Rota (prefixo `/v2`)      | Para quê                          |
|--------|---------------------------|-----------------------------------|
| POST   | `/client`                 | cadastrar cliente                 |
| PUT    | `/client/{id}`            | alterar cliente                   |
| PUT    | `/product/{id}`           | alterar produto                   |
| POST   | `/adjustmentstock`        | criar ajuste de estoque (pendente)|

Tudo o mais (DELETE, vendas, NF-e, outros PUT/POST) continua bloqueado.

## Contrato que o S.P.Y. usa

`POST {MAXDATA_RELAY_URL}/fwd` (qualquer método HTTP do original é mantido), com os headers:

- `x-relay-secret`: segredo compartilhado (`MAXDATA_RELAY_SECRET`);
- `x-relay-target`: URL completa de destino na Max Data;
- `Authorization`, `Content-Type`, `Accept`: repassar como vieram;
- corpo JSON: repassar como veio.

A resposta (status e corpo) deve voltar sem alteração.

## Referência (Node 20+, sem dependências)

```js
import http from "node:http";

const SECRET = process.env.RELAY_SECRET;
const PORT = Number(process.env.PORT || 8080);
const HOSTS = (process.env.ALLOWED_HOSTS || "").split(",").filter(Boolean); // ex.: "201.10.20.30:8085"
const ESCRITA = [
  ["POST", /^\/v2\/auth$/],
  ["POST", /^\/v2\/client$/],
  ["PUT",  /^\/v2\/client\/\d+$/],
  ["PUT",  /^\/v2\/product\/\d+$/],
  ["POST", /^\/v2\/adjustmentstock$/],
];

http.createServer(async (req, res) => {
  const fim = (code, msg) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify({ message: msg })); };
  if (req.url !== "/fwd" || req.headers["x-relay-secret"] !== SECRET) return fim(403, "negado");
  let alvo;
  try { alvo = new URL(String(req.headers["x-relay-target"])); } catch { return fim(400, "destino inválido"); }
  if (!HOSTS.includes(alvo.host)) return fim(403, "host não permitido");
  const permitido = req.method === "GET" || ESCRITA.some(([m, re]) => m === req.method && re.test(alvo.pathname));
  if (!permitido) return fim(405, "método/rota não permitidos no repasse");

  const chunks = []; for await (const c of req) chunks.push(c);
  const headers = {};
  for (const h of ["authorization", "content-type", "accept", "application_name", "application_key", "application_description"]) if (req.headers[h]) headers[h] = req.headers[h];
  const r = await fetch(alvo, { method: req.method, headers, body: req.method === "GET" ? undefined : Buffer.concat(chunks), redirect: "error" }).catch(() => null);
  if (!r) return fim(502, "Max Data inacessível");
  res.writeHead(r.status, { "content-type": r.headers.get("content-type") || "application/json" });
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT);
```

Se o seu repasse atual já tem outra estrutura, só some as linhas de `ESCRITA` à lista de permitidos dele.

## Depois de liberar

1. Configurações → Integrações → Max Data → **Gravar na Max Data = Sim**.
2. Clique em **Testar gravação**: ele lê um cliente e reenvia o mesmo registro, sem mudar nada. Se passar, repasse e chave estão corretos.
3. Só então use Cadastrar/Alterar cliente e Editar produto.
