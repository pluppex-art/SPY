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
  await enviar({ id, tipo: "conversion", name: "x" }); // envio sem contato válido (busca, login…): não é conversão, não conta e não cria lead
  await enviar({ id: "lixo", tipo: "view" }); await enviar({ id, tipo: "hack" });
  const lp = db.t.marketing_landing_pages[0];
  assert.equal(lp.views, 2); assert.equal(lp.clicks, 1); assert.equal(lp.conversions, 1);
  assert.equal(lp.conversion_rate, 50);
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
  assert.deepEqual(parseAgendamento("2026-11-19", agora), { ok: true, quando: "2026-11-19T09:00:00-03:00" });
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

test("sequência de e-mails: valida passos, envia no prazo, avança, respeita descadastro/cota/pausa e fecha no fim", async () => {
  const { parsePassos, processarSequencias } = await import("../../server/emailSequences.js");
  assert.equal(parsePassos([]).ok, false);
  assert.equal(parsePassos([{ dias: 0, subject: "a", body: "" }]).ok, false);
  assert.equal(parsePassos([{ dias: 99, subject: "a", body: "b" }]).ok, false);
  assert.equal(parsePassos(Array.from({ length: 9 }, () => ({ dias: 1, subject: "a", body: "b" }))).ok, false);
  assert.equal(parsePassos([{ dias: 0, subject: "a", body: "b" }, { dias: 3, subject: "c", body: "d" }]).ok, true);

  const SEQ = "22222222-2222-4222-8222-222222222222", CAMP = "33333333-3333-4333-8333-333333333333";
  const agora = Date.parse("2026-11-20T12:00:00Z");
  const db = criarFakeDb({
    email_campaigns: [{ id: CAMP, tenant_id: T, name: "[Sequência] X", status: "done", total: 0, sent: 0, failed: 0 }],
    email_sequences: [{ id: SEQ, tenant_id: T, name: "X", status: "active", campaign_id: CAMP, steps: [{ dias: 0, subject: "Oi {{primeiro_nome}}", body: "Texto 1" }, { dias: 3, subject: "De novo", body: "Texto 2" }] }],
    email_sequence_enrollments: [
      { id: "e1", sequence_id: SEQ, tenant_id: T, email: "a@x.com", name: "Ana Souza", step_idx: 0, status: "active", falhas: 0, next_send_at: "2026-11-20T00:00:00Z" },
      { id: "e2", sequence_id: SEQ, tenant_id: T, email: "sai@x.com", name: "Sai", step_idx: 0, status: "active", falhas: 0, next_send_at: "2026-11-20T00:00:00Z" },
      { id: "e3", sequence_id: SEQ, tenant_id: T, email: "futuro@x.com", name: "F", step_idx: 0, status: "active", falhas: 0, next_send_at: "2026-11-25T00:00:00Z" },
    ],
    email_optouts: [{ tenant_id: T, email: "sai@x.com" }], email_campaign_recipients: [],
  });
  const enviados: any[] = [];
  const aj = { cotaRestante: async () => ({ restante: 10 }), tenantNameOf: async () => ({ name: "Empresa", color: null }), enviar: async (_d: any, _t: string, mail: any) => { enviados.push(mail); } };
  const r1 = await processarSequencias(db, "https://app.test", aj as any, { agora });
  assert.equal(r1.enviados, 1); assert.equal(r1.encerrados, 1);
  assert.equal(enviados[0].to, "a@x.com"); assert.equal(enviados[0].subject, "Oi Ana");
  assert.ok(enviados[0].html.includes("/api/email/o/")); // rastreio de abertura
  const e1 = db.t.email_sequence_enrollments.find((e: any) => e.id === "e1");
  assert.equal(e1.step_idx, 1); assert.equal(e1.status, "active"); assert.equal(e1.next_send_at, new Date(agora + 3 * 86400000).toISOString());
  assert.equal(db.t.email_sequence_enrollments.find((e: any) => e.id === "e2").status, "stopped");
  assert.equal(db.t.email_sequence_enrollments.find((e: any) => e.id === "e3").step_idx, 0);
  assert.equal(db.t.email_campaigns[0].sent, 1);
  // Ainda não chegou o dia do 2º e-mail
  assert.equal((await processarSequencias(db, "https://app.test", aj as any, { agora: agora + 86400000 })).enviados, 0);
  // Pausada não envia
  db.t.email_sequences[0].status = "paused";
  assert.equal((await processarSequencias(db, "https://app.test", aj as any, { agora: agora + 4 * 86400000 })).enviados, 0);
  db.t.email_sequences[0].status = "active";
  // Sem cota não envia
  assert.equal((await processarSequencias(db, "https://app.test", { ...aj, cotaRestante: async () => ({ restante: 0 }) } as any, { agora: agora + 4 * 86400000 })).semCota >= 1, true);
  // Dia do 2º e-mail: envia e conclui
  const r3 = await processarSequencias(db, "https://app.test", aj as any, { agora: agora + 4 * 86400000 + 7 * 3600000 }); // depois do adiamento por falta de cota
  assert.equal(r3.enviados >= 1, true);
  assert.equal(db.t.email_sequence_enrollments.find((e: any) => e.id === "e1").status, "done");
  assert.equal(enviados.at(-2)?.subject === "De novo" || enviados.at(-1)?.subject === "De novo", true);
});

test("sequência pela rota: cria com público, evita repetidos e exclui junto com o histórico", async () => {
  const db = criarFakeDb({
    tenants: [{ id: T, name: "E", modules: { marketing: true } }], users: [{ id: "u1", is_master: false, is_tenant_admin: true, tenant_id: T }],
    leads: [{ id: "l1", tenant_id: T, name: "Ana", email: "ana@x.com", status: "novo" }, { id: "l2", tenant_id: T, name: "Bia", email: "bia@x.com", status: "novo" }],
    email_optouts: [], email_campaigns: [], email_campaign_recipients: [], email_sequences: [], email_sequence_enrollments: [],
  });
  const app = express(); app.use(express.json());
  registerEmailCampaignRoutes(app as any, { requireUser: (q: any, _s: any, n: any) => { q.user = { id: "u1" }; n(); }, resolveRequestedTenantId: async () => T, limiter: (_q: any, _s: any, n: any) => n(), supabaseService: db });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  const post = (path: string, body: any) => fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    assert.equal((await post("/api/email-sequences", { name: "S", passos: [] })).status, 400);
    const c = await (await post("/api/email-sequences", { name: "Boas-vindas", passos: [{ dias: 0, subject: "Oi", body: "Texto" }, { dias: 2, subject: "Lembrete", body: "Texto 2" }], audience: { leads: true } })).json();
    assert.equal(c.entraram, 2);
    assert.equal(db.t.email_sequence_enrollments.length, 2);
    assert.equal(db.t.email_campaigns[0].name, "[Sequência] Boas-vindas");
    const i = await (await post(`/api/email-sequences/${c.id}/inscrever`, { audience: { leads: true } })).json();
    assert.equal(i.entraram, 0); assert.equal(i.jaEstavam, 2);
    const lista = await (await fetch(`${base}/api/email-sequences`)).json();
    assert.equal(lista.sequences[0].inscritos, 2); assert.equal(lista.sequences[0].ativos, 2);
    // a campanha interna da sequência não aparece na lista de campanhas
    assert.equal((await (await fetch(`${base}/api/email-campaigns`)).json()).campaigns.length, 0);
    const d = await fetch(`${base}/api/email-sequences/${c.id}`, { method: "DELETE" });
    assert.equal(d.status, 200);
    assert.equal(db.t.email_sequences.length, 0); assert.equal(db.t.email_campaigns.length, 0);
  } finally { srv.close(); }
});

