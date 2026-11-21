// Como rodar: pasta vazia, "npm i @electric-sql/pglite", copie este arquivo e ajuste o caminho de P1_TUDO_EM_UM.sql. Banco em memória; não toca a produção.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const arq = fs.readFileSync("/Users/gustavohenriqueportilhogodoi/dev/SPY/docs/tabela-de-precos/migracoes/P1_TUDO_EM_UM.sql", "utf8");
const corpo = arq.slice(arq.indexOf("begin;"), arq.indexOf("commit;") + 7);
const conf = arq.slice(arq.indexOf("select\n  (select count(*) from public.products"), arq.indexOf("-- ====", arq.indexOf("select\n  (select count(*) from public.products")));
const des = arq.slice(arq.indexOf("-- DESFAZER")).split("\n").slice(1).filter(l => /^--\s{2,}\S/.test(l)).map(l => l.replace(/^--\s{3}/, "")).join("\n");
let falhas = 0; const ok = (c, m) => { if (!c) { falhas++; console.log("  ✖", m); } else console.log("  ✔", m); };
const T = "11111111-1111-4111-8111-111111111111";
async function novo(extra = "") {
  const db = new PGlite();
  await db.exec(`
  create table products(id uuid primary key default gen_random_uuid(), tenant_id uuid, name text, price numeric default 0, cost numeric default 0, margin numeric default 0, type_attributes jsonb not null default '{}', deleted_at timestamptz);
  create table planos(product_id uuid, price_cents int); create function sync_plans() returns trigger language plpgsql as $$ begin update planos set price_cents = round(coalesce(new.price,0)*100)::int where product_id = new.id; return new; end $$; create trigger trg_sync_plans after update of price on products for each row execute function sync_plans();
  create table estoque_items(id uuid primary key); create table clinica_servicos(id uuid primary key); create table imobiliario_imoveis(id uuid primary key); create table imobiliario_veiculos(id uuid primary key);
  insert into products(tenant_id, name, price, cost, margin, type_attributes) values
   ('${T}','A',100,60,99,'{"barcode":"789-1"}'), ('${T}','B',80,50,10,'{}'), ('${T}','C',50,0,0,'{}'), ('${T}','D',0,10,5,'{}');
  ${extra}`);
  return db;
}
console.log("1) primeira execução");
let db = await novo(); await db.exec(corpo);
let r = (await db.query(conf)).rows[0];
ok(r.produtos === 4 && r.com_ean === 1 && r.margens_divergentes_restantes === 0 && r.gatilho_margem_ok && r.indice_ean_ok, "conferência final: " + JSON.stringify(r));
const m = (await db.query(`select name, margin::float m from products order by name`)).rows.reduce((a, x) => (a[x.name] = x.m, a), {});
ok(m.A === 40 && m.B === 37.5, "margens divergentes corrigidas (A 40%, B 37,5%)");
ok(m.C === 0 && m.D === 5, "produto sem custo e produto sem preço NÃO foram tocados pelo passo de correção");
const idC = (await db.query(`select id from products where name='C'`)).rows[0].id; await db.exec(`insert into planos values ('${idC}', 5000); update products set price=120 where id='${idC}'`);
ok((await db.query(`select price_cents c from planos`)).rows[0].c === 12000 && (await db.query(`select margin::float m from products where id='${idC}'`)).rows[0].m === 100, "gatilho de planos continua funcionando junto com o da margem");
console.log("2) segunda execução (precisa ser idêntica, sem erro)");
await db.exec(corpo); r = (await db.query(conf)).rows[0]; ok(r.margens_divergentes_restantes === 0 && r.indice_ean_ok, "rodar de novo não dá erro e não muda nada");
console.log("3) tabela antiga inexistente não derruba o script");
db = await novo("drop table clinica_servicos; drop table estoque_items;"); await db.exec(corpo); ok(true, "roda sem as tabelas antigas");
console.log("4) EAN repetido na mesma empresa: avisa, não falha");
db = await novo(`update products set type_attributes='{"ean":"555"}' where name in ('B','C');`); await db.exec(corpo); r = (await db.query(conf)).rows[0];
ok(r.indice_ean_ok === false && r.com_ean === 3, "script conclui; índice único não criado; os códigos foram copiados");
console.log("5) desfazer");
db = await novo(); await db.exec(corpo); await db.exec(des);
const c = (await db.query(`select count(*)::int n from information_schema.columns where table_name='products' and column_name in ('ean','unidade')`)).rows[0].n;
ok(c === 0 && (await db.query(`select count(*)::int n from pg_trigger where tgname='trg_products_margem'`)).rows[0].n === 0, "colunas e gatilho removidos");
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTUDO OK"); process.exit(falhas ? 1 : 0);
