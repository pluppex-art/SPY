/**
 * Clínica & Saúde › Comparação de Tabelas — camada de serviço (API-first).
 *
 * A lógica vive aqui e em src/lib/tableMatch.ts, NÃO na tela: a mesma rota pode ser consumida por
 * um sistema externo. Tudo passa pelo cliente Supabase do usuário (`req.supabase`) → a RLS por
 * tenant vale em cada leitura/escrita; `tenant_id` também é explícito em cada linha gravada.
 *
 *   POST /api/health/table-comparison                              cria e processa uma comparação
 *   POST /api/health/table-comparison/:id/items/:itemId/decision   confirma/rejeita/troca (revisão humana)
 *   POST /api/health/table-comparison/:id/aurora                   Aurora analisa os itens ambíguos (em lotes)
 *
 * Nada aqui expõe chaves de IA ou prompts ao navegador. A Aurora entra sempre DEPOIS das regras
 * determinísticas e sob as travas de server/tableComparisonAi.ts.
 */
import type { Express, RequestHandler } from "express";
import {
  DEFAULT_FINANCE_RULES, DEFAULT_MATCH_CONFIG, MATCH_ENGINE_VERSION,
  buildBaseIndex, computeFinance, matchItem, normalizeName,
  type BaseItem, type Equivalence, type FinanceRules, type MatchConfig,
} from "../src/lib/tableMatch.js";
import {
  AURORA_MATCH_VERSION,
  buildAuroraBatchPrompt, buildExpandBatchPrompt, decideFromExpansion, decideWithAurora, parseAuroraResponse, parseExpandResponse,
  type AuroraInputItem, type ExpandInputItem,
} from "./tableComparisonAi.js";
import type { AiCtx } from "./tableComparisonN8n.js";

export const MAX_COMPARISON_ROWS = 8000;
const INSERT_BATCH = 500;
const PAGE = 1000;

interface Deps {
  requireUser: RequestHandler;
  resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>;
  limiter: RequestHandler;
  /** IA (Aurora) — roda no workflow do n8n (server/tableComparisonN8n.ts). Ausente = Aurora indisponível (503). */
  aiJson?: (prompt: string, ctx: AiCtx) => Promise<string>;
}

const AURORA_BATCH = 15;
const AURORA_MAX_PER_CALL = 60;

const clean = (v: unknown, max: number): string => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && Math.abs(n) < 1e12 ? n : null;
};
const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

