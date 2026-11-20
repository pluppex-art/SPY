import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import {
  assinaturaValida, CABECALHO_SEGREDO, createPluggyWebhookHandler, criarClientePluggy, ErroPluggy, lerConfigPluggy, liberarFinanceiro, paraLinhaExtrato,
  proximaPagina, registrarWebhook, segredoConfere, sincronizarItem, webhookUrlDe, type ClientePluggy, type PluggyConfig,
} from "../../server/pluggy.js";

const TENANT = "11111111-1111-1111-1111-111111111111";
const ITEM = "22222222-2222-2222-2222-222222222222";

// ── Banco de dados em memória: só o que o sincronizador usa ─────────────────────
function bancoFalso(tabelas: Record<string, any[]>) {
  const from = (nome: string) => {
    const linhas = (tabelas[nome] ??= []);
    const st: any = { op: "select", filtros: [] as ((r: any) => boolean)[], payload: undefined, opts: undefined, quer: false, unico: false };
    const executa = () => {
      const alvo = linhas.filter((r) => st.filtros.every((f: any) => f(r)));
      if (st.op === "select") return st.unico ? { data: alvo[0] ?? null, error: alvo[0] || st.talvez ? null : { message: "sem linha" } } : { data: alvo, error: null };
      if (st.op === "update") { alvo.forEach((r) => Object.assign(r, st.payload)); return { data: alvo, error: null }; }
      if (st.op === "delete") { for (const r of alvo) linhas.splice(linhas.indexOf(r), 1); return { data: alvo, error: null }; }
      const novos: any[] = [];
      for (const p of Array.isArray(st.payload) ? st.payload : [st.payload]) {
        if (st.op === "upsert" && st.opts?.ignoreDuplicates && linhas.some((r) => r.id === p.id)) continue;
        const r = { id: p.id ?? randomUUID(), ...p };
        linhas.push(r); novos.push(r);
      }
      return st.unico ? { data: novos[0] ?? null, error: null } : { data: novos, error: null };
    };
    const b: any = {
      select() { st.quer = true; return b; },
      insert(p: any) { st.op = "insert"; st.payload = p; return b; },
      upsert(p: any, o: any) { st.op = "upsert"; st.payload = p; st.opts = o; return b; },
      update(p: any) { st.op = "update"; st.payload = p; return b; },
      delete() { st.op = "delete"; return b; },
      eq(c: string, v: any) { st.filtros.push((r: any) => r[c] === v); return b; },
      in(c: string, vs: any[]) { st.filtros.push((r: any) => vs.includes(r[c])); return b; },
      not(c: string, op: string, v: string) { if (op === "like") st.filtros.push((r: any) => !String(r[c]).startsWith(v.replace("%", ""))); return b; },
      is(c: string, v: any) { st.filtros.push((r: any) => (r[c] ?? null) === v); return b; },
      single() { st.unico = true; return b; },
      maybeSingle() { st.unico = true; st.talvez = true; return b; },
      limit() { return b; },
      then(ok: any, ko: any) { return Promise.resolve(executa()).then(ok, ko); },
    };
    return b;
  };
  return { from } as any;
}

