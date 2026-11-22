import { useMemo, useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { type KpiItem } from "../../components/ui/kpi-filter-card";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { KpiDrillChips } from "./components/KpiDrillChips";
import { FinanceiroFilterBar } from "./components/FinanceiroFilterBar";
import { useFinanceiroFiltro } from "./FinanceiroFilterContext";
import { ArrowUpRight, ArrowDownRight, Scale, Download, Calendar, CalendarDays } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { downloadCsv } from "../../lib/csvExport";
import { parseEntryDate } from "./lib/financeDates";
import { isPago, round2, type FinanceEntryLike } from "./lib/financeEngine";
import { cn } from "../../lib/utils";
import { apiFetch } from "../../lib/apiClient";
import { DrillDownPanel } from "../../components/ui/DrillDownPanel";
import { financeEntryDrillColumns } from "../../components/ui/drillColumns";
import { SecaoCard } from "./components/SecaoCard";


interface DiaFluxo { label: string; dataCompleta: string; entradas: number; saidas: number; saldoDia: number; acumulado: number }
interface FluxoCaixaServerSummary { totalEntradas: number; totalSaidas: number; saldoLiquido: number; fluxoDiario: DiaFluxo[] }

/** YYYY-MM-DD no fuso local — precisa bater com o dia calendário que o
 * cálculo local abaixo usa (nunca toISOString(), que converte pra UTC). */
function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Fluxo de caixa REALIZADO (regime de caixa: só status "Pago") dos últimos
 * N dias — irmão do dashboard "Projeção de Caixa", que é o oposto: só
 * "A Vencer". Os dois nunca se misturam. */
export default function FinanceiroFluxoCaixa() {
  const { financeEntries } = useData();
  const { activeTenantId } = useAuth();
  const { formatCurrency } = useLocalization();
  // Período: o mesmo filtro padrão do Financeiro (regime de caixa nunca passa de hoje).
  const { periodoFrom, periodoTo, label: periodoLabel } = useFinanceiroFiltro();

  const { totalEntradas: clientTotalEntradas, totalSaidas: clientTotalSaidas, saldoLiquido: clientSaldoLiquido, fluxoDiario: clientFluxoDiario, rangeStart, rangeEnd, rowsEntradas, rowsSaidas } = useMemo(() => {
    const hoje = new Date(); hoje.setHours(23, 59, 59, 999);
    const inicio = periodoFrom ? new Date(`${periodoFrom}T00:00:00`) : new Date(1970, 0, 1);
    const fimFiltro = periodoTo ? new Date(`${periodoTo}T23:59:59`) : hoje;
    const fim = fimFiltro < hoje ? fimFiltro : hoje;

    const doPeriodo = (financeEntries as FinanceEntryLike[])
      .filter(isPago)
      .map(e => ({ ...e, __data: parseEntryDate(e.date) }))
      .filter((e): e is FinanceEntryLike & { __data: Date } => !!e.__data && e.__data >= inicio && e.__data <= fim);

    const buckets = new Map<string, { data: Date; entradas: number; saidas: number }>();
    for (const e of doPeriodo) {
      const key = e.__data.toISOString().slice(0, 10);
      const cur = buckets.get(key) || { data: e.__data, entradas: 0, saidas: 0 };
      if (e.type === "Receber") cur.entradas += e.value; else cur.saidas += e.value;
      buckets.set(key, cur);
    }

    const sorted = Array.from(buckets.values()).sort((a, b) => a.data.getTime() - b.data.getTime());
    let acumulado = 0;
    const fluxoDiario = sorted.map(b => {
      const saldoDia = round2(b.entradas - b.saidas);
      acumulado = round2(acumulado + saldoDia);
      return {
        label: b.data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        dataCompleta: b.data.toLocaleDateString("pt-BR"),
        entradas: b.entradas, saidas: b.saidas, saldoDia, acumulado,
      };
    });

    const rowsEntradas = doPeriodo.filter(e => e.type === "Receber");
    const rowsSaidas = doPeriodo.filter(e => e.type === "Pagar");
    const totalEntradas = rowsEntradas.reduce((s, e) => s + e.value, 0);
    const totalSaidas = rowsSaidas.reduce((s, e) => s + e.value, 0);

    return {
      totalEntradas, totalSaidas, saldoLiquido: round2(totalEntradas - totalSaidas), fluxoDiario,
      rangeStart: toLocalISODate(inicio), rangeEnd: toLocalISODate(fim),
      rowsEntradas, rowsSaidas,
    };
  }, [financeEntries, periodoFrom, periodoTo]);

  // GET /api/finance/fluxo-caixa-summary faz a mesma soma dia a dia no
  // servidor, cacheada 60s no Redis-SPY. Cálculo client-side acima
  // continua como fallback.
  const [serverSummary, setServerSummary] = useState<FluxoCaixaServerSummary | null>(null);
  useEffect(() => {
    setServerSummary(null);
    if (!activeTenantId) return;
    let cancelled = false;
    apiFetch(`/api/finance/fluxo-caixa-summary?tenantId=${encodeURIComponent(activeTenantId)}&startDate=${rangeStart}&endDate=${rangeEnd}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setServerSummary(data); })
      .catch(() => { /* silencioso — cálculo client-side acima já cobre */ });
    return () => { cancelled = true; };
  }, [activeTenantId, rangeStart, rangeEnd]);

  const totalEntradas = serverSummary?.totalEntradas ?? clientTotalEntradas;
  const totalSaidas = serverSummary?.totalSaidas ?? clientTotalSaidas;
  const saldoLiquido = serverSummary?.saldoLiquido ?? clientSaldoLiquido;
  const fluxoDiario = serverSummary?.fluxoDiario ?? clientFluxoDiario;

  const [drillKey, setDrillKey] = useState<"entradas" | "saidas" | null>(null);
  const entryColumns = financeEntryDrillColumns(formatCurrency);

  const kpis: KpiItem[] = [
    { label: `Entradas (${periodoLabel})`, value: formatCurrency(totalEntradas), icon: ArrowUpRight, tone: "success", hint: "Só o que já foi pago" },
    { label: `Saídas (${periodoLabel})`, value: formatCurrency(totalSaidas), icon: ArrowDownRight, tone: "danger", hint: "Só o que já foi pago" },
    { label: "Saldo Líquido do Período", value: formatCurrency(saldoLiquido), icon: Scale, tone: saldoLiquido < 0 ? "danger" : "primary" },
    { label: "Dias com Movimentação", value: fluxoDiario.length, icon: CalendarDays, tone: "info" },
  ];

  const handleExport = () => {
    downloadCsv(`fluxo_de_caixa_${periodoFrom ?? "tudo"}_${Date.now()}.csv`, ["Data", "Entradas", "Saídas", "Saldo do Dia", "Acumulado"], fluxoDiario.map(d => [d.dataCompleta, d.entradas, d.saidas, d.saldoDia, d.acumulado]));
  };

  return (
    <PageContainer
      title="Fluxo de Caixa"
      description="Entradas e saídas que já foram efetivamente pagas (regime de caixa): o que já aconteceu de fato, dia a dia."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Fluxo de Caixa" }]}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          <FinanceiroFilterBar />
          <Button variant="outline" onClick={handleExport} className="h-9 px-4 text-xs font-medium gap-1.5"><Download className="w-3.5 h-3.5" /> Exportar CSV</Button>
        </div>
      }
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <FinanceKpiFilter id="finFluxoCaixa" kpis={kpis} activeCount={0} onClear={() => {}}>
          <KpiDrillChips items={[{ label: "Entradas", onClick: () => setDrillKey("entradas") }, { label: "Saídas", onClick: () => setDrillKey("saidas") }]} />
        </FinanceKpiFilter>

        {fluxoDiario.length > 0 && (
          <SecaoCard titulo="Entradas × Saídas × Acumulado" className="print:hidden">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={fluxoDiario}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-muted)", fontSize: 10 }} minTickGap={20} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-muted)", fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-control)" }} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Bar dataKey="entradas" name="Entradas" fill="var(--color-success)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="saidas" name="Saídas" fill="var(--color-danger)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                  <Line type="monotone" dataKey="acumulado" name="Acumulado" stroke="var(--color-primary-blue)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </SecaoCard>
        )}

        <SecaoCard titulo="Movimentações por Dia" icon={Calendar} direita={<><span className="text-[10px] text-[var(--color-text-faint)]">{fluxoDiario.length} dia(s) com movimentação</span></>} semPadding>
          <div className="overflow-x-auto"><table className="min-w-[640px] w-full text-xs text-left">
            <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
              <tr>
                <th className="px-6 py-3">Data</th>
                <th className="px-6 py-3 text-right">Entradas</th>
                <th className="px-6 py-3 text-right">Saídas</th>
                <th className="px-6 py-3 text-right">Saldo do Dia</th>
                <th className="px-6 py-3 text-right">Acumulado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {fluxoDiario.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-[var(--color-text-faint)]">Nenhum lançamento pago neste período.</td></tr>
              ) : [...fluxoDiario].reverse().map(d => (
                <tr key={d.dataCompleta} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
                  <td className="px-6 py-3 font-medium text-[var(--color-text-primary)]">{d.dataCompleta}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-[var(--color-success)]">{d.entradas > 0 ? formatCurrency(d.entradas) : "—"}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-[var(--color-danger)]">{d.saidas > 0 ? formatCurrency(d.saidas) : "—"}</td>
                  <td className={cn("px-6 py-3 text-right tabular-nums font-medium", d.saldoDia < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]")}>{formatCurrency(d.saldoDia)}</td>
                  <td className={cn("px-6 py-3 text-right tabular-nums font-semibold", d.acumulado < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]")}>{formatCurrency(d.acumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </SecaoCard>
      </div>

      <DrillDownPanel
        isOpen={drillKey !== null}
        onClose={() => setDrillKey(null)}
        title={drillKey === "entradas" ? `Entradas (${periodoLabel})` : drillKey === "saidas" ? `Saídas (${periodoLabel})` : undefined}
        rows={drillKey === "entradas" ? rowsEntradas : drillKey === "saidas" ? rowsSaidas : []}
        columns={entryColumns}
      />
    </PageContainer>
  );
}
