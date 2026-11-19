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

import { normalizarConteudoLP, CONTEUDO_LP_PADRAO } from "../../src/lib/paginaLP.js";
test("landing page própria: conteúdo seguro (cor, imagem https, limites) e padrões quando vem vazio", () => {
  const c = normalizarConteudoLP({ titulo: "  Oferta  ", cor: "javascript:x", imagem: "http://inseguro.com/a.png", bullets: ["a", "", "b"], cta: "" });
  assert.equal(c.titulo, "Oferta"); assert.equal(c.cor, CONTEUDO_LP_PADRAO.cor); assert.equal(c.imagem, ""); assert.deepEqual(c.bullets, ["a", "b"]); assert.equal(c.cta, CONTEUDO_LP_PADRAO.cta);
  assert.ok(c.campos.length >= 2);
  assert.equal(normalizarConteudoLP({ imagem: "https://x.com/a.png", cor: "#aabbcc" }).imagem, "https://x.com/a.png");
  assert.equal(normalizarConteudoLP(null).titulo, CONTEUDO_LP_PADRAO.titulo);
});

test("landing page própria: só abre se estiver publicada, conta visita 1x, cria lead e conta a conversão", async () => {
  const id = "55555555-5555-4555-8555-555555555555", rascunho = "66666666-6666-4666-8666-666666666666";
  const db = criarFakeDb({ tenants: [{ id: T, name: "Empresa X" }], marketing_landing_pages: [
    { id, tenant_id: T, name: "LP Oferta", status: "published", hospedada: true, views: 0, clicks: 0, conversions: 0, deleted_at: null, conteudo: { titulo: "Oferta", cor: "#112233" } },
    { id: rascunho, tenant_id: T, name: "LP Rascunho", status: "draft", hospedada: true, views: 0, clicks: 0, conversions: 0, deleted_at: null, conteudo: {} },
  ] });
  const { app, chamar } = criarFakeApp();
  registerMarketingPublicRoutes(app, { supabaseService: db as any, limiter: ((_a: any, _b: any, n: any) => n && n()) as any });
  const cfg = await chamar("GET", "/api/public/lp/:id", { params: { id }, query: { contar: "1" } });
  assert.equal(cfg.status, 200); assert.equal(cfg.corpo.titulo, "Oferta"); assert.equal(cfg.corpo.cor, "#112233");
  assert.equal(JSON.stringify(cfg.corpo).includes("tenant"), false);
  await chamar("GET", "/api/public/lp/:id", { params: { id }, query: {} }); // sem contar: não soma
  assert.equal(db.t.marketing_landing_pages[0].views, 1);
  assert.equal((await chamar("GET", "/api/public/lp/:id", { params: { id: rascunho }, query: {} })).status, 404);
  assert.equal((await chamar("POST", "/api/public/lp/:id/submit", { params: { id: rascunho }, body: { nome: "Ana Lima", telefone: "63988887777" } })).status, 404);
  assert.equal((await chamar("POST", "/api/public/lp/:id/submit", { params: { id }, body: { nome: "Ana Lima" } })).status, 400);
  const ok = await chamar("POST", "/api/public/lp/:id/submit", { params: { id }, body: { nome: "Ana Lima", telefone: "63988887777", mensagem: "oi" } });
  assert.equal(ok.status, 200);
  assert.equal(db.t.marketing_landing_pages[0].conversions, 1);
  assert.equal(db.t.leads.length, 1); assert.match(db.t.leads[0].source, /LP Oferta/);
});

import { telefoneE164, credencialDeSms, montarRequisicaoSms, enviarSmsParaLeads } from "../../server/sms.js";
import { parseAgendamento } from "../../server/emailCampaigns.js";

test("SMS: telefone vira formato internacional e credenciais vêm do cadastro (Twilio antes de Zenvia)", () => {
  assert.equal(telefoneE164("(63) 99999-0000"), "+5563999990000");
  assert.equal(telefoneE164("+55 63 3222-1000"), "+556332221000");
  assert.equal(telefoneE164("123"), ""); assert.equal(telefoneE164("+1 415 555 0100"), "");
  assert.equal(credencialDeSms({}), null);
  assert.equal(credencialDeSms({ twilio: { accountSid: "AC1", authToken: "t" } }), null); // incompleto
  const tw = credencialDeSms({ twilio: { accountSid: "AC1", authToken: "t", fromNumber: "+5511999999999" }, zenvia: { apiToken: "z", sender: "x" } });
  assert.equal(tw?.provedor, "twilio");
  assert.equal(credencialDeSms({ zenvia: { apiToken: "z", sender: "Loja" } })?.provedor, "zenvia");
  const r = montarRequisicaoSms(tw!, "+5563999990000", "Oi!");
  assert.match(r.url, /api\.twilio\.com\/2010-04-01\/Accounts\/AC1\/Messages\.json$/);
  assert.match(String(r.init.body), /To=%2B5563999990000/);
  const z = montarRequisicaoSms({ provedor: "zenvia", apiToken: "z", from: "Loja" }, "+5563999990000", "Oi!");
  assert.equal(JSON.parse(String(z.init.body)).to, "5563999990000");
});

