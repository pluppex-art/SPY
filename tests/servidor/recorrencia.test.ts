import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createCheckoutRouter } from "../../server/checkout.js";
import { createSaas } from "../../server/saas.js";
import { asaasBase, asaasDoAmbiente, type AsaasApi } from "../../server/recorrencia.js";

/** Banco de mentira com o suficiente do supabase-js: filtros, insert, update, upsert e maybeSingle. */
function banco(t: Record<string, any[]>) {
  let seq = 0;
  const consulta = (nome: string) => {
    const filtros: ((r: any) => boolean)[] = [];
    let patch: any = null, novas: any[] | null = null, up: { r: any; chaves: string[] } | null = null, limite = Infinity;
    const linhas = () => (t[nome] ||= []);
    const embutir = (r: any) => (nome === "tenant_subscriptions" ? Object.defineProperty(r, "plan", { configurable: true, enumerable: false, value: (t.subscription_plans || []).find((p) => p.id === r.plan_id) }) : r);
    const rodar = () => {
      if (up) { const a = linhas().find((r) => up!.chaves.every((c) => r[c] === up!.r[c])); if (a) Object.assign(a, up.r); else linhas().push({ ...up.r }); return [up.r]; }
      if (novas) { const comId = novas.map((r) => ({ id: `${nome}-${++seq}`, ...r })); linhas().push(...comId); return comId; }
      const achadas = linhas().filter((r) => filtros.every((f) => f(r))).slice(0, limite);
      if (patch) achadas.forEach((r) => Object.assign(r, patch));
      return achadas.map(embutir);
    };
    const q: any = {
      select: () => q, order: () => q, or: () => q, gte: () => q, lte: () => q,
      limit: (n: number) => { limite = n; return q; },
      eq: (c: string, v: any) => { filtros.push((r) => r[c] === v); return q; },
      in: (c: string, v: any[]) => { filtros.push((r) => v.includes(r[c])); return q; },
      is: (c: string, v: any) => { filtros.push((r) => (r[c] ?? null) === v); return q; },
      neq: (c: string, v: any) => { filtros.push((r) => r[c] !== v); return q; },
      contains: (c: string, v: any) => { filtros.push((r) => Object.entries(v).every(([k, x]) => r[c]?.[k] === x)); return q; },
      insert: (r: any) => { novas = Array.isArray(r) ? r : [r]; return q; },
      update: (p: any) => { patch = p; return q; },
      upsert: (r: any, o: { onConflict: string }) => { up = { r, chaves: o.onConflict.split(",") }; return q; },
      maybeSingle: async () => ({ data: rodar()[0] ?? null, error: null }),
      then: (ok: any, no: any) => Promise.resolve({ data: rodar(), error: null }).then(ok, no),
    };
    return q;
  };
  return { from: consulta, rpc: async () => ({ data: null, error: null }) } as any;
}

const FIM = new Date(Date.now() + 20 * 86_400_000).toISOString();
function cenario() {
  return {
    subscription_plans: [{ id: "p5", code: "autopilot", name: "5 usuários", price_cents: 98500, billing_interval: "monthly", active: true, product_id: "prod5" }],
    products: [{ id: "prod5", tenant_id: "dono", sku: "PLANO", price: 985, active: true }, { sku: "SPY-ADD-RADAR", name: "S.P.Y. | Radar", price: 99.9, implementation_fee: 150, tenant_id: "dono", active: true }],
    checkout_config: [{ id: "main", active: true, pix_key: "pix@exemplo.com", receiver_name: "SPY", receiver_city: "PALMAS", notify_email: "" }],
    users: [{ id: "adm", name: "Ana", email: "ana@exemplo.com", tenant_id: "cli", is_tenant_admin: true, is_master: false, active: true }, { id: "col", name: "Caio", tenant_id: "cli", is_tenant_admin: false, is_master: false, active: true }],
    tenants: [{ id: "cli", name: "Cliente", modules: {} }],
    tenant_subscriptions: [{ id: "s1", tenant_id: "cli", status: "active", gateway: "manual", gateway_subscription_id: null, ciclo: "monthly", current_period_end: FIM, plan_id: "p5", itens: [{ sku: "SPY-ADD-RADAR", nome: "Radar", qtd: 1, mensalCents: 1, implCents: 0 }] }],
    checkout_orders: [{ id: "o1", token: "tok", status: "pending", kind: "new", tenant_id: "cli", fulfilled_at: null }],
    app_settings: [], billing_events: [],
  } as Record<string, any[]>;
}

