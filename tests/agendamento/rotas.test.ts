import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { registerAgendamentoRoutes } from "../../server/agendamento.js";
import { assinar } from "../../server/agendamentoPuro.js";
import { diaDaSemana, somarDias, unidadeId } from "../../src/lib/agendamento/engine.js";
import { criarFakeDb, criarFakeApp } from "./fakeDb.js";

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const SEGREDO = "seg-test";
const CHAVE = `agendamento:${SEGREDO}`;
const dia = (aberto: boolean, inicio = 18, fim = 0) => ({ aberto, inicio, fim });
const HORARIOS = [dia(true, 17), dia(false), dia(true), dia(true), dia(true), dia(true), dia(true, 17)];

/** Primeiro dia (a partir de 2099) com o dia da semana pedido: datas futuras, nunca "passadas". */
const diaDa = (semana: number, deslocar = 0) => { let d = "2099-01-01"; while (diaDaSemana(d) !== semana) d = somarDias(d, 1); return somarDias(d, deslocar * 7); };
const TERCA = diaDa(2);
const SEGUNDA = diaDa(1);

const cfgBase = (over: any = {}) => ({
  tenant_id: T1, slug: "to-na-pista", ativo: true, nome_estabelecimento: "Tô Na Pista", endereco: "Rua 1", telefone: null, whatsapp: "63999990000", logo_url: null,
  recurso_singular: "Pista", recurso_plural: "Pistas", qtd_recursos: 6, pessoas_por_recurso: 6, preco_dia_util: 100, preco_fim_semana: 140, dias_fim_semana: [0, 5, 6],
  horarios: HORARIOS, datas_bloqueadas: [], tipos_evento: ["Jogo normal", "Aniversário"], expiracao_pendente_min: 30, fuso: "America/Sao_Paulo", pagamento_online: false,
  mesas_ativo: true, mesas_max_por_dia: 2, cadeiras_max: 25, permissoes_equipe: { criar: true, editar: true, cancelar: false, receber: true, sem_contato: false }, ...over,
});

const semMiddleware = (_q: any, _s: any, n: any) => n && n();
const orig = { get: (axios as any).get, post: (axios as any).post };
afterEach(() => { (axios as any).get = orig.get; (axios as any).post = orig.post; });

function montar(over: { cfg?: any; modules?: any; extra?: Record<string, any[]> } = {}) {
  const db = criarFakeDb({
    tenants: [{ id: T1, name: "Tô Na Pista", modules: over.modules ?? { agendamento: true }, deleted_at: null }, { id: T2, name: "Outra", modules: {}, deleted_at: null }],
    agendamento_config: [cfgBase(over.cfg), cfgBase({ tenant_id: T2, slug: "outra" })],
    users: [{ id: "admin", name: "Admin", is_master: false, is_tenant_admin: true, tenant_id: T1 }, { id: "staff", name: "Atendente", is_master: false, is_tenant_admin: false, tenant_id: T1 }],
    ...(over.extra ?? {}),
  });
  const { app, chamar } = criarFakeApp();
  registerAgendamentoRoutes(app, { requireUser: semMiddleware as any, resolveTenant: async (req: any) => req.tenantId ?? T1, supabaseService: db, limiterPublico: semMiddleware as any, segredo: SEGREDO, appUrl: "https://spy.test", cronSecret: "cron" });
  const equipe = (usuario: "admin" | "staff") => (m: string, c: string, req: any = {}) => chamar(m, c, { user: { id: usuario, email: `${usuario}@x.com` }, ...req });
  return { db, chamar, admin: equipe("admin"), staff: equipe("staff") };
}
const reservas = (db: any) => db.t.agendamento_reservas ?? [];
const pedidoSite = (over: any = {}) => ({ nome: "Ana Silva", telefone: "(63) 99999-1111", email: "ana@x.com", data: TERCA, horas: ["19:00", "20:00"], qtdRecursos: 2, qtdPessoas: 10, tipoEvento: "Jogo normal", ...over });

// ── página pública ───────────────────────────────────────────────────────────

test("público: configuração mostra o necessário e NADA interno", async () => {
  const { chamar } = montar();
  const r = await chamar("GET", "/api/agendar/:slug/config", { params: { slug: "to-na-pista" } });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.qtdRecursos, 6);
  assert.equal(r.corpo.pagamentoOnline, false);
  for (const proibido of ["tenant_id", "tenantId", "permissoes_equipe", "permissoesEquipe", "accessToken", "mp_access_token"]) assert.equal(proibido in r.corpo, false, proibido);
  assert.equal((await chamar("GET", "/api/agendar/:slug/config", { params: { slug: "nao-existe" } })).status, 404);
  assert.equal((await chamar("GET", "/api/agendar/:slug/config", { params: { slug: "A B" } })).status, 404);
});

test("público: empresa sem o módulo ligado não tem página", async () => {
  const { chamar } = montar({ modules: {} });
  assert.equal((await chamar("GET", "/api/agendar/:slug/config", { params: { slug: "to-na-pista" } })).status, 404);
  assert.equal((await chamar("POST", "/api/agendar/:slug/reservar", { params: { slug: "to-na-pista" }, body: pedidoSite() })).status, 404);
});