test("SMS: sem credencial cadastrada não envia nada e avisa; com credencial envia só para telefones válidos, sem repetir", async () => {
  const leads = [{ id: "a", tenant_id: T, name: "Ana Lima", phone: "(63) 99999-0001", deleted_at: null }, { id: "b", tenant_id: T, name: "Beto", phone: "63999990001", deleted_at: null }, { id: "c", tenant_id: T, name: "Cris", phone: "12", deleted_at: null }];
  const semCred = await enviarSmsParaLeads(criarFakeDb({ leads }) as any, T, ["a", "b", "c"], "Oi {{primeiro_nome}}");
  assert.equal(semCred.enviados, 0); assert.match(String(semCred.erro), /Twilio ou a Zenvia/);
  const db = criarFakeDb({ leads, app_settings: [{ tenant_id: T, key: "integracoes_catalogo", value: { twilio: { accountSid: "AC1", authToken: "t", fromNumber: "+5511999999999" } } }] });
  const corpos: string[] = [];
  const original = globalThis.fetch;
  (globalThis as any).fetch = async (_u: string, init: any) => { corpos.push(String(init.body)); return { ok: true } as any; };
  try {
    const r = await enviarSmsParaLeads(db as any, T, ["a", "b", "c"], "Oi {{primeiro_nome}}!");
    assert.equal(r.enviados, 1); assert.equal(r.semTelefone, 1); // a e b têm o mesmo número; c é inválido
    assert.match(decodeURIComponent(corpos[0].replace(/\+(?=[^%])/g, " ")), /Body=Oi Ana!/);
  } finally { (globalThis as any).fetch = original; }
});

test("e-mail agendado: data válida de hoje até 90 dias, em horário de Brasília", () => {
  const agora = new Date("2026-11-19T12:00:00Z");
  assert.deepEqual(parseAgendamento("", agora), { ok: true, quando: null });
  assert.deepEqual(parseAgendamento("2026-11-19", agora), { ok: true, quando: "2026-11-19T00:00:00-03:00" });
  assert.equal(parseAgendamento("2026-11-18", agora).ok, false);
  assert.equal(parseAgendamento("2027-03-01", agora).ok, false);
  assert.equal(parseAgendamento("amanhã", agora).ok, false);
  // 01h UTC ainda é "ontem" em Brasília
  assert.equal(parseAgendamento("2026-11-18", new Date("2026-11-19T01:00:00Z")).ok, true);
});

import { sanitizarUtm, canalDoLead } from "../../src/lib/canalAquisicao.js";
test("canal de aquisição: UTM só com chaves conhecidas, canais agrupados, e a origem do primeiro contato vence", async () => {
  assert.deepEqual(sanitizarUtm({ utm: { utm_source: "Facebook", utm_medium: "cpc", lixo: "x" }, gclid: "abc", pagina_origem: "LP X" }), { utm_source: "Facebook", utm_medium: "cpc", veio_do_google_ads: "sim", pagina_origem: "LP X" });
  assert.deepEqual(sanitizarUtm(null), {});
  assert.equal(canalDoLead({ source: "Formulário X", customFields: { utm_source: "ig" } }), "Meta");
  assert.equal(canalDoLead({ source: "Formulário X", customFields: { utm_source: "newsletter" } }), "E-mail");
  assert.equal(canalDoLead({ source: "Indicação", customFields: {} }), "Indicação");
  assert.equal(canalDoLead({ source: "", customFields: null }), "Orgânico");
  assert.equal(canalDoLead({ source: "x", customFields: { veio_do_google_ads: "sim" } }), "Google");

  const db = criarFakeDb({ marketing_forms: [{ id: "f9", tenant_id: T, name: "Contato", source: "form_contato", active: true }] });
  const { app, chamar } = criarFakeApp();
  registerMarketingPublicRoutes(app, { supabaseService: db as any, limiter: ((_a: any, _b: any, n: any) => n && n()) as any });
  const enviar = (corpo: any) => chamar("POST", "/api/public/forms/:formId/submit", { params: { formId: "f9" }, body: { name: "Ana Lima", phone: "63988887777", ...corpo } });
  await enviar({ utm: { utm_source: "facebook", utm_campaign: "black" } });
  assert.equal(db.t.leads[0].customFields.utm_source, "facebook");
  assert.equal(db.t.leads[0].customFields.pagina_origem, "Contato");
  db.t.leads[0].phone_digits = "63988887777"; // no banco real essa coluna é calculada sozinha
  await enviar({ utm: { utm_source: "google" } }); // a mesma pessoa volta por outro anúncio: mantém o primeiro contato
  assert.equal(db.t.leads.length, 1);
  assert.equal(db.t.leads[0].customFields.utm_source, "facebook");
});

