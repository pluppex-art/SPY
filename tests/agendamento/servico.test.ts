import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slugDe, repartirMisto, validarConfig, planejarPagamento, descritorFatura, montarPreferenciaMP, idLancamento, montarLancamento,
  assinar, conferirAssinatura, configParaEngine, linhaParaLite, PERMISSOES_PADRAO, type LinhaConfig, type LinhaReserva,
} from "../../server/agendamentoPuro.js";

test("slug a partir do nome", () => {
  assert.equal(slugDe("Tô Na Pista Boliche"), "to-na-pista-boliche");
  assert.equal(slugDe("  Quadra   do João!! "), "quadra-do-joao");
  assert.equal(slugDe("A"), "agenda");
  assert.equal(slugDe(""), "agenda");
  assert.ok(slugDe("x".repeat(200)).length <= 60);
});

test("config: campo ausente não muda; valores válidos viram colunas", () => {
  assert.deepEqual(validarConfig({}), { ok: true, patch: {} });
  const r = validarConfig({ qtdRecursos: 6, precoDiaUtil: 99.9, precoFimSemana: 140, slug: "To-Na-Pista", diasFimSemana: [6, 0, 5, 5], pagamentoOnline: true, nomeEstabelecimento: "  Tô Na Pista  " });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.patch, { qtd_recursos: 6, preco_dia_util: 99.9, preco_fim_semana: 140, slug: "to-na-pista", dias_fim_semana: [0, 5, 6], pagamento_online: true, nome_estabelecimento: "Tô Na Pista" });
});

test("config: recusa valores fora do permitido", () => {
  const ruim = (b: any) => { const r = validarConfig(b); assert.equal(r.ok, false, JSON.stringify(b)); };
  ruim({ qtdRecursos: 0 });
  ruim({ qtdRecursos: 201 });
  ruim({ qtdRecursos: 2.5 });
  ruim({ precoDiaUtil: -1 });
  ruim({ precoDiaUtil: "abc" });
  ruim({ slug: "ab" });
  ruim({ slug: "tem espaço" });
  ruim({ slug: "api" }); // reservado
  ruim({ pagamentoOnline: "sim" });
  ruim({ diasFimSemana: [7] });
  ruim({ horarios: [] });
  ruim({ horarios: Array.from({ length: 7 }, () => ({ aberto: true, inicio: 25, fim: 0 })) });
  ruim({ datasBloqueadas: ["2026-13-45"] });
  ruim({ datasBloqueadas: ["amanhã"] });
  ruim({ tiposEvento: [] });
  ruim({ fuso: "Marte/Olimpo" });
  ruim({ expiracaoPendenteMin: 1 });
  ruim({ cadeirasMax: 40 });
  ruim({ logoUrl: "http://inseguro.com/logo.png" });
  ruim({ recursoSingular: "   " });
  ruim({ permissoesEquipe: { criar: true } });
});

test("config: horários, datas, tipos e permissões válidos", () => {
  const horarios = Array.from({ length: 7 }, (_, i) => ({ aberto: i !== 1, inicio: 18, fim: 0, lixo: "x" }));
  const r = validarConfig({ horarios, datasBloqueadas: ["2026-12-25", "2026-12-24", "2026-12-25"], tiposEvento: ["Jogo", " Jogo ", "Festa"], fuso: "America/Sao_Paulo", permissoesEquipe: { ...PERMISSOES_PADRAO, extra: 1 } });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual((r.patch.horarios as any[])[1], { aberto: false, inicio: 18, fim: 0 }); // campo estranho descartado
    assert.deepEqual(r.patch.datas_bloqueadas, ["2026-12-24", "2026-12-25"]);
    assert.deepEqual(r.patch.tipos_evento, ["Jogo", "Festa"]);
    assert.deepEqual(r.patch.permissoes_equipe, PERMISSOES_PADRAO);
  }
});

test("pagamento: receber com uma forma, misto, cortesia só do administrador", () => {
  const p = (pedido: any, total = 200, admin = false) => planejarPagamento(pedido, total, admin);
  const unico = p({ modo: "receber", forma: "pix" });
  assert.deepEqual(unico.ok && unico.plano, { status: "Confirmada", status_pagamento: "Pago", forma_pagamento: "PIX", detalhes_pagamento: [{ method: "PIX", amount: 200 }], pagar_no_local: false, comanda: undefined });
  assert.equal(p({ modo: "receber", forma: "bitcoin" }).ok, false);
  assert.equal(p({ modo: "receber" }).ok, false);

  const misto = p({ modo: "receber", misto: [{ method: "PIX", amount: 120 }, { method: "DINHEIRO", amount: 80 }] });
  assert.equal(misto.ok && misto.plano.forma_pagamento, "MISTO");
  assert.equal(p({ modo: "receber", misto: [{ method: "PIX", amount: 120 }, { method: "DINHEIRO", amount: 70 }] }).ok, false);
  assert.equal(p({ modo: "receber", misto: [{ method: "CORTESIA", amount: 200 }] }).ok, false);

  assert.equal(p({ modo: "receber", forma: "CORTESIA" }, 200, false).ok, false);
  const cortesia = p({ modo: "receber", forma: "CORTESIA" }, 200, true);
  assert.equal(cortesia.ok && cortesia.plano.valor_total, 0);
  assert.match(cortesia.ok ? cortesia.plano.observacao! : "", /200\.00/);
});