test("público: disponibilidade mostra vagas, dia fechado vem vazio e não vaza dados de outros clientes", async () => {
  const { chamar, db } = montar();
  await chamar("POST", "/api/agendar/:slug/reservar", { params: { slug: "to-na-pista" }, body: pedidoSite({ horas: ["19:00"], qtdRecursos: 4, qtdPessoas: 20 }) });
  const r = await chamar("GET", "/api/agendar/:slug/disponibilidade", { params: { slug: "to-na-pista" }, query: { data: TERCA } });
  const s19 = r.corpo.slots.find((s: any) => s.hora === "19:00");
  assert.equal(s19.livres, 2);
  assert.equal(r.corpo.slots.find((s: any) => s.hora === "20:00").livres, 6);
  assert.equal(JSON.stringify(r.corpo).includes("Ana"), false);
  assert.equal(JSON.stringify(r.corpo).includes("9999"), false);
  assert.deepEqual((await chamar("GET", "/api/agendar/:slug/disponibilidade", { params: { slug: "to-na-pista" }, query: { data: SEGUNDA } })).corpo.slots, []);
  assert.equal((await chamar("GET", "/api/agendar/:slug/disponibilidade", { params: { slug: "to-na-pista" }, query: { data: "ontem" } })).status, 400);
  assert.ok(reservas(db).length === 1);
});

test("público: reserva calcula o preço no servidor (ignora qualquer valor enviado) e vira 'pagar no local' sem pagamento online", async () => {
  const { chamar, db } = montar();
  const r = await chamar("POST", "/api/agendar/:slug/reservar", { params: { slug: "to-na-pista" }, body: pedidoSite({ valor: 1, valorTotal: 1, total: 1, status: "Confirmada", statusPagamento: "Pago" }) });
  assert.equal(r.status, 201);
  assert.equal(r.corpo.total, 400); // terça: 100/hora × 2 pistas × 2 horas
  assert.equal(r.corpo.pagamento.tipo, "local");
  const linhas = reservas(db);
  assert.equal(linhas.length, 1); // 19h e 20h seguidas = uma faixa de 2h
  assert.equal(linhas[0].duracao, 2);
  assert.equal(linhas[0].valor_total, 400);
  assert.equal(linhas[0].status, "Pendente"); // o cliente não consegue se auto-confirmar
  assert.equal(linhas[0].status_pagamento, "Pendente");
  assert.equal(linhas[0].pagar_no_local, true);
  assert.equal(linhas[0].origem, "site");
  assert.equal(linhas[0].contato_telefone, "63999991111");
  assert.ok(db.t.leads?.length >= 1, "criou o lead");
  assert.ok(db.t.agendamento_auditoria?.length >= 1, "deixou trilha");
});

test("público: faixas separadas viram reservas do mesmo grupo e o valor fecha no total", async () => {
  const { chamar, db } = montar();
  const r = await chamar("POST", "/api/agendar/:slug/reservar", { params: { slug: "to-na-pista" }, body: pedidoSite({ horas: ["18:00", "21:00", "22:00"], qtdRecursos: 1, qtdPessoas: 4 }) });
  assert.equal(r.status, 201);
  const linhas = reservas(db);
  assert.equal(linhas.length, 2);
  assert.equal(new Set(linhas.map((l: any) => l.grupo_id)).size, 1);
  assert.equal(linhas.reduce((s: number, l: any) => s + l.valor_total, 0), 300);
});

test("público: recusa dados ruins sem gravar nada", async () => {
  const { chamar, db } = montar();
  const tenta = async (over: any) => (await chamar("POST", "/api/agendar/:slug/reservar", { params: { slug: "to-na-pista" }, body: pedidoSite(over) })).status;
  assert.equal(await tenta({ nome: "A" }), 400);
  assert.equal(await tenta({ telefone: "123" }), 400);
  assert.equal(await tenta({ email: "sem-arroba" }), 400);
  assert.equal(await tenta({ horas: [] }), 400);
  assert.equal(await tenta({ data: SEGUNDA }), 400); // fechado
  assert.equal(await tenta({ data: "2000-01-01" }), 400); // passado
  assert.equal(await tenta({ qtdRecursos: 1, qtdPessoas: 7 }), 400); // 6 por pista
  assert.equal(await tenta({ qtdRecursos: 7, qtdPessoas: 7 }), 400);
  assert.equal(await tenta({ horas: ["12:00"] }), 400); // fora do funcionamento
  assert.equal(await tenta({ horas: ["18:30"] }), 400);
  assert.equal(await tenta({ horas: Array.from({ length: 30 }, (_, i) => `${i}:00`) }), 400);
  assert.equal(reservas(db).length, 0);
});

test("público: robô que preenche o campo escondido não cria nada", async () => {
  const { chamar, db } = montar();
  const r = await chamar("POST", "/api/agendar/:slug/reservar", { params: { slug: "to-na-pista" }, body: pedidoSite({ website: "http://spam.com" }) });
  assert.equal(r.status, 200);
  assert.equal(reservas(db).length, 0);
});

