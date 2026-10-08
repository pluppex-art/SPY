import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";

export interface FinanceTag {
  id: string;
  tenant_id: string;
  nome: string;
  cor: string;
  descricao: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface NewFinanceTag {
  nome: string;
  cor?: string;
  descricao?: string | null;
  ativo?: boolean;
}

export type FinanceTagPatch = Partial<Pick<FinanceTag, "nome" | "cor" | "descricao" | "ativo">>;

export const DEFAULT_TAG_COLOR = "#6366f1";
const PAGE = 1000;

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Lê todas as tags usadas em finance_entries.tags (paginado) e devolve a contagem de lançamentos por tag
 * (chave em minúsculas) e o nome original mais comum de cada uma.
 */
export async function fetchFinanceTagUsage(
  tenantId: string,
  filialId?: string | null,
): Promise<{ counts: Record<string, number>; names: Record<string, string> }> {
  const counts: Record<string, number> = {};
  const names: Record<string, string> = {};
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("finance_entries")
      .select("id, tags")
      .eq("tenant_id", tenantId)
      .not("tags", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (filialId) q = q.or(`filial_id.is.null,filial_id.eq.${filialId}`);
    const { data, error } = await q;
    if (error) throw error;
    for (const row of (data as { tags: string[] | null }[]) || []) {
      const seen = new Set<string>();
      for (const t of row.tags || []) {
        const nome = (t || "").trim();
        if (!nome) continue;
        const k = norm(nome);
        if (seen.has(k)) continue;
        seen.add(k);
        counts[k] = (counts[k] || 0) + 1;
        if (!names[k]) names[k] = nome;
      }
    }
    if (!data || data.length < PAGE) break;
  }
  return { counts, names };
}

/** Catálogo de tags do Financeiro (tabela finance_tags, isolada por tenant via RLS). */
export function useFinanceTags() {
  const { activeTenantId: tenantId } = useAuth();
  const [tags, setTags] = useState<FinanceTag[]>([]);
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  const reload = useCallback(async () => {
    if (!tenantId) { setTags([]); setLoading(false); return; }
    const req = ++reqRef.current;
    setLoading(true);
    try {
      const all: FinanceTag[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("finance_tags")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("nome")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        all.push(...((data as FinanceTag[]) || []));
        if (!data || data.length < PAGE) break;
      }
      if (req === reqRef.current) setTags(all);
    } catch (e: any) {
      if (req === reqRef.current) toast.error(`Não foi possível carregar as tags: ${e?.message || "erro desconhecido"}`);
    } finally {
      if (req === reqRef.current) setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { reload(); }, [reload]);

  const addTag = useCallback(async (input: NewFinanceTag): Promise<FinanceTag | null> => {
    const nome = (input.nome || "").trim();
    if (!tenantId) return null;
    if (!nome) { toast.error("Informe o nome da tag."); return null; }
    if (tags.some(t => norm(t.nome) === norm(nome))) {
      toast.error(`Já existe uma tag chamada "${nome}".`);
      return null;
    }
    const { data, error } = await supabase
      .from("finance_tags")
      .insert({
        tenant_id: tenantId,
        nome,
        cor: input.cor || DEFAULT_TAG_COLOR,
        descricao: input.descricao?.trim() || null,
        ativo: input.ativo ?? true,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.code === "23505" ? `Já existe uma tag chamada "${nome}".` : `Erro ao criar a tag: ${error.message}`);
      return null;
    }
    const created = data as FinanceTag;
    setTags(prev => [...prev, created].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    return created;
  }, [tenantId, tags]);

  const updateTag = useCallback(async (id: string, patch: FinanceTagPatch): Promise<boolean> => {
    const next: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
    if (patch.nome !== undefined) {
      const nome = patch.nome.trim();
      if (!nome) { toast.error("Informe o nome da tag."); return false; }
      if (tags.some(t => t.id !== id && norm(t.nome) === norm(nome))) {
        toast.error(`Já existe uma tag chamada "${nome}".`);
        return false;
      }
      next.nome = nome;
    }
    if (patch.descricao !== undefined) next.descricao = patch.descricao?.trim() || null;
    const { data, error } = await supabase.from("finance_tags").update(next).eq("id", id).select().single();
    if (error) {
      toast.error(error.code === "23505" ? "Já existe uma tag com esse nome." : `Erro ao atualizar a tag: ${error.message}`);
      return false;
    }
    setTags(prev => prev.map(t => (t.id === id ? (data as FinanceTag) : t)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    return true;
  }, [tags]);

  const removeTag = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase.from("finance_tags").delete().eq("id", id);
    if (error) { toast.error(`Erro ao excluir a tag: ${error.message}`); return false; }
    setTags(prev => prev.filter(t => t.id !== id));
    return true;
  }, []);

  return { tags, loading, addTag, updateTag, removeTag, reload };
}
