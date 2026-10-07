import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export interface AiLearning {
  id: string;
  tenantId: string;
  category: string;
  content: string;
  context: string | null;
  confidence: number;
  active: boolean;
  isPlatformWide: boolean;
  createdAt: string;
}

/**
 * Le/gerencia `public.aurora_learnings` — as lições de venda que a IA extrai das conversas todo dia
 * (n8n: "Júlia - Aprendizado Diário") e usa para melhorar. Isolado por RLS:
 *  - cada empresa só vê/edita as PRÓPRIAS lições (is_platform_wide = false);
 *  - lições gerais (is_platform_wide = true) são insumo interno da IA entre empresas e só o master
 *    da plataforma as enxerga (moderação). Nenhuma empresa as lê.
 */
export function useAiLearnings(scope: "empresa" | "plataforma") {
  const { activeTenantId } = useAuth();
  const [items, setItems] = useState<AiLearning[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase || (scope === "empresa" && !activeTenantId)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = supabase
      .from("aurora_learnings")
      .select("id, tenant_id, category, content, context, confidence, active, is_platform_wide, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    q = scope === "empresa" ? q.eq("tenant_id", activeTenantId!).eq("is_platform_wide", false) : q.eq("is_platform_wide", true);
    const { data, error } = await q;
    if (error) {
      console.error("[Supabase] aurora_learnings select error:", error.message);
      setItems([]);
    } else {
      setItems(
        (data ?? []).map((r: any) => ({
          id: r.id,
          tenantId: r.tenant_id,
          category: r.category,
          content: r.content,
          context: r.context,
          confidence: r.confidence,
          active: r.active,
          isPlatformWide: r.is_platform_wide,
          createdAt: r.created_at,
        }))
      );
    }
    setLoading(false);
  }, [activeTenantId, scope]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setActive = useCallback(
    async (id: string, active: boolean) => {
      if (!supabase) return { error: "Sem conexão" };
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, active } : i)));
      const { error } = await supabase.from("aurora_learnings").update({ active }).eq("id", id);
      if (error) {
        console.error("[Supabase] aurora_learnings update error:", error.message);
        await refresh();
        return { error: error.message };
      }
      return { error: null };
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!supabase) return { error: "Sem conexão" };
      const { error } = await supabase.from("aurora_learnings").delete().eq("id", id);
      if (error) return { error: error.message };
      setItems((prev) => prev.filter((i) => i.id !== id));
      return { error: null };
    },
    []
  );

  const add = useCallback(
    async (content: string, category: string) => {
      if (!supabase || !activeTenantId) return { error: "Sem tenant ativo" };
      const { error } = await supabase.from("aurora_learnings").insert({
        tenant_id: activeTenantId,
        is_platform_wide: false,
        category,
        content,
        context: "Cadastrada manualmente",
        confidence: 100,
        active: true,
      });
      if (error) return { error: error.message };
      await refresh();
      return { error: null };
    },
    [activeTenantId, refresh]
  );

  return { items, loading, setActive, remove, add, refresh };
}
