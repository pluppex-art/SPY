import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export interface IAInteraction {
  id: string; created_at: string; acao: string | null; score: number | null;
  stage_before: string | null; stage_after: string | null; handoff_motivo: string | null;
  erro: string | null; resposta_enviada: string | null;
}
export interface IAInsight { id: string; title: string; severity: string | null; description: string | null; status: string | null; detected_at: string }
export interface IAKnowledge { id: string; title: string; updated_at: string | null }
export interface IATrigger { id: string; descricao: string; status: string; leads_encontrados: number | null; created_at: string }

export interface IAOverview {
  interacoes7d: number; handoffs7d: number; erros7d: number; falhasModelo7d: number;
  recentes: IAInteraction[];
  insights: IAInsight[];
  aprendizados: number;
  conhecimento: IAKnowledge[]; conhecimentoTotal: number;
  promptsPersonalizados: number;
  config: { aurora_enabled: boolean | null; custom_prompt: string | null } | null;
  gatilhos: IATrigger[];
}

const since7d = () => new Date(Date.now() - 7 * 864e5).toISOString();

/** Reúne tudo que a Aurora fez/guarda para a empresa ATIVA (cada consulta filtra por tenant_id; falha numa não derruba as outras). */
export function useIAOverview() {
  const { activeTenantId } = useAuth();
  const [data, setData] = useState<IAOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase || !activeTenantId) { setLoading(false); return; }
    const t = activeTenantId;
    const count = (table: string, f?: (q: any) => any) => {
      let q: any = supabase!.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", t);
      if (f) q = f(q);
      return q.then((r: any) => r.count ?? 0, () => 0);
    };
    const rows = <T,>(p: PromiseLike<any>): Promise<T[]> => p.then((r: any) => (r.data as T[]) || [], () => []);
    const [interacoes7d, handoffs7d, erros7d, falhasModelo7d, aprendizados, conhecimentoTotal, promptsPersonalizados,
      recentes, insights, conhecimento, gatilhos, cfg] = await Promise.all([
      count("julia_interaction_log", (q) => q.gte("created_at", since7d())),
      count("julia_interaction_log", (q) => q.gte("created_at", since7d()).not("handoff_motivo", "is", null)),
      count("julia_interaction_log", (q) => q.gte("created_at", since7d()).not("erro", "is", null)),
      count("aurora_model_failures", (q) => q.gte("created_at", since7d())),
      count("aurora_learnings", (q) => q.eq("active", true)),
      count("ai_knowledge_base"),
      count("ai_agent_prompts"),
      rows<IAInteraction>(supabase.from("julia_interaction_log").select("id, created_at, acao, score, stage_before, stage_after, handoff_motivo, erro, resposta_enviada").eq("tenant_id", t).order("created_at", { ascending: false }).limit(10)),
      rows<IAInsight>(supabase.from("aurora_insights").select("id, title, severity, description, status, detected_at").eq("tenant_id", t).order("detected_at", { ascending: false }).limit(6)),
      rows<IAKnowledge>(supabase.from("ai_knowledge_base").select("id, title, updated_at").eq("tenant_id", t).order("updated_at", { ascending: false }).limit(8)),
      rows<IATrigger>(supabase.from("tenant_message_triggers").select("id, descricao, status, leads_encontrados, created_at").eq("tenant_id", t).order("created_at", { ascending: false }).limit(8)),
      supabase.from("tenant_ai_config").select("aurora_enabled, custom_prompt").eq("tenant_id", t).maybeSingle().then((r: any) => r.data ?? null, () => null),
    ]);
    setData({ interacoes7d, handoffs7d, erros7d, falhasModelo7d, recentes, insights, aprendizados, conhecimento, conhecimentoTotal, promptsPersonalizados, config: cfg, gatilhos });
    setLoading(false);
  }, [activeTenantId]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  return { data, loading, reload: load };
}
