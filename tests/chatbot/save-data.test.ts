import { test } from "node:test";
import assert from "node:assert/strict";
import { registerChatbotSaveRoutes } from "../../server/chatbotSave";
import { validateField } from "../../src/lib/chatbot/validateValue";
import { runChatbot } from "../../src/lib/chatbot/engine";
import { validateFlow } from "../../src/lib/chatbot/validate";
import { CHATBOT_TEMPLATES } from "../../src/lib/chatbot/templates";
import { allFields, type ImplData } from "../../src/lib/implementationForm";
import { DEFAULT_SETTINGS, type ChatbotFlow, type SessionState } from "../../src/lib/chatbot/types";

const field = (id: string) => allFields().find((f) => f.id === id)!;

// ── Supabase falso em memória (só o que o gravador usa) ──
type Row = Record<string, any>;
function fakeDb(seed: Record<string, Row[]>) {
  const t: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  let n = 0;
  const from = (name: string) => {
    t[name] ||= [];
    const rows = t[name]; let op = "select"; let patch: any; let ins: any[] = []; const f: ((r: Row) => boolean)[] = []; let single = false;
    const run = () => {
      if (op === "insert") { for (const r of ins) rows.push({ id: String(++n), ...r }); return { data: ins, error: null }; }
      const m = rows.filter((r) => f.every((x) => x(r)));
      if (op === "update") { for (const r of m) { Object.assign(r, patch); r.updated_at = "u" + ++n; } return { data: m, error: null }; }
      return { data: single ? m[0] ?? null : m, error: null };
    };
    const q: any = {
      select: () => q, insert: (v: any) => { op = "insert"; ins = Array.isArray(v) ? v : [v]; return q; }, update: (p: any) => { op = "update"; patch = p; return q; },
      eq: (c: string, v: any) => { f.push((r) => r[c] === v); return q; }, limit: () => q,
      maybeSingle: () => { single = true; return Promise.resolve(run()); }, then: (a: any, b: any) => Promise.resolve(run()).then(a, b),
    };
    return q;
  };
  return { from, t };
}
function setup(seed: Record<string, Row[]>) {
  const db = fakeDb(seed); let handler: any;
  registerChatbotSaveRoutes({ post: (_: string, ...h: any[]) => (handler = h[h.length - 1]) } as any, { limiter: (_: any, __: any, nx: any) => nx(), supabaseService: db });
  const call = async (body: any, secret = "seg") => {
    let status = 200, out: any; const res: any = { status: (s: number) => ((status = s), res), json: (b: any) => ((out = b), res) };
    await handler({ headers: { "x-webhook-secret": secret }, body }, res);
    return { status, body: out };
  };
  return { db, call };
}
const seed = () => ({
  whatsapp_instances: [{ name: "chatbot-abc", tenant_id: "T1", webhook_secret: "seg" }],
  clientes: [{ id: "c1", tenant_id: "T1", phone: "(63) 99999-8888" }, { id: "c2", tenant_id: "T2", phone: "(11) 98888-7777" }],
  cliente_contatos: [],
  implementations: [
    { id: "i1", tenant_id: "T1", cliente_id: "c1", status: "Em andamento", data: { razao_social: "Já cadastrada" }, updated_at: "u0" },
    { id: "i2", tenant_id: "T2", cliente_id: "c2", status: "Em andamento", data: {}, updated_at: "u0" },
  ],
});
const body = (over: any = {}) => ({
  session: "chatbot-abc", target: "implementation", phone: "5563999998888",
  map: [{ field: "razao_social", variable: "razao_social" }, { field: "cnpj", variable: "cnpj" }, { field: "resp_email", variable: "resp_email" }, { field: "qtd_usuarios", variable: "qtd_usuarios" }],
  vars: { telefone: "5563999998888", razao_social: "Outra", cnpj: "11222333000181", resp_email: "Ana@Acme.com", qtd_usuarios: "5" }, ...over,
});

test("validação de valores: CNPJ, e-mail, telefone, quantidade, CEP, senha", () => {
  assert.equal(validateField(field("cnpj"), "11111111111111").ok, false);
  assert.deepEqual(validateField(field("cnpj"), "11222333000181"), { ok: true, value: "11.222.333/0001-81" });
  assert.equal(validateField(field("resp_email"), "sem-arroba").ok, false);
  assert.deepEqual(validateField(field("resp_whatsapp"), "(63) 99999-8888"), { ok: true, value: "5563999998888" });
  assert.equal(validateField(field("qtd_usuarios"), "muitos").ok, false);
  assert.equal(validateField(field("cep"), "123").ok, false);
  assert.equal(validateField(field("meta_pixel_id"), "minha senha é abc").ok, false);
  assert.deepEqual(validateField(field("faixa_colaboradores"), "30 pessoas"), { ok: true, value: "21–50" });
});