test("público: duas pessoas pela última vaga — só uma passa; sem vaga devolve 409 e não deixa meia reserva", async () => {
  const { chamar, db } = montar();
  const corpo = (nome: string, tel: string) => pedidoSite({ nome, telefone: tel, horas: ["19:00"], qtdRecursos: 6, qtdPessoas: 36 });
  const a = await chamar("POST", "/api/agendar/:slug/reservar", { params: { slug: "to-na-pista" }, body: corpo("Ana", "63999991111") });
  const b = await chamar("POST", "/api/agendar/:slug/reservar", { params: { slug: "to-na-pista" }, body: corpo("Beto", "63999992222") });
  assert.equal(a.status, 201);
  assert.equal(b.status, 400); // a validação já enxerga a vaga ocupada
  assert.equal(reservas(db).length, 1);
  // Corrida de verdade: a validação passou, mas a vaga foi tomada no meio — o banco recusa (409) e nada fica gravado.
  const { chamar: c2, db: db2 } = montar();
  const original = db2.rpc;
  (db2 as any).rpc = async (nome: string, args: any) => {
    if (nome === "agendamento_reservar") await original(nome, { p_tenant: T1, p_itens: [{ data: TERCA, hora: "19:00", duracao: 1, qtd_recursos: 6, contato_nome: "Furão", status: "Confirmada" }] });
    return original(nome, args);
  };
  const c = await c2("POST", "/api/agendar/:slug/reservar", { params: { slug: "to-na-pista" }, body: pedidoSite({ telefone: "63999993333", horas: ["19:00"], qtdRecursos: 2, qtdPessoas: 10 }) });
  assert.equal(c.status, 409);
  assert.equal(reservas(db2).length, 1);
});

test("público: limite de pedidos em aberto por telefone (anti-acúmulo de agenda)", async () => {
  const { chamar, db } = montar();
  const faz = (i: number) => chamar("POST", "/api/agendar/:slug/reservar", { params: { slug: "to-na-pista" }, body: pedidoSite({ horas: [`${18 + i}:00`], qtdRecursos: 1, qtdPessoas: 2 }) });
  assert.equal((await faz(0)).status, 201);
  assert.equal((await faz(1)).status, 201);
  assert.equal((await faz(2)).status, 201);
  const quarta = await faz(3);
  assert.equal(quarta.status, 429);
  assert.equal(reservas(db).length, 3);
});

test("público: com pagamento online gera a cobrança com o total do servidor e referência do GRUPO; falha do Mercado Pago libera as vagas", async () => {
  const extra = { app_settings: [{ tenant_id: T1, key: "integracoes_payments", value: { mercadoPago: { accessToken: "TOKEN_T1", connected: true } } }] };
  const { chamar, db } = montar({ cfg: { pagamento_online: true }, extra });
  let enviado: any;
  (axios as any).post = async (url: string, body: any, cfg: any) => { enviado = { url, body, auth: cfg?.headers?.Authorization }; return { data: { id: "pref-1", init_point: "https://mp/pagar" } }; };
  const r = await chamar("POST", "/api/agendar/:slug/reservar", { params: { slug: "to-na-pista" }, body: pedidoSite({ horas: ["18:00", "20:00"], qtdRecursos: 1, qtdPessoas: 2, valor: 1 }) });
  assert.equal(r.status, 201);
  assert.equal(r.corpo.pagamento.tipo, "online");
  assert.equal(r.corpo.pagamento.url, "https://mp/pagar");
  assert.equal(enviado.url, "https://api.mercadopago.com/checkout/preferences");
  assert.equal(enviado.auth, "Bearer TOKEN_T1");
  assert.equal(enviado.body.items[0].unit_price, 200);
  assert.equal(enviado.body.external_reference, r.corpo.grupoId);
  assert.match(enviado.body.notification_url, /\/api\/agendamento\/mp-webhook\/11111111-1111-4111-8111-111111111111\?t=[0-9a-f]{32}$/);
  assert.equal(reservas(db).every((l: any) => l.pagar_no_local === false && l.mp_preference_id === "pref-1"), true);
  assert.equal(JSON.stringify(r.corpo).includes("TOKEN_T1"), false);

  const { chamar: c2, db: db2 } = montar({ cfg: { pagamento_online: true }, extra });
  (axios as any).post = async () => { throw new Error("MP fora do ar"); };
  const f = await c2("POST", "/api/agendar/:slug/reservar", { params: { slug: "to-na-pista" }, body: pedidoSite() });
  assert.equal(f.status, 502);
  assert.equal(reservas(db2).every((l: any) => l.status === "Cancelada"), true);
});

test("público: pagamento online ligado mas sem credencial do Mercado Pago volta para 'pagar no local'", async () => {
  const { chamar } = montar({ cfg: { pagamento_online: true } });
  const cfg = await chamar("GET", "/api/agendar/:slug/config", { params: { slug: "to-na-pista" } });
  assert.equal(cfg.corpo.pagamentoOnline, false);
  const r = await chamar("POST", "/api/agendar/:slug/reservar", { params: { slug: "to-na-pista" }, body: pedidoSite() });
  assert.equal(r.corpo.pagamento.tipo, "local");
});

