import { useMemo, useState } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Repeat2, Users, TrendingDown, Percent, Layers } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { StatCell, StatCellRow } from "./components/StatCell";
import { DrillDownPanel } from "../../components/ui/DrillDownPanel";
import { contractDrillColumns } from "../../components/ui/drillColumns";
import {
  getMRR,
  getLostMRR,
  getActiveCustomers,
  getActiveContractsCount,
  getChurnRate,
  getRevenueProjection,
} from "../../lib/revenueMetrics";

export default function FinanceiroMRR() {
  const { contracts } = useData();
  const { formatCurrency } = useLocalization();

  const { mrr, arr, lostMrr, clientesAtivos, contratosAtivos, churnRate, ticketMedio, ativos } = useMemo(() => {
    const mrr = getMRR(contracts);
    const clientesAtivos = getActiveCustomers(contracts);
    const isActive = (c: typeof contracts[number]) => c.status !== "Cancelado" && c.status !== "Perdido";
    return {
      mrr,
      arr: mrr * 12,
      lostMrr: getLostMRR(contracts),
      clientesAtivos,
      contratosAtivos: getActiveContractsCount(contracts),
      churnRate: getChurnRate(contracts),
      ticketMedio: clientesAtivos > 0 ? mrr / clientesAtivos : 0,
      ativos: contracts.filter(isActive).sort((a, b) => (Number(b.mrr) || 0) - (Number(a.mrr) || 0)),
    };
  }, [contracts]);

  const projection = useMemo(() => getRevenueProjection(contracts), [contracts]);
  const canceladosRows = useMemo(() => (contracts as any[]).filter((c) => c.status === "Cancelado"), [contracts]);
  const [drillCanceladosOpen, setDrillCanceladosOpen] = useState(false);
  const canceladoColumns = contractDrillColumns(formatCurrency, "mrr");

  return (
    <PageContainer
      title="MRR & Receita Recorrente"
      description="Receita recorrente ativa, separada de qualquer projeção — realizado e projetado nunca se misturam aqui."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "MRR & Receita Recorrente" }]}
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <StatCellRow>
          <StatCell label="MRR Ativo" value={formatCurrency(mrr)} icon={Repeat2} />
          <StatCell label="ARR (Projetado a 12m no ritmo atual)" value={formatCurrency(arr)} icon={Layers} />
          <StatCell label="Clientes Ativos" value={clientesAtivos} icon={Users} />
          <StatCell label="Ticket Médio" value={formatCurrency(ticketMedio)} icon={Percent} />
        </StatCellRow>
        <StatCellRow>
          <StatCell label="Contratos Ativos" value={contratosAtivos} icon={Layers} />
          <StatCell label="MRR Perdido (Cancelados)" value={formatCurrency(lostMrr)} icon={TrendingDown} tone={lostMrr > 0 ? "danger" : "neutral"} onClick={() => setDrillCanceladosOpen(true)} />
          <StatCell label="Taxa de Churn (Geral)" value={`${churnRate.toFixed(1)}%`} icon={TrendingDown} tone={churnRate > 0 ? "warning" : "neutral"} />
          <StatCell label="Receita Recorrente / Cliente" value={formatCurrency(ticketMedio)} icon={Percent} />
        </StatCellRow>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Projeção de MRR</h3>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-warning)] border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 rounded px-2 py-0.5">
              Projetado — não é receita recebida
            </span>
          </div>
          {projection.insufficientData ? (
            <p className="text-xs text-[var(--color-text-faint)] mt-4">
              Dados insuficientes para projeção — é preciso pelo menos 2 meses de histórico de contratos.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-1 mb-4">
                Churn mensal observado nos últimos 3 meses: {(projection as Extract<typeof projection, { insufficientData: false }>).monthlyChurnRate}%
              </p>
              <div className="h-40 w-full mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={(projection as Extract<typeof projection, { insufficientData: false }>).months} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="mrrProjectionFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary-blue)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--color-primary-blue)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                    <XAxis dataKey="label" stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-control)" }} itemStyle={{ fontSize: "11px" }} />
                    <Area type="monotone" dataKey="mrr" name="MRR Projetado" stroke="var(--color-primary-blue)" strokeWidth={2.5} fill="url(#mrrProjectionFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {(projection as Extract<typeof projection, { insufficientData: false }>).months.map(m => (
                  <div key={m.month} className="border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] p-3 text-center">
                    <p className="text-[10px] text-[var(--color-text-faint)] mb-1">{m.label}</p>
                    <p className="text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">{formatCurrency(m.mrr)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="p-4 border-b border-[var(--color-border-subtle)]">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Contratos Ativos (Realizado)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                <tr>
                  <th className="px-6 py-3">Cliente</th>
                  <th className="px-6 py-3">Plano</th>
                  <th className="px-6 py-3">Início</th>
                  <th className="px-6 py-3 text-right">MRR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {ativos.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-[var(--color-text-faint)]">Nenhum contrato ativo.</td>
                  </tr>
                ) : ativos.map(c => (
                  <tr key={c.id} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-[var(--color-text-primary)]">{c.client}</td>
                    <td className="px-6 py-3.5 text-[var(--color-text-muted)]">{c.plan}</td>
                    <td className="px-6 py-3.5 text-[var(--color-text-muted)] font-mono">{c.date}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums font-semibold text-[var(--color-text-primary)]">{formatCurrency(Number(c.mrr) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <DrillDownPanel
        isOpen={drillCanceladosOpen}
        onClose={() => setDrillCanceladosOpen(false)}
        title="MRR Perdido (Cancelados)"
        subtitle={`${canceladosRows.length} contrato${canceladosRows.length === 1 ? "" : "s"} cancelado${canceladosRows.length === 1 ? "" : "s"}`}
        rows={canceladosRows}
        columns={canceladoColumns}
      />
    </PageContainer>
  );
}
