import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const R = createRequire(import.meta.url)("../../scripts/n8n/repescagem-aurora/regras.cjs");

// quinta-feira, 10h em Brasília
const AGORA = Date.parse("2026-11-26T13:00:00Z");
const ha = (horas: number) => new Date(AGORA - horas * 3600e3).toISOString();
const msg = (sender: string, horas: number, text = "oi", fone = "5563999990001") => ({ sender, text, created_at: ha(horas), fone, nome: "Marcos Silva", instancia: "i1", contact_id: "c1" });
const REAL = R.config({ ativo: true, modoTeste: false, ativadoEm: ha(24 * 30) });
const PARADA = [msg("contact", 60, "qual o preço?"), msg("human", 55, "R$ 389")];
const reg = (action: string, horas: number, details: object, id = "h1") => ({ id, action, created_at: ha(horas), details: { f8: "99990001", modo: "r", instancia: "i1", ...details } });
const BASE = {
  leads: [{ id: "L1", name: "Marcos", status: "Orçamento", phone_digits: "5563999990001" }],
  instancias: [{ id: "i1", name: "agente-secreto-Bruno", phone: "63988880000", colaborador_id: "7", finalidade: "vendas" }],
  colaboradores: [{ id: "7", user_id: "u1", nome: "Bruno Souza", status: "Ativo", phone: "63988880000" }],
  usuarios: [{ id: "u1", name: "Bruno Souza", phone: "63988880000" }],
  empresa: "Loja Exemplo", historico: [] as any[], resps: [] as any[], agora: AGORA, c: REAL, tenant: "27ef95ee-84dd-499e-9f25-cd9baecb5fe4", numeroLigado: true,
};

test("vem desligada e em teste; teste só desliga de propósito", () => {
  assert.equal(R.config({}).ativo, false);
  assert.equal(R.config({}).modoTeste, true);
  assert.equal(R.config({ modoTeste: undefined }).modoTeste, true);
});

test("chama quem parou de responder há mais que o prazo", () => {
  assert.equal(R.candidatos(PARADA, [], REAL, AGORA).length, 1);
});

test("não chama: prazo não vencido, cliente esperando, nunca falou, recusou, velho demais ou antes de ligar", () => {
  const nao = (msgs: any[], c = REAL, h: any[] = []) => assert.equal(R.candidatos(msgs, h, c, AGORA).length, 0);
  nao([msg("contact", 30), msg("human", 20)]);
  nao([msg("human", 60), msg("contact", 55)]);
  nao([msg("human", 60)]);
  nao([msg("contact", 60, "não tenho interesse"), msg("human", 55)]);
  nao([msg("contact", 24 * 21), msg("human", 24 * 20)]);
  nao(PARADA, R.config({ ativo: true, modoTeste: false, ativadoEm: ha(10) }));
  nao(PARADA, R.config({ ativo: true, modoTeste: false, ativadoEm: "" }));
  nao(PARADA, REAL, [reg("repescagem_chamada", 24 * 10, {})]);
  nao(PARADA, REAL, [reg("repescagem_recusa", 24 * 200, { chamada: "x" })]);
});

test("fora do expediente não envia", () => {
  assert.equal(R.candidatos(PARADA, [], REAL, Date.parse("2026-11-29T13:00:00Z")).length, 0); // domingo
});

test("modo de teste só alcança o número de teste, após 5 minutos", () => {
  const c = R.config({ ativo: true, numeroTeste: "63999990001" });
  assert.equal(R.candidatos([msg("contact", 0.3), msg("human", 0.2)], [], c, AGORA).length, 1);
  assert.equal(R.candidatos(PARADA, [], R.config({ ativo: true, numeroTeste: "63911112222" }), AGORA).length, 0);
  assert.equal(R.candidatos(PARADA, [], R.config({ ativo: true, numeroTeste: "" }), AGORA).length, 0);
});

test("mensagem usa os nomes, sempre ensina a sair e se vira sem nome", () => {
  const t = R.montarMensagem(REAL, { cliente: "marcos silva", vendedor: "Bruno Souza", empresa: "Loja" });
  assert.match(t, /^Oi, Marcos! Aqui é a Aurora, assistente de Bruno\./);
  assert.match(t, /SAIR/);
  assert.match(R.montarMensagem(REAL, { cliente: "+55 63 9999", vendedor: "Bruno" }), /^Oi! Aqui/);
  assert.match(R.montarMensagem({ mensagem: "Olá {cliente}, da {empresa}" }, { cliente: "Ana", empresa: "Alfa" }), /^Olá Ana, da Alfa\n\nPara não receber/);
});

test("recusa: reconhece quem não quer, sem confundir resposta normal", () => {
  for (const t of ["SAIR", "Pare", "não quero mais", "já comprei, obrigado", "para de me mandar mensagem", "não tenho interesse"]) assert.equal(R.recusa(t), true, t);
  for (const t of ["quero sim", "pode falar", "para quando fica?", "vou sair agora, depois vejo", "parece bom", "não entendi o preço"]) assert.equal(R.recusa(t), false, t);
});

