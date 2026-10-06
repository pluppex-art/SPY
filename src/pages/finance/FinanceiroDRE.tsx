import { Card } from "../../components/ui/card";
import { Download, Calendar, BarChart3, ArrowUpRight, ArrowDownRight, Minus, LineChart as LineChartIcon, Wallet, TrendingUp, Percent, ListOrdered } from "lucide-react";
import { KpiFilterCard, FilterBar, FilterChips, type KpiItem } from "../../components/ui/kpi-filter-card";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LineChart, Line, CartesianGrid } from "recharts";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";
import { useLocalization } from "../../contexts/LocalizationContext";
import { parseEntryDate } from "./lib/financeDates";
import { calcularDRE, categoriesById, getMonthlyDreSeries, pctDelta, type FinanceCategoryLike, type DreResult } from "./lib/financeEngine";
import { apiFetch } from "../../lib/apiClient";

type Periodo = "mensal" | "trimestral" | "semestral" | "anual" | "personalizado";

interface DreServerSummary extends DreResult {
  entriesCount: number;
  entriesPendentesCount: number;
}

/** YYYY-MM-DD no fuso local — nunca toISOString() (converte pra UTC e pode
 * mudar o dia). Precisa bater exatamente com o dia calendário que
 * periodoRange() calculou. */
function toLocalISODate(d: Date): string {
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Intervalo [início, fim] real do período — nunca "mês atual × 3/6/12".
 * O DRE trimestral/semestral/anual soma os lançamentos que de fato caem
 * nesses meses, não extrapola o mês corrente. */
function periodoRange(periodo: Periodo, hoje: Date, customStart: string, customEnd: string): { start: Date; end: Date } {
  const y = hoje.getFullYear(), m = hoje.getMonth();
  if (periodo === "mensal") return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) };
  if (periodo === "trimestral") { const q = Math.floor(m / 3); return { start: new Date(y, q * 3, 1), end: new Date(y, q * 3 + 3, 0) }; }
  if (periodo === "semestral") { const h = Math.floor(m / 6); return { start: new Date(y, h * 6, 1), end: new Date(y, h * 6 + 6, 0) }; }
  if (periodo === "anual") return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
  return {
    start: customStart ? new Date(customStart + "T00:00:00") : new Date(y, m, 1),
    end: customEnd ? new Date(customEnd + "T23:59:59") : new Date(y, m + 1, 0),
  };
}

