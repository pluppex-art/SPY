import { test } from "node:test";
import assert from "node:assert/strict";
import {
  minutosDaHora, horaDeMinutos, horaParaExibir, diaDaSemana, somarDias, agoraNoFuso, ocupaVaga, ocupadosNaHora, capacidadeHora,
  faixaDoDia, gerarSlots, precoPorHora, totalPadrao, recursosParaPessoas, maxPessoas, agruparBlocos, ratearValor, validarReserva,
  marcarUnidade, unidadeId, metricasDoDia, calcularAlertas, validarPagamentoMisto, decidirPagamentoAprovado, formaPorTipoMercadoPago,
  valorReconhecido, centavos, type ConfigAgenda, type ReservaLite, type Agora,
} from "../../src/lib/agendamento/engine.js";

// Terça 2026-11-17 às 12:00 em Brasília (15:00 UTC).
const AGORA_MS = Date.UTC(2026, 10, 17, 15, 0, 0);
const agora = (over: Partial<Agora> = {}): Agora => ({ data: "2026-11-17", minutos: 12 * 60, ms: AGORA_MS, ...over });

const dia = (aberto: boolean, inicio = 18, fim = 0) => ({ aberto, inicio, fim });
const cfg = (over: Partial<ConfigAgenda> = {}): ConfigAgenda => ({
  qtdRecursos: 6, pessoasPorRecurso: 6, precoDiaUtil: 99.9, precoFimSemana: 140, diasFimSemana: [0, 5, 6],
  // dom 17–0, seg fechado, ter–sex 18–0, sáb 17–0
  horarios: [dia(true, 17), dia(false), dia(true), dia(true), dia(true), dia(true), dia(true, 17)],
  datasBloqueadas: [], expiracaoPendenteMin: 30, mesasMaxPorDia: 25, cadeirasMax: 25, ...over,
});
let n = 0;
const res = (over: Partial<ReservaLite> = {}): ReservaLite => ({
  id: `r${++n}`, data: "2026-11-18", hora: "19:00", duracao: 1, qtdRecursos: 2, status: "Confirmada", statusPagamento: "Pago", ...over,
});