test("entrada automática: só leads novos (depois de ligar) que combinam com os filtros, sem repetir nem descadastrados", async () => {
  const { inscreverAutomaticos } = await import("../../server/emailSequences.js");
  const SEQ = "44444444-4444-4444-8444-444444444444";
  const db = criarFakeDb({
    email_sequences: [
      { id: SEQ, tenant_id: T, name: "S", status: "active", steps: [{ dias: 1, subject: "a", body: "b" }], auto: { sources: [], statuses: [], canais: ["Meta"], desde: "2026-11-10T00:00:00.000Z" } },
      { id: "55555555-5555-4555-8555-555555555555", tenant_id: T, name: "Desligada", status: "active", steps: [{ dias: 0, subject: "a", body: "b" }], auto: null },
    ],
    leads: [
      { id: "1", tenant_id: T, name: "Velho", email: "velho@x.com", created_at: "2026-11-01T00:00:00Z", customFields: { utm_source: "instagram" } },
      { id: "2", tenant_id: T, name: "Novo Meta", email: "meta@x.com", created_at: "2026-11-12T00:00:00Z", customFields: { utm_source: "instagram" } },
      { id: "3", tenant_id: T, name: "Novo Google", email: "g@x.com", created_at: "2026-11-12T00:00:00Z", customFields: { utm_source: "google" } },
      { id: "4", tenant_id: T, name: "Saiu", email: "saiu@x.com", created_at: "2026-11-12T00:00:00Z", customFields: { utm_source: "facebook" } },
    ],
    email_optouts: [{ tenant_id: T, email: "saiu@x.com" }], email_sequence_enrollments: [],
  });
  const agora = Date.parse("2026-11-15T12:00:00Z");
  const r = await inscreverAutomaticos(db, { agora });
  assert.equal(r.entraram, 1);
  assert.deepEqual(db.t.email_sequence_enrollments.map((e: any) => e.email), ["meta@x.com"]);
  assert.equal(db.t.email_sequence_enrollments[0].next_send_at, new Date(agora + 86400000).toISOString());
  assert.equal((await inscreverAutomaticos(db, { agora })).entraram, 0); // não repete
});

test("sequência com 'parar ao clicar': quem clicou sai, quem não clicou segue", async () => {
  const { processarSequencias } = await import("../../server/emailSequences.js");
  const SEQ = "66666666-6666-4666-8666-666666666666", CAMP = "77777777-7777-4777-8777-777777777777";
  const agora = Date.parse("2026-11-20T12:00:00Z");
  const db = criarFakeDb({
    email_campaigns: [{ id: CAMP, tenant_id: T, name: "[Sequência] Y", status: "done", total: 2, sent: 2, failed: 0 }],
    email_sequences: [{ id: SEQ, tenant_id: T, name: "Y", status: "active", campaign_id: CAMP, parar_ao_clicar: true, steps: [{ dias: 0, subject: "1", body: "a" }, { dias: 1, subject: "2", body: "b" }] }],
    email_sequence_enrollments: ["clicou", "ignorou"].map((n, i) => ({ id: `p${i}`, sequence_id: SEQ, tenant_id: T, email: `${n}@x.com`, name: n, step_idx: 1, status: "active", falhas: 0, next_send_at: "2026-11-20T00:00:00Z" })),
    email_campaign_recipients: [{ campaign_id: CAMP, tenant_id: T, email: "clicou@x.com", status: "sent", click_count: 1 }, { campaign_id: CAMP, tenant_id: T, email: "ignorou@x.com", status: "sent", click_count: 0 }],
    email_optouts: [],
  });
  const enviados: string[] = [];
  const aj = { cotaRestante: async () => ({ restante: 10 }), tenantNameOf: async () => ({ name: "E", color: null }), enviar: async (_d: any, _t: string, m: any) => { enviados.push(m.to); } };
  await processarSequencias(db, "https://app.test", aj as any, { agora });
  assert.deepEqual(enviados, ["ignorou@x.com"]);
  assert.equal(db.t.email_sequence_enrollments.find((e: any) => e.email === "clicou@x.com").status, "stopped");
  assert.equal(db.t.email_sequence_enrollments.find((e: any) => e.email === "ignorou@x.com").status, "done");
});

