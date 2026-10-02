import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Rocket, Play, Search, ClipboardList, CheckCircle2, Clock, Gauge, ChevronRight, LayoutList, Columns3, Workflow } from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { StatCell, StatCellRow } from "../finance/components/StatCell";
import { ImplementationProgressBar } from "../../components/implementacao/ImplementationProgressBar";
import { ImplementacoesKanban, type KanbanColumnDef } from "../../components/implementacao/ImplementacoesKanban";
import { useData } from "../../contexts/DataContext";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import {
  IMPLEMENTATION_STATUSES, IMPLEMENTATION_STATUS_TONE, computeProgress, type ImplementationStatus,
} from "../../lib/implementationForm";
import { startImplementationForClient } from "../../lib/implementationAutoStart";
import { tenantReadiness } from "../../lib/implementationTenant";
import { getImplementacaoStages, getImplementationStageInfo, moveImplementationStage } from "../../lib/implementationStage";

const FILTROS = ["Todas", ...IMPLEMENTATION_STATUSES] as const;

const LEGACY_STATUS_DOT: Record<ImplementationStatus, string> = {
  "Em andamento": "bg-blue-500",
  "Aguardando cliente": "bg-amber-500",
  "Bloqueada": "bg-rose-500",
  "Concluída": "bg-emerald-500",
};

