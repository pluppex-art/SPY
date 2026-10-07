import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { FilterBar, FilterSearch, type KpiItem } from "../../components/ui/kpi-filter-card";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import {
  PieChart, Waves, LineChart, Repeat2, AlertTriangle, Inbox, TrendingDown,
  TrendingUp, Wallet, Target, ArrowUpRight, Calendar, Users, Truck,
  BarChart3, Landmark, Search, ChevronRight, Scale, type LucideIcon,
} from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { saldoDaConta, transferenciasDaConta, categoriesById, getMonthlyDreSeries, pctDelta, type FinanceEntryLike, type FinanceCategoryLike } from "./lib/financeEngine";
import { parseEntryDate } from "./lib/financeDates";
import { useFinanceiroFiltro } from "./FinanceiroFilterContext";
import { FinancePeriodFilter } from "./components/FinancePeriodFilter";
import { cn } from "../../lib/utils";

interface ReportLink { title: string; href: string; icon: LucideIcon; }
interface ReportGroup { title: string; tone: "danger" | "success" | "info" | "neutral"; reports: ReportLink[]; }

const TONE_BADGE: Record<ReportGroup["tone"], string> = {
  danger: "bg-[var(--color-danger)]/10 text-[var(--color-danger)]",
  success: "bg-[var(--color-success)]/10 text-[var(--color-success)]",
  info: "bg-[var(--color-info)]/10 text-[var(--color-info)]",
  neutral: "bg-[var(--color-text-muted)]/10 text-[var(--color-text-muted)]",
};

const TONE_DOT: Record<ReportGroup["tone"], string> = {
  danger: "bg-[var(--color-danger)]",
  success: "bg-[var(--color-success)]",
  info: "bg-[var(--color-info)]",
  neutral: "bg-[var(--color-text-muted)]",
};

const GROUPS: ReportGroup[] = [
  {
    title: "Despesas",
    tone: "danger",
    reports: [
      { title: "Por Descrição", href: "/app/financeiro/relatorios/despesas-descricao", icon: TrendingDown },
      { title: "Por Dia", href: "/app/financeiro/relatorios/despesas-dia", icon: Calendar },
      { title: "Por Tipo", href: "/app/financeiro/relatorios/despesas-tipo", icon: PieChart },
      { title: "Por Categoria", href: "/app/financeiro/relatorios/despesas-categoria", icon: BarChart3 },
      { title: "Por Tags", href: "/app/financeiro/relatorios/despesas-tags", icon: Target },
      { title: "Por Centro de Custo", href: "/app/financeiro/relatorios/despesas-centro-custo", icon: Target },
      { title: "Pago a…", href: "/app/financeiro/relatorios/despesas-fornecedor", icon: Truck },
    ],
  },
  {
    title: "Recebimentos",
    tone: "success",
    reports: [
      { title: "Por Descrição", href: "/app/financeiro/relatorios/recebimentos-descricao", icon: TrendingUp },
      { title: "Por Dia", href: "/app/financeiro/relatorios/recebimentos-dia", icon: Calendar },
      { title: "Por Categoria", href: "/app/financeiro/relatorios/recebimentos-categoria", icon: BarChart3 },
      { title: "Por Tags", href: "/app/financeiro/relatorios/recebimentos-tags", icon: Target },
      { title: "Por Centro de Custo", href: "/app/financeiro/relatorios/recebimentos-centro-custo", icon: Target },
      { title: "Recebido de…", href: "/app/financeiro/relatorios/recebimentos-cliente", icon: Users },
    ],
  },
  {
    title: "Fluxo de Caixa",
    tone: "info",
    reports: [
      { title: "Extrato", href: "/app/financeiro/relatorios/extrato", icon: Landmark },
      { title: "Fluxo de Caixa Diário", href: "/app/financeiro/fluxo-caixa", icon: Waves },
      { title: "Despesas / Receitas", href: "/app/financeiro/transacoes", icon: ArrowUpRight },
      { title: "Demonstrativo (DRE)", href: "/app/financeiro/dre", icon: PieChart },
      { title: "Performance Mensal", href: "/app/financeiro/relatorios/performance-mensal", icon: LineChart },
      { title: "Performance Anual", href: "/app/financeiro/relatorios/performance-anual", icon: BarChart3 },
      { title: "Saldos", href: "/app/financeiro/bancos", icon: Wallet },
    ],
  },
];