export default function FinanceiroDRE() {
  const { financeEntries, financeCategories } = useData();
  const { activeTenantId } = useAuth();
  const { formatCurrency } = useLocalization();

  const [periodo, setPeriodo] = useState<Periodo>("mensal");
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const catMap = useMemo(() => categoriesById(financeCategories as FinanceCategoryLike[]), [financeCategories]);

  const { entriesDoPeriodo, dre: clientDre, dreAnterior, rangeStart, rangeEnd } = useMemo(() => {
    const { start, end } = periodoRange(periodo, new Date(), customStartDate, customEndDate);
    const entriesDoPeriodo = financeEntries.filter(e => {
      const d = parseEntryDate(e.date);
      return !!d && d >= start && d <= end;
    });
    // DRE do dashboard é sempre regime de competência puro: inclui pendentes.
    const dre = calcularDRE(entriesDoPeriodo, catMap);

    // Período anterior = mesma duração, imediatamente antes — pra comparação
    // "vs. período anterior" sem depender de calendário fixo (funciona igual
    // pra mensal/trimestral/semestral/anual/personalizado).
    const duracaoMs = end.getTime() - start.getTime();
    const previousEnd = new Date(start.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - duracaoMs);
    const entriesAnterior = financeEntries.filter(e => {
      const d = parseEntryDate(e.date);
      return !!d && d >= previousStart && d <= previousEnd;
    });
    const dreAnterior = calcularDRE(entriesAnterior, catMap);

    return { entriesDoPeriodo, dre, dreAnterior, rangeStart: toLocalISODate(start), rangeEnd: toLocalISODate(end) };
  }, [financeEntries, catMap, periodo, customStartDate, customEndDate]);

  const monthlySeries = useMemo(() => getMonthlyDreSeries(financeEntries, catMap, 6), [financeEntries, catMap]);

  // O cálculo em si (calcularDRE, com o array financeEntries já carregado
  // no cliente) é a fonte de verdade e o fallback. GET /api/finance/dre-summary
  // faz a mesma soma no servidor, com Redis-SPY (60s), pra telas repetidas
  // no mesmo período não precisarem reprocessar o array inteiro no navegador.
  const [serverSummary, setServerSummary] = useState<DreServerSummary | null>(null);
  useEffect(() => {
    setServerSummary(null);
    if (!activeTenantId) return;
    let cancelled = false;
    apiFetch(`/api/finance/dre-summary?tenantId=${encodeURIComponent(activeTenantId)}&startDate=${rangeStart}&endDate=${rangeEnd}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setServerSummary(data); })
      .catch(() => { /* silencioso — cálculo client-side acima já cobre */ });
    return () => { cancelled = true; };
  }, [activeTenantId, rangeStart, rangeEnd]);

  const dre = serverSummary ?? clientDre;
  const entriesCount = serverSummary?.entriesCount ?? entriesDoPeriodo.length;
  const entriesPendentesCount = serverSummary?.entriesPendentesCount ?? entriesDoPeriodo.filter(e => e.status !== "Pago").length;

  const fmt = (v: number) => formatCurrency(v);

  const receitaDeltaPct = pctDelta(dre.receitaBruta, dreAnterior.receitaBruta);
  const lucroDeltaPct = pctDelta(dre.lucroLiquido, dreAnterior.lucroLiquido);

  const DeltaBadge = ({ pct, invertColor }: { pct: number | null; invertColor?: boolean }) => {
    if (pct === null) return <span className="text-[10px] text-[var(--color-text-faint)]">sem base p/ comparar</span>;
    const positivo = invertColor ? pct <= 0 : pct >= 0;
    const Icon = pct === 0 ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
    return (
      <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${positivo ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
        <Icon className="w-3 h-3" /> {pct > 0 ? "+" : ""}{pct}%
      </span>
    );
  };

  const defaultCustomStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
  const defaultCustomEnd = () => new Date().toISOString().slice(0, 10);
  const limparFiltros = () => { setPeriodo("mensal"); setCustomStartDate(defaultCustomStart()); setCustomEndDate(defaultCustomEnd()); };

  const kpis: KpiItem[] = [
    { label: "Receita Bruta", value: <span className="inline-flex items-baseline gap-2">{fmt(dre.receitaBruta)} <DeltaBadge pct={receitaDeltaPct} /></span>, icon: TrendingUp, tone: "primary", hint: "Receita bruta vs. período anterior" },
    { label: "Lucro Bruto", value: fmt(dre.lucroBruto), icon: Wallet, tone: dre.lucroBruto < 0 ? "danger" : "info" },
    { label: "Lucro Líquido", value: <span className="inline-flex items-baseline gap-2">{fmt(dre.lucroLiquido)} <DeltaBadge pct={lucroDeltaPct} /></span>, icon: Wallet, tone: dre.lucroLiquido >= 0 ? "success" : "danger", hint: "Lucro líquido vs. período anterior" },
    { label: "Margem Líquida", value: `${dre.receitaBruta > 0 ? ((dre.lucroLiquido / dre.receitaBruta) * 100).toFixed(1) : "0"}%`, icon: Percent, tone: dre.lucroLiquido >= 0 ? "accent" : "danger" },
    { label: "Lançamentos", value: entriesCount, icon: ListOrdered, tone: "neutral", hint: `${entriesPendentesCount} pendente(s) incluído(s) — regime de competência` },
  ];

  const chartData = [
    { name: "Receita Bruta", Valor: Math.max(0, dre.receitaBruta), fill: "var(--color-text-primary)" },
    { name: "Lucro Bruto", Valor: Math.max(0, dre.lucroBruto), fill: "var(--color-success)" },
    { name: "Lucro Operacional", Valor: Math.max(0, dre.lucroOperacional), fill: "var(--color-info)" },
    { name: "Lucro Líquido", Valor: Math.max(0, dre.lucroLiquido), fill: dre.lucroLiquido >= 0 ? "var(--color-success)" : "var(--color-danger)" },
  ];

  const dreLines = [
    { name: "(+) Receita Bruta", value: fmt(dre.receitaBruta), isTotal: false, negative: false },
    { name: "(−) Impostos", value: fmt(dre.impostos), isTotal: false, negative: true },
    { name: "(=) LUCRO BRUTO", value: fmt(dre.lucroBruto), isTotal: true, negative: dre.lucroBruto < 0 },
    { name: "(−) Despesas Variáveis", value: fmt(dre.despesasVariaveis), isTotal: false, negative: true },
    { name: "(=) LUCRO OPERACIONAL", value: fmt(dre.lucroOperacional), isTotal: true, negative: dre.lucroOperacional < 0 },
    { name: "(−) Despesas Fixas", value: fmt(dre.despesasFixas), isTotal: false, negative: true },
    { name: "(−) Gastos com Pessoal", value: fmt(dre.gastosComPessoal), isTotal: false, negative: true },
    { name: "(=) LUCRO LÍQUIDO DO EXERCÍCIO", value: fmt(dre.lucroLiquido), isTotal: true, negative: dre.lucroLiquido < 0, isFinal: true },
  ];

  const handleExportXLS = () => {
    const csvContent = "data:text/csv;charset=utf-8,"
      + "Linha DRE;Valor\r\n"
      + dreLines.map(line => `"${line.name.trim()}";"${line.value}"`).join("\r\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `dre_${periodo}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("DRE exportado em CSV.");
  };

  return (
    <PageContainer
      title="DRE Gerencial"
      description="Demonstração de Resultados por regime de competência — soma real dos lançamentos por categoria, inclui pendentes."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "DRE Gerencial" }]}
      actions={
        <div className="flex gap-2 flex-wrap items-center">
          <Button onClick={handleExportXLS} className="h-9 px-4 text-xs font-medium gap-1.5">
            <Download className="w-3.5 h-3.5" /> Exportar
          </Button>
        </div>
      }
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <KpiFilterCard id="finDre" kpis={kpis} activeCount={periodo !== "mensal" ? 1 : 0} onClear={limparFiltros}>
          <FilterBar>
            <FilterChips
              value={periodo}
              onChange={(v) => setPeriodo(v as Periodo)}
              allValue="mensal"
              allLabel="Mensal"
              options={[
                { value: "trimestral", label: "Trimestral" },
                { value: "semestral", label: "Semestral" },
                { value: "anual", label: "Anual" },
                { value: "personalizado", label: "Personalizado" },
              ]}
            />
            {periodo === "personalizado" && (
              <DateRangeFilter
                dateFrom={customStartDate}
                setDateFrom={(v) => setCustomStartDate(v ?? defaultCustomStart())}
                dateTo={customEndDate}
                setDateTo={(v) => setCustomEndDate(v ?? defaultCustomEnd())}
                className="h-[38px]"
              />
            )}
          </FilterBar>
        </KpiFilterCard>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[var(--color-text-faint)]" /> Estrutura de Lucratividade
              </h3>
            </div>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" stroke="var(--color-text-muted)" fontSize={11} width={110} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-control)" }} itemStyle={{ fontSize: "11px" }} />
                  <Bar dataKey="Valor" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6 flex flex-col justify-between">
            <div>
              <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-1">Margem Líquida</p>
              <p className={`text-2xl font-semibold tabular-nums ${dre.lucroLiquido >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
                {dre.receitaBruta > 0 ? ((dre.lucroLiquido / dre.receitaBruta) * 100).toFixed(1) : "0"}%
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-[var(--color-border-subtle)]">
              <p className="text-[11px] text-[var(--color-text-faint)]">
                {entriesCount} lançamento(s) no período · {entriesPendentesCount} pendente(s) incluído(s) — regime de competência
              </p>
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
              <LineChartIcon className="w-4 h-4 text-[var(--color-text-faint)]" /> Tendência — Últimos 6 Meses
            </h3>
          </div>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlySeries} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-control)" }} itemStyle={{ fontSize: "11px" }} />
                <Line type="monotone" dataKey="receitaBruta" name="Receita Bruta" stroke="var(--color-info)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="despesaTotal" name="Despesas" stroke="var(--color-danger)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="lucroLiquido" name="Lucro Líquido" stroke="var(--color-success)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--color-border-subtle)]">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--color-text-faint)]" />
              Demonstração Consolidada ({periodo === "mensal" ? "Mês Atual" : periodo === "trimestral" ? "Trimestre" : periodo === "semestral" ? "Semestre" : periodo === "anual" ? "Ano" : "Período Personalizado"})
            </h3>
            <span className="text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 border border-[var(--color-border-default)] rounded text-[var(--color-text-muted)]">
              Regime de Competência
            </span>
          </div>

          <div className="space-y-1">
            {dreLines.map((line, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between px-4 py-2.5 rounded-[var(--radius-control)] ${
                  line.isTotal ? "bg-[var(--color-surface-sunken)] font-semibold" : ""
                } ${line.isFinal ? "border border-[var(--color-border-default)]" : ""}`}
              >
                <span className={`text-xs ${line.isTotal ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"}`}>{line.name}</span>
                <span className={`font-mono text-xs tabular-nums ${line.isFinal ? "text-sm font-semibold" : ""} ${line.negative ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]"}`}>
                  {!line.isTotal && line.negative ? `(${line.value})` : line.value}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
