import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { AlertTriangle, Users, Receipt, Clock } from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { parseEntryDate, daysBetween } from "./lib/financeDates";
import { StatCell, StatCellRow } from "./components/StatCell";
import { apiFetch } from "../../lib/apiClient";
import { DrillDownPanel } from "../../components/ui/DrillDownPanel";
import { financeEntryDrillColumns } from "../../components/ui/drillColumns";

interface InadimplenciaServerSummary {
  vencidosCount: number; totalVencido: number; clientesUnicos: number; atrasoMedio: number;
  buckets: { id: string; label: string; count: number; value: number }[];
  porCliente: { cliente: string; titulos: number; valor: number; maiorAtraso: number }[];
}

const AGING_BUCKETS = [
  { id: "1-7", label: "1–7 dias", min: 1, max: 7, color: "#fbbf24" },
  { id: "8-30", label: "8–30 dias", min: 8, max: 30, color: "#f59e0b" },
  { id: "31-60", label: "31–60 dias", min: 31, max: 60, color: "#f97316" },
  { id: "61-90", label: "61–90 dias", min: 61, max: 90, color: "#f43f5e" },
  { id: "90+", label: "+90 dias", min: 91, max: Infinity, color: "#be123c" },
];

function bucketFor(dias: number) {
  return AGING_BUCKETS.find(b => dias >= b.min && dias <= b.max) ?? AGING_BUCKETS[AGING_BUCKETS.length - 1];
}

