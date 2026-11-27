import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createCheckoutRouter } from "../../server/checkout.js";
import { escolherItens, jaAtivo, precoDoCiclo, proporcional, skuDoModulo, unirItens, ITENS_SPY, SOBRE_O_MODULO } from "../../src/lib/catalogoSpy.js";

/** Banco de mentira com o suficiente do supabase-js para o checkout: filtros, insert, update e maybeSingle. */
function banco(tabelas: Record<string, any[]>) {
  let seq = 0;
  const consulta = (nome: string) => {
    const filtros: ((r: any) => boolean)[] = [];
    let patch: any = null, novas: any[] | null = null, limite = Infinity;
    const linhas = () => (tabelas[nome] ||= []);
    const rodar = () => {
      if (novas) { const comId = novas.map((r) => ({ id: `${nome}-${++seq}`, created_at: new Date().toISOString(), status: nome === "checkout_orders" ? "pending" : r.status, ...r })); linhas().push(...comId); return comId; }
      const achadas = linhas().filter((r) => filtros.every((f) => f(r))).slice(0, limite);
      if (patch) achadas.forEach((r) => Object.assign(r, patch));
      return achadas;
    };
    const q: any = {
      select: () => q, order: () => q, or: () => q, gte: () => q, lte: () => q, range: () => q,
      limit: (n: number) => { limite = n; return q; },
      eq: (c: string, v: any) => { filtros.push((r) => r[c] === v); return q; },
      neq: (c: string, v: any) => { filtros.push((r) => r[c] !== v); return q; },
      in: (c: string, v: any[]) => { filtros.push((r) => v.includes(r[c])); return q; },
      is: (c: string, v: any) => { filtros.push((r) => (r[c] ?? null) === v); return q; },
      lt: (c: string, v: any) => { filtros.push((r) => r[c] < v); return q; },
      ilike: (c: string, v: string) => { filtros.push((r) => String(r[c]).toLowerCase() === v.toLowerCase()); return q; },
      contains: (c: string, v: any) => { filtros.push((r) => Object.entries(v).every(([k, x]) => r[c]?.[k] === x)); return q; },
      insert: (r: any) => { novas = Array.isArray(r) ? r : [r]; return q; },
      update: (p: any) => { patch = p; return q; },
      maybeSingle: async () => ({ data: rodar()[0] ?? null, error: null }),
      single: async () => ({ data: rodar()[0] ?? null, error: null }),
      then: (ok: any, no: any) => Promise.resolve({ data: rodar(), error: null, count: 0 }).then(ok, no),
    };
    return q;
  };
  return { from: consulta, rpc: async () => ({ data: null, error: null }) } as any;
}

const DONO = "dono";
const produto = (sku: string, price: number, impl: number) => ({ sku, name: `S.P.Y. | ${sku}`, description: "", price, implementation_fee: impl, tenant_id: DONO, active: true });
function cenario() {
  const daquiA15Dias = new Date(Date.now() + 15 * 86_400_000).toISOString();
  const t: Record<string, any[]> = {
    subscription_plans: [{ id: "p5", code: "autopilot", name: "5 usuários", price_cents: 98500, setup_price_cents: 450000, billing_interval: "monthly", active: true, product_id: "prod5", features: [] }],
    products: [{ id: "prod5", tenant_id: DONO, sku: "PLANO", price: 985, active: true }, produto("SPY-ADD-RADAR", 99.9, 150), produto("SPY-ADD-USUARIO", 197, 0), produto("SPY-MOD-FINANCEIRO", 149.9, 900), { ...produto("SPY-MOD-BI", 1, 0), tenant_id: "outra-empresa" }],
    checkout_config: [{ id: "main", active: true, pix_key: "pix@exemplo.com", receiver_name: "SPY", receiver_city: "PALMAS", notify_email: "", single_plan_code: null }],
    checkout_promos: [],
    checkout_orders: [],
    users: [{ id: "adm", name: "Ana", email: "ana@exemplo.com", tenant_id: "cli", is_tenant_admin: true, is_master: false, active: true }, { id: "col", name: "Caio", email: "caio@exemplo.com", tenant_id: "cli", is_tenant_admin: false, is_master: false, active: true }],
    tenants: [{ id: "cli", name: "Cliente", modules: { crm: true, financeiro: true } }],
    tenant_subscriptions: [{ tenant_id: "cli", status: "active", gateway: "manual", ciclo: "monthly", current_period_end: daquiA15Dias, plan_id: "p5", plan: { code: "autopilot", name: "5 usuários" }, itens: [{ sku: "SPY-ADD-USUARIO", nome: "Usuário", qtd: 1, mensalCents: 19700, implCents: 0 }] }],
    billing_events: [], app_settings: [],
  };
  return t;
}