// ── Pluggy de mentira ───────────────────────────────────────────────────────────
function pluggyFalso(o: { status?: string; contas?: any[]; transacoes?: Record<string, any[][]> }) {
  const chamadas: string[] = [];
  const cli: ClientePluggy = {
    get: async (caminho: string) => {
      chamadas.push(caminho);
      if (caminho.startsWith("/items/")) return { status: o.status ?? "UPDATED", connector: { name: "Itaú" } };
      if (caminho.startsWith("/accounts")) return { results: o.contas ?? [{ id: "acc1", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "Conta Corrente", number: "123" }, { id: "cc1", type: "CREDIT", name: "Cartão" }] };
      if (caminho.startsWith("/v2/transactions")) {
        const conta = /accountId=([^&]+)/.exec(caminho)?.[1] ?? "";
        const paginas = o.transacoes?.[conta] ?? [];
        const pos = caminho.includes("after=") ? Number(/after=(\d+)/.exec(caminho)![1]) : 0;
        return { results: paginas[pos] ?? [], next: pos + 1 < paginas.length ? `?after=${pos + 1}` : null };
      }
      throw new Error(`rota inesperada ${caminho}`);
    },
    post: async () => ({}),
    delete: async () => undefined,
  } as any;
  return { cli, chamadas };
}
const tx = (id: string, amount: number, type: "CREDIT" | "DEBIT", status: "POSTED" | "PENDING" = "POSTED", date = "2026-11-10T00:00:00.000Z") => ({ id, description: `Mov ${id}`, amount, type, status, date });

// ── Peças puras ─────────────────────────────────────────────────────────────────
test("assinaturaValida: aceita a assinatura correta e recusa corpo alterado, segredo errado e data velha", () => {
  const corpo = '{"event":"item/updated","clientId":"x"}';
  const t = 1_800_000_000;
  const v1 = createHmac("sha256", "segredo").update(`${t}.${corpo}`).digest("hex");
  const cab = `t=${t},v1=${v1}`;
  const agora = t * 1000;
  assert.equal(assinaturaValida(corpo, cab, "segredo", agora), true);
  assert.equal(assinaturaValida(corpo + " ", cab, "segredo", agora), false, "corpo alterado");
  assert.equal(assinaturaValida(corpo, cab, "outro", agora), false, "segredo errado");
  assert.equal(assinaturaValida(corpo, cab, "segredo", agora + 6 * 60_000), false, "mais de 5 min");
  assert.equal(assinaturaValida(corpo, undefined, "segredo", agora), false, "sem cabeçalho");
  assert.equal(assinaturaValida(corpo, "lixo", "segredo", agora), false, "cabeçalho malformado");
});

test("paraLinhaExtrato: crédito/débito, valor absoluto, data BR e descarta pendentes", () => {
  const credito = paraLinhaExtrato(tx("a", 150.5, "CREDIT"), TENANT, "Caixa")!;
  assert.deepEqual(credito, { id: "pluggy-a", tenant_id: TENANT, data: "10/11/2026", descricao: "Mov a", documento: "a", valor: 150.5, tipo: "credito", banco: "Caixa", conta_bancaria_id: null, conciliado: false });
  assert.equal(paraLinhaExtrato(tx("z", 1, "CREDIT"), TENANT, "Caixa", "c1")!.conta_bancaria_id, "c1", "guarda a conta de origem");
  const debito = paraLinhaExtrato(tx("b", -80, "DEBIT"), TENANT, "Caixa")!;
  assert.equal(debito.tipo, "debito");
  assert.equal(debito.valor, 80);
  assert.equal(paraLinhaExtrato(tx("c", 10, "CREDIT", "PENDING"), TENANT, "Caixa"), null, "pendente");
  assert.equal(paraLinhaExtrato({ id: "d", amount: 0, date: "2026-11-10" } as any, TENANT, "Caixa"), null, "valor zero");
  assert.equal(paraLinhaExtrato({ id: "e", amount: 5, date: "ontem" } as any, TENANT, "Caixa"), null, "data inválida");
  assert.equal(paraLinhaExtrato({ id: "f", amount: -5, date: "2026-11-10" } as any, TENANT, "Caixa")!.tipo, "debito", "sem type: usa o sinal");
});

test("proximaPagina: cursor como query string, como caminho ou como valor solto", () => {
  const base = "/v2/transactions?accountId=1&dateFrom=x";
  assert.equal(proximaPagina(base, null), null);
  assert.equal(proximaPagina(base, "?accountId=1&after=zz"), "/v2/transactions?accountId=1&dateFrom=x&after=zz", "next completo: não duplica os filtros");
  assert.equal(proximaPagina(base, "?after=zz"), "/v2/transactions?accountId=1&dateFrom=x&after=zz", "next só com o cursor: mantém accountId e dateFrom");
  assert.equal(proximaPagina(base, "/v2/transactions?after=zz"), "/v2/transactions?after=zz");
  assert.equal(proximaPagina(base, "abc 1"), `${base}&after=abc%201`);
});

