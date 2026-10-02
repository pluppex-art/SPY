import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import {
  OS_DEPARTAMENTOS_SUGERIDOS,
  OS_TEMPLATES,
  etapasFromSeed,
  templateDepartamento,
  type OrdemServico,
  type OsDepartamento,
  type OsEtapa,
  type OsFunil,
  type OsPrioridade,
  type OsStatus,
  statusDaEtapa,
} from "../osTypes";

const rowToDepartamento = (r: any): OsDepartamento => ({
  id: r.id,
  nome: r.nome,
  cor: r.cor || "blue",
  ordem: r.ordem ?? 0,
  ativo: r.ativo ?? true,
});

const rowToFunil = (r: any): OsFunil => ({
  id: r.id,
  departamentoId: r.departamento_id,
  nome: r.nome,
  etapas: Array.isArray(r.etapas) ? r.etapas : [],
  padrao: !!r.padrao,
  ativo: r.ativo ?? true,
});

// Mapeia public.ordens_servico (colunas legadas: responsavel, data_prevista, status...).
const rowToOrdem = (r: any): OrdemServico => ({
  id: r.id,
  numero: Number(r.numero) || 0,
  titulo: r.titulo,
  descricao: r.descricao || "",
  status: (r.status as OsStatus) || "Aberta",
  departamentoId: r.departamento_id ?? null,
  funilId: r.funil_id ?? null,
  etapaId: r.etapa_id ?? null,
  prioridade: (r.prioridade as OsPrioridade) || "Normal",
  solicitanteNome: r.solicitante_nome || "",
  responsavelNome: r.responsavel || "",
  clienteNome: r.cliente_nome || "",
  prazo: r.data_prevista || null,
  campos: r.campos && typeof r.campos === "object" ? r.campos : {},
  origemTipo: r.origem_tipo ?? null,
  createdAt: r.created_at,
});

export interface NovaOrdemPayload {
  titulo: string;
  descricao?: string;
  departamentoId: string;
  prioridade: OsPrioridade;
  responsavelNome?: string;
  clienteNome?: string;
  prazo?: string | null;
  campos?: Record<string, string>;
}

export type OrdemPatch = Partial<
  Pick<OrdemServico, "titulo" | "descricao" | "prioridade" | "responsavelNome" | "clienteNome" | "prazo" | "campos">
>;

function errMsg(error: { message: string }, acao: string) {
  console.error(`[OS] ${acao}:`, error.message);
  toast.error(`${acao}: ${error.message}`);
}

