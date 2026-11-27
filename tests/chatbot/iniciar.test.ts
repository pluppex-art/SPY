import { test } from "node:test";
import assert from "node:assert/strict";
import { registerChatbotImplementationStart } from "../../server/chatbotImplementacao";
import { CHATBOT_TEMPLATES } from "../../src/lib/chatbot/templates";
import { runChatbot } from "../../src/lib/chatbot/engine";
import { DEFAULT_SETTINGS, type SessionState } from "../../src/lib/chatbot/types";

type Row = Record<string, any>;
function fakeDb(seed: Record<string, Row[]>) {
  const t: Record<string, Row[]> = JSON.parse(JSON.stringify(seed)); let n = 0;
  const from = (name: string) => {
    t[name] ||= [];
    const rows = t[name]; let op = "select"; let patch: any; let ins: any[] = []; const f: ((r: Row) => boolean)[] = []; let single = false;
    const run = () => {
      if (op === "insert") { const out = ins.map((r) => { const row = { id: r.id ?? `id${++n}`, ...r }; rows.push(row); return row; }); return { data: single ? out[0] : out, error: null }; }
      const m = rows.filter((r) => f.every((x) => x(r)));
      if (op === "update") { for (const r of m) Object.assign(r, patch); return { data: single ? m[0] ?? null : m, error: null }; }
      if (op === "delete") { for (const r of m) rows.splice(rows.indexOf(r), 1); return { data: null, error: null }; }
      return { data: single ? m[0] ?? null : m, error: null };
    };
    const q: any = {
      select: () => q, insert: (v: any) => { op = "insert"; ins = Array.isArray(v) ? v : [v]; return q; }, update: (p: any) => { op = "update"; patch = p; return q; }, delete: () => { op = "delete"; return q; },
      eq: (c: string, v: any) => { f.push((r) => r[c] === v); return q; }, limit: () => q,
      maybeSingle: () => { single = true; return Promise.resolve(run()); }, then: (a: any, b: any) => Promise.resolve(run()).then(a, b),
    };
    return q;
  };
  return { from, t };
}

const BOT = "11111111-1111-4111-8111-111111111111";
const flow = CHATBOT_TEMPLATES.find((x) => x.id === "implantacao")!.flow;
const seed = (over: Row = {}) => ({
  tenants: [{ id: "T1", modules: { chatbot: true } }],
  users: [{ id: "u1", is_master: false, is_tenant_admin: true }],
  chatbots: [{ id: BOT, tenant_id: "T1", name: "Gustavo Oliveira", active: true, whatsapp_session: "chatbot-abc", flow, settings: {}, ...over }],
  clientes: [], cliente_contatos: [], implementations: [], chatbot_sessions: [],
});

function setup(sd: ReturnType<typeof seed>, opts: { status?: string; sendFails?: boolean } = {}) {
  const db = fakeDb(sd); let handler: any; const sent: { session: string; phone: string; text: string }[] = [];
  const provider = {
    getConnectionState: async () => ({ status: opts.status ?? "CONNECTED" }),
    sendTextMessage: async (session: string, phone: string, text: string) => { if (opts.sendFails) throw new Error("x"); sent.push({ session, phone, text }); },
  };
  registerChatbotImplementationStart({ post: (_: string, ...h: any[]) => (handler = h[h.length - 1]) } as any, { requireUser: (_: any, __: any, nx: any) => nx(), limiter: (_: any, __: any, nx: any) => nx(), supabaseService: db, wahaConfigured: () => true, getProvider: () => provider });
  const call = async (body: any, over: any = {}) => {
    let status = 200, out: any; const res: any = { status: (s: number) => ((status = s), res), json: (b: any) => ((out = b), res) };
    await handler({ params: { id: BOT }, body, user: { id: "u1" }, supabase: db, ...over }, res);
    return { status, body: out };
  };
  return { db, call, sent };
}

