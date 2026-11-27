/** Ritmo do disparo, nova tentativa, pausa, rotina automática e saudação sem nome. */
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { novaTentativa, tipoDeFalha, lerPorHora, somarNaHora, POR_HORA_PADRAO } from "../../server/emailRitmo.js";
import { registerEmailCampaignRoutes, renderVars } from "../../server/emailCampaigns.js";
import { criarFakeDb } from "../agendamento/fakeDb.js";

const T = "11111111-1111-4111-8111-111111111111", C = "77777777-7777-4777-8777-777777777777";

test("falha: só volta para a fila o que com certeza não saiu", () => {
  const erro = (message: string, extra: object = {}) => Object.assign(new Error(message), extra);
  assert.equal(tipoDeFalha(erro("451 4.3.0 temporary failure", { responseCode: 451 })), "temporaria");
  assert.equal(tipoDeFalha(erro("550 Domain empresa.com has exceeded the max emails per hour (200/200) allowed", { responseCode: 550 })), "limite");
  assert.equal(tipoDeFalha(erro("Connection timeout", { code: "ETIMEDOUT" })), "temporaria");
  assert.equal(tipoDeFalha(erro("connect ECONNREFUSED 10.0.0.1:465", { code: "ESOCKET" })), "temporaria");
  assert.equal(tipoDeFalha(erro("Timeout", { code: "ETIMEDOUT", command: "CONN" })), "definitiva"); // pode ter saído
  assert.equal(tipoDeFalha(erro("550 5.1.1 User unknown", { responseCode: 550 })), "definitiva");
  assert.equal(tipoDeFalha(erro("Invalid login: 535 Authentication failed", { responseCode: 535 })), "definitiva");
});

test("nova tentativa: espera crescente e desiste depois do máximo", () => {
  const e = Object.assign(new Error("451 try later"), { responseCode: 451 });
  const um = novaTentativa(e, null, 0)!;
  assert.equal(um.depois, new Date(5 * 60_000).toISOString());
  const dois = novaTentativa(e, um.texto, 0)!;
  assert.equal(dois.depois, new Date(30 * 60_000).toISOString());
  assert.equal(novaTentativa(e, dois.texto, 0), null);
});

test("ritmo por hora: valor padrão, limites e reenvios recentes", () => {
  assert.equal(lerPorHora(undefined), POR_HORA_PADRAO);
  assert.equal(lerPorHora("0"), POR_HORA_PADRAO);
  assert.equal(lerPorHora("50"), 50);
  assert.equal(lerPorHora(999999), 5000);
  const agora = Date.parse("2026-11-27T12:00:00Z");
  assert.equal(somarNaHora([{ reenvios: [{ quando: "2026-11-27T11:30:00Z", qtd: 9, naHora: 3 }, { quando: "2026-11-27T09:00:00Z", naHora: 7 }] }], agora), 3);
});

test("saudação sem nome não fica com vírgula solta; com nome não muda", () => {
  assert.equal(renderVars("Olá, {{nome}}!", {}), "Olá!");
  assert.equal(renderVars("Oi {{primeiro_nome}}, tudo bem?", {}), "Oi, tudo bem?");
  assert.equal(renderVars("{{nome}}, veja isto", {}), "veja isto");
  assert.equal(renderVars("<p>*|FNAME|*, veja</p>", { name: "" }), "<p>veja</p>");
  assert.equal(renderVars("Olá, {{nome}}!", { name: "Ana Souza" }), "Olá, Ana Souza!");
});

function montar(seed: Record<string, any[]>) {
  const db = criarFakeDb({ tenants: [{ id: T, name: "E", modules: { marketing: true } }], users: [{ id: "u1", is_master: false, is_tenant_admin: true, tenant_id: T }], ...seed });
  const app = express(); app.use(express.json());
  const passa = (_q: any, _s: any, n: any) => n();
  registerEmailCampaignRoutes(app as any, { requireUser: (q: any, _s: any, n: any) => { q.user = { id: "u1" }; n(); }, resolveRequestedTenantId: async () => T, limiter: passa, supabaseService: db });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as any).port}/api/email-campaigns`;
  const pedir = (metodo: string, caminho: string, headers: Record<string, string> = {}) => fetch(`${base}/${caminho}`, { method: metodo, headers });
  return { db, srv, pedir };
}
const campanha = (extra: object = {}) => ({ id: C, tenant_id: T, name: "Aviso", subject: "Oi", body: "Texto", status: "sending", audience: {}, total: 2, sent: 0, failed: 0, ...extra });
const dest = (id: string, extra: object = {}) => ({ id, campaign_id: C, tenant_id: T, email: `${id}@x.com`, status: "pending", claimed_at: null, sent_at: null, ...extra });
const smtp = (porHora: string) => ({ tenant_id: T, key: "integracoes_smtp", value: { smtpServer: "s", smtpUser: "u", smtpPass: "p", fromEmail: "a@b.com", porHora } });

test("quem espera nova tentativa não é pego antes da hora e o navegador é avisado", async () => {
  const futuro = new Date(Date.now() + 3600_000).toISOString();
  const { db, srv, pedir } = montar({ email_campaigns: [campanha()], email_campaign_recipients: [dest("a", { claimed_at: futuro })], email_optouts: [], app_settings: [] });
  try {
    const r = await (await pedir("POST", `${C}/send-batch`)).json();
    assert.equal(r.aguardando, true); assert.equal(r.done, false);
    assert.equal(db.t.email_campaign_recipients[0].status, "pending");
  } finally { srv.close(); }
});

test("ritmo da hora atingido: nada sai e a resposta diz o motivo", async () => {
  const { db, srv, pedir } = montar({ email_campaigns: [campanha()], email_campaign_recipients: [dest("a", { status: "sent", sent_at: new Date().toISOString() }), dest("b")], email_optouts: [], app_settings: [smtp("1")] });
  try {
    const r = await (await pedir("POST", `${C}/send-batch`)).json();
    assert.equal(r.cota.porHora, 1);
    assert.equal(db.t.email_campaign_recipients[1].status, "pending");
  } finally { srv.close(); }
});

test("pausar vale para a rotina automática; pedir o envio de novo retoma", async () => {
  const segredo = "a".repeat(64);
  const { db, srv, pedir } = montar({ email_campaigns: [campanha()], email_campaign_recipients: [dest("a", { claimed_at: new Date(Date.now() + 3600_000).toISOString() })], email_optouts: [], app_settings: [], cron_segredos: [{ nome: "email_continuar", segredo }], email_sequences: [] });
  const antes = process.env.CRON_SECRET; delete process.env.CRON_SECRET;
  try {
    assert.equal((await pedir("POST", `${C}/pausar`)).status, 200);
    assert.equal(db.t.email_campaigns[0].audience.pausada, true);
    assert.equal((await pedir("GET", "cron/continuar")).status, 401);
    assert.equal((await pedir("GET", "cron/continuar", { Authorization: `Bearer ${"b".repeat(64)}` })).status, 401);
    const r = await pedir("GET", "cron/continuar", { Authorization: `Bearer ${segredo}` });
    assert.equal(r.status, 200); assert.equal((await r.json()).campanhas, 0);
    await pedir("POST", `${C}/send-batch`);
    assert.equal(db.t.email_campaigns[0].audience.pausada, undefined);
  } finally { if (antes !== undefined) process.env.CRON_SECRET = antes; srv.close(); }
});
