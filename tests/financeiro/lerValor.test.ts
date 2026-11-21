import test from "node:test";
import assert from "node:assert/strict";
import { lerValor, lerValorPositivo } from "../../src/lib/dinheiro.js";
import { parseCurrencyBR } from "../../src/lib/utils.js";
import { amostrasValor } from "./_amostras.js";

// Cópia fiel da função ANTIGA (antes da unificação): é o gabarito de que nada mudou para quem já usava parseCurrencyBR.
function parseCurrencyBROriginal(val: any): number {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const str = String(val).trim();
  if (!str) return 0;

  // Handles both dot and comma e.g. "1.500,50" vs "1,500.50"
  if (str.includes(".") && str.includes(",")) {
    if (str.lastIndexOf(",") > str.lastIndexOf(".")) {
      // Brazilian format (1.500,50) -> remove non-digits except comma -> replace comma with dot
      const clean = str.replace(/[^\d,]/g, "").replace(",", ".");
      return parseFloat(clean) || 0;
    } else {
      // US format (1,500.50) -> remove non-digits except dot
      const clean = str.replace(/[^\d.]/g, "");
      return parseFloat(clean) || 0;
    }
  }

  // Only comma: "1500,50" or "50,00"
  if (str.includes(",")) {
    const clean = str.replace(/[^\d,]/g, "").replace(",", ".");
    return parseFloat(clean) || 0;
  }

  // Only dot: "1.500" (thousands) vs "1500.50" (decimal)
  if (str.includes(".")) {
    const parts = str.split(".");
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      // Thousands separator: "15.000" or "1.500"
      const clean = str.replace(/\D/g, "");
      return parseFloat(clean) || 0;
    }
    const clean = str.replace(/[^\d.]/g, "");
    return parseFloat(clean) || 0;
  }

  const clean = str.replace(/\D/g, "");
  return parseFloat(clean) || 0;
}

// Entradas plausíveis: símbolos (R$, espaço, sinal, parênteses) só nas pontas; no meio só dígito, ponto e vírgula.
const casos: unknown[] = ["1.500,50", "1,500.50", "1500,50", "50,00", "15.000", "1.500", "1500.50", "1500.5", "R$ 1.234,56", "R$1234", "abc", "", "  ", null, undefined, 0, 42, 12.5, "0,5", ".5", "1.234.567,89", "1,234,567.89", "10.00", "-50", "(50)", "1.2345", "99.999", "R$ 0,00"];

test("parseCurrencyBR (agora lerValorPositivo) responde igual à função antiga em todos os casos conhecidos", () => {
  for (const c of casos) assert.equal(parseCurrencyBR(c), parseCurrencyBROriginal(c), `entrada: ${JSON.stringify(c)}`);
});

test("parseCurrencyBR igual à antiga em 20 mil textos de valor plausíveis (BR, EUA, só dígitos, com R$ e sinal)", () => {
  // Fora da comparação: '(135.75)' e '10.50R$' — a função antiga lia 13575 e 1050 por causa do símbolo colado no fim (erro corrigido).
  for (const s of amostrasValor(20000)) { if (/\)|R\$$/.test(s)) continue; assert.equal(parseCurrencyBR(s), parseCurrencyBROriginal(s), `entrada: ${JSON.stringify(s)}`); }
});

test("lerValor: igual ao positivo, mas mantém o sinal de '-50', 'R$ -1.500,00' e '(50)'", () => {
  assert.equal(lerValor("1.500,50"), 1500.5); assert.equal(lerValor("-50"), -50); assert.equal(lerValor("R$ -1.500,00"), -1500);
  assert.equal(lerValor("(50,25)"), -50.25); assert.equal(lerValor(-3.2), -3.2); assert.equal(lerValor(NaN), 0); assert.equal(lerValor("abc"), 0);
  assert.equal(lerValorPositivo("-50"), 50);
});

test("correções: valores que as telas liam errado antes agora saem certos", () => {
  assert.equal(lerValorPositivo("1.500"), 1500);        // veículos liam 1,5
  assert.equal(lerValorPositivo("150.000"), 150000);    // FIPE/oferta de veículo liam 150
  assert.equal(lerValor("1.500,50"), 1500.5);           // assistente de proposta lia 0
  assert.equal(lerValor("1.234"), 1234);                // folha/comissões liam 1,234
  assert.equal(lerValorPositivo("1500.50"), 1500.5);    // meta/segmentos liam 150050
  assert.equal(lerValor("-1.500,00"), -1500);           // negativo continua negativo onde já era aceito
});