function asaasDeMentira() {
  const chamadas: any[] = [];
  const api: AsaasApi & { chamadas: any[]; falhar: boolean } = {
    chamadas, falhar: false,
    async criarCheckout(c) { chamadas.push(["checkout", c]); return { id: `chk_${chamadas.length}`, link: "https://asaas.com/checkoutSession/show?id=x" }; },
    async assinatura(id) { return { id, customer: "cus_1", checkoutSession: id === "sub_alheia" ? "outro" : "chk_1" }; },
    async cancelar(id) { if (api.falhar) throw new Error("fora do ar"); chamadas.push(["cancelar", id]); },
    async atualizarValor(id, v) { chamadas.push(["valor", id, v]); },
  };
  return api;
}

async function subir(t: Record<string, any[]>, asaas: AsaasApi | null) {
  const db = banco(t);
  const requireUser = (req: any, _res: any, next: any) => { req.user = { id: String(req.headers["x-usuario"] || "adm") }; next(); };
  const livre = (_r: any, _s: any, next: any) => next();
  const app = express();
  app.use(express.json());
  app.use("/api/checkout", createCheckoutRouter({ requireUser, requireMaster: livre, supabaseService: db, provisionPlan: async () => ({ planCode: "x", status: "active" }), publicAppUrl: "https://exemplo.com", asaas }));
  const saas = createSaas({ requireUser, requireMaster: livre, supabase: db, supabaseService: db, supabaseUrl: "http://x", supabaseKey: "x", createUserClient: () => db, asaas });
  app.use("/api/billing", saas.billingRouter);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const chamar = async (metodo: string, caminho: string, corpo?: any, headers: Record<string, string> = {}) => {
    const r = await fetch(base + caminho, { method: metodo, headers: { "Content-Type": "application/json", ...headers }, body: corpo ? JSON.stringify(corpo) : undefined });
    return { status: r.status, corpo: (await r.json()) as any };
  };
  const aviso = (event: string, extra: any) => chamar("POST", "/billing/webhook/asaas", { event, ...extra }, { "asaas-access-token": "segredo" });
  return { chamar, aviso, fechar: () => server.close() };
}

process.env.ASAAS_WEBHOOK_TOKEN = "segredo";

test("sem chave e token a recorrência não existe", async () => {
  assert.equal(asaasDoAmbiente({}), null);
  assert.equal(asaasDoAmbiente({ ASAAS_API_KEY: "k" }), null);
  assert.ok(asaasDoAmbiente({ ASAAS_API_KEY: "k", ASAAS_WEBHOOK_TOKEN: "t" }));
  assert.equal(asaasBase({ ASAAS_ENV: "sandbox" }), "https://api-sandbox.asaas.com/v3");
  const s = await subir(cenario(), null);
  try {
    assert.equal((await s.chamar("GET", "/checkout/recorrencia")).corpo.disponivel, false);
    assert.equal((await s.chamar("POST", "/checkout/recorrencia", {})).status, 503);
    assert.equal((await s.chamar("GET", "/checkout/plans")).corpo.recorrente, false);
  } finally { s.fechar(); }
});

test("ligar: só o administrador; valor atual do catálogo; primeira cobrança no fim do período pago", async () => {
  const t = cenario(); const a = asaasDeMentira(); const s = await subir(t, a);
  try {
    assert.equal((await s.chamar("POST", "/checkout/recorrencia", {}, { "x-usuario": "col" })).status, 403);
    const r = await s.chamar("POST", "/checkout/recorrencia", {});
    assert.equal(r.status, 200);
    const c = a.chamadas[0][1];
    assert.deepEqual([c.billingTypes, c.chargeTypes, c.items[0].value, c.subscription.cycle], [["CREDIT_CARD"], ["RECURRENT"], 1084.9, "MONTHLY"]);
    assert.equal(c.subscription.nextDueDate, new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(FIM)));
    assert.deepEqual(t.app_settings[0].value.checkouts, ["chk_1"]);
    assert.equal(t.tenant_subscriptions[0].gateway, "manual"); // só muda quando o Asaas avisar
    t.tenant_subscriptions[0].ciclo = "yearly";
    assert.equal((await s.chamar("POST", "/checkout/recorrencia", {})).status, 409);
  } finally { s.fechar(); }
});

