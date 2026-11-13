import { test } from "node:test";
import assert from "node:assert/strict";
import { provisionTenantForImplementation } from "../../server/implementationProvision";
import { registerChatbotSaveRoutes } from "../../server/chatbotSave";

type Row = Record<string, any>;
function fakeDb(seed: Record<string, Row[]>, opts: { authFails?: boolean } = {}) {
  const t: Record<string, Row[]> = JSON.parse(JSON.stringify(seed)); let n = 0;
  const from = (name: string) => {
    t[name] ||= [];
    const rows = t[name]; let op = "select"; let patch: any; let ins: any[] = []; const f: ((r: Row) => boolean)[] = []; let single = false;
    const run = () => {
      if (op === "insert") { const out = ins.map((r) => { const row = { id: r.id ?? `id${++n}`, ...r }; rows.push(row); return row; }); return { data: single ? out[0] : out, error: null }; }
      const m = rows.filter((r) => f.every((x) => x(r)));
      if (op === "update") { for (const r of m) { Object.assign(r, patch); r.updated_at = "u" + ++n; } return { data: single ? m[0] ?? null : m, error: null }; }
      if (op === "delete") { for (const r of m) rows.splice(rows.indexOf(r), 1); return { data: null, error: null }; }
      return { data: single ? m[0] ?? null : m, error: null };
    };
    const q: any = {
      select: () => q, insert: (v: any) => { op = "insert"; ins = Array.isArray(v) ? v : [v]; return q; }, update: (p: any) => { op = "update"; patch = p; return q; }, delete: () => { op = "delete"; return q; },
      eq: (c: string, v: any) => { f.push((r) => r[c] === v); return q; }, is: (c: string, v: any) => { f.push((r) => (r[c] ?? null) === v); return q; },
      ilike: (c: string, v: string) => { f.push((r) => String(r[c]).toLowerCase() === v.toLowerCase()); return q; }, limit: () => q,
      maybeSingle: () => { single = true; return Promise.resolve(run()); }, then: (a: any, b: any) => Promise.resolve(run()).then(a, b),
    };
    return q;
  };
  const auth = { admin: {
    createUser: async (u: any) => (opts.authFails ? { data: null, error: { message: "x" } } : (t.auth_users ||= [], t.auth_users.push({ id: "auth1", email: u.email, pw: u.password }), { data: { user: { id: "auth1" } }, error: null })),
    deleteUser: async (id: string) => { t.auth_users = (t.auth_users || []).filter((x) => x.id !== id); },
    generateLink: async () => ({ data: { properties: { action_link: "https://app/reset?t=abc" } } }),
  } };
  return { from, t, auth };
}

const FULL = { razao_social: "Acme Ltda", nome_fantasia: "Acme", cnpj: "11.222.333/0001-81", endereco: "Rua A, 1", resp_nome: "Ana", resp_email: "Ana@Acme.com", resp_whatsapp: "5563999998888" };
const seed = (data: any = FULL, extra: Row = {}) => ({ implementations: [{ id: "i1", tenant_id: "OWN", data, linked_tenant_id: null, lead_id: null, internal_notes: "", ...extra }], users: [], tenants: [], app_settings: [] });

function deps(db: any, over: any = {}) {
  const sent: any[] = []; const hooks: any[] = [];
  return { sent, hooks, d: {
    db, planIdFromLead: async () => null, provisionPlan: async () => ({}), publicAppUrl: () => "https://app.spy.com",
    buildAccessMail: (a: any) => ({ subject: "Acesso", html: `<a href="${a.url}">${a.name}</a>` }), sendEmail: async (m: any) => { sent.push(m); },
    fetchImpl: (async (url: string, init: any) => { hooks.push({ url, init }); return { ok: true, status: 200 }; }) as any, ...over,
  } };
}

test("dados completos: cria ambiente + admin, link de senha por e-mail (sem senha), aciona o agente 1 vez e vincula", async () => {
  process.env.SPY_IMPLEMENTACAO_WEBHOOK_SECRET = "s3";
  const db = fakeDb(seed()); const { d, sent, hooks } = deps(db);
  const r = await provisionTenantForImplementation(d, "i1", "OWN");
  assert.equal(r.status, "created"); assert.equal(r.emailSent, true); assert.equal(r.agentTriggered, true);
  assert.equal(db.t.tenants.length, 1);
  assert.equal(db.t.users[0].email, "ana@acme.com"); assert.equal(db.t.users[0].is_tenant_admin, true); assert.equal(db.t.users[0].tenant_id, db.t.tenants[0].id);
  assert.equal(db.t.implementations[0].linked_tenant_id, db.t.tenants[0].id);
  assert.equal(db.t.app_settings[0].key, "empresa_dados");
  assert.equal(sent.length, 1); assert.match(sent[0].html, /reset\?t=abc/); assert.ok(!JSON.stringify(sent).includes(db.t.auth_users[0].pw)); // a senha nunca vai no e-mail
  assert.equal(hooks.length, 1); assert.equal(hooks[0].init.headers["X-Webhook-Secret"], "s3");
  const body = JSON.parse(hooks[0].init.body); assert.equal(body.tenant_id, db.t.tenants[0].id); assert.equal(body.implementation_id, "i1");
  assert.match(db.t.implementations[0].internal_notes, /agente de implementação acionado/);
});

