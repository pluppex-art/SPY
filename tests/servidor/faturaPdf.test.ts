import test from "node:test";
import assert from "node:assert/strict";
import { formatarDocumento, dataBR, dadosDaFatura, gerarFaturaPdf } from "../../server/faturaPdf.js";

test("documento e data: máscara de CPF/CNPJ e data sem escorregar de dia", () => {
  assert.equal(formatarDocumento("52998224725"), "529.982.247-25");
  assert.equal(formatarDocumento("12345678000195"), "12.345.678/0001-95");
  assert.equal(formatarDocumento("abc"), "abc");
  assert.equal(dataBR("2026-11-21"), "21/11/2026");
  assert.equal(dataBR("2026-11-21T23:30:00-03:00"), "21/11/2026");
  assert.equal(dataBR(null), "");
});

test("pago vira RECIBO; em aberto vira FATURA; cliente é a pessoa do lançamento", () => {
  const e = { id: "ganho_b6fc9218-53c3", counterparty: "Cícero Divino", description: "caixa trifásica", value: "2244.00", status: "Pago", date_normalized: "2026-11-21", data_pagamento: "2026-11-21", payment_method: "Pix" };
  const d = dadosDaFatura(e, { razaoSocial: "LUMINAR LTDA", cnpj: "12345678000195" }, { name: "Luminar", documento: "" }, "Luminar", "2026-11-21");
  assert.equal(d.tipoDocumento, "RECIBO"); assert.equal(d.cliente.nome, "Cícero Divino"); assert.equal(d.valor, 2244); assert.equal(d.numero, "B6FC9218");
  assert.equal(dadosDaFatura({ ...e, status: "A Vencer" }, null, null, "Luminar", "2026-11-21").tipoDocumento, "FATURA");
  assert.equal(dadosDaFatura({ value: 1 }, null, null, "Minha Empresa", "2026-11-21").emitente.nome, "Minha Empresa");
});

test("PDF de verdade: começa com %PDF e tem corpo", () => {
  const d = dadosDaFatura({ id: "abcdef12", counterparty: "Cícero Divino", value: 2244, status: "A Vencer", date_normalized: "2026-12-05" }, { razaoSocial: "LUMINAR LTDA", cnpj: "12345678000195", endereco: "Rua A, 10" }, null, "Luminar", "2026-11-21");
  const pdf = gerarFaturaPdf(d);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 1500);
});

import { valorPorExtenso, sanitizarModelo, sanitizarConfig, escolherModelo, aplicarVariaveis, logoValida, MODELO_PADRAO } from "../../server/modeloRecibo.js";

test("valor por extenso (reais e centavos)", () => {
  const c: [number, string][] = [
    [2244, "dois mil duzentos e quarenta e quatro reais"], [1500, "mil e quinhentos reais"], [1, "um real"], [101.5, "cento e um reais e cinquenta centavos"],
    [1000000, "um milhão de reais"], [0.01, "um centavo"], [2000, "dois mil reais"], [1001, "mil e um reais"], [1100, "mil e cem reais"], [100, "cem reais"],
    [1234567, "um milhão, duzentos e trinta e quatro mil quinhentos e sessenta e sete reais"], [90, "noventa reais"], [0, "zero real"], [2244.5, "dois mil duzentos e quarenta e quatro reais e cinquenta centavos"],
  ];
  for (const [v, t] of c) assert.equal(valorPorExtenso(v), t, String(v));
});

test("variáveis do texto: troca as conhecidas e deixa as desconhecidas visíveis", () => {
  assert.equal(aplicarVariaveis("Recebi de {{cliente}} {{ valor }} ({{valor_extenso}}) {{xyz}}", { cliente: "Ana", valor: "R$ 10,00", valor_extenso: "dez reais" }), "Recebi de Ana R$ 10,00 (dez reais) {{xyz}}");
});

test("modelo: só dados válidos entram (cor, logo, tamanhos); 'padrao' não pode ser sobrescrito; principal inválido volta ao padrão", () => {
  const m = sanitizarModelo({ id: "meu modelo!", nome: "  X ", cor: "vermelho", logo: "javascript:alert(1)", abertura: "a".repeat(5000), mostrar: { assinatura: true, emitente: "sim" } });
  assert.equal(m.id, "meumodelo"); assert.equal(m.cor, MODELO_PADRAO.cor); assert.equal(m.logo, ""); assert.equal(m.abertura.length, 800);
  assert.equal(m.mostrar.assinatura, true); assert.equal(m.mostrar.emitente, true);
  assert.equal(logoValida("data:image/png;base64,iVBORw0KGgo="), "data:image/png;base64,iVBORw0KGgo=");
  assert.equal(logoValida("data:image/svg+xml;base64,PHN2Zz4="), "");
  const c = sanitizarConfig({ modelos: [{ id: "padrao", nome: "invasor" }, { id: "a", nome: "A" }, { id: "a", nome: "A2" }], principalId: "zzz" });
  assert.deepEqual(c.modelos.map((x) => x.id), ["a"]); assert.equal(c.principalId, "padrao");
  assert.equal(sanitizarConfig({ modelos: [{ id: "a" }], principalId: "a" }).principalId, "a");
  assert.equal(escolherModelo({ modelos: [{ id: "a", nome: "A", cor: "#112233" }], principalId: "a" }).cor, "#112233");
  assert.equal(escolherModelo({ modelos: [{ id: "a" }], principalId: "a" }, "inexistente").id, "padrao");
  assert.equal(escolherModelo(null).id, "padrao");
});

