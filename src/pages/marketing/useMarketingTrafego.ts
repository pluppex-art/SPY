import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { DropResult } from "@hello-pangea/dnd";
import { supabase } from "../../lib/supabase";
import { friendlyError } from "../../lib/friendlyError";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { readKanbanConfig, KANBAN_KEYS, KANBAN_COR_CLASS, KANBAN_COR_DOT } from "../../hooks/useKanbanConfig";

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
  /** Quando a campanha foi cadastrada (preenchida pelo banco; nunca é gravada pela tela). */
  createdAt?: string;
  /** Nome do colaborador responsável (vazio = sem responsável). */
  responsavel: string;
  objetivo: string;
  publico: string;
  /** Quanto já foi gasto de verdade (lançado à mão), em reais; 0 = não informado. */
  gastoReal: number;
  checklist: ItemChecklist[];
  notas: NotaCampanha[];
}

export interface ItemChecklist { id: string; texto: string; feito: boolean }
export interface NotaCampanha { id: string; autor: string; texto: string; em: string }

export const OBJETIVOS_TRAFEGO = ["Gerar leads", "Vendas", "Tráfego para o site", "Reconhecimento de marca", "Mensagens (WhatsApp)", "Remarketing", "Outro"];
export const CHECKLIST_PADRAO = ["Público definido", "Criativos aprovados", "Pixel / conversões configurados", "Orçamento aprovado", "Campanha publicada"];

// A coluna `extras` vem da migração 20261213; sem ela, grava só o resto em vez de falhar.
let gravaExtras = true;

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
    createdAt: r.created_at || "",
    responsavel: typeof r.extras?.responsavel === "string" ? r.extras.responsavel : "",
    objetivo: typeof r.extras?.objetivo === "string" ? r.extras.objetivo : "",
    publico: typeof r.extras?.publico === "string" ? r.extras.publico : "",
    gastoReal: Number(r.extras?.gastoReal) || 0,
    checklist: Array.isArray(r.extras?.checklist) ? r.extras.checklist.filter((i: any) => i && typeof i.texto === "string").map((i: any) => ({ id: String(i.id ?? i.texto), texto: i.texto, feito: !!i.feito })) : [],
    notas: Array.isArray(r.extras?.notas) ? r.extras.notas.filter((n: any) => n && typeof n.texto === "string").map((n: any) => ({ id: String(n.id ?? n.em), autor: String(n.autor ?? ""), texto: n.texto, em: String(n.em ?? "") })) : [],
  };
}

const CAMPOS_EXTRAS = ["responsavel", "objetivo", "publico", "gastoReal", "checklist", "notas"] as const;
const extrasDe = (c: Campanha) => ({
  responsavel: c.responsavel.trim(), objetivo: c.objetivo.trim(), publico: c.publico.trim(), gastoReal: Math.max(0, Number(c.gastoReal) || 0),
  checklist: c.checklist.slice(0, 40).map((i) => ({ id: i.id, texto: i.texto.slice(0, 200), feito: i.feito })),
  notas: c.notas.slice(-100).map((n) => ({ id: n.id, autor: n.autor.slice(0, 80), texto: n.texto.slice(0, 2000), em: n.em })),
});

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

const MSG_SEM_EXTRAS = /extras/i;

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
    /** Cor da etapa em hexadecimal (faixa da coluna e do painel de detalhes). */
    hex: KANBAN_COR_DOT[c.cor] ?? "#64748b",
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
      .insert({ ...campanhaParaLinha(c), ...(gravaExtras ? { extras: extrasDe(c as Campanha) } : {}), tenant_id: activeTenantId })
      .select("*")
      .single();
    if (error && gravaExtras && MSG_SEM_EXTRAS.test(error.message)) { gravaExtras = false; return criar(c); }
    if (error) { toast.error(`Não foi possível criar a campanha: ${friendlyError(error)}`); return false; }
    setCampanhas((prev) => [...prev, linhaParaCampanha(data)]);
    toast.success("Campanha criada.");
    return true;
  };

  const atualizar = async (id: string, patch: Partial<Campanha>, silencioso = false): Promise<boolean> => {
    if (!supabase || !activeTenantId) return false;
    const atual = campanhas.find((x) => x.id === id);
    const mexeuNosExtras = CAMPOS_EXTRAS.some((k) => k in patch);
    const extras = gravaExtras && mexeuNosExtras && atual ? { extras: extrasDe({ ...atual, ...patch }) } : {};
    let { error } = await supabase.from("marketing_trafego").update({ ...campanhaParaLinha(patch), ...extras }).eq("id", id).eq("tenant_id", activeTenantId);
    if (error && "extras" in extras && MSG_SEM_EXTRAS.test(error.message)) {
      gravaExtras = false;
      ({ error } = await supabase.from("marketing_trafego").update(campanhaParaLinha(patch)).eq("id", id).eq("tenant_id", activeTenantId));
    }
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
