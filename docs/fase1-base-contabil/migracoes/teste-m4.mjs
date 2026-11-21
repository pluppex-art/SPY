import { PGlite } from "@electric-sql/pglite"; import fs from "node:fs";
const sql = fs.readFileSync(new URL("./M4_exigir_conta_na_baixa.sql", import.meta.url), "utf8");
const corpo = sql.slice(sql.indexOf("begin;"), sql.indexOf("commit;") + 7);
let f = 0; const ok = (c, m) => { if (!c) f++; console.log(c ? "  ✔" : "  ✖", m); };
const tem = async (db) => (await db.query(`select count(*)::int n from pg_constraint where conname='finance_entries_baixa_spy_check'`)).rows[0].n;
let db = new PGlite(); await db.exec(`create table finance_entries(id text primary key, status text, conta_bancaria_id uuid);`);
await db.exec(corpo); ok(await tem(db) === 0, "sem o M2: roda sem erro e não cria nada");
db = new PGlite(); await db.exec(`create table finance_entries(id text primary key, status text, conta_bancaria_id uuid, data_pagamento date, origem_registro text);
insert into finance_entries values ('velho','Pago',null,null,'spy');`);
await db.exec(corpo); ok(await tem(db) === 1, "com o M2: cria a regra, mesmo havendo linha antiga que a violaria (NOT VALID)");
await db.exec(corpo); ok(await tem(db) === 1, "rodar de novo não dá erro");
let err = ""; try { await db.exec(`insert into finance_entries values ('n1','Pago',null,null,'spy')`); } catch (e) { err = e.message; }
ok(/baixa_spy_check/.test(err), "baixa nova pela tela sem conta é barrada");
await db.exec(`insert into finance_entries values ('n2','Pago','11111111-1111-4111-8111-111111111111','2026-11-21','spy'), ('n3','Pago',null,null,'api'), ('n4','Pendente',null,null,'spy'), ('n5','Pago',null,null,null)`);
ok(true, "baixa com conta, baixa por API, pendente e legado passam");
console.log(f ? "FALHAS" : "TUDO OK"); process.exit(f ? 1 : 0);
