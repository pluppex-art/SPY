# Central de Conexões — Google Calendar + Google Tasks

Tela: **Configurações → Integrações → Conexões** (`/app/configuracoes/integracoes/conexoes`).
A "Central de Aplicativos & Ads" continua sendo a tela dos apps ligados por chave de API; esta é a das contas ligadas por login (OAuth).

## Fluxo

```
Usuário → "Conectar Google" → /api/google-calendar/connect/start → consentimento Google
        → /api/google-calendar/oauth/callback → grava credenciais (google_calendar_connections, só backend)
        → registra um serviço por escopo concedido (integrations: calendar, tasks)
        → sincronização inicial (integration_sync_runs) → google_calendar_events / google_tasks
```

Escopos pedidos: Calendar (eventos, leitura, Meet) e **Tasks somente leitura** (`tasks.readonly`).
Quem conectou antes do Tasks existir vê "Autorizar Google Tasks" (reautoriza e ganha o escopo).

## Tabelas

| Tabela | Para quê | Quem lê |
|---|---|---|
| `google_calendar_connections` | credenciais (tokens). **Nenhum grant** para anon/authenticated | só backend |
| `integrations` | um registro por serviço conectado (provedor+serviço), sem token: conta, escopos, status, última sync, cursor | dono, admin do tenant, super admin |
| `integration_sync_runs` | histórico de cada sincronização (status, lidos/novos/atualizados/removidos, erro) | idem |
| `google_calendar_events` | eventos (chave única: integração + calendário + id do Google) | só o dono |
| `google_tasks` | tarefas (chave única: integração + lista + id do Google) | só o dono |

Escrita nas tabelas acima: **só o backend** (service_role). RLS ligada em todas.

## Para a Aurora

Visões (respeitam a RLS de quem consulta, `security_invoker`):

- `aurora_google_agenda` — eventos não cancelados: `title, start_at, end_at, all_day, location, attendees, meet_link, user_id, tenant_id`.
- `aurora_google_tasks` — tarefas não excluídas, com `pending` e `overdue` já calculados.

Exemplos (n8n/Aurora com service_role, sempre filtrando tenant **e** usuário):

```sql
-- "Quais são meus compromissos amanhã?"
select title, start_at, end_at, location, meet_link
  from aurora_google_agenda
 where tenant_id = :tenant and user_id = :user
   and start_at >= date_trunc('day', now() + interval '1 day')
   and start_at <  date_trunc('day', now() + interval '2 day')
 order by start_at;

-- "Quais tarefas estão atrasadas?"
select task_list_title, title, due_at
  from aurora_google_tasks
 where tenant_id = :tenant and user_id = :user and overdue
 order by due_at;
```

Antes de responder, a Aurora pode checar `integrations.status = 'connected'` e `last_sync_at` para saber se os dados estão atualizados.

## API (todas autenticadas, nunca devolvem token)

- `GET  /api/integrations/google/status` — estado e contagens por serviço.
- `GET  /api/integrations/google/calendars` — calendários da conta (identifica o principal).
- `POST /api/integrations/google/sync` `{ "services": ["calendar","tasks"] }` — sincroniza agora.
- `GET  /api/integrations/google/runs?service=tasks` — últimas sincronizações.

## Sincronização

- **Idempotente:** upsert pela chave externa; rodar de novo não duplica, e linhas sem mudança no Google (`external_updated_at` igual) nem são regravadas.
- **Sem perda:** cancelamentos e exclusões chegam do Google (`showDeleted`) e são gravados como `status = 'cancelled'` / `deleted = true`.
- **Tasks é incremental** (`updatedMin`, com 2 min de folga); Calendar usa janela de 30 dias atrás a 90 à frente.
- **Sem concorrência:** uma sync "running" há menos de 5 min bloqueia outra da mesma integração.
- Falha de autorização marca o serviço `needs_reauth`; qualquer erro fica em `last_sync_error` e no histórico.
- Fica de fora (de propósito, por ora): sincronização agendada em segundo plano — hoje é na conexão e pelo botão "Sincronizar".

## Pré-requisitos no Google Cloud

1. Ativar a **Google Tasks API** no projeto do OAuth.
2. Adicionar o escopo `https://www.googleapis.com/auth/tasks.readonly` na tela de consentimento.

## Adicionar outro serviço/provedor

1. Incluir no `src/lib/connectionsCatalog.ts` (`live: true`) e nos escopos de `server/integrationsRegistry.ts`.
2. Criar a função de sync (padrão de `server/googleSync.ts`) e a tabela de dados com `tenant_id`, `user_id`, `integration_id`, chave externa única e RLS "só o dono".
3. Provedores novos guardam credenciais na própria tabela (só backend), como `google_calendar_connections`.
