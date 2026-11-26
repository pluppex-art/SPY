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

test("faltando mais de 15 dias é ativa", () => {
  assert.equal(s(-16).estado, "ativa");
  assert.equal(s(-200).estado, "ativa");
});

test("de 15 dias antes até a véspera: aviso, ainda entra, com contagem", () => {
  const d15 = s(-15);
  assert.equal(d15.estado, "aviso"); assert.equal(d15.diasParaDesabilitar, 15); assert.equal(d15.diasAtraso, 0); assert.equal(d15.vencimento, venceu(-15));
  const vespera = s(-1);
  assert.equal(vespera.estado, "aviso"); assert.equal(vespera.diasParaDesabilitar, 1);
  assert.equal(bloqueiaAcesso(vespera), false);
});

test("no dia do vencimento bloqueia; aos 45 dias fica pronta para exclusão (ainda bloqueada)", () => {
  const hoje = s(0);
  assert.equal(hoje.estado, "desabilitada"); assert.equal(bloqueiaAcesso(hoje), true); assert.equal(hoje.diasParaExclusao, 45); assert.equal(hoje.vencimento, venceu(0));
  assert.equal(s(16).diasParaExclusao, 29);
  assert.equal(s(44).estado, "desabilitada");
  assert.equal(s(45).estado, "excluir");
  assert.equal(bloqueiaAcesso(s(45)), true);
});

test("data digitada (meia-noite UTC) vale pelo próprio dia, não pela véspera", () => {
  const com = (fim: string) => situacaoDaEmpresa({ assinatura: { status: "active", current_period_end: fim } }, AGORA);
  assert.equal(com("2026-11-27T00:00:00+00:00").estado, "aviso");
  assert.equal(com("2026-11-27T00:00:00.000Z").diasParaDesabilitar, 1);
  assert.equal(com("2026-11-27T02:30:00Z").estado, "desabilitada"); // 23h30 de 26/11 em Brasília: vence hoje
});

test("teste grátis usa o fim do teste, inclusive depois de virar atraso; suspensa bloqueia na hora", () => {
  const teste = (dias: number, status = "trial") => situacaoDaEmpresa({ assinatura: { status, trial_ends_at: venceu(dias), current_period_end: status === "trial" ? venceu(-30) : null } }, AGORA);
  assert.equal(teste(-3).estado, "aviso");
  assert.equal(teste(0).estado, "desabilitada");
  assert.equal(teste(2, "past_due").estado, "desabilitada");
  assert.equal(teste(50, "suspended").estado, "excluir");
  assert.equal(situacaoDaEmpresa({ assinatura: { status: "active", trial_ends_at: venceu(50), current_period_end: null } }, AGORA).estado, "ativa");
  const adiantada = s(-5, "suspended");
  assert.equal(adiantada.estado, "desabilitada"); assert.equal(adiantada.diasParaExclusao, null);
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