import { normalizarCanal } from "../../src/lib/canalAquisicao.js";
test("canal: nomes de gasto e de UTM caem no mesmo canal", () => {
  for (const n of ["Facebook Ads", "facebook", "Instagram", "IG", "Meta Ads", "meta"]) assert.equal(normalizarCanal(n), "Meta", n);
  assert.equal(normalizarCanal("Google Ads"), "Google"); assert.equal(normalizarCanal("indicação"), "Indicação"); assert.equal(normalizarCanal(""), "");
});

test("duplicar campanha: devolve só nome, assunto e texto da campanha da própria empresa", async () => {
  const MINHA = "77777777-7777-4777-8777-777777777777", OUTRA = "88888888-8888-4888-8888-888888888888";
  const db = criarFakeDb({ email_campaigns: [{ id: MINHA, tenant_id: T, name: "Aviso", subject: "Oi {{primeiro_nome}}", body: "Texto", audience: { leads: true }, total: 10 }, { id: OUTRA, tenant_id: "99999999-9999-4999-8999-999999999999", name: "Alheia", subject: "x", body: "y" }] });
  const app = express();
  registerEmailCampaignRoutes(app as any, { requireUser: (_q: any, _s: any, n: any) => n(), resolveRequestedTenantId: async () => T, limiter: (_q: any, _s: any, n: any) => n(), supabaseService: db });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  try {
    const ok = await (await fetch(`${base}/api/email-campaigns/${MINHA}`)).json();
    assert.deepEqual(ok, { name: "Aviso", subject: "Oi {{primeiro_nome}}", body: "Texto" });
    assert.equal((await fetch(`${base}/api/email-campaigns/${OUTRA}`)).status, 404);
    assert.equal((await fetch(`${base}/api/email-campaigns/nao-e-uuid`)).status, 400);
  } finally { srv.close(); }
});

