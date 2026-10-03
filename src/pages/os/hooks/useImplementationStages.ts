import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../../contexts/AuthContext";
import { useData } from "../../../contexts/DataContext";
import { supabase } from "../../../lib/supabase";
import { isOsLocked } from "../../../lib/ordemServico";
import { ETAPA_DOT_COLORS, type FunilStage } from "../../../lib/funilStages";
import {
  getImplementacaoStages,
  getImplementationStageInfo,
  moveImplementationStage,
  syncImplementationConclusion,
  type ImplStageInfo,
} from "../../../lib/implementationStage";
import {
  carregarFonteImplementacao,
  etapaConclusao,
  etapaParaImplementacao,
  funilPadrao,
  inserirOrdens,
  montarOrdemDeImplementacao,
  type FonteOsImplementacao,
} from "../implementationOs";
import { statusDaEtapa, type OsFunil } from "../osTypes";

export type OrigemEtapas = "os" | "crm" | "manual";

interface MoveDeps {
  updateLead: (id: string, patch: any) => Promise<any> | any;
  updateImplementation: (id: string, patch: any) => Promise<any> | any;
  updateClienteBase: (id: string, patch: any) => Promise<any> | any;
}

const stagesDoFunil = (f?: OsFunil | null): FunilStage[] =>
  f
    ? f.etapas.map(e => ({
        id: e.id,
        name: e.nome,
        color: ETAPA_DOT_COLORS[e.cor] ?? "#64748b",
        iniciarMinimizado: e.iniciarMinimizado,
        funilId: f.id,
      }))
    : [];

/**
 * De onde a página de Implementações tira as etapas, em ordem de prioridade:
 *  1. "os"     — o tenant tem um departamento "Implementação" na Ordem de Serviço: a etapa de
 *                cada implementação é a etapa da OS vinculada, no funil (um ou vários) configurado ali.
 *  2. "crm"    — funil de Implementação do Pipeline (axis_win_funil_config), espelhado via leads.stageId.
 *  3. "manual" — o status de 4 opções de sempre.
 * Nada muda para quem não configurou o departamento na OS.
 */