test("público: acompanhar pedido só com o link assinado", async () => {
  const { chamar } = montar();
  const r = await chamar("POST", "/api/agendar/:slug/reservar", { params: { slug: "to-na-pista" }, body: pedidoSite() });
  const { grupoId, token } = r.corpo;
  const ok = await chamar("GET", "/api/agendar/:slug/pedido/:grupoId", { params: { slug: "to-na-pista", grupoId }, query: { t: token } });
  assert.equal(ok.status, 200);
  assert.equal(ok.corpo.situacao, "aguardando");
  assert.equal(ok.corpo.total, 400);
  assert.equal((await chamar("GET", "/api/agendar/:slug/pedido/:grupoId", { params: { slug: "to-na-pista", grupoId }, query: { t: "forjado" } })).status, 404);
  assert.equal((await chamar("GET", "/api/agendar/:slug/pedido/:grupoId", { params: { slug: "to-na-pista", grupoId }, query: {} })).status, 404);
});

// ── aviso de pagamento do Mercado Pago ───────────────────────────────────────

async function pedidoOnline(pagamentoMin = 5, extraCfg: any = {}) {
  const extra = { app_settings: [{ tenant_id: T1, key: "integracoes_payments", value: { mercadoPago: { accessToken: "TOKEN_T1" } } }] };
  const m = montar({ cfg: { pagamento_online: true, ...extraCfg }, extra });
  (axios as any).post = async () => ({ data: { id: "pref-1", init_point: "https://mp/pagar" } });
  const r = await m.chamar("POST", "/api/agendar/:slug/reservar", { params: { slug: "to-na-pista" }, body: pedidoSite({ horas: ["18:00", "20:00"], qtdRecursos: 2, qtdPessoas: 10 }) });
  for (const l of reservas(m.db)) l.created_at = new Date(Date.now() - pagamentoMin * 60000).toISOString();
  return { ...m, grupoId: r.corpo.grupoId as string, total: r.corpo.total as number };
}
const aviso = (chamar: any, over: any = {}) => chamar("POST", "/api/agendamento/mp-webhook/:tenantId", { params: { tenantId: T1 }, query: { t: assinar(T1, CHAVE), "data.id": "123456789" }, body: {}, ...over });
const pagamentoMP = (grupoId: string, valor: number, over: any = {}) => { (axios as any).get = async () => ({ data: { status: "approved", external_reference: grupoId, transaction_amount: valor, payment_type_id: "bank_transfer", ...over } }); };

test("aviso de pagamento: confirma TODAS as faixas do grupo, grava forma e cria o lançamento financeiro", async () => {
  const { chamar, db, grupoId, total } = await pedidoOnline();
  pagamentoMP(grupoId, total);
  const r = await aviso(chamar);
  assert.equal(r.status, 200);
  const linhas = reservas(db);
  assert.equal(linhas.length, 2);
  assert.equal(linhas.every((l: any) => l.status === "Confirmada" && l.status_pagamento === "Pago" && l.forma_pagamento === "PIX" && l.mp_payment_id === "123456789"), true);
  const fin = db.t.finance_entries ?? [];
  assert.equal(fin.length, 2); // um lançamento por faixa
  assert.equal(fin.reduce((s: number, f: any) => s + f.value, 0), total);
  assert.equal(fin[0].category, "Reservas");
});

test("aviso de pagamento: é idempotente (avisos repetidos não duplicam nada)", async () => {
  const { chamar, db, grupoId, total } = await pedidoOnline();
  pagamentoMP(grupoId, total);
  await aviso(chamar); await aviso(chamar); await aviso(chamar);
  assert.equal((db.t.finance_entries ?? []).length, 2);
  assert.equal((db.t.agendamento_auditoria ?? []).filter((a: any) => a.acao === "PAGAMENTO").length, 2);
});

test("aviso de pagamento: assinatura inválida, ausente ou de outra empresa não faz nada", async () => {
  const { chamar, db, grupoId, total } = await pedidoOnline();
  let consultou = false;
  (axios as any).get = async () => { consultou = true; return { data: { status: "approved", external_reference: grupoId, transaction_amount: total } }; };
  await aviso(chamar, { query: { t: "forjado", "data.id": "123456789" } });
  await aviso(chamar, { query: { "data.id": "123456789" } });
  await aviso(chamar, { query: { t: assinar(T2, CHAVE), "data.id": "123456789" } }); // assinatura de outra empresa
  assert.equal(consultou, false);
  assert.equal(reservas(db).every((l: any) => l.status === "Pendente"), true);
});

test("aviso de pagamento: valor menor que o combinado NÃO confirma", async () => {
  const { chamar, db, grupoId, total } = await pedidoOnline();
  pagamentoMP(grupoId, total - 50);
  await aviso(chamar);
  assert.equal(reservas(db).every((l: any) => l.status === "Pendente" && l.status_pagamento === "Pendente"), true);
  assert.ok((db.t.agendamento_auditoria ?? []).some((a: any) => a.acao === "PAGAMENTO_DIVERGENTE"));
});

