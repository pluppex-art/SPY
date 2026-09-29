/**
 * Prepara a empresa de DEMONSTRAÇÃO "Labo Vida (Demonstração)" para mostrar a Comparação de Tabelas.
 *
 *   npx tsx scripts/seedDemoLaboVida.ts            cria a empresa + base de 70 exames + 1 comparação processada
 *   npx tsx scripts/seedDemoLaboVida.ts --reset    apaga SÓ os dados de saúde dessa empresa e recria
 *   npx tsx scripts/seedDemoLaboVida.ts --sem-ia   não chama a IA (n8n); deixa os itens ambíguos pendentes
 *
 * Usa os CSVs sintéticos de scripts/exemplos/ (nenhum dado real), o MESMO motor do servidor
 * (src/lib/tableMatch.ts + travas de server/tableComparisonAi.ts) e a IA do n8n
 * (TABLE_COMPARISON_AI_WEBHOOK_URL). Precisa de VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.
 * Só toca a empresa de demonstração (checa nome + id antes de qualquer escrita/exclusão).
 */
import fs from "fs";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_FINANCE_RULES, DEFAULT_MATCH_CONFIG, MATCH_ENGINE_VERSION, buildBaseIndex, computeFinance, matchItem, normalizeName, parseMoney,
  type BaseItem,
} from "../src/lib/tableMatch.ts";
import * as AI from "../server/tableComparisonAi.ts";
import { makeN8nAiJson } from "../server/tableComparisonN8n.ts";

const DEMO_NAME = "Labo Vida (Demonstração)";
const PARCEIRO = "Medprev";
const REVISOR_USER_ID = "e59d4d8f-33ae-4489-8b1e-4332eaa9cfe7"; // pluppex.dev (master) — quem "confirma" as revisões da demo
const CONFIRMAR_NA_DEMO = 6; // revisões já confirmadas (mostra a memória); o resto fica na fila para revisar ao vivo

