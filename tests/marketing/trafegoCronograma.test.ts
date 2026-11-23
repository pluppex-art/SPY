import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularCronograma, hojeBrasilia, dataCurta } from "../../src/pages/marketing/trafegoCronograma.js";

const c = (publishDateISO: string, endDateISO: string, value = 300) => ({ publishDateISO, endDateISO, value });

test("sem data de início", () => {
  const r = calcularCronograma(c("", ""), "2026-11-23");
  assert.equal(r.rotulo, "Sem data de início");
  assert.equal(r.duracao, null);
});

test("ainda não começou", () => {
  const r = calcularCronograma(c("2026-11-25", "2026-11-30"), "2026-11-23");
  assert.equal(r.rotulo, "Começa em 2 dias");
  assert.equal(r.progresso, 0);
  assert.equal(r.duracao, 6);
  assert.equal(r.orcamentoPorDia, 50);
});

test("em andamento: progresso e dias que faltam", () => {
  const r = calcularCronograma(c("2026-11-20", "2026-11-29"), "2026-11-24");
  assert.equal(r.duracao, 10);
  assert.equal(r.decorridos, 5);
  assert.equal(r.progresso, 50);
  assert.equal(r.rotulo, "Termina em 5 dias");
  assert.equal(r.tom, "ok");
});

test("últimos dias viram alerta e o último dia é dito", () => {
  assert.equal(calcularCronograma(c("2026-11-20", "2026-11-25"), "2026-11-24").tom, "alerta");
  assert.equal(calcularCronograma(c("2026-11-20", "2026-11-25"), "2026-11-25").rotulo, "Último dia");
});

test("prazo vencido só é alerta se a campanha não foi encerrada", () => {
  assert.equal(calcularCronograma(c("2026-11-01", "2026-11-10"), "2026-11-12").rotulo, "Prazo vencido há 2 dias");
  assert.equal(calcularCronograma(c("2026-11-01", "2026-11-10"), "2026-11-12").tom, "perigo");
  assert.equal(calcularCronograma(c("2026-11-01", "2026-11-10"), "2026-11-12", true).tom, "ok");
});

test("sem data final e fim antes do início", () => {
  assert.equal(calcularCronograma(c("2026-11-20", ""), "2026-11-22").rotulo, "No 3º dia, sem data final");
  assert.equal(calcularCronograma(c("2026-11-20", "2026-11-10"), "2026-11-22").duracao, null);
});

test("orçamento zero não gera média por dia", () => {
  assert.equal(calcularCronograma(c("2026-11-20", "2026-11-29", 0), "2026-11-22").orcamentoPorDia, null);
});

test("hoje em Brasília e data curta", () => {
  assert.equal(hojeBrasilia(Date.parse("2026-11-23T01:30:00Z")), "2026-11-22");
  assert.equal(dataCurta("2026-11-23"), "23/11/2026");
  assert.equal(dataCurta(""), "—");
});
