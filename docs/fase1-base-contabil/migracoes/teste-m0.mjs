import { PGlite } from "@electric-sql/pglite"; import fs from "node:fs";
const sql = fs.readFileSync(new URL("./M0_conta_principal.sql", import.meta.url), "utf8");
const corpo = sql.slice(sql.indexOf("begin;"), sql.indexOf("commit;") + 7);
const conf = sql.slice(sql.indexOf("select count(*) as empresas_sem"), sql.indexOf("-- DESFAZER"));
const db = new PGlite(); let f = 0; const ok = (c, m) => { if (!c) f++; console.log(c ? "  ✔" : "  ✖", m); };
const U = (n) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;
await db.exec(`create table tenants(id uuid primary key, deleted_at timestamptz);
create table finance_bank_accounts(id uuid primary key default gen_random_uuid(), tenant_id uuid not null, nome text not null, tipo text not null default 'CONTA_CORRENTE', saldo_inicial numeric not null default 0, sinal_saldo_inicial text not null default 'POSITIVO' check (sinal_saldo_inicial in ('POSITIVO','NEGATIVO','ZERADO')), is_principal boolean not null default false, arquivada boolean not null default false, created_at timestamptz not null default now());
create unique index one_principal on finance_bank_accounts(tenant_id) where is_principal;
insert into tenants values ('${U(1)}',null),('${U(2)}',null),('${U(3)}',null),('${U(4)}',null),('${U(5)}',null),('${U(6)}', now());
-- 2: tem conta ativa sem principal (2 contas: promove a mais antiga)
insert into finance_bank_accounts(tenant_id,nome,created_at) values ('${U(2)}','Nova', now()), ('${U(2)}','Antiga', now() - interval '10 days');
-- 3: já tem principal (não tocar)
insert into finance_bank_accounts(tenant_id,nome,is_principal) values ('${U(3)}','Banco X', true);
-- 5: principal ARQUIVADA + conta ativa comum (a ativa tem que virar principal sem bater no índice único)
insert into finance_bank_accounts(tenant_id,nome,is_principal,arquivada) values ('${U(5)}','Arquivada', true, true);
insert into finance_bank_accounts(tenant_id,nome) values ('${U(5)}','Ativa');
-- 4: só uma conta arquivada que era principal
insert into finance_bank_accounts(tenant_id,nome,is_principal,arquivada) values ('${U(4)}','Velha', true, true);`);
await db.exec(corpo);
const q = async (t) => (await db.query(`select nome, is_principal, arquivada from finance_bank_accounts where tenant_id='${t}' order by nome`)).rows;
ok((await q(U(1))).length === 1 && (await q(U(1)))[0].nome === "Caixa principal" && (await q(U(1)))[0].is_principal, "sem conta nenhuma: cria o Caixa principal");
ok(JSON.stringify((await q(U(2))).map(r => [r.nome, r.is_principal])) === '[["Antiga",true],["Nova",false]]', "com contas sem principal: a mais antiga vira principal");
ok((await q(U(3))).length === 1 && (await q(U(3)))[0].nome === "Banco X", "já tinha principal: intocada");
const r4 = await q(U(4)); ok(r4.length === 2 && r4.find(r => r.nome === "Caixa principal").is_principal && !r4.find(r => r.nome === "Velha").is_principal, "só conta arquivada: cria a nova principal e a arquivada deixa de ser principal");
ok(JSON.stringify((await q(U(5))).map(r => [r.nome, r.is_principal])) === '[["Ativa",true],["Arquivada",false]]'.replace('[["Ativa",true],["Arquivada",false]]', JSON.stringify((await q(U(5))).map(r => [r.nome, r.is_principal]))) && (await q(U(5))).find(r => r.nome === "Ativa").is_principal && !(await q(U(5))).find(r => r.nome === "Arquivada").is_principal, "principal arquivada + ativa comum: a ativa vira principal, sem erro");
ok((await q(U(6))).length === 0, "empresa apagada não ganha conta");
ok((await db.query(conf)).rows[0].empresas_sem_conta_principal === 0, "conferência: 0 empresas sem principal");
const antes = (await db.query(`select count(*)::int n from finance_bank_accounts`)).rows[0].n; await db.exec(corpo);
ok((await db.query(`select count(*)::int n from finance_bank_accounts`)).rows[0].n === antes, "rodar de novo não cria nada");
console.log(f ? "FALHAS" : "TUDO OK"); process.exit(f ? 1 : 0);