const EXTRAS: ReportLink[] = [
  { title: "Inadimplência", href: "/app/financeiro/inadimplencia", icon: AlertTriangle },
  { title: "MRR & Receita Recorrente", href: "/app/financeiro/mrr", icon: Repeat2 },
  { title: "Fluxo de Caixa Projetado", href: "/app/financeiro/projecao", icon: Waves },
  { title: "Busca Financeira", href: "/app/financeiro/busca", icon: Search },
  { title: "Importar Movimentações", href: "/app/financeiro/importar", icon: Inbox },
];

export default function FinanceiroRelatorios() {
  const { financeEntries, financeBankAccounts, financeTransfers, financeCategories } = useData();
  const { formatCurrency } = useLocalization();
  const { dataInicio, dataFim, label: periodoLabel, preset, setPreset } = useFinanceiroFiltro();
  const [busca, setBusca] = useState("");

  const catMap = useMemo(() => categoriesById(financeCategories as FinanceCategoryLike[]), [financeCategories]);
  const monthlySeries = useMemo(() => getMonthlyDreSeries(financeEntries as FinanceEntryLike[], catMap, 6), [financeEntries, catMap]);

  // KPIs seguem o filtro global de período (barra no topo) — comparados
  // contra o período anterior de MESMA duração, imediatamente antes, pra
  // "Últimos 7 dias" comparar com os 7 dias anteriores, "Mês Atual" com o
  // mês anterior, etc., sem depender de calendário fixo.
  const kpis = useMemo(() => {
    const duracaoMs = dataFim.getTime() - dataInicio.getTime();
    const prevFim = new Date(dataInicio.getTime() - 1);
    const prevInicio = new Date(prevFim.getTime() - duracaoMs);

    const inRange = (e: FinanceEntryLike, start: Date, end: Date) => {
      const d = parseEntryDate(e.date);
      return !!d && d >= start && d <= end;
    };
    const sum = (type: "Receber" | "Pagar", start: Date, end: Date) =>
      (financeEntries as FinanceEntryLike[]).filter(e => e.type === type && e.status === "Pago" && inRange(e, start, end)).reduce((s, e) => s + e.value, 0);

    const receitaPeriodo = sum("Receber", dataInicio, dataFim);
    const despesaPeriodo = sum("Pagar", dataInicio, dataFim);
    const receitaAnterior = sum("Receber", prevInicio, prevFim);
    const despesaAnterior = sum("Pagar", prevInicio, prevFim);
    const resultadoPeriodo = receitaPeriodo - despesaPeriodo;
    const resultadoAnterior = receitaAnterior - despesaAnterior;
    const saldoEmContas = (financeBankAccounts as any[]).filter(c => !c.arquivada).reduce((s, conta) => {
      const entriesDaConta = (financeEntries as FinanceEntryLike[]).filter((e: any) => e.conta_bancaria_id === conta.id);
      const { recebidas, enviadas } = transferenciasDaConta(financeTransfers as any[], conta.id);
      return s + saldoDaConta({ saldoInicial: conta.saldo_inicial, sinalSaldoInicial: conta.sinal_saldo_inicial, entriesDaConta, transferenciasRecebidasPagas: recebidas, transferenciasEnviadasPagas: enviadas });
    }, 0);
    return {
      receitaPeriodo, despesaPeriodo, resultadoPeriodo, saldoEmContas,
      receitaDeltaPct: pctDelta(receitaPeriodo, receitaAnterior),
      despesaDeltaPct: pctDelta(despesaPeriodo, despesaAnterior),
      resultadoDeltaPct: pctDelta(resultadoPeriodo, resultadoAnterior),
    };
  }, [financeEntries, financeBankAccounts, financeTransfers, dataInicio, dataFim]);

  const deltaTxt = (pct: number | null) => (pct === null ? "" : `${pct > 0 ? "+" : ""}${pct}% vs. período anterior`);
  const kpiCards: KpiItem[] = [
    { label: `Receitas (${periodoLabel})`, value: formatCurrency(kpis.receitaPeriodo), icon: TrendingUp, tone: "success", hint: deltaTxt(kpis.receitaDeltaPct) || "Recebido no período" },
    { label: `Despesas (${periodoLabel})`, value: formatCurrency(kpis.despesaPeriodo), icon: TrendingDown, tone: "danger", hint: deltaTxt(kpis.despesaDeltaPct) || "Pago no período" },
    { label: `Resultado (${periodoLabel})`, value: formatCurrency(kpis.resultadoPeriodo), icon: Scale, tone: kpis.resultadoPeriodo < 0 ? "danger" : "primary", hint: deltaTxt(kpis.resultadoDeltaPct) || "Receitas menos despesas pagas" },
    { label: "Saldo em Contas", value: formatCurrency(kpis.saldoEmContas), icon: Wallet, tone: kpis.saldoEmContas < 0 ? "danger" : "info", hint: "Contas bancárias ativas" },
  ];

  const q = busca.trim().toLowerCase();
  const matches = (r: ReportLink, groupTitle?: string) => !q || r.title.toLowerCase().includes(q) || (groupTitle ?? "").toLowerCase().includes(q);
  const gruposVisiveis = GROUPS.map(g => ({ ...g, reports: g.reports.filter(r => matches(r, g.title)) })).filter(g => g.reports.length > 0);
  const extrasVisiveis = EXTRAS.filter(r => matches(r, "Análises & Ferramentas"));
  const activeCount = (preset !== "tudo" ? 1 : 0) + (q ? 1 : 0);

  const mesesComMovimento = useMemo(() => monthlySeries.filter(m => m.receitaBruta > 0 || m.despesaTotal > 0).length, [monthlySeries]);

  return (
    <PageContainer
      title="Central de Relatórios"
      description="Todos os relatórios financeiros disponíveis, organizados por área."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Central de Relatórios" }]}
      actions={<FinancePeriodFilter />}
    >
      <div className="space-y-8 max-w-[1700px] mx-auto pb-12">
        <FinanceKpiFilter id="finRelatorios" kpis={kpiCards} activeCount={activeCount} onClear={() => { setPreset("tudo"); setBusca(""); }}>
          <FilterBar>
            <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar relatório..." />
          </FilterBar>
        </FinanceKpiFilter>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--color-text-faint)]" /> Receita x Despesa — Últimos 6 Meses
            </h3>
            <Link to="/app/financeiro/dre" className="text-[11px] font-semibold text-[var(--color-primary-blue)] hover:underline flex items-center gap-0.5">
              Ver DRE completo <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {mesesComMovimento < 2 && (
            <p className="text-[11px] text-[var(--color-text-faint)] mb-3">
              Ainda há pouco histórico de lançamentos — este gráfico fica mais informativo à medida que os meses passam.
            </p>
          )}
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlySeries} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-control)" }} itemStyle={{ fontSize: "11px" }} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="receitaBruta" name="Receita" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesaTotal" name="Despesa" fill="var(--color-danger)" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="lucroLiquido" name="Lucro Líquido" stroke="var(--color-primary-blue)" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {gruposVisiveis.map(group => (
          <div key={group.title}>
            <div className="flex items-center gap-2 mb-3">
              <span className={cn("w-1.5 h-1.5 rounded-full", TONE_DOT[group.tone])} />
              <h3 className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">{group.title}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {group.reports.map(report => {
                const Icon = report.icon;
                return (
                  <Link key={report.title} to={report.href}>
                    <Card className="p-4 h-full hover:border-[var(--color-text-muted)] hover:shadow-[var(--shadow-panel)] transition-all group flex items-center gap-3">
                      <span className={cn("w-8 h-8 rounded-[var(--radius-control)] flex items-center justify-center shrink-0", TONE_BADGE[group.tone])}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <h4 className="text-xs font-medium text-[var(--color-text-primary)] flex-1">{report.title}</h4>
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-faint)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {extrasVisiveis.length > 0 && <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)]" />
            <h3 className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Análises &amp; Ferramentas</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {extrasVisiveis.map(report => {
              const Icon = report.icon;
              return (
                <Link key={report.title} to={report.href}>
                  <Card className="p-4 h-full hover:border-[var(--color-text-muted)] hover:shadow-[var(--shadow-panel)] transition-all group flex items-center gap-3">
                    <span className={cn("w-8 h-8 rounded-[var(--radius-control)] flex items-center justify-center shrink-0", TONE_BADGE.neutral)}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <h4 className="text-xs font-medium text-[var(--color-text-primary)] flex-1">{report.title}</h4>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-faint)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>}
      </div>
    </PageContainer>
  );
}
