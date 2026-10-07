import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  updatedAt: string | null;
}

/**
 * Le/escreve `public.ai_knowledge_base` — o que a empresa conta sobre si (história, método,
 * fundadores, como vender, regras). A Júlia (SDR no n8n) lê estas linhas ao vivo, por tenant,
 * a cada conversa e usa como seu conhecimento da empresa; salvar aqui reflete na próxima
 * mensagem, sem tocar no n8n. Isolado por RLS (tenant_isolation) e filtrado por tenant ativo.
 */
export function useAiKnowledgeBase() {
  const { activeTenantId } = useAuth();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !activeTenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_knowledge_base")
      .select("id, title, content, updated_at")
      .eq("tenant_id", activeTenantId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[Supabase] ai_knowledge_base select error:", error.message);
      setEntries([]);
    } else {
      setEntries((data ?? []).map((r: any) => ({ id: r.id, title: r.title ?? "", content: r.content ?? "", updatedAt: r.updated_at })));
    }
    setLoading(false);
  }, [activeTenantId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    async (entry: { id?: string; title: string; content: string }) => {
      if (!supabase || !activeTenantId) return { error: "Sem tenant ativo" };
      setSaving(true);
      const now = new Date().toISOString();
      const { error } = entry.id
        ? await supabase
            .from("ai_knowledge_base")
            .update({ title: entry.title, content: entry.content, updated_at: now })
            .eq("id", entry.id)
            .eq("tenant_id", activeTenantId)
        : await supabase
            .from("ai_knowledge_base")
            .insert({ tenant_id: activeTenantId, title: entry.title, content: entry.content });
      setSaving(false);
      if (error) {
        console.error("[Supabase] ai_knowledge_base save error:", error.message);
        return { error: error.message };
      }
      await refresh();
      return { error: null };
    },
    [activeTenantId, refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!supabase || !activeTenantId) return { error: "Sem tenant ativo" };
      const { error } = await supabase.from("ai_knowledge_base").delete().eq("id", id).eq("tenant_id", activeTenantId);
      if (error) {
        console.error("[Supabase] ai_knowledge_base delete error:", error.message);
        return { error: error.message };
      }
      await refresh();
      return { error: null };
    },
    [activeTenantId, refresh]
  );

  return { entries, loading, saving, save, remove, refresh };
}