test("aviso de pagamento: pagamento não aprovado, de outra empresa (consulta falha) ou sem referência é ignorado", async () => {
  const { chamar, db, grupoId, total } = await pedidoOnline();
  pagamentoMP(grupoId, total, { status: "pending" });
  await aviso(chamar);
  pagamentoMP("nao-e-uuid", total);
  await aviso(chamar);
  (axios as any).get = async () => { throw new Error("404"); };
  await aviso(chamar);
  pagamentoMP("11111111-2222-3333-4444-555555555555", total); // grupo que não existe nesta empresa
  await aviso(chamar);
  assert.equal(reservas(db).every((l: any) => l.status === "Pendente"), true);
});

test("aviso de pagamento: pagou atrasado e a vaga foi ocupada → estorno automático e cancela", async () => {
  const { chamar, db, grupoId, total } = await pedidoOnline(50);
  // Outra pessoa confirmou o mesmo horário (6 pistas) enquanto essa pagava.
  await db.rpc("agendamento_reservar", { p_tenant: T1, p_itens: [{ data: TERCA, hora: "18:00", duracao: 1, qtd_recursos: 5, contato_nome: "Furão", status: "Confirmada", status_pagamento: "Pago" }] });
  pagamentoMP(grupoId, total);
  const estornos: any[] = [];
  (axios as any).post = async (url: string, _b: any, cfg: any) => { estornos.push({ url, key: cfg?.headers?.["X-Idempotency-Key"] }); return { data: {} }; };
  await aviso(chamar);
  assert.equal(estornos.length, 1);
  assert.match(estornos[0].url, /\/v1\/payments\/123456789\/refunds$/);
  assert.ok(estornos[0].key);
  const doGrupo = reservas(db).filter((l: any) => l.grupo_id === grupoId);
  assert.equal(doGrupo.every((l: any) => l.status === "Cancelada" && l.status_pagamento === "Reembolsado"), true);
  assert.equal((db.t.finance_entries ?? []).length, 0); // nunca virou receita
});

test("aviso de pagamento: estorno que falha vira 'Pendente Estorno' para devolver à mão", async () => {
  const { chamar, db, grupoId, total } = await pedidoOnline(50);
  await db.rpc("agendamento_reservar", { p_tenant: T1, p_itens: [{ data: TERCA, hora: "18:00", duracao: 1, qtd_recursos: 5, contato_nome: "Furão", status: "Confirmada", status_pagamento: "Pago" }] });
  pagamentoMP(grupoId, total);
  (axios as any).post = async () => { throw new Error("MP recusou"); };
  await aviso(chamar);
  const doGrupo = reservas(db).filter((l: any) => l.grupo_id === grupoId);
  assert.equal(doGrupo.every((l: any) => l.status === "Cancelada" && l.status_pagamento === "Pendente Estorno"), true);
  assert.ok(doGrupo[0].observacoes.includes("ERRO NO ESTORNO"));
});

test("aviso de pagamento: atrasado mas com a vaga livre confirma", async () => {
  const { chamar, db, grupoId, total } = await pedidoOnline(50);
  pagamentoMP(grupoId, total);
  await aviso(chamar);
  const doGrupo = reservas(db).filter((l: any) => l.grupo_id === grupoId);
  assert.equal(doGrupo.every((l: any) => l.status === "Confirmada" && l.observacoes.includes("PAGO COM ATRASO")), true);
});

// ── equipe ───────────────────────────────────────────────────────────────────

const novaEquipe = (over: any = {}) => ({ nome: "Cris Souza", telefone: "63988887777", data: TERCA, horas: ["19:00"], qtdRecursos: 2, qtdPessoas: 8, tipoEvento: "Aniversário", ...over });

test("equipe: sem o módulo ligado a rota recusa", async () => {
  const { staff } = montar({ modules: {} });
  const r = await staff("POST", "/api/agendamento/reservas", { body: novaEquipe() });
  assert.equal(r.status, 403);
  assert.equal(r.corpo.code, "modulo_desligado");
});

test("equipe: cria reserva já recebida (pix), com lançamento no financeiro; cliente sem contato exige permissão", async () => {
  const { staff, admin, db } = montar();
  const r = await staff("POST", "/api/agendamento/reservas", { body: novaEquipe({ pagamento: { modo: "receber", forma: "pix" } }) });
  assert.equal(r.status, 201);
  const l = reservas(db)[0];
  assert.equal(l.status, "Confirmada");
  assert.equal(l.status_pagamento, "Pago");
  assert.equal(l.valor_total, 200);
  assert.equal(l.origem, "equipe");
  assert.equal(l.criado_por, "staff");
  assert.equal((db.t.finance_entries ?? [])[0].value, 200);

  const semContato = await staff("POST", "/api/agendamento/reservas", { body: novaEquipe({ telefone: "", email: "", horas: ["21:00"] }) });
  assert.equal(semContato.status, 400);
  assert.equal((await admin("POST", "/api/agendamento/reservas", { body: novaEquipe({ telefone: "", email: "", horas: ["21:00"] }) })).status, 201); // admin pode
});