async function fetchAll(sb: any, table: string, columns: string, filter: (q: any) => any): Promise<any[]> {
  const all: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await filter(sb.from(table).select(columns)).range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

export function registerTableComparisonRoutes(app: Express, { requireUser, resolveRequestedTenantId, limiter, aiJson }: Deps) {
  app.use("/api/health/table-comparison", limiter);

  app.post("/api/health/table-comparison", requireUser, async (req: any, res) => {
    let comparisonId: string | null = null;
    const sb = req.supabase;
    try {
      const tenantId = await resolveRequestedTenantId(req, res);
      if (!tenantId) return;

      // ── Validação de entrada ──
      const parceiro = clean(req.body?.parceiro, 120);
      if (!parceiro) return res.status(400).json({ error: "Informe o parceiro/origem da tabela." });
      const rawRows = req.body?.rows;
      if (!Array.isArray(rawRows) || rawRows.length === 0) return res.status(400).json({ error: "A tabela não tem linhas." });
      if (rawRows.length > MAX_COMPARISON_ROWS) {
        return res.status(413).json({ error: `Tabela grande demais (${rawRows.length} linhas). O limite por comparação é ${MAX_COMPARISON_ROWS}.` });
      }
      const rows = rawRows
        .map((r: any, i: number) => ({
          linha: clampInt(r?.linha, 1, 10_000_000, i + 1),
          nome: clean(r?.nome, 300),
          codigo: clean(r?.codigo, 80) || null,
          quantidade: toNum(r?.quantidade),
          valor: toNum(r?.valor),
          custo: toNum(r?.custo),
          extras: typeof r?.extras === "object" && r.extras && !Array.isArray(r.extras)
            ? Object.fromEntries(Object.entries(r.extras).slice(0, 20).map(([k, v]) => [clean(k, 60), clean(v, 200)]))
            : {},
        }))
        .filter((r) => r.nome || r.codigo);
      if (rows.length === 0) return res.status(400).json({ error: "Nenhuma linha com nome ou código de exame." });

      const cfgIn = req.body?.config || {};
      const matchCfg: MatchConfig = {
        autoThreshold: clampInt(cfgIn.autoThreshold, 80, 100, DEFAULT_MATCH_CONFIG.autoThreshold),
        reviewThreshold: clampInt(cfgIn.reviewThreshold, 50, 99, DEFAULT_MATCH_CONFIG.reviewThreshold),
        autoMargin: clampInt(cfgIn.autoMargin, 0, 50, DEFAULT_MATCH_CONFIG.autoMargin),
      };
      const rulesIn = req.body?.rules || {};
      const rules: FinanceRules = {
        baseValueField: rulesIn.baseValueField === "custo" ? "custo" : DEFAULT_FINANCE_RULES.baseValueField,
        marginOn: rulesIn.marginOn === "base" ? "base" : DEFAULT_FINANCE_RULES.marginOn,
      };

      // ── Base do tenant + memória ──
      const baseRows = await fetchAll(sb, "saude_exames_base",
        "id,nome,codigo_interno,codigo_externo,nomes_alternativos,custo,valor",
        (q) => q.eq("tenant_id", tenantId).eq("ativo", true));
      if (baseRows.length === 0) {
        return res.status(400).json({ error: "A base de exames está vazia. Cadastre ou importe a base antes de comparar." });
      }
      const memRows = await fetchAll(sb, "saude_equivalencias",
        "exame_base_id,nome_parceiro_norm,codigo_parceiro,parceiro",
        (q) => q.eq("tenant_id", tenantId).eq("status", "ativa").in("parceiro", ["", parceiro]));

      // ── Cria a comparação e acompanha o status ──
      const { data: comp, error: compErr } = await sb.from("saude_comparacoes").insert({
        tenant_id: tenantId, parceiro, arquivo_nome: clean(req.body?.arquivo_nome, 200) || null,
        status: "validando", total: rows.length, config: { match: matchCfg, rules, aurora: { autoAccept: cfgIn.aiAutoAccept === true } }, versao_motor: MATCH_ENGINE_VERSION,
        created_by: req.user?.id ?? null,
      }).select("id").single();
      if (compErr || !comp) throw compErr || new Error("Falha ao criar a comparação.");
      comparisonId = comp.id as string;
      const setStatus = (status: string) => sb.from("saude_comparacoes").update({ status }).eq("id", comparisonId).eq("tenant_id", tenantId);

      await setStatus("normalizando");
      const baseById = new Map<string, BaseItem>(baseRows.map((b: any) => [b.id, { ...b, custo: toNum(b.custo), valor: toNum(b.valor) }]));
      const index = buildBaseIndex([...baseById.values()], memRows as Equivalence[], matchCfg);

      await setStatus("processando");
      const itens = rows.map((r) => {
        const m = matchItem({ nome: r.nome, codigo: r.codigo }, index);
        const base = m.exame_base_id ? baseById.get(m.exame_base_id) ?? null : null;
        // Financeiro só faz sentido quando existe uma correspondência sugerida/aceita.
        const fin = computeFinance(r.valor, m.status === "nao_identificado" ? null : base, rules);
        return {
          tenant_id: tenantId, comparacao_id: comparisonId, linha: r.linha,
          nome_parceiro: r.nome, codigo_parceiro: r.codigo, quantidade: r.quantidade,
          valor_parceiro: r.valor, custo_parceiro: r.custo, extras: r.extras,
          exame_base_id: m.status === "nao_identificado" ? null : m.exame_base_id,
          score: m.score, status: m.status, origem_decisao: m.origin,
          motivo: m.reason.slice(0, 500), evidencias: m.evidence.slice(0, 6),
          candidatos: m.candidates.map((c) => ({ exame_base_id: c.exame_base_id, score: c.score, reason: c.reason })),
          custo_base: fin.custo_base, valor_base: fin.valor_base, diferenca: fin.diferenca,
          diferenca_pct: fin.diferenca_pct, margem: fin.margem,
        };
      });
      for (let i = 0; i < itens.length; i += INSERT_BATCH) {
        const { error } = await sb.from("saude_comparacao_itens").insert(itens.slice(i, i + INSERT_BATCH));
        if (error) throw error;
      }
      const { error: recalcErr } = await sb.rpc("saude_comparacao_recalcular", { p_comparacao_id: comparisonId });
      if (recalcErr) throw recalcErr;

      const { data: summary } = await sb.from("saude_comparacoes").select("*").eq("id", comparisonId).eq("tenant_id", tenantId).single();
      return res.status(201).json({ id: comparisonId, summary });
    } catch (e: any) {
      console.error("[table-comparison] falha:", e?.message || e);
      if (comparisonId) {
        await sb.from("saude_comparacoes").update({ status: "erro", erro_mensagem: String(e?.message || "erro").slice(0, 300) }).eq("id", comparisonId);
      }
      return res.status(500).json({ error: "Não foi possível processar a comparação.", id: comparisonId });
    }
  });

  app.post("/api/health/table-comparison/:id/items/:itemId/decision", requireUser, async (req: any, res) => {
    const sb = req.supabase;
    try {
      const tenantId = await resolveRequestedTenantId(req, res);
      if (!tenantId) return;
      const action = String(req.body?.action || "");
      if (!["confirm", "reject", "select"].includes(action)) return res.status(400).json({ error: "Ação inválida." });

      const { data: item, error: itemErr } = await sb.from("saude_comparacao_itens").select("*")
        .eq("id", req.params.itemId).eq("comparacao_id", req.params.id).eq("tenant_id", tenantId).maybeSingle();
      if (itemErr) throw itemErr;
      if (!item) return res.status(404).json({ error: "Item não encontrado." });
      const { data: comp } = await sb.from("saude_comparacoes").select("id,parceiro,config").eq("id", req.params.id).eq("tenant_id", tenantId).maybeSingle();
      if (!comp) return res.status(404).json({ error: "Comparação não encontrada." });

      let baseId: string | null = null;
      if (action === "confirm") baseId = item.exame_base_id;
      if (action === "select") baseId = clean(req.body?.exame_base_id, 64) || null;
      if ((action === "confirm" || action === "select") && !baseId) {
        return res.status(400).json({ error: "Nenhum exame da base para confirmar." });
      }

      let base: any = null;
      if (baseId) {
        const { data } = await sb.from("saude_exames_base").select("id,nome,custo,valor").eq("id", baseId).eq("tenant_id", tenantId).maybeSingle();
        if (!data) return res.status(404).json({ error: "Exame da base não encontrado." });
        base = data;
      }

      const rulesCfg = comp.config?.rules || DEFAULT_FINANCE_RULES;
      const fin = base
        ? computeFinance(toNum(item.valor_parceiro), { custo: toNum(base.custo), valor: toNum(base.valor) }, rulesCfg)
        : { custo_base: null, valor_base: null, diferenca: null, diferenca_pct: null, margem: null };

      const { error: upErr } = await sb.from("saude_comparacao_itens").update({
        status: action === "reject" ? "rejeitado" : "confirmado",
        exame_base_id: action === "reject" ? null : baseId,
        origem_decisao: "manual",
        motivo: action === "reject" ? "Rejeitado por revisão humana." : (action === "select" ? "Exame escolhido manualmente." : item.motivo),
        ...fin,
        revisado_por: req.user?.id ?? null,
        revisado_em: new Date().toISOString(),
      }).eq("id", item.id).eq("tenant_id", tenantId);
      if (upErr) throw upErr;

      // Memória do tenant: confirmação/troca vira conhecimento para as próximas comparações.
      if (baseId && item.nome_parceiro) {
        const norm = normalizeName(item.nome_parceiro);
        if (norm) {
          const entry = { at: new Date().toISOString(), by: req.user?.id ?? null, acao: action, exame_base_id: baseId };
          const { data: existing } = await sb.from("saude_equivalencias").select("id,historico")
            .eq("tenant_id", tenantId).eq("parceiro", comp.parceiro).eq("nome_parceiro_norm", norm).maybeSingle();
          const historico = [...(Array.isArray(existing?.historico) ? existing.historico : []), entry].slice(-50);
          const { error: memErr } = await sb.from("saude_equivalencias").upsert({
            ...(existing ? { id: existing.id } : {}),
            tenant_id: tenantId, parceiro: comp.parceiro, exame_base_id: baseId,
            nome_parceiro: item.nome_parceiro, nome_parceiro_norm: norm, codigo_parceiro: item.codigo_parceiro,
            origem: "manual", confianca: item.score, observacao: clean(req.body?.observacao, 300) || null,
            status: "ativa", confirmado_por: req.user?.id ?? null, confirmado_em: new Date().toISOString(), historico,
          }, { onConflict: "tenant_id,parceiro,nome_parceiro_norm" });
          if (memErr) console.error("[table-comparison] memória não gravada:", memErr.message);
        }
      }

      const { error: recalcErr } = await sb.rpc("saude_comparacao_recalcular", { p_comparacao_id: comp.id });
      if (recalcErr) throw recalcErr;
      const { data: summary } = await sb.from("saude_comparacoes").select("*").eq("id", comp.id).eq("tenant_id", tenantId).single();
      return res.json({ ok: true, summary });
    } catch (e: any) {
      console.error("[table-comparison] decisão falhou:", e?.message || e);
      return res.status(500).json({ error: "Não foi possível registrar a decisão." });
    }
  });

  // Aurora: analisa os itens pendentes (revisão/não identificados COM candidatos) em lote. Limitado
  // por chamada (AURORA_MAX_PER_CALL) para manter a latência previsível — chame de novo para os
  // próximos. Só age sobre o que as regras determinísticas deixaram em dúvida.
  app.post("/api/health/table-comparison/:id/aurora", requireUser, async (req: any, res) => {
    const sb = req.supabase;
    try {
      const tenantId = await resolveRequestedTenantId(req, res);
      if (!tenantId) return;
      if (!aiJson) return res.status(503).json({ error: "A Aurora está indisponível no servidor (IA não configurada)." });

      const { data: comp } = await sb.from("saude_comparacoes").select("id,parceiro,config").eq("id", req.params.id).eq("tenant_id", tenantId).maybeSingle();
      if (!comp) return res.status(404).json({ error: "Comparação não encontrada." });
      const limite = clampInt(req.body?.limite, 1, AURORA_MAX_PER_CALL, 45);
      const matchCfg = { ...DEFAULT_MATCH_CONFIG, ...(comp.config?.match || {}) };
      const rules: FinanceRules = { ...DEFAULT_FINANCE_RULES, ...(comp.config?.rules || {}) };
      const aiAutoAccept = comp.config?.aurora?.autoAccept === true;

      const pending = await fetchAll(sb, "saude_comparacao_itens",
        "id,nome_parceiro,codigo_parceiro,valor_parceiro,status,exame_base_id,score,motivo,evidencias,candidatos",
        (q) => q.eq("tenant_id", tenantId).eq("comparacao_id", comp.id).eq("aurora_analisado", false).in("status", ["revisao", "nao_identificado"]));
      const withCandidates = pending
        .filter((it: any) => Array.isArray(it.candidatos) && it.candidatos.length > 0 && (it.status === "revisao" || it.score >= 50))
        .sort((a: any, b: any) => b.score - a.score);
      // Sem nenhum candidato utilizável: a Aurora só "traduz" o termo e o motor determinístico decide.
      const needsExpansion = pending.filter((it: any) => it.status === "nao_identificado" && !withCandidates.includes(it));
      const eligible = [...withCandidates, ...needsExpansion];
      const batchItems = withCandidates.slice(0, limite);
      const expandItems = needsExpansion.slice(0, Math.max(0, limite - batchItems.length));
      if (batchItems.length + expandItems.length === 0) {
        return res.json({ analisados: 0, sugeridos: 0, rebaixados: 0, incertos: 0, falhas: 0, restantes: 0, mensagem: "Nenhum item pendente para a Aurora analisar." });
      }

      const candIds = [...new Set(batchItems.flatMap((it: any) => it.candidatos.map((c: any) => c.exame_base_id)))] as string[];
      const baseRows = await fetchAll(sb, "saude_exames_base", "id,nome,codigo_interno,codigo_externo,nomes_alternativos,categoria,material,unidade,custo,valor",
        (q) => q.eq("tenant_id", tenantId).in("id", candIds));
      const baseById = new Map<string, any>(baseRows.map((b: any) => [b.id, { ...b, custo: toNum(b.custo), valor: toNum(b.valor) }]));

      const counts = { analisados: 0, sugeridos: 0, rebaixados: 0, incertos: 0, falhas: 0 };
      const chunks: any[][] = [];
      for (let i = 0; i < batchItems.length; i += AURORA_BATCH) chunks.push(batchItems.slice(i, i + AURORA_BATCH));

      const runChunk = async (chunk: any[]) => {
        const inputs: AuroraInputItem[] = chunk.map((it: any, idx: number) => ({
          i: idx, parceiro_nome: it.nome_parceiro, parceiro_codigo: it.codigo_parceiro, valor_parceiro: toNum(it.valor_parceiro),
          deterministico: { score: it.score, motivo: String(it.motivo || "").slice(0, 200) },
          candidatos: it.candidatos.slice(0, 3).map((c: any) => {
            const b = baseById.get(c.exame_base_id);
            return b ? { id: b.id, nome: b.nome, codigo: b.codigo_interno || b.codigo_externo || null, sinonimos: (b.nomes_alternativos || []).slice(0, 6), categoria: b.categoria || null, material: b.material || null, unidade: b.unidade || null } : null;
          }).filter(Boolean),
        }));
        let verdicts;
        try {
          const raw = await aiJson(buildAuroraBatchPrompt(inputs), { tenantId, mode: "match" });
          verdicts = parseAuroraResponse(raw, new Set(inputs.map((x) => x.i)));
        } catch (e: any) {
          console.error("[table-comparison] Aurora falhou no lote:", String(e?.message || e).slice(0, 200));
          counts.falhas += chunk.length;
          return; // itens ficam sem marcar → podem ser reanalisados
        }
        for (let idx = 0; idx < chunk.length; idx++) {
          const it = chunk[idx];
          const d = decideWithAurora(
            { status: it.status, exame_base_id: it.exame_base_id, score: it.score, motivo: it.motivo, evidencias: Array.isArray(it.evidencias) ? it.evidencias : [], candidatos: it.candidatos, nome_parceiro: it.nome_parceiro, valor_parceiro: toNum(it.valor_parceiro) },
            verdicts.get(idx),
            { reviewThreshold: matchCfg.reviewThreshold, autoThreshold: matchCfg.autoThreshold, aiAutoAccept, baseById, rules },
          );
          const { error } = await sb.from("saude_comparacao_itens").update(d.update).eq("id", it.id).eq("tenant_id", tenantId);
          if (error) { counts.falhas++; continue; }
          counts.analisados++;
          if (d.kind === "sugerido") counts.sugeridos++;
          else if (d.kind === "rebaixado") counts.rebaixados++;
          else counts.incertos++;
        }
      };
      // Fase de expansão de nomes (itens sem candidato). Usa a base inteira do tenant para o motor.
      const expandChunks: any[][] = [];
      for (let i = 0; i < expandItems.length; i += 20) expandChunks.push(expandItems.slice(i, i + 20));
      let expandCtx: { index: any; baseById: Map<string, any> } | null = null;
      const getExpandCtx = async () => {
        if (expandCtx) return expandCtx;
        const all = await fetchAll(sb, "saude_exames_base", "id,nome,codigo_interno,codigo_externo,nomes_alternativos,custo,valor",
          (q) => q.eq("tenant_id", tenantId).eq("ativo", true));
        const mem = await fetchAll(sb, "saude_equivalencias", "exame_base_id,nome_parceiro_norm,codigo_parceiro,parceiro",
          (q) => q.eq("tenant_id", tenantId).eq("status", "ativa").in("parceiro", ["", comp.parceiro]));
        const byId = new Map<string, any>(all.map((b: any) => [b.id, { ...b, custo: toNum(b.custo), valor: toNum(b.valor) }]));
        expandCtx = { index: buildBaseIndex([...byId.values()], mem as Equivalence[], matchCfg), baseById: byId };
        return expandCtx;
      };
      const runExpandChunk = async (chunk: any[]) => {
        const inputs: ExpandInputItem[] = chunk.map((it: any, idx: number) => ({ i: idx, parceiro_nome: it.nome_parceiro, parceiro_codigo: it.codigo_parceiro }));
        let verdicts;
        try {
          const raw = await aiJson(buildExpandBatchPrompt(inputs), { tenantId, mode: "expand" });
          verdicts = parseExpandResponse(raw, new Set(inputs.map((x) => x.i)));
        } catch (e: any) {
          console.error("[table-comparison] Aurora (expansão) falhou no lote:", String(e?.message || e).slice(0, 200));
          counts.falhas += chunk.length;
          return;
        }
        const ctx = await getExpandCtx();
        for (let idx = 0; idx < chunk.length; idx++) {
          const it = chunk[idx];
          const d = decideFromExpansion(
            { nome_parceiro: it.nome_parceiro, codigo_parceiro: it.codigo_parceiro, valor_parceiro: toNum(it.valor_parceiro), evidencias: Array.isArray(it.evidencias) ? it.evidencias : [] },
            verdicts.get(idx),
            { index: ctx.index, baseById: ctx.baseById, reviewThreshold: matchCfg.reviewThreshold, rules },
          );
          const { error } = await sb.from("saude_comparacao_itens").update(d.update).eq("id", it.id).eq("tenant_id", tenantId);
          if (error) { counts.falhas++; continue; }
          counts.analisados++;
          if (d.kind === "sugerido") counts.sugeridos++; else counts.incertos++;
        }
      };

      // 2 lotes em paralelo: latência menor sem estourar o limite de taxa da IA.
      for (let i = 0; i < chunks.length; i += 2) await Promise.all(chunks.slice(i, i + 2).map(runChunk));
      for (let i = 0; i < expandChunks.length; i += 2) await Promise.all(expandChunks.slice(i, i + 2).map(runExpandChunk));

      const { error: recalcErr } = await sb.rpc("saude_comparacao_recalcular", { p_comparacao_id: comp.id });
      if (recalcErr) throw recalcErr;
      await sb.from("saude_comparacoes").update({ versao_motor: `${MATCH_ENGINE_VERSION}+${AURORA_MATCH_VERSION}` }).eq("id", comp.id).eq("tenant_id", tenantId);
      const { data: summary } = await sb.from("saude_comparacoes").select("*").eq("id", comp.id).eq("tenant_id", tenantId).single();
      return res.json({ ...counts, restantes: Math.max(0, eligible.length - batchItems.length - expandItems.length), summary });
    } catch (e: any) {
      console.error("[table-comparison] Aurora endpoint falhou:", e?.message || e);
      return res.status(500).json({ error: "Não foi possível executar a análise da Aurora." });
    }
  });

}
