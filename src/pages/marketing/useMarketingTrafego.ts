import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { DropResult } from "@hello-pangea/dnd";
import { supabase } from "../../lib/supabase";
import { friendlyError } from "../../lib/friendlyError";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { readKanbanConfig, KANBAN_KEYS, KANBAN_COR_CLASS } from "../../hooks/useKanbanConfig";

/** Campanha de tráfego pago, no formato usado pelo quadro e pelo calendário. */
export interface Campanha {
  id: string;
  /** Etapa do quadro. */
  colId: string;
  title: string;
  desc: string;
  platform: string;
  /** Início da campanha (AAAA-MM-DD) — é a data que posiciona a campanha no calendário. */
  publishDateISO: string;
  endDateISO: string;
  /** Orçamento em reais. */
  value: number;
  priority: "Alta" | "Média" | "Baixa";
  date: string;
}

export const PLATAFORMAS_TRAFEGO = ["Meta Ads", "Google Ads", "TikTok Ads", "LinkedIn Ads", "YouTube Ads", "Pinterest Ads", "X Ads", "Outra"];

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const rotuloData = (iso: string) => {
  const [, m, d] = iso.split("-");
  return m && d ? `${d} ${MESES[Number(m) - 1] ?? ""}` : "Sem data";
};

function linhaParaCampanha(r: any): Campanha {
  const inicio = r.start_date ? String(r.start_date).slice(0, 10) : "";
  return {
    id: r.id,
    colId: r.status || "planejamento",
    title: r.title || "",
    desc: r.description || "",
    platform: r.platform || "Meta Ads",
    publishDateISO: inicio,
    endDateISO: r.end_date ? String(r.end_date).slice(0, 10) : "",
    value: Number(r.budget) || 0,
    priority: r.priority === "Alta" || r.priority === "Baixa" ? r.priority : "Média",
    date: inicio ? rotuloData(inicio) : "Sem data",
  };
}

function campanhaParaLinha(c: Partial<Campanha>) {
  return {
    ...(c.title !== undefined ? { title: c.title.trim() } : {}),
    ...(c.desc !== undefined ? { description: c.desc.trim() || null } : {}),
    ...(c.platform !== undefined ? { platform: c.platform } : {}),
    ...(c.colId !== undefined ? { status: c.colId } : {}),
    ...(c.publishDateISO !== undefined ? { start_date: c.publishDateISO || null } : {}),
    ...(c.endDateISO !== undefined ? { end_date: c.endDateISO || null } : {}),
    ...(c.value !== undefined ? { budget: Math.max(0, Number(c.value) || 0) } : {}),
    ...(c.priority !== undefined ? { priority: c.priority } : {}),
    updated_at: new Date().toISOString(),
  };
}

/** Quadro de tráfego pago: lê e grava as campanhas da empresa ativa. */
export function useMarketingTrafego() {
  const { activeTenantId } = useAuth();
  const { appSettings } = useData();
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const colunas = readKanbanConfig(appSettings, KANBAN_KEYS.trafego).map((c) => ({
    id: c.id,
    title: c.nome,
    color: KANBAN_COR_CLASS[c.cor] ?? "bg-slate-500",
  }));

  const carregar = useCallback(async () => {
    if (!supabase || !activeTenantId) { setCarregando(false); return; }
    setCarregando(true);
    const { data, error } = await supabase
      .from("marketing_trafego")
      .select("*")
      .eq("tenant_id", activeTenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      // 42P01 = a tabela ainda não existe (migração 20261117 não aplicada).
      setErro(error.code === "42P01" || /marketing_trafego/.test(error.message) ? "tabela" : friendlyError(error));
      setCampanhas([]);
    } else {
      setErro(null);
      setCampanhas((data || []).map(linhaParaCampanha));
    }
    setCarregando(false);
  }, [activeTenantId]);

  useEffect(() => { carregar(); }, [carregar]);

  const criar = async (c: Omit<Campanha, "id" | "date">): Promise<boolean> => {
    if (!supabase || !activeTenantId) return false;
    if (!c.title.trim()) { toast.error("Dê um nome à campanha."); return false; }
    const { data, error } = await supabase
      .from("marketing_trafego")
      .insert({ ...campanhaParaLinha(c), tenant_id: activeTenantId })
      .select("*")
      .single();
    if (error) { toast.error(`Não foi possível criar a campanha: ${friendlyError(error)}`); return false; }
    setCampanhas((prev) => [...prev, linhaParaCampanha(data)]);
    toast.success("Campanha criada.");
    return true;
  };

  const atualizar = async (id: string, patch: Partial<Campanha>, silencioso = false): Promise<boolean> => {
    if (!supabase || !activeTenantId) return false;
    const { error } = await supabase.from("marketing_trafego").update(campanhaParaLinha(patch)).eq("id", id).eq("tenant_id", activeTenantId);
    if (error) { toast.error(`Não foi possível salvar: ${friendlyError(error)}`); return false; }
    setCampanhas((prev) => prev.map((x) => {
      if (x.id !== id) return x;
      const novo = { ...x, ...patch };
      return { ...novo, date: novo.publishDateISO ? rotuloData(novo.publishDateISO) : "Sem data" };
    }));
    if (!silencioso) toast.success("Alterações salvas.");
    return true;
  };

  const excluir = async (id: string): Promise<boolean> => {
    if (!supabase || !activeTenantId) return false;
    const { error } = await supabase.from("marketing_trafego").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", activeTenantId);
    if (error) { toast.error(`Não foi possível excluir: ${friendlyError(error)}`); return false; }
    setCampanhas((prev) => prev.filter((x) => x.id !== id));
    toast.success("Campanha excluída.");
    return true;
  };

  /** Arrastar um cartão para outra etapa grava a nova etapa. */
  const aoArrastar = async (r: DropResult) => {
    const { destination, source, draggableId } = r;
    if (!destination || destination.droppableId === source.droppableId) return;
    const alvo = campanhas.find((c) => c.id === draggableId);
    if (!alvo) return;
    const antes = alvo.colId;
    setCampanhas((prev) => prev.map((c) => (c.id === draggableId ? { ...c, colId: destination.droppableId } : c)));
    const ok = await atualizar(draggableId, { colId: destination.droppableId }, true);
    if (!ok) setCampanhas((prev) => prev.map((c) => (c.id === draggableId ? { ...c, colId: antes } : c)));
    else toast.success(`“${alvo.title}” movida para ${colunas.find((c) => c.id === destination.droppableId)?.title ?? "outra etapa"}.`);
  };

  return { campanhas, colunas, carregando, erro, criar, atualizar, excluir, aoArrastar, recarregar: carregar };
}