test("config: sem chaves a integração fica desligada; webhook só com https público", () => {
  assert.equal(lerConfigPluggy({}), null);
  assert.equal(lerConfigPluggy({ PLUGGY_CLIENT_ID: "a" }), null);
  const c = lerConfigPluggy({ PLUGGY_CLIENT_ID: " a ", PLUGGY_CLIENT_SECRET: "b", PUBLIC_APP_URL: "https://app.exemplo.com/", PLUGGY_SANDBOX: "true" })!;
  assert.equal(c.clientId, "a");
  assert.equal(c.sandbox, true);
  assert.equal(webhookUrlDe(c), "https://app.exemplo.com/api/pluggy/webhook");
  assert.equal(webhookUrlDe({ publicAppUrl: "http://localhost:3002" }), undefined);
  assert.equal(webhookUrlDe({ publicAppUrl: "https://localhost:3002" }), undefined);
  assert.equal(webhookUrlDe({ publicAppUrl: "" }), undefined);
});

test("cliente Pluggy: autentica uma vez, reaproveita a chave e renova uma vez se for recusada", async () => {
  let autenticacoes = 0;
  let usos = 0;
  const f = (async (url: string, init: any) => {
    if (String(url).endsWith("/auth")) { autenticacoes++; return new Response(JSON.stringify({ apiKey: `k${autenticacoes}` }), { status: 200 }); }
    usos++;
    // a primeira chave (k1) é "revogada": só a segunda funciona
    if (init.headers["X-API-KEY"] === "k1") return new Response("{}", { status: 401 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as any;
  const cli = criarClientePluggy({ clientId: "a", clientSecret: "b", sandbox: false, publicAppUrl: "" }, f);
  assert.deepEqual(await cli.get("/items/x"), { ok: true });
  assert.equal(autenticacoes, 2, "renovou após o 401");
  assert.deepEqual(await cli.get("/items/y"), { ok: true });
  assert.equal(autenticacoes, 2, "reaproveitou a chave nova");
  assert.equal(usos, 3);
});

test("cliente Pluggy: erro 4xx vira ErroPluggy com o status (sem expor segredos)", async () => {
  const f = (async (url: string) => String(url).endsWith("/auth") ? new Response(JSON.stringify({ apiKey: "k" }), { status: 200 }) : new Response(JSON.stringify({ message: "Item não existe" }), { status: 404 })) as any;
  const cli = criarClientePluggy({ clientId: "a", clientSecret: "SEGREDO", sandbox: false, publicAppUrl: "" }, f);
  await assert.rejects(cli.get("/items/nao"), (e: any) => e instanceof ErroPluggy && e.status === 404 && !String(e.message).includes("SEGREDO"));
});

// ── Sincronização ───────────────────────────────────────────────────────────────
function cenario() {
  return bancoFalso({
    finance_bank_accounts: [{ id: "c1", tenant_id: TENANT, nome: "Caixa", banco: null }],
    finance_bank_connections: [{ id: "m0", tenant_id: TENANT, item_id: ITEM, pluggy_account_id: `item:${ITEM}`, conta_bancaria_id: "c1", connector_name: null }],
    finance_extratos_importados: [],
  });
}

test("sincronizarItem: liga a conta escolhida, importa as movimentações (várias páginas, sem pendentes) e não duplica ao repetir", async () => {
  const sb = cenario();
  const { cli } = pluggyFalso({ transacoes: { acc1: [[tx("t1", 100, "CREDIT"), tx("t2", -30, "DEBIT"), tx("t3", 5, "CREDIT", "PENDING")], [tx("t4", -12.5, "DEBIT")]] } });
  const agora = () => new Date("2026-11-19T12:00:00Z");

  const r1 = await sincronizarItem({ cli, sb, tenantId: TENANT, itemId: ITEM }, { agora });
  assert.deepEqual({ contas: r1.contas, importadas: r1.importadas, parcial: r1.parcial, status: r1.status }, { contas: 2, importadas: 3, parcial: false, status: "UPDATED" }, "a conta corrente e o cartão");

  const extratos = sb.from("finance_extratos_importados");
  const linhas = (await extratos).data;
  assert.deepEqual(linhas.map((l: any) => l.documento).sort(), ["t1", "t2", "t4"]);
  assert.ok(linhas.every((l: any) => l.banco === "Caixa" && l.conta_bancaria_id === "c1" && l.tenant_id === TENANT && l.conciliado === false), "rótulo = nome da conta e vínculo com a conta");

  const conexoes = (await sb.from("finance_bank_connections")).data;
  assert.equal(conexoes.length, 2, "o marcador provisório foi trocado pelas contas reais do banco");
  const corrente = conexoes.find((c: any) => c.pluggy_account_id === "acc1");
  assert.equal(corrente.conta_bancaria_id, "c1");
  assert.equal(corrente.connector_name, "Itaú");
  assert.equal(corrente.last_sync_at, "2026-11-19T12:00:00.000Z");
  assert.equal(conexoes.find((c: any) => c.pluggy_account_id === "cc1").pluggy_account_type, "CREDIT");

  const contas = (await sb.from("finance_bank_accounts")).data;
  const conta = contas.find((c: any) => c.id === "c1");
  assert.deepEqual({ s: conta.conexao_status, p: conta.conexao_provedor, b: conta.banco }, { s: "Conectada", p: "Pluggy", b: "Itaú" });
  const cartao = contas.find((c: any) => c.id !== "c1");
  assert.deepEqual({ tipo: cartao.tipo, nome: cartao.nome, principal: cartao.is_principal }, { tipo: "CARTAO_CREDITO", nome: "Itaú — Cartão", principal: false }, "cartão vira uma conta do tipo cartão");

  // Mesma sincronização de novo: o que já veio não entra duas vezes.
  const r2 = await sincronizarItem({ cli, sb, tenantId: TENANT, itemId: ITEM }, { agora });
  assert.equal(r2.importadas, 0);
  assert.equal((await sb.from("finance_extratos_importados")).data.length, 3);
});

test("sincronizarItem: depois da primeira vez pede só o período novo (última sincronização − 3 dias)", async () => {
  const sb = cenario();
  const { cli, chamadas } = pluggyFalso({ transacoes: { acc1: [[tx("t1", 1, "CREDIT")]] } });
  await sincronizarItem({ cli, sb, tenantId: TENANT, itemId: ITEM }, { agora: () => new Date("2026-11-19T12:00:00Z") });
  await sincronizarItem({ cli, sb, tenantId: TENANT, itemId: ITEM }, { agora: () => new Date("2026-11-25T12:00:00Z") });
  const pedidos = chamadas.filter((c) => c.startsWith("/v2/transactions") && c.includes("accountId=acc1"));
  assert.match(decodeURIComponent(pedidos[0]), /dateFrom=2026-08-21T12:00:00\.000Z/, "1ª vez: 90 dias");
  assert.match(decodeURIComponent(pedidos[1]), /dateFrom=2026-11-16T12:00:00\.000Z/, "2ª vez: desde 19/11 − 3 dias");
});

test("sincronizarItem: banco ainda coletando os dados → não importa nada e avisa que está aguardando", async () => {
  const sb = cenario();
  const { cli, chamadas } = pluggyFalso({ status: "UPDATING" });
  const r = await sincronizarItem({ cli, sb, tenantId: TENANT, itemId: ITEM });
  assert.equal(r.aguardando, "UPDATING");
  assert.equal(r.importadas, 0);
  assert.equal(chamadas.some((c) => c.startsWith("/v2/transactions")), false);
  assert.equal((await sb.from("finance_bank_connections")).data[0].pluggy_account_id, `item:${ITEM}`, "mantém o marcador até as contas aparecerem");
});

test("sincronizarItem: login recusado → marca o erro e pede para reconectar", async () => {
  const sb = cenario();
  const { cli } = pluggyFalso({ status: "LOGIN_ERROR" });
  const r = await sincronizarItem({ cli, sb, tenantId: TENANT, itemId: ITEM });
  assert.equal(r.aguardando, "reconectar");
  assert.match((await sb.from("finance_bank_connections")).data[0].last_error, /Reconecte/);
});

test("sincronizarItem: segunda conta bancária da mesma conexão vira uma conta nova e o cartão também", async () => {
  const sb = cenario();
  const { cli } = pluggyFalso({
    contas: [
      { id: "acc1", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "Corrente", number: "1" },
      { id: "acc2", type: "BANK", subtype: "SAVINGS_ACCOUNT", name: "Poupança", number: "2" },
      { id: "cc1", type: "CREDIT", name: "Cartão" },
    ],
    transacoes: { acc1: [[tx("a", 1, "CREDIT")]], acc2: [[tx("b", 2, "CREDIT")]] },
  });
  const r = await sincronizarItem({ cli, sb, tenantId: TENANT, itemId: ITEM });
  assert.equal(r.contas, 3);
  assert.equal(r.importadas, 2);
  const contas = (await sb.from("finance_bank_accounts")).data;
  assert.equal(contas.length, 3);
  const nova = contas.find((c: any) => c.nome === "Itaú — Poupança");
  assert.equal(nova.tipo, "CONTA_POUPANCA");
  assert.equal(nova.tenant_id, TENANT);
  assert.equal(nova.is_principal, false);
  assert.equal(nova.nome, "Itaú — Poupança");
  const rotulos = new Map((await sb.from("finance_extratos_importados")).data.map((l: any) => [l.documento, l.banco]));
  assert.equal(rotulos.get("a"), "Caixa");
  assert.equal(rotulos.get("b"), "Itaú — Poupança");
});

test("sincronizarItem: conexão de outra empresa não é encontrada", async () => {
  const sb = cenario();
  const { cli } = pluggyFalso({});
  await assert.rejects(sincronizarItem({ cli, sb, tenantId: "99999999-9999-9999-9999-999999999999", itemId: ITEM }), (e: any) => e instanceof ErroPluggy && e.status === 404);
});

test("sincronizarItem: guarda o saldo informado pelo banco (cartão de crédito entra como dívida, negativo)", async () => {
  const sb = cenario();
  const { cli } = pluggyFalso({
    contas: [
      { id: "acc1", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "Corrente", balance: 1520.75 },
      { id: "cc1", type: "CREDIT", name: "Cartão", balance: 830.1 },
    ],
  });
  await sincronizarItem({ cli, sb, tenantId: TENANT, itemId: ITEM }, { agora: () => new Date("2026-11-19T12:00:00Z") });
  const contas = (await sb.from("finance_bank_accounts")).data;
  const corrente = contas.find((c: any) => c.id === "c1");
  const cartao = contas.find((c: any) => c.tipo === "CARTAO_CREDITO");
  assert.equal(corrente.saldo_banco, 1520.75);
  assert.equal(corrente.saldo_banco_em, "2026-11-19T12:00:00.000Z");
  assert.equal(cartao.saldo_banco, -830.1);
});

test("sincronizarItem: conexão feita antes (só a corrente) ganha o cartão no próximo sincronizar, sem duplicar a corrente", async () => {
  const sb = bancoFalso({
    finance_bank_accounts: [{ id: "c1", tenant_id: TENANT, nome: "Caixa", banco: "Itaú" }],
    finance_bank_connections: [{ id: "m1", tenant_id: TENANT, item_id: ITEM, pluggy_account_id: "acc1", pluggy_account_type: "BANK", conta_bancaria_id: "c1" }],
    finance_extratos_importados: [],
  });
  const { cli } = pluggyFalso({});
  const r = await sincronizarItem({ cli, sb, tenantId: TENANT, itemId: ITEM });
  assert.equal(r.contas, 2);
  const conexoes = (await sb.from("finance_bank_connections")).data;
  assert.deepEqual(conexoes.map((c: any) => c.pluggy_account_id).sort(), ["acc1", "cc1"]);
  assert.equal(conexoes.find((c: any) => c.pluggy_account_id === "acc1").conta_bancaria_id, "c1");
});

// ── Segredo, permissões e webhook ───────────────────────────────────────────────
test("segredoConfere: só aceita o mesmo segredo (e nunca vazio)", () => {
  assert.equal(segredoConfere("abc", "abc"), true);
  assert.equal(segredoConfere("abd", "abc"), false);
  assert.equal(segredoConfere("abc", "abcd"), false);
  assert.equal(segredoConfere(undefined, "abc"), false);
  assert.equal(segredoConfere("abc", undefined), false);
  assert.equal(segredoConfere("", ""), false);
});

function bancoDePermissoes(o: { modules?: any; user: any; cargos?: any[]; colabCargos?: string[] }) {
  return bancoFalso({
    tenants: [{ id: TENANT, modules: o.modules ?? { financeiro: true }, deleted_at: null }],
    users: [{ id: "u1", ...o.user }],
    cargos: o.cargos ?? [],
    colaboradores: o.colabCargos ? [{ id: "col", tenant_id: TENANT, user_id: "u1", cargos: o.colabCargos }] : [],
  });
}

test("liberarFinanceiro: qualquer pessoa com o módulo na empresa e no cargo pode; admin não é exigido", async () => {
  const sb = bancoDePermissoes({ user: { role: "Financeiro", is_master: false, is_tenant_admin: false, tenant_id: TENANT }, cargos: [{ tenant_id: TENANT, nome: "Financeiro", modulos: ["financeiro", "crm"], restringir_aos_proprios_dados: false }] });
  assert.deepEqual(await liberarFinanceiro(sb, "u1", TENANT), { ok: true });
});

test("liberarFinanceiro: sem cargo cadastrado = sem restrição (como o menu); admin da empresa passa", async () => {
  const sem = bancoDePermissoes({ user: { role: "Qualquer", is_master: false, is_tenant_admin: false, tenant_id: TENANT } });
  assert.equal((await liberarFinanceiro(sem, "u1", TENANT)).ok, true);
  const adm = bancoDePermissoes({ user: { role: "Vendedor", is_master: false, is_tenant_admin: true, tenant_id: TENANT }, cargos: [{ tenant_id: TENANT, nome: "Vendedor", modulos: ["crm"], restringir_aos_proprios_dados: true }] });
  assert.equal((await liberarFinanceiro(adm, "u1", TENANT)).ok, true);
});

test("liberarFinanceiro: bloqueia módulo desligado, cargo sem Financeiro e perfil restrito aos próprios dados", async () => {
  const desligado = bancoDePermissoes({ modules: { crm: true }, user: { role: "X", is_master: false, is_tenant_admin: false, tenant_id: TENANT } });
  const r1 = await liberarFinanceiro(desligado, "u1", TENANT);
  assert.deepEqual({ ok: r1.ok, status: r1.status }, { ok: false, status: 403 });
  assert.match(r1.erro!, /módulo Financeiro/);

  const semFin = bancoDePermissoes({ user: { role: "Comercial", is_master: false, is_tenant_admin: false, tenant_id: TENANT }, cargos: [{ tenant_id: TENANT, nome: "Comercial", modulos: ["crm"], restringir_aos_proprios_dados: false }] });
  const r2 = await liberarFinanceiro(semFin, "u1", TENANT);
  assert.equal(r2.ok, false);
  assert.match(r2.erro!, /não tem acesso ao Financeiro/);

  const restrito = bancoDePermissoes({ user: { role: "Vendedor", is_master: false, is_tenant_admin: false, tenant_id: TENANT }, cargos: [{ tenant_id: TENANT, nome: "Vendedor", modulos: ["financeiro"], restringir_aos_proprios_dados: true }] });
  const r3 = await liberarFinanceiro(restrito, "u1", TENANT);
  assert.equal(r3.ok, false);
  assert.match(r3.erro!, /próprios dados/);
});

test("liberarFinanceiro: usa também os cargos do cadastro de colaborador; master passa mesmo sem o módulo", async () => {
  const porColab = bancoDePermissoes({ user: { role: "Login", is_master: false, is_tenant_admin: false, tenant_id: TENANT }, colabCargos: ["Comercial"], cargos: [{ tenant_id: TENANT, nome: "Comercial", modulos: ["crm"], restringir_aos_proprios_dados: false }] });
  assert.equal((await liberarFinanceiro(porColab, "u1", TENANT)).ok, false);
  const master = bancoDePermissoes({ modules: {}, user: { role: "Master", is_master: true, is_tenant_admin: false, tenant_id: "outra" } });
  assert.equal((await liberarFinanceiro(master, "u1", TENANT)).ok, true);
});

const cfgWebhook: PluggyConfig = { clientId: "cid", clientSecret: "sec", sandbox: false, publicAppUrl: "https://app.exemplo.com", webhookSecret: "meu-segredo" };

test("registrarWebhook: cria com o cabeçalho secreto, não duplica e exige https + segredo", async () => {
  const chamadas: any[] = [];
  const cli = (existentes: any[]) => ({ get: async () => ({ results: existentes }), post: async (c: string, corpo: any) => { chamadas.push([c, corpo]); return {}; }, delete: async () => undefined }) as any;

  const r1 = await registrarWebhook(cli([]), cfgWebhook);
  assert.deepEqual(r1, { criado: true, url: "https://app.exemplo.com/api/pluggy/webhook" });
  assert.deepEqual(chamadas[0], ["/webhooks", { event: "all", url: "https://app.exemplo.com/api/pluggy/webhook", headers: { [CABECALHO_SEGREDO]: "meu-segredo" } }]);

  chamadas.length = 0;
  const r2 = await registrarWebhook(cli([{ url: "https://app.exemplo.com/api/pluggy/webhook" }]), cfgWebhook);
  assert.equal(r2.criado, false);
  assert.equal(chamadas.length, 0, "já existe: não cria de novo");

  await assert.rejects(registrarWebhook(cli([]), { ...cfgWebhook, publicAppUrl: "http://localhost:3002" }), (e: any) => e instanceof ErroPluggy && e.status === 400 && /https/.test(e.message));
  await assert.rejects(registrarWebhook(cli([]), { ...cfgWebhook, webhookSecret: undefined }), (e: any) => e instanceof ErroPluggy && e.status === 400 && /PLUGGY_WEBHOOK_SECRET/.test(e.message));
});

function respostaFalsa() {
  const r: any = { codigo: 0, corpo: null, status(c: number) { r.codigo = c; return r; }, json(b: any) { r.corpo = b; return r; } };
  return r;
}
async function dispara(sb: any, req: any, cliFalso?: ClientePluggy) {
  Object.assign(process.env, { PLUGGY_CLIENT_ID: "cid", PLUGGY_CLIENT_SECRET: "sec", PLUGGY_WEBHOOK_SECRET: "meu-segredo" });
  delete process.env.PLUGGY_SIGNING_SECRET;
  const res = respostaFalsa();
  await createPluggyWebhookHandler({ supabaseService: sb, criarCliente: () => cliFalso as any })(req, res);
  return res;
}

test("webhook: sem o cabeçalho secreto (ou com o errado) é 401 e nada é sincronizado", async () => {
  const sb = cenario();
  const { cli, chamadas } = pluggyFalso({});
  const corpo = { event: "item/updated", clientId: "cid", itemId: ITEM };
  const r1 = await dispara(sb, { body: corpo, headers: {} }, cli);
  const r2 = await dispara(sb, { body: corpo, headers: { [CABECALHO_SEGREDO]: "errado" } }, cli);
  assert.deepEqual([r1.codigo, r2.codigo], [401, 401]);
  assert.equal(chamadas.length, 0);
});

test("webhook: com o cabeçalho certo, item/updated sincroniza (corpo já interpretado, como na Vercel)", async () => {
  const sb = cenario();
  const { cli } = pluggyFalso({ transacoes: { acc1: [[tx("w1", 10, "CREDIT")]] } });
  const res = await dispara(sb, { body: { event: "item/updated", clientId: "cid", itemId: ITEM }, headers: { [CABECALHO_SEGREDO]: "meu-segredo" } }, cli);
  assert.equal(res.codigo, 200);
  assert.deepEqual((await sb.from("finance_extratos_importados")).data.map((l: any) => l.documento), ["w1"]);
});

test("webhook: clientId de outra aplicação e item desconhecido são ignorados; item/error marca a conexão", async () => {
  const sb = cenario();
  const { cli, chamadas } = pluggyFalso({});
  const h = { [CABECALHO_SEGREDO]: "meu-segredo" };
  const outro = await dispara(sb, { body: { event: "item/updated", clientId: "OUTRO", itemId: ITEM }, headers: h }, cli);
  assert.deepEqual([outro.codigo, outro.corpo.ignorado], [200, true]);
  const desconhecido = await dispara(sb, { body: { event: "item/updated", clientId: "cid", itemId: "33333333-3333-3333-3333-333333333333" }, headers: h }, cli);
  assert.deepEqual([desconhecido.codigo, desconhecido.corpo.ignorado], [200, true]);
  assert.equal(chamadas.length, 0);

  const erro = await dispara(sb, { body: { event: "item/error", clientId: "cid", itemId: ITEM }, headers: h }, cli);
  assert.equal(erro.codigo, 200);
  const linha = (await sb.from("finance_bank_connections")).data[0];
  assert.equal(linha.status, "ERROR");
  assert.match(linha.last_error, /Reconecte/);
});

test("webhook: com signing secret e corpo bruto, assinatura inválida é 401 e válida passa", async () => {
  const sb = cenario();
  const { cli } = pluggyFalso({});
  Object.assign(process.env, { PLUGGY_CLIENT_ID: "cid", PLUGGY_CLIENT_SECRET: "sec", PLUGGY_WEBHOOK_SECRET: "meu-segredo", PLUGGY_SIGNING_SECRET: "assina" });
  const corpo = JSON.stringify({ event: "item/waiting_user_input", clientId: "cid", itemId: ITEM });
  const t = Math.floor(Date.now() / 1000);
  const boa = `t=${t},v1=${createHmac("sha256", "assina").update(`${t}.${corpo}`).digest("hex")}`;
  const h = { [CABECALHO_SEGREDO]: "meu-segredo" };
  const handler = createPluggyWebhookHandler({ supabaseService: sb, criarCliente: () => cli });
  const ruim = respostaFalsa();
  await handler({ body: Buffer.from(corpo), headers: { ...h, "x-pluggy-signature": `t=${t},v1=00` } }, ruim);
  const ok = respostaFalsa();
  await handler({ body: Buffer.from(corpo), headers: { ...h, "x-pluggy-signature": boa } }, ok);
  delete process.env.PLUGGY_SIGNING_SECRET;
  assert.deepEqual([ruim.codigo, ok.codigo], [401, 200]);
});
