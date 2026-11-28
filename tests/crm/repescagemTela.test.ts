import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { numeroDaAurora, COMO_SAIR, MENSAGEM_REPESCAGEM, REPESCAGEM_PADRAO as P, erroRepescagem, prepararRepescagem } from "../../src/lib/repescagemAurora";

const R = createRequire(import.meta.url)("../../scripts/n8n/repescagem-aurora/regras.cjs");
const ligado = { ...P, ativo: true, numeroTeste: "63999990000" };
const AGORA = new Date("2026-11-26T13:00:00Z");

test("a tela e a automação usam os mesmos padrões e textos", () => {
  assert.deepEqual({ ...R.PADRAO }, P);
  assert.equal(R.MENSAGEM_PADRAO, MENSAGEM_REPESCAGEM);
  assert.equal(R.COMO_SAIR, COMO_SAIR);
  const t = "27ef95ee-84dd-499e-9f25-cd9baecb5fe4";
  assert.equal(R.numeroDaAurora(t), numeroDaAurora(t));
});

test("não deixa salvar configuração incompleta", () => {
  assert.equal(erroRepescagem(P), null);
  assert.equal(erroRepescagem(ligado), null);
  assert.match(erroRepescagem({ ...ligado, numeroTeste: "" })!, /número/);
  assert.match(erroRepescagem({ ...ligado, limiteDia: 100 })!, /limite/);
  assert.match(erroRepescagem({ ...ligado, intervaloDias: 1 })!, /7 dias/);
  assert.match(erroRepescagem({ ...ligado, dias: [] })!, /dia/);
});

test("ao ligar ou sair do teste, as conversas antigas deixam de contar", () => {
  const novo = AGORA.toISOString();
  const antigo = { ...ligado, ativadoEm: "2026-11-01T00:00:00.000Z" };
  assert.equal(prepararRepescagem(ligado, undefined, AGORA).ativadoEm, novo);
  assert.equal(prepararRepescagem({ ...antigo, modoTeste: false }, antigo, AGORA).ativadoEm, novo);
  assert.equal(prepararRepescagem({ ...antigo, horas: 24 }, antigo, AGORA).ativadoEm, antigo.ativadoEm);
});
