import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import {
  assinaturaValida, criarClientePluggy, ErroPluggy, lerConfigPluggy, paraLinhaExtrato, proximaPagina, sincronizarItem, webhookUrlDe,
  type ClientePluggy,
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
      if (st.op === "select") return st.unico ? { data: alvo[0] ?? null, error: alvo[0] ? null : { message: "sem linha" } } : { data: alvo, error: null };
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
      single() { st.unico = true; return b; },
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
  assert.deepEqual(credito, { id: "pluggy-a", tenant_id: TENANT, data: "10/11/2026", descricao: "Mov a", documento: "a", valor: 150.5, tipo: "credito", banco: "Caixa", conciliado: false });
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
  assert.deepEqual({ contas: r1.contas, importadas: r1.importadas, parcial: r1.parcial, status: r1.status }, { contas: 1, importadas: 3, parcial: false, status: "UPDATED" });

  const extratos = sb.from("finance_extratos_importados");
  const linhas = (await extratos).data;
  assert.deepEqual(linhas.map((l: any) => l.documento).sort(), ["t1", "t2", "t4"]);
  assert.ok(linhas.every((l: any) => l.banco === "Caixa" && l.tenant_id === TENANT && l.conciliado === false), "rótulo = nome da conta, para o filtro da Conciliação");

  const conexoes = (await sb.from("finance_bank_connections")).data;
  assert.equal(conexoes.length, 1, "o marcador provisório foi trocado pela conta real do banco");
  assert.equal(conexoes[0].pluggy_account_id, "acc1");
  assert.equal(conexoes[0].conta_bancaria_id, "c1");
  assert.equal(conexoes[0].connector_name, "Itaú");
  assert.equal(conexoes[0].last_sync_at, "2026-11-19T12:00:00.000Z");

  const conta = (await sb.from("finance_bank_accounts")).data[0];
  assert.deepEqual({ s: conta.conexao_status, p: conta.conexao_provedor, b: conta.banco }, { s: "Conectada", p: "Pluggy", b: "Itaú" });

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
  const pedidos = chamadas.filter((c) => c.startsWith("/v2/transactions"));
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

test("sincronizarItem: segunda conta bancária da mesma conexão vira uma conta nova; cartão de crédito é ignorado", async () => {
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
  assert.equal(r.contas, 2);
  assert.equal(r.importadas, 2);
  const contas = (await sb.from("finance_bank_accounts")).data;
  assert.equal(contas.length, 2);
  const nova = contas.find((c: any) => c.id !== "c1");
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