test("grava só campo vazio, valida, normaliza e deixa trilha", async () => {
  const { call, db } = setup(seed());
  const r = await call(body());
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  const d: ImplData = db.t.implementations.find((i) => i.id === "i1")!.data;
  assert.equal(d.razao_social, "Já cadastrada"); // não sobrescreve
  assert.deepEqual(r.body.skipped, ["razao_social"]);
  assert.equal(d.cnpj, "11.222.333/0001-81");
  assert.equal(d.resp_email, "ana@acme.com");
  assert.equal(d.qtd_usuarios, "5");
  assert.equal(db.t.implementation_field_changes.length, 3);
  assert.equal(db.t.implementation_field_changes[0].chatbot_session, "chatbot-abc");
});

test("valor inválido é recusado e reportado, o resto grava", async () => {
  const { call, db } = setup(seed());
  const r = await call(body({ vars: { cnpj: "123", resp_email: "ana@acme.com" } }));
  assert.equal(r.body.rejected[0].field, "cnpj");
  assert.equal(db.t.implementations[0].data.cnpj, undefined);
  assert.equal(db.t.implementations[0].data.resp_email, "ana@acme.com");
});

test("segurança: segredo errado, sessão desconhecida e isolamento por tenant", async () => {
  const { call, db } = setup(seed());
  assert.equal((await call(body(), "errado")).status, 403);
  assert.equal((await call(body({ session: "outra" }))).status, 403);
  assert.equal((await call(body({ target: "lead" }))).status, 400);
  // número de uma implementação do OUTRO tenant: não acha e não grava lá
  const r = await call(body({ phone: "11988887777" }));
  assert.equal(r.body.ok, false);
  assert.equal(r.body.reason, "implementacao_nao_encontrada");
  assert.deepEqual(db.t.implementations.find((i) => i.id === "i2")!.data, {});
});

test("edição concorrente: relê e preserva o que outra tela salvou", async () => {
  const { call, db } = setup(seed());
  const impl = db.t.implementations[0]; const real = db.from; let first = true;
  (db as any).from = (name: string) => { const q = real(name); if (name === "implementations" && first) { const s = q.select; q.select = (...a: any[]) => { const r = s(...a); if (first) { first = false; impl.data = { ...impl.data, tec_nome: "Zé" }; impl.updated_at = "mudou"; } return r; }; } return q; };
  const r = await call(body());
  assert.equal(r.body.ok, true);
  assert.equal(impl.data.tec_nome, "Zé");
  assert.equal(impl.data.cnpj, "11.222.333/0001-81");
});

test("nó save_data no motor: emite a ação uma vez por conversa e o fluxo segue", () => {
  const flow: ChatbotFlow = { start: "q", nodes: {
    q: { id: "q", type: "question", text: "CNPJ?", variable: "cnpj", validation: "text", next: "s" },
    s: { id: "s", type: "save_data", target: "implementation", map: [{ field: "cnpj", variable: "cnpj" }], next: "fim" },
    fim: { id: "fim", type: "end", text: "ok" } } };
  let session: SessionState | null = null;
  const first = runChatbot({ flow, settings: DEFAULT_SETTINGS, session, text: "oi", phone: "5563999998888", now: 1 });
  session = first.session;
  const r = runChatbot({ flow, settings: DEFAULT_SETTINGS, session, text: "11222333000181", phone: "5563999998888", now: 2 });
  const a = r.actions.find((x) => x.kind === "save_data");
  assert.ok(a && a.kind === "save_data");
  assert.equal(a.vars.cnpj, "11222333000181");
  assert.equal(a.vars.telefone, "5563999998888");
  assert.equal(r.session.status, "finished");
  assert.deepEqual(r.session.saved_nodes, ["s"]);
});

test("validação do fluxo e template de implantação", () => {
  const bad: ChatbotFlow = { start: "s", nodes: { s: { id: "s", type: "save_data", target: "implementation", map: [], next: null } } };
  assert.ok(validateFlow(bad).some((i) => i.level === "error"));
  const t = CHATBOT_TEMPLATES.find((x) => x.id === "implantacao")!;
  assert.equal(validateFlow(t.flow).filter((i) => i.level === "error").length, 0);
  const ids = new Set(allFields().map((f) => f.id));
  for (const n of Object.values(t.flow.nodes)) if (n.type === "save_data") for (const m of n.map) assert.ok(ids.has(m.field), m.field);
});