export default function FinanceiroInadimplencia() {
  const { financeEntries } = useData();
  const { activeTenantId } = useAuth();
  const { formatCurrency } = useLocalization();

  // KPIs + aging + agrupamento por cliente vêm de um cache no Redis-SPY
  // quando disponível (GET /api/finance/inadimplencia-summary) — mesma
  // fórmula. Puramente aditivo: cálculo client-side abaixo é o fallback.
  const [serverSummary, setServerSummary] = useState<InadimplenciaServerSummary | null>(null);
  useEffect(() => {
    setServerSummary(null);
    if (!activeTenantId) return;
    let cancelled = false;
    apiFetch(`/api/finance/inadimplencia-summary?tenantId=${encodeURIComponent(activeTenantId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setServerSummary(data); })
      .catch(() => { /* silencioso — cálculo client-side abaixo já cobre */ });
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const clientSide = useMemo(() => {
    const now = new Date();
    const vencidos = financeEntries
      .filter(f => f.type === "Receber" && f.status === "Atrasado")
      .map(f => {
        const due = parseEntryDate(f.date);
        const dias = due ? Math.max(0, daysBetween(due, now)) : 0;
        return { ...f, dias };
      });

    const totalVencido = vencidos.reduce((s, f) => s + f.value, 0);
    const clientesUnicos = new Set(vencidos.map(f => f.counterparty || "Sem cliente identificado")).size;
    const atrasoMedio = vencidos.length > 0 ? vencidos.reduce((s, f) => s + f.dias, 0) / vencidos.length : 0;

    const buckets = AGING_BUCKETS.map(b => {
      const items = vencidos.filter(f => bucketFor(f.dias).id === b.id);
      return { ...b, count: items.length, value: items.reduce((s, f) => s + f.value, 0) };
    });

    const byClient = new Map<string, { titulos: number; valor: number; maiorAtraso: number }>();
    for (const f of vencidos) {
      const key = f.counterparty || "Sem cliente identificado";
      const cur = byClient.get(key) || { titulos: 0, valor: 0, maiorAtraso: 0 };
      cur.titulos += 1;
      cur.valor += f.value;
      cur.maiorAtraso = Math.max(cur.maiorAtraso, f.dias);
      byClient.set(key, cur);
    }
    const porCliente = Array.from(byClient.entries())
      .map(([cliente, v]) => ({ cliente, ...v }))
      .sort((a, b) => b.valor - a.valor);

    return { vencidosCount: vencidos.length, totalVencido, clientesUnicos, atrasoMedio, buckets, porCliente, vencidos };
  }, [financeEntries]);

  const { vencidosCount, totalVencido, clientesUnicos, atrasoMedio, buckets, porCliente } = serverSummary ?? clientSide;
  // Lista real pro drill-down vem sempre do cálculo client-side (nunca do
  // serverSummary, que só traz os números já agregados, sem os registros).
  const { vencidos } = clientSide;

  const [drillOpen, setDrillOpen] = useState(false);
  const entryColumns = financeEntryDrillColumns(formatCurrency);

  const maxBucketValue = Math.max(1, ...buckets.map(b => b.value));

  return (
    <PageContainer
      title="Inadimplência"
      description="Cobranças vencidas, por cliente e por faixa de atraso."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Inadimplência" }]}
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <StatCellRow>
          <StatCell label="Total Vencido" value={formatCurrency(totalVencido)} icon={AlertTriangle} tone={totalVencido > 0 ? "danger" : "neutral"} onClick={() => setDrillOpen(true)} />
          <StatCell label="Cobranças Vencidas" value={vencidosCount} icon={Receipt} onClick={() => setDrillOpen(true)} />
          <StatCell label="Clientes Inadimplentes" value={clientesUnicos} icon={Users} />
          <StatCell label="Atraso Médio" value={`${atrasoMedio.toFixed(0)} dias`} icon={Clock} />
        </StatCellRow>

        <Card className="p-6">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Aging de Recebimento</h3>
          {vencidosCount === 0 ? (
            <p className="text-xs text-[var(--color-text-faint)]">Nenhuma cobrança vencida no momento.</p>
          ) : (
            <div className="space-y-3">
              {buckets.map(b => (
                <div key={b.id} className="flex items-center gap-4">
                  <span className="w-20 shrink-0 text-xs font-medium text-[var(--color-text-muted)]">{b.label}</span>
                  <div className="flex-1 h-6 bg-[var(--color-surface-sunken)] rounded-[var(--radius-control)] overflow-hidden">
                    {b.value > 0 && (
                      <div
                        className="h-full rounded-[var(--radius-control)] flex items-center justify-end px-2 transition-all duration-500"
                        style={{ width: `${Math.max(4, (b.value / maxBucketValue) * 100)}%`, backgroundColor: AGING_BUCKETS.find(ab => ab.id === b.id)?.color }}
                      >
                        <span className="text-[10px] font-semibold text-white tabular-nums">{formatCurrency(b.value)}</span>
                      </div>
                    )}
                  </div>
                  <span className="w-16 shrink-0 text-right text-[11px] text-[var(--color-text-faint)] tabular-nums">{b.count} título(s)</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="p-4 border-b border-[var(--color-border-subtle)]">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Por Cliente</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                <tr>
                  <th className="px-6 py-3">Cliente</th>
                  <th className="px-6 py-3 text-right">Títulos</th>
                  <th className="px-6 py-3 text-right">Valor Vencido</th>
                  <th className="px-6 py-3 text-right">Maior Atraso</th>
                  <th className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {porCliente.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-[var(--color-text-faint)]">Nenhuma pendência crítica no momento.</td>
                  </tr>
                ) : porCliente.map(row => (
                  <tr key={row.cliente} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-[var(--color-text-primary)]">{row.cliente}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums text-[var(--color-text-muted)]">{row.titulos}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums font-semibold text-[var(--color-danger)]">{formatCurrency(row.valor)}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums text-[var(--color-text-muted)]">{row.maiorAtraso} dias</td>
                    <td className="px-6 py-3.5 text-right">
                      <Link to="/app/financeiro/cobrancas" className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:underline text-[11px] font-medium">
                        Ver cobranças
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <DrillDownPanel
        isOpen={drillOpen}
        onClose={() => setDrillOpen(false)}
        title="Cobranças Vencidas"
        subtitle={`${vencidos.length} cobrança${vencidos.length === 1 ? "" : "s"} · ${formatCurrency(totalVencido)}`}
        rows={vencidos}
        columns={entryColumns}
      />
    </PageContainer>
  );
}