test("equipe inicia: cadastra cliente + implementação, abre pelo WhatsApp do bot e deixa a conversa pronta", async () => {
  const { db, call, sent } = setup(seed());
  const r = await call({ whatsapp: "(63) 99999-8888", empresa: "Acme Ltda" });
  assert.equal(r.status, 201); assert.equal(r.body.clienteCriado, true);
  assert.equal(db.t.clientes[0].name, "Acme Ltda"); assert.equal(db.t.clientes[0].status, "Em Implantação"); assert.equal(db.t.clientes[0].phone, "5563999998888");
  const impl = db.t.implementations[0];
  assert.equal(impl.cliente_id, db.t.clientes[0].id); assert.equal(impl.responsavel, "Gustavo Oliveira"); assert.equal(impl.data.resp_whatsapp, "5563999998888");
  assert.ok(sent.length >= 2); assert.ok(sent.every((m) => m.session === "chatbot-abc" && m.phone === "5563999998888"));
  assert.match(sent[0].text, /Aqui é Gustavo Oliveira/);
  assert.match(sent[1].text, /Parte 1 de 5/);
  assert.equal(sent[2].text, "E a razão social?"); // o nome da empresa a equipe já informou: não pergunta de novo
  const s = db.t.chatbot_sessions[0];
  assert.equal(s.status, "active"); assert.equal(s.current_node, "razao_social"); assert.equal(s.chat_id, "5563999998888@c.us"); assert.equal(s.vars.telefone, "5563999998888");
  // o cliente responde: o motor segue exatamente de onde parou
  const state: SessionState = { status: s.status, current_node: s.current_node, vars: s.vars, last_input_at: s.last_input_at };
  const next = runChatbot({ flow, settings: DEFAULT_SETTINGS, session: state, text: "Acme Comércio Ltda", phone: "5563999998888", now: Date.now() });
  assert.equal(next.session.vars.razao_social, "Acme Comércio Ltda");
  assert.equal(next.actions.find((a) => a.kind === "send_text")!.kind, "send_text");
});

test("não duplica: conversa em andamento bloqueia; implementação existente é reaproveitada; já com ambiente bloqueia", async () => {
  const a = setup(seed());
  await a.call({ whatsapp: "63999998888", empresa: "Acme" });
  assert.equal((await a.call({ whatsapp: "63999998888", empresa: "Acme" })).status, 409); // conversa ativa
  assert.equal(a.db.t.clientes.length, 1); assert.equal(a.db.t.implementations.length, 1);

  const sd = seed(); (sd as any).clientes = [{ id: "c1", tenant_id: "T1", name: "Acme", phone: "(63) 99999-8888" }];
  (sd as any).implementations = [{ id: "i1", tenant_id: "T1", cliente_id: "c1", data: {}, linked_tenant_id: null }];
  const b = setup(sd);
  const r = await b.call({ whatsapp: "63999998888" }); // sem empresa: já existe
  assert.equal(r.status, 201); assert.equal(r.body.implementationId, "i1"); assert.equal(b.db.t.clientes.length, 1);

  (sd as any).implementations[0].linked_tenant_id = "T9";
  assert.equal((await setup(sd).call({ whatsapp: "63999998888" })).status, 409);
});

test("sem o módulo chatbot contratado, não inicia", async () => {
  const sd = seed(); (sd as any).tenants = [{ id: "T1", modules: { chatbot: false } }];
  const r = await setup(sd).call({ whatsapp: "63999998888", empresa: "X Y" });
  assert.equal(r.status, 403); assert.match(r.body.error, /não está contratado/);
});

test("proteções: só admin, bot ativo e conectado, telefone válido, empresa para número novo, falha de envio", async () => {
  const sd = seed(); (sd as any).users = [{ id: "u1", is_master: false, is_tenant_admin: false }];
  assert.equal((await setup(sd).call({ whatsapp: "63999998888", empresa: "X Y" })).status, 403);
  assert.equal((await setup(seed({ active: false })).call({ whatsapp: "63999998888", empresa: "X Y" })).status, 409);
  assert.equal((await setup(seed({ whatsapp_session: null })).call({ whatsapp: "63999998888", empresa: "X Y" })).status, 409);
  assert.equal((await setup(seed(), { status: "SCAN_QR_CODE" }).call({ whatsapp: "63999998888", empresa: "X Y" })).status, 409);
  assert.equal((await setup(seed()).call({ whatsapp: "123", empresa: "X Y" })).status, 400);
  assert.equal((await setup(seed()).call({ whatsapp: "63999998888" })).status, 400); // número novo sem empresa
  const semSalvar = seed({ flow: { start: "a", nodes: { a: { id: "a", type: "message", text: "oi", next: null } } } });
  assert.equal((await setup(semSalvar).call({ whatsapp: "63999998888", empresa: "X Y" })).status, 400);
  const f = setup(seed(), { sendFails: true });
  const r = await f.call({ whatsapp: "63999998888", empresa: "X Y" });
  assert.equal(r.status, 502); assert.equal(f.db.t.chatbot_sessions.length, 0); // sem mensagem enviada, sem sessão
});
