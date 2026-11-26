import { test } from "node:test";
import assert from "node:assert/strict";
import { areasPermitidas, formatarValor, planilhasDoRelatorio, valorCurto, type Relatorio } from "../src/lib/relatorio";

test("cada pessoa vê só as áreas dos módulos que tem", () => {
  assert.deepEqual(areasPermitidas((m) => m === "crm" || m === "financeiro"), ["vendas", "financeiro"]);
  assert.deepEqual(areasPermitidas((m) => m === "concessionaria" || m === "catalogo"), ["operacoes", "automotivo"]);
  assert.deepEqual(areasPermitidas(() => false), []);
});

test("valores saem no formato brasileiro", () => {
  assert.equal(formatarValor(1234.5, "moeda").replace(/\s/g, " "), "R$ 1.234,50");
  assert.equal(formatarValor(12.5, "percentual"), "12,5%");
  assert.equal(formatarValor("2026-11-05", "data"), "05/11/2026");
  assert.equal(formatarValor(null, "numero"), "—");
  assert.equal(formatarValor(0, "numero"), "0");
  assert.equal(valorCurto(3404030, "moeda"), "3,4 mi");
  assert.equal(valorCurto(2088, "numero"), "2,1 mil");
});

test("a planilha leva os indicadores e as tabelas com linhas, sem nome de aba repetido", () => {
  const tabela = (titulo: string, n: number) => ({ titulo, nota: "", colunas: [{ chave: "v", titulo: "Valor", formato: "moeda" as const }], linhas: Array.from({ length: n }, () => ({ v: 10 })) });
  const area = (id: any, titulo: string) => ({ id, titulo, abas: [{ id: `${id}-resumo`, titulo: "Resumo", nota: "", graficos: [], cards: [{ titulo: "Total", valor: 2, formato: "numero" as const, detalhe: "", alerta: false }], tabelas: [tabela("Um título de tabela comprido demais para o Excel", 2), tabela("Vazia", 0)] }] });
  const r: Relatorio = { empresa: "E", filial: "", periodo: { inicio: "2026-11-01", fim: "2026-11-26" }, gerado_em: "2026-11-26T12:00:00Z", avisos: [], areas: [area("vendas", "Vendas"), area("financeiro", "Vendas")] };
  const abas = planilhasDoRelatorio(r);
  assert.equal(abas.length, 3);
  assert.equal(abas[0].linhas.length, 2);
  const nomes = abas.map((a) => a.nome);
  assert.equal(new Set(nomes).size, nomes.length);
  assert.ok(nomes.every((n) => n.length <= 31));
});
