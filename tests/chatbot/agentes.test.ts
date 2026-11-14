import { test } from "node:test";
import assert from "node:assert/strict";
import { agentesDoCliente, agentesDoTenant } from "../../server/agentesDoCliente";
import { webhookPermitido, webhookDoChatbot, registrarWebhookDoChatbot, CHATBOT_WEBHOOK_PADRAO } from "../../server/chatbotWebhook";
import { registerChatbotSaveRoutes } from "../../server/chatbotSave";

test("lista de agentes: os 4 de sempre + chatbot só se o módulo foi contratado", () => {
  assert.deepEqual(agentesDoCliente({}), ["radar", "closer", "julia", "agente_secreto"]);
  assert.deepEqual(agentesDoCliente({ chatbot: false }), ["radar", "closer", "julia", "agente_secreto"]);
  assert.deepEqual(agentesDoCliente({ chatbot: true }), ["radar", "closer", "julia", "agente_secreto", "chatbot"]);
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { modules: { chatbot: true } } }) }) }) }) };
  return agentesDoTenant(db, "T").then((a) => assert.ok(a.includes("chatbot")));
});

test("endereço do chatbot do cliente: só https no servidor n8n do SPY", () => {
  const base = new URL(CHATBOT_WEBHOOK_PADRAO);
  assert.ok(webhookPermitido(`https://${base.hostname}/webhook/chatbot-luminar`));
  assert.equal(webhookPermitido(`http://${base.hostname}/webhook/x`), null);
  assert.equal(webhookPermitido("https://evil.example.com/webhook/x"), null);
  assert.equal(webhookPermitido(`https://user:pw@${base.hostname}/x`), null);
  assert.equal(webhookPermitido("não é url"), null);
});

function memDb() {
  const rows: any[] = [];
  const from = (name: string) => {
    const f: ((r: any) => boolean)[] = []; let op = "select"; let patch: any; let ins: any;
    const q: any = {
      select: () => q, eq: (c: string, v: any) => { f.push((r) => r[c] === v); return q; },
      update: (p: any) => { op = "update"; patch = p; return q; }, insert: (v: any) => { op = "insert"; ins = v; return q; },
      maybeSingle: () => Promise.resolve({ data: rows.find((r) => r._t === name && f.every((x) => x(r))) ?? null, error: null }),
      then: (a: any) => { let out: any = { data: null, error: null };
        if (op === "insert") rows.push({ _t: name, ...ins });
        if (op === "update") rows.filter((r) => r._t === name && f.every((x) => x(r))).forEach((r) => Object.assign(r, patch));
        return Promise.resolve(out).then(a); },
    };
    return q;
  };
  return { from, rows };
}

test("registro do chatbot do cliente: grava e passa a ser usado; atualiza em vez de duplicar", async () => {
  const db = memDb();
  const base = new URL(CHATBOT_WEBHOOK_PADRAO);
  assert.equal(await webhookDoChatbot(db, "T1"), CHATBOT_WEBHOOK_PADRAO); // sem registro: motor compartilhado
  const url = `https://${base.hostname}/webhook/chatbot-t1`;
  assert.equal(await registrarWebhookDoChatbot(db, "T1", url), true);
  assert.equal(await webhookDoChatbot(db, "T1"), url);
  await registrarWebhookDoChatbot(db, "T1", `https://${base.hostname}/webhook/chatbot-t1-v2`);
  assert.equal(db.rows.filter((r) => r._t === "app_settings").length, 1);
  assert.match(await webhookDoChatbot(db, "T1"), /v2$/);
  assert.equal(await webhookDoChatbot(db, "T2"), CHATBOT_WEBHOOK_PADRAO); // outro cliente não herda
});

test("rota registrar-agente: exige o segredo do agente de implementação, módulo contratado e URL válida", async () => {
  process.env.SPY_IMPLEMENTACAO_WEBHOOK_SECRET = "seg-impl";
  const base = new URL(CHATBOT_WEBHOOK_PADRAO);
  const db: any = memDb(); db.rows.push({ _t: "tenants", id: "11111111-1111-4111-8111-111111111111", modules: { chatbot: true } }, { _t: "tenants", id: "22222222-2222-4222-8222-222222222222", modules: {} });
  const handlers: Record<string, any> = {};
  registerChatbotSaveRoutes({ post: (p: string, ...h: any[]) => { handlers[p] = h[h.length - 1]; } } as any, { limiter: (_: any, __: any, n: any) => n(), supabaseService: db });
  const call = async (body: any, secret = "seg-impl") => { let status = 200, out: any; await handlers["/api/chatbot/registrar-agente"]({ headers: { "x-webhook-secret": secret }, body }, { status: (s: number) => ({ json: (b: any) => { status = s; out = b; } }), json: (b: any) => (out = b) }); return { status, body: out }; };
  const ok = { tenant_id: "11111111-1111-4111-8111-111111111111", webhook_url: `https://${base.hostname}/webhook/chatbot-t1` };
  assert.equal((await call(ok, "errado")).status, 403);
  assert.equal((await call({ ...ok, webhook_url: "https://evil.example.com/x" })).status, 400);
  assert.equal((await call({ ...ok, tenant_id: "22222222-2222-4222-8222-222222222222" })).status, 409); // não contratou
  assert.equal((await call(ok)).status, 200);
});
