import { useMemo, useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { StatCell, StatCellRow } from "./components/StatCell";
import { Download, Printer, TrendingUp, TrendingDown, Scale, Award } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { downloadCsv } from "../../lib/csvExport";
import { parseEntryDate } from "./lib/financeDates";
import { apiFetch } from "../../lib/apiClient";
import { DrillDownPanel } from "../../components/ui/DrillDownPanel";
import { financeEntryDrillColumns } from "../../components/ui/drillColumns";

const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const JANELAS = [6, 12, 24] as const;

interface MesPerformance { label: string; receita: number; despesa: number; resultado: number }
interface PerformanceMensalServerSummary {
  meses: MesPerformance[]; receitaTotal: number; despesaTotal: number; resultadoTotal: number; melhorMes: MesPerformance;
}

export default function FinanceiroPerformanceMensal() {
  const { financeEntries } = useData();
  const { activeTenantId } = useAuth();
  const { formatCurrency } = useLocalization();
  const [janela, setJanela] = useState<(typeof JANELAS)[number]>(12);

  const clientMeses = useMemo(() => {
    const now = new Date();
    return Array.from({ length: janela }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (janela - 1 - i), 1);
      const y = d.getFullYear(), m = d.getMonth();
      const doMes = financeEntries.filter(e => { const ed = parseEntryDate(e.date); return ed && ed.getFullYear() === y && ed.getMonth() === m && e.status === "Pago"; });
      const receita = doMes.filter(e => e.type === "Receber").reduce((s, e) => s + e.value, 0);
      const despesa = doMes.filter(e => e.type === "Pagar").reduce((s, e) => s + e.value, 0);
      return { label: `${MONTH_NAMES[m]}/${String(y).slice(2)}`, receita, despesa, resultado: receita - despesa };
    });
  }, [financeEntries, janela]);

  const clientTotais = useMemo(() => {
    const receitaTotal = clientMeses.reduce((s, m) => s + m.receita, 0);
    const despesaTotal = clientMeses.reduce((s, m) => s + m.despesa, 0);
    const melhorMes = clientMeses.reduce((best, m) => (!best || m.resultado > best.resultado ? m : best), clientMeses[0]);
    return { receitaTotal, despesaTotal, resultadoTotal: receitaTotal - despesaTotal, melhorMes };
  }, [clientMeses]);

  // Mesma janela de `clientMeses`, só que como um único filtro combinado
  // sobre `financeEntries` (em vez de concatenar mês a mês) — fonte real
  // pro drill-down de Receitas/Despesas, sempre client-side (nunca o
  // serverSummary, que só traz os totais já agregados).
  const { receitaRows, despesaRows } = useMemo(() => {
    const now = new Date();
    const inicio = new Date(now.getFullYear(), now.getMonth() - (janela - 1), 1);
    const doJanela = financeEntries.filter(e => {
      const ed = parseEntryDate(e.date);
      return ed && ed >= inicio && ed <= now && e.status === "Pago";
    });
    return {
      receitaRows: doJanela.filter(e => e.type === "Receber"),
      despesaRows: doJanela.filter(e => e.type === "Pagar"),
    };
  }, [financeEntries, janela]);

  // GET /api/finance/performance-mensal-summary faz a mesma soma por mês no
  // servidor (regime de caixa), cacheada 60s no Redis-SPY. Cálculo
  // client-side acima continua como fallback.
  const [serverSummary, setServerSummary] = useState<PerformanceMensalServerSummary | null>(null);
  useEffect(() => {
    setServerSummary(null);
    if (!activeTenantId) return;
    let cancelled = false;
    apiFetch(`/api/finance/performance-mensal-summary?tenantId=${encodeURIComponent(activeTenantId)}&janela=${janela}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setServerSummary(data); })
      .catch(() => { /* silencioso — cálculo client-side acima já cobre */ });
    return () => { cancelled = true; };
  }, [activeTenantId, janela]);

  const meses = serverSummary?.meses ?? clientMeses;
  const { receitaTotal, despesaTotal, resultadoTotal, melhorMes } = serverSummary ?? clientTotais;

  const handleExport = () => downloadCsv(`performance_mensal_${Date.now()}.csv`, ["Mês", "Receitas", "Despesas", "Resultado"], meses.map(m => [m.label, m.receita, m.despesa, m.resultado]));

  const [drillKey, setDrillKey] = useState<"receitas" | "despesas" | null>(null);
  const entryColumns = financeEntryDrillColumns(formatCurrency);

  return (
    <PageContainer
      title="Performance Mensal"
      description={`Receitas, despesas e resultado realizados nos últimos ${janela} meses.`}
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Relatórios", path: "/app/financeiro/relatorios" }, { label: "Performance Mensal" }]}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
            {JANELAS.map(j => (
              <Button key={j} size="sm" variant={janela === j ? "default" : "ghost"} onClick={() => setJanela(j)} className="h-7 px-3 text-xs font-medium">{j}m</Button>
            ))}
          </div>
          <Button variant="outline" onClick={() => window.print()} className="h-9 px-3 text-xs font-medium"><Printer className="w-3.5 h-3.5" /></Button>
          <Button onClick={handleExport} className="h-9 px-4 text-xs font-medium gap-1.5"><Download className="w-3.5 h-3.5" /> Exportar CSV</Button>
        </div>
      }
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <StatCellRow>
          <StatCell label={`Receitas (${janela}m)`} value={formatCurrency(receitaTotal)} icon={TrendingUp} tone="success" onClick={() => setDrillKey("receitas")} />
          <StatCell label={`Despesas (${janela}m)`} value={formatCurrency(despesaTotal)} icon={TrendingDown} tone="danger" onClick={() => setDrillKey("despesas")} />
          <StatCell label={`Resultado (${janela}m)`} value={formatCurrency(resultadoTotal)} icon={Scale} tone={resultadoTotal < 0 ? "danger" : "neutral"} />
          <StatCell label="Melhor Mês" value={melhorMes ? formatCurrency(melhorMes.resultado) : "—"} hint={melhorMes?.label} icon={Award} />
        </StatCellRow>

        <Card className="p-6">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={meses}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} tickFormatter={(v) => `${v / 1000}k`} width={40} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-control)" }} />
                <Line type="monotone" dataKey="receita" name="Receitas" stroke="var(--color-success)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="despesa" name="Despesas" stroke="var(--color-danger)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="resultado" name="Resultado" stroke="var(--color-text-primary)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
              <tr><th className="px-6 py-3">Mês</th><th className="px-6 py-3 text-right">Receitas</th><th className="px-6 py-3 text-right">Despesas</th><th className="px-6 py-3 text-right">Resultado</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {meses.map(m => (
                <tr key={m.label} className="hover:bg-[var(--color-surface-sunken)]/50">
                  <td className="px-6 py-3 font-medium text-[var(--color-text-primary)]">{m.label}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-[var(--color-success)]">{formatCurrency(m.receita)}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-[var(--color-danger)]">{formatCurrency(m.despesa)}</td>
                  <td className={`px-6 py-3 text-right tabular-nums font-semibold ${m.resultado < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]"}`}>{formatCurrency(m.resultado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <DrillDownPanel
        isOpen={drillKey !== null}
        onClose={() => setDrillKey(null)}
        title={drillKey === "receitas" ? `Receitas (${janela}m)` : drillKey === "despesas" ? `Despesas (${janela}m)` : undefined}
        rows={drillKey === "receitas" ? receitaRows : drillKey === "despesas" ? despesaRows : []}
        columns={entryColumns}
      />
    </PageContainer>
  );
}
