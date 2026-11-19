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

import express from "express";
import { registerEmailCampaignRoutes, urlAbertura, urlClique, textToHtml as _t } from "../../server/emailCampaigns.js";

test("rastreio de e-mail: abertura e clique contam uma pessoa uma vez, só com assinatura válida, e o redirecionamento é seguro", async () => {
  process.env.EMAIL_OPTOUT_SECRET = "segredo-de-teste";
  const CAMP = "33333333-3333-4333-8333-333333333333", RID = "44444444-4444-4444-8444-444444444444";
  const db = criarFakeDb({
    email_campaigns: [{ id: CAMP, tenant_id: T, opened: 0, clicked: 0 }],
    email_campaign_recipients: [{ id: RID, campaign_id: CAMP, tenant_id: T, email: "a@b.com", status: "sent", opened_at: null, clicked_at: null, open_count: 0, click_count: 0 }],
  });
  const app = express();
  registerEmailCampaignRoutes(app as any, { requireUser: (_q: any, _s: any, n: any) => n(), resolveRequestedTenantId: async () => T, limiter: (_q: any, _s: any, n: any) => n(), supabaseService: db });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  try {
    const pixel = urlAbertura(base, RID);
    assert.equal((await fetch(pixel)).headers.get("content-type"), "image/gif");
    await fetch(pixel); // abre de novo: mesma pessoa
    await fetch(`${base}/api/email/o/${RID}.gif?s=assinatura-falsa`); // não conta
    assert.equal(db.t.email_campaigns[0].opened, 1);
    assert.equal(db.t.email_campaign_recipients[0].open_count, 2);

    const alvo = "https://exemplo.com/oferta?a=1&b=2";
    const r = await fetch(urlClique(base, RID, alvo), { redirect: "manual" });
    assert.equal(r.status, 302); assert.equal(r.headers.get("location"), alvo);
    assert.equal(db.t.email_campaigns[0].clicked, 1);
    // link forjado para outro destino ou com protocolo perigoso: recusado e não redireciona
    const forjado = urlClique(base, RID, alvo).replace(/u=[^&]+/, `u=${Buffer.from("https://malvado.com").toString("base64url")}`);
    assert.equal((await fetch(forjado, { redirect: "manual" })).status, 400);
    const js = `${base}/api/email/c/${RID}?u=${Buffer.from("javascript:alert(1)").toString("base64url")}&s=x`;
    assert.equal((await fetch(js, { redirect: "manual" })).status, 400);
  } finally { srv.close(); }
  // os links do corpo do e-mail passam pelo rastreio e o texto visível continua o mesmo
  const html = _t("veja https://x.com/a?b=1&c=2", "#000", (u) => `RASTREIO(${u})`);
  assert.ok(html.includes("RASTREIO(https://x.com/a?b=1&c=2)"));
  assert.ok(html.includes(">https://x.com/a?b=1&amp;c=2</a>"));
});

import { validarRespostas, normalizarCampos, CAMPOS_PADRAO } from "../../src/lib/formularioCampos.js";
test("formulário próprio: valida obrigatórios, tipos e opções; monta contato e nota com os títulos das perguntas", () => {
  const campos = normalizarCampos([...CAMPOS_PADRAO, { id: "interesse", label: "Interesse", tipo: "opcoes", obrigatorio: true, opcoes: ["Plano A", "Plano B"] }]);
  const ok = validarRespostas(campos, { nome: "Maria Silva", telefone: "(63) 99999-0000", email: "Maria@X.com", mensagem: "oi", interesse: "Plano B" });
  assert.equal(ok.ok, true);
  if (ok.ok === true) { assert.deepEqual(ok.contato, { nome: "Maria Silva", telefone: "63999990000", email: "maria@x.com" }); assert.match(ok.nota, /Interesse: Plano B/); assert.match(ok.nota, /Como podemos ajudar\?: oi/); }
  const falha = (r: any) => validarRespostas(campos, { nome: "Maria", telefone: "63999990000", interesse: "Plano A", ...r });
  assert.equal(falha({ nome: "" }).ok, false);
  assert.equal(falha({ telefone: "123" }).ok, false);
  assert.equal(falha({ email: "sem-arroba" }).ok, false);
  assert.equal(falha({ interesse: "Plano Z" }).ok, false); // opção que não existe
  assert.equal(falha({ interesse: "" }).ok, false); // obrigatório
  // campos inválidos do editor são descartados: sem título, tipo desconhecido, opções com menos de 2 itens
  const lim = normalizarCampos([{ id: "a", label: "", tipo: "texto" }, { id: "b", label: "B", tipo: "xx" }, { id: "c", label: "C", tipo: "opcoes", opcoes: ["só uma"] }, { id: "ok", label: "OK", tipo: "texto" }, { id: "ok", label: "OK2", tipo: "texto" }]);
  assert.deepEqual(lim.map((c) => c.id), ["ok", "ok_2"]);
});

test("formulário próprio: o servidor usa os campos do formulário e só aceita formulários hospedados na tela pública", async () => {
  const db = criarFakeDb({ tenants: [{ id: T, name: "Empresa X" }], marketing_forms: [
    { id: "h1", tenant_id: T, name: "Curso", source: "form_curso", active: true, hospedado: true, layout_mode: "passo_a_passo", campos: [{ id: "nome", label: "Seu nome", tipo: "texto", obrigatorio: true }, { id: "telefone", label: "WhatsApp", tipo: "telefone", obrigatorio: true }, { id: "turno", label: "Turno", tipo: "opcoes", obrigatorio: true, opcoes: ["Manhã", "Noite"] }] },
    { id: "ext", tenant_id: T, name: "Externo", source: "ext", active: true, hospedado: false },
  ] });
  const { app, chamar } = criarFakeApp();
  registerMarketingPublicRoutes(app, { supabaseService: db as any, limiter: ((_a: any, _b: any, n: any) => n && n()) as any });
  const cfg = await chamar("GET", "/api/public/forms/:formId/config", { params: { formId: "h1" } });
  assert.equal(cfg.status, 200); assert.equal(cfg.corpo.campos.length, 3); assert.equal(cfg.corpo.empresa, "Empresa X"); assert.equal(cfg.corpo.passoAPasso, true);
  assert.equal(JSON.stringify(cfg.corpo).includes("tenant"), false);
  assert.equal((await chamar("GET", "/api/public/forms/:formId/config", { params: { formId: "ext" } })).status, 404);
  assert.equal((await chamar("POST", "/api/public/forms/:formId/submit", { params: { formId: "h1" }, body: { nome: "Ana Lima", telefone: "63988887777", turno: "Tarde" } })).status, 400);
  const ok = await chamar("POST", "/api/public/forms/:formId/submit", { params: { formId: "h1" }, body: { nome: "Ana Lima", telefone: "63988887777", turno: "Noite" } });
  assert.equal(ok.status, 200);
  const l = db.t.leads[0]; assert.equal(l.source, "form_curso"); assert.match(l.notes, /Turno: Noite/);
});