const args = new Set(process.argv.slice(2));
const envTxt = fs.readFileSync(new URL("../.env", import.meta.url).pathname, "utf8");
const env = (k: string) => (envTxt.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
process.env.TABLE_COMPARISON_AI_WEBHOOK_URL ||= env("TABLE_COMPARISON_AI_WEBHOOK_URL");

const url = env("VITE_SUPABASE_URL"); const key = env("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) throw new Error("Faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env");
const sb = createClient(url, key, { auth: { persistSession: false } });

const readCsv = (name: string) => {
  const txt = fs.readFileSync(new URL(`./exemplos/${name}`, import.meta.url).pathname, "utf8").replace(/^﻿/, "");
  return Papa.parse<Record<string, string>>(txt, { header: true, skipEmptyLines: true, delimiter: ";" }).data;
};
const must = <T>(r: { data: T | null; error: any }, what: string): T => { if (r.error || r.data === null) throw new Error(`${what}: ${r.error?.message || "sem dados"}`); return r.data; };

async function main() {
  // 1) Empresa de demonstração
  let { data: tenant } = await sb.from("tenants").select("id,name").eq("name", DEMO_NAME).is("deleted_at", null).maybeSingle();
  if (!tenant) {
    tenant = must(await sb.from("tenants").insert({
      name: DEMO_NAME, niche: "Clínica", status: "Active", plan: "autopilot", timezone: "America/Sao_Paulo", primary_color: "#0F766E",
      modules: { crm: true, clinica: true, aurora: true, financeiro: true, catalogo: true, bi: false, rh: false, dev: false, sdr: false, radar: false, solar: false, closer: false, varejo: false, educacao: false, marketing: false, engajamento: false, imobiliaria: false, advDashboard: false, produtividade: false, concessionaria: false },
    }).select("id,name").single(), "criar empresa");
    console.log(`Empresa criada: ${tenant.name}`);
  } else console.log(`Empresa já existe: ${tenant.name}`);
  const tenantId = tenant!.id as string;
  if (tenant!.name !== DEMO_NAME) throw new Error("Trava: nome inesperado.");

  // 2) Já tem dados? (idempotência segura)
  const { count } = await sb.from("saude_exames_base").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if ((count ?? 0) > 0) {
    if (!args.has("--reset")) { console.log(`A empresa já tem ${count} exames na base. Use --reset para recriar.`); return; }
    for (const t of ["saude_comparacao_itens", "saude_comparacoes", "saude_equivalencias", "saude_exames_base"]) {
      const { error } = await sb.from(t).delete().eq("tenant_id", tenantId);
      if (error) throw new Error(`limpar ${t}: ${error.message}`);
    }
    console.log("Dados de saúde da demonstração apagados.");
  }

  // 3) Base de exames (a que o usuário importaria da tela)
  const baseCsv = readCsv("base-exames-laboratorio.csv");
  const baseRows = baseCsv.map((r) => ({
    tenant_id: tenantId, nome: r["Nome oficial"], codigo_interno: r["Código interno"] || null, codigo_externo: r["Código externo"] || null,
    categoria: r["Categoria"] || null, nomes_alternativos: (r["Sinônimos"] || "").split("|").map((s) => s.trim()).filter(Boolean),
    custo: parseMoney(r["Custo"]), valor: parseMoney(r["Valor comercial"]), ativo: true, origem: "importacao",
  }));
  const baseInserted = must(await sb.from("saude_exames_base").insert(baseRows).select("id,nome,codigo_interno,codigo_externo,nomes_alternativos,custo,valor"), "inserir base");
  console.log(`Base: ${baseInserted.length} exames`);
  const baseById = new Map<string, BaseItem>(baseInserted.map((b: any) => [b.id, { ...b, custo: Number(b.custo), valor: Number(b.valor) }]));

  // 4) Comparação (mesmo fluxo do servidor)
  const partner = readCsv("tabela-parceiro-medprev.csv").map((r, i) => ({
    linha: i + 2, nome: r["Nome do exame"], codigo: r["Código"] || null, quantidade: parseMoney(r["Quantidade"]), valor: parseMoney(r["Valor"]),
  }));
  const matchCfg = { ...DEFAULT_MATCH_CONFIG };
  const rules = { ...DEFAULT_FINANCE_RULES };
  const comp = must(await sb.from("saude_comparacoes").insert({
    tenant_id: tenantId, parceiro: PARCEIRO, arquivo_nome: "tabela-parceiro-medprev.csv", status: "processando", total: partner.length,
    config: { match: matchCfg, rules, aurora: { autoAccept: false } }, versao_motor: MATCH_ENGINE_VERSION, created_by: REVISOR_USER_ID,
  }).select("id").single(), "criar comparação");
  const compId = comp.id as string;

  const index = buildBaseIndex([...baseById.values()], [], matchCfg);
  const itens = partner.map((r) => {
    const m = matchItem({ nome: r.nome, codigo: r.codigo }, index);
    const base = m.exame_base_id ? baseById.get(m.exame_base_id) ?? null : null;
    const fin = computeFinance(r.valor, m.status === "nao_identificado" ? null : base, rules);
    return {
      tenant_id: tenantId, comparacao_id: compId, linha: r.linha, nome_parceiro: r.nome, codigo_parceiro: r.codigo, quantidade: r.quantidade, valor_parceiro: r.valor,
      custo_parceiro: null, extras: {}, exame_base_id: m.status === "nao_identificado" ? null : m.exame_base_id, score: m.score, status: m.status, origem_decisao: m.origin,
      motivo: m.reason.slice(0, 500), evidencias: m.evidence.slice(0, 6), candidatos: m.candidates.map((c) => ({ exame_base_id: c.exame_base_id, score: c.score, reason: c.reason })),
      custo_base: fin.custo_base, valor_base: fin.valor_base, diferenca: fin.diferenca, diferenca_pct: fin.diferenca_pct, margem: fin.margem,
    };
  });
  const inserted: any[] = [];
  for (let i = 0; i < itens.length; i += 100) inserted.push(...must(await sb.from("saude_comparacao_itens").insert(itens.slice(i, i + 100)).select("*"), "inserir itens"));
  console.log(`Regras: ${inserted.filter((x) => x.status === "automatico").length} automáticas, ${inserted.filter((x) => x.status !== "automatico").length} pendentes`);

  // 5) IA (Aurora, no n8n) sobre os pendentes — mesmas travas do servidor; nunca promove a automático
  const aiJson = args.has("--sem-ia") ? undefined : makeN8nAiJson();
  if (!aiJson) console.log("IA não executada (--sem-ia ou webhook não configurado).");
  else {
    const pend = inserted.filter((x) => x.status !== "automatico");
    const withCand = pend.filter((x) => (x.candidatos || []).length > 0);
    const noCand = pend.filter((x) => (x.candidatos || []).length === 0);
    const opts = { reviewThreshold: matchCfg.reviewThreshold, autoThreshold: matchCfg.autoThreshold, aiAutoAccept: false, baseById, rules };
    let sugeridos = 0;
    for (let i = 0; i < withCand.length; i += 15) {
      const chunk = withCand.slice(i, i + 15);
      const inputs: AI.AuroraInputItem[] = chunk.map((it, idx) => ({
        i: idx, parceiro_nome: it.nome_parceiro, parceiro_codigo: it.codigo_parceiro, valor_parceiro: Number(it.valor_parceiro),
        deterministico: { score: it.score, motivo: String(it.motivo || "").slice(0, 200) },
        candidatos: it.candidatos.slice(0, 3).map((c: any) => { const b: any = baseById.get(c.exame_base_id); return { id: b.id, nome: b.nome, codigo: b.codigo_interno || null, sinonimos: (b.nomes_alternativos || []).slice(0, 6), categoria: null, material: null, unidade: null }; }),
      }));
      const verdicts = AI.parseAuroraResponse(await aiJson(AI.buildAuroraBatchPrompt(inputs), { tenantId, mode: "match" }), new Set(inputs.map((x) => x.i)));
      for (let idx = 0; idx < chunk.length; idx++) {
        const it = chunk[idx];
        const d = AI.decideWithAurora({ status: it.status, exame_base_id: it.exame_base_id, score: it.score, motivo: it.motivo, evidencias: it.evidencias || [], candidatos: it.candidatos, nome_parceiro: it.nome_parceiro, valor_parceiro: Number(it.valor_parceiro) }, verdicts.get(idx), opts);
        await sb.from("saude_comparacao_itens").update(d.update).eq("id", it.id).eq("tenant_id", tenantId);
        if (d.kind === "sugerido") sugeridos++;
      }
    }
    if (noCand.length) {
      const index2 = buildBaseIndex([...baseById.values()], [], matchCfg);
      for (let i = 0; i < noCand.length; i += 20) {
        const chunk = noCand.slice(i, i + 20);
        const inputs: AI.ExpandInputItem[] = chunk.map((it, idx) => ({ i: idx, parceiro_nome: it.nome_parceiro, parceiro_codigo: it.codigo_parceiro }));
        const verdicts = AI.parseExpandResponse(await aiJson(AI.buildExpandBatchPrompt(inputs), { tenantId, mode: "expand" }), new Set(inputs.map((x) => x.i)));
        for (let idx = 0; idx < chunk.length; idx++) {
          const it = chunk[idx];
          const d = AI.decideFromExpansion({ nome_parceiro: it.nome_parceiro, codigo_parceiro: it.codigo_parceiro, valor_parceiro: Number(it.valor_parceiro), evidencias: it.evidencias || [] }, verdicts.get(idx), { index: index2, baseById, reviewThreshold: matchCfg.reviewThreshold, rules });
          await sb.from("saude_comparacao_itens").update(d.update).eq("id", it.id).eq("tenant_id", tenantId);
          if (d.kind === "sugerido") sugeridos++;
        }
      }
    }
    await sb.from("saude_comparacoes").update({ versao_motor: `${MATCH_ENGINE_VERSION}+${AI.AURORA_MATCH_VERSION}` }).eq("id", compId).eq("tenant_id", tenantId);
    console.log(`Aurora (n8n): ${sugeridos} sugestões novas para revisão`);
  }

  // 6) "Revisão humana" já feita em algumas sugestões (vira memória do tenant) — o resto fica na fila
  const { data: revisao } = await sb.from("saude_comparacao_itens").select("*").eq("comparacao_id", compId).eq("tenant_id", tenantId).eq("status", "revisao").not("exame_base_id", "is", null).order("linha").limit(CONFIRMAR_NA_DEMO);
  for (const it of revisao || []) {
    await sb.from("saude_comparacao_itens").update({ status: "confirmado", origem_decisao: "manual", revisado_por: REVISOR_USER_ID, revisado_em: new Date().toISOString() }).eq("id", it.id).eq("tenant_id", tenantId);
    const norm = normalizeName(it.nome_parceiro);
    if (norm) {
      await sb.from("saude_equivalencias").upsert({
        tenant_id: tenantId, parceiro: PARCEIRO, exame_base_id: it.exame_base_id, nome_parceiro: it.nome_parceiro, nome_parceiro_norm: norm, codigo_parceiro: it.codigo_parceiro,
        origem: "manual", confianca: it.score, status: "ativa", confirmado_por: REVISOR_USER_ID, confirmado_em: new Date().toISOString(),
        historico: [{ at: new Date().toISOString(), by: REVISOR_USER_ID, acao: "confirm", exame_base_id: it.exame_base_id }],
      }, { onConflict: "tenant_id,parceiro,nome_parceiro_norm" });
    }
  }
  console.log(`Revisões já confirmadas na demo: ${(revisao || []).length}`);

  const { error: rerr } = await sb.rpc("saude_comparacao_recalcular", { p_comparacao_id: compId });
  if (rerr) throw new Error(`recalcular: ${rerr.message}`);
  const s = must(await sb.from("saude_comparacoes").select("status,total,qtd_automatico,qtd_revisao,qtd_nao_identificado,valor_total_parceiro,custo_total,diferenca_total").eq("id", compId).single(), "resumo");
  console.log("\nResumo da comparação de demonstração:", s);
  console.log(`\nEmpresa: ${DEMO_NAME}  (id ${tenantId})\nComparação: ${compId}\nNo SPY, como master: troque de empresa para "${DEMO_NAME}" → Clínicas e Saúde → Comparação de Tabelas.`);
}
main().catch((e) => { console.error("\nFALHOU:", e?.message || e); process.exit(1); });
