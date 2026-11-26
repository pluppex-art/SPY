import { test } from "node:test";
import assert from "node:assert/strict";
import { linhasDeFunis, MAX_ETAPAS, MODELOS_DE_FUNIL, montarFunil } from "../../src/lib/modelosDeFunil.js";

const SISTEMA = ["Ganho", "Perdido", "Desqualificado"];

test("todo modelo vira um funil com Novo Lead na entrada e as três etapas de sistema no fim", () => {
  for (const m of MODELOS_DE_FUNIL) {
    const f = montarFunil({ nome: m.nomeDoFunil, etapas: m.etapas })!;
    assert.equal(f.etapas[0], "Novo Lead", m.id);
    assert.deepEqual(f.etapas.slice(-3), SISTEMA, m.id);
    assert.equal(f.etapas.length, m.etapas.length + 3, m.id);
    assert.deepEqual(f.etapas, f.etapasConfig.map((e) => e.nome));
  }
});

test("modelo Luminar repete as etapas e cores do funil comercial da Luminar", () => {
  const m = MODELOS_DE_FUNIL.find((x) => x.id === "orcamento_luminar")!;
  assert.deepEqual(m.etapas.map((e) => [e.nome, e.cor]), [["Novo Lead", "blue"], ["Orçamento", "orange"], ["Repescagem", "cyan"]]);
});

test("limpa vazias, repetidas e etapas de sistema digitadas à mão; limita a quantidade", () => {
  const f = montarFunil({ nome: "  ", etapas: [{ nome: " Contato " }, { nome: "contato" }, { nome: "" }, { nome: "Venda ganha" }, { nome: "Perdido" }, null, { nome: "Visita", cor: "xx" }] })!;
  assert.equal(f.nome, "Funil Comercial Principal");
  assert.deepEqual(f.etapas, ["Contato", "Visita", ...SISTEMA]);
  assert.ok(f.etapasConfig.every((e) => e.cor && e.cor !== "xx"));
  const muitas = montarFunil({ etapas: Array.from({ length: 40 }, (_, i) => ({ nome: `Etapa ${i}` })) })!;
  assert.equal(muitas.etapas.length, MAX_ETAPAS + 3);
});

test("sem etapa válida não cria funil", () => {
  for (const v of [undefined, null, "x", {}, { etapas: [] }, { etapas: [{ nome: "Ganho" }] }]) assert.equal(montarFunil(v), null);
});

test("linhas de crm_funis: comercial e SDR só quando pedidos, sempre na empresa nova", () => {
  let n = 0;
  const id = () => `id-${++n}`;
  assert.deepEqual(linhasDeFunis("t1", null, false, id), []);
  const linhas = linhasDeFunis("t1", { nome: "Meu funil", etapas: MODELOS_DE_FUNIL[0].etapas }, true, id);
  assert.deepEqual(linhas.map((l) => [l.tipo, l.tenant_id, l.ativo]), [["comercial", "t1", true], ["sdr_ia", "t1", true]]);
  assert.equal(new Set(linhas.map((l) => l.id)).size, 2);
  assert.equal((linhas[1] as any).sdr_etapa_handoff, "Promovido Closer");
});