async function subir(t: Record<string, any[]>) {
  const app = express();
  app.use(express.json());
  app.use("/api/checkout", createCheckoutRouter({
    requireUser: (req: any, _res: any, next: any) => { req.user = { id: String(req.headers["x-usuario"] || "adm") }; next(); },
    requireMaster: (_r: any, _s: any, next: any) => next(),
    supabaseService: banco(t), provisionPlan: async () => ({ planCode: "x", status: "active" }), publicAppUrl: "https://exemplo.com",
  }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/checkout`;
  const post = async (caminho: string, corpo: any, usuario = "adm") => {
    const r = await fetch(base + caminho, { method: "POST", headers: { "Content-Type": "application/json", "x-usuario": usuario }, body: JSON.stringify(corpo) });
    return { status: r.status, corpo: (await r.json()) as any };
  };
  return { post, fechar: () => server.close() };
}

test("contas: anual com 20% de desconto, proporcional e soma sem remover nada", () => {
  assert.equal(precoDoCiclo(98500, "yearly"), 945600);
  assert.equal(precoDoCiclo(98500, "monthly"), 98500);
  const agora = Date.parse("2026-11-01T00:00:00Z");
  assert.equal(proporcional(30000, "2026-11-16T00:00:00Z", "monthly", agora), 15000);
  assert.equal(proporcional(30000, null, "monthly", agora), 30000);
  assert.equal(proporcional(30000, "2027-06-01T00:00:00Z", "monthly", agora), 30000);
  const item = (sku: string, qtd: number) => ({ sku, nome: sku, qtd, mensalCents: 100, implCents: 0 });
  assert.deepEqual(unirItens([item("SPY-ADD-USUARIO", 2), item("SPY-ADD-RADAR", 1)], [item("SPY-ADD-USUARIO", 1)], "somar").map((i) => [i.sku, i.qtd]), [["SPY-ADD-USUARIO", 3], ["SPY-ADD-RADAR", 1]]);
});

test("itens: preço é sempre o do catálogo; desconhecido é ignorado; módulo não repete", () => {
  const cat = [{ sku: "SPY-ADD-RADAR", nome: "Radar", descricao: "", mensalCents: 9990, implCents: 15000 }];
  assert.deepEqual(escolherItens([{ sku: "SPY-ADD-RADAR", qtd: 7, mensalCents: 1 }, { sku: "__proto__", qtd: 1 }, { sku: "OUTRO", qtd: 1 }], cat), [{ sku: "SPY-ADD-RADAR", nome: "Radar", qtd: 1, mensalCents: 9990, implCents: 15000 }]);
  assert.equal(jaAtivo("SPY-ADD-RADAR", { radar: true }), false);
  assert.equal(jaAtivo("SPY-ADD-RADAR", { radar: true, radar_grupos: true }), true);
  assert.equal(jaAtivo("SPY-ADD-USUARIO", { agente_secreto: true, aurora: true }), false);
  for (const sku of Object.keys(ITENS_SPY)) { assert.ok(SOBRE_O_MODULO[sku], sku); for (const m of ITENS_SPY[sku].modulos) assert.ok(skuDoModulo(m), m); }
  assert.equal(skuDoModulo("financeiro"), "SPY-MOD-FINANCEIRO");
  assert.equal(skuDoModulo("dev"), null);
});

test("checkout público: anual com adicional é calculado no servidor e gravado no pedido", async () => {
  const t = cenario(); const s = await subir(t);
  try {
    const itens = [{ sku: "SPY-ADD-RADAR", qtd: 1, mensalCents: 1 }, { sku: "SPY-MOD-BI", qtd: 1 }];
    const q = await s.post("/quote", { planCode: "autopilot", ciclo: "yearly", itens });
    assert.equal(q.status, 200);
    assert.deepEqual([q.corpo.priceCents, q.corpo.itensCents, q.corpo.setupCents, q.corpo.totalCents, q.corpo.itens.length], [945600, 95904, 465000, 1506504, 1]); // BI de outra empresa não entra
    const o = await s.post("/order", { planCode: "autopilot", ciclo: "yearly", itens, nome: "Novo Cliente", empresa: "Nova", email: "novo@exemplo.com", telefone: "63999999999", documento: "11144477735", consentimento: true, totalCents: 100 });
    assert.equal(o.status, 200);
    const p = t.checkout_orders[0];
    assert.deepEqual([p.total_cents, p.price_cents, p.ciclo, p.itens[0].sku, p.kind], [1506504, 1041504, "yearly", "SPY-ADD-RADAR", "new"]);
  } finally { s.fechar(); }
});

test("adicionais: só o administrador; cobra proporcional; libera uma vez sem mexer no vencimento", async () => {
  const t = cenario(); const s = await subir(t);
  try {
    assert.equal((await s.post("/addon-order", { itens: [{ sku: "SPY-ADD-RADAR", qtd: 1 }] }, "col")).status, 403);
    assert.equal((await s.post("/addon-order", { itens: [{ sku: "SPY-MOD-FINANCEIRO", qtd: 1 }] })).status, 400); // já tem
    const itens = [{ sku: "SPY-ADD-RADAR", qtd: 1 }, { sku: "SPY-ADD-USUARIO", qtd: 2 }];
    const o = await s.post("/addon-order", { itens });
    assert.equal(o.status, 200);
    const p = t.checkout_orders[0];
    assert.equal(p.kind, "addon");
    assert.ok(p.total_cents > 15000 + 24000 && p.total_cents < 15000 + 25300, `metade do mês + implantação: ${p.total_cents}`);
    assert.equal(t.tenants[0].modules.radar, undefined); // nada liberado antes do pagamento

    const fim = t.tenant_subscriptions[0].current_period_end;
    assert.equal((await s.post(`/admin/orders/${p.id}/confirm`, {})).status, 200);
    await s.post(`/admin/orders/${p.id}/confirm`, {});
    assert.deepEqual([t.tenants[0].modules.radar, t.tenants[0].modules.radar_grupos, t.tenants[0].modules.financeiro], [true, true, true]);
    assert.deepEqual(t.tenant_subscriptions[0].itens.map((i: any) => [i.sku, i.qtd]), [["SPY-ADD-USUARIO", 3], ["SPY-ADD-RADAR", 1]]);
    assert.equal(t.tenant_subscriptions[0].current_period_end, fim);
    assert.equal(t.billing_events.length, 1);
    assert.ok(p.fulfilled_at);
  } finally { s.fechar(); }
});

test("adicionais: assinatura vencida precisa renovar antes", async () => {
  const t = cenario(); t.tenant_subscriptions[0].status = "suspended"; const s = await subir(t);
  try { assert.equal((await s.post("/addon-quote", { itens: [] })).status, 409); } finally { s.fechar(); }
});