test("equipe: permissões da configuração valem para quem não é administrador", async () => {
  const { staff, admin, db } = montar({ cfg: { permissoes_equipe: { criar: false, editar: false, cancelar: false, receber: false, sem_contato: false } } });
  assert.equal((await staff("POST", "/api/agendamento/reservas", { body: novaEquipe() })).status, 403);
  const criada = await admin("POST", "/api/agendamento/reservas", { body: novaEquipe() });
  assert.equal(criada.status, 201);
  const id = criada.corpo.reservas[0].id;
  assert.equal((await staff("PATCH", "/api/agendamento/reservas/:id", { params: { id }, body: { observacoes: "x" } })).status, 403);
  assert.equal((await staff("POST", "/api/agendamento/reservas/:id/status", { params: { id }, body: { status: "Cancelada", motivo: "teste" } })).status, 403);
  assert.equal((await staff("POST", "/api/agendamento/reservas/:id/pagamento", { params: { id }, body: { pedido: { modo: "receber", forma: "PIX" } } })).status, 403);
  assert.equal(reservas(db).length, 1);
});

test("equipe: cortesia só administrador; pagamento misto reparte entre as faixas", async () => {
  const { staff, admin, db } = montar();
  const cort = await staff("POST", "/api/agendamento/reservas", { body: novaEquipe({ pagamento: { modo: "receber", forma: "CORTESIA" } }) });
  assert.equal(cort.status, 400);
  assert.equal(reservas(db).length, 0);
  const adm = await admin("POST", "/api/agendamento/reservas", { body: novaEquipe({ pagamento: { modo: "receber", forma: "CORTESIA" } }) });
  assert.equal(adm.status, 201);
  assert.equal(reservas(db)[0].valor_total, 0);
  assert.match(reservas(db)[0].observacoes, /Cortesia/);

  const misto = await staff("POST", "/api/agendamento/reservas", { body: novaEquipe({ horas: ["18:00", "21:00"], qtdRecursos: 1, qtdPessoas: 4, telefone: "63977776666", pagamento: { modo: "receber", misto: [{ method: "PIX", amount: 120 }, { method: "DINHEIRO", amount: 80 }] } }) });
  assert.equal(misto.status, 201);
  const faixas = reservas(db).filter((l: any) => l.contato_telefone === "63977776666");
  assert.equal(faixas.length, 2);
  for (const f of faixas) assert.equal(f.detalhes_pagamento.reduce((s: number, d: any) => s + d.amount, 0), f.valor_total);
  const errado = await staff("POST", "/api/agendamento/reservas", { body: novaEquipe({ horas: ["22:00"], pagamento: { modo: "receber", misto: [{ method: "PIX", amount: 10 }] } }) });
  assert.equal(errado.status, 400);
});

test("equipe: encaixe manual fora do horário com valor próprio; comanda exige número", async () => {
  const { staff, db } = montar();
  const man = await staff("POST", "/api/agendamento/reservas", { body: { ...novaEquipe(), horas: undefined, manual: { hora: "16:30", duracao: 1.5, valor: 123.45 } } });
  assert.equal(man.status, 201);
  assert.equal(reservas(db)[0].valor_total, 123.45);
  assert.equal(reservas(db)[0].hora, "16:30");
  assert.match(reservas(db)[0].observacoes, /Manual/);
  assert.equal((await staff("POST", "/api/agendamento/reservas", { body: novaEquipe({ horas: ["22:00"], pagamento: { modo: "comanda" } }) })).status, 400);
  const com = await staff("POST", "/api/agendamento/reservas", { body: novaEquipe({ horas: ["22:00"], telefone: "63966665555", pagamento: { modo: "comanda", comanda: "42" } }) });
  assert.equal(com.status, 201);
  const l = reservas(db).find((x: any) => x.contato_telefone === "63966665555");
  assert.equal(l.pagar_no_local, true);
  assert.equal(l.comanda, "42");
  assert.equal(l.status_pagamento, "Pendente");
});

test("equipe: mesa do restaurante respeita habilitação, lugares e limite do dia", async () => {
  const { staff, db } = montar({ cfg: { mesas_max_por_dia: 1 } });
  assert.equal((await staff("POST", "/api/agendamento/reservas", { body: novaEquipe({ mesa: { ativo: true, cadeiras: 0 } }) })).status, 400);
  assert.equal((await staff("POST", "/api/agendamento/reservas", { body: novaEquipe({ mesa: { ativo: true, cadeiras: 8, aniversariante: "Cris" } }) })).status, 201);
  assert.equal(reservas(db)[0].aniversariante, "Cris");
  assert.equal((await staff("POST", "/api/agendamento/reservas", { body: novaEquipe({ horas: ["21:00"], telefone: "63955554444", mesa: { ativo: true, cadeiras: 8 } }) })).status, 400); // limite do dia
  const { staff: s2 } = montar({ cfg: { mesas_ativo: false } });
  assert.equal((await s2("POST", "/api/agendamento/reservas", { body: novaEquipe({ mesa: { ativo: true, cadeiras: 8 } }) })).status, 400);
});