test("não duplica: já vinculada não cria nem aciona de novo; dados incompletos também não", async () => {
  const db1 = fakeDb(seed(FULL, { linked_tenant_id: "T9" })); const a = deps(db1);
  assert.deepEqual(await provisionTenantForImplementation(a.d, "i1", "OWN"), { status: "skipped", reason: "ja_vinculada" });
  assert.equal(a.hooks.length, 0); assert.equal(db1.t.tenants.length, 0);
  const db2 = fakeDb(seed({ ...FULL, cnpj: "" })); const b = deps(db2);
  const r = await provisionTenantForImplementation(b.d, "i1", "OWN");
  assert.equal(r.status, "skipped"); assert.ok(r.missing!.includes("CNPJ")); assert.equal(db2.t.tenants.length, 0); assert.equal(b.hooks.length, 0);
});

test("duas execuções seguidas: a segunda não cria outro ambiente nem chama o agente", async () => {
  process.env.SPY_IMPLEMENTACAO_WEBHOOK_SECRET = "s3";
  const db = fakeDb(seed()); const { d, hooks } = deps(db);
  await provisionTenantForImplementation(d, "i1", "OWN");
  const again = await provisionTenantForImplementation(d, "i1", "OWN");
  assert.equal(again.reason, "ja_vinculada"); assert.equal(db.t.tenants.length, 1); assert.equal(hooks.length, 1);
});

test("e-mail já cadastrado e falha de login: nada fica pela metade", async () => {
  const dbA = fakeDb({ ...seed(), users: [{ id: "x", email: "ana@acme.com" }] });
  assert.equal((await provisionTenantForImplementation(deps(dbA).d, "i1", "OWN")).reason, "email_ja_cadastrado");
  assert.equal(dbA.t.tenants.length, 0);
  const dbB = fakeDb(seed(), { authFails: true }); const b = deps(dbB);
  assert.equal((await provisionTenantForImplementation(b.d, "i1", "OWN")).reason, "erro_ao_criar_login");
  assert.equal(dbB.t.tenants.length, 0); assert.equal(dbB.t.implementations[0].linked_tenant_id, null); assert.equal(b.hooks.length, 0);
});

test("falhas de e-mail/agente não desfazem o ambiente e ficam nas notas", async () => {
  process.env.SPY_IMPLEMENTACAO_WEBHOOK_SECRET = "s3";
  const db = fakeDb(seed());
  const { d } = deps(db, { sendEmail: async () => { throw new Error("smtp"); }, fetchImpl: (async () => ({ ok: false, status: 502 })) as any });
  const r = await provisionTenantForImplementation(d, "i1", "OWN");
  assert.equal(r.status, "created"); assert.equal(r.emailSent, false); assert.equal(r.agentTriggered, false);
  assert.equal(db.t.tenants.length, 1);
  assert.match(db.t.implementations[0].internal_notes, /NÃO foi enviado/); assert.match(db.t.implementations[0].internal_notes, /HTTP 502/);
});

test("rota save-data: só provisiona quando o nó pede (provision: true) e a gravação deu certo", async () => {
  const calls: string[] = []; let handler: any;
  const sb = { from: (name: string) => { const q: any = { select: () => q, eq: () => q, limit: () => q, update: () => q, insert: () => q,
    maybeSingle: () => Promise.resolve({ data: name === "whatsapp_instances" ? { tenant_id: "OWN", webhook_secret: "seg" } : null, error: null }),
    then: (a: any) => Promise.resolve({ data: [], error: null }).then(a) }; return q; } };
  registerChatbotSaveRoutes({ post: (_: string, ...h: any[]) => (handler = h[h.length - 1]) } as any, { limiter: (_: any, __: any, n: any) => n(), supabaseService: sb, provision: async (id: string) => { calls.push(id); return { status: "created" }; } });
  const call = async (body: any) => { let out: any; await handler({ headers: { "x-webhook-secret": "seg" }, body }, { status: () => ({ json: (b: any) => (out = b) }), json: (b: any) => (out = b) }); return out; };
  // Sem implementação para o número → saver devolve ok:false → não provisiona.
  const r = await call({ session: "s", target: "implementation", phone: "5563999998888", provision: true, map: [{ field: "cnpj", variable: "cnpj" }], vars: { cnpj: "x" } });
  assert.equal(r.ok, false); assert.equal(calls.length, 0);
});
