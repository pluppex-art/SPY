// Como rodar: em uma pasta vazia, "npm i @electric-sql/pglite" e copie este arquivo; ajuste DIR para o caminho de migracoes/.
// Cria um banco em memória (não encosta na produção), aplica M1..M4, confere o comportamento e desfaz tudo.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const DIR = "/Users/gustavohenriqueportilhogodoi/dev/SPY/docs/fase1-base-contabil/migracoes/";
const db = new PGlite();
const T = "11111111-1111-4111-8111-111111111111", OUTRA = "22222222-2222-4222-8222-222222222222", USER = "33333333-3333-4333-8333-333333333333";
let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log("  ✖", m); } else console.log("  ✔", m); };
const erro = async (sql, padrao, m) => { try { await db.exec(sql); ok(false, m + " (deveria falhar)"); } catch (e) { ok(new RegExp(padrao, "i").test(String(e.message)), m + " → " + String(e.message).slice(0, 70)); } };
const um = async (sql) => (await db.query(sql)).rows[0];

// ---- esquema de apoio: espelha o que existe em produção (lido em 21/11/2026) ----
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
create table tenants(id uuid primary key);
create table users(id uuid primary key);
create function has_tenant_access(t uuid) returns boolean language sql as $$ select true $$;
create table finance_categories(id text primary key default gen_random_uuid()::text, tenant_id uuid not null references tenants(id), nome text not null, tipo text not null, created_at timestamptz not null default now(), subtipo text);
create table finance_bank_accounts(id uuid primary key default gen_random_uuid(), tenant_id uuid not null);
create table vendas(id uuid primary key default gen_random_uuid(), tenant_id uuid not null);
create table finance_period_locks(id uuid primary key default gen_random_uuid(), tenant_id uuid not null, data_inicial date not null, data_final date not null);
create table finance_entries(
  id text primary key default gen_random_uuid()::text, tenant_id uuid, description varchar not null, category varchar, status varchar default 'A Vencer',
  value numeric not null default 0, type varchar not null, date varchar, created_at timestamptz default now(), category_id text references finance_categories(id),
  competencia_date date, conta_bancaria_id uuid references finance_bank_accounts(id),
  date_normalized date generated always as (case when date::text ~ '^\\d{4}-\\d{2}-\\d{2}' then make_date(substring(date from 1 for 4)::int, substring(date from 6 for 2)::int, substring(date from 9 for 2)::int) else null end) stored);
create function guard_finance_period_lock() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare v_user_id uuid := auth.uid(); v_user_found boolean; v_locked boolean;
begin
  if old.status is distinct from 'Pago' or old.date_normalized is null then return coalesce(new, old); end if;
  perform 1 from public.users where id = v_user_id; v_user_found := found;
  if not v_user_found then return coalesce(new, old); end if;
  select exists (select 1 from public.finance_period_locks l where l.tenant_id = old.tenant_id and old.date_normalized between l.data_inicial and l.data_final) into v_locked;
  if v_locked then raise exception 'Este período está bloqueado para fechamento — não é possível alterar/excluir uma transação paga nessa data.' using errcode = '42501'; end if;
  return coalesce(new, old);
