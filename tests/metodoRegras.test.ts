import test from "node:test";
import assert from "node:assert/strict";
import { dataDaSituacao, minhasDeHoje, pedidoDaMudanca, pesoDeAtencao, posicaoNoMetodo, situacaoDoPrazo, vigentes } from "../src/lib/metodo/regras";
import { interceptar, registrarInterceptador } from "../src/lib/metodo/interceptador";

const tipos = ["novo_lead", "atendimento", "orcamento", "repescagem", "ganho", "perdido", "desqualificado", "atendimento"];
const funil = { id: "m", metodoAtivo: true, etapasConfig: [...tipos.map((tipo) => ({ nome: tipo, tipo })), { nome: "sem tipo" }] };
const desligado = { ...funil, id: "d", metodoAtivo: false };
const funis = [funil, desligado, { ...funil, id: "m-2" }];
const lead = { stageId: "m-0", status: "Novo" };

test("só funil com método ligado e etapa tipada entra no método", () => {
  assert.equal(posicaoNoMetodo("m-2", funis)?.tipo, "orcamento");
  assert.equal(posicaoNoMetodo("m-2-1", funis)?.funil.id, "m-2");
  assert.equal(posicaoNoMetodo("d-0", funis), null);
  assert.equal(posicaoNoMetodo("m-8", funis), null);
  assert.equal(posicaoNoMetodo("outro-1", funis), null);
});

test("arrastar vira o pedido certo e preserva o que não é do método", () => {
  const r = pedidoDaMudanca(lead, { stageId: "m-2", status: "Em Aberto", probability: 60, temperature: "quente" }, funis);
  assert.deepEqual(r, { pedido: { acao: "mover", destino: "orcamento" }, resto: { temperature: "quente" } });
  assert.deepEqual(pedidoDaMudanca(lead, { stageId: "m-3" }, funis)?.pedido, { acao: "repescagem" });
  assert.deepEqual(pedidoDaMudanca(lead, { stageId: "m-4" }, funis)?.pedido, { acao: "ganho" });
  assert.deepEqual(pedidoDaMudanca(lead, { stageId: "m-6" }, funis)?.pedido, { acao: "perdido", naoLead: true });
});

test("botões que mudam só o status também passam pelo método", () => {
  assert.deepEqual(pedidoDaMudanca(lead, { status: "Perdido", lost_reason: "x" }, funis), { pedido: { acao: "perdido", naoLead: false }, resto: {} });
  assert.deepEqual(pedidoDaMudanca(lead, { stageId: "5", status: "Fechado" }, funis), null, "etapa fora de funil do método segue como antes");
  assert.equal(pedidoDaMudanca(lead, { status: "Em Aberto" }, funis), null);
});

test("nada muda fora do método, na mesma etapa ou trocando de funil", () => {
  assert.equal(pedidoDaMudanca({ stageId: "d-0" }, { stageId: "d-4", status: "Fechado" }, funis), null);
  assert.equal(pedidoDaMudanca(lead, { stageId: "m-0", name: "A" }, funis), null);
  assert.equal(pedidoDaMudanca(lead, { stageId: "d-2" }, funis), null);
  assert.equal(pedidoDaMudanca(lead, { stageId: "m-2-1" }, funis), null);
  assert.equal(pedidoDaMudanca(lead, { stageId: "m-8" }, funis), null);
  assert.equal(pedidoDaMudanca({ stageId: "m-1" }, { stageId: "m-7" }, funis), null, "duas etapas do mesmo tipo");
});

test("prazo: em dia, atenção e estourado", () => {
  const agora = Date.parse("2026-11-27T12:00:00Z");
  const em = (min: number) => new Date(agora + min * 60_000).toISOString();
  assert.equal(situacaoDoPrazo({ sla_vence_em: null, situacao_desde: null }, agora), null);
  assert.equal(situacaoDoPrazo({ sla_vence_em: em(-1), situacao_desde: em(-60) }, agora), "estourado");
  assert.equal(situacaoDoPrazo({ sla_vence_em: em(1), situacao_desde: em(-4) }, agora), "atencao");
  assert.equal(situacaoDoPrazo({ sla_vence_em: em(4), situacao_desde: em(-1) }, agora), "em_dia");
  assert.equal(situacaoDoPrazo({ sla_vence_em: em(90), situacao_desde: em(-1350) }, agora), "em_dia", "atenção nunca começa mais de 1h antes");
  const peso = (min: number, t: string) => pesoDeAtencao({ sla_vence_em: em(min), situacao_desde: em(-600) } as any, t, agora);
  assert.ok(peso(-1, "frio") < peso(10, "quente"));
  assert.ok(peso(-1, "quente") < peso(-1, "frio"));
});

test("ajuste do funil vence o da empresa, que vence o de fábrica", () => {
  const l = (nome: string, tenant_id: string | null, funil_id: string | null, ativo = true) => ({ codigo: "a", nome, tenant_id, funil_id, ativo, ordem: 1 });
  const linhas = [l("fábrica", null, null), l("empresa", "t", null), l("funil", "t", "m"), l("outro funil", "t", "x")];
  assert.equal(vigentes(linhas, "m")[0].nome, "funil");
  assert.equal(vigentes(linhas, "z")[0].nome, "empresa");
  assert.equal(vigentes([l("fábrica", null, null), l("desligada", "t", null, false)]).length, 0);
});

test("datas pedidas e minhas de hoje", () => {
  assert.equal(dataDaSituacao({ timer: { na_data: true } } as any), "obrigatoria");
  assert.equal(dataDaSituacao({ timer: { quando: "prazo_entrega" } } as any), "opcional");
  assert.equal(dataDaSituacao({ timer: { quando: "reposicao" } } as any), null);
  const agora = new Date(2026, 10, 27, 12);
  const t = (id: string, dia: number | null, extra: object = {}) => ({ id, assigned_to: "eu", status: "Em Aberto", due_date: dia === null ? null : new Date(2026, 10, dia, 18).toISOString(), ...extra });
  const r = minhasDeHoje([t("hoje", 27), t("atrasada", 20), t("amanha", 28), t("sem", null), t("feita", 27, { status: "Concluída" }), t("alheia", 27, { assigned_to: "x" })], "eu", agora);
  assert.deepEqual(r.map((x) => x.id), ["atrasada", "hoje"]);
  assert.deepEqual(minhasDeHoje([t("a", 27, { assigned_to: "" })], "", agora), []);
});

test("sem método registrado nada é interceptado", () => {
  assert.equal(interceptar("1", { status: "Fechado" }), null);
  const sair = registrarInterceptador(() => ({}));
  assert.deepEqual(interceptar("1", {}), {});
  sair();
  assert.equal(interceptar("1", {}), null);
});
