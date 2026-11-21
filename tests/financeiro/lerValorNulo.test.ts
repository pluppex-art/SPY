import test from "node:test";
import assert from "node:assert/strict";
import { lerValorOuNulo, lerValor, lerCentavos } from "../../src/lib/dinheiro.js";
import { parseMoney } from "../../src/lib/tableMatch.js";
const parseMoneyToCents = (s: string) => lerCentavos(s);
import { valorDoLead } from "../../server/radarSnapshots.js";
import { amostrasValor } from "./_amostras.js";

// Cópias fiéis das funções ANTIGAS (gabarito).
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Converte "R$ 1.234,56" / "1234.56" / 1234.56 em número (ou null). */
function parseMoneyOriginal(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    return s.lastIndexOf(",") > s.lastIndexOf(".") ? num(s) : parseFloat(s.replace(/,/g, "")) || null;
  }
  if (s.includes(",")) return parseFloat(s.replace(",", "."));
  return parseFloat(s);
}

function parseMoneyToCentsOriginal(input: string): number {
  let s = String(input ?? "").replace(/[^\d.,]/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Math.round(parseFloat(s) * 100);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const norm = (n: number | null) => (n === null || Number.isNaN(n) ? null : n);
// Único caso em que a leitura nova MUDA de propósito: um ponto sem vírgula com 3 dígitos depois ("1.234" = mil duzentos e trinta e quatro, não 1,234).
const ambiguo = (s: string) => /^[^,]*\.\d{3}$/.test(s.replace(/[^\d,.-]/g, "")) || /\.\d{3}\./.test(s);

test("parseMoney (comparação de tabelas, exames, importador) igual ao antigo, exceto o ponto ambíguo", () => {
  for (const c of ["R$ 1.234,56", "1234.56", "1,234.56", "0,5", "12", "", " ", "abc", "-12,5", "10,00", 7, 7.5, null, undefined, "R$ 0,00"]) {
    assert.equal(norm(parseMoney(c)), norm(parseMoneyOriginal(c)), JSON.stringify(c));
  }
  let comparados = 0;
  for (const s of amostrasValor(20000)) {
    if (ambiguo(s) || s.includes("(")) continue; comparados++;
    assert.equal(norm(parseMoney(s)), norm(parseMoneyOriginal(s)), JSON.stringify(s));
  }
  assert.ok(comparados > 5000, `comparados: ${comparados}`);
});

test("parseMoney: o ponto ambíguo agora lê como milhar brasileiro", () => {
  assert.equal(parseMoney("1.234"), 1234); assert.equal(parseMoneyOriginal("1.234"), 1.234);
  assert.equal(parseMoney("R$ 15.000"), 15000);
  assert.equal(parseMoney(""), null); assert.equal(parseMoney("abc"), null); assert.equal(parseMoney("0"), 0);
});

test("parseMoneyToCents (planos/checkout) igual ao antigo, e agora entende o formato EUA", () => {
  assert.equal(lerCentavos("766,797.71"), 76679771); assert.equal(parseMoneyToCentsOriginal("766,797.71"), 76680);
  for (const c of ["1.997,50", "1997.5", "997", "1.997", "0", "", "abc", "-5", "R$ 12,34", "1,5", "12.50", "100.000,00"]) {
    assert.equal(parseMoneyToCents(c), parseMoneyToCentsOriginal(c), JSON.stringify(c));
  }
  for (const s of amostrasValor(20000, 4242)) { if (ambiguo(s) || s.includes("(") || /,.*\./.test(s)) continue; /* formato EUA (1,234.56): a função antiga lia errado, a nova lê certo */ assert.equal(parseMoneyToCents(s), parseMoneyToCentsOriginal(s), JSON.stringify(s)); }
});

test("valorDoLead (radar do servidor) lê número e texto, nunca NaN", () => {
  assert.equal(valorDoLead(1500), 1500); assert.equal(valorDoLead("R$ 1.234,56"), 1234.56); assert.equal(valorDoLead(null), 0);
  assert.equal(valorDoLead(NaN), 0); assert.equal(valorDoLead("abc"), 0); assert.equal(lerValor(valorDoLead("2.500")), 2500);
  assert.equal(lerValorOuNulo("") , null);
});