test("pagamento: comanda e baixa pela comanda exigem o número; pendente volta a aguardar", () => {
  assert.equal(planejarPagamento({ modo: "comanda" }, 100, false).ok, false);
  const c = planejarPagamento({ modo: "comanda", comanda: " 42 " }, 100, false);
  assert.deepEqual(c.ok && c.plano, { status: "Pendente", status_pagamento: "Pendente", forma_pagamento: "COMANDA", detalhes_pagamento: [], pagar_no_local: true, comanda: "42" });
  assert.equal(planejarPagamento({ modo: "comanda_paga" }, 100, false).ok, false);
  const b = planejarPagamento({ modo: "comanda_paga", comanda: "7" }, 100, false);
  assert.equal(b.ok && b.plano.status, "Confirmada");
  assert.equal(b.ok && b.plano.status_pagamento, "Pago");
  const pend = planejarPagamento({ modo: "pendente" }, 100, false);
  assert.equal(pend.ok && pend.plano.pagar_no_local, false);
  assert.equal(planejarPagamento({ modo: "x" as any }, 100, false).ok, false);
});

test("Mercado Pago: descritor da fatura e corpo da cobrança", () => {
  assert.equal(descritorFatura("Tô Na Pista Boliche & Bar"), "TO NA PISTA BOLICHE BA");
  assert.equal(descritorFatura("!!!"), "RESERVA");
  const exp = new Date("2026-11-17T15:30:00Z");
  const pref: any = montarPreferenciaMP({ nomeEstabelecimento: "Tô Na Pista", grupoId: "g-1", total: 199.8, descricao: "Dia 2026-11-18", pagador: { nome: "Ana", email: "a@b.com" }, expiraEm: exp, urlNotificacao: "https://x/api/agendamento/mp-webhook/t?t=abc", urlRetorno: "https://x/agendar/to-na-pista?grupo=g-1" });
  assert.equal(pref.external_reference, "g-1");
  assert.equal(pref.items[0].unit_price, 199.8);
  assert.equal(pref.items[0].quantity, 1);
  assert.equal(pref.expiration_date_to, "2026-11-17T15:30:00.000Z");
  assert.equal(pref.payer.email, "a@b.com");
  assert.deepEqual(pref.payment_methods, { excluded_payment_types: [{ id: "ticket" }], installments: 1 });
  const semEmail: any = montarPreferenciaMP({ nomeEstabelecimento: "X", grupoId: "g", total: 10, descricao: "", pagador: { nome: "Ana" }, expiraEm: exp, urlNotificacao: "u", urlRetorno: "r" });
  assert.equal("email" in semEmail.payer, false); // não inventa e-mail
});

const linha = (over: Partial<LinhaReserva> = {}): LinhaReserva => ({
  id: "12345678-aaaa-bbbb-cccc-000000000000", tenant_id: "t", grupo_id: "g", data: "2026-11-18", hora: "19:00", duracao: 2, qtd_recursos: 2, qtd_pessoas: 10,
  valor_total: 400, tipo_evento: "Aniversário", observacoes: null, status: "Confirmada", status_pagamento: "Pago", forma_pagamento: "PIX", detalhes_pagamento: [],
  pagar_no_local: false, comanda: null, mesa: false, mesa_cadeiras: null, aniversariante: null, checkin_ids: [], noshow_ids: [], recursos_atribuidos: [],
  origem: "site", criado_por: null, criado_por_nome: null, lead_id: null, contato_nome: "Ana", contato_telefone: "63999990000", contato_email: null,
  motivo_cancelamento: null, mp_preference_id: null, mp_payment_id: null, externo_id: null, created_at: "2026-11-17T12:00:00Z", updated_at: "2026-11-17T12:00:00Z", ...over,
});

test("financeiro: id próprio para reservas novas e o MESMO id da integração antiga para as importadas", () => {
  assert.equal(idLancamento(linha()), "agd_12345678-aaaa-bbbb-cccc-000000000000");
  assert.equal(idLancamento(linha({ externo_id: "abc-123" })), "tnp_fat_abc-123");
});

