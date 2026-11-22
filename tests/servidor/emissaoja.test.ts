import test from "node:test";
import assert from "node:assert/strict";
import { chaveValida, hostDaChave, ambienteDaChave, chaveIdempotencia, validarPedido, montarCorpoNota, traduzirErro } from "../../server/emissaoja.js";

test("chave: só ej_live_/ej_test_; sandbox e produção em hosts diferentes", () => {
  assert.equal(chaveValida("ej_live_ABCDEFGH1234"), true);
  assert.equal(chaveValida("ej_test_ABCDEFGH1234"), true);
  assert.equal(chaveValida("apipj_live_ABCDEFGH1234"), false);
  assert.equal(chaveValida("ej_live_"), false);
  assert.equal(hostDaChave("ej_test_ABCDEFGH1234"), "https://sandbox.emissaoja.com.br");
  assert.equal(hostDaChave("ej_live_ABCDEFGH1234"), "https://emissaoja.com.br");
  assert.equal(ambienteDaChave("ej_test_ABCDEFGH1234"), "sandbox");
});

test("idempotência: mesma referência = mesma chave; formato aceito pela API; sem referência = sempre nova", () => {
  const a = chaveIdempotencia("t1", "lancamento-9"), b = chaveIdempotencia("t1", "lancamento-9"), c = chaveIdempotencia("t2", "lancamento-9");
  assert.equal(a, b); assert.notEqual(a, c);
  assert.match(a, /^[A-Za-z0-9_-]{8,64}$/);
  assert.notEqual(chaveIdempotencia("t1"), chaveIdempotencia("t1"));
  assert.match(chaveIdempotencia("t1"), /^[A-Za-z0-9_-]{8,64}$/);
});

test("pedido: CNPJ ou CPF, valor positivo com 2 casas, CPF exige nome completo, competência em ISO", () => {
  const ok = validarPedido({ documento: "12.345.678/0001-95", valor: "1500,00".replace(",", "."), descricao: " Consultoria " });
  assert.ok(ok.ok); if (ok.ok) { assert.equal(ok.pedido.documento, "12345678000195"); assert.equal(ok.pedido.valor, 1500); assert.equal(ok.pedido.descricao, "Consultoria"); }
  assert.equal(validarPedido({ documento: "123", valor: 10 }).ok, false);
  assert.equal(validarPedido({ documento: "12345678000195", valor: 0 }).ok, false);
  assert.equal(validarPedido({ documento: "12345678000195", valor: "abc" }).ok, false);
  assert.equal(validarPedido({ documento: "52998224725", valor: 10 }).ok, false);
  assert.equal(validarPedido({ documento: "52998224725", valor: 10, nome: "Maria" }).ok, false);
  assert.equal(validarPedido({ documento: "52998224725", valor: 10, nome: "Maria Silva" }).ok, true);
  assert.equal(validarPedido({ documento: "12345678000195", valor: 10, competencia: "21/11/2026" }).ok, false);
  const r = validarPedido({ documento: "12345678000195", valor: 10.005 }); assert.ok(r.ok);
});

test("corpo da nota: só os campos da API, sem vazios", () => {
  assert.deepEqual(montarCorpoNota({ documento: "x", valor: 10 }, { tipo: "pj", id: "abc" }), { tomador_tipo: "pj", tomador_id: "abc", valor: 10 });
  assert.deepEqual(montarCorpoNota({ documento: "x", valor: 10, descricao: "d", competencia: "2026-11-01", servicoId: "s1" }, { tipo: "pf", id: "z" }),
    { tomador_tipo: "pf", tomador_id: "z", valor: 10, servico_id: "s1", descricao: "d", competencia: "2026-11-01" });
});

test("erros: código vira mensagem em português; 401 não vira 'sessão expirada' do SPY; sem eco de segredo", () => {
  assert.equal(traduzirErro(402, { code: "limite_notas" }).error, "O limite de notas do plano da emissaoja acabou neste mês.");
  assert.equal(traduzirErro(401, { code: "chave_invalida" }).status, 400);
  assert.equal(traduzirErro(503, { code: "motor_indisponivel" }).status, 502);
  const b = traduzirErro(422, { code: "nota_bloqueada", bloqueios: [{ code: "x", mensagem: "m", acao: "a" }] });
  assert.equal(b.status, 422); assert.equal((b.bloqueios as any[]).length, 1);
  assert.equal(traduzirErro(400, { code: "desconhecido", message: "texto da API" }).error, "texto da API");
  assert.equal(traduzirErro(500, null).status, 502);
});