test("PDF com modelo próprio (corpo com variáveis, assinatura, observações) é gerado", () => {
  const m = sanitizarModelo({ id: "x", nome: "Elaborado", cor: "#16a34a", tituloRecibo: "RECIBO DE PAGAMENTO", abertura: "Recebi de {{cliente}} a quantia de {{valor}} ({{valor_extenso}}), referente a {{descricao}}.", observacoes: "Obrigado pela preferência.", mostrar: { assinatura: true } });
  const d = dadosDaFatura({ id: "abcdef12", counterparty: "Cícero Divino", description: "caixa trifásica", value: 2244, status: "Pago", data_pagamento: "2026-11-21" }, { razaoSocial: "LUMINAR LTDA" }, null, "Luminar", "2026-11-21");
  const pdf = gerarFaturaPdf(d, m);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-"); assert.ok(pdf.length > 1500);
});

import { crc16, montarBrCode, normalizarChavePix, semAcento } from "../../server/pix.js";

test("Pix: CRC16 confere com o vetor padrão e o BR Code fecha o próprio CRC", () => {
  assert.equal(crc16("123456789"), "29B1");
  const code = montarBrCode({ chave: "12345678000195", nome: "Luminar Loja Elétrica Ltda", cidade: "Goiânia", valor: 2244.5, txid: "SPYB6FC9218" });
  assert.ok(code.startsWith("000201010211"));
  assert.ok(code.includes("br.gov.bcb.pix0114" + "12345678000195"));
  assert.ok(code.includes("5407" + "2244.50"));
  assert.ok(code.includes("5802BR")); assert.ok(code.includes("5925LUMINAR LOJA ELETRICA LTD"));
  assert.ok(code.includes("6007GOIANIA")); assert.ok(code.includes("0511SPYB6FC9218"));
  assert.equal(code.slice(-4), crc16(code.slice(0, -4)));
});

test("Pix: chave é validada e normalizada; acentos e símbolos saem do nome", () => {
  assert.deepEqual(normalizarChavePix("529.982.247-25"), { tipo: "cpf", chave: "52998224725" });
  assert.deepEqual(normalizarChavePix("00.000.000/0001-91"), { tipo: "cnpj", chave: "00000000000191" });
  assert.deepEqual(normalizarChavePix("Contato@Empresa.com.br"), { tipo: "email", chave: "contato@empresa.com.br" });
  assert.deepEqual(normalizarChavePix("+55 (62) 99999-0000"), { tipo: "telefone", chave: "+5562999990000" });
  assert.equal(normalizarChavePix("123e4567-e89b-12d3-a456-426614174000")?.tipo, "aleatoria");
  assert.equal(normalizarChavePix("52998224726"), null);
  assert.equal(normalizarChavePix("62999990000"), null);
  assert.equal(normalizarChavePix(""), null);
  assert.equal(semAcento("João & Cia — São Paulo!", 25), "JOAO  CIA  SAO PAULO");
});

test("PDF da fatura em aberto com QR de Pix é gerado; recibo (pago) não leva QR", () => {
  const code = montarBrCode({ chave: "12345678000195", nome: "Luminar", cidade: "Goiania", valor: 100 });
  const aberta = dadosDaFatura({ id: "abcdef12", counterparty: "Ana Souza", value: 100, status: "A Vencer", date_normalized: "2026-12-05" }, { razaoSocial: "LUMINAR" }, null, "Luminar", "2026-11-21");
  const comQr = gerarFaturaPdf(aberta, MODELO_PADRAO, code), semQr = gerarFaturaPdf(aberta, MODELO_PADRAO, null);
  assert.ok(comQr.length > semQr.length + 2000);
  const paga = dadosDaFatura({ id: "abcdef12", counterparty: "Ana Souza", value: 100, status: "Pago", data_pagamento: "2026-11-21" }, { razaoSocial: "LUMINAR" }, null, "Luminar", "2026-11-21");
  assert.ok(Math.abs(gerarFaturaPdf(paga, MODELO_PADRAO, code).length - gerarFaturaPdf(paga, MODELO_PADRAO, null).length) < 50);
});

import { tipoDaImagem, logoDaEmpresa } from "../../server/faturaPdf.js";
test("logo da empresa: reconhece PNG/JPEG pelos bytes; URL insegura ou vazia vira 'sem logo' sem derrubar nada", async () => {
  assert.equal(tipoDaImagem(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "png");
  assert.equal(tipoDaImagem(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "jpeg");
  assert.equal(tipoDaImagem(Uint8Array.from([0x3c, 0x73, 0x76, 0x67, 0x3e])), null);   // SVG
  assert.equal(tipoDaImagem(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57])), null); // WEBP
  assert.equal(await logoDaEmpresa(""), "");
  assert.equal(await logoDaEmpresa("http://127.0.0.1/logo.png"), "");
  assert.equal(await logoDaEmpresa("file:///etc/passwd"), "");
});