test("link do pedido: só depois do pagamento confirmado e concluído", async () => {
  const t = cenario(); const s = await subir(t, asaasDeMentira());
  try {
    assert.equal((await s.chamar("POST", "/checkout/order/tok/recorrencia", {})).status, 409);
    Object.assign(t.checkout_orders[0], { status: "paid", fulfilled_at: new Date().toISOString() });
    assert.equal((await s.chamar("POST", "/checkout/order/tok/recorrencia", {})).status, 200);
  } finally { s.fechar(); }
});

test("avisos do Asaas: liga a empresa, anda um mês por pagamento e cancelar não bloqueia quem pagou", async () => {
  const t = cenario(); const a = asaasDeMentira(); const s = await subir(t, a);
  const sub = t.tenant_subscriptions[0];
  try {
    await s.chamar("POST", "/checkout/recorrencia", {});
    await s.aviso("SUBSCRIPTION_CREATED", { subscription: { id: "sub_alheia" } });
    assert.equal(sub.gateway, "manual"); // assinatura que não nasceu aqui é ignorada
    await s.aviso("SUBSCRIPTION_CREATED", { subscription: { id: "sub_1" } });
    assert.deepEqual([sub.gateway, sub.gateway_subscription_id, sub.current_period_end], ["asaas", "sub_1", FIM]);
    assert.equal(t.app_settings.length, 1);

    const pagamento = { payment: { id: "pay_1", subscription: "sub_1", value: 1084.9 } };
    await s.aviso("PAYMENT_CONFIRMED", pagamento);
    const depois = sub.current_period_end;
    assert.ok(new Date(depois).getTime() - new Date(FIM).getTime() > 27 * 86_400_000);
    assert.equal((await s.aviso("PAYMENT_RECEIVED", pagamento)).corpo.duplicate, true);
    assert.equal(sub.current_period_end, depois);

    await s.aviso("SUBSCRIPTION_DELETED", { subscription: { id: "sub_1" } });
    assert.deepEqual([sub.gateway, sub.status, sub.current_period_end], ["manual", "active", depois]);
  } finally { s.fechar(); }
});

test("segunda assinatura é cancelada; cancelar pelo sistema desliga e volta atrás se o Asaas falhar", async () => {
  const t = cenario(); const a = asaasDeMentira(); const s = await subir(t, a);
  const sub = t.tenant_subscriptions[0];
  try {
    await s.chamar("POST", "/checkout/recorrencia", {});
    await s.aviso("SUBSCRIPTION_CREATED", { subscription: { id: "sub_1" } });
    await s.aviso("SUBSCRIPTION_CREATED", { subscription: { id: "sub_2" } });
    assert.equal(sub.gateway_subscription_id, "sub_1");
    assert.deepEqual(a.chamadas.at(-1), ["cancelar", "sub_2"]);

    a.falhar = true;
    assert.equal((await s.chamar("DELETE", "/checkout/recorrencia")).status, 502);
    assert.deepEqual([sub.gateway, sub.gateway_subscription_id], ["asaas", "sub_1"]);
    a.falhar = false;
    assert.equal((await s.chamar("DELETE", "/checkout/recorrencia")).status, 200);
    assert.deepEqual([sub.gateway, sub.gateway_subscription_id, sub.status], ["manual", null, "active"]);
  } finally { s.fechar(); }
});

test("quem paga no cartão compra adicional e o valor da assinatura acompanha", async () => {
  const t = cenario(); const a = asaasDeMentira(); const s = await subir(t, a);
  Object.assign(t.tenant_subscriptions[0], { gateway: "asaas", gateway_subscription_id: "sub_1", itens: [] });
  Object.assign(t.checkout_orders[0], { kind: "addon", total_cents: 20000, itens: [{ sku: "SPY-ADD-RADAR", nome: "Radar", qtd: 1, mensalCents: 9990, implCents: 15000 }] });
  try {
    assert.equal((await s.chamar("POST", "/checkout/addon-quote", { itens: [] })).status, 200);
    assert.equal((await s.chamar("POST", "/checkout/admin/orders/o1/confirm", {})).status, 200);
    assert.deepEqual(a.chamadas.at(-1), ["valor", "sub_1", 108490]);
  } finally { s.fechar(); }
});
