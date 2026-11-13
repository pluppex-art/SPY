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
      eq: (c: string, v: any) => { f.push((r) => r[c] === v); return q; }, is: (c: string, v: any) => { f.push((r) => (r[c] ?? null) === v); return q; }, limit: () => q,
      maybeSingle: () => { single = true; return Promise.resolve(run()); }, then: (a: any, b: any) => Promise.resolve(run()).then(a, b),
    };
    return q;
  };
  return { from, t };
}
function setup(seed: Record<string, Row[]>) {
  const db = fakeDb(seed); const handlers: Record<string, any> = {}; let handler: any;
  registerChatbotSaveRoutes({ post: (path: string, ...h: any[]) => { handlers[path] = h[h.length - 1]; handler = handlers["/api/chatbot/save-data"]; } } as any, { limiter: (_: any, __: any, nx: any) => nx(), supabaseService: db });
  const call = async (body: any, secret = "seg", path = "/api/chatbot/save-data") => {
    let status = 200, out: any; const res: any = { status: (s: number) => ((status = s), res), json: (b: any) => ((out = b), res) };
    await handlers[path]({ headers: { "x-webhook-secret": secret }, body }, res);
    return { status, body: out };
  };
  return { db, call };
}
const seed = () => ({
  whatsapp_instances: [{ name: "chatbot-abc", tenant_id: "T1", webhook_secret: "seg" }],
  chatbots: [{ name: "Gustavo Oliveira", tenant_id: "T1", whatsapp_session: "chatbot-abc" }],
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

// ── Conversa mais rápida: contexto do cliente, nome do bot, "não sei" ──
const CTX = "/api/chatbot/context";

test("contexto: devolve o nome do bot e o que o SPY já sabe do cliente (só do próprio número/tenant)", async () => {
  const sd = seed();
  sd.implementations[0].data = { razao_social: "Acme Ltda", whats_usa: true, qtd_usuarios: "5" } as any;
  const { call } = setup(sd);
  const r = await call({ session: "chatbot-abc", phone: "5563999998888" }, "seg", CTX);
  assert.equal(r.body.vars.bot_nome, "Gustavo Oliveira");
  assert.equal(r.body.vars.razao_social, "Acme Ltda");
  assert.equal(r.body.vars.whats_usa, "Sim");
  const other = await call({ session: "chatbot-abc", phone: "11988887777" }, "seg", CTX); // número do outro tenant
  assert.deepEqual(other.body.vars, { bot_nome: "Gustavo Oliveira" });
  assert.equal((await call({ session: "chatbot-abc", phone: "5563999998888" }, "errado", CTX)).status, 403);
});

test("o nome do chatbot vira o responsável pela implementação (só se estiver vazio)", async () => {
  const { call, db } = setup(seed());
  await call(body());
  assert.equal(db.t.implementations[0].responsavel, "Gustavo Oliveira");
  db.t.implementations[0].responsavel = "Maria";
  await call(body());
  assert.equal(db.t.implementations[0].responsavel, "Maria");
});

test("engine: seed pula o que já se sabe, 'não sei' tranquiliza e segue, {{bot_nome}} aparece", () => {
  const flow: ChatbotFlow = { start: "oi", nodes: {
    oi: { id: "oi", type: "message", text: "Aqui é {{bot_nome}}.", next: "a" },
    a: { id: "a", type: "question", text: "Empresa?", variable: "nome_fantasia", validation: "text", skip_if_known: true, next: "b" },
    b: { id: "b", type: "question", text: "ID do pixel?", variable: "meta_pixel_id", validation: "text", skip_if_known: true, allow_unknown: true, unknown_text: "Sem problema!", next: "c" },
    c: { id: "c", type: "question", text: "Meta?", variable: "meta_mensal", validation: "text", next: null } } };
  const first = runChatbot({ flow, settings: DEFAULT_SETTINGS, session: null, text: "oi", phone: "5563999998888", now: 1, seed: { bot_nome: "Gustavo Oliveira", nome_fantasia: "Acme", telefone: "hack" } });
  const texts = first.actions.filter((a) => a.kind === "send_text").map((a: any) => a.text);
  assert.deepEqual(texts, ["Aqui é Gustavo Oliveira.", "ID do pixel?"]); // "Empresa?" foi pulada
  assert.equal(first.session.vars.telefone, "5563999998888"); // seed não sobrescreve o telefone
  const r = runChatbot({ flow, settings: DEFAULT_SETTINGS, session: first.session, text: "Não sei.", phone: "5563999998888", now: 2 });
  assert.deepEqual(r.actions.filter((a) => a.kind === "send_text").map((a: any) => a.text), ["Sem problema!", "Meta?"]);
  assert.equal(r.session.vars.meta_pixel_id, undefined); // nada gravado
  // sem allow_unknown "não sei" continua sendo resposta comum (comportamento antigo)
  const r2 = runChatbot({ flow, settings: DEFAULT_SETTINGS, session: r.session, text: "não sei", phone: "5563999998888", now: 3 });
  assert.equal(r2.session.vars.meta_mensal, "não sei");
});

test("modelo de implantação: cliente conhecido responde só o que falta; WhatsApp do responsável = número da conversa", () => {
  const t = CHATBOT_TEMPLATES.find((x) => x.id === "implantacao")!;
  const seedVars = { bot_nome: "Gustavo Oliveira", nome_fantasia: "Acme", razao_social: "Acme Ltda", cnpj: "11.222.333/0001-81", endereco: "Rua A, 1", resp_nome: "Ana", resp_email: "ana@acme.com", whats_usa: "Sim", whats_numero: "5563999998888", meta_usa: "Não" };
  const run = (session: SessionState | null, text: string) => runChatbot({ flow: t.flow, settings: DEFAULT_SETTINGS, session, text, phone: "5563999998888", now: 1, seed: seedVars });
  let r = run(null, "oi");
  const said = r.actions.filter((a) => a.kind === "send_text").map((a: any) => a.text);
  assert.match(said[0], /Aqui é Gustavo Oliveira/);
  assert.equal(said[1], "Em que segmento a empresa atua?"); // 1ª pergunta que o SPY ainda não sabe
  for (const ans of ["Varejo", "8", "Novo → Fechado", "Instagram", "não sei"]) r = run(r.session, ans);
  const save = r.actions.find((a) => a.kind === "save_data");
  assert.ok(save && save.kind === "save_data" && save.provision === true);
  assert.deepEqual(save.map.find((m) => m.field === "resp_whatsapp"), { field: "resp_whatsapp", variable: "telefone" });
  assert.equal(save.vars.segmento, "Varejo");
  assert.equal(save.vars.meta_mensal, undefined); // "não sei": não grava
  assert.equal(r.session.status, "finished");
});
