import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, ClipboardList, Clock, Hammer, LayoutGrid, List, Loader2, Plus, Search, Settings2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { StatCell, StatCellRow } from "../finance/components/StatCell";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { supabase } from "../../lib/supabase";
import { OS_STATUSES, OS_STATUS_TONE, osCode, type OsStatus } from "../../lib/ordemServico";
import { KANBAN_COR_CLASS } from "../../hooks/useKanbanConfig";
import { cn } from "../../lib/utils";
import { useOS } from "../os/hooks/useOS";
import { OS_STATUS_COLUNAS, osEmAberto, type OrdemServico } from "../os/osTypes";
import { OsBoard, PrioridadeBadge, prazoInfo, type OsBoardColuna } from "../os/components/OsBoard";
import { DetalheOsModal, NovaOsModal } from "../os/components/OsModais";
import { IniciarImplementacao } from "../os/components/IniciarImplementacao";
import { ehDepartamentoImplementacao } from "../os/implementationOs";

const FILTROS = ["Todas", ...OS_STATUSES] as const;
const TODOS = "todos";

export default function OrdensServico() {
  const { activeTenantId, user } = useAuth();
  const { formatCurrency } = useLocalization();
  const navigate = useNavigate();
  const os = useOS();
  const [params, setParams] = useSearchParams();

  // Kanban é a visão principal; a lista (tabela) é a alternativa.
  const vista = params.get("vista") === "lista" ? "lista" : "kanban";
  const setParam = (chave: string, valor: string | null) =>
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (valor === null) next.delete(chave);
      else next.set(chave, valor);
      return next;
    });

  const [filtroStatus, setFiltroStatus] = useState<(typeof FILTROS)[number]>("Todas");
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);
  const [novaOpen, setNovaOpen] = useState(false);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);

  const depsAtivos = useMemo(() => os.departamentos.filter(d => d.ativo), [os.departamentos]);
  const depPorId = useMemo(() => new Map(os.departamentos.map(d => [d.id, d])), [os.departamentos]);
  const depAtual = depsAtivos.find(d => d.id === params.get("dep"));
  // Um departamento pode ter vários funis: a aba mostra o escolhido (?funil=), senão o padrão.
  const funisDoDep = useMemo(
    () => (depAtual ? os.funis.filter(f => f.departamentoId === depAtual.id && f.ativo).sort((a, b) => Number(b.padrao) - Number(a.padrao)) : []),
    [depAtual, os.funis],
  );
  const funilAtual = depAtual ? funisDoDep.find(f => f.id === params.get("funil")) ?? os.funilPadraoDe(depAtual.id) : undefined;
  const irParaDep = (id: string | null) =>
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete("funil");
      if (id === null) next.delete("dep");
      else next.set("dep", id);
      return next;
    });
  const selecionada = os.ordens.find(o => o.id === selecionadaId) ?? null;

  const kpis = useMemo(() => {
    const mes = new Date().toISOString().slice(0, 7);
    const hoje = new Date().toISOString().slice(0, 10);
    const abertas = os.ordens.filter(o => o.status === "Aberta" || o.status === "Em execução");
    return {
      abertas: abertas.length,
      atrasadas: abertas.filter(o => o.prazo && o.prazo < hoje).length,
      aFaturar: os.ordens.filter(o => o.status === "Concluída").reduce((s, o) => s + o.valorTotal, 0),
      faturadoMes: os.ordens.filter(o => o.status === "Faturada" && o.createdAt.startsWith(mes)).reduce((s, o) => s + o.valorTotal, 0),
    };
  }, [os.ordens]);

  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of os.ordens) {
      if (o.departamentoId && osEmAberto(o, os.etapaDaOrdem(o))) m.set(o.departamentoId, (m.get(o.departamentoId) ?? 0) + 1);
    }
    return m;
  }, [os.ordens, os.etapaDaOrdem]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return os.ordens.filter(o => {
      if (depAtual && o.departamentoId !== depAtual.id) return false;
      if (!q) return true;
      return [o.clienteNome, o.titulo, o.responsavelNome, osCode(o.numero)].some(v => v.toLowerCase().includes(q));
    });
  }, [os.ordens, depAtual, busca]);

  const linhas = useMemo(
    () => visiveis.filter(o => filtroStatus === "Todas" || o.status === filtroStatus),
    [visiveis, filtroStatus],
  );

  // Colunas: etapas do funil do departamento; na aba "Todos" (ou sem departamentos), o ciclo de status.
  const colunas: OsBoardColuna[] = useMemo(
    () =>
      depAtual && funilAtual
        ? funilAtual.etapas.map(e => ({ id: e.id, nome: e.nome, cor: e.cor }))
        : OS_STATUS_COLUNAS.map(c => ({ id: c.id, nome: c.id, cor: c.cor })),
    [depAtual, funilAtual],
  );
  const doFunil = !!(depAtual && funilAtual);
  const cartoes = doFunil ? visiveis.filter(o => o.funilId === funilAtual!.id) : visiveis;

  const mover = async (o: OrdemServico, colunaId: string) => {
    if (doFunil) {
      const etapa = funilAtual!.etapas.find(e => e.id === colunaId);
      if (etapa?.tipo === "cancelada" && !(await confirmDialog({ description: "Cancelar esta ordem de serviço?" }))) return;
      await os.moverOrdem(o.id, colunaId);
      return;
    }
    if (colunaId === "Cancelada" && !(await confirmDialog({ description: "Cancelar esta ordem de serviço?" }))) return;
    await os.moverStatus(o.id, colunaId as OsStatus);
  };

  // Sem departamentos: mantém o fluxo de sempre (rascunho em branco → tela completa).
  const nova = async () => {
    if (depsAtivos.length > 0) { setNovaOpen(true); return; }
    if (!supabase || !activeTenantId) return;
    setCriando(true);
    // numero = 0 → o banco atribui o próximo número do tenant (trigger).
    const { data, error } = await supabase
      .from("ordens_servico")
      .insert({ tenant_id: activeTenantId, numero: 0, created_by: user?.id ?? null })
      .select("id")
      .single();
    setCriando(false);
    if (error || !data) { toast.error("Não foi possível criar a ordem de serviço."); return; }
    navigate(`/app/ordens-servico/${data.id}`);
  };

  const excluirRascunho = async (o: OrdemServico) => {
    if (!(await confirmDialog({ description: `Excluir o rascunho ${osCode(o.numero)}?` }))) return;
    setSelecionadaId(null);
    await os.deleteOrdem(o.id);
  };

  const cancelar = async (o: OrdemServico) => {
    if (!(await confirmDialog({ description: `Cancelar a ${osCode(o.numero)}?` }))) return;
    await os.cancelarOrdem(o.id);
  };

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <PageContainer
      title="Ordens de Serviço"
      description="Acompanhe cada ordem de serviço no funil do departamento, ou em todas as áreas de uma vez. Itens, valores e cobrança ficam na tela da OS."
      breadcrumb={[{ label: "Operações" }, { label: "Ordens de Serviço" }]}
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/app/configuracoes/os/funis"
            className="flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-control)] border border-[var(--color-border-default)] text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-all"
          >
            <Settings2 className="w-3.5 h-3.5" /> Departamentos e funis
          </Link>
          <Button onClick={nova} disabled={criando} className="h-9 px-4 text-xs font-medium gap-1.5">
            {criando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Nova ordem de serviço
          </Button>
        </div>
      }
    >
      <div className="space-y-5 max-w-[1700px] mx-auto pb-12">
        <StatCellRow>
          <StatCell label="Em andamento" value={kpis.abertas} icon={Hammer} hint="Abertas ou em execução" />
          <StatCell label="Atrasadas" value={kpis.atrasadas} icon={Clock} tone={kpis.atrasadas > 0 ? "danger" : "neutral"} hint="Passaram da data prevista" />
          <StatCell label="A faturar" value={formatCurrency(kpis.aFaturar)} icon={CheckCircle2} tone={kpis.aFaturar > 0 ? "warning" : "neutral"} hint="Concluídas sem cobrança" />
          <StatCell label="Faturado (mês)" value={formatCurrency(kpis.faturadoMes)} icon={Wallet} tone="success" />
        </StatCellRow>

        {/* Abas por departamento + busca + vista */}
        <div className="flex flex-wrap items-center gap-3">
          {depsAtivos.length > 0 && (
            <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] overflow-x-auto max-w-full">
              {[{ id: TODOS, nome: "Todos", total: os.ordens.filter(o => osEmAberto(o, os.etapaDaOrdem(o))).length }, ...depsAtivos.map(d => ({ id: d.id, nome: d.nome, total: contagem.get(d.id) ?? 0 }))].map(t => {
                const ativa = t.id === TODOS ? !depAtual : depAtual?.id === t.id;
                return (
                  <button
                    key={t.id} type="button" onClick={() => irParaDep(t.id === TODOS ? null : t.id)}
                    className={cn("shrink-0 flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded cursor-pointer transition-all", ativa ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")}
                  >
                    {t.nome}
                    <span className={cn("px-1.5 rounded text-[10px]", ativa ? "bg-white/20" : "bg-[var(--color-border-subtle)]")}>{t.total}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)]" />
            <input type="text" placeholder="Buscar cliente, serviço, responsável ou número…" value={busca} onChange={e => setBusca(e.target.value)} className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] pl-9 pr-3 py-2 text-xs focus:outline-none" />
          </div>
          <div className="ml-auto flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
            {([["kanban", "Kanban", LayoutGrid], ["lista", "Lista", List]] as const).map(([v, label, Icon]) => (
              <button
                key={v} type="button" onClick={() => setParam("vista", v === "kanban" ? null : v)}
                className={cn("flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded cursor-pointer transition-all", vista === v ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")}
              ><Icon className="w-3.5 h-3.5" /> {label}</button>
            ))}
          </div>
        </div>

        {vista === "kanban" && funisDoDep.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Funil</span>
            {funisDoDep.map(f => {
              const ativo = funilAtual?.id === f.id;
              const total = os.ordens.filter(o => o.funilId === f.id && osEmAberto(o, os.etapaDaOrdem(o))).length;
              return (
                <button
                  key={f.id} type="button" onClick={() => setParam("funil", f.id)}
                  className={cn("flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border cursor-pointer transition-all", ativo ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/30 text-[var(--color-primary-blue)]" : "border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")}
                >
                  {f.nome}{f.padrao ? " ★" : ""}
                  <span className="text-[10px] opacity-70">{total}</span>
                </button>
              );
            })}
          </div>
        )}

        {depAtual && ehDepartamentoImplementacao(depAtual.nome) && <IniciarImplementacao onIniciada={os.reload} />}

        {os.loading ? (
          <p className="text-xs text-[var(--color-text-faint)] flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Carregando…</p>
        ) : vista === "kanban" ? (
          <OsBoard
            colunas={colunas}
            ordens={cartoes}
            colunaDe={o => (doFunil ? o.etapaId : o.status)}
            departamentoNome={doFunil ? undefined : o => (o.departamentoId ? depPorId.get(o.departamentoId)?.nome : undefined)}
            onOpen={o => setSelecionadaId(o.id)}
            onMover={mover}
          />
        ) : (
          <>
            <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] flex-wrap w-fit">
              {FILTROS.map(f => (
                <button
                  key={f} type="button" onClick={() => setFiltroStatus(f)}
                  className={cn("px-3 py-1 text-xs font-medium rounded cursor-pointer transition-all", filtroStatus === f ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")}
                >{f}</button>
              ))}
            </div>
            {linhas.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title={os.ordens.length === 0 ? "Nenhuma ordem de serviço ainda" : "Nenhuma ordem para esse filtro"}
                description={os.ordens.length === 0 ? "Crie a primeira ordem de serviço para começar." : "Ajuste o filtro ou a busca."}
              />
            ) : (
              <Card className="overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                    <tr>
                      <th className="px-6 py-3">Nº</th><th className="px-6 py-3">Cliente</th><th className="px-6 py-3">Serviço</th>
                      {depsAtivos.length > 0 && <th className="px-6 py-3">Departamento</th>}
                      <th className="px-6 py-3">Previsão</th><th className="px-6 py-3 text-right">Valor</th><th className="px-6 py-3">Prioridade</th><th className="px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {linhas.map(o => {
                      const atrasada = (o.status === "Aberta" || o.status === "Em execução") && o.prazo && o.prazo < hoje;
                      const etapa = os.etapaDaOrdem(o);
                      const dep = o.departamentoId ? depPorId.get(o.departamentoId) : undefined;
                      return (
                        <tr key={o.id} onClick={() => navigate(`/app/ordens-servico/${o.id}`)} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors cursor-pointer">
                          <td className="px-6 py-3.5 font-mono font-semibold text-[var(--color-text-primary)]">{osCode(o.numero)}</td>
                          <td className="px-6 py-3.5 font-medium text-[var(--color-text-primary)]">{o.clienteNome || "—"}</td>
                          <td className="px-6 py-3.5 text-[var(--color-text-muted)] max-w-[320px] truncate">{o.titulo || "Sem título"}</td>
                          {depsAtivos.length > 0 && <td className="px-6 py-3.5 text-[var(--color-text-muted)]">{dep?.nome ?? "—"}</td>}
                          <td className={cn("px-6 py-3.5 font-mono", atrasada ? "text-rose-500 font-semibold" : "text-[var(--color-text-muted)]")}>
                            {o.prazo ? new Date(o.prazo + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                          </td>
                          <td className="px-6 py-3.5 text-right tabular-nums font-semibold text-[var(--color-text-primary)]">{formatCurrency(o.valorTotal)}</td>
                          <td className="px-6 py-3.5"><PrioridadeBadge p={o.prioridade} /></td>
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className={cn("inline-flex px-2.5 py-1 rounded-lg text-[10px] font-bold border", OS_STATUS_TONE[o.status])}>{o.status}</span>
                              {etapa && (
                                <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                                  <span className={cn("w-1.5 h-1.5 rounded-full", KANBAN_COR_CLASS[etapa.cor] ?? "bg-slate-500")} /> {etapa.nome}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            )}
          </>
        )}
      </div>

      <NovaOsModal
        isOpen={novaOpen}
        onClose={() => setNovaOpen(false)}
        departamentos={depsAtivos}
        departamentoInicial={depAtual?.id}
        funis={os.funis}
        funilInicial={funilAtual?.id}
        onSave={async p => {
          const criada = await os.addOrdem(p);
          if (criada) setNovaOpen(false);
          return !!criada;
        }}
      />

      <DetalheOsModal
        ordem={selecionada}
        departamento={selecionada?.departamentoId ? depPorId.get(selecionada.departamentoId) : undefined}
        etapas={selecionada?.funilId ? os.funis.find(f => f.id === selecionada.funilId)?.etapas ?? [] : []}
        funisDoDepartamento={selecionada?.departamentoId ? os.funis.filter(f => f.departamentoId === selecionada.departamentoId && (f.ativo || f.id === selecionada.funilId)) : []}
        onTrocarFunil={os.trocarFunilDaOrdem}
        onClose={() => setSelecionadaId(null)}
        onUpdate={os.updateOrdem}
        onMover={os.moverOrdem}
        onCancelar={cancelar}
        onExcluir={excluirRascunho}
        onAbrirCompleta={o => navigate(`/app/ordens-servico/${o.id}`)}
        onAbrirOrigem={o => o.origemTipo === "implementation" && o.origemId && navigate(`/app/crm/implementacoes/${o.origemId}`)}
      />
    </PageContainer>
  );
}