export function useImplementationStages() {
  const { implementations, clienteBase, leads, funis: funisCrm, appSettings } = useData();
  const { activeTenantId, user } = useAuth();

  const [fonte, setFonte] = useState<FonteOsImplementacao | null>(null);
  const [funilEscolhido, setFunilEscolhido] = useState<string | null>(null);
  const tentadas = useRef(new Set<string>());
  const criando = useRef(false);

  const crmStages = useMemo(() => getImplementacaoStages(appSettings, funisCrm), [appSettings, funisCrm]);

  const recarregar = useCallback(async () => {
    if (!supabase || !activeTenantId) { setFonte(null); return; }
    setFonte(await carregarFonteImplementacao(supabase, activeTenantId));
  }, [activeTenantId]);

  useEffect(() => {
    setFonte(null);
    tentadas.current.clear();
    recarregar();
  }, [recarregar]);

  const origem: OrigemEtapas = fonte ? "os" : crmStages.length > 0 ? "crm" : "manual";
  const funilSel = fonte ? fonte.funis.find(f => f.id === funilEscolhido) ?? funilPadrao(fonte.funis) ?? null : null;
  const ordemPorImpl = useMemo(() => new Map((fonte?.ordens ?? []).map(o => [o.origemId ?? "", o])), [fonte]);

  // Toda implementação precisa ter a sua OS. As que ainda não têm (as que já existiam, ou criadas
  // por outro caminho) entram na etapa de mesmo nome da etapa em que estavam no CRM, senão na primeira.
  useEffect(() => {
    if (!fonte || !supabase || !activeTenantId || criando.current) return;
    const funil = funilPadrao(fonte.funis);
    if (!funil) return;
    const faltam = (implementations as any[]).filter(i => !ordemPorImpl.has(i.id) && !tentadas.current.has(i.id));
    if (faltam.length === 0) return;
    criando.current = true;
    faltam.forEach(i => tentadas.current.add(i.id));
    const clientePorId = new Map((clienteBase as any[]).map(c => [c.id, c]));
    const linhas = faltam.flatMap(impl => {
      const nomeCrm = getImplementationStageInfo(impl, leads as any[], crmStages)?.stage.name;
      const etapa = etapaParaImplementacao(funil.etapas, impl, nomeCrm);
      return etapa
        ? [montarOrdemDeImplementacao({
            tenantId: activeTenantId, departamento: fonte.departamento, funil, etapa, impl,
            clienteNome: clientePorId.get(impl.cliente_id)?.name, userId: user?.id,
          })]
        : [];
    });
    inserirOrdens(supabase, linhas).finally(async () => { criando.current = false; await recarregar(); });
  }, [fonte, implementations, clienteBase, leads, crmStages, ordemPorImpl, activeTenantId, user?.id, recarregar]);

  const funilDe = useCallback(
    (impl: any): OsFunil | null => {
      if (!fonte) return null;
      const o = ordemPorImpl.get(impl?.id);
      return fonte.funis.find(f => f.id === o?.funilId) ?? funilSel;
    },
    [fonte, ordemPorImpl, funilSel],
  );

  /** Etapas do quadro (funil escolhido, quando há mais de um). */
  const stages: FunilStage[] = origem === "os" ? stagesDoFunil(funilSel) : crmStages;

  /** Etapas do funil DESTA implementação (a tela de detalhe usa o funil dela, não o do filtro). */
  const stagesDe = (impl: any): FunilStage[] => (origem === "os" ? stagesDoFunil(funilDe(impl)) : crmStages);

  const getInfo = (impl: any): ImplStageInfo | null => {
    if (origem !== "os") return origem === "crm" ? getImplementationStageInfo(impl, leads as any[], crmStages) : null;
    const ordem = ordemPorImpl.get(impl?.id);
    const funil = funilDe(impl);
    if (!ordem || !funil) return null;
    const idx = funil.etapas.findIndex(e => e.id === ordem.etapaId);
    if (idx < 0) return null;
    return { stage: stagesDoFunil(funil)[idx], stageIdx: idx, isLast: funil.etapas[idx].tipo === "concluida" };
  };

  /** No quadro com vários funis, só aparece quem está no funil escolhido (quem ainda não tem OS cai no padrão). */
  const pertence = (impl: any): boolean => {
    if (origem !== "os" || !funilSel) return true;
    const ordem = ordemPorImpl.get(impl?.id);
    return ordem ? ordem.funilId === funilSel.id : funilPadrao(fonte!.funis)?.id === funilSel.id;
  };

  const canMove = (impl: any): boolean => (origem === "os" ? true : origem === "crm" && !!impl?.lead_id);

  /** Etapa que significa "concluída" (botão "Marcar como concluída"). */
  const conclusaoStageId = (impl: any): string | null => {
    if (origem === "os") return etapaConclusao(funilDe(impl)?.etapas ?? [])?.id ?? null;
    return crmStages.length > 0 ? crmStages[crmStages.length - 1].id : null;
  };

  const move = async (impl: any, cliente: any, nextStageId: string, deps: MoveDeps): Promise<{ isLast: boolean }> => {
    if (origem === "crm") return moveImplementationStage(impl, cliente, nextStageId, crmStages, deps);
    if (origem !== "os" || !supabase) return { isLast: false };

    const ordem = ordemPorImpl.get(impl.id);
    const funil = funilDe(impl);
    const etapa = funil?.etapas.find(e => e.id === nextStageId);
    if (!ordem || !funil || !etapa) {
      toast.error("A OS desta implementação ainda está sendo criada. Tente de novo em instantes.");
      return { isLast: false };
    }
    if (isOsLocked(ordem.status)) {
      toast.error("A OS desta implementação está faturada ou cancelada e não muda de etapa.");
      return { isLast: false };
    }
    const status = statusDaEtapa(funil.etapas, etapa);
    const dataConclusao = etapa.tipo === "concluida" ? ordem.dataConclusao ?? new Date().toISOString().slice(0, 10) : null;
    const anterior = fonte;
    setFonte(f => f && { ...f, ordens: f.ordens.map(o => (o.id === ordem.id ? { ...o, etapaId: nextStageId, status, dataConclusao } : o)) });
    const { error } = await supabase
      .from("ordens_servico")
      .update({ etapa_id: nextStageId, status, data_conclusao: dataConclusao })
      .eq("id", ordem.id);
    if (error) {
      setFonte(anterior);
      toast.error(`Erro ao mover a implementação: ${error.message}`);
      return { isLast: false };
    }
    const isLast = etapa.tipo === "concluida";
    await syncImplementationConclusion(impl, cliente, isLast, deps);
    return { isLast };
  };

  return {
    origem,
    stages,
    stagesDe,
    getInfo,
    pertence,
    canMove,
    conclusaoStageId,
    move,
    /** Funis da OS (só quando origem = "os"), para o seletor do quadro. */
    funis: fonte?.funis ?? [],
    funilId: funilSel?.id ?? null,
    setFunilId: setFunilEscolhido,
    nomeFunil: funilSel?.nome ?? null,
    nomeDepartamento: fonte?.departamento.nome ?? null,
    recarregar,
  };
}
