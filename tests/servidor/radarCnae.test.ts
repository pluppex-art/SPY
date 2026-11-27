/** Busca do Radar por CNAE: cota do dia, formato da tela, empresas salvas e continuação. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerRadarCnaeRoutes } from "../../server/radarCnae.js";
import { restanteHoje } from "../../server/radarCota.js";
import { pesquisarNoRadar } from "../../src/lib/buscaRadar.js";
import { criarFakeDb, criarFakeApp } from "../agendamento/fakeDb.js";

const empresa = (n: number) => ({ cnpj: `11.111.111/0001-${String(n).padStart(2, "0")}`, nome: `ACME ${n} LTDA`, fantasia: `Acme ${n}`, municipio: "PALMAS", uf: "TO", logradouro: "RUA A", numero: "1", email: n === 1 ? "OI@acme.com.br" : "", telefone: "(63) 3000-0000 / (63) 3111-1111", atividade_principal: [{ code: "93.13-1-00", text: "Academias" }] });

function montar(status = 200, modules: object = { radar: true }) {
  const db = criarFakeDb({ app_settings: [], radar_empresas_frias: [], tenants: [{ id: "T", modules }], users: [{ id: "u", is_master: false }] });
  const urls: string[] = [];
  const { app, chamar } = criarFakeApp();
  const passa = (_q: any, _s: any, n: any) => n?.();
  registerRadarCnaeRoutes(app, { requireUser: passa, resolveRequestedTenantId: async () => "T", limiter: passa, supabaseService: db,
    buscar: (async (u: string) => { urls.push(u); return new Response(JSON.stringify({ total: 90, resultados: [empresa(1), empresa(2)], proximo_cursor: "abc" }), { status }); }) as any });
  const pedir = (body: object) => chamar("POST", "/api/radar/cnae", { body, user: { id: "u" } });
  return { db, urls, pedir };
}
const comChave = async (f: () => Promise<void>) => { const antes = process.env.APIPJ_KEY; process.env.APIPJ_KEY = "k"; try { await f(); } finally { if (antes === undefined) delete process.env.APIPJ_KEY; else process.env.APIPJ_KEY = antes; } };

test("CNAE: devolve empresas com e-mail, guarda e desconta só o que veio", () => comChave(async () => {
  const { db, urls, pedir } = montar();
  const r = await pedir({ cnae: "93.13-1-00", municipio: "1721000", quantidade: 10 });
  assert.equal(r.status, 200);
  assert.deepEqual([r.corpo.resultados[0].empresa, r.corpo.resultados[0].email, r.corpo.resultados[0].contato, r.corpo.proximoCursor, r.corpo.restante], ["Acme 1", "oi@acme.com.br", "(63) 3000-0000", "abc", 48]);
  assert.match(urls[0], /cnae=9313100&municipio=1721000.*limite=10/);
  assert.equal(db.t.radar_empresas_frias.length, 2);
  assert.equal(db.t.radar_empresas_frias[0].cnpj.length, 14);
}));

test("CNAE: erro da consulta não gasta a cota; sem módulo Radar não consulta", () => comChave(async () => {
  const falha = montar(429);
  assert.equal((await falha.pedir({ cnae: "9313100", municipio: "1721000" })).status, 502);
  assert.equal(await restanteHoje(falha.db, "T"), 50);
  const sem = montar(200, { radar: false, crm: true });
  assert.equal((await sem.pedir({ cnae: "9313100", municipio: "1721000" })).status, 403);
  assert.equal(sem.urls.length, 0);
  assert.equal((await montar().pedir({ cnae: "93", municipio: "1721000" })).status, 400);
}));

test("busca por CNAE na tela: várias atividades e continuação com o cursor", async () => {
  const corpos: any[] = [];
  const api = async (p: string, init?: RequestInit) => { corpos.push([p, JSON.parse(String(init!.body))]); return new Response(JSON.stringify({ resultados: [{ empresa: "A", endereco: "x", cnpj: "1" }], restante: 40, proximoCursor: "c1" })); };
  const r = await pesquisarNoRadar(api, { modo: "cnae", cnaes: ["93.13-1-00", "5611201"], tipo: "", cidades: [{ id: "1721000", cidade: "Palmas", uf: "TO" }], quantidade: 5 });
  assert.deepEqual(corpos[0], ["/api/radar/cnae", { cnae: "9313100", municipio: "1721000", quantidade: 5 }]);
  assert.equal(corpos[1][1].cnae, "5611201"); // uma consulta por atividade em cada cidade
  await pesquisarNoRadar(api, r.mais!);
  assert.deepEqual(corpos.slice(2).map((c) => [c[1].cnae, c[1].cursor]), [["9313100", "c1"], ["5611201", "c1"]]);
  await assert.rejects(() => pesquisarNoRadar(api, { modo: "cnae", cnaes: ["9313100"], tipo: "", cidades: [], quantidade: 5 }), /cidade/);
  await assert.rejects(() => pesquisarNoRadar(api, { modo: "cnae", cnaes: [], tipo: "", cidades: [{ id: "1", cidade: "P", uf: "TO" }], quantidade: 5 }), /atividade/);
});
