import { useMemo, useState } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { FilterBar, FilterChips, type KpiItem } from "../../components/ui/kpi-filter-card";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { KpiDrillChips } from "./components/KpiDrillChips";
import { ArrowUpRight, ArrowDownRight, Scale, Waves, ListOrdered } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { parseEntryDate } from "./lib/financeDates";
import { getRevenueProjection } from "../../lib/revenueMetrics";
import { cn } from "../../lib/utils";
import { DrillDownPanel } from "../../components/ui/DrillDownPanel";
import { financeEntryDrillColumns } from "../../components/ui/drillColumns";

const HORIZONTES = [7, 15, 30, 60, 90] as const;

export default function FinanceiroProjecao() {
  const { financeEntries, contracts } = useData();
  const { formatCurrency } = useLocalization();
  const [horizonte, setHorizonte] = useState<(typeof HORIZONTES)[number]>(30);

  const previstos = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const fim = new Date(now); fim.setDate(fim.getDate() + horizonte);

    return financeEntries
      .filter(f => f.status === "A Vencer")
      .map(f => ({ ...f, dueDate: parseEntryDate(f.date) }))
      .filter(f => f.dueDate && f.dueDate >= now && f.dueDate <= fim);
  }, [financeEntries, horizonte]);

  const { totalReceber, totalPagar, saldoProjetado, grupos, receberRows, pagarRows } = useMemo(() => {
    const receberRows = previstos.filter(f => f.type === "Receber");
    const pagarRows = previstos.filter(f => f.type === "Pagar");
    const totalReceber = receberRows.reduce((s, f) => s + f.value, 0);
    const totalPagar = pagarRows.reduce((s, f) => s + f.value, 0);

    // Horizontes até 30 dias mostram dia a dia; acima disso, agrupado por
    // semana — uma tabela com 90 linhas diárias deixaria de ser legível.
    const agruparPorSemana = horizonte > 30;
    const buckets = new Map<string, { label: string; sortKey: number; receber: number; pagar: number }>();
    for (const f of previstos) {
      if (!f.dueDate) continue;
      let key: string; let label: string; let sortKey: number;
      if (agruparPorSemana) {
        const weekStart = new Date(f.dueDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        key = weekStart.toISOString().slice(0, 10);
        label = `Semana de ${weekStart.toLocaleDateString("pt-BR")}`;
        sortKey = weekStart.getTime();
      } else {
        key = f.dueDate.toISOString().slice(0, 10);
        label = f.dueDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", weekday: "short" });
        sortKey = f.dueDate.getTime();
      }
      const cur = buckets.get(key) || { label, sortKey, receber: 0, pagar: 0 };
      if (f.type === "Receber") cur.receber += f.value; else cur.pagar += f.value;
      buckets.set(key, cur);
    }
    const sorted = Array.from(buckets.values()).sort((a, b) => a.sortKey - b.sortKey);
    let acumulado = 0;
    const grupos = sorted.map(g => {
      acumulado += g.receber - g.pagar;
      return { ...g, saldoDia: g.receber - g.pagar, acumulado };
    });

    return { totalReceber, totalPagar, saldoProjetado: totalReceber - totalPagar, grupos, receberRows, pagarRows };
  }, [previstos, horizonte]);

  const [drillKey, setDrillKey] = useState<"receber" | "pagar" | null>(null);
  const entryColumns = financeEntryDrillColumns(formatCurrency);

  const kpis: KpiItem[] = [
    { label: `Recebimentos Previstos (${horizonte}d)`, value: formatCurrency(totalReceber), icon: ArrowUpRight, tone: "success" },
    { label: `Pagamentos Previstos (${horizonte}d)`, value: formatCurrency(totalPagar), icon: ArrowDownRight, tone: "danger" },
    { label: "Saldo Projetado do Período", value: formatCurrency(saldoProjetado), icon: Scale, tone: saldoProjetado < 0 ? "danger" : "primary" },
    { label: "Lançamentos Previstos", value: previstos.length, icon: ListOrdered, tone: "info" },
  ];

  const mrrProjection = useMemo(() => getRevenueProjection(contracts), [contracts]);

  return (
    <PageContainer
      title="Fluxo de Caixa Projetado"
      description="Recebimentos e pagamentos já lançados como 'A Vencer' — projetado nunca se mistura com o que já foi de fato pago ou recebido."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Projeção de Caixa" }]}
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <FinanceKpiFilter id="finProjecao" kpis={kpis} activeCount={horizonte !== 30 ? 1 : 0} onClear={() => setHorizonte(30)}>
          <FilterBar>
            <FilterChips
              value={String(horizonte)}
              onChange={(v) => setHorizonte(Number(v) as (typeof HORIZONTES)[number])}
              allValue="30"
              allLabel="Próximos 30 dias"
              options={HORIZONTES.filter(h => h !== 30).map(h => ({ value: String(h), label: `Próximos ${h} dias` }))}
            />
          </FilterBar>
          <KpiDrillChips items={[{ label: "Recebimentos previstos", onClick: () => setDrillKey("receber") }, { label: "Pagamentos previstos", onClick: () => setDrillKey("pagar") }]} />
        </FinanceKpiFilter>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
              <Waves className="w-4 h-4 text-[var(--color-text-faint)]" /> Saldo Acumulado Projetado ({horizonte}d)
            </h3>
          </div>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={grupos} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="saldoAcumuladoFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary-blue)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-primary-blue)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--color-text-muted)" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-control)" }} itemStyle={{ fontSize: "11px" }} />
                <ReferenceLine y={0} stroke="var(--color-text-faint)" strokeDasharray="3 3" />
                <Area type="monotone" dataKey="acumulado" name="Saldo Acumulado" stroke="var(--color-primary-blue)" strokeWidth={2.5} fill="url(#saldoAcumuladoFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="p-4 border-b border-[var(--color-border-subtle)]">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Projetado — {horizonte > 30 ? "por Semana" : "por Dia"}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                <tr>
                  <th className="px-6 py-3">{horizonte > 30 ? "Semana" : "Dia"}</th>
                  <th className="px-6 py-3 text-right">A Receber</th>
                  <th className="px-6 py-3 text-right">A Pagar</th>
                  <th className="px-6 py-3 text-right">Saldo do Período</th>
                  <th className="px-6 py-3 text-right">Acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {grupos.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-[var(--color-text-faint)]">Nenhum lançamento previsto neste período.</td>
                  </tr>
                ) : grupos.map(g => (
                  <tr key={g.label} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
                    <td className="px-6 py-3 text-[var(--color-text-primary)] font-medium capitalize">{g.label}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-[var(--color-success)]">{g.receber > 0 ? formatCurrency(g.receber) : "—"}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-[var(--color-danger)]">{g.pagar > 0 ? formatCurrency(g.pagar) : "—"}</td>
                    <td className={cn("px-6 py-3 text-right tabular-nums font-medium", g.saldoDia < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]")}>{formatCurrency(g.saldoDia)}</td>
                    <td className={cn("px-6 py-3 text-right tabular-nums font-semibold", g.acumulado < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]")}>{formatCurrency(g.acumulado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Receita Recorrente Projetada (MRR)</h3>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-warning)] border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 rounded px-2 py-0.5">
              Projetado por mês — não some com a tabela acima
            </span>
          </div>
          {mrrProjection.insufficientData ? (
            <p className="text-xs text-[var(--color-text-faint)] mt-4">Dados insuficientes para projeção — é preciso pelo menos 2 meses de histórico de contratos.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
              {(mrrProjection as Extract<typeof mrrProjection, { insufficientData: false }>).months.map(m => (
                <div key={m.month} className="border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] p-3 text-center">
                  <p className="text-[10px] text-[var(--color-text-faint)] mb-1">{m.label}</p>
                  <p className="text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">{formatCurrency(m.mrr)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <DrillDownPanel
        isOpen={drillKey !== null}
        onClose={() => setDrillKey(null)}
        title={drillKey === "receber" ? `Recebimentos Previstos (${horizonte}d)` : drillKey === "pagar" ? `Pagamentos Previstos (${horizonte}d)` : undefined}
        rows={drillKey === "receber" ? receberRows : drillKey === "pagar" ? pagarRows : []}
        columns={entryColumns}
      />
    </PageContainer>
  );
}