test("equipe: edição confere a vaga, só admin muda o valor, e a própria reserva não conta contra si", async () => {
  const { staff, admin, db } = montar();
  const a = (await admin("POST", "/api/agendamento/reservas", { body: novaEquipe({ qtdRecursos: 5, qtdPessoas: 20 }) })).corpo.reservas[0];
  await admin("POST", "/api/agendamento/reservas", { body: novaEquipe({ horas: ["20:00"], qtdRecursos: 3, qtdPessoas: 10, telefone: "63911112222" }) });
  assert.equal((await staff("PATCH", "/api/agendamento/reservas/:id", { params: { id: a.id }, body: { duracao: 2 } })).status, 400); // 20h já tem 3 → 5+3 > 6
  assert.equal((await staff("PATCH", "/api/agendamento/reservas/:id", { params: { id: a.id }, body: { qtdRecursos: 6, qtdPessoas: 20 } })).status, 200); // própria reserva não conta
  assert.equal((await staff("PATCH", "/api/agendamento/reservas/:id", { params: { id: a.id }, body: { valorTotal: 1 } })).status, 403);
  assert.equal((await admin("PATCH", "/api/agendamento/reservas/:id", { params: { id: a.id }, body: { valorTotal: 321.5 } })).status, 200);
  assert.equal(reservas(db).find((l: any) => l.id === a.id).valor_total, 321.5);
  assert.equal((await staff("PATCH", "/api/agendamento/reservas/:id", { params: { id: a.id }, body: { qtdPessoas: 99 } })).status, 400);
  assert.equal((await staff("PATCH", "/api/agendamento/reservas/:id", { params: { id: "11111111-2222-3333-4444-555555555555" }, body: { observacoes: "x" } })).status, 404);
});

test("equipe: cancelar exige permissão e motivo; reservas de outra empresa não aparecem", async () => {
  const { admin, db } = montar({ extra: { agendamento_reservas: [{ id: "99999999-2222-3333-4444-555555555555", tenant_id: T2, grupo_id: "g", data: TERCA, hora: "19:00", duracao: 1, qtd_recursos: 1, status: "Pendente", status_pagamento: "Pendente", contato_nome: "De outro", created_at: new Date().toISOString() }] } });
  const r = (await admin("POST", "/api/agendamento/reservas", { body: novaEquipe({ pagamento: { modo: "receber", forma: "PIX" } }) })).corpo.reservas[0];
  assert.equal((await admin("POST", "/api/agendamento/reservas/:id/status", { params: { id: r.id }, body: { status: "Cancelada" } })).status, 400);
  assert.equal((await admin("POST", "/api/agendamento/reservas/:id/status", { params: { id: r.id }, body: { status: "Cancelada", motivo: "cliente desistiu" } })).status, 200);
  assert.equal(reservas(db).find((l: any) => l.id === r.id).status, "Cancelada");
  assert.equal((db.t.finance_entries ?? [])[0].value, 0); // receita retratada
  assert.equal((await admin("POST", "/api/agendamento/reservas/:id/status", { params: { id: "99999999-2222-3333-4444-555555555555" }, body: { status: "Cancelada", motivo: "ataque" } })).status, 404);
  assert.equal(reservas(db).find((l: any) => l.id === "99999999-2222-3333-4444-555555555555").status, "Pendente");
});

test("equipe: reserva paga não volta para pendente; voltar de pendente limpa o check-in", async () => {
  const { staff, db } = montar();
  const paga = (await staff("POST", "/api/agendamento/reservas", { body: novaEquipe({ pagamento: { modo: "receber", forma: "PIX" } }) })).corpo.reservas[0];
  assert.equal((await staff("POST", "/api/agendamento/reservas/:id/status", { params: { id: paga.id }, body: { status: "Pendente" } })).status, 409);
  assert.equal(reservas(db)[0].status, "Confirmada");
  assert.equal((await staff("POST", "/api/agendamento/reservas/:id/status", { params: { id: paga.id }, body: { status: "Confirmada" } })).status, 400); // confirmar é só pelo recebimento
});