test("envia pelo número da Aurora: uma por rodada, limite do dia, só lead aberto e nunca número interno", () => {
  const cands = R.candidatos([...PARADA, msg("contact", 70, "oi", "5563999990002"), msg("human", 65, "oi", "5563999990002")], [], REAL, AGORA);
  const leads = [...BASE.leads, { id: "L2", name: "Célia", status: "Novo", phone_digits: "5563999990002" }];
  const r = R.decidir({ ...BASE, leads, cands });
  assert.equal(r.acoes.length, 1);
  assert.equal(r.acoes[0].sessao, "aurora-repescagem-27ef95ee84dd");
  assert.equal(r.acoes[0].destino, "5563999990001");
  assert.match(r.acoes[0].texto, /Bruno chama você/);
  assert.equal(R.decidir({ ...BASE, leads, cands, numeroLigado: false }).acoes.length, 0);
  const cheio = Array.from({ length: 10 }, (_, i) => reg("repescagem_chamada", 1, { f8: "0000000" + i }, "x" + i));
  assert.equal(R.decidir({ ...BASE, leads, cands, historico: cheio }).acoes.length, 0);
  assert.equal(R.decidir({ ...BASE, cands, leads: [{ ...BASE.leads[0], status: "Ganho" }] }).acoes.length, 0);
  assert.equal(R.decidir({ ...BASE, cands: cands.slice(0, 1), colaboradores: [...BASE.colaboradores, { id: "9", nome: "X", phone: "63999990001" }] }).acoes.length, 0);
});

const CHAMADA = reg("repescagem_chamada", 5, { cliente: "Marcos", destino: "5563999990001" });
const noNumero = (...m: [boolean, number, string, number?][]) => ({ h1: m.map(([fromMe, horas, body, ack]) => ({ fromMe, body, ack, timestamp: Math.floor((AGORA - horas * 3600e3) / 1000) })) });

test("mensagem que chegou ao cliente avisa o vendedor uma vez", () => {
  const chegou = noNumero([true, 5, "Oi, aqui é a Aurora", 2]);
  const resps = R.respostas(PARADA, [CHAMADA], REAL, AGORA, chegou);
  assert.equal(resps[0].tipo, "entregue");
  const a = R.decidir({ ...BASE, cands: [], resps }).acoes[0];
  assert.equal(a.popups[0].title, "Aurora chamou o cliente");
  assert.match(a.aviso.texto, /recebeu a mensagem/);
  assert.equal(R.respostas(PARADA, [CHAMADA, reg("repescagem_entregue", 4, { chamada: "h1" }, "h2")], REAL, AGORA, chegou).length, 0);
  assert.equal(R.respostas(PARADA, [CHAMADA], REAL, AGORA, noNumero([true, 5, "Oi", 1])).length, 0); // só saiu, ainda não chegou
});

test("resposta no número da Aurora avisa o vendedor uma vez; recusa não manda WhatsApp", () => {
  const veio = noNumero([true, 5, "Oi", 3], [false, 2, "pode sim!"]);
  const resps = R.respostas(PARADA, [CHAMADA], REAL, AGORA, veio);
  assert.equal(resps.length, 1);
  const a = R.decidir({ ...BASE, cands: [], resps }).acoes[0];
  assert.equal(a.tipo, "mao");
  assert.equal(a.popups[0].user_id, "u1");
  assert.equal(a.aviso.destino, "5563988880000");
  assert.match(a.aviso.texto, /wa\.me\/5563999990001/);
  assert.equal(R.respostas(PARADA, [CHAMADA, reg("repescagem_resposta", 1, { chamada: "h1" }, "h2")], REAL, AGORA, veio).length, 0);
  const b = R.decidir({ ...BASE, cands: [], resps: R.respostas(PARADA, [CHAMADA], REAL, AGORA, noNumero([false, 2, "SAIR"])) }).acoes[0];
  assert.equal(b.tipo, "recusa");
  assert.equal(b.aviso, null);
});

test("resposta pelo número do vendedor também conta", () => {
  const r = R.respostas([...PARADA, msg("contact", 2, "oi, ainda tem?")], [CHAMADA], REAL, AGORA, {});
  assert.equal(r[0].tipo, "mao");
  assert.equal(R.respostas(PARADA, [CHAMADA], REAL, AGORA, {}).length, 0);
});

test("no teste o aviso do vendedor vai para o número de teste", () => {
  const c = R.config({ ativo: true, numeroTeste: "63977770000" });
  const resps = [{ f8: "77770000", chamada: "h1", instancia: "i1", nome: "Eu", fone: "5563977770000", texto: "sim", tipo: "mao" }];
  const a = R.decidir({ ...BASE, c, cands: [], resps }).acoes[0];
  assert.equal(a.aviso.destino, "5563977770000");
  assert.equal(a.popups.length, 0);
  assert.match(a.aviso.texto, /^\[TESTE\] Iria para Bruno/);
});
