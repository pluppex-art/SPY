import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const sql = fs.readFileSync(new URL("./P3_exames_ligacoes_para_products.sql", import.meta.url), "utf8");
const corpo = sql.slice(sql.indexOf("begin;"), sql.indexOf("commit;") + 7);
const conf = sql.slice(sql.indexOf("select\n  (select count(*) from public.saude_comparacao_itens"), sql.indexOf("-- DESFAZER"));
const T = "11111111-1111-4111-8111-111111111111", A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const setup = async (semP2 = false) => {
  const db = new PGlite();
  await db.exec(`create schema if not exists public;
  create table products(id uuid primary key default gen_random_uuid(), tenant_id uuid, name text, externo_sistema text, externo_id text);
  create table saude_exames_base(id uuid primary key, tenant_id uuid, nome text);
  create table saude_comparacao_itens(id serial primary key, tenant_id uuid, exame_base_id uuid references saude_exames_base(id) on delete set null, candidatos jsonb not null default '[]');
  create table saude_equivalencias(id serial primary key, tenant_id uuid, exame_base_id uuid not null references saude_exames_base(id) on delete cascade);
  insert into saude_exames_base values ('${A}','${T}','A'),('${B}','${T}','B');
  ${semP2 ? "" : `insert into products(tenant_id,name,externo_sistema,externo_id) values ('${T}','A','saude_exames_base','${A}'),('${T}','B','saude_exames_base','${B}');`}
  insert into saude_comparacao_itens(tenant_id,exame_base_id,candidatos) values ('${T}','${A}','[{"exame_base_id":"${A}","score":98},{"exame_base_id":"${B}","score":80}]'),('${T}',null,'[]');
  insert into saude_equivalencias(tenant_id,exame_base_id) values ('${T}','${B}');`);
  return db;
};
let f = 0; const ok = (c, m) => { if (!c) f++; console.log(c ? "  ✔" : "  ✖", m); };
let db = await setup(); await db.exec(corpo);
const idA = (await db.query(`select id from products where name='A'`)).rows[0].id, idB = (await db.query(`select id from products where name='B'`)).rows[0].id;
let r = (await db.query(`select exame_base_id::text e, candidatos c from saude_comparacao_itens order by id`)).rows;
ok(r[0].e === idA && r[0].c[0].exame_base_id === idA && r[0].c[1].exame_base_id === idB && r[0].c[0].score === 98, "item e candidatos apontam para products (ordem e score preservados)");
ok(r[1].e === null && r[1].c.length === 0, "item sem vínculo e candidatos vazios ficam iguais");
ok((await db.query(`select exame_base_id::text e from saude_equivalencias`)).rows[0].e === idB, "equivalência aponta para products");
let c = (await db.query(conf)).rows[0]; ok(c.itens_sem_exame == 0 && c.equivalencias_sem_exame == 0 && c.candidatos_sem_exame == 0, "conferência zerada");
await db.exec(corpo); ok((await db.query(`select exame_base_id::text e from saude_equivalencias`)).rows[0].e === idB, "segunda execução não muda nada");
await db.exec(`delete from products where id='${idB}'`);
ok((await db.query(`select count(*)::int n from saude_equivalencias`)).rows[0].n === 0, "apagar exame em products apaga a equivalência (cascade preservado)");
await db.exec(`delete from products where id='${idA}'`);
ok((await db.query(`select exame_base_id from saude_comparacao_itens order by id`)).rows[0].exame_base_id === null, "apagar exame zera o vínculo do item (set null preservado)");
db = await setup(true); let err = ""; try { await db.exec(corpo); } catch (e) { err = e.message; await db.exec("rollback"); }
ok(/P2 incompleto/.test(err), "sem o P2 o script para com mensagem clara");
ok((await db.query(`select count(*)::int n from pg_constraint where contype='f' and confrelid='saude_exames_base'::regclass`)).rows[0].n === 2, "…e as chaves antigas continuam (nada mudou)");
console.log(f ? "FALHAS" : "TUDO OK"); process.exit(f ? 1 : 0);
