import { useMemo, useState, useEffect } from "react";
import { Users, Brain, DollarSign, Award, Zap } from "lucide-react";

import { PageContainer } from "../../components/PageContainer";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../lib/apiClient";
import { leadDrillColumns } from "../../components/ui/drillColumns";
import { Badge } from "../../components/ui/badge";
import { useLocalization } from "../../contexts/LocalizationContext";
import type { DrillColumn } from "../../components/ui/DrillDownPanel";

import { KpiCards } from "./components/PerformanceDashboard/KpiCards";
import { PerformanceScoreChart, HotLeadsPanel, LeadsVolumeChart } from "./components/PerformanceDashboard/PerformanceCharts";

interface MesPerformanceCRM { month: string; avgScore: number; conversionRate: number; leads: number }
interface DashboardPerformanceServerSummary {
  performanceData: MesPerformanceCRM[]; totalLeads: number; avgScore: number; totalValue: number; winRate: number;
}

export default function Dashboard() {
  const { leads, leadScoreTriggers } = useData();
  const { activeTenantId } = useAuth();
  const { formatCurrency } = useLocalization();

  // KPIs do topo + janela de 6 meses vêm de um cache no Redis-SPY quando
  // disponível (GET /api/crm/dashboard-performance-summary), mesma fórmula.
  // hotLeads (lista de registros) e o contador de gatilhos de automação
  // continuam sempre client-side — ver comentário no endpoint.
  const [serverSummary, setServerSummary] = useState<DashboardPerformanceServerSummary | null>(null);
  useEffect(() => {
    setServerSummary(null);
    if (!activeTenantId) return;
    let cancelled = false;
    apiFetch(`/api/crm/dashboard-performance-summary?tenantId=${encodeURIComponent(activeTenantId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setServerSummary(data); })
      .catch(() => { /* silencioso — cálculo client-side abaixo já cobre */ });
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const clientPerformanceData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const target = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const month = target.toLocaleString("pt-BR", { month: "short" });
      const monthLeads = (leads as any[]).filter(l => {
        const d = new Date(l.created_at || l.createdAt || 0);
        return d.getMonth() === target.getMonth() && d.getFullYear() === target.getFullYear();
      });
      const avgScore = monthLeads.length > 0
        ? Math.round(monthLeads.reduce((s: number, l: any) => s + (l.scoreIA || 0), 0) / monthLeads.length)
        : 0;
      const won = monthLeads.filter((l: any) => l.status === "Fechado").length;
      const conversionRate = monthLeads.length > 0 ? Math.round((won / monthLeads.length) * 100) : 0;
      return { month, avgScore, conversionRate, leads: monthLeads.length };
    });
  }, [leads]);

  const performanceData = serverSummary?.performanceData ?? clientPerformanceData;

  const stats = useMemo(() => {
    const all = leads as any[];
    const clientTotalLeads = all.length;
    const clientAvgScore = clientTotalLeads > 0 ? all.reduce((a, l) => a + (l.scoreIA || 0), 0) / clientTotalLeads : 0;
    const clientTotalValue = all.reduce((a, l) => {
      const v = parseFloat((l.value || "").replace(/[^\d]/g, "")) || 0;
      return a + v;
    }, 0);
    const wonLeads = all.filter(l => l.status === "Fechado").length;
    const clientWinRate = clientTotalLeads > 0 ? (wonLeads / clientTotalLeads) * 100 : 0;

    const totalLeads = serverSummary?.totalLeads ?? clientTotalLeads;
    const avgScore = serverSummary?.avgScore ?? clientAvgScore;
    const totalValue = serverSummary?.totalValue ?? clientTotalValue;
    const winRate = serverSummary?.winRate ?? clientWinRate;

    // Listas reais por trás dos números acima — o array completo de leads já
    // está em memória via useData() independente do cache do servidor, então
    // o drill-down funciona mesmo quando o valor exibido vem do serverSummary.
    const leadColumns = leadDrillColumns(formatCurrency);
    const wonLeadsRows = all.filter((l) => l.status === "Fechado");
    const triggerColumns: DrillColumn[] = [
      { header: "Condição", render: (t: any) => `Score IA ${t.condition === "greater" ? ">" : "<"} ${t.scoreThreshold}%` },
      { header: "Etapa destino", render: (t: any) => t.targetStageId || "—" },
      { header: "Mensagem automática", render: (t: any) => <Badge variant="secondary">{t.autoMessage ? "Sim" : "Não"}</Badge> },
    ];

    return [
      { label: "Leads Totais",      value: totalLeads,                    icon: Users, drill: { subtitle: `${all.length} lead${all.length === 1 ? "" : "s"} no total`, rows: all, columns: leadColumns } },
      { label: "Score IA Médio",    value: avgScore.toFixed(1),           icon: Brain },
      { label: "Pipeline Total",    value: `R$ ${(totalValue/1000).toFixed(1)}k`, icon: DollarSign, drill: { subtitle: `${all.length} lead${all.length === 1 ? "" : "s"} somados`, rows: all, columns: leadColumns } },
      { label: "Taxa de Conversão", value: `${winRate.toFixed(1)}%`,      icon: Award, drill: { subtitle: `${wonLeadsRows.length} negócio${wonLeadsRows.length === 1 ? "" : "s"} fechado${wonLeadsRows.length === 1 ? "" : "s"}`, rows: wonLeadsRows, columns: leadColumns } },
      { label: "Gatilhos de Automação Ativos", value: leadScoreTriggers.length, icon: Zap, drill: { subtitle: `${leadScoreTriggers.length} gatilho${leadScoreTriggers.length === 1 ? "" : "s"} configurado${leadScoreTriggers.length === 1 ? "" : "s"}`, rows: leadScoreTriggers as any[], columns: triggerColumns } },
    ];
  }, [leads, leadScoreTriggers, serverSummary, formatCurrency]);

  const hotLeads = useMemo(() =>
    (leads as any[]).filter(l => (l.temperature || "").toLowerCase() === "quente").slice(0, 5),
  [leads]);

  return (
    <PageContainer
      title="Dashboard de Performance"
      description="Análise inteligente da correlação entre pré-qualificação IA e conversão comercial."
    >
      <KpiCards stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <PerformanceScoreChart performanceData={performanceData} />
        <HotLeadsPanel leads={leads as any[]} hotLeads={hotLeads} />
      </div>

      <LeadsVolumeChart performanceData={performanceData} />

    </PageContainer>
  );
}
