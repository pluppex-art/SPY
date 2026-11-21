import test from "node:test";
import assert from "node:assert/strict";
import { normalizarCnae, normalizarMunicipio, montarUrlBusca, normalizarEmpresa, LIMITE_MAXIMO } from "../../server/prospeccaoCnae.js";

test("CNAE: aceita máscara, exige 7 dígitos", () => {
  assert.equal(normalizarCnae("47.81-4-00"), "4781400");
  assert.equal(normalizarCnae("4781400"), "4781400");
  assert.equal(normalizarCnae("4781"), null);
  assert.equal(normalizarCnae(undefined), null);
  assert.equal(normalizarMunicipio("5208707"), "5208707");
  assert.equal(normalizarMunicipio("5208"), null);
});

test("URL da busca: formato simplificado, limite entre 1 e o teto, cursor só quando existe", () => {
  const u = new URL(montarUrlBusca({ cnae: "4781400", municipio: "5208707" }));
  assert.equal(u.searchParams.get("formato"), "simplificado");
  assert.equal(u.searchParams.get("limite"), "25");
  assert.equal(u.searchParams.has("cursor"), false);
  assert.equal(new URL(montarUrlBusca({ cnae: "4781400", municipio: "5208707", limite: 99999 })).searchParams.get("limite"), String(LIMITE_MAXIMO));
  assert.equal(new URL(montarUrlBusca({ cnae: "4781400", municipio: "5208707", limite: 0 })).searchParams.get("limite"), "25");
  assert.equal(new URL(montarUrlBusca({ cnae: "4781400", municipio: "5208707", cursor: "abc" })).searchParams.get("cursor"), "abc");
});

test("empresa: campos ausentes viram vazio (nada inventado) e e-mail vai em minúsculas", () => {
  const e = normalizarEmpresa({ cnpj: "11.378.117/0001-20", nome: "ACME LTDA", fantasia: "", atividade_principal: [{ code: "47.81-4-00", text: "Comércio varejista de artigos do vestuário" }],
    logradouro: "RUA A", numero: "10", bairro: "CENTRO", municipio: "GOIANIA", uf: "GO", email: "Contato@Acme.com", telefone: "(62) 3000-0000" });
  assert.equal(e.endereco, "RUA A, 10 · CENTRO");
  assert.equal(e.email, "contato@acme.com");
  assert.equal(e.cnae, "47.81-4-00");
  assert.deepEqual(Object.values(normalizarEmpresa({})).filter(Boolean), []);
});
