import { KpiFilterCard, FilterBar, FilterSearch, FilterChips, usePeriodoIndicadores } from "../../components/ui/kpi-filter-card";
import { useState, useEffect } from "react";
import { Wallet, CheckCircle2, AlertTriangle, Clock, DollarSign, RefreshCw, Inbox, Download, Send } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Pagination } from "../../components/ui/Pagination";
import { PageContainer } from "../../components/PageContainer";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import { useLocalization } from "../../contexts/LocalizationContext";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../lib/apiClient";
import { useMensalidadesList, type Mensalidade } from "./useMensalidadesList";
import { friendlyError } from "../../lib/friendlyError";

import { HelpTip } from "../../components/ui/help-tip";
const statusColor = (s: string) => {
  if (s === "Pago") return "success" as const;
  if (s === "Atrasado") return "destructive" as const;
  if (s === "Cancelado") return "neutral" as const;
  return "warning" as const;
};

const STATUS_FILTERS = ["Todos", "Pendente", "Atrasado", "Pago", "Cancelado"];

interface MensalidadesServerSummary {
  totalPendente: number; totalAtrasado: number; totalRecebidoMes: number; countAtrasado: number;
}

export default function Mensalidades() {
  const { formatCurrency } = useLocalization();
  const { activeTenantId } = useAuth();
  const {
    mensalidades, studentsById, total, page, setPage, totalPages, pageSize,
    searchQuery, setSearchQuery, statusFilter, setStatusFilter, loading, refetch, exportAll, fetchBaseResumo,
  } = useMensalidadesList();
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Os 4 KPIs do topo (somam sobre TODAS as mensalidades do tenant, não só
  // a página atual) vêm de um cache no Redis-SPY quando disponível
  // (GET /api/education/mensalidades-summary), mesma fórmula.
  const [serverSummary, setServerSummary] = useState<MensalidadesServerSummary | null>(null);
  const fetchSummary = () => {
    if (!activeTenantId) return;
    apiFetch(`/api/education/mensalidades-summary?tenantId=${encodeURIComponent(activeTenantId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setServerSummary(data); })
      .catch(() => { /* silencioso — sem fallback client-side pra esses somatórios (ver KPIs abaixo) */ });
  };
  useEffect(() => { setServerSummary(null); fetchSummary(); }, [activeTenantId]);

  // Com período escolhido na janela "Indicadores", os totais saem das mensalidades
  // com vencimento no intervalo; sem período, continuam vindo do resumo do servidor.
  const periodo = usePeriodoIndicadores("data de vencimento");
  const comPeriodo = !!(periodo.de || periodo.ate);
  const [baseResumo, setBaseResumo] = useState<Awaited<ReturnType<typeof fetchBaseResumo>> | null>(null);
  const [versaoResumo, setVersaoResumo] = useState(0);
  useEffect(() => {
    setBaseResumo(null);
    if (!comPeriodo) return;
    let cancelado = false;
    fetchBaseResumo()
      .then((linhas) => { if (!cancelado) setBaseResumo(linhas); })
      .catch((error) => { if (!cancelado) toast.error(`Erro ao calcular os indicadores: ${friendlyError(error)}`); });
    return () => { cancelado = true; };
  }, [activeTenantId, comPeriodo, versaoResumo]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAtualizarInadimplencia = async () => {
    if (!supabase) return;
    setRefreshing(true);
    const { data, error } = await supabase.rpc("atualizar_inadimplencia_mensalidades");
    setRefreshing(false);
    if (error) { toast.error(`Erro ao atualizar: ${friendlyError(error)}`); return; }
    toast.success(data > 0 ? `${data} mensalidade(s) marcada(s) como atrasada(s).` : "Nenhuma mensalidade nova em atraso.");
    refetch();
    fetchSummary();
    setVersaoResumo((v) => v + 1);
  };

  const handleMarcarPago = async (m: Mensalidade) => {
    if (!supabase) return;
    const today = new Date().toISOString().split("T")[0];
    const { error } = await supabase.from("mensalidades").update({ status: "Pago", data_pagamento: today }).eq("id", m.id);
    if (error) { toast.error(`Erro ao registrar pagamento: ${friendlyError(error)}`); return; }
    refetch();
    fetchSummary();
    setVersaoResumo((v) => v + 1);
    toast.success("Mensalidade marcada como paga.");
  };

  // Sem array completo já carregado no cliente pra usar de fallback (essa
  // tela nunca passou pelo DataContext) — enquanto o resumo não chega,
  // mostra "—" em vez de 0, pra não sugerir "zero pendências" por engano.
  const kpiValue = (n: number | undefined, format: (v: number) => string) => (n === undefined ? "—" : format(n));
  const noPeriodo = comPeriodo && baseResumo ? periodo.filtrar(baseResumo, (m) => m.vencimento) : null;
  const doStatus = (status: Mensalidade["status"]) => noPeriodo?.filter((m) => m.status === status);
  const soma = (linhas?: { valor: number }[]) => linhas?.reduce((s, m) => s + (Number(m.valor) || 0), 0);
  const totalPendente = kpiValue(comPeriodo ? soma(doStatus("Pendente")) : serverSummary?.totalPendente, formatCurrency);
  const totalAtrasado = kpiValue(comPeriodo ? soma(doStatus("Atrasado")) : serverSummary?.totalAtrasado, formatCurrency);
  const totalRecebidoMes = kpiValue(serverSummary?.totalRecebidoMes, formatCurrency);
  const countAtrasado = serverSummary?.countAtrasado ?? 0;
  const atrasadosNoCartao = comPeriodo ? doStatus("Atrasado")?.length ?? "—" : countAtrasado;
  const dicaResumo = comPeriodo ? "Vencimentos no período (não depende dos filtros)" : "Total do tenant (não depende dos filtros)";

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const { mensalidades: all, studentsById: allStudents } = await exportAll();
      if (all.length === 0) {
        toast.info("Nenhuma mensalidade para exportar.");
        return;
      }
      const headers = ["Aluno", "Competência", "Parcela", "Valor", "Vencimento", "Status", "Data Pagamento"];
      const rows = all.map(m => [
        `"${(allStudents[m.student_id] || "Aluno").replace(/"/g, '""')}"`,
        `"${m.competencia}"`,
        m.parcela,
        m.valor,
        `"${m.vencimento}"`,
        `"${m.status}"`,
        `"${m.data_pagamento || ""}"`
      ]);
      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `mensalidades_${new Date().toISOString().split("T")[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Relatório de mensalidades exportado com sucesso!");
    } finally {
      setExporting(false);
    }
  };

  const handleLembreteInadimplentes = () => {
    if (countAtrasado === 0) {
      toast.info("Nenhum aluno em atraso no momento.");
      return;
    }
    toast.success(`Disparo de régua de cobrança enviado para ${countAtrasado} aluno(s) em atraso.`);
  };

  return (
    <PageContainer
      title="Mensalidades & Inadimplência"
      description="Controle as cobranças por aluno, os vencimentos e os recebimentos, e acompanhe quem está inadimplente."
      actions={
        <div className="flex items-center gap-2">
          <Button onClick={handleExportCSV} disabled={exporting} variant="outline" className="h-9 px-3.5 text-xs font-bold gap-1.5 border-[var(--color-border-default)]">
            <Download className="w-3.5 h-3.5" /> {exporting ? "Exportando..." : "Exportar CSV"}
          </Button>
          <Button onClick={handleLembreteInadimplentes} variant="outline" className="h-9 px-3.5 text-xs font-bold gap-1.5 border-[var(--color-border-default)] hover:border-amber-500/40">
            <Send className="w-3.5 h-3.5 text-amber-500" /> Cobrança em Massa
          </Button>
          <Button onClick={handleAtualizarInadimplencia} disabled={refreshing} variant="outline" className="h-9 px-4 text-xs font-bold gap-1.5 border-[var(--color-border-default)]">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> Atualizar Inadimplência
          </Button>
        </div>
      }
    >
      <div className="max-w-[1500px] mx-auto space-y-6 pb-12">

        <KpiFilterCard
          id="eduMensalidades"
          periodo={periodo}
          kpis={[
            { label: "A Receber (Pendente)", value: totalPendente, icon: Clock, tone: "warning", hint: dicaResumo },
            { label: "Em Atraso", value: totalAtrasado, icon: AlertTriangle, tone: "danger", hint: dicaResumo },
            { label: "Recebido neste Mês", value: totalRecebidoMes, icon: DollarSign, tone: "success", hint: "Total do tenant (não depende dos filtros)" },
            { label: "Alunos Inadimplentes", value: atrasadosNoCartao, icon: Wallet, tone: "primary", hint: dicaResumo },
          ]}
          activeCount={(searchQuery ? 1 : 0) + (statusFilter !== "Todos" ? 1 : 0)}
          onClear={() => { setSearchQuery(""); setStatusFilter("Todos"); }}
        >
          <FilterBar>
            <FilterSearch value={searchQuery} onChange={setSearchQuery} placeholder="Buscar por nome do aluno..." />
            <FilterChips value={statusFilter} onChange={setStatusFilter} allValue="Todos" options={STATUS_FILTERS.filter(x => x !== "Todos")} />
          </FilterBar>
        </KpiFilterCard>

        {loading && mensalidades.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-muted)] text-xs font-bold">Carregando mensalidades...</div>
        ) : mensalidades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-50">
            <Inbox className="w-10 h-10 text-[var(--color-text-faint)]" />
            <p className="text-xs font-bold text-[var(--color-text-muted)] text-center">
              Nenhuma mensalidade gerada ainda.<br/>Informe o valor da mensalidade ao matricular um aluno em "Base de Alunos".
            </p>
          </div>
        ) : (
          <>
            <Card className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/50">
                      <th className="p-3.5 text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">Aluno</th>
                      <th className="p-3.5 text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">Competência</th>
                      <th className="p-3.5 text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">Parcela</th>
                      <th className="p-3.5 text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">Vencimento</th>
                      <th className="p-3.5 text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">Valor</th>
                      <th className="p-3.5 text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">Status</th>
                      <th className="p-3.5 text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider text-right"><span className="inline-flex items-center gap-1">Ações<HelpTip label="O que cada botão faz">Marcar Pago: registra que a mensalidade foi paga. O botão só aparece enquanto ela não estiver paga nem cancelada.</HelpTip></span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {mensalidades.map(m => (
                      <tr key={m.id} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
                        <td className="p-3.5 text-xs font-bold text-[var(--color-text-primary)]">{studentsById[m.student_id] || "—"}</td>
                        <td className="p-3.5 text-xs text-[var(--color-text-muted)] font-mono">{m.competencia}</td>
                        <td className="p-3.5 text-xs text-[var(--color-text-muted)]">{m.parcela}</td>
                        <td className="p-3.5 text-xs text-[var(--color-text-primary)] font-mono">{m.vencimento}</td>
                        <td className="p-3.5 text-xs font-bold text-[var(--color-text-primary)] font-mono">{formatCurrency(Number(m.valor))}</td>
                        <td className="p-3.5"><Badge variant={statusColor(m.status)}>{m.status}</Badge></td>
                        <td className="p-3.5 text-right">
                          {m.status !== "Pago" && m.status !== "Cancelado" && (
                            <Button variant="outline" size="xs" onClick={() => handleMarcarPago(m)} className="h-7 px-2 text-xs font-bold gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Marcar Pago
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} loading={loading} onPageChange={setPage} itemLabel="mensalidade" />
          </>
        )}
      </div>
    </PageContainer>
  );
}