test("financeiro: valor reconhecido só quando confirmada/check-in E paga; cancelada zera", () => {
  const l = montarLancamento(linha());
  assert.equal(l.value, 400);
  assert.equal(l.category, "Reservas");
  assert.equal(l.type, "Receber");
  assert.equal(l.payment_method, "Pix");
  assert.equal(l.numero_documento, "RES-12345678");
  assert.equal(l.description, "Reserva - Aniversário (Ana)");
  assert.equal(montarLancamento(linha({ status: "Cancelada", status_pagamento: "Reembolsado" })).value, 0);
  assert.equal(montarLancamento(linha({ status_pagamento: "Pendente" })).value, 0);
  assert.equal(montarLancamento(linha({ forma_pagamento: null })).payment_method, undefined);
});

test("link assinado: confere o que foi assinado e recusa qualquer alteração", () => {
  const seg = "segredo-de-teste";
  const a = assinar("grupo-1", seg);
  assert.equal(a.length, 32);
  assert.equal(conferirAssinatura("grupo-1", a, seg), true);
  assert.equal(conferirAssinatura("grupo-2", a, seg), false);
  assert.equal(conferirAssinatura("grupo-1", a, "outro"), false);
  assert.equal(conferirAssinatura("grupo-1", "", seg), false);
  assert.equal(conferirAssinatura("grupo-1", a.slice(0, 31), seg), false);
});

test("linha do banco vira a entrada das regras", () => {
  const cfg: LinhaConfig = {
    tenant_id: "t", slug: "x", ativo: true, nome_estabelecimento: null, endereco: null, telefone: null, whatsapp: null, logo_url: null, recurso_singular: "Pista", recurso_plural: "Pistas",
    qtd_recursos: 6, pessoas_por_recurso: 6, preco_dia_util: "99.90", preco_fim_semana: 140, dias_fim_semana: [0, 5, 6], horarios: [], datas_bloqueadas: ["2026-12-25T00:00:00Z" as any],
    tipos_evento: [], expiracao_pendente_min: 30, fuso: "America/Sao_Paulo", pagamento_online: false, mesas_ativo: false, mesas_max_por_dia: 25, cadeiras_max: 25, permissoes_equipe: PERMISSOES_PADRAO,
  };
  const e = configParaEngine(cfg);
  assert.equal(e.precoDiaUtil, 99.9);
  assert.deepEqual(e.datasBloqueadas, ["2026-12-25"]);
  const lite = linhaParaLite(linha({ duracao: "1.5" as any, data: "2026-11-18T00:00:00Z" as any }));
  assert.equal(lite.duracao, 1.5);
  assert.equal(lite.data, "2026-11-18");
  assert.equal(lite.qtdRecursos, 2);
});

test("pagamento misto repartido entre faixas: cada faixa fecha exata", () => {
  const misto = [{ method: "PIX", amount: 120 }, { method: "DINHEIRO", amount: 80 }];
  const faixas = repartirMisto(misto, [100, 100]);
  assert.deepEqual(faixas, [[{ method: "PIX", amount: 60 }, { method: "DINHEIRO", amount: 40 }], [{ method: "PIX", amount: 60 }, { method: "DINHEIRO", amount: 40 }]]);
  // Valores que não dividem certinho: cada faixa ainda soma exatamente o seu valor.
  const f = repartirMisto([{ method: "PIX", amount: 100 }, { method: "DEBITO", amount: 100 }], [66.67, 66.67, 66.66]);
  f.forEach((partes, i) => assert.equal(Math.round(partes.reduce((s, d) => s + d.amount, 0) * 100), Math.round([66.67, 66.67, 66.66][i] * 100)));
  assert.deepEqual(repartirMisto(misto, [200]), [[{ method: "PIX", amount: 120 }, { method: "DINHEIRO", amount: 80 }]]);
  assert.deepEqual(repartirMisto(misto, [0, 0]), [[{ method: "PIX", amount: 0 }, { method: "DINHEIRO", amount: 0 }], [{ method: "PIX", amount: 0 }, { method: "DINHEIRO", amount: 0 }]]);
});

import { decidirAcaoFinanceira } from "../../server/agendamentoPuro.js";
test("o que fazer com o lançamento financeiro da reserva", () => {
  assert.equal(decidirAcaoFinanceira(null, 100), "inserir");
  assert.equal(decidirAcaoFinanceira({ status: "Pago", value: 100, origem_registro: null }, 0), "atualizar");      // lançamento antigo: como sempre
  assert.equal(decidirAcaoFinanceira({ status: "Pago", value: 100, origem_registro: "api" }, 100), "nada");
  assert.equal(decidirAcaoFinanceira({ status: "Pago", value: "100.00", origem_registro: "api" }, 100), "nada");
  assert.equal(decidirAcaoFinanceira({ status: "Pago", value: 100, origem_registro: "api" }, 0), "estornar");
  assert.equal(decidirAcaoFinanceira({ status: "Pago", value: 100, origem_registro: "api" }, 60), "revisar");
  assert.equal(decidirAcaoFinanceira({ status: "A Vencer", value: 100, origem_registro: "api" }, 60), "atualizar");
});