test("horas e datas: conversões e dia da semana sem depender do fuso", () => {
  assert.equal(minutosDaHora("18:30"), 1110);
  assert.equal(horaDeMinutos(1110), "18:30");
  assert.equal(horaDeMinutos(25 * 60), "25:00");
  assert.equal(horaParaExibir("25:00"), "01:00");
  assert.equal(horaParaExibir("24:00"), "00:00");
  assert.equal(diaDaSemana("2026-11-15"), 0); // domingo
  assert.equal(diaDaSemana("2026-11-17"), 2);
  assert.equal(somarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(somarDias("2026-03-01", -1), "2026-02-28");
});

test("agora no fuso da empresa (Brasília é UTC-3)", () => {
  const a = agoraNoFuso(Date.UTC(2026, 10, 18, 2, 30, 0)); // 02:30 UTC = 23:30 do dia 17 em Brasília
  assert.equal(a.data, "2026-11-17");
  assert.equal(a.minutos, 23 * 60 + 30);
});

test("pendente do site expira depois do prazo e libera a vaga; pendente no local e cancelada não seguram nada certo", () => {
  const nova = res({ status: "Pendente", statusPagamento: "Pendente", createdAt: new Date(AGORA_MS - 10 * 60000).toISOString() });
  const velha = res({ status: "Pendente", statusPagamento: "Pendente", createdAt: new Date(AGORA_MS - 31 * 60000).toISOString() });
  const local = res({ status: "Pendente", statusPagamento: "Pendente", pagarNoLocal: true, createdAt: new Date(AGORA_MS - 600 * 60000).toISOString() });
  assert.equal(ocupaVaga(nova, AGORA_MS, 30), true);
  assert.equal(ocupaVaga(velha, AGORA_MS, 30), false);
  assert.equal(ocupaVaga(local, AGORA_MS, 30), true); // pagar no local nunca expira
  assert.equal(ocupaVaga(res({ status: "Cancelada" }), AGORA_MS, 30), false);
  assert.equal(ocupaVaga(nova, AGORA_MS, 30, nova.id), false); // ignora a própria reserva ao editar
});

test("ocupação por intervalo: reserva de 18:30 por 1h ocupa as horas 18 e 19 (o original só via a 18)", () => {
  const r = res({ hora: "18:30", duracao: 1, qtdRecursos: 3 });
  assert.equal(ocupadosNaHora(18, "2026-11-18", [r], AGORA_MS, 30), 3);
  assert.equal(ocupadosNaHora(19, "2026-11-18", [r], AGORA_MS, 30), 3);
  assert.equal(ocupadosNaHora(20, "2026-11-18", [r], AGORA_MS, 30), 0);
  assert.equal(ocupadosNaHora(17, "2026-11-18", [r], AGORA_MS, 30), 0);
});

test("reserva que passa da meia-noite continua ocupando as horas seguintes", () => {
  const r = res({ hora: "23:00", duracao: 2, qtdRecursos: 4 });
  assert.equal(ocupadosNaHora(23, "2026-11-18", [r], AGORA_MS, 30), 4);
  assert.equal(ocupadosNaHora(24, "2026-11-18", [r], AGORA_MS, 30), 4); // 00:00 do dia seguinte
  assert.equal(ocupadosNaHora(25, "2026-11-18", [r], AGORA_MS, 30), 0);
});

test("capacidade: livres e disponibilidade", () => {
  const rs = [res({ qtdRecursos: 4 }), res({ qtdRecursos: 2 })];
  assert.deepEqual(capacidadeHora(19, "2026-11-18", rs, 6, AGORA_MS, 30), { ocupados: 6, livres: 0, disponivel: false });
  assert.deepEqual(capacidadeHora(19, "2026-11-18", rs, 8, AGORA_MS, 30), { ocupados: 6, livres: 2, disponivel: true });
});

test("faixa do dia: fechado, bloqueado, meia-noite e depois da meia-noite", () => {
  const c = cfg();
  assert.equal(faixaDoDia("2026-11-16", c), null); // segunda fechada
  assert.deepEqual(faixaDoDia("2026-11-17", c), { inicio: 18, fim: 24 }); // terça 18–0
  assert.equal(faixaDoDia("2026-11-17", cfg({ datasBloqueadas: ["2026-11-17"] })), null);
  const madrugada = cfg({ horarios: Array.from({ length: 7 }, () => dia(true, 20, 2)) });
  assert.deepEqual(faixaDoDia("2026-11-17", madrugada), { inicio: 20, fim: 26 });
});

test("slots: lotado fica indisponível; hoje o cliente perde a hora que já começou e a equipe tem 10 min de tolerância", () => {
  const c = cfg({ qtdRecursos: 2 });
  const lotada = res({ data: "2026-11-17", hora: "19:00", qtdRecursos: 2 });
  const futuro = gerarSlots("2026-11-17", c, [lotada], { agora: agora({ minutos: 17 * 60 + 30 }) });
  assert.equal(futuro.length, 6);
  assert.equal(futuro.find((s) => s.hora === "19:00")!.disponivel, false);
  assert.equal(futuro.find((s) => s.hora === "19:00")!.livres, 0);
  assert.equal(futuro.find((s) => s.hora === "20:00")!.disponivel, true);

  const agoraComecou = agora({ minutos: 18 * 60 + 5 });
  assert.equal(gerarSlots("2026-11-17", c, [], { agora: agoraComecou }).find((s) => s.hora === "18:00")!.disponivel, false);
  assert.equal(gerarSlots("2026-11-17", c, [], { agora: agoraComecou, equipe: true }).find((s) => s.hora === "18:00")!.disponivel, true);
  assert.equal(gerarSlots("2026-11-17", c, [], { agora: agora({ minutos: 18 * 60 + 11 }), equipe: true }).find((s) => s.hora === "18:00")!.disponivel, false);
  assert.deepEqual(gerarSlots("2026-11-16", c, [], { agora: agora() }), []); // segunda fechada
});

test("slots depois da meia-noite aparecem com a hora certa", () => {
  const c = cfg({ horarios: Array.from({ length: 7 }, () => dia(true, 22, 2)) });
  const s = gerarSlots("2026-11-20", c, [], { agora: agora() });
  assert.deepEqual(s.map((x) => x.rotulo), ["22:00", "23:00", "00:00", "01:00"]);
  assert.deepEqual(s.map((x) => x.hora), ["22:00", "23:00", "24:00", "25:00"]);
});

test("preço: dia útil x fim de semana; total por pista e hora", () => {
  const c = cfg();
  assert.equal(precoPorHora("2026-11-17", c), 99.9); // terça
  assert.equal(precoPorHora("2026-11-20", c), 140); // sexta conta como fim de semana
  assert.equal(precoPorHora("2026-11-21", c), 140);
  assert.equal(precoPorHora("2026-11-22", c), 140);
  assert.equal(totalPadrao("2026-11-17", c, 2, 3), 599.4);
  assert.equal(centavos(0.1 + 0.2), 0.3);
});

test("pessoas por recurso: 6 por pista", () => {
  assert.equal(recursosParaPessoas(1, 6, 6), 1);
  assert.equal(recursosParaPessoas(6, 6, 6), 1);
  assert.equal(recursosParaPessoas(7, 6, 6), 2);
  assert.equal(recursosParaPessoas(100, 6, 6), 6); // limitado ao total de pistas
  assert.equal(maxPessoas(3, 6), 18);
});

test("horas soltas viram blocos seguidos", () => {
  assert.deepEqual(agruparBlocos(["19:00", "18:00", "21:00"]), [{ hora: "18:00", duracao: 2 }, { hora: "21:00", duracao: 1 }]);
  assert.deepEqual(agruparBlocos(["18:00", "18:00"]), [{ hora: "18:00", duracao: 1 }]);
  assert.deepEqual(agruparBlocos([]), []);
  assert.deepEqual(agruparBlocos(["23:00", "24:00", "25:00"]), [{ hora: "23:00", duracao: 3 }]);
});

test("rateio do valor entre blocos fecha exatamente no total", () => {
  const partes = ratearValor(100, [{ hora: "18:00", duracao: 1 }, { hora: "20:00", duracao: 1 }, { hora: "22:00", duracao: 1 }]);
  assert.equal(partes.reduce((s, v) => centavos(s + v), 0), 100);
  assert.deepEqual(partes, [33.33, 33.33, 33.34]);
  assert.deepEqual(ratearValor(300, [{ hora: "18:00", duracao: 2 }, { hora: "21:00", duracao: 1 }]), [200, 100]);
});

const entrada = (over = {}) => ({ data: "2026-11-18", hora: "19:00", duracao: 2, qtdRecursos: 2, qtdPessoas: 10, ...over });

test("validação: caminho feliz e recusas por regra", () => {
  const c = cfg();
  const o = { agora: agora() };
  assert.deepEqual(validarReserva(entrada(), c, [], o), { ok: true });
  const cod = (e: any, rs: ReservaLite[] = [], op: any = o) => { const r = validarReserva(e, c, rs, op); return r.ok ? "ok" : r.codigo; };
  assert.equal(cod(entrada({ data: "2026-11-23" })), "fechado"); // próxima segunda
  assert.equal(cod(entrada({ data: "2026-11-10" })), "data_passada");
  assert.equal(cod(entrada({ data: "x" })), "data_invalida");
  assert.equal(cod(entrada({ qtdRecursos: 7, qtdPessoas: 10 })), "recursos_demais");
  assert.equal(cod(entrada({ qtdRecursos: 0 })), "recursos_invalidos");
  assert.equal(cod(entrada({ qtdRecursos: 1, qtdPessoas: 7 })), "pessoas_demais");
  assert.equal(cod(entrada({ hora: "17:00" })), "fora_do_horario");
  assert.equal(cod(entrada({ hora: "23:00", duracao: 2 })), "fora_do_horario");
  assert.equal(cod(entrada({ hora: "19:30" })), "hora_quebrada");
  assert.equal(cod(entrada({ duracao: 0 })), "duracao_invalida");
});

test("validação: o modo manual da equipe pode encaixar fora do horário e em horário quebrado", () => {
  const c = cfg();
  const r = validarReserva(entrada({ hora: "16:30", duracao: 1.5 }), c, [], { agora: agora(), equipe: true, manual: true });
  assert.equal(r.ok, true);
});

test("validação: capacidade confere TODAS as horas e ignora a própria reserva na edição", () => {
  const c = cfg();
  const o = { agora: agora() };
  const outras = [res({ data: "2026-11-18", hora: "20:00", duracao: 1, qtdRecursos: 5 })];
  const r1 = validarReserva(entrada({ hora: "19:00", duracao: 2, qtdRecursos: 2, qtdPessoas: 10 }), c, outras, o);
  assert.equal(r1.ok, false);
  if (r1.ok === false) { assert.equal(r1.codigo, "sem_vaga"); assert.match(r1.erro, /20:00/); }
  // Editando a própria reserva de 5 pistas para 6: ela não conta contra si mesma.
  const propria = outras[0];
  assert.equal(validarReserva(entrada({ hora: "20:00", duracao: 1, qtdRecursos: 6, qtdPessoas: 36 }), c, outras, { ...o, excluirId: propria.id }).ok, true);
  assert.equal(validarReserva(entrada({ hora: "20:00", duracao: 1, qtdRecursos: 6, qtdPessoas: 36 }), c, outras, o).ok, false);
});

test("validação: hoje não reserva horário que já começou", () => {
  const c = cfg();
  const hoje = { data: "2026-11-17", hora: "18:00", duracao: 1 };
  const r = validarReserva(entrada(hoje), c, [], { agora: agora({ minutos: 18 * 60 + 20 }) });
  assert.equal(r.ok, false);
  assert.equal(validarReserva(entrada(hoje), c, [], { agora: agora({ minutos: 17 * 60 }) }).ok, true);
});

test("validação: mesas do restaurante — lugares e limite por dia", () => {
  const c = cfg({ mesasMaxPorDia: 2, cadeirasMax: 10 });
  const o = { agora: agora() };
  const cod = (e: any, rs: ReservaLite[] = []) => { const r = validarReserva(e, c, rs, o); return r.ok ? "ok" : r.codigo; };
  assert.equal(cod(entrada({ mesa: true, mesaCadeiras: 8 })), "ok");
  assert.equal(cod(entrada({ mesa: true, mesaCadeiras: 0 })), "mesa_sem_lugares");
  assert.equal(cod(entrada({ mesa: true, mesaCadeiras: 11 })), "mesa_lugares_demais");
  // Acima do padrão só se o grupo for maior que o limite; nunca passa de 36.
  assert.equal(cod(entrada({ mesa: true, mesaCadeiras: 12, qtdRecursos: 3, qtdPessoas: 12 })), "ok");
  assert.equal(cod(entrada({ mesa: true, mesaCadeiras: 37, qtdRecursos: 6, qtdPessoas: 36 })), "mesa_lugares_demais");
  const duas = [res({ mesa: true, hora: "18:00", qtdRecursos: 1 }), res({ mesa: true, hora: "18:00", qtdRecursos: 1 })];
  assert.equal(cod(entrada({ mesa: true, mesaCadeiras: 4, hora: "21:00", duracao: 1 }), duas), "mesas_esgotadas");
});

test("check-in e no-show por unidade recalculam o status", () => {
  const u1 = unidadeId("abc", 19, 1);
  const u2 = unidadeId("abc", 19, 2);
  assert.equal(u1, "abc_19:00_1");
  let m = marcarUnidade({ status: "Confirmada", checkinIds: [], noshowIds: [] }, u1, "CHECK_IN");
  assert.deepEqual(m, { checkinIds: [u1], noshowIds: [], status: "Check-in" });
  m = marcarUnidade(m, u2, "NO_SHOW");
  assert.equal(m.status, "Check-in"); // uma pista chegou: segue em check-in
  m = marcarUnidade(m, u1, "CHECK_IN"); // desmarca
  assert.deepEqual(m, { checkinIds: [], noshowIds: [u2], status: "No-show" });
  m = marcarUnidade(m, u2, "NO_SHOW"); // desmarca
  assert.equal(m.status, "Confirmada");
  // Marcar check-in numa unidade que estava como no-show tira o no-show.
  m = marcarUnidade({ status: "No-show", checkinIds: [], noshowIds: [u1] }, u1, "CHECK_IN");
  assert.deepEqual(m, { checkinIds: [u1], noshowIds: [], status: "Check-in" });
});

test("métricas do dia por unidade", () => {
  const m = metricasDoDia([
    { ...res({ qtdRecursos: 2, duracao: 2, statusPagamento: "Pendente", status: "Pendente" }) },
    { ...res({ qtdRecursos: 1, duracao: 1, status: "Check-in" }), checkinIds: ["a"] },
    { ...res({ qtdRecursos: 3, duracao: 1, status: "No-show" }), noshowIds: ["x", "y"] },
  ]);
  assert.deepEqual(m, { total: 4 + 1 + 3, pendentes: 4, confirmadas: 4, checkin: 1, noshow: 2 });
});

test("alertas: pagamento do site expirando, pendência passada, partida encerrada e comanda de hoje, nessa ordem", () => {
  const ag = agora({ minutos: 21 * 60 });
  const base = { contatoNome: "Ana" };
  const alertas = calcularAlertas([
    { ...res({ id: "hoje", data: "2026-11-17", hora: "20:00", status: "Confirmada", statusPagamento: "Pendente" }), ...base },
    { ...res({ id: "site", status: "Pendente", statusPagamento: "Pendente", createdAt: new Date(AGORA_MS - 25 * 60000).toISOString() }), ...base },
    { ...res({ id: "passada", data: "2026-11-14", status: "Confirmada", statusPagamento: "Pendente" }), ...base },
    { ...res({ id: "fim", data: "2026-11-17", hora: "19:00", duracao: 1, status: "Check-in", statusPagamento: "Pendente" }), ...base },
    { ...res({ id: "paga", data: "2026-11-14", statusPagamento: "Pago" }), ...base },
    { ...res({ id: "cancelada", data: "2026-11-14", status: "Cancelada", statusPagamento: "Pendente" }), ...base },
    { ...res({ id: "expirada", status: "Pendente", statusPagamento: "Pendente", createdAt: new Date(AGORA_MS - 60 * 60000).toISOString() }), ...base },
  ], ag, 30);
  assert.deepEqual(alertas.map((a) => `${a.tipo}:${a.reservaId}`), ["PENDENCIA_PASSADA:passada", "PARTIDA_ENCERRADA:fim", "SITE_URGENTE:site", "COMANDA_HOJE:hoje"]);
  const site = alertas.find((a) => a.tipo === "SITE_URGENTE")!;
  assert.equal(site.restanteMin, 5);
  assert.equal(site.urgente, true);
});

test("pagamento misto: a soma tem que fechar", () => {
  assert.equal(validarPagamentoMisto(100, [{ method: "PIX", amount: 60 }, { method: "DINHEIRO", amount: 40 }]).ok, true);
  assert.equal(validarPagamentoMisto(100, [{ method: "PIX", amount: 60 }, { method: "DINHEIRO", amount: 30 }]).ok, false);
  assert.equal(validarPagamentoMisto(100, [{ method: "PIX", amount: 100.005 }]).ok, true); // tolerância de 1 centavo
  assert.equal(validarPagamentoMisto(100, [{ method: "BITCOIN", amount: 100 }]).ok, false);
  assert.equal(validarPagamentoMisto(100, []).ok, false);
  assert.equal(validarPagamentoMisto(100, [{ method: "PIX", amount: -5 }, { method: "DINHEIRO", amount: 105 }]).ok, false);
});

test("pagamento aprovado: no prazo confirma; atrasado sem vaga estorna; atrasado com vaga confirma", () => {
  const c = { qtdRecursos: 6, expiracaoPendenteMin: 30 };
  const minha = res({ id: "minha", status: "Pendente", statusPagamento: "Pendente", hora: "19:00", duracao: 1, qtdRecursos: 3, createdAt: new Date(AGORA_MS - 10 * 60000).toISOString() });
  assert.equal(decidirPagamentoAprovado(minha, [], c, AGORA_MS).acao, "confirmar");
  const atrasada = { ...minha, createdAt: new Date(AGORA_MS - 50 * 60000).toISOString() };
  const ocupada = res({ hora: "19:00", duracao: 1, qtdRecursos: 4, status: "Confirmada" });
  assert.equal(decidirPagamentoAprovado(atrasada, [ocupada], c, AGORA_MS).acao, "estornar");
  assert.equal(decidirPagamentoAprovado(atrasada, [], c, AGORA_MS).acao, "confirmar");
  // Quem só está pendente (não pagou) não segura a vaga de quem pagou atrasado.
  assert.equal(decidirPagamentoAprovado(atrasada, [{ ...ocupada, status: "Pendente" }], c, AGORA_MS).acao, "confirmar");
  // Dentro da margem de 5 minutos depois do prazo ainda confirma sem checar.
  const naMargem = { ...minha, createdAt: new Date(AGORA_MS - 34 * 60000).toISOString() };
  assert.equal(decidirPagamentoAprovado(naMargem, [ocupada], c, AGORA_MS).acao, "confirmar");
  const foraDaMargem = { ...minha, createdAt: new Date(AGORA_MS - 36 * 60000).toISOString() };
  assert.equal(decidirPagamentoAprovado(foraDaMargem, [ocupada], c, AGORA_MS).acao, "estornar");
});

test("forma de pagamento do Mercado Pago e valor reconhecido no financeiro", () => {
  assert.equal(formaPorTipoMercadoPago("bank_transfer"), "PIX");
  assert.equal(formaPorTipoMercadoPago("credit_card"), "CREDITO");
  assert.equal(formaPorTipoMercadoPago("debit_card"), "DEBITO");
  assert.equal(formaPorTipoMercadoPago("account_money"), "ONLINE");
  assert.equal(formaPorTipoMercadoPago(undefined), "ONLINE");
  assert.equal(valorReconhecido({ status: "Confirmada", statusPagamento: "Pago", valorTotal: 150 }), 150);
  assert.equal(valorReconhecido({ status: "Check-in", statusPagamento: "Pago", valorTotal: 150 }), 150);
  assert.equal(valorReconhecido({ status: "Cancelada", statusPagamento: "Reembolsado", valorTotal: 150 }), 0);
  assert.equal(valorReconhecido({ status: "Confirmada", statusPagamento: "Pendente", valorTotal: 150 }), 0);
  assert.equal(valorReconhecido({ status: "No-show", statusPagamento: "Pago", valorTotal: 150 }), 0);
});
