import test from "node:test";
import assert from "node:assert/strict";
import { SLA_RESPOSTA_PADRAO as P, erroSlaResposta, prepararParaSalvar } from "../../src/lib/slaResposta";

const ligado = { ...P, ativo: true, numeroTeste: "63999990000" };
const AGORA = new Date("2026-11-26T13:00:00Z");

test("padrão vem desligado, em teste e sem rodízio", () => {
  assert.equal(P.ativo, false);
  assert.equal(P.modoTeste, true);
  assert.equal(P.rodizio, false);
});

test("não deixa salvar configuração incompleta", () => {
  assert.equal(erroSlaResposta(P), null);
  assert.equal(erroSlaResposta(ligado), null);
  assert.match(erroSlaResposta({ ...ligado, numeroTeste: "" })!, /número/);
  assert.match(erroSlaResposta({ ...ligado, popup: false, whatsapp: false })!, /aviso/);
  assert.match(erroSlaResposta({ ...ligado, dias: [] })!, /dia/);
  assert.match(erroSlaResposta({ ...ligado, inicio: "18:00", fim: "08:00" })!, /expediente/);
  assert.match(erroSlaResposta({ ...ligado, rodizio: true, rodizioHoras: 0.1 })!, /rodízio/);
});

test("ao ligar, sair do teste ou ativar o rodízio, as esperas antigas deixam de contar", () => {
  const novo = AGORA.toISOString();
  const antigo = { ...ligado, ativadoEm: "2026-11-01T00:00:00.000Z" };
  assert.equal(prepararParaSalvar(ligado, undefined, AGORA).ativadoEm, novo);
  assert.equal(prepararParaSalvar({ ...antigo, modoTeste: false }, antigo, AGORA).ativadoEm, novo);
  assert.equal(prepararParaSalvar({ ...antigo, rodizio: true }, antigo, AGORA).ativadoEm, novo);
  assert.equal(prepararParaSalvar({ ...antigo, minutos: 5 }, antigo, AGORA).ativadoEm, antigo.ativadoEm);
});
