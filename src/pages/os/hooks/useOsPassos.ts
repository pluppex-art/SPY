import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";

export type OsPassoStatus = "A fazer" | "Em andamento" | "Feito";
export const OS_PASSO_STATUS: OsPassoStatus[] = ["A fazer", "Em andamento", "Feito"];

export interface OsPasso {
  id: string;
  ordemId: string;
  posicao: number;
  titulo: string;
  descricao: string | null;
  status: OsPassoStatus;
  responsavelId: string | null;
  responsavelNome: string | null;
  prazo: string | null;
  concluidoEm: string | null;
}

const mapPasso = (r: any): OsPasso => ({
  id: r.id, ordemId: r.ordem_id, posicao: r.posicao, titulo: r.titulo, descricao: r.descricao ?? null,
  status: r.status, responsavelId: r.responsavel_id ?? null, responsavelNome: r.responsavel_nome ?? null,
  prazo: r.prazo ?? null, concluidoEm: r.concluido_em ?? null,
});

/** Passo a passo de UMA OS (copiado do modelo do departamento quando a OS nasce). */
export function useOsPassos(ordemId: string | null | undefined, departamentoId?: string | null) {
  const { activeTenantId } = useAuth();
  const [passos, setPassos] = useState<OsPasso[]>([]);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    if (!supabase || !ordemId) { setPassos([]); return; }
    setCarregando(true);
    const { data, error } = await supabase.from("os_passos").select("*").eq("ordem_id", ordemId).order("posicao", { ascending: true });
    if (error) toast.error("Não foi possível carregar o passo a passo.");
    else setPassos((data ?? []).map(mapPasso));
    setCarregando(false);
  }, [ordemId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const atualizar = async (id: string, patch: Partial<Pick<OsPasso, "titulo" | "status" | "responsavelId" | "responsavelNome" | "prazo">>) => {
    if (!supabase) return;
    const anterior = passos;
    const agora = new Date().toISOString();
    const concluidoEm = patch.status ? (patch.status === "Feito" ? agora : null) : undefined;
    setPassos(prev => prev.map(p => (p.id === id ? { ...p, ...patch, ...(concluidoEm !== undefined ? { concluidoEm } : {}) } : p)));
    const row: Record<string, any> = { updated_at: agora };
    if (patch.titulo !== undefined) row.titulo = patch.titulo;
    if (patch.status !== undefined) { row.status = patch.status; row.concluido_em = concluidoEm; }
    if (patch.responsavelId !== undefined) row.responsavel_id = patch.responsavelId;
    if (patch.responsavelNome !== undefined) row.responsavel_nome = patch.responsavelNome;
    if (patch.prazo !== undefined) row.prazo = patch.prazo;
    const { error } = await supabase.from("os_passos").update(row).eq("id", id);
    if (error) { setPassos(anterior); toast.error("Não foi possível salvar o passo."); }
  };

  const adicionar = async (titulo: string) => {
    if (!supabase || !ordemId || !activeTenantId || !titulo.trim()) return;
    const posicao = passos.length ? Math.max(...passos.map(p => p.posicao)) + 1 : 0;
    const { data, error } = await supabase.from("os_passos").insert({ tenant_id: activeTenantId, ordem_id: ordemId, posicao, titulo: titulo.trim() }).select().single();
    if (error || !data) { toast.error("Não foi possível adicionar o passo."); return; }
    setPassos(prev => [...prev, mapPasso(data)]);
  };

  const remover = async (id: string) => {
    if (!supabase) return;
    const anterior = passos;
    setPassos(prev => prev.filter(p => p.id !== id));
    const { error } = await supabase.from("os_passos").delete().eq("id", id);
    if (error) { setPassos(anterior); toast.error("Não foi possível remover o passo."); }
  };

  /** Para OS criadas antes do modelo existir: copia os passos do departamento (só os que ainda não estão na OS). */
  const aplicarModelo = async () => {
    if (!supabase || !ordemId || !departamentoId || !activeTenantId) return;
    const { data: modelo, error } = await supabase.from("os_modelos_passos").select("titulo, descricao, posicao").eq("departamento_id", departamentoId).order("posicao");
    if (error) { toast.error("Não foi possível ler o modelo do departamento."); return; }
    const jaTem = new Set(passos.map(p => p.titulo.trim().toLowerCase()));
    const novos = (modelo ?? []).filter(m => !jaTem.has(String(m.titulo).trim().toLowerCase()));
    if (novos.length === 0) { toast.info(modelo?.length ? "A OS já tem todos os passos do modelo." : "Este departamento ainda não tem um modelo de passos (Configurações > OS)."); return; }
    const base = passos.length ? Math.max(...passos.map(p => p.posicao)) + 1 : 0;
    const { error: e2 } = await supabase.from("os_passos").insert(novos.map((m, i) => ({ tenant_id: activeTenantId, ordem_id: ordemId, posicao: base + i, titulo: m.titulo, descricao: m.descricao ?? null })));
    if (e2) { toast.error("Não foi possível aplicar o modelo."); return; }
    await carregar();
    toast.success(`${novos.length} passo(s) adicionado(s).`);
  };

  return { passos, carregando, atualizar, adicionar, remover, aplicarModelo };
}

/** Modelo de passos de um departamento (editável em Configurações > OS). */
export function useModeloPassos(departamentoId: string | null | undefined) {
  const { activeTenantId } = useAuth();
  const [titulos, setTitulos] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    if (!supabase || !departamentoId) return;
    setCarregando(true);
    const { data } = await supabase.from("os_modelos_passos").select("titulo, posicao").eq("departamento_id", departamentoId).order("posicao");
    setTitulos((data ?? []).map(r => r.titulo as string));
    setCarregando(false);
  }, [departamentoId]);

  useEffect(() => { void carregar(); }, [carregar]);

  /** Troca o modelo inteiro (lista pequena: apaga e regrava na ordem). Vale para as OS NOVAS; as existentes não mudam. */
  const salvar = async (lista: string[]) => {
    if (!supabase || !departamentoId || !activeTenantId) return false;
    const limpa = lista.map(t => t.trim()).filter(Boolean);
    const { error: e1 } = await supabase.from("os_modelos_passos").delete().eq("departamento_id", departamentoId);
    if (e1) { toast.error("Não foi possível salvar o modelo."); return false; }
    if (limpa.length > 0) {
      const { error: e2 } = await supabase.from("os_modelos_passos").insert(limpa.map((titulo, posicao) => ({ tenant_id: activeTenantId, departamento_id: departamentoId, posicao, titulo })));
      if (e2) { toast.error("Não foi possível salvar o modelo."); return false; }
    }
    setTitulos(limpa);
    return true;
  };

  return { titulos, carregando, salvar, recarregar: carregar };
}

/** Grava o modelo de um departamento recém-criado (usado ao criar a partir das sugestões). */
export async function semearModeloPassos(tenantId: string, departamentoId: string, titulos: string[]) {
  if (!supabase || titulos.length === 0) return;
  await supabase.from("os_modelos_passos").insert(titulos.map((titulo, posicao) => ({ tenant_id: tenantId, departamento_id: departamentoId, posicao, titulo })));
}
