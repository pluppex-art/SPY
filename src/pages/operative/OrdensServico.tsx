import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Briefcase, CheckCircle2, ClipboardList, Clock, Hammer, LayoutGrid, List, Loader2, Plus, Settings2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { ViewToggle, HEADER_ACTIONS, HEADER_BUTTON, HEADER_PRIMARY_BUTTON } from "../../components/ui/view-toggle";
import { EmptyState } from "../../components/ui/empty-state";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../../components/ui/dropdown-menu";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { supabase } from "../../lib/supabase";
import { OS_STATUSES, OS_STATUS_TONE, osCode, type OsStatus } from "../../lib/ordemServico";
import { KANBAN_COR_CLASS } from "../../hooks/useKanbanConfig";
import { cn } from "../../lib/utils";
import { useOS } from "../os/hooks/useOS";
import { OS_STATUS_COLUNAS, osEmAberto, type OrdemServico } from "../os/osTypes";
import { OsBoard, PrioridadeBadge, type OsBoardColuna } from "../os/components/OsBoard";
import { NovaOsModal } from "../os/components/OsModais";
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
      await moverEtapaComConfirmacao(o.id, colunaId, funilAtual!.etapas);
      return;
    }
    if (colunaId === "Cancelada" && !(await confirmDialog({ description: "Cancelar esta ordem de serviço?" }))) return;
    await os.moverStatus(o.id, colunaId as OsStatus);
  };

  const moverEtapaComConfirmacao = async (ordemId: string, etapaId: string, etapasDoFunil: typeof os.funis[number]["etapas"]) => {
    const etapa = etapasDoFunil.find(e => e.id === etapaId);
    if (etapa?.tipo === "cancelada" && !(await confirmDialog({ description: "Cancelar esta ordem de serviço?" }))) return;
    await os.moverOrdem(ordemId, etapaId);
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

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <PageContainer
      title="Ordens de Serviço"
      description="Acompanhe cada ordem de serviço no funil do departamento, ou em todas as áreas de uma vez. Itens, valores e cobrança ficam na tela da OS."
      breadcrumb={[{ label: "Operações" }, { label: "Ordens de Serviço" }]}
      actions={
        <div className={HEADER_ACTIONS}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                title="Configurar as ordens de serviço"
                aria-label="Configurar as ordens de serviço"
                className={cn(HEADER_BUTTON, "border-[var(--color-border-default)]")}
              >
                <Settings2 className="w-3.5 h-3.5" /> Configurar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[17rem]">
              <DropdownMenuItem onSelect={() => navigate("/app/configuracoes/os/funis")} className="flex flex-col items-start gap-0.5 cursor-pointer">
                <span className="text-xs font-bold">Departamentos e funis</span>
                <span className="text-[11px] text-[var(--color-text-muted)]">Áreas, etapas e passo a passo de cada ordem</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate("/app/configuracoes/engajamento/automacoes")} className="flex flex-col items-start gap-0.5 cursor-pointer">
                <span className="text-xs font-bold">Automações</span>
                <span className="text-[11px] text-[var(--color-text-muted)]">Gerar ordens de serviço a partir do funil ou de vendas</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ViewToggle
            value={vista}
            onChange={v => setParam("vista", v === "kanban" ? null : v)}
            options={[{ id: "kanban", label: "Quadro", icon: LayoutGrid }, { id: "lista", label: "Lista", icon: List }]}
          />
          <Button onClick={nova} disabled={criando} className={HEADER_PRIMARY_BUTTON}>
            {criando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Nova ordem de serviço
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Nível 1 — em qual departamento você está olhando */}
        {depsAtivos.length > 0 && (
          <nav aria-label="Departamentos" className="flex items-end gap-1 overflow-x-auto scrollbar-none border-b border-[var(--color-border-default)]">
            {[{ id: TODOS, nome: "Todos", total: os.ordens.filter(o => osEmAberto(o, os.etapaDaOrdem(o))).length }, ...depsAtivos.map(d => ({ id: d.id, nome: d.nome, total: contagem.get(d.id) ?? 0 }))].map(t => {
              const ativa = t.id === TODOS ? !depAtual : depAtual?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => irParaDep(t.id === TODOS ? null : t.id)}
                  aria-current={ativa ? "page" : undefined}
                  className={cn(
                    "shrink-0 flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 -mb-px cursor-pointer transition-colors bg-transparent",
                    ativa
                      ? "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]"
                      : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
                  )}
                >
                  {t.nome}
                  <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-black", ativa ? "bg-[var(--color-primary-blue)]/10" : "bg-[var(--color-surface-sunken)]")}>{t.total}</span>
                </button>
              );
            })}
          </nav>
        )}

        {/* Nível 2 — filtros (os indicadores abrem pelo botão do cabeçalho) */}
        <KpiFilterCard
          id="opsOrdensServico"
          kpis={[
            { label: "Em andamento", value: kpis.abertas, icon: Hammer, tone: "primary", hint: "Abertas ou em execução" },
            { label: "Atrasadas", value: kpis.atrasadas, icon: Clock, tone: kpis.atrasadas > 0 ? "danger" : "neutral", hint: "Passaram da data prevista" },
            { label: "A faturar", value: formatCurrency(kpis.aFaturar), icon: CheckCircle2, tone: kpis.aFaturar > 0 ? "warning" : "neutral", hint: "Concluídas sem cobrança" },
            { label: "Faturado (mês)", value: formatCurrency(kpis.faturadoMes), icon: Wallet, tone: "success" },
          ]}
          activeCount={(busca.trim() ? 1 : 0) + (filtroStatus !== "Todas" ? 1 : 0)}
          onClear={() => { setBusca(""); setFiltroStatus("Todas"); }}
        >
          <FilterBar>
            {vista === "kanban" && funisDoDep.length > 1 && funilAtual && (
              <FilterSelect
                icon={Briefcase}
                title="Funil"
                value={funilAtual.id}
                onChange={v => setParam("funil", v)}
                options={funisDoDep.map(f => ({ value: f.id, label: `${f.nome}${f.padrao ? " ★" : ""} (${os.ordens.filter(o => o.funilId === f.id && osEmAberto(o, os.etapaDaOrdem(o))).length})` }))}
              />
            )}
            <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar cliente, serviço, responsável ou número…" />
            {vista === "lista" && (
              <FilterChips value={filtroStatus === "Todas" ? "" : filtroStatus} onChange={v => setFiltroStatus((v || "Todas") as (typeof FILTROS)[number])} options={[...OS_STATUSES]} allLabel="Todas" />
            )}
          </FilterBar>
        </KpiFilterCard>

        {depAtual && ehDepartamentoImplementacao(depAtual.nome) && <IniciarImplementacao onIniciada={os.reload} />}

        {os.loading ? (
          <p className="text-xs text-[var(--color-text-faint)] flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Carregando…</p>
        ) : vista === "kanban" ? (
          <OsBoard
            colunas={colunas}
            ordens={cartoes}
            colunaDe={o => (doFunil ? o.etapaId : o.status)}
            departamentoNome={doFunil ? undefined : o => (o.departamentoId ? depPorId.get(o.departamentoId)?.nome : undefined)}
            onOpen={o => navigate(`/app/ordens-servico/${o.id}`)}
            onMover={mover}
            onNova={nova}
          />
        ) : (
          <>
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

    </PageContainer>
  );
}
