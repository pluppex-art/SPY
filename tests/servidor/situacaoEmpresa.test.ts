import { test } from "node:test";
import assert from "node:assert/strict";
import { situacaoDaEmpresa, bloqueiaAcesso, diaBR } from "../../src/lib/situacaoEmpresa.js";
import { criarSituacaoEmpresa, rotaLivre } from "../../server/situacaoEmpresa.js";

const AGORA = Date.parse("2026-11-26T15:00:00Z");
const venceu = (dias: number) => new Date(AGORA - dias * 86_400_000).toISOString().slice(0, 10);
const s = (dias: number, status = "active") => situacaoDaEmpresa({ status: "Active", assinatura: { status, current_period_end: venceu(dias) } }, AGORA);

test("sem assinatura e empresa dona do sistema: sempre ativa", () => {
  assert.equal(situacaoDaEmpresa({ status: "Active" }, AGORA).estado, "ativa");
  assert.equal(situacaoDaEmpresa({ status: "Inactive", ehRaiz: true }, AGORA).estado, "ativa");
});

test("em dia (vence hoje ou depois) é ativa", () => {
  assert.equal(s(0).estado, "ativa");
  assert.equal(s(-10).estado, "ativa");
});

test("dias 1 a 15: aviso, ainda entra, com contagem", () => {
  const d1 = s(1);
  assert.equal(d1.estado, "aviso"); assert.equal(d1.diasParaDesabilitar, 15); assert.equal(d1.diasParaExclusao, 44);
  const d15 = s(15);
  assert.equal(d15.estado, "aviso"); assert.equal(d15.diasParaDesabilitar, 1);
  assert.equal(bloqueiaAcesso(d15), false);
});

test("dia 16 ao 44: desabilitada; dia 45: pronta para exclusão (ainda bloqueada)", () => {
  assert.equal(s(16).estado, "desabilitada");
  assert.equal(s(16).diasParaExclusao, 29);
  assert.equal(s(44).estado, "desabilitada");
  assert.equal(s(45).estado, "excluir");
  assert.equal(bloqueiaAcesso(s(45)), true);
});

test("teste grátis usa o fim do teste; suspensa no cadastro bloqueia na hora", () => {
  assert.equal(situacaoDaEmpresa({ assinatura: { status: "trial", trial_ends_at: venceu(3), current_period_end: venceu(-30) } }, AGORA).estado, "aviso");
  assert.equal(s(-5, "suspended").estado, "desabilitada");
  assert.equal(s(50, "canceled").estado, "excluir");
});

test("desativação manual é permanente e nunca entra na exclusão, mesmo muito atrasada", () => {
  const m = situacaoDaEmpresa({ status: "Inactive", assinatura: { status: "active", current_period_end: venceu(90) } }, AGORA);
  assert.equal(m.estado, "desabilitada"); assert.equal(m.motivo, "manual"); assert.equal(m.diasParaExclusao, null);
});

test("dia no horário de Brasília", () => assert.equal(diaBR("2026-11-27T02:00:00Z"), "2026-11-26"));

test("a rota de situação que a tela usa fica livre no endereço em que o servidor a monta", async () => {
  const { readFileSync } = await import("node:fs");
  const server = readFileSync("server.ts", "utf8");
  const base = /app\.use\("([^"]+)", saas\.billingRouter\)/.exec(server)?.[1];
  assert.ok(base, "não achei onde o roteador de assinatura é montado");
  assert.equal(rotaLivre(`${base}/status`), true);
  assert.match(readFileSync("src/lib/saasApi.ts", "utf8"), new RegExp(`${base}/status`));
});

test("rotas livres para quem está desabilitado", () => {
  assert.equal(rotaLivre("/api/checkout"), true);
  assert.equal(rotaLivre("/api/billing/status"), true);
  assert.equal(rotaLivre("/api/leads"), false);
  assert.equal(rotaLivre("/api/checkoutx"), false);
});

function db(opts: { master?: boolean; status?: string; erro?: boolean }) {
  return { from(t: string) {
    const q: any = {}; q.select = () => q; q.eq = () => q;
    q.maybeSingle = async () => {
      if (opts.erro) return { data: null, error: { message: "x" } };
      if (t === "users") return { data: { tenant_id: "t1", is_master: !!opts.master } };
      if (t === "tenants") return { data: { status: opts.status ?? "Active" } };
      return { data: null };
    };
    return q;
  } };
}
const trava = (o: Parameters<typeof db>[0], rota = "/api/leads") => criarSituacaoEmpresa({ supabaseService: db(o), tenantRaiz: "raiz" }).bloqueioDe("u1", rota);

test("trava: bloqueia desabilitada; libera ativa, master, rota livre e erro de consulta", async () => {
  assert.equal((await trava({ status: "Inactive" }))?.estado, "desabilitada");
  assert.equal(await trava({ status: "Active" }), null);
  assert.equal(await trava({ status: "Inactive", master: true }), null);
  assert.equal(await trava({ status: "Inactive" }, "/api/checkout/x"), null);
  assert.equal(await trava({ erro: true }), null);
});