end $f$;
create trigger trg_guard_finance_period_lock before delete or update on finance_entries for each row execute function guard_finance_period_lock();
insert into tenants values ('${T}'), ('${OUTRA}'); insert into users values ('${USER}');
insert into finance_bank_accounts(id, tenant_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${T}');
insert into finance_entries(id, tenant_id, description, status, value, type, date) values ('antigo1', '${T}', 'Legado pago', 'Pago', 100, 'Receber', '2026-01-10'), ('antigo2', '${T}', 'Legado a vencer', 'A Vencer', 50, 'Pagar', '2026-02-10');
`);
const col = async (t) => (await db.query(`select column_name from information_schema.columns where table_name='${t}' order by 1`)).rows.map((r) => r.column_name).join(",");
const base = { cat: await col("finance_categories"), ent: await col("finance_entries"), guard: (await um(`select md5(pg_get_functiondef('guard_finance_period_lock'::regproc)) h`)).h, trg: (await um(`select count(*)::int n from pg_trigger where tgrelid='finance_entries'::regclass and not tgisinternal`)).n };
const corpo = (f) => { const s = fs.readFileSync(DIR + f, "utf8"); return s.slice(0, s.indexOf("-- DESFAZER") > 0 ? s.indexOf("-- ====", s.indexOf("-- Verificação") > 0 ? s.indexOf("-- Verificação") : 0) : s.length); };
const desfazer = (f) => { const s = fs.readFileSync(DIR + f, "utf8"); const i = s.indexOf("-- DESFAZER"); return s.slice(i).split("\n").slice(1).filter((l) => /^--\s{2,}\S/.test(l)).map((l) => l.replace(/^--\s{3}/, "")).join("\n"); };
const aplicar = async (f) => { const s = fs.readFileSync(DIR + f, "utf8"); const a = s.indexOf("begin;"), b = s.indexOf("commit;") + 7; await db.exec(s.slice(a, b)); };

console.log("M1 — plano de contas");
await aplicar("M1_plano_de_contas.sql");
let n1 = (await um(`select public.finance_aplicar_plano_padrao('${T}') n`)).n; ok(n1 === 10 + 46, `cria 10 grupos + 46 contas (criou ${n1})`);
ok((await um(`select public.finance_aplicar_plano_padrao('${T}') n`)).n === 0, "2ª chamada não cria nada (idempotente)");
ok((await um(`select count(*)::int n from finance_categories where tenant_id='${OUTRA}'`)).n === 0, "outra empresa não recebeu nada");
ok((await um(`select linha_dre l from finance_categories where codigo='3.01' and tenant_id='${T}'`)).l === "CMV", "conta 3.01 herdou a linha CMV do grupo 3");
await erro(`update finance_categories set linha_dre='RECEITA_BRUTA' where codigo='3.01' and tenant_id='${T}'`, "plano padrão", "padrão: não troca a linha do DRE");
await erro(`delete from finance_categories where codigo='3.01' and tenant_id='${T}'`, "excluída", "padrão: não exclui");
await db.exec(`update finance_categories set nome='Custo dos produtos' where codigo='3.01' and tenant_id='${T}'`); ok(true, "padrão: pode renomear");
await db.exec(`insert into finance_categories(id, tenant_id, nome, tipo, parent_id, linha_dre) values ('custom1','${T}','Meu custo','Despesa','pc_${T.replace(/-/g, "")}_4','RECEITA_BRUTA')`);
const cu = await um(`select linha_dre, nivel from finance_categories where id='custom1'`); ok(cu.linha_dre === "DESP_COMERCIAL" && cu.nivel === 2, "conta criada pela empresa herda a linha do grupo (ignora a enviada)");
await erro(`insert into finance_categories(id, tenant_id, nome, tipo, parent_id) values ('x','${T}','Neto','Despesa','custom1')`, "dois níveis", "não permite 3º nível");
await erro(`insert into finance_categories(id, tenant_id, nome, tipo, parent_id) values ('y','${OUTRA}','Cruzada','Despesa','pc_${T.replace(/-/g, "")}_4')`, "inválido", "não aceita grupo de outra empresa");
ok((await um(`select count(*)::int n from finance_entries`)).n === 2, "lançamentos antigos intactos");

console.log("M2 — campos de finance_entries");
await aplicar("M2_finance_entries_campos.sql");
const leg = await um(`select origem_registro o, data_pagamento d, nao_operacional n, competencia_date c from finance_entries where id='antigo1'`);
ok(leg.o === null && leg.d === null && leg.n === false && leg.c === null, "linha antiga continua exatamente igual (origem NULL = legado)");
await db.exec(`set app.uid=''; insert into finance_entries(id, tenant_id, description, status, value, type, date) values ('n8n1','${T}','Veio do N8N','Pago',10,'Receber','2026-03-05')`);
let r = await um(`select origem_registro o, data_pagamento::text d, competencia_date::text c from finance_entries where id='n8n1'`);
ok(r.o === "api" && r.d === "2026-03-05" && r.c === "2026-03-05", `sem usuário logado vira origem 'api', data_pagamento e competência preenchidas (${JSON.stringify(r)})`);
await db.exec(`set app.uid='${USER}'; insert into finance_entries(id, tenant_id, description, status, value, type, date, category_id) values ('tela1','${T}','Da tela','A Vencer',20,'Pagar','2026-04-10','pc_${T.replace(/-/g, "")}_10_01')`);
r = await um(`select origem_registro o, nao_operacional n from finance_entries where id='tela1'`);
ok(r.o === "spy" && r.n === true, "usuário logado vira 'spy'; categoria FORA_DRE marca não operacional");
await db.exec(`update finance_entries set status='Pago', conta_bancaria_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' where id='tela1'`);
r = await um(`select data_pagamento::text d from finance_entries where id='tela1'`); ok(r.d === "2026-04-10", "ao baixar, data_pagamento é preenchida");
await erro(`update finance_entries set value=999 where id='tela1'`, "estorno", "pagamento confirmado: não edita valor");
await erro(`update finance_entries set status='A Vencer' where id='tela1'`, "estorno", "pagamento confirmado: não volta para 'A Vencer'");
await db.exec(`update finance_entries set description='Nome novo', notes_dummy_ignored=null` .replace(", notes_dummy_ignored=null", "") + ` where id='tela1'`); ok(true, "pagamento confirmado: descrição ainda pode mudar");
await db.exec(`insert into finance_entries(id, tenant_id, description, status, value, type, date, estorno_de, data_pagamento, conta_bancaria_id) values ('est1','${T}','Estorno','Pago',20,'Receber','2026-04-11','tela1','2026-04-11','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')`); ok(true, "estorno vinculado ao original");
await erro(`insert into finance_entries(id, tenant_id, description, status, value, type, date, estorno_de) values ('est2','${T}','Estorno 2','A Vencer',20,'Receber','2026-04-12','tela1')`, "duplicate|unique", "só um estorno por pagamento");
await erro(`insert into finance_entries(id, tenant_id, description, status, value, type, date, estorno_de) values ('est3','${T}','Estorno de pendente','A Vencer',1,'Receber','2026-04-12','antigo2')`, "pagamento confirmado", "não estorna lançamento não pago");
await erro(`insert into finance_entries(id, tenant_id, description, status, value, type, date, venda_id) values ('v1','${T}','Venda fantasma','A Vencer',1,'Receber','2026-04-12','99999999-9999-4999-8999-999999999999')`, "venda|foreign", "venda de origem inexistente é recusada");
await erro(`update finance_entries set origem_registro='spy' where id='antigo2'`, "antigo", "linha antiga não muda para a regra nova");

console.log("M3 — bloqueio de período");
await aplicar("M3_bloqueio_de_periodo.sql");
await db.exec(`insert into finance_period_locks(tenant_id, data_inicial, data_final) values ('${T}','2026-05-01','2026-05-31')`);
await erro(`insert into finance_entries(id, tenant_id, description, status, value, type, date, conta_bancaria_id) values ('trav1','${T}','Pago em período fechado','Pago',5,'Receber','2026-05-10','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')`, "bloqueado", "usuário: INSERT pago em período fechado é barrado");
await db.exec(`insert into finance_entries(id, tenant_id, description, status, value, type, date) values ('trav2','${T}','A vencer em período fechado','A Vencer',5,'Receber','2026-05-10')`); ok(true, "usuário: INSERT pendente em período fechado continua livre");
await db.exec(`set app.uid=''; insert into finance_entries(id, tenant_id, description, status, value, type, date) values ('trav3','${T}','N8N em período fechado','Pago',5,'Receber','2026-05-10')`); ok(true, "N8N/service role segue sem ser barrado (decisão pendente)");

console.log("M4 — conta obrigatória na baixa");
await aplicar("M4_exigir_conta_na_baixa.sql");
await db.exec(`set app.uid='${USER}'`);
await erro(`insert into finance_entries(id, tenant_id, description, status, value, type, date) values ('sem1','${T}','Pago sem conta','Pago',1,'Receber','2026-06-01')`, "baixa_spy", "tela: baixa sem conta é recusada");
await db.exec(`set app.uid=''; insert into finance_entries(id, tenant_id, description, status, value, type, date) values ('sem2','${T}','N8N pago sem conta','Pago',1,'Receber','2026-06-01')`); ok(true, "N8N: baixa sem conta passa (vira pendência de relatório)");

console.log("DESFAZER — tudo na ordem inversa");
await db.exec("delete from finance_categories where id = 'custom1'"); // M1 só se desfaz se a empresa não criou contas próprias (documentado)
for (const f of ["M4_exigir_conta_na_baixa.sql", "M3_bloqueio_de_periodo.sql", "M2_finance_entries_campos.sql", "M1_plano_de_contas.sql"]) {
  if (f.startsWith("M1")) await db.exec("set app.uid=''; delete from finance_entries where id not like 'antigo%'"); // M1 só se desfaz sem lançamentos nas contas do plano (documentado)
  await db.exec(desfazer(f));
  console.log("  desfeito:", f);
}
const dep = { cat: await col("finance_categories"), ent: await col("finance_entries"), guard: (await um(`select md5(pg_get_functiondef('guard_finance_period_lock'::regproc)) h`)).h, trg: (await um(`select count(*)::int n from pg_trigger where tgrelid='finance_entries'::regclass and not tgisinternal`)).n };
ok(dep.cat === base.cat, "finance_categories voltou às colunas originais");
ok(dep.ent === base.ent, "finance_entries voltou às colunas originais");
await db.exec(`set app.uid='${USER}'; delete from finance_period_locks; insert into finance_period_locks(tenant_id, data_inicial, data_final) values ('${T}','2026-01-01','2026-01-31');`);
await erro(`update finance_entries set value=1 where id='antigo1'`, "bloqueado", "após desfazer: alterar pago em período fechado continua barrado (comportamento de hoje)");
await db.exec(`insert into finance_entries(id, tenant_id, description, status, value, type, date) values ('pos1','${T}','Inserção paga em período fechado','Pago',1,'Receber','2026-01-15')`); ok(true, "após desfazer: INSERT pago em período fechado volta a passar (como hoje)");
await db.exec(`set app.uid=''; update finance_entries set value=2 where id='antigo1'`); ok(true, "após desfazer: service role/N8N segue livre (como hoje)");
ok(dep.trg === base.trg, "gatilhos de finance_entries voltaram ao que eram");
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTUDO OK");
process.exit(falhas ? 1 : 0);