export function useOS() {
  const { user, activeTenantId } = useAuth();
  const tenantId = activeTenantId;

  const [departamentos, setDepartamentos] = useState<OsDepartamento[]>([]);
  const [funis, setFunis] = useState<OsFunil[]>([]);
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!supabase || !tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [dep, fun, ord] = await Promise.all([
      supabase.from("os_departamentos").select("*").eq("tenant_id", tenantId).order("ordem").order("created_at"),
      supabase.from("os_funis").select("*").eq("tenant_id", tenantId).order("created_at"),
      supabase.from("ordens_servico").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    ]);
    const erro = dep.error || fun.error || ord.error;
    if (erro) errMsg(erro, "Erro ao carregar Ordens de Serviço");
    else {
      setDepartamentos((dep.data ?? []).map(rowToDepartamento));
      setFunis((fun.data ?? []).map(rowToFunil));
      setOrdens((ord.data ?? []).map(rowToOrdem));
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    // Evita mostrar dados do tenant anterior enquanto o novo carrega (troca de tenant/filial).
    setDepartamentos([]);
    setFunis([]);
    setOrdens([]);
    reload();
  }, [reload]);

  const funilPadraoDe = useCallback(
    (departamentoId: string): OsFunil | undefined => {
      const doDep = funis.filter(f => f.departamentoId === departamentoId && f.ativo);
      return doDep.find(f => f.padrao) ?? doDep[0];
    },
    [funis],
  );

  // ─── Departamentos ──────────────────────────────────────────────────────
  const addDepartamento = async (
    nome: string,
    cor = "blue",
    etapasSeed = templateDepartamento(nome).etapas,
    ordem = departamentos.length,
  ) => {
    if (!supabase || !tenantId) return null;
    const { data: dep, error } = await supabase
      .from("os_departamentos")
      .insert({ tenant_id: tenantId, nome, cor, ordem })
      .select()
      .single();
    if (error || !dep) {
      if (error) errMsg(error, "Erro ao criar departamento");
      return null;
    }
    const { data: fun, error: errFunil } = await supabase
      .from("os_funis")
      .insert({
        tenant_id: tenantId,
        departamento_id: dep.id,
        nome: `Fluxo ${nome}`,
        etapas: etapasFromSeed(etapasSeed),
        padrao: true,
      })
      .select()
      .single();
    if (errFunil || !fun) {
      // Departamento sem funil não é operável: desfaz em vez de deixar meia-criação.
      await supabase.from("os_departamentos").delete().eq("id", dep.id);
      if (errFunil) errMsg(errFunil, "Erro ao criar o fluxo do departamento");
      return null;
    }
    const d = rowToDepartamento(dep);
    setDepartamentos(prev => [...prev, d]);
    setFunis(prev => [...prev, rowToFunil(fun)]);
    return d;
  };

  const updateDepartamento = async (id: string, patch: Partial<Pick<OsDepartamento, "nome" | "cor" | "ativo">>) => {
    if (!supabase) return;
    const anterior = departamentos;
    setDepartamentos(prev => prev.map(d => (d.id === id ? { ...d, ...patch } : d)));
    const { error } = await supabase
      .from("os_departamentos")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setDepartamentos(anterior);
      errMsg(error, "Erro ao atualizar departamento");
    }
  };

  const deleteDepartamento = async (id: string): Promise<boolean> => {
    if (!supabase) return false;
    if (ordens.some(o => o.departamentoId === id)) {
      toast.error("Este departamento tem Ordens de Serviço. Conclua/exclua as OS ou desative o departamento.");
      return false;
    }
    const { error } = await supabase.from("os_departamentos").delete().eq("id", id);
    if (error) {
      errMsg(error, "Erro ao excluir departamento");
      return false;
    }
    setDepartamentos(prev => prev.filter(d => d.id !== id));
    setFunis(prev => prev.filter(f => f.departamentoId !== id));
    return true;
  };

  // Cria os departamentos de um template (ignora os que o tenant já tem).
  const aplicarTemplate = async (templateId: string) => {
    const tpl = OS_TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return;
    const existentes = new Set(departamentos.map(d => d.nome.toLowerCase()));
    let ordem = departamentos.length;
    for (const nome of tpl.departamentos) {
      if (existentes.has(nome.toLowerCase())) continue;
      const t = OS_DEPARTAMENTOS_SUGERIDOS.find(d => d.nome === nome) ?? templateDepartamento(nome);
      await addDepartamento(t.nome, t.cor, t.etapas, ordem++);
    }
  };

  // ─── Funis ──────────────────────────────────────────────────────────────
  const updateFunil = async (id: string, patch: Partial<Pick<OsFunil, "nome" | "etapas" | "ativo">>) => {
    if (!supabase) return;
    const atual = funis.find(f => f.id === id);
    if (!atual) return;

    if (patch.etapas) {
      if (patch.etapas.length === 0) {
        toast.error("O funil precisa ter pelo menos uma etapa.");
        return;
      }
      if (!patch.etapas.some(e => e.tipo === "aberta")) {
        toast.error("O funil precisa ter pelo menos uma etapa em andamento.");
        return;
      }
    }

    const anteriorFunis = funis;
    const anteriorOrdens = ordens;
    setFunis(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)));

    // Etapa removida: as OS que estavam nela vão para a primeira etapa, em vez de
    // ficarem órfãs (sumiriam do kanban).
    let removidas: string[] = [];
    if (patch.etapas) {
      const novos = new Set(patch.etapas.map(e => e.id));
      removidas = atual.etapas.filter(e => !novos.has(e.id)).map(e => e.id);
    }
    if (removidas.length > 0 && patch.etapas) {
      const destino = patch.etapas[0].id;
      setOrdens(prev =>
        prev.map(o =>
          o.funilId === id && o.etapaId && removidas.includes(o.etapaId)
            ? { ...o, etapaId: destino, status: o.status === "Faturada" ? o.status : statusDaEtapa(patch.etapas!, patch.etapas![0]) }
            : o,
        ),
      );
    }

    const { error } = await supabase
      .from("os_funis")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setFunis(anteriorFunis);
      setOrdens(anteriorOrdens);
      errMsg(error, "Erro ao salvar funil");
      return;
    }
    if (removidas.length > 0 && patch.etapas) {
      const destino = patch.etapas[0];
      // Status legado acompanha a nova etapa; "Faturada" (financeiro) não é desfeito.
      const { error: errStatus } = await supabase
        .from("ordens_servico")
        .update({ status: statusDaEtapa(patch.etapas, destino), data_conclusao: null })
        .eq("funil_id", id)
        .in("etapa_id", removidas)
        .neq("status", "Faturada");
      const { error: errEtapa } = await supabase
        .from("ordens_servico")
        .update({ etapa_id: destino.id })
        .eq("funil_id", id)
        .in("etapa_id", removidas);
      const errOrdens = errStatus || errEtapa;
      if (errOrdens) errMsg(errOrdens, "Erro ao realocar OS da etapa removida");
    }
  };

  // ─── Ordens de Serviço ──────────────────────────────────────────────────
  const addOrdem = async (p: NovaOrdemPayload): Promise<OrdemServico | null> => {
    if (!supabase || !tenantId) return null;
    const funil = funilPadraoDe(p.departamentoId);
    const etapaInicial = funil?.etapas.find(e => e.tipo === "aberta");
    if (!funil || !etapaInicial) {
      toast.error("Esse departamento não tem um fluxo ativo configurado.");
      return null;
    }
    const { data, error } = await supabase
      .from("ordens_servico")
      .insert({
        tenant_id: tenantId,
        titulo: p.titulo,
        descricao: p.descricao || null,
        status: statusDaEtapa(funil.etapas, etapaInicial),
        departamento_id: p.departamentoId,
        funil_id: funil.id,
        etapa_id: etapaInicial.id,
        prioridade: p.prioridade,
        solicitante_nome: user?.name || null,
        created_by: user?.id ?? null,
        responsavel: p.responsavelNome || null,
        cliente_nome: p.clienteNome || null,
        data_prevista: p.prazo || null,
        campos: p.campos ?? {},
      })
      .select()
      .single();
    if (error || !data) {
      if (error) errMsg(error, "Erro ao criar OS");
      return null;
    }
    const o = rowToOrdem(data);
    setOrdens(prev => [o, ...prev]);
    return o;
  };

  const updateOrdem = async (id: string, patch: OrdemPatch) => {
    if (!supabase) return;
    const anterior = ordens;
    setOrdens(prev => prev.map(o => (o.id === id ? { ...o, ...patch } : o)));
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.titulo !== undefined) row.titulo = patch.titulo;
    if (patch.descricao !== undefined) row.descricao = patch.descricao || null;
    if (patch.prioridade !== undefined) row.prioridade = patch.prioridade;
    if (patch.responsavelNome !== undefined) row.responsavel = patch.responsavelNome || null;
    if (patch.clienteNome !== undefined) row.cliente_nome = patch.clienteNome || null;
    if (patch.prazo !== undefined) row.data_prevista = patch.prazo || null;
    if (patch.campos !== undefined) row.campos = patch.campos;
    const { error } = await supabase.from("ordens_servico").update(row).eq("id", id);
    if (error) {
      setOrdens(anterior);
      errMsg(error, "Erro ao atualizar OS");
    }
  };

  // O status da OS é sempre a etapa do funil: mover de coluna = mudar de status.
  const moverOrdem = async (id: string, etapaId: string) => {
    if (!supabase) return;
    const ordem = ordens.find(o => o.id === id);
    const funil = ordem?.funilId ? funis.find(f => f.id === ordem.funilId) : undefined;
    const etapa = funil?.etapas.find(e => e.id === etapaId);
    if (!ordem || !funil || !etapa || ordem.etapaId === etapaId) return;
    // "Faturada" é um estado do financeiro (já gerou cobrança): a OS não muda mais de etapa.
    if (ordem.status === "Faturada") {
      toast.error("OS faturada não pode mudar de etapa.");
      return;
    }
    const status: OsStatus = statusDaEtapa(funil.etapas, etapa);
    const dataConclusao = etapa.tipo === "concluida" ? new Date().toISOString().slice(0, 10) : null;
    const anterior = ordens;
    setOrdens(prev => prev.map(o => (o.id === id ? { ...o, etapaId, status } : o)));
    const { error } = await supabase
      .from("ordens_servico")
      .update({ etapa_id: etapaId, status, data_conclusao: dataConclusao })
      .eq("id", id);
    if (error) {
      setOrdens(anterior);
      errMsg(error, "Erro ao mover OS");
    }
  };

  const deleteOrdem = async (id: string) => {
    if (!supabase) return;
    const anterior = ordens;
    setOrdens(prev => prev.filter(o => o.id !== id));
    const { error } = await supabase.from("ordens_servico").delete().eq("id", id);
    if (error) {
      setOrdens(anterior);
      errMsg(error, "Erro ao excluir OS");
    }
  };

  const funisPorId = useMemo(() => new Map(funis.map(f => [f.id, f])), [funis]);

  const etapaDaOrdem = useCallback(
    (o: OrdemServico): OsEtapa | undefined =>
      o.funilId ? funisPorId.get(o.funilId)?.etapas.find(e => e.id === o.etapaId) : undefined,
    [funisPorId],
  );

  return {
    loading,
    departamentos,
    funis,
    ordens,
    reload,
    funilPadraoDe,
    etapaDaOrdem,
    addDepartamento,
    updateDepartamento,
    deleteDepartamento,
    aplicarTemplate,
    updateFunil,
    addOrdem,
    updateOrdem,
    moverOrdem,
    deleteOrdem,
  };
}
