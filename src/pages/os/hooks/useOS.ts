import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import { useData } from "../../../contexts/DataContext";
import { syncImplementationConclusion } from "../../../lib/implementationStage";
import {
  OS_DEPARTAMENTOS_SUGERIDOS,
  OS_TEMPLATES,
  OS_FLUXO_GERAL,
  etapasFromSeed,
  novoIdEtapa,
  templateDepartamento,
  type OrdemServico,
  type OsDepartamento,
  type OsEtapa,
  type OsFunil,
  type OsPrioridade,
  type OsStatus,
  statusDaEtapa,
} from "../osTypes";
import { rowToDepartamento, rowToFunil, rowToOrdem } from "../osMappers";
import { OS_NEXT, isOsLocked } from "../../../lib/ordemServico";

export interface NovaOrdemPayload {
  titulo: string;
  descricao?: string;
  departamentoId: string;
  /** Funil do departamento; sem ele, usa o padrão. */
  funilId?: string;
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
  const { implementations, clienteBase, updateImplementation, updateClienteBase } = useData();

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
      supabase
        .from("ordens_servico")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1000),
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

  // ─── Vários funis por departamento ──────────────────────────────────────
  // Novo funil: começa como cópia do funil padrão do departamento (ids novos), para o time só ajustar.
  const addFunil = async (departamentoId: string, nome: string): Promise<OsFunil | null> => {
    if (!supabase || !tenantId) return null;
    const base = funilPadraoDe(departamentoId);
    const etapas: OsEtapa[] = base
      ? base.etapas.map(e => ({ ...e, id: novoIdEtapa() }))
      : etapasFromSeed(OS_FLUXO_GERAL);
    const { data, error } = await supabase
      .from("os_funis")
      .insert({ tenant_id: tenantId, departamento_id: departamentoId, nome, etapas, padrao: false })
      .select()
      .single();
    if (error || !data) {
      if (error) errMsg(error, "Erro ao criar funil");
      return null;
    }
    const f = rowToFunil(data);
    setFunis(prev => [...prev, f]);
    return f;
  };

  const renomearFunil = async (id: string, nome: string) => updateFunil(id, { nome });

  // Um funil padrão por departamento (índice único): tira o atual e põe o novo; se a 2ª etapa falhar, desfaz a 1ª.
  const definirFunilPadrao = async (id: string) => {
    if (!supabase) return;
    const alvo = funis.find(f => f.id === id);
    if (!alvo || alvo.padrao) return;
    const atual = funis.find(f => f.departamentoId === alvo.departamentoId && f.padrao);
    const anterior = funis;
    setFunis(prev => prev.map(f => (f.departamentoId !== alvo.departamentoId ? f : { ...f, padrao: f.id === id, ativo: f.id === id ? true : f.ativo })));
    if (atual) {
      const { error } = await supabase.from("os_funis").update({ padrao: false }).eq("id", atual.id);
      if (error) { setFunis(anterior); errMsg(error, "Erro ao trocar o funil padrão"); return; }
    }
    const { error } = await supabase.from("os_funis").update({ padrao: true, ativo: true }).eq("id", id);
    if (error) {
      if (atual) await supabase.from("os_funis").update({ padrao: true }).eq("id", atual.id);
      setFunis(anterior);
      errMsg(error, "Erro ao trocar o funil padrão");
    }
  };

  const deleteFunil = async (id: string): Promise<boolean> => {
    if (!supabase) return false;
    const f = funis.find(x => x.id === id);
    if (!f) return false;
    if (funis.filter(x => x.departamentoId === f.departamentoId).length <= 1) {
      toast.error("O departamento precisa ter pelo menos um funil.");
      return false;
    }
    if (f.padrao) {
      toast.error("Este é o funil padrão. Escolha outro como padrão antes de excluir.");
      return false;
    }
    const emUso = ordens.filter(o => o.funilId === id).length;
    if (emUso > 0) {
      toast.error(`${emUso} OS usam este funil. Mude essas OS de funil (ou desative o funil) antes de excluir.`);
      return false;
    }
    const { error } = await supabase.from("os_funis").delete().eq("id", id);
    if (error) { errMsg(error, "Erro ao excluir funil"); return false; }
    setFunis(prev => prev.filter(x => x.id !== id));
    return true;
  };

  // Muda a OS de funil (dentro do mesmo departamento): entra na 1ª etapa em andamento do novo funil.
  const trocarFunilDaOrdem = async (id: string, funilId: string) => {
    if (!supabase) return;
    const ordem = ordens.find(o => o.id === id);
    const funil = funis.find(f => f.id === funilId);
    const etapa = funil?.etapas.find(e => e.tipo === "aberta");
    if (!ordem || !funil || !etapa || ordem.funilId === funilId || funil.departamentoId !== ordem.departamentoId) return;
    if (isOsLocked(ordem.status)) {
      toast.error("OS faturada ou cancelada não muda de funil.");
      return;
    }
    const status: OsStatus = statusDaEtapa(funil.etapas, etapa);
    const anterior = ordens;
    setOrdens(prev => prev.map(o => (o.id === id ? { ...o, funilId, etapaId: etapa.id, status, dataConclusao: null } : o)));
    const { error } = await supabase
      .from("ordens_servico")
      .update({ funil_id: funilId, etapa_id: etapa.id, status, data_conclusao: null })
      .eq("id", id);
    if (error) { setOrdens(anterior); errMsg(error, "Erro ao mudar a OS de funil"); }
  };

  // ─── Ordens de Serviço ──────────────────────────────────────────────────
  const addOrdem = async (p: NovaOrdemPayload): Promise<OrdemServico | null> => {
    if (!supabase || !tenantId) return null;
    const escolhido = p.funilId ? funis.find(f => f.id === p.funilId && f.departamentoId === p.departamentoId && f.ativo) : undefined;
    const funil = escolhido ?? funilPadraoDe(p.departamentoId);
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
    // Mesma regra do módulo: faturada (já gerou cobrança) e cancelada ficam travadas.
    if (isOsLocked(ordem.status)) {
      toast.error(ordem.status === "Faturada" ? "OS faturada não pode mudar de etapa." : "OS cancelada: reabra pela tela da OS para mover.");
      return;
    }
    const status: OsStatus = statusDaEtapa(funil.etapas, etapa);
    const dataConclusao = etapa.tipo === "concluida" ? ordem.dataConclusao ?? new Date().toISOString().slice(0, 10) : null;
    const anterior = ordens;
    setOrdens(prev => prev.map(o => (o.id === id ? { ...o, etapaId, status, dataConclusao } : o)));
    const { error } = await supabase
      .from("ordens_servico")
      .update({ etapa_id: etapaId, status, data_conclusao: dataConclusao })
      .eq("id", id);
    if (error) {
      setOrdens(anterior);
      errMsg(error, "Erro ao mover OS");
      return;
    }
    // OS de uma implementação: concluir/reabrir aqui também conclui/reabre a implementação e o
    // cliente (mesma regra de quando se move pela página de Implementações).
    if (ordem.origemTipo === "implementation" && ordem.origemId) {
      const impl = (implementations as any[]).find(i => i.id === ordem.origemId);
      if (impl) {
        const cliente = (clienteBase as any[]).find(c => c.id === impl.cliente_id);
        await syncImplementationConclusion(impl, cliente, etapa.tipo === "concluida", { updateImplementation, updateClienteBase });
      }
    }
  };

  // Quadro por status (visão "Todos"): só segue os passos do ciclo de vida do módulo.
  // Faturar gera cobrança no Financeiro e só acontece na tela da OS.
  const moverStatus = async (id: string, novo: OsStatus) => {
    if (!supabase) return;
    const ordem = ordens.find(o => o.id === id);
    if (!ordem || ordem.status === novo) return;
    if (novo === "Faturada") {
      toast.error("Para faturar, abra a OS e use \"Gerar cobrança\" (a cobrança vai para o Financeiro).");
      return;
    }
    if (!(OS_NEXT[ordem.status] ?? []).includes(novo)) {
      toast.error(`Uma OS ${ordem.status.toLowerCase()} não passa direto para ${novo.toLowerCase()}.`);
      return;
    }
    const dataConclusao = novo === "Concluída" ? ordem.dataConclusao ?? new Date().toISOString().slice(0, 10) : ordem.dataConclusao;
    const anterior = ordens;
    setOrdens(prev => prev.map(o => (o.id === id ? { ...o, status: novo, dataConclusao } : o)));
    const { error } = await supabase.from("ordens_servico").update({ status: novo, data_conclusao: dataConclusao }).eq("id", id);
    if (error) {
      setOrdens(anterior);
      errMsg(error, "Erro ao mudar o status da OS");
    }
  };

  // Cancelar: vai para a etapa "cancela a OS" do funil, se houver; senão só muda o status.
  const cancelarOrdem = async (id: string) => {
    const ordem = ordens.find(o => o.id === id);
    if (!ordem) return;
    const funil = ordem.funilId ? funis.find(f => f.id === ordem.funilId) : undefined;
    const etapa = funil?.etapas.find(e => e.tipo === "cancelada");
    if (funil && etapa) await moverOrdem(id, etapa.id);
    else await moverStatus(id, "Cancelada");
  };

  const deleteOrdem = async (id: string) => {
    if (!supabase) return;
    // Mesma regra do módulo: só rascunho se exclui; o resto se cancela.
    if (ordens.find(o => o.id === id)?.status !== "Rascunho") {
      toast.error("Só rascunhos podem ser excluídos. Cancele a OS.");
      return;
    }
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
    addFunil,
    renomearFunil,
    definirFunilPadrao,
    deleteFunil,
    trocarFunilDaOrdem,
    addOrdem,
    updateOrdem,
    moverOrdem,
    moverStatus,
    cancelarOrdem,
    deleteOrdem,
  };
}