test("sequência: editar troca nome e e-mails e valida", async () => {
  const SEQ = "88888888-8888-4888-8888-888888888888", CAMP = "99999999-9999-4999-8999-999999999991";
  const db = criarFakeDb({
    tenants: [{ id: T, name: "E", modules: { marketing: true } }], users: [{ id: "u1", is_master: false, is_tenant_admin: true, tenant_id: T }],
    email_campaigns: [{ id: CAMP, tenant_id: T, name: "[Sequência] Velha" }],
    email_sequences: [{ id: SEQ, tenant_id: T, name: "Velha", status: "active", campaign_id: CAMP, steps: [{ dias: 0, subject: "a", body: "b" }] }],
  });
  const app = express(); app.use(express.json());
  registerEmailCampaignRoutes(app as any, { requireUser: (q: any, _s: any, n: any) => { q.user = { id: "u1" }; n(); }, resolveRequestedTenantId: async () => T, limiter: (_q: any, _s: any, n: any) => n(), supabaseService: db });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  const post = (body: any) => fetch(`${base}/api/email-sequences/${SEQ}/editar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    assert.equal((await post({ name: "Nova", passos: [] })).status, 400);
    assert.equal((await post({ name: "", passos: [{ dias: 0, subject: "a", body: "b" }] })).status, 400);
    assert.equal((await post({ name: "Nova", passos: [{ dias: 0, subject: "x", body: "y" }, { dias: 5, subject: "z", body: "w" }] })).status, 200);
    assert.equal(db.t.email_sequences[0].name, "Nova"); assert.equal(db.t.email_sequences[0].steps.length, 2);
    assert.equal(db.t.email_campaigns[0].name, "[Sequência] Nova");
  } finally { srv.close(); }
});

test("sequência: duas rodadas ao mesmo tempo não mandam o mesmo e-mail duas vezes", async () => {
  const { processarSequencias } = await import("../../server/emailSequences.js");
  const SEQ = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", CAMP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const db = criarFakeDb({
    email_campaigns: [{ id: CAMP, tenant_id: T, name: "[Sequência] Z", status: "done", total: 0, sent: 0, failed: 0 }],
    email_sequences: [{ id: SEQ, tenant_id: T, name: "Z", status: "active", campaign_id: CAMP, steps: [{ dias: 0, subject: "1", body: "a" }, { dias: 2, subject: "2", body: "b" }] }],
    email_sequence_enrollments: [{ id: "z1", sequence_id: SEQ, tenant_id: T, email: "z@x.com", name: "Z", step_idx: 0, status: "active", falhas: 0, next_send_at: "2026-11-20T00:00:00Z" }],
    email_campaign_recipients: [], email_optouts: [],
  });
  const enviados: string[] = [];
  const aj = { cotaRestante: async () => ({ restante: 10 }), tenantNameOf: async () => ({ name: "E", color: null }), enviar: async (_d: any, _t: string, m: any) => { await new Promise((r) => setTimeout(r, 20)); enviados.push(m.to); } };
  const agora = Date.parse("2026-11-20T12:00:00Z");
  await Promise.all([processarSequencias(db, "https://a.test", aj as any, { agora }), processarSequencias(db, "https://a.test", aj as any, { agora })]);
  assert.deepEqual(enviados, ["z@x.com"]);
});

test("leituras grandes: lista de descadastrados passa de 1000 linhas (paginada)", async () => {
  const db = criarFakeDb({
    tenants: [{ id: T, modules: { marketing: true } }], users: [{ id: "u1", is_master: false, is_tenant_admin: true, tenant_id: T }],
    email_optouts: Array.from({ length: 2300 }, (_, i) => ({ tenant_id: T, email: `p${i}@x.com`, created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() })),
  });
  const app = express(); app.use(express.json());
  registerEmailCampaignRoutes(app as any, { requireUser: (q: any, _s: any, n: any) => { q.user = { id: "u1" }; n(); }, resolveRequestedTenantId: async () => T, limiter: (_q: any, _s: any, n: any) => n(), supabaseService: db });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  try { const l = await (await fetch(`${base}/api/email-campaigns/descadastros`)).json(); assert.equal(l.itens.length, 2300); assert.equal(l.itens[0].email, "p2299@x.com"); }
  finally { srv.close(); }
});

test("resumo de e-mail: taxas, ranking com mínimo de envios e rótulo de sequência", async () => {
  const { resumirEmail } = await import("../../src/lib/resumoEmail.js");
  const r = resumirEmail([
    { id: "a", name: "Black Friday", sent: 100, opened: 40, clicked: 10 },
    { id: "b", name: "[Sequência] Boas-vindas", sent: 50, opened: 30, clicked: 20 },
    { id: "c", name: "Teste pequeno", sent: 5, opened: 5, clicked: 5 },
    { id: "d", name: "Sem envio", sent: 0 },
  ]);
  assert.equal(r.campanhas, 3); assert.equal(r.enviados, 155);
  assert.equal(r.taxaAbertura, 48.4); assert.equal(r.taxaClique, 22.6);
  assert.deepEqual(r.melhores.map((m) => m.name), ["Sequência: Boas-vindas", "Black Friday"]);
  assert.equal(resumirEmail([]).taxaAbertura, null);
});

test("rastreio de e-mail: clique logo após o envio (antivírus) não conta, clique depois conta; o redirecionamento sempre funciona", async () => {
  process.env.EMAIL_OPTOUT_SECRET = "segredo-de-teste";
  const CAMP = "33333333-3333-4333-8333-333333333333", RAPIDO = "44444444-4444-4444-8444-444444444441", NORMAL = "44444444-4444-4444-8444-444444444442";
  const base0 = { campaign_id: CAMP, tenant_id: T, status: "sent", opened_at: null, clicked_at: null, open_count: 0, click_count: 0 };
  const db = criarFakeDb({
    email_campaigns: [{ id: CAMP, tenant_id: T, opened: 0, clicked: 0 }],
    email_campaign_recipients: [{ ...base0, id: RAPIDO, email: "a@b.com", sent_at: new Date().toISOString() }, { ...base0, id: NORMAL, email: "c@d.com", sent_at: new Date(Date.now() - 60_000).toISOString() }],
  });
  const app = express();
  registerEmailCampaignRoutes(app as any, { requireUser: (_q: any, _s: any, n: any) => n(), resolveRequestedTenantId: async () => T, limiter: (_q: any, _s: any, n: any) => n(), supabaseService: db });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  try {
    const alvo = "https://exemplo.com/x";
    const r1 = await fetch(urlClique(base, RAPIDO, alvo), { redirect: "manual" });
    assert.equal(r1.status, 302); assert.equal(r1.headers.get("location"), alvo);
    assert.equal(db.t.email_campaign_recipients.find((r: any) => r.id === RAPIDO).click_count, 0);
    assert.equal((await fetch(urlClique(base, NORMAL, alvo), { redirect: "manual" })).status, 302);
    assert.equal(db.t.email_campaign_recipients.find((r: any) => r.id === NORMAL).click_count, 1);
    assert.equal(db.t.email_campaigns[0].clicked, 1);
  } finally { srv.close(); }
});

test("endereço inexistente: reconhece caixa que não existe e não confunde com spam, limite ou erro temporário", async () => {
  const { ehEnderecoInexistente, bloquearEnderecoInexistente } = await import("../../server/emailCampaigns.js");
  for (const m of ["550 5.1.1 The email account that you tried to reach does not exist", "550 User unknown", "553 5.1.2 Recipient address rejected", "Mailbox not found", "550 No such user here"]) assert.equal(ehEnderecoInexistente(m), true, m);
  for (const m of ["553 5.1.8 Domain of sender address does not exist", "550 sender address rejected: not owned by user", "550 From address does not exist"]) assert.equal(ehEnderecoInexistente(m), false, m); // culpa do remetente, não do destinatário
  for (const m of ["550 5.7.1 Message blocked as spam", "421 4.7.0 Try again later", "452 4.2.2 Mailbox full quota exceeded", "Connection timeout", "550 5.7.1 Rejected by policy: user not allowed", "rate limit exceeded", ""]) assert.equal(ehEnderecoInexistente(m), false, m);
  const db = criarFakeDb({ email_optouts: [] });
  await bloquearEnderecoInexistente(db, T, "x@y.com"); await bloquearEnderecoInexistente(db, T, "x@y.com");
  assert.equal(db.t.email_optouts.length, 1); assert.equal(db.t.email_optouts[0].motivo, "invalido");
});

test("sequência: caixa inexistente para a pessoa na hora e bloqueia o endereço", async () => {
  const { processarSequencias } = await import("../../server/emailSequences.js");
  const SEQ = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", CAMP = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const db = criarFakeDb({
    email_campaigns: [{ id: CAMP, tenant_id: T, name: "[Sequência] Q", status: "done", total: 0, sent: 0, failed: 0 }],
    email_sequences: [{ id: SEQ, tenant_id: T, name: "Q", status: "active", campaign_id: CAMP, steps: [{ dias: 0, subject: "1", body: "a" }] }],
    email_sequence_enrollments: [{ id: "q1", sequence_id: SEQ, tenant_id: T, email: "nao@existe.com", name: "N", step_idx: 0, status: "active", falhas: 0, next_send_at: "2026-11-20T00:00:00Z" }],
    email_campaign_recipients: [], email_optouts: [],
  });
  const aj = { cotaRestante: async () => ({ restante: 10 }), tenantNameOf: async () => ({ name: "E", color: null }), enviar: async () => { throw new Error("550 5.1.1 User unknown"); } };
  const r = await processarSequencias(db, "https://a.test", aj as any, { agora: Date.parse("2026-11-20T12:00:00Z") });
  assert.equal(r.falhas, 1);
  assert.equal(db.t.email_sequence_enrollments[0].status, "stopped");
  assert.equal(db.t.email_optouts[0].email, "nao@existe.com");
});

test("formatação do e-mail: negrito, link com texto e botão; tudo escapado, rastreado e com versão em texto puro", async () => {
  const { textToHtml, textoSimples } = await import("../../server/emailCampaigns.js");
  const r = (u: string) => `R(${u})`;
  const html = textToHtml("Oi **você**!\n\nVeja [nosso site](https://x.com/a?b=1&c=2) ou https://y.com/z\n\n[[Quero saber mais|https://x.com/oferta]]", "#112233", r);
  assert.ok(html.includes("<strong>você</strong>"));
  assert.ok(html.includes('<a href="R(https://x.com/a?b=1&c=2)" style="color:#112233">nosso site</a>'));
  assert.ok(html.includes('<a href="R(https://y.com/z)" style="color:#112233">https://y.com/z</a>'));
  assert.ok(html.includes('href="R(https://x.com/oferta)"') && html.includes("background:#112233") && html.includes(">Quero saber mais</a>"));
  // tentativa de injeção: HTML e aspas viram texto; protocolo perigoso não vira link
  const mau = textToHtml('[[<img src=x onerror=1>|https://a.com/"onmouseover="x]] [clique](javascript:alert(1)) **<b>x</b>**', "#000");
  assert.ok(!mau.includes("<img") && !mau.includes('onmouseover="x"') && !mau.includes("javascript:alert(1)\""));
  assert.ok(!/href="javascript/i.test(mau));
  // não usa os marcadores internos como entrada
  assert.ok(!textToHtml("a\u00000\u0000b", "#000").includes("\u0000"));
  assert.equal(textoSimples("Oi **você** [site](https://x.com) [[Botão|https://y.com]]"), "Oi você site (https://x.com) Botão: https://y.com");
});

test("logo no e-mail: só endereço https de imagem aparece no topo; o resto é ignorado", async () => {
  const { buildMail, logoSegura } = await import("../../server/emailCampaigns.js");
  const base = { subject: "a", body: "Oi", tenantName: "Minha <Empresa>", unsubUrl: "#" };
  const com = buildMail({ ...base, tenantLogo: "https://cdn.exemplo.com/logo.png" });
  assert.ok(com.html.includes('<img src="https://cdn.exemplo.com/logo.png" alt="Minha &lt;Empresa&gt;"'));
  for (const ruim of ["data:image/png;base64,AAAA", "http://x.com/l.png", 'https://x.com/a"onerror="1', "", null, undefined, "javascript:alert(1)"]) {
    assert.equal(logoSegura(ruim), null, String(ruim));
    assert.ok(!buildMail({ ...base, tenantLogo: ruim as any }).html.includes('alt="Minha'), String(ruim));
  }
});

test("remetente e respostas: nome da empresa como remetente (endereço da plataforma intacto) e Reply-To só com e-mail válido", async () => {
  const { montarRemetente, emailDaEmpresa } = await import("../../server/mailer.js");
  assert.equal(montarRemetente("SPY <noreply@spycrm.com.br>", "Boliche do Zé"), '"Boliche do Zé" <noreply@spycrm.com.br>');
  assert.equal(montarRemetente("noreply@spycrm.com.br", "Boliche"), '"Boliche" <noreply@spycrm.com.br>');
  assert.equal(montarRemetente("SPY <noreply@spycrm.com.br>", ""), "SPY <noreply@spycrm.com.br>");
  assert.ok(!montarRemetente("a@b.com", 'Mau"\r\nBcc: x@y.com <z>').match(/[\r\n]/)); // sem quebra de linha (injeção de cabeçalho)
  const mk = (email: any) => criarFakeDb({ app_settings: [{ tenant_id: T, key: "empresa_dados", value: { email } }] });
  assert.equal(await emailDaEmpresa(mk("contato@empresa.com.br"), T), "contato@empresa.com.br");
  assert.equal(await emailDaEmpresa(mk("sem-arroba"), T), null);
  assert.equal(await emailDaEmpresa(mk('a@b.com>\r\nBcc: x@y.com'), T), null);
  assert.equal(await emailDaEmpresa(mk(undefined), T), null);
});

test("UTM automático nos links do e-mail: marca origem e campanha, respeita UTM já existente e vai dentro do link rastreado", async () => {
  const { comUtmEmail, buildMail } = await import("../../server/emailCampaigns.js");
  const { canalDoLead } = await import("../../src/lib/canalAquisicao.js");
  const u = new URL(comUtmEmail("https://site.com/oferta?x=1", "Black Friday 2026!"));
  assert.equal(u.searchParams.get("x"), "1"); assert.equal(u.searchParams.get("utm_source"), "email");
  assert.equal(u.searchParams.get("utm_medium"), "email"); assert.equal(u.searchParams.get("utm_campaign"), "black_friday_2026");
  assert.equal(comUtmEmail("https://site.com/?utm_source=instagram", "X"), "https://site.com/?utm_source=instagram");
  assert.equal(comUtmEmail("não é url", "X"), "não é url");
  assert.equal(new URL(comUtmEmail("https://a.com", "[Sequência] Boas-vindas")).searchParams.get("utm_campaign"), "sequencia_boas_vindas");
  assert.equal(canalDoLead({ customFields: { utm_source: "email" } }), "E-mail"); // cai no canal certo do painel
  // dentro do e-mail: sem rastreio o link já vem marcado; com rastreio o destino assinado é o marcado
  const sem = buildMail({ subject: "a", body: "veja [aqui](https://site.com/x)", tenantName: "E", unsubUrl: "#", utmCampanha: "Promo" });
  assert.ok(sem.html.includes("https://site.com/x?utm_source=email&amp;utm_medium=email&amp;utm_campaign=promo"));
  process.env.EMAIL_OPTOUT_SECRET = "segredo-de-teste";
  const com = buildMail({ subject: "a", body: "veja https://site.com/x", tenantName: "E", unsubUrl: "#", utmCampanha: "Promo", track: { base: "https://app.test", rid: "44444444-4444-4444-8444-444444444444" } });
  const u64 = com.html.match(/\/api\/email\/c\/[^?]+\?u=([^&"]+)/)?.[1] || "";
  assert.ok(Buffer.from(u64, "base64url").toString().includes("utm_campaign=promo"));
});

test("revisão: sequência pausada com muitos vencidos e empresa sem cota não travam a fila das outras", async () => {
  const { processarSequencias } = await import("../../server/emailSequences.js");
  const OUTRA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", S_PAUSA = "f1111111-1111-4111-8111-111111111111", S_SEM = "f2222222-2222-4222-8222-222222222222", S_OK = "f3333333-3333-4333-8333-333333333333";
  const C = (id: string, t: string) => ({ id, tenant_id: t, name: "[Sequência] x", status: "done", total: 0, sent: 0, failed: 0 });
  const passos = [{ dias: 0, subject: "a", body: "b" }];
  const mk = (sid: string, t: string, n: number, pref: string) => Array.from({ length: n }, (_, i) => ({ id: `${pref}${i}`, sequence_id: sid, tenant_id: t, email: `${pref}${i}@x.com`, name: "N", step_idx: 0, status: "active", falhas: 0, next_send_at: "2026-11-01T00:00:00Z" }));
  const db = criarFakeDb({
    email_campaigns: [C("c1", T), C("c2", T), C("c3", OUTRA)],
    email_sequences: [
      { id: S_PAUSA, tenant_id: T, name: "P", status: "paused", campaign_id: "c1", steps: passos },
      { id: S_SEM, tenant_id: T, name: "S", status: "active", campaign_id: "c2", steps: passos },
      { id: S_OK, tenant_id: OUTRA, name: "O", status: "active", campaign_id: "c3", steps: passos },
    ],
    email_sequence_enrollments: [...mk(S_PAUSA, T, 250, "p"), ...mk(S_SEM, T, 3, "s"), { ...mk(S_OK, OUTRA, 1, "o")[0], next_send_at: "2026-11-10T00:00:00Z" }],
    email_campaign_recipients: [], email_optouts: [],
  });
  const enviados: string[] = [];
  const aj = { cotaRestante: async (_d: any, t: string) => ({ restante: t === T ? 0 : 10 }), tenantNameOf: async () => ({ name: "E", color: null }), enviar: async (_d: any, _t: string, m: any) => { enviados.push(m.to); } };
  const r = await processarSequencias(db, "https://a.test", aj as any, { agora: Date.parse("2026-11-20T12:00:00Z") });
  assert.deepEqual(enviados, ["o0@x.com"]); // a outra empresa enviou, mesmo com 250 vencidos pausados e uma empresa sem cota à frente
  assert.equal(r.pausadas, 0);
  // quem está sem cota foi adiado (não fica na frente da fila amanhã)
  assert.ok(db.t.email_sequence_enrollments.filter((e: any) => e.id.startsWith("s")).every((e: any) => e.next_send_at > "2026-11-20T12:00:00Z"));
});

test("revisão: entrada automática lê além de 1000 leads, e nome do lead não vira botão/link", async () => {
  const { inscreverAutomaticos } = await import("../../server/emailSequences.js");
  const { renderVars, buildMail } = await import("../../server/emailCampaigns.js");
  const SEQ = "f4444444-4444-4444-8444-444444444444";
  const db = criarFakeDb({
    email_sequences: [{ id: SEQ, tenant_id: T, name: "A", status: "active", steps: [{ dias: 0, subject: "a", body: "b" }], auto: { sources: [], statuses: [], canais: [], desde: "2026-11-01T00:00:00.000Z" } }],
    leads: Array.from({ length: 1500 }, (_, i) => ({ id: `l${String(i).padStart(4, "0")}`, tenant_id: T, name: "L", email: `l${i}@x.com`, created_at: new Date(Date.UTC(2026, 10, 2, 0, 0, i)).toISOString() })),
    email_optouts: [], email_sequence_enrollments: [],
  });
  const r = await inscreverAutomaticos(db, { agora: Date.parse("2026-11-20T00:00:00Z") });
  assert.equal(r.entraram, 1500);
  // injeção pelo nome
  assert.equal(renderVars("Oi {{nome}} da {{empresa}}", { name: "[[Clique|https://evil.com]]", company: "[x](https://evil.com)" }), "Oi Clique| da x(");
  const html = buildMail({ subject: "a", body: "Oi {{nome}}", name: "[[Clique|https://evil.com]]", tenantName: "E", unsubUrl: "#" }).html;
  assert.ok(!html.includes("evil.com"));
  assert.ok(!/<a [^>]*>Clique/.test(html));
  // marcador interno nunca sobra no HTML, mesmo com link colado a botão
  const { textToHtml } = await import("../../server/emailCampaigns.js");
  assert.ok(!textToHtml("http://a.com[[B|http://b.com]]", "#000").includes("\u0000"));
});

test("revisão 2: formulário público não reabre lead perdido nem muda de etapa; contador com coluna nula; telefone; SMS só celular", async () => {
  const { upsertLead } = await import("../../server/leadUpsert.js");
  const db = criarFakeDb({
    leads: [{ id: "L1", tenant_id: T, name: "Cliente Real", email: "real@x.com", phone: "63999990000", phone_digits: "5563999990000", status: "Perdido", stageId: "vendas-5", pipelineId: "comercial", notes: "[]", customFields: {} }],
    funis: [],
  });
  const r = await upsertLead(db as any, T, { name: "Mau", email: "real@x.com", source: "Formulário: X", papel: "entrada", publico: true, nota: "texto livre" });
  assert.equal(r.criado, false);
  const l = db.t.leads[0];
  assert.equal(l.status, "Perdido"); assert.equal(l.stageId, "vendas-5"); // não reabriu nem mudou de etapa
  assert.equal(l.name, "Cliente Real");
  const { validarContatoPublico } = await import("../../server/marketingPublico.js");
  assert.equal(validarContatoPublico({ name: "Ana", phone: "(63) 99999-0000" }).ok, true);
  assert.equal(validarContatoPublico({ name: "Ana", phone: "5563999990000" }).ok, true);
  assert.equal(validarContatoPublico({ name: "Ana", phone: "123456789012" }).ok, false); // 12 dígitos sem 55
  const { enviarSmsParaLeads } = await import("../../server/sms.js");
  const sms = criarFakeDb({
    app_settings: [{ tenant_id: T, key: "integracoes_catalogo", value: { twilio: { accountSid: "AC1", authToken: "t", fromNumber: "+15550001" } } }],
    leads: [{ id: "a", tenant_id: T, name: "A", phone: "(63) 99999-0000" }, { id: "b", tenant_id: T, name: "B", phone: "(63) 3222-1000" }],
  });
  const orig = globalThis.fetch; let chamadas = 0;
  (globalThis as any).fetch = async () => { chamadas++; return { ok: true } as any; };
  try { const out = await enviarSmsParaLeads(sms as any, T, ["a", "b"], "Oi"); assert.equal(out.enviados, 1); assert.equal(out.semTelefone, 1); assert.equal(chamadas, 1); }
  finally { globalThis.fetch = orig; }
});

test("revisão 2: gatilho de e-mail/SMS só executa uma vez por vez (reserva atômica)", async () => {
  const { reservarExecucao } = await import("../../server/messageTriggers.js");
  const db = criarFakeDb({ tenant_message_triggers: [{ id: "g1", status: "aprovado", executado_em: null }, { id: "g2", status: "aprovado", executado_em: new Date(Date.now() - 3600_000).toISOString() }, { id: "g3", status: "executado", executado_em: null }] });
  assert.equal(await reservarExecucao(db, "g1"), true);
  assert.equal(await reservarExecucao(db, "g1"), false); // segundo clique logo em seguida
  assert.equal(await reservarExecucao(db, "g2"), true); // reserva antiga (função que caiu) pode ser retomada
  assert.equal(await reservarExecucao(db, "g3"), false); // já executado
});

test("Meta Ads: lista de campanhas (status, orçamento, resultado por objetivo, custo por resultado) e rota sem vazar o token", async () => {
  const { mesclarCampanhas, resultadoDaCampanha, registerMarketingAdsRoutes } = await import("../../server/marketingAds.js");
  // resultado depende do objetivo; o mesmo lead em dois tipos de ação não conta em dobro
  assert.deepEqual(resultadoDaCampanha("OUTCOME_LEADS", [{ action_type: "lead", value: "10" }, { action_type: "onsite_conversion.lead_grouped", value: "10" }], 0), { valor: 10, rotulo: "Cadastros" });
  assert.deepEqual(resultadoDaCampanha("OUTCOME_TRAFFIC", [{ action_type: "link_click", value: "50" }], 0), { valor: 50, rotulo: "Cliques no link" });
  assert.deepEqual(resultadoDaCampanha("OUTCOME_AWARENESS", [], 1234), { valor: 1234, rotulo: "Alcance" });
  assert.deepEqual(resultadoDaCampanha("OUTCOME_ENGAGEMENT", [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "7" }], 0), { valor: 7, rotulo: "Conversas iniciadas" });
  const lista = mesclarCampanhas(
    [{ id: "1", name: "Black Friday", effective_status: "ACTIVE", objective: "OUTCOME_LEADS", daily_budget: "5000" }, { id: "2", name: "Parada", effective_status: "PAUSED", objective: "OUTCOME_TRAFFIC", lifetime_budget: "100000", start_time: "2026-10-01T00:00:00-0300" }],
    [{ campaign_id: "1", spend: "250.5", impressions: "10000", reach: "8000", clicks: "300", ctr: "3", cpc: "0.835", cpm: "25.05", actions: [{ action_type: "lead", value: "25" }] }, { campaign_id: "9", campaign_name: "Antiga", spend: "10" }],
  );
  assert.deepEqual(lista.map((c) => c.nome), ["Black Friday", "Antiga", "Parada"]); // por gasto
  const bf = lista[0];
  assert.equal(bf.statusRotulo, "Ativa"); assert.deepEqual(bf.orcamento, { tipo: "diario", valor: 50 });
  assert.equal(bf.resultados, 25); assert.equal(bf.custoPorResultado, 10.02);
  assert.deepEqual(lista[2].orcamento, { tipo: "total", valor: 1000 }); assert.equal(lista[2].inicio, "2026-10-01"); assert.equal(lista[2].gasto, 0);
  // rota: usa as credenciais da empresa, manda o token só no cabeçalho e cacheia
  const db = criarFakeDb({ app_settings: [{ tenant_id: T, key: "integracoes_meta_ads", value: { accountId: "act_123", adsToken: "SEGREDO" } }] });
  const app = express();
  registerMarketingAdsRoutes(app as any, { requireUser: (q: any, _s: any, n: any) => { q.user = { id: "u1" }; n(); }, resolveRequestedTenantId: async () => T, supabaseService: db });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  const orig = globalThis.fetch; const chamadas: { url: string; auth: string }[] = [];
  (globalThis as any).fetch = async (u: any, init: any) => {
    const url = String(u);
    if (!url.startsWith("https://graph.facebook.com/")) return orig(u, init);
    chamadas.push({ url, auth: String(init?.headers?.Authorization || "") });
    const corpo = url.includes("/campaigns") ? { data: [{ id: "1", name: "C1", effective_status: "ACTIVE", objective: "OUTCOME_LEADS" }] }
      : url.includes("/insights") ? { data: [{ campaign_id: "1", spend: "10", impressions: "100", clicks: "5", actions: [{ action_type: "lead", value: "2" }] }] } : { currency: "BRL", name: "Conta X" };
    return { ok: true, json: async () => corpo } as any;
  };
  try {
    const r = await (await fetch(`${base}/api/marketing/meta-campanhas?dias=30`)).json();
    assert.equal(r.configurado, true); assert.equal(r.campanhas[0].resultados, 2); assert.equal(r.conta, "Conta X");
    assert.ok(chamadas.length >= 3 && chamadas.every((c) => c.auth === "Bearer SEGREDO" && !c.url.includes("SEGREDO")));
    assert.ok(chamadas.some((c) => c.url.includes("/act_123/")) && !chamadas.some((c) => c.url.includes("act_act_")));
    const antes = chamadas.length;
    await fetch(`${base}/api/marketing/meta-campanhas?dias=30`); // cache
    assert.equal(chamadas.length, antes);
  } finally { (globalThis as any).fetch = orig; srv.close(); }
  const semConta = criarFakeDb({ app_settings: [] });
  const app2 = express(); registerMarketingAdsRoutes(app2 as any, { requireUser: (q: any, _s: any, n: any) => n(), resolveRequestedTenantId: async () => T, supabaseService: semConta });
  const s2 = app2.listen(0);
  try { assert.deepEqual(await (await fetch(`http://127.0.0.1:${(s2.address() as any).port}/api/marketing/meta-campanhas`)).json(), { configurado: false }); } finally { s2.close(); }
});

test("Meta Ads: conjuntos e anúncios (nível, filtro por campanha, objetivo herdado, miniatura só https) e ids inválidos ignorados", async () => {
  const { mesclarCampanhas, registerMarketingAdsRoutes } = await import("../../server/marketingAds.js");
  const conj = mesclarCampanhas(
    [{ id: "10", name: "Conj A", effective_status: "ACTIVE", campaign_id: "1", campaign: { id: "1", name: "Camp", objective: "OUTCOME_LEADS" }, daily_budget: "2000", optimization_goal: "LEAD_GENERATION" }],
    [{ adset_id: "10", campaign_id: "1", spend: "40", impressions: "1000", clicks: "20", actions: [{ action_type: "lead", value: "4" }] }], "BRL", "adset");
  assert.equal(conj[0].resultados, 4); assert.equal(conj[0].custoPorResultado, 10); assert.equal(conj[0].campanhaNome, "Camp");
  assert.deepEqual(conj[0].orcamento, { tipo: "diario", valor: 20 }); assert.equal(conj[0].otimizacao, "LEAD_GENERATION");
  const ads = mesclarCampanhas(
    [{ id: "100", name: "Anúncio 1", effective_status: "PAUSED", campaign_id: "1", adset_id: "10", campaign: { objective: "OUTCOME_TRAFFIC" }, adset: { name: "Conj A" }, creative: { thumbnail_url: "https://cdn.fb/x.jpg" } },
     { id: "101", name: "Anúncio 2", creative: { thumbnail_url: "javascript:alert(1)" } }],
    [{ ad_id: "100", spend: "5", clicks: "50", actions: [{ action_type: "link_click", value: "45" }] }], "BRL", "ad");
  const a1 = ads.find((x) => x.id === "100")!, a2 = ads.find((x) => x.id === "101")!;
  assert.equal(a1.miniatura, "https://cdn.fb/x.jpg"); assert.equal(a2.miniatura, null);
  assert.equal(a1.resultados, 45); assert.equal(a1.conjuntoNome, "Conj A");
  // rota: nível e filtro vão para o Graph; id com lixo é ignorado
  const db = criarFakeDb({ app_settings: [{ tenant_id: T, key: "integracoes_meta_ads", value: { accountId: "123", adsToken: "TKN" } }] });
  const app = express();
  registerMarketingAdsRoutes(app as any, { requireUser: (q: any, _s: any, n: any) => n(), resolveRequestedTenantId: async () => T, supabaseService: db });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  const orig = globalThis.fetch; const urls: string[] = [];
  (globalThis as any).fetch = async (u: any, init: any) => { const url = String(u); if (!url.startsWith("https://graph.facebook.com/")) return orig(u, init); urls.push(decodeURIComponent(url)); return { ok: true, json: async () => ({ data: [], currency: "BRL" }) } as any; };
  try {
    await fetch(`${base}/api/marketing/meta-campanhas?nivel=adset&campanha=555&dias=7`);
    assert.ok(urls.some((u) => u.includes("/act_123/adsets?") && u.includes('"campaign.id"') && u.includes('"555"')));
    assert.ok(urls.some((u) => u.includes("/act_123/insights?level=adset") && u.includes("adset_name")));
    urls.length = 0;
    await fetch(`${base}/api/marketing/meta-campanhas?nivel=ad&campanha=${encodeURIComponent('1"];drop')}&conjunto=9&dias=14`);
    assert.ok(urls.some((u) => u.includes("/act_123/ads?") && u.includes('"adset.id"') && !u.includes("drop") && !u.includes("campaign.id")));
  } finally { (globalThis as any).fetch = orig; srv.close(); }
});

test("Meta Ads: detalhe de uma campanha (cabeçalho, totais, série diária) e proteção de conta/id", async () => {
  const { serieDiaria, registerMarketingAdsRoutes } = await import("../../server/marketingAds.js");
  const s = serieDiaria("OUTCOME_LEADS", [{ date_start: "2026-11-02", spend: "10", clicks: "4", impressions: "100", actions: [{ action_type: "lead", value: "1" }] }, { date_start: "2026-11-01", spend: "5", clicks: "1", impressions: "50" }, { date_start: "lixo", spend: "9" }]);
  assert.deepEqual(s.map((d) => [d.data, d.gasto, d.resultados]), [["2026-11-01", 5, 0], ["2026-11-02", 10, 1]]);
  const db = criarFakeDb({ app_settings: [{ tenant_id: T, key: "integracoes_meta_ads", value: { accountId: "123", adsToken: "TKN" } }] });
  const app = express();
  registerMarketingAdsRoutes(app as any, { requireUser: (q: any, _s: any, n: any) => n(), resolveRequestedTenantId: async () => T, supabaseService: db });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  const orig = globalThis.fetch; let contaDaCampanha = "123";
  (globalThis as any).fetch = async (u: any, init: any) => {
    const url = String(u); if (!url.startsWith("https://graph.facebook.com/")) return orig(u, init);
    let corpo: any = { currency: "BRL", name: "Conta" };
    if (/\/777\?fields=/.test(url)) corpo = { id: "777", name: "Camp 777", effective_status: "ACTIVE", objective: "OUTCOME_LEADS", daily_budget: "3000", account_id: contaDaCampanha, buying_type: "AUCTION", created_time: "2026-10-01T10:00:00-0300" };
    else if (url.includes("/777/insights") && url.includes("time_increment")) corpo = { data: [{ date_start: "2026-11-01", spend: "20", clicks: "10", actions: [{ action_type: "lead", value: "2" }] }] };
    else if (url.includes("/777/insights")) corpo = { data: [{ campaign_id: "777", spend: "20", impressions: "500", reach: "400", clicks: "10", ctr: "2", actions: [{ action_type: "lead", value: "2" }] }] };
    return { ok: true, json: async () => corpo } as any;
  };
  try {
    assert.equal((await fetch(`${base}/api/marketing/meta-campanhas/abc`)).status, 400);
    const r = await (await fetch(`${base}/api/marketing/meta-campanhas/777?dias=30`)).json();
    assert.equal(r.campanha.nome, "Camp 777"); assert.equal(r.campanha.resultados, 2); assert.equal(r.campanha.custoPorResultado, 10);
    assert.equal(r.campanha.compra, "AUCTION"); assert.equal(r.diario.length, 1); assert.equal(r.diario[0].resultados, 2);
    // campanha de OUTRA conta (mesmo que o token enxergue): não mostra
    contaDaCampanha = "999";
    const outra = await fetch(`${base}/api/marketing/meta-campanhas/777?dias=7`);
    assert.equal(outra.status, 404);
  } finally { (globalThis as any).fetch = orig; srv.close(); }
});

test("campanha ↔ lead: liga pelo ID ou pelo nome (UTM), ignorando acento/maiúscula, sem falso positivo", async () => {
  const { leadDaCampanha, slugCampanha } = await import("../../src/pages/marketing/campanhasComum.js");
  const c = { id: "120210", nome: "Black Friday 2026 | Leads" };
  assert.equal(slugCampanha("Black Friday 2026 | Leads"), "black_friday_2026_leads");
  assert.equal(leadDaCampanha({ customFields: { utm_campaign: "black_friday_2026_leads" } }, c), true);
  assert.equal(leadDaCampanha({ customFields: { utm_campaign: "Black Friday 2026 | Leads" } }, c), true);
  assert.equal(leadDaCampanha({ customFields: { utm_campaign: "120210" } }, c), true);
  assert.equal(leadDaCampanha({ customFields: { utm_campaign: "black_friday" } }, c), false);
  assert.equal(leadDaCampanha({ customFields: {} }, c), false);
  assert.equal(leadDaCampanha({ customFields: null }, c), false);
  assert.equal(leadDaCampanha({ customFields: { utm_campaign: "!!!" } }, { id: "1", nome: "???" }), false); // slugs vazios não casam
});

test("Meta Ads: teste de conexão traduz os erros e não grava nem vaza o token", async () => {
  const { explicarErroMeta, registerMarketingAdsRoutes } = await import("../../server/marketingAds.js");
  assert.match(explicarErroMeta({ error: { code: 190, message: "Error validating access token: Session has expired" } }), /expirou/);
  assert.match(explicarErroMeta({ error: { code: 200, message: "(#200) Requires ads_read permission" } }), /permissão/);
  assert.match(explicarErroMeta({ error: { code: 100, message: "Unsupported get request" } }), /Não encontrei essa conta/);
  assert.match(explicarErroMeta({ error: { code: 17, message: "User request limit reached" } }), /limitou/);
  const db = criarFakeDb({ app_settings: [{ tenant_id: T, key: "integracoes_meta_ads", value: { accountId: "111", adsToken: "SALVO" } }] });
  const app = express(); app.use(express.json());
  registerMarketingAdsRoutes(app as any, { requireUser: (_q: any, _s: any, n: any) => n(), resolveRequestedTenantId: async () => T, supabaseService: db });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  const orig = globalThis.fetch; const vistos: { url: string; auth: string }[] = [];
  (globalThis as any).fetch = async (u: any, init: any) => {
    const url = String(u); if (!url.startsWith("https://graph.facebook.com/")) return orig(u, init);
    vistos.push({ url, auth: String(init?.headers?.Authorization || "") });
    return url.includes("/act_999") ? ({ ok: false, json: async () => ({ error: { code: 190, message: "expired" } }) } as any) : ({ ok: true, json: async () => ({ name: "Minha Conta", currency: "BRL", account_status: 1 }) } as any);
  };
  const post = (b: any) => fetch(`${base}/api/marketing/meta-testar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
  try {
    assert.deepEqual(await post({ accountId: "act_555", adsToken: "DIGITADO" }), { ok: true, nome: "Minha Conta", moeda: "BRL", situacao: "ativa" });
    assert.ok(vistos[0].url.includes("/act_555?") && vistos[0].auth === "Bearer DIGITADO" && !vistos[0].url.includes("DIGITADO")); // usa o que foi digitado; token só no cabeçalho
    await post({}); assert.ok(vistos[1].url.includes("/act_111?") && vistos[1].auth === "Bearer SALVO"); // vazio: cai no salvo
    const ruim = await post({ accountId: "999", adsToken: "X" }); assert.equal(ruim.ok, false); assert.match(ruim.error, /expirou/);
    assert.equal((await post({ accountId: "", adsToken: "" }).then(() => 1)), 1);
    assert.equal(db.t.app_settings[0].value.adsToken, "SALVO"); // não grava nada
  } finally { (globalThis as any).fetch = orig; srv.close(); }
});

test("campanha: editar, reenviar na mesma campanha e excluir, só na própria empresa e fora do envio", async () => {
  const C = "77777777-7777-4777-8777-777777777777", SEQ = "66666666-6666-4666-8666-666666666666", OUTRA = "88888888-8888-4888-8888-888888888888";
  const agora = new Date().toISOString();
  const dest = (id: string, email: string, status: string, extra: any = {}) => ({ id, campaign_id: C, tenant_id: T, email, status, sent_at: status === "sent" ? agora : null, open_count: 0, click_count: 0, ...extra });
  const db = criarFakeDb({
    tenants: [{ id: T, modules: { marketing: true } }], users: [{ id: "u1", is_master: false, is_tenant_admin: true, tenant_id: T }],
    email_campaigns: [
      { id: C, tenant_id: T, name: "Aviso", subject: "Oi", subject_b: "Olá", body: "Texto", status: "done", audience: { leads: true }, total: 4, sent: 3, failed: 1 },
      { id: SEQ, tenant_id: T, name: "[Sequência] Boas-vindas", subject: "s", body: "b", status: "done" },
      { id: OUTRA, tenant_id: "99999999-9999-4999-8999-999999999999", name: "Alheia", subject: "x", body: "y", status: "done" },
    ],
    email_campaign_recipients: [dest("1", "a@x.com", "sent", { open_count: 1 }), dest("2", "b@x.com", "sent"), dest("3", "c@x.com", "failed", { error: "caixa cheia" }), dest("4", "saiu@x.com", "sent")],
    email_optouts: [{ tenant_id: T, email: "saiu@x.com" }],
  });
  const app = express(); app.use(express.json());
  registerEmailCampaignRoutes(app as any, { requireUser: (q: any, _s: any, n: any) => { q.user = { id: "u1" }; n(); }, resolveRequestedTenantId: async () => T, limiter: (_q: any, _s: any, n: any) => n(), supabaseService: db });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as any).port}/api/email-campaigns`;
  const pedir = (metodo: string, caminho: string, corpo?: unknown) => fetch(`${base}/${caminho}`, { method: metodo, headers: { "Content-Type": "application/json" }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
  try {
    for (const alvo of [OUTRA]) for (const [m, c] of [["PUT", alvo], ["DELETE", alvo], ["POST", `${alvo}/reenviar`]]) assert.equal((await pedir(m, c, { quem: "todos" })).status, 404, m);
    assert.equal((await pedir("DELETE", SEQ)).status, 409);

    assert.equal((await pedir("PUT", C, { name: "", subject: "x", body: "y" })).status, 400);
    assert.equal((await pedir("PUT", C, { name: "Novo nome", subject: "Oi", body: "<div>HTML</div>", subjectB: "Olá" })).status, 200);
    const camp = () => db.t.email_campaigns.find((x: any) => x.id === C)!;
    assert.deepEqual([camp().name, camp().body, camp().subject_b], ["Novo nome", "<div>HTML</div>", "Olá"]);

    assert.equal((await pedir("POST", `${C}/reenviar`, { quem: "alguem" })).status, 400);
    const r = await (await pedir("POST", `${C}/reenviar`, { quem: "selecionados", emails: ["B@x.com", "c@x.com", "saiu@x.com"], subject: "Assunto novo" })).json();
    assert.equal(r.requeued, 2);
    const situacao = () => db.t.email_campaign_recipients.map((x: any) => x.status);
    assert.deepEqual(situacao(), ["sent", "pending", "pending", "sent"]);
    assert.deepEqual([camp().status, camp().sent, camp().failed, camp().subject, camp().subject_b], ["sending", 2, 0, "Assunto novo", null]);
    assert.equal(camp().audience.reenvios[0].qtd, 1); // só quem já contava no limite de hoje
    assert.equal(camp().audience.leads, true);
    assert.equal(db.t.email_campaigns.length, 3); // nenhuma campanha nova

    // Enquanto envia, não edita nem reenvia.
    assert.equal((await pedir("PUT", C, { name: "n", subject: "s", body: "b" })).status, 409);
    assert.equal((await pedir("POST", `${C}/reenviar`, { quem: "todos" })).status, 409);

    assert.equal((await pedir("DELETE", C)).status, 200);
    assert.equal(camp().status, "deleted");
    assert.deepEqual(situacao(), ["sent", "skipped", "skipped", "sent"]);
    assert.equal((await pedir("GET", C)).status, 404);
    assert.equal((await pedir("POST", `${C}/send-batch`)).status, 404);
  } finally { srv.close(); }
});

test("contagem desligada: links originais e sem imagem invisível; o teste é a mesma mensagem do disparo", async () => {
  const { buildMail } = await import("../../server/emailCampaigns.js");
  const fonte = (await import("node:fs")).readFileSync("server/emailCampaigns.ts", "utf8");
  assert.match(fonte, /track: r\.id && !camp\.audience\?\.semRastreio \?/);
  assert.match(fonte, /\{ id: crypto\.randomUUID\(\), name: "Nome de Teste"/);
  const sem = buildMail({ subject: "a", body: '<div><a href="https://site.com/x">ir</a></div>', tenantName: "E", unsubUrl: "https://s.com/sair" });
  assert.match(sem.html, /href="https:\/\/site\.com\/x"/);
  assert.doesNotMatch(sem.html, /api\/email\/(c|o)\//);
});
