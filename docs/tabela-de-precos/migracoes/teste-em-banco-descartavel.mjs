// Como rodar: pasta vazia, "npm i @electric-sql/pglite", copie este arquivo e ajuste DIR. Banco em memória; não toca a produção.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const DIR = "/Users/gustavohenriqueportilhogodoi/dev/SPY/docs/tabela-de-precos/migracoes/";
const db = new PGlite(); let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log("  ✖", m); } else console.log("  ✔", m); };
const um = async (q) => (await db.query(q)).rows[0];
const erro = async (sql, pad, m) => { try { await db.exec(sql); ok(false, m + " (deveria falhar)"); } catch (e) { ok(new RegExp(pad, "i").test(String(e.message)), m + " → " + String(e.message).slice(0, 60)); } };
const T = "11111111-1111-4111-8111-111111111111", O = "22222222-2222-4222-8222-222222222222";
await db.exec(`
create table products(id uuid primary key default gen_random_uuid(), tenant_id uuid, name text, price numeric default 0, cost numeric default 0, margin numeric default 0, type_attributes jsonb not null default '{}', deleted_at timestamptz, active boolean default true);
create table estoque_items(id uuid primary key); create table clinica_servicos(id uuid primary key); create table imobiliario_imoveis(id uuid primary key); create table imobiliario_veiculos(id uuid primary key);
-- gatilho "atual" que sincroniza planos (stand-in): precisa continuar funcionando
create table planos(product_id uuid, price_cents int);
create function sync_plans() returns trigger language plpgsql as $$ begin update planos set price_cents = round(coalesce(new.price,0)*100)::int where product_id = new.id; return new; end $$;
create trigger trg_sync_plans after update of price on products for each row execute function sync_plans();
insert into products(id, tenant_id, name, price, cost, margin, type_attributes) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','${T}','Com código no JSON',100,60,99,'{"barcode":"789 000-1"}'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','${T}','Sem código',50,0,0,'{}'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','${T}','Margem velha',80,50,10,'{}');
insert into planos values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 5000);
`);
const col = async () => (await db.query(`select column_name from information_schema.columns where table_name='products' order by 1`)).rows.map(r => r.column_name).join(",");
const base = await col();
const s = fs.readFileSync(DIR + "P1_products_tabela_unica.sql", "utf8");
const apl = s.slice(s.indexOf("begin;"), s.indexOf("commit;") + 7);
const des = s.slice(s.indexOf("-- DESFAZER")).split("\n").slice(1).filter(l => /^--\s{2,}\S/.test(l)).map(l => l.replace(/^--\s{3}/, "")).join("\n");
await db.exec(apl);
console.log("P1 — aplicada");
ok((await um(`select ean from products where name='Com código no JSON'`)).ean === "7890001", "EAN preenchido a partir de type_attributes (sem pontuação)");
ok((await um(`select ean from products where name='Sem código'`)).ean === null, "produto sem código continua sem EAN");
ok((await um(`select margin::float m from products where name='Margem velha'`)).m === 10, "margem antiga NÃO muda sozinha (o gatilho só dispara em preço/custo)");
await db.exec(`update products set cost=40 where name='Margem velha'`);
ok((await um(`select margin::float m from products where name='Margem velha'`)).m === 50, "ao mudar o custo a margem é recalculada (80 e 40 = 50%)");
await db.exec(`update products set price=200 where name='Margem velha'`);
ok((await um(`select margin::float m from products where name='Margem velha'`)).m === 80, "ao mudar o preço também (200 e 40 = 80%)");
await db.exec(`insert into products(tenant_id, name, price, cost) values ('${T}','Novo',35,20)`);
ok((await um(`select margin::float m from products where name='Novo'`)).m === 42.9, "produto novo já nasce com a margem certa (42,9%)");
await db.exec(`insert into products(tenant_id, name, price, cost) values ('${T}','Sem preço',0,10)`);
ok((await um(`select margin::float m from products where name='Sem preço'`)).m === 0, "sem preço = margem 0");
await db.exec(`update products set price=120 where name='Sem código'`);
ok((await um(`select price_cents c from planos`)).c === 12000, "gatilho existente de planos continua funcionando junto");
await db.exec(`update products set ean='123' where name='Novo'`);
await erro(`update products set ean='123' where name='Sem preço'`, "duplicate|unique", "EAN repetido na mesma empresa é recusado");
await db.exec(`insert into products(tenant_id, name, ean) values ('${O}','Outra empresa','123')`); ok(true, "mesmo EAN em outra empresa é permitido");
await db.exec(`update products set deleted_at=now() where name='Novo'; insert into products(tenant_id, name, ean) values ('${T}','Reuso do código','123')`); ok(true, "produto apagado libera o código");
ok((await um(`select obj_description('estoque_items'::regclass) d`)).d.startsWith("LEGADO:"), "tabela antiga marcada como LEGADO");
console.log("P1 — desfazendo");
await db.exec(des);
ok((await col()) === base, "colunas de products voltaram às originais");
ok((await um(`select count(*)::int n from pg_trigger where tgrelid='products'::regclass and not tgisinternal and tgname='trg_products_margem'`)).n === 0, "gatilho da margem removido");
await db.exec(`update products set price=300 where name='Sem código'`);
ok((await um(`select price_cents c from planos`)).c === 30000, "gatilho de planos segue funcionando depois de desfazer");
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTUDO OK"); process.exit(falhas ? 1 : 0);