test("equipe: check-in por unidade só aceita unidades da reserva; recalcula o status; atribui pistas sem repetir", async () => {
  const { staff, db } = montar();
  const r = (await staff("POST", "/api/agendamento/reservas", { body: novaEquipe({ horas: ["19:00", "20:00"], qtdRecursos: 2, qtdPessoas: 8, pagamento: { modo: "receber", forma: "PIX" } }) })).corpo.reservas[0];
  const u1 = unidadeId(r.id, 19, 1);
  assert.equal((await staff("POST", "/api/agendamento/reservas/:id/unidade", { params: { id: r.id }, body: { uid: unidadeId(r.id, 23, 1), tipo: "CHECK_IN" } })).status, 400); // hora fora da reserva
  assert.equal((await staff("POST", "/api/agendamento/reservas/:id/unidade", { params: { id: r.id }, body: { uid: unidadeId(r.id, 19, 3), tipo: "CHECK_IN" } })).status, 400); // pista 3 não existe nela
  assert.equal((await staff("POST", "/api/agendamento/reservas/:id/unidade", { params: { id: r.id }, body: { uid: "<script>", tipo: "CHECK_IN" } })).status, 400);
  assert.equal((await staff("POST", "/api/agendamento/reservas/:id/unidade", { params: { id: r.id }, body: { uid: u1, tipo: "X" } })).status, 400);
  const ok = await staff("POST", "/api/agendamento/reservas/:id/unidade", { params: { id: r.id }, body: { uid: u1, tipo: "CHECK_IN" } });
  assert.equal(ok.status, 200);
  assert.equal(ok.corpo.reserva.status, "Check-in");
  assert.deepEqual(reservas(db)[0].checkin_ids, [u1]);
  const desmarca = await staff("POST", "/api/agendamento/reservas/:id/unidade", { params: { id: r.id }, body: { uid: u1, tipo: "CHECK_IN" } });
  assert.equal(desmarca.corpo.reserva.status, "Confirmada");

  assert.equal((await staff("POST", "/api/agendamento/reservas/:id/recursos", { params: { id: r.id }, body: { recursos: [1, 1] } })).status, 400);
  assert.equal((await staff("POST", "/api/agendamento/reservas/:id/recursos", { params: { id: r.id }, body: { recursos: [1, 2, 3] } })).status, 400);
  assert.equal((await staff("POST", "/api/agendamento/reservas/:id/recursos", { params: { id: r.id }, body: { recursos: [7] } })).status, 400);
  assert.equal((await staff("POST", "/api/agendamento/reservas/:id/recursos", { params: { id: r.id }, body: { recursos: [3, 5] } })).status, 200);
  assert.deepEqual(reservas(db)[0].recursos_atribuidos, [3, 5]);
});

test("equipe: recebimento de reserva pendente (e do grupo todo) e não paga duas vezes", async () => {
  const { staff, db } = montar();
  const criada = await staff("POST", "/api/agendamento/reservas", { body: novaEquipe({ horas: ["18:00", "21:00"], qtdRecursos: 1, qtdPessoas: 4, pagamento: { modo: "pendente" } }) });
  const [a] = criada.corpo.reservas;
  assert.equal(reservas(db).length, 2);
  const pag = await staff("POST", "/api/agendamento/reservas/:id/pagamento", { params: { id: a.id }, body: { grupo: true, pedido: { modo: "receber", forma: "DEBITO" } } });
  assert.equal(pag.status, 200);
  assert.equal(reservas(db).every((l: any) => l.status === "Confirmada" && l.status_pagamento === "Pago" && l.forma_pagamento === "DEBITO"), true);
  assert.equal((db.t.finance_entries ?? []).reduce((s: number, f: any) => s + f.value, 0), 200);
  assert.equal((await staff("POST", "/api/agendamento/reservas/:id/pagamento", { params: { id: a.id }, body: { pedido: { modo: "receber", forma: "PIX" } } })).status, 409);
});

test("equipe: configuração só pelo administrador, com validação e endereço único; primeira abertura cria o padrão", async () => {
  const { staff, admin, db } = montar();
  assert.equal((await staff("PUT", "/api/agendamento/config", { body: { qtdRecursos: 3 } })).status, 403);
  assert.equal((await admin("PUT", "/api/agendamento/config", { body: { qtdRecursos: 0 } })).status, 400);
  assert.equal((await admin("PUT", "/api/agendamento/config", { body: { slug: "outra" } })).status, 409); // já é da outra empresa
  const ok = await admin("PUT", "/api/agendamento/config", { body: { qtdRecursos: 8, precoDiaUtil: 110 } });
  assert.equal(ok.status, 200);
  assert.equal(db.t.agendamento_config.find((c: any) => c.tenant_id === T1).qtd_recursos, 8);

  // empresa nova: abrir a tela cria a configuração com o endereço a partir do nome
  const novo = montar();
  novo.db.t.agendamento_config = [];
  const g = await novo.admin("GET", "/api/agendamento/config");
  assert.equal(g.status, 200);
  assert.equal(g.corpo.config.slug, "to-na-pista");
  assert.equal(g.corpo.linkPublico, "https://spy.test/agendar/to-na-pista");
});

test("rotina diária: exige a chave e libera as pendentes vencidas", async () => {
  const { chamar, db } = montar();
  await db.rpc("agendamento_reservar", { p_tenant: T1, p_itens: [{ data: TERCA, hora: "19:00", duracao: 1, qtd_recursos: 2, contato_nome: "Velha", status: "Pendente" }] });
  reservas(db)[0].created_at = new Date(Date.now() - 60 * 60000).toISOString();
  assert.equal((await chamar("GET", "/api/agendamento/cron/expirar", { headers: { authorization: "Bearer errada" } })).status, 401);
  assert.equal((await chamar("GET", "/api/agendamento/cron/expirar", {})).status, 401);
  const r = await chamar("GET", "/api/agendamento/cron/expirar", { headers: { authorization: "Bearer cron" } });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.expiradas, 1);
  assert.equal(reservas(db)[0].status, "Cancelada");
});
