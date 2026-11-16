import { useState, useMemo, useEffect } from "react";
import {
  FileText, Download, Printer, Filter, Calendar,
  TrendingUp, DollarSign, Users, CheckSquare,
  Target, BarChart3, Briefcase, ArrowUpRight
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { PageContainer } from "../../components/PageContainer";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { downloadCsv } from "../../lib/csvExport";
import { getMRR } from "../../lib/revenueMetrics";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line
} from "recharts";
import { apiFetch } from "../../lib/apiClient";

type Periodo = "30dias" | "mes" | "trimestre" | "ano" | "todos";

interface SellerRow { name: string; leads: number; closed: number; revenue: number; rate: number }
interface RelatoriosExecutivosServerSummary {
  totalLeads: number; closedLeads: number; leadConversion: number;
  totalReceitas: number; totalDespesas: number; resultadoLiquido: number;
  tasksCompleted: number; tasksTotal: number; taskCompletionRate: number;
  salesBySeller: SellerRow[]; contratosAtivosCount: number; mrrContratado: number;
}

export default function RelatoriosExecutivos() {
  const { leads, financeEntries, contracts, tasks, colaboradores } = useData();
  const { activeTenantId } = useAuth();
  const { formatCurrency } = useLocalization();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [moduloFiltro, setModuloFiltro] = useState<"todos" | "comercial" | "financeiro" | "operacoes">("todos");

  // KPIs consolidados + desempenho por vendedor vêm de um cache no
  // Redis-SPY quando disponível (GET /api/crm/relatorios-executivos-summary),
  // mesma fórmula (isWithin replicado igual no servidor). Cálculo client-side
  // abaixo é o fallback.
  const [serverSummary, setServerSummary] = useState<RelatoriosExecutivosServerSummary | null>(null);
  useEffect(() => {
    setServerSummary(null);
    if (!activeTenantId) return;
    let cancelled = false;
    apiFetch(`/api/crm/relatorios-executivos-summary?tenantId=${encodeURIComponent(activeTenantId)}&periodo=${periodo}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setServerSummary(data); })
      .catch(() => { /* silencioso — cálculo client-side abaixo já cobre */ });
    return () => { cancelled = true; };
  }, [activeTenantId, periodo]);

  // Filtra dados pelo período
  const filteredData = useMemo(() => {
    const now = new Date();
    const isWithin = (dateStr?: string) => {
      if (!dateStr || periodo === "todos") return true;
      try {
        let d: Date;
        if (dateStr.includes("/")) {
          const parts = dateStr.split("/");
          d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        } else {
          d = new Date(dateStr);
        }
        if (isNaN(d.getTime())) return true;

        if (periodo === "30dias") {
          return now.getTime() - d.getTime() <= 30 * 24 * 3600 * 1000;
        }
        if (periodo === "mes") {
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        }
        if (periodo === "trimestre") {
          const qNow = Math.floor(now.getMonth() / 3);
          const qD = Math.floor(d.getMonth() / 3);
          return d.getFullYear() === now.getFullYear() && qNow === qD;
        }
        if (periodo === "ano") {
          return d.getFullYear() === now.getFullYear();
        }
        return true;
      } catch {
        return true;
      }
    };

    const pLeads = leads.filter(l => isWithin(l.date || l.createdAt));
    const pFinance = financeEntries.filter(f => isWithin(f.date));
    const pTasks = tasks.filter(t => isWithin(t.due_date ?? undefined));

    return { leads: pLeads, finance: pFinance, tasks: pTasks };
  }, [leads, financeEntries, tasks, periodo]);

  // Indicadores Consolidados
  const clientTotalLeads = filteredData.leads.length;
  const clientClosedLeads = filteredData.leads.filter(l => l.status === "Fechado" || l.status === "Ganho").length;
  const clientLeadConversion = clientTotalLeads > 0 ? Math.round((clientClosedLeads / clientTotalLeads) * 100) : 0;

  const clientTotalReceitas = filteredData.finance
    .filter(f => f.type === "Receber" && f.status === "Pago")
    .reduce((s, f) => s + f.value, 0);

  const clientTotalDespesas = filteredData.finance
    .filter(f => f.type === "Pagar" && f.status === "Pago")
    .reduce((s, f) => s + f.value, 0);

  const clientResultadoLiquido = clientTotalReceitas - clientTotalDespesas;

  const clientTasksCompleted = filteredData.tasks.filter(t => t.status === "Concluída").length;
  const clientTaskCompletionRate = filteredData.tasks.length > 0
    ? Math.round((clientTasksCompleted / filteredData.tasks.length) * 100)
    : 0;

  // Performance por Vendedor / Responsável
  const clientSalesBySeller = useMemo(() => {
    const map: Record<string, { leads: number; closed: number; revenue: number }> = {};
    filteredData.leads.forEach(l => {
      const seller = l.seller || "Sem atribuição";
      if (!map[seller]) map[seller] = { leads: 0, closed: 0, revenue: 0 };
      map[seller].leads += 1;
      if (l.status === "Fechado" || l.status === "Ganho") {
        map[seller].closed += 1;
        const val = typeof l.value === "number" ? l.value : parseFloat(String(l.value || "0").replace(/[^0-9.,]/g, "").replace(",", "."));
        map[seller].revenue += isNaN(val) ? 0 : val;
      }
    });

    return Object.entries(map).map(([name, data]) => ({
      name,
      leads: data.leads,
      closed: data.closed,
      revenue: data.revenue,
      rate: data.leads > 0 ? Math.round((data.closed / data.leads) * 100) : 0,
    })).sort((a, b) => b.revenue - a.revenue);
  }, [filteredData.leads]);

  const totalLeads = serverSummary?.totalLeads ?? clientTotalLeads;
  const closedLeads = serverSummary?.closedLeads ?? clientClosedLeads;
  const leadConversion = serverSummary?.leadConversion ?? clientLeadConversion;
  const totalReceitas = serverSummary?.totalReceitas ?? clientTotalReceitas;
  const totalDespesas = serverSummary?.totalDespesas ?? clientTotalDespesas;
  const resultadoLiquido = serverSummary?.resultadoLiquido ?? clientResultadoLiquido;
  const tasksCompleted = serverSummary?.tasksCompleted ?? clientTasksCompleted;
  const tasksTotal = serverSummary?.tasksTotal ?? filteredData.tasks.length;
  const taskCompletionRate = serverSummary?.taskCompletionRate ?? clientTaskCompletionRate;
  const salesBySeller = serverSummary?.salesBySeller ?? clientSalesBySeller;
  const contratosAtivosCount = serverSummary?.contratosAtivosCount ?? contracts.filter(c => c.status === "Ativo").length;
  const mrrContratado = serverSummary?.mrrContratado ?? getMRR(contracts);

  const fmt = (v: number) => formatCurrency(v);

  const handleExportCSV = () => {
    const rows = [
      ["MÉTRICA", "VALOR"],
      ["Período Selecionado", periodo],
      ["Total de Leads Captados", String(totalLeads)],
      ["Negócios Ganhos", String(closedLeads)],
      ["Taxa de Conversão Geral", `${leadConversion}%`],
      ["Receitas Liquidadas", fmt(totalReceitas)],
      ["Despesas Liquidadas", fmt(totalDespesas)],
      ["Resultado Líquido Operacional", fmt(resultadoLiquido)],
      ["Tarefas Concluídas", `${tasksCompleted}/${tasksTotal} (${taskCompletionRate}%)`],
      [],
      ["VENDEDOR / RESPONSÁVEL", "LEADS", "FECHAMENTOS", "CONVERSÃO (%)", "RECEITA (R$)"],
      ...salesBySeller.map(s => [s.name, String(s.leads), String(s.closed), `${s.rate}%`, fmt(s.revenue)]),
    ];

    downloadCsv(`relatorio_executivo_${periodo}_${Date.now()}.csv`, rows[0], rows.slice(1));
    toast.success("Relatório Executivo exportado com sucesso!");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <PageContainer
      title="Relatórios Executivos S.P.Y."
      description="Resumo estratégico dos três pilares do negócio (Comercial, Financeiro e Operacional) para quem toma as decisões."
      actions={
        <div className="flex items-center gap-3">
          <select 
            value={periodo} 
            onChange={(e) => setPeriodo(e.target.value as Periodo)}
            className="bg-[var(--color-surface-elevated)] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-blue-500"
          >
            <option value="30dias">Últimos 30 dias</option>
            <option value="mes">Mês Atual</option>
            <option value="trimestre">Trimestre Atual</option>
            <option value="ano">Ano Vigente</option>
            <option value="todos">Histórico Completo</option>
          </select>

          <Button 
            variant="outline" 
            onClick={handlePrint}
            className="h-9 px-3 rounded-xl border-white/10 text-xs font-bold gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> Imprimir
          </Button>

          <Button 
            onClick={handleExportCSV}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-9 px-4 text-xs font-bold gap-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" /> Exportar Relatório
          </Button>
        </div>
      }
    >
      <div className="max-w-[1600px] mx-auto space-y-6 pb-12">

        {/* Executive Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5 bg-[var(--color-surface-elevated)] border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Leads & Conversão</span>
              <Target className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-display font-black text-white italic">{totalLeads}</div>
            <div className="text-xs text-slate-400 mt-1 flex items-center justify-between">
              <span>{closedLeads} fechados</span>
              <Badge variant={leadConversion > 15 ? "success" : "neutral"}>{leadConversion}% conv.</Badge>
            </div>
          </Card>

          <Card className="p-5 bg-[var(--color-surface-elevated)] border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Receita Liquidada</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-display font-black text-emerald-400 italic">{fmt(totalReceitas)}</div>
            <p className="text-xs text-slate-400 mt-1">Entradas confirmadas no período</p>
          </Card>

          <Card className="p-5 bg-[var(--color-surface-elevated)] border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Despesas Liquidadas</span>
              <TrendingUp className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-display font-black text-rose-400 italic">{fmt(totalDespesas)}</div>
            <p className="text-xs text-slate-400 mt-1">Custos e despesas quitados</p>
          </Card>

          <Card className="p-5 bg-[var(--color-surface-elevated)] border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Resultado Líquido</span>
              <Briefcase className={`w-4 h-4 ${resultadoLiquido >= 0 ? "text-emerald-400" : "text-rose-400"}`} />
            </div>
            <div className={`text-2xl font-display font-black italic ${resultadoLiquido >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {fmt(resultadoLiquido)}
            </div>
            <p className="text-xs text-slate-400 mt-1">Margem operacional real</p>
          </Card>
        </div>

        {/* Performance Comercial por Vendedor */}
        <Card className="p-6 bg-[var(--color-surface-elevated)] border-white/5">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" /> Desempenho do Time Comercial
              </h3>
              <p className="text-xs text-slate-400">Conversão de oportunidades e faturamento por profissional</p>
            </div>
          </div>

          {salesBySeller.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-xs">Nenhum dado de vendas no período selecionado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="pb-3">Responsável</th>
                    <th className="pb-3 text-center">Leads</th>
                    <th className="pb-3 text-center">Fechamentos</th>
                    <th className="pb-3 text-center">Taxa de Conversão</th>
                    <th className="pb-3 text-right">Volume Faturado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {salesBySeller.map((seller, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02]">
                      <td className="py-3 font-bold text-white flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px]">
                          {seller.name.substring(0, 2).toUpperCase()}
                        </div>
                        {seller.name}
                      </td>
                      <td className="py-3 text-center font-mono text-slate-300">{seller.leads}</td>
                      <td className="py-3 text-center font-mono text-emerald-400 font-bold">{seller.closed}</td>
                      <td className="py-3 text-center">
                        <Badge variant={seller.rate > 20 ? "success" : seller.rate > 0 ? "warning" : "secondary"}>
                          {seller.rate}%
                        </Badge>
                      </td>
                      <td className="py-3 text-right font-mono font-bold text-white">{fmt(seller.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Produtividade & Operações */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 bg-[var(--color-surface-elevated)] border-white/5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
              <CheckSquare className="w-4 h-4 text-emerald-400" /> Eficiência Operacional
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Tarefas Concluídas no Prazo</span>
                <span className="font-bold text-white">{tasksCompleted} de {tasksTotal}</span>
              </div>
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                  style={{ width: `${taskCompletionRate}%` }} 
                />
              </div>
              <p className="text-xs text-slate-500">
                Índice de entrega das demandas operacionais e follow-ups comerciais.
              </p>
            </div>
          </Card>

          <Card className="p-6 bg-[var(--color-surface-elevated)] border-white/5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
              <Briefcase className="w-4 h-4 text-indigo-400" /> Contratos Vigentes
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Total de Contratos Ativos</span>
                <span className="font-bold text-white">{contratosAtivosCount}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">MRR Contratado</span>
                <span className="font-bold text-emerald-400">
                  {fmt(mrrContratado)}
                </span>
              </div>
            </div>
          </Card>
        </div>

      </div>
    </PageContainer>
  );
}
