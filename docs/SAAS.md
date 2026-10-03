# S.P.Y. como SaaS — cobrança, teto de IA, LGPD, MFA

## Assinaturas
- Tabelas: `subscription_plans`, `tenant_subscriptions`, `billing_events` (RLS: leitura por `has_tenant_access`, escrita só super admin; trilha só `service_role`).
- **Tenant sem assinatura = acesso liberado.** Só quem tem linha em `tenant_subscriptions` entra na régua.
- Status: `trial` → `active` → `past_due` → `suspended` / `canceled`.
- Régua (`billing_tick()`): trial/período vencido → `past_due`; vencido há mais que `grace_days` → `suspended`.
  Roda via `POST /api/billing/tick` (master) ou agendada (ver `supabase/migrations/20261003_billing_tick_cron.sql.example`).
- Suspensa/cancelada: o app mostra tela de acesso suspenso (master/parceiro só vê um aviso), as rotas de IA respondem
  `402` e a **resposta automática por IA no WhatsApp para** (as mensagens recebidas continuam sendo salvas).
- Admin → aba **Assinaturas & IA**: criar planos, definir assinatura, marcar como pago, suspender/reativar.

## Asaas (opcional)
Variáveis no servidor: `ASAAS_API_KEY`, `ASAAS_ENV` (`sandbox` ou vazio = produção), `ASAAS_WEBHOOK_TOKEN`.
Webhook: `POST /api/billing/webhook/asaas` com o header `asaas-access-token` = `ASAAS_WEBHOOK_TOKEN`.
Eventos tratados: `PAYMENT_CONFIRMED/RECEIVED` (ativa e avança o período), `PAYMENT_OVERDUE` (atraso), `SUBSCRIPTION_DELETED/INACTIVATED` (cancela). Idempotente por pagamento.

## Teto de IA por tenant
`tenant_ai_budget` (tokens/mês, % de aviso, pausar ao atingir). O consumo vem de `ai_usage_log` (o servidor registra Gemini e Groq).
Estourou com "pausar": rotas de IA respondem `429` e o auto-reply do WhatsApp para. Aviso em `X-AI-Budget-Warning`.

## LGPD
Configurações → Empresa → LGPD (admin do tenant): buscar titular, exportar (JSON), anonimizar (irreversível) e registrar consentimento.
Tudo auditado em `lgpd_requests`.

## MFA
Perfil → Verificação em duas etapas (TOTP). Quem ativa passa a precisar do código no login, e o servidor recusa sessão sem 2º fator
(`401 mfa_required`) nas rotas `/api`. **Limite:** acesso direto ao PostgREST com o token da sessão (aal1) não é bloqueado — isso exigiria
policies RLS por `aal` em todas as tabelas.

## Teste de isolamento no CI
`.github/workflows/isolation-test.yml` roda `supabase/tests/tenant_isolation_test.sql` todo dia e a cada mudança em migrations.
Precisa do secret `SUPABASE_DB_URL`.
