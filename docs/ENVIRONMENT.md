# Variáveis de ambiente

Referência: [`.env.example`](../.env.example). Copie pra `.env` e preencha com valores reais — **nunca commite o `.env`** (já está no `.gitignore`).

## Regra do Vite: `VITE_*` é público

Qualquer variável prefixada com `VITE_` é embutida em texto plano no bundle JS servido ao navegador — **não é segredo**, mesmo que pareça uma chave de API. Variável sem esse prefixo, se referenciada em código que roda no navegador, chega como `undefined` (Vite só expõe as `VITE_*` no `import.meta.env`). Isso não é um bug, é o funcionamento normal do Vite — mas define uma regra dura pro projeto: **nada que precise ficar secreto pode ter o prefixo `VITE_`**, e nada sem o prefixo pode ser usado esperando que funcione no navegador.

## Frontend (público, vai pro bundle)

| Variável | Uso |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase. Público por design — é a mesma URL que qualquer requisição do navegador precisa conhecer. |
| `VITE_SUPABASE_ANON_KEY` | Chave `anon` do Supabase. Público por design — a segurança real é a RLS no banco (ver [DATABASE_SECURITY.md](DATABASE_SECURITY.md)), não o sigilo dessa chave. |
| `VITE_GEMINI_API_KEY` | Chamadas à API do Gemini feitas **direto do navegador** em alguns pontos do frontend. **Isso expõe a chave do Gemini no bundle** — qualquer pessoa pode extrair e usar por conta própria, gerando custo pro projeto. Documentado em [`SECURITY_AUDIT.md`](../SECURITY_AUDIT.md) — mover essas chamadas pro backend (que já tem `/api/ai/*` pra outros casos) eliminaria a exposição, mas não foi feito nesta rodada por exigir mapear todo ponto de uso no frontend antes de migrar sem quebrar. |
| `VITE_GROQ_API_KEY` | Mesmo caso do Gemini acima — chave da Groq também referenciada em código de navegador (o backend também a aceita como fallback de `GROQ_API_KEY`). |
| `VITE_GOOGLE_CLIENT_ID` | Client ID público do Google (login/Tasks via Google Identity Services no navegador). Público por natureza. |

## Backend (`server.ts` — nunca vai pro bundle)

| Variável | Uso |
|---|---|
| `GEMINI_API_KEY` / `GROQ_API_KEY` | Versões server-side das mesmas chaves, usadas pelas rotas `/api/ai/*` — essas sim nunca chegam ao cliente. |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypassa RLS. Usada só no backend (`supabaseService`): rotas `requireMaster` (`/api/admin/*`), API pública `/api/v1/*`, rotas públicas (lead-capture, proposta pública, webhook do WAHA), conectores externos e Google Calendar (tokens) — sempre atrás de validação explícita de tenant na rota. **Nunca** deve ganhar prefixo `VITE_` nem ser lida em código de `src/`. |
| `SPY_API_KEYS` | Lista `chave:tenantId,chave:tenantId` — é isso que `requireApiKey` (`server.ts`) de fato lê para resolver o tenant de uma chamada a `/api/v1/leads`. Cada chave vale para exatamente um tenant. Renomeado de `AXIS_API_KEYS` no rebrand Axis → S.P.Y.; o código ainda lê `AXIS_API_KEYS` como fallback se `SPY_API_KEYS` não estiver setada (produção na Vercel só tem a variável antiga configurada até a migração manual). |
| `SPY_CORS_ORIGIN` | Lista de origens permitidas, separadas por vírgula. Sem essa variável (nem o fallback `AXIS_CORS_ORIGIN`), o código usa um default fixo (`https://axis-crm.pluppex.com.br`, conforme TRD §14.1) — defina sempre explicitamente. **Nunca usar `"*"` em produção** — corrigido nesta auditoria (A1): antes, o valor default quando a variável não existia era `"*"`. Renomeado de `AXIS_CORS_ORIGIN`; mesmo fallback do item acima. |
| `SPY_FORM_TENANT_ID` / `SPY_FORM_CLIENT_ID` | Tenant (e cliente) que recebe os leads de `POST /api/public/lead-capture` (formulário público). Sem `SPY_FORM_TENANT_ID` a rota devolve `503`. Fallback legado: `AXIS_FORM_*`. |
| `REDIS_URL` | Cache Redis opcional (resumos/listas). Sem ela o servidor funciona normalmente, só sem cache (falha aberta). Precisa ser o endpoint **externo** com TLS (`rediss://`) quando o backend roda na Vercel. |
| `WAHA_API_URL` / `WAHA_API_KEY` | Gateway WAHA (WhatsApp). Com `WAHA_API_URL` definida o provedor ativo é o WAHA real; sem ela, o `SimulatorProvider`. Ver [WEBHOOKS.md](WEBHOOKS.md). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_OAUTH_REDIRECT_URI` / `GOOGLE_OAUTH_SUCCESS_ORIGIN` | Integração Google Calendar server-side (`server/googleCalendar.ts`). O secret nunca vai pro navegador. |
| `GOOGLE_OAUTH_STATE_SECRET` | Chave HMAC do `state` do OAuth. Sem ela cai em `SUPABASE_SERVICE_ROLE_KEY` — defina uma própria para poder rotacionar. |
| `PUBLIC_APP_URL` / `APP_URL` | URL pública do app (montagem de links/webhooks). |
| `PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET` | Conexão automática com bancos (Open Finance) via Pluggy — `server/pluggy.ts`. Sem as duas a integração fica desligada (o botão "Conectar" da Conciliação aparece desativado e o extrato segue por OFX/CSV). **O secret só existe no servidor**: nunca em `VITE_*` nem no navegador. |
| `PLUGGY_WEBHOOK_SECRET` | Opcional. Segredo de assinatura dos webhooks do Pluggy (`X-Pluggy-Signature`). Quando definido e o corpo bruto está disponível, chamadas com assinatura inválida levam 401. Na Vercel o corpo já chega interpretado, então a conferência não é possível lá — o webhook é tratado só como sinal (ele nunca grava dados vindos da chamada, só dispara uma nova leitura com as nossas credenciais). |
| `PLUGGY_SANDBOX` | `true` mostra os conectores de teste (sandbox) no widget. Deixe desligado em produção. |
| `AURORA_WEBHOOK_URL` | URL do webhook n8n da Aurora. Só o backend a conhece — ver [WEBHOOKS.md](WEBHOOKS.md#aurora-chat--n8n). |

## Achado desta auditoria: chaves reais no histórico do git

As chaves de API do S.P.Y. (na época `AXIS_API_KEY_MAIN`/`AXIS_API_KEY_FORM`) e a chave do Gemini foram commitadas com valor real em algum ponto do histórico do repositório, e **continuam sendo os valores em uso hoje** (confirmado comparando com o `.env` local). Isso significa que qualquer pessoa com acesso ao histórico do git (não só ao código atual) tem essas chaves. `.env.example` foi corrigido pra usar placeholders — mas **isso não invalida as chaves já expostas**. 🚨 Ação manual necessária, não automatizável por aqui: rotacionar (gerar novas, ex.: `openssl rand -hex 32`) as chaves de `SPY_API_KEYS`/a chave do Gemini, atualizar `.env` de produção com os novos valores. Reescrever o histórico do git (`git filter-repo` ou similar) é opcional e disruptivo — só vale a pena se o repositório já foi clonado por alguém fora da equipe; rotacionar a chave em si já neutraliza o vazamento independente disso.
