import { test } from "node:test";
import assert from "node:assert/strict";
import { validarContatoPublico, notaDosCampos, SCRIPT_RASTREIO, registerMarketingPublicRoutes } from "../../server/marketingPublico.js";
import { textToHtml } from "../../server/emailCampaigns.js";
import { ehGastoMarketing } from "../../src/lib/gastoMarketing.js";
import { criarFakeDb, criarFakeApp } from "../agendamento/fakeDb.js";

const T = "11111111-1111-4111-8111-111111111111";

test("contato público: exige nome e telefone ou e-mail válidos e normaliza", () => {
  const ok = validarContatoPublico({ name: "  Maria  Silva ", phone: "(63) 99999-0000", email: "MARIA@X.COM" });
  assert.equal(ok.ok, true);
  if (ok.ok === true) assert.deepEqual(ok.contato, { nome: "Maria  Silva", telefone: "63999990000", email: "maria@x.com" });
  assert.equal(validarContatoPublico({ name: "A", phone: "63999990000" }).ok, false);
  assert.equal(validarContatoPublico({ name: "Maria" }).ok, false);
  assert.equal(validarContatoPublico({ name: "Maria", email: "sem-arroba" }).ok, false);
  assert.equal(validarContatoPublico({ name: "Maria", phone: "123" }).ok, false);
  assert.equal(validarContatoPublico({ name: "Maria", email: "m@x.com" }).ok, true);
});

test("nota do lead: só texto simples, sem os campos de contato, com limite", () => {
  const n = notaDosCampos({ name: "x", email: "y", message: "quero saber mais", interesse: "plano", obj: { a: 1 }, website: "", vazio: "" });
  assert.equal(n, "message: quero saber mais\ninteresse: plano");
  assert.ok(notaDosCampos({ a: "x".repeat(5000) }).length <= 3000);
});

test("script de rastreio: conta visita, clique e conversão e não lê campos de senha/cartão", () => {
  assert.match(SCRIPT_RASTREIO, /lp-track/);
  for (const t of ["'view'", "'click'", "'conversion'"]) assert.ok(SCRIPT_RASTREIO.includes(t), t);
  assert.match(SCRIPT_RASTREIO, /pass\|senha\|card/);
  assert.ok(!SCRIPT_RASTREIO.includes("cdn.axis.com"));
  new Function(SCRIPT_RASTREIO); // sintaxe válida
});

test("e-mail em massa: o link no texto leva a cor de verdade (antes saía '${color}')", () => {
  const html = textToHtml("veja https://x.com/a", "#ff0000");
  assert.ok(html.includes('style="color:#ff0000"'));
  assert.ok(!html.includes("${color}"));
});

test("gasto de marketing: mesma regra para Campanhas e Analytics", () => {
  for (const c of ["Marketing", "Anúncios Meta", "Tráfego pago", "Google Ads", "Publicidade"]) assert.equal(ehGastoMarketing(c), true, c);
  for (const c of ["Aluguel", "Folha de pagamento", "Energia", null, undefined, ""]) assert.equal(ehGastoMarketing(c as any), false, String(c));
});

function montar() {
  const db = criarFakeDb({
    marketing_forms: [{ id: "form-1", tenant_id: T, name: "Contato", source: "Site X", active: true }, { id: "form-off", tenant_id: T, name: "Off", source: "Off", active: false }],
    marketing_landing_pages: [{ id: "22222222-2222-4222-8222-222222222222", tenant_id: T, name: "LP Black", views: 0, clicks: 0, conversions: 0, deleted_at: null }],
  });
  const { app, chamar } = criarFakeApp();
  registerMarketingPublicRoutes(app, { supabaseService: db as any, limiter: ((_a: any, _b: any, n: any) => n && n()) as any });
  return { db, chamar };
}

test("formulário público: cria o lead na empresa dona do formulário; isca e dados ruins não criam nada", async () => {
  const { db, chamar } = montar();
  const ok = await chamar("POST", "/api/public/forms/:formId/submit", { params: { formId: "form-1" }, body: { name: "Ana Souza", phone: "63988887777", message: "oi" } });
  assert.equal(ok.status, 200);
  const leads = db.t.leads ?? [];
  assert.equal(leads.length, 1);
  assert.equal(leads[0].tenant_id, T);
  assert.equal(leads[0].source, "Site X");
  assert.match(leads[0].notes, /oi/);
  await chamar("POST", "/api/public/forms/:formId/submit", { params: { formId: "form-1" }, body: { name: "Robô", phone: "63988887777", website: "http://spam" } });
  assert.equal((await chamar("POST", "/api/public/forms/:formId/submit", { params: { formId: "form-1" }, body: { name: "Sem contato" } })).status, 400);
  assert.equal((await chamar("POST", "/api/public/forms/:formId/submit", { params: { formId: "nao-existe" }, body: { name: "Ana", phone: "63988887777" } })).status, 404);
  assert.equal((await chamar("POST", "/api/public/forms/:formId/submit", { params: { formId: "form-off" }, body: { name: "Ana", phone: "63988887777" } })).status, 404);
  assert.equal((db.t.leads ?? []).length, 1);
});

test("rastreio de LP: conta visita/clique/conversão, cria lead só na conversão válida e ignora id inválido", async () => {
  const { db, chamar } = montar();
  const id = "22222222-2222-4222-8222-222222222222";
  const enviar = (corpo: any) => chamar("POST", "/api/public/lp-track", { body: JSON.stringify(corpo) });
  await enviar({ id, tipo: "view" }); await enviar({ id, tipo: "view" }); await enviar({ id, tipo: "click" });
  await enviar({ id, tipo: "conversion", name: "Beto", email: "beto@x.com", mensagem: "quero" });
  await enviar({ id, tipo: "conversion", name: "x" }); // conversão sem contato: conta, mas não cria lead
  await enviar({ id: "lixo", tipo: "view" }); await enviar({ id, tipo: "hack" });
  const lp = db.t.marketing_landing_pages[0];
  assert.equal(lp.views, 2); assert.equal(lp.clicks, 1); assert.equal(lp.conversions, 2);
  assert.equal(lp.conversion_rate, 100);
  const leads = db.t.leads ?? [];
  assert.equal(leads.length, 1);
  assert.match(leads[0].source, /LP Black/);
});

import { resumirInsights } from "../../server/marketingAds.js";
test("Meta Ads: soma o gasto por dia, calcula CPC/CTR e ignora linhas inválidas", () => {
  const r = resumirInsights([
    { date_start: "2026-11-02", spend: "50.10", impressions: "1000", clicks: "20" },
    { date_start: "2026-11-01", spend: "49.90", impressions: "3000", clicks: "30" },
    { date_start: "lixo", spend: "999" }, null,
  ]);
  assert.equal(r.gasto, 100); assert.equal(r.impressoes, 4000); assert.equal(r.cliques, 50);
  assert.equal(r.cpc, 2); assert.equal(r.ctr, 1.25);
  assert.deepEqual(r.porDia.map((d) => d.data), ["2026-11-01", "2026-11-02"]);
  assert.deepEqual(resumirInsights([]).porDia, []);
});