export default function Implementacoes() {
  const { implementations, clienteBase, leads, funis, appSettings, addImplementation, updateImplementation, updateClienteBase, updateLead } = useData();
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>("Todas");
  const [busca, setBusca] = useState("");
  const [outroClienteId, setOutroClienteId] = useState("");
  const [iniciando, setIniciando] = useState<string | null>(null);
  const iniciandoRef = useRef(false);
  // Lista ou Kanban — lembra a última escolha neste navegador.
  const [view, setView] = useState<"lista" | "kanban">(() => {
    try { return localStorage.getItem("implementacoes_view") === "kanban" ? "kanban" : "lista"; } catch { return "lista"; }
  });
  const changeView = (v: "lista" | "kanban") => {
    setView(v);
    try { localStorage.setItem("implementacoes_view", v); } catch { /* sem storage: só não lembra */ }
  };

  const clientePorId = useMemo(() => new Map((clienteBase as any[]).map((c) => [c.id, c])), [clienteBase]);
  const comImplementacao = useMemo(() => new Set((implementations as any[]).map((i) => i.cliente_id)), [implementations]);

  const linhas = useMemo(
    () =>
      (implementations as any[])
        .map((i) => ({ impl: i, cliente: clientePorId.get(i.cliente_id), progresso: computeProgress(i.data || {}).overall }))
        .sort((a, b) => (b.impl.updated_at || "").localeCompare(a.impl.updated_at || "")),
    [implementations, clientePorId]
  );

  // Clientes que já fecharam (lead ganho com cliente vinculado) e ainda não têm
  // implementação — uma linha por cliente, mesmo que tenha vários leads ganhos.
  const aguardando = useMemo(() => {
    const seen = new Set<string>();
    const out: { cliente: any; lead: any }[] = [];
    for (const l of leads as any[]) {
      if (l.status !== "Fechado" || !l.clientId || seen.has(l.clientId) || comImplementacao.has(l.clientId)) continue;
      const cliente = clientePorId.get(l.clientId);
      if (!cliente) continue;
      seen.add(l.clientId);
      out.push({ cliente, lead: l });
    }
    return out;
  }, [leads, clientePorId, comImplementacao]);

  const clientesLivres = useMemo(
    () => (clienteBase as any[]).filter((c) => !comImplementacao.has(c.id)).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [clienteBase, comImplementacao]
  );

  // Espelha o funil de Implementação do Pipeline (ver handleWinStageDrop em
  // usePipeline.ts): quando o tenant tem um configurado, essa tela passa a
  // usar as MESMAS etapas (lidas do lead vinculado de cada implementação) em
  // vez do status manual de 4 opções — arrastar aqui ou lá mexe no mesmo
  // `leads.stageId`. Sem funil configurado, stages fica [] e tudo cai no
  // comportamento de status manual de sempre (ver getColumnId/moverStatus).
  const implementacaoStages = useMemo(() => getImplementacaoStages(appSettings, funis), [appSettings, funis]);

  const getColumnId = (impl: any): string => {
    if (implementacaoStages.length === 0) return impl.status;
    const info = getImplementationStageInfo(impl, leads as any[], implementacaoStages);
    return info?.stage.id ?? implementacaoStages[0].id;
  };

  const kanbanColumns: KanbanColumnDef[] = implementacaoStages.length > 0
    ? implementacaoStages.map((s) => ({ id: s.id, label: s.name, dot: s.color, isHex: true }))
    : IMPLEMENTATION_STATUSES.map((s) => ({ id: s, label: s, dot: LEGACY_STATUS_DOT[s] }));

  const kpis = useMemo(() => {
    const abertas = linhas.filter((l) => l.impl.status !== "Concluída");
    const media = abertas.length === 0 ? 0 : Math.round(abertas.reduce((s, l) => s + l.progresso.percent, 0) / abertas.length);
    return {
      abertas: abertas.length,
      concluidas: linhas.length - abertas.length,
      media,
    };
  }, [linhas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (filtro !== "Todas" && l.impl.status !== filtro) return false;
      return !q || (l.cliente?.name || "").toLowerCase().includes(q) || (l.impl.responsavel || "").toLowerCase().includes(q);
    });
  }, [linhas, filtro, busca]);

  const aguardandoFiltrado = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return aguardando.filter(({ cliente }) => !q || (cliente.name || "").toLowerCase().includes(q));
  }, [aguardando, busca]);

  // Mesmas regras da tela de detalhe ao mudar de coluna (conclusão finaliza o cliente e vice-versa).
  const moverStatus = async (impl: any, cliente: any, nextColumnId: string) => {
    if (getColumnId(impl) === nextColumnId) return;

    // Funil espelhado do Pipeline e essa implementação tem lead vinculado:
    // arrastar move a ETAPA do lead (mesmo dado que o Kanban do Pipeline usa).
    if (implementacaoStages.length > 0 && impl.lead_id) {
      const { isLast } = await moveImplementationStage(impl, cliente, nextColumnId, implementacaoStages, {
        updateLead, updateImplementation, updateClienteBase,
      });
      if (isLast && !impl.linked_tenant_id && tenantReadiness(impl.data || {}).ready) {
        navigate(`/app/crm/implementacoes/${impl.id}?abrirAmbiente=1`);
      }
      return;
    }

    // Sem funil configurado pro tenant, ou implementação sem lead vinculado
    // (ex.: iniciada manualmente "para outro cliente") — status manual de sempre.
    const next = nextColumnId as ImplementationStatus;
    const patch: Record<string, any> = { status: next };
    if (next === "Concluída") {
      patch.completed_at = new Date().toISOString();
      if (cliente?.status === "Em Implantação") await updateClienteBase(cliente.id, { status: "Ativo" });
    } else if (impl.status === "Concluída") {
      patch.completed_at = null;
      if (cliente?.status === "Ativo") await updateClienteBase(cliente.id, { status: "Em Implantação" });
    }
    await updateImplementation(impl.id, patch);

    // Concluiu por aqui (drag no Kanban) com os dados mínimos prontos e sem
    // ambiente criado ainda → manda pra tela de detalhe já com o "Criar
    // ambiente do cliente" pronto pra abrir (ver ImplementacaoDetalhe.tsx);
    // quem não for master simplesmente não vê esse efeito lá.
    if (next === "Concluída" && !impl.linked_tenant_id && tenantReadiness(impl.data || {}).ready) {
      navigate(`/app/crm/implementacoes/${impl.id}?abrirAmbiente=1`);
    }
  };

  const linhasBusca = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => !q || (l.cliente?.name || "").toLowerCase().includes(q) || (l.impl.responsavel || "").toLowerCase().includes(q));
  }, [linhas, busca]);

  const iniciar = async (cliente: any, lead?: any) => {
    // Trava síncrona (o estado só atualiza no próximo render — um duplo clique passaria).
    if (iniciandoRef.current) return;
    iniciandoRef.current = true;
    setIniciando(cliente.id);
    try {
      const result = await startImplementationForClient(cliente, lead, { supabase, addImplementation, updateClienteBase });
      if (result?.id) navigate(`/app/crm/implementacoes/${result.id}`);
    } finally {
      iniciandoRef.current = false;
      setIniciando(null);
    }
  };

  return (
    <PageContainer
      title="Implementações"
      description="Clientes que já fecharam e estão sendo implantados — formulário completo, integrações, progresso e relatório."
      breadcrumb={[{ label: "CRM & Vendas" }, { label: "Implementações" }]}
    >
      <div className="space-y-5 max-w-[1700px] mx-auto pb-12">
        <StatCellRow>
          <StatCell label="Em implantação" value={kpis.abertas} icon={Rocket} />
          <StatCell label="Aguardando início" value={aguardando.length} icon={Clock} tone={aguardando.length > 0 ? "warning" : "neutral"} hint="Fecharam e ainda não começaram" />
          <StatCell label="Concluídas" value={kpis.concluidas} icon={CheckCircle2} tone="success" />
          <StatCell label="Progresso médio (em andamento)" value={`${kpis.media}%`} icon={Gauge} />
        </StatCellRow>

        {view === "lista" && (aguardando.length > 0 || clientesLivres.length > 0) && (
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" /> Aguardando início ({aguardando.length})
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">Clientes com lead fechado que ainda não têm implementação. Iniciar cria o formulário já pré-preenchido com o que o sistema sabe.</p>
            {aguardando.length > 0 && (
              <div className="divide-y divide-[var(--color-border-subtle)] mb-4">
                {aguardando.map(({ cliente, lead }) => (
                  <div key={cliente.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{cliente.name}</p>
                      <p className="text-[11px] text-[var(--color-text-faint)] truncate">{[lead.name, lead.value ? `Venda ${lead.value}` : null].filter(Boolean).join(" · ")}</p>
                    </div>
                    <Button size="sm" disabled={iniciando === cliente.id} onClick={() => iniciar(cliente, lead)} className="h-8 px-3 text-xs font-medium gap-1.5 shrink-0">
                      <Play className="w-3 h-3" /> Iniciar implementação
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {clientesLivres.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--color-border-subtle)]">
                <span className="text-[11px] text-[var(--color-text-muted)]">Iniciar para outro cliente:</span>
                <select
                  value={outroClienteId}
                  onChange={(e) => setOutroClienteId(e.target.value)}
                  className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-1.5 text-xs cursor-pointer max-w-[260px]"
                >
                  <option value="">Selecione…</option>
                  {clientesLivres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Button
                  size="sm" variant="outline" disabled={!outroClienteId || iniciando === outroClienteId}
                  onClick={() => { const c = clientePorId.get(outroClienteId); if (c) iniciar(c); }}
                  className="h-8 px-3 text-xs font-medium"
                >
                  Iniciar
                </Button>
              </div>
            )}
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
            {([["lista", "Lista", LayoutList], ["kanban", "Kanban", Columns3]] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => changeView(id)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded cursor-pointer transition-all flex items-center gap-1.5",
                  view === id ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                )}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
          {implementacaoStages.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 text-[var(--color-primary-blue)]" title="As colunas acima são as mesmas etapas do funil de Implementação no Pipeline — mover um card aqui também move lá.">
              <Workflow className="w-3 h-3" /> Espelhado do Pipeline
            </span>
          )}
          {view === "lista" && (
          <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] flex-wrap">
            {FILTROS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded cursor-pointer transition-all",
                  filtro === f ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          )}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)]" />
            <input
              type="text" placeholder="Buscar cliente ou responsável…" value={busca} onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] pl-9 pr-3 py-2 text-xs focus:outline-none"
            />
          </div>
        </div>

        {view === "kanban" ? (
          <>
            <ImplementacoesKanban
              linhas={linhasBusca}
              aguardando={aguardandoFiltrado}
              columns={kanbanColumns}
              getColumnId={getColumnId}
              iniciandoId={iniciando}
              onOpen={(id) => navigate(`/app/crm/implementacoes/${id}`)}
              onStart={iniciar}
              onMove={moverStatus}
            />
            {clientesLivres.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-[var(--color-text-muted)]">Iniciar para outro cliente:</span>
                <select
                  value={outroClienteId}
                  onChange={(e) => setOutroClienteId(e.target.value)}
                  className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-1.5 text-xs cursor-pointer max-w-[260px]"
                >
                  <option value="">Selecione…</option>
                  {clientesLivres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Button
                  size="sm" variant="outline" disabled={!outroClienteId || iniciando === outroClienteId}
                  onClick={() => { const c = clientePorId.get(outroClienteId); if (c) iniciar(c); }}
                  className="h-8 px-3 text-xs font-medium"
                >
                  Iniciar
                </Button>
              </div>
            )}
          </>
        ) : filtradas.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={linhas.length === 0 ? "Nenhuma implementação iniciada ainda" : "Nenhuma implementação para esse filtro"}
            description={linhas.length === 0 ? "Inicie a primeira a partir de um cliente que já fechou, acima." : "Ajuste o filtro ou a busca."}
          />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                <tr>
                  <th className="px-6 py-3">Cliente</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Responsável</th>
                  <th className="px-6 py-3 w-56">Progresso</th>
                  <th className="px-6 py-3">Go-live</th>
                  <th className="px-6 py-3 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {filtradas.map(({ impl, cliente, progresso }) => (
                  <tr key={impl.id} onClick={() => navigate(`/app/crm/implementacoes/${impl.id}`)} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors cursor-pointer">
                    <td className="px-6 py-3.5 font-medium text-[var(--color-text-primary)]">{cliente?.name || "Cliente removido"}</td>
                    <td className="px-6 py-3.5">
                      <span className={cn("inline-flex px-2.5 py-1 rounded-lg text-[10px] font-bold border", IMPLEMENTATION_STATUS_TONE[impl.status as ImplementationStatus])}>{impl.status}</span>
                      {(() => {
                        const info = implementacaoStages.length > 0 ? getImplementationStageInfo(impl, leads as any[], implementacaoStages) : null;
                        return info ? <p className="text-[10px] text-[var(--color-text-faint)] mt-1">{info.stage.name}</p> : null;
                      })()}
                    </td>
                    <td className="px-6 py-3.5 text-[var(--color-text-muted)]">{impl.responsavel || "—"}</td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <ImplementationProgressBar percent={progresso.percent} />
                        <span className="tabular-nums font-semibold text-[var(--color-text-primary)] w-9 text-right">{progresso.percent}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-[var(--color-text-muted)] font-mono">
                      {impl.go_live_date ? new Date(impl.go_live_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <Link to={`/app/crm/implementacoes/${impl.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-[11px] font-medium">
                        Abrir <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
