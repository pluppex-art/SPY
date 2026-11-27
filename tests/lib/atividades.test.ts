import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarEventosDeAtividade, paginarPorData } from "../../src/lib/atividades.js";

/** Banco de mentira: mesma ordem e filtros da consulta real (data e id decrescentes, created_at <= cursor, offset). */
function banco(linhas: { id: string; created_at: string }[], tamanho: number, falharNaChamada = 0) {
  const ordenadas = [...linhas].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const chamadas: [string | null, number][] = [];
  return {
    chamadas,
    buscar: async (ate: string | null, pular: number) => {
      chamadas.push([ate, pular]);
      if (chamadas.length === falharNaChamada) return { data: null, error: "tempo esgotado" };
      return { data: ordenadas.filter((l) => !ate || l.created_at <= ate).slice(pular, pular + tamanho), error: null };
    },
  };
}

test("paginação por data traz tudo uma vez só, mesmo com muitas linhas no mesmo instante", async () => {
  // 7 no mesmo instante com página de 3: o cursor não anda e precisa pular as já recebidas.
  const linhas = Array.from({ length: 20 }, (_, i) => ({ id: `a${String(i).padStart(2, "0")}`, created_at: i < 4 ? `2026-11-0${i + 1}` : i < 11 ? "2026-10-15" : `2026-09-${10 + i}` }));
  const b = banco(linhas, 3);
  const r = await paginarPorData(b.buscar, 3);
  assert.equal(r.error, null);
  assert.equal(r.data.length, 20);
  assert.equal(new Set(r.data.map((l) => l.id)).size, 20);
  assert.ok(b.chamadas.every(([, pular]) => pular < 9), "não volta a paginar por offset pela tabela toda");
});

test("falha numa página devolve as mais recentes já recebidas, com o erro", async () => {
  const linhas = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, created_at: `2026-11-1${i}` }));
  const r = await paginarPorData(banco(linhas, 4, 2).buscar, 4);
  assert.deepEqual([r.data.map((l) => l.id), r.error], [["a9", "a8", "a7", "a6"], "tempo esgotado"]);
});

test("aviso ao vivo: muda só a linha, respeita a empresa e deixa o histórico importado fechado de fora", () => {
  const atual = [{ id: "1", leadId: "L1", title: "antiga", created_at: "2026-11-01" }, { id: "kommo-evt-1", leadId: "L2", created_at: "2026-01-01" }];
  const novo = (id: string, lead_id: string, extra: any = {}) => ({ eventType: "INSERT", new: { id, lead_id, tenant_id: "t", created_at: "2026-11-02", ...extra } });
  assert.equal(aplicarEventosDeAtividade(atual, [novo("9", "L1", { tenant_id: "outra" }), novo("kommo-evt-9", "L1"), { eventType: "DELETE", old: { id: "nao-existe" } }], "t"), atual);
  const r: any[] = aplicarEventosDeAtividade(atual, [novo("2", "L1"), novo("kommo-evt-2", "L2"), { eventType: "UPDATE", new: { id: "1", tenant_id: "t", title: "nova" } }, { eventType: "DELETE", old: { id: "kommo-evt-1" } }], "t");
  assert.deepEqual(r.map((a) => [a.id, a.leadId]), [["2", "L1"], ["kommo-evt-2", "L2"], ["1", "L1"]]);
  assert.equal(r[2].title, "nova");
  assert.equal(r[2].created_at, "2026-11-01"); // coluna que o aviso não trouxe continua
});
