import test from "node:test";
import assert from "node:assert/strict";
import { mapaPapelPorEtapa, statusPelaEtapa } from "../../src/lib/statusPelaEtapa.js";

const funis = [
  { id: "funil-comercial-default", etapas: ["Novo Lead", "Qualificação", "Negociação", "Ganho", "Perdido", "Desqualificado"] },
  { id: "kommo-1", etapas: ["Novo", "Venda ganha", "Venda perdida"] },
  { id: "f2", etapas: ["Primeiro contato", "Fechamento"] },   // "Fechamento" não é ganho pelo nome
];
const mapa = mapaPapelPorEtapa(funis);

test("papel da etapa pelo nome, com o mesmo id de etapa do sistema", () => {
  assert.equal(mapa.get("4"), "Fechado");            // funil padrão: id = posição + 1
  assert.equal(mapa.get("5"), "Perdido"); assert.equal(mapa.get("6"), "Desqualificado");
  assert.equal(mapa.get("kommo-1-1"), "Fechado");    // "Venda ganha"
  assert.equal(mapa.get("kommo-1-2"), "Perdido");
  assert.equal(mapa.get("3"), undefined); assert.equal(mapa.get("f2-1"), undefined);
});

test("negócio aberto na etapa Ganho vira ganho; status final gravado nunca é trocado", () => {
  assert.equal(statusPelaEtapa("Novo", "4", mapa), "Fechado");               // o caso da Central de Vendas: coluna Ganho, status Novo
  assert.equal(statusPelaEtapa("Em Aberto", "kommo-1-1", mapa), "Fechado");
  assert.equal(statusPelaEtapa("Novo", "6", mapa), "Desqualificado");
  assert.equal(statusPelaEtapa("Novo", "3", mapa), "Novo");                  // etapa comum: nada muda
  assert.equal(statusPelaEtapa("Perdido", "4", mapa), "Perdido");            // já perdido: respeita o gravado
  assert.equal(statusPelaEtapa("Fechado", "5", mapa), "Fechado");
  assert.equal(statusPelaEtapa("Novo", null, mapa), "Novo");
  assert.equal(statusPelaEtapa("Novo", "id-que-nao-existe", mapa), "Novo");
});
