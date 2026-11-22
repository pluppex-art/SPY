import test from "node:test";
import assert from "node:assert/strict";
import { validarCnpj, deBrasilApi, deReceitaWs, deBrasilApiCep, deViaCep, lerSerieBcb, montarUrlClt } from "../../server/apisBrasil.js";

test("CNPJ: valida dígitos verificadores", () => {
  assert.equal(validarCnpj("00.000.000/0001-91"), "00000000000191");
  assert.equal(validarCnpj("00000000000192"), null);
  assert.equal(validarCnpj("11111111111111"), null);
  assert.equal(validarCnpj("123"), null);
});

test("CNPJ: as duas fontes viram o mesmo formato", () => {
  const a = deBrasilApi({ cnpj: "00000000000191", razao_social: "BANCO DO BRASIL SA", nome_fantasia: "DIRECAO GERAL", descricao_situacao_cadastral: "ATIVA", cnae_fiscal: 6422100, cnae_fiscal_descricao: "Bancos múltiplos", logradouro: "Q SAUN", numero: "S/N", municipio: "BRASILIA", uf: "DF", cep: "70040912", email: "SECEX@bb.com.br" });
  assert.equal(a.cnae, "6422100"); assert.equal(a.endereco, "Q SAUN"); assert.equal(a.email, "secex@bb.com.br"); assert.equal(a.fonte, "brasilapi");
  const b = deReceitaWs({ cnpj: "00.000.000/0001-91", nome: "BANCO DO BRASIL SA", fantasia: "DIRECAO GERAL", situacao: "ATIVA", atividade_principal: [{ code: "64.22-1-00", text: "Bancos múltiplos" }], logradouro: "Q SAUN", numero: "SN", municipio: "BRASILIA", uf: "DF", cep: "70.040-912" });
  assert.equal(b.cnpj, "00000000000191"); assert.equal(b.cnae, "6422100"); assert.equal(b.cep, "70040912"); assert.equal(b.fonte, "receitaws");
  assert.equal(a.razaoSocial, b.razaoSocial);
});

test("CEP: BrasilAPI e ViaCEP no mesmo formato; campo ausente vira vazio", () => {
  const a = deBrasilApiCep({ cep: "01001000", state: "SP", city: "São Paulo", neighborhood: "Sé", street: "Praça da Sé", ibge: { city: "3550308" }, location: { coordinates: { latitude: "-23.5", longitude: "-46.6" } } });
  const b = deViaCep({ cep: "01001-000", logradouro: "Praça da Sé", bairro: "Sé", localidade: "São Paulo", uf: "SP", ibge: "3550308" });
  assert.equal(a.cep, b.cep); assert.equal(a.logradouro, b.logradouro); assert.equal(a.ibge, b.ibge); assert.equal(b.latitude, "");
  assert.deepEqual(Object.values(deBrasilApiCep({})).filter(Boolean), ["brasilapi"]);
});

test("Banco Central: valor em texto vira número e a data vira AAAA-MM-DD; série vazia é nula", () => {
  assert.deepEqual(lerSerieBcb([{ data: "19/11/2026", valor: "5.8889" }]), { valor: 5.8889, data: "2026-11-19" });
  assert.equal(lerSerieBcb([]), null);
  assert.equal(lerSerieBcb([{ data: "x", valor: "abc" }]), null);
});

test("ContaCLT: só rotas e parâmetros conhecidos; valores estranhos são descartados", () => {
  assert.equal(montarUrlClt("salario-liquido", { salario: "3500", dependentes: "1", hack: "x" }), "https://contaclt.com/api/v1/salario-liquido?salario=3500&dependentes=1");
  assert.equal(montarUrlClt("salario-liquido", { salario: "3500,50" }), "https://contaclt.com/api/v1/salario-liquido?salario=3500%2C50");
  assert.equal(montarUrlClt("salario-liquido", { salario: "3500&x=1" }), "https://contaclt.com/api/v1/salario-liquido");
  assert.equal(montarUrlClt("tabelas", {}), "https://contaclt.com/api/v1/tabelas");
  assert.equal(montarUrlClt("../etc/passwd", {}), null);
});