test("descadastrados: lista só da empresa, bloqueio manual valida o e-mail e não duplica", async () => {
  const OUTRA = "99999999-9999-4999-8999-999999999999";
  const db = criarFakeDb({ email_optouts: [{ tenant_id: T, email: "a@x.com", created_at: "2026-11-01T10:00:00Z" }, { tenant_id: OUTRA, email: "b@x.com", created_at: "2026-11-02T10:00:00Z" }], tenants: [{ id: T, modules: { marketing: true } }], users: [{ id: "u1", is_master: false, is_tenant_admin: true, tenant_id: T }] });
  const app = express(); app.use(express.json());
  registerEmailCampaignRoutes(app as any, { requireUser: (q: any, _s: any, n: any) => { q.user = { id: "u1" }; n(); }, resolveRequestedTenantId: async () => T, limiter: (_q: any, _s: any, n: any) => n(), supabaseService: db });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  try {
    const l = await (await fetch(`${base}/api/email-campaigns/descadastros`)).json();
    assert.deepEqual(l.itens.map((i: any) => i.email), ["a@x.com"]);
    const post = (email: string) => fetch(`${base}/api/email-campaigns/descadastros`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    assert.equal((await post("sem-arroba")).status, 400);
    assert.equal((await post("teste@example.com")).status, 400); // domínio reservado
    assert.equal((await post("Nova@Pessoa.com")).status, 200);
    assert.ok(db.t.email_optouts.some((o: any) => o.email === "nova@pessoa.com" && o.tenant_id === T));
  } finally { srv.close(); }
});

test("teste A/B de assunto: divide meio a meio e resume por variante", async () => {
  const { varianteDaPosicao, resumoAB } = await import("../../server/emailCampaigns.js");
  const v = Array.from({ length: 10 }, (_, i) => varianteDaPosicao(i));
  assert.equal(v.filter((x) => x === "a").length, 5);
  assert.equal(v.filter((x) => x === "b").length, 5);
  const r = resumoAB([
    { variant: "a", status: "sent", open_count: 1, click_count: 0 }, { variant: "a", status: "sent", open_count: 0 },
    { variant: "b", status: "sent", open_count: 2, click_count: 1 }, { variant: "b", status: "failed", open_count: 0 },
    { variant: null, status: "sent", open_count: 1 },
  ]);
  assert.deepEqual(r.a, { enviados: 2, abriram: 1, clicaram: 0 });
  assert.deepEqual(r.b, { enviados: 1, abriram: 1, clicaram: 1 });
});

test("reenvio: só quem recebeu e não abriu nem clicou, sem descadastrados", async () => {
  const { selecionarNaoAbriram } = await import("../../server/emailCampaigns.js");
  const r = selecionarNaoAbriram([
    { email: "a@x.com", status: "sent", open_count: 0, click_count: 0 },
    { email: "b@x.com", status: "sent", open_count: 1, click_count: 0 },
    { email: "c@x.com", status: "sent", open_count: 0, click_count: 2 },
    { email: "d@x.com", status: "failed", open_count: 0, click_count: 0 },
    { email: "e@x.com", status: "sent", open_count: 0, click_count: 0 },
  ], new Set(["e@x.com"]));
  assert.deepEqual(r.map((x) => x.email), ["a@x.com"]);
});

test("link UTM: normaliza, mantém parâmetros existentes e valida", async () => {
  const { montarLinkUtm } = await import("../../src/lib/linkUtm.js");
  const r = montarLinkUtm({ url: "spycrm.com.br/form/abc?x=1", source: "Instagram", medium: "Stories", campaign: "Black Friday 2026!", content: "" });
  assert.ok(r.ok);
  if (r.ok) {
    const u = new URL(r.link);
    assert.equal(u.searchParams.get("x"), "1");
    assert.equal(u.searchParams.get("utm_source"), "instagram");
    assert.equal(u.searchParams.get("utm_medium"), "stories");
    assert.equal(u.searchParams.get("utm_campaign"), "black_friday_2026");
    assert.equal(u.searchParams.has("utm_content"), false);
  }
  assert.equal(montarLinkUtm({ url: "", source: "x" }).ok, false);
  assert.equal(montarLinkUtm({ url: "https://site.com", source: "" }).ok, false);
  assert.equal(montarLinkUtm({ url: "https://localhost", source: "x" }).ok, false);
});

test("público por canal e campanha: filtra leads pela origem do primeiro contato", async () => {
  const { selectAudience } = await import("../../server/emailCampaigns.js");
  const leads = [
    { id: "1", email: "a@x.com", name: "A", source: "Site", status: "novo", customFields: { utm_source: "instagram", utm_campaign: "bf" } },
    { id: "2", email: "b@x.com", name: "B", source: "Site", status: "novo", customFields: { utm_source: "google", utm_campaign: "bf" } },
    { id: "3", email: "c@x.com", name: "C", source: "Indicação", status: "novo", customFields: null },
  ];
  const por = (aud: any) => selectAudience(leads, aud, new Set()).rows.map((r) => r.email);
  assert.deepEqual(por({ canais: ["Meta"] }), ["a@x.com"]);
  assert.deepEqual(por({ campanhas: ["bf"] }), ["a@x.com", "b@x.com"]);
  assert.deepEqual(por({ canais: ["Indicação"] }), ["c@x.com"]);
  assert.deepEqual(por({ canais: ["Meta"], campanhas: ["bf"] }), ["a@x.com"]);
  assert.equal(por({}).length, 3);
});

test("pré-visualização do e-mail: usa nome de exemplo, não envia nada e não deixa HTML solto do texto passar", async () => {
  const db = criarFakeDb({ tenants: [{ id: T, name: "Minha Empresa", modules: { marketing: true } }], users: [{ id: "u1", is_master: false, is_tenant_admin: true, tenant_id: T }] });
  const app = express(); app.use(express.json());
  registerEmailCampaignRoutes(app as any, { requireUser: (q: any, _s: any, n: any) => { q.user = { id: "u1" }; n(); }, resolveRequestedTenantId: async () => T, limiter: (_q: any, _s: any, n: any) => n(), supabaseService: db });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  try {
    const r = await (await fetch(`${base}/api/email-campaigns/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: "{{primeiro_nome}}, olá", body: "Oi {{nome}} <script>x</script>" }) })).json();
    assert.equal(r.subject, "Maria, olá");
    assert.ok(r.html.includes("Oi Maria da Silva"));
    assert.ok(!r.html.includes("<script>"));
    assert.ok(r.html.includes("Minha Empresa"));
  } finally { srv.close(); }
});

test("avisos do e-mail: pega assunto gritado, spam, links demais e dá dicas", async () => {
  const { avisosDoEmail } = await import("../../src/lib/avisosEmail.js");
  const ruim = avisosDoEmail("GANHE DINHEIRO AGORA!!!", "Oi");
  assert.ok(ruim.some((v) => v.nivel === "atencao" && /MAIÚSCULAS/.test(v.texto)));
  assert.ok(ruim.some((v) => /exclama/.test(v.texto)));
  assert.ok(ruim.some((v) => /Expressões/.test(v.texto)));
  assert.ok(ruim.some((v) => /curta/.test(v.texto)));
  const bom = avisosDoEmail("{{primeiro_nome}}, sua vaga está confirmada", "Olá {{primeiro_nome}}, o treino é sábado às 9h. Veja os detalhes em https://exemplo.com.br/treino e responda este e-mail se precisar.");
  assert.deepEqual(bom, []);
  assert.equal(avisosDoEmail("", "").length, 0);
});

test("planilha de engajamento: marca quem abriu/clicou e neutraliza fórmulas", async () => {
  const { csvEngajamento } = await import("../../src/lib/csvEngajamento.js");
  const csv = csvEngajamento([
    { email: "a@x.com", name: "Ana; \"A\"", status: "sent", open_count: 2, click_count: 1 },
    { email: "b@x.com", name: "=HYPERLINK(\"x\")", status: "failed", open_count: 0, click_count: 0 },
  ]);
  const l = csv.split("\r\n");
  assert.equal(l.length, 3);
  assert.ok(l[1].startsWith('a@x.com;"Ana; ""A""";Enviado;Sim;2;Sim;1'));
  assert.ok(l[2].includes("'=HYPERLINK"));
  assert.ok(l[2].includes(";Falhou;Não;0;Não;0"));
});

test("follow-up: só quem clicou, sem descadastrados", async () => {
  const { selecionarClicaram } = await import("../../server/emailCampaigns.js");
  const r = selecionarClicaram([
    { email: "a@x.com", status: "sent", click_count: 1 }, { email: "b@x.com", status: "sent", click_count: 0, open_count: 3 },
    { email: "c@x.com", status: "sent", click_count: 2 }, { email: "d@x.com", status: "failed", click_count: 1 },
  ], new Set(["c@x.com"]));
  assert.deepEqual(r.map((x) => x.email), ["a@x.com"]);
});

test("follow-up pela rota: cria campanha só com quem clicou e aceita assunto/texto novos", async () => {
  const CID = "11111111-1111-4111-8111-111111111111";
  const db = criarFakeDb({
    tenants: [{ id: T, name: "E", modules: { marketing: true } }], users: [{ id: "u1", is_master: false, is_tenant_admin: true, tenant_id: T }],
    email_campaigns: [{ id: CID, tenant_id: T, name: "Original", subject: "Antigo", body: "Texto antigo", status: "done" }],
    email_campaign_recipients: [
      { tenant_id: T, campaign_id: CID, email: "a@x.com", name: "A", status: "sent", click_count: 1, open_count: 1 },
      { tenant_id: T, campaign_id: CID, email: "b@x.com", name: "B", status: "sent", click_count: 0, open_count: 0 },
    ], email_optouts: [],
  });
  const app = express(); app.use(express.json());
  registerEmailCampaignRoutes(app as any, { requireUser: (q: any, _s: any, n: any) => { q.user = { id: "u1" }; n(); }, resolveRequestedTenantId: async () => T, limiter: (_q: any, _s: any, n: any) => n(), supabaseService: db });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  try {
    const r = await (await fetch(`${base}/api/email-campaigns/${CID}/reenviar-clicaram`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: "Novo assunto", body: "Texto novo" }) })).json();
    assert.equal(r.total, 1);
    const nova = db.t.email_campaigns.find((c: any) => c.id === r.id);
    assert.equal(nova.subject, "Novo assunto"); assert.equal(nova.body, "Texto novo"); assert.match(nova.name, /follow-up/);
    assert.deepEqual(db.t.email_campaign_recipients.filter((x: any) => x.campaign_id === r.id).map((x: any) => x.email), ["a@x.com"]);
  } finally { srv.close(); }
});
