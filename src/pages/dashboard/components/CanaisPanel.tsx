import { useMemo, useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Calendar, Radio, Filter, TrendingUp, TrendingDown, Info } from "lucide-react";
import { HexHeatmap } from "../../../components/ui/hex-heatmap";
import { Card } from "../../../components/ui/card";
import { DrillDownPanel } from "../../../components/ui/DrillDownPanel";
import { contractDrillColumns } from "../../../components/ui/drillColumns";
import { leadDrillColumns } from "../../../components/ui/drillColumns";
import { useData } from "../../../contexts/DataContext";
import { useLocalization } from "../../../contexts/LocalizationContext";
import type { DashboardData } from "../revenueInsights";
import { resolverPeriodo, PERIODO_LABEL, type PeriodoOpcao } from "../vendedoresMetrics";
import { computeCanais, METRICA_CANAL_LABEL, SEM_ORIGEM, type MetricaCanal, type CanalLinha } from "../canaisMetrics";

const selectCls =
  "h-9 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] px-3 text-xs font-semibold text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-blue)] cursor-pointer";

function Tendencia({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[var(--color-text-faint)]">—</span>;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 font-bold whitespace-nowrap ${up ? "text-emerald-500" : "text-rose-500"}`}>
      <Icon className="w-3.5 h-3.5" /> {up ? "+" : ""}{pct}%
    </span>
  );
}

export default function CanaisPanel({ dashboard }: { dashboard: DashboardData }) {
  const { leads, contracts, proposals, proposalItems } = useData() as any;
  const { formatCurrency } = useLocalization();

  const [periodo, setPeriodo] = useState<PeriodoOpcao>("mes");
  const [canalSel, setCanalSel] = useState<string>("todos");
  const [metrica, setMetrica] = useState<MetricaCanal>("receita");
  const [detalhe, setDetalhe] = useState<CanalLinha | null>(null);

  const faixa = useMemo(
    () => resolverPeriodo(periodo, dashboard.dateFrom, dashboard.dateTo),
    [periodo, dashboard.dateFrom, dashboard.dateTo],
  );

  const { linhas, totalReceita, variacaoTotal, vendasSemOrigem } = useMemo(
    () => computeCanais({ leads, contracts, proposals, proposalItems }, faixa),
    [leads, contracts, proposals, proposalItems, faixa],
  );

  const visiveis = useMemo(() => linhas.filter((l) => canalSel === "todos" || l.key === canalSel), [linhas, canalSel]);

  const valorDe = (l: CanalLinha) =>
    metrica === "receita" ? l.receita : metrica === "mrr" ? l.mrr : metrica === "total" ? l.total : metrica === "vendas" ? l.vendas : l.leads;
  const fmt = (n: number) => (metrica === "vendas" || metrica === "leads" ? `${n}` : formatCurrency(n));
  const totalMetrica = visiveis.reduce((s, l) => s + valorDe(l), 0);
  const ranqueados = [...visiveis].sort((a, b) => valorDe(b) - valorDe(a)).slice(0, 8);
  const maxValor = Math.max(1, ...ranqueados.map(valorDe));
  const donut = visiveis.filter((l) => valorDe(l) > 0);
  const pctDe = (v: number) => (totalMetrica > 0 ? `${Math.round((v / totalMetrica) * 1000) / 10}%` : "0%");

  return (
    <div className="space-y-5">
      <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] space-y-5">
        {/* Cabeçalho + filtros */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider">Receita por canal de origem</h3>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Qual canal traz mais receita pro seu negócio.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none" />
              <select value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoOpcao)} className={`${selectCls} pl-8`}>
                {(Object.keys(PERIODO_LABEL) as PeriodoOpcao[]).map((p) => <option key={p} value={p}>{PERIODO_LABEL[p]}</option>)}
              </select>
            </label>
            <label className="relative">
              <Radio className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none" />
              <select value={canalSel} onChange={(e) => setCanalSel(e.target.value)} className={`${selectCls} pl-8 max-w-[220px]`}>
                <option value="todos">Todos os canais</option>
                {linhas.map((l) => <option key={l.key} value={l.key}>{l.nome}</option>)}
              </select>
            </label>
            <label className="relative">
              <Filter className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none" />
              <select value={metrica} onChange={(e) => setMetrica(e.target.value as MetricaCanal)} className={`${selectCls} pl-8`}>
                {(Object.keys(METRICA_CANAL_LABEL) as MetricaCanal[]).map((m) => <option key={m} value={m}>{METRICA_CANAL_LABEL[m]}</option>)}
              </select>
            </label>
          </div>
        </div>

        {/* Mapa de calor hexagonal: onde está mais quente / mais frio */}
        {visiveis.filter((l) => valorDe(l) > 0).length > 1 && (
          <Card className="min-w-0 overflow-hidden p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)]">
            <h4 className="text-sm font-black text-[var(--color-text-primary)]">Mapa de calor</h4>
            <p className="text-[11px] text-[var(--color-text-muted)] mb-3">Passe o mouse num hexágono para ver os detalhes. Cada um mostra a participação no total.</p>
            <HexHeatmap
              items={visiveis.filter((l) => valorDe(l) > 0).map((l) => ({ key: l.key, label: l.nome, value: valorDe(l), extra: [] }))}
              formatValue={fmt}
              metricLabel={METRICA_CANAL_LABEL[metrica].split(" (")[0]}
              maxCols={5}
            />
          </Card>
        )}

        {/* Barras + distribuição */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card className="min-w-0 overflow-hidden p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)]">
            <h4 className="text-sm font-black text-[var(--color-text-primary)]">Receita por canal de origem</h4>
            <p className="text-[11px] text-[var(--color-text-muted)] mb-4">Comparativo da receita gerada por cada canal no período selecionado.</p>
            {ranqueados.length === 0 ? (
              <p className="text-xs text-[var(--color-text-faint)] italic py-10 text-center">Nenhum canal com dados no período.</p>
            ) : (
              <div className="space-y-4">
                {ranqueados.map((l) => {
                  const v = valorDe(l);
                  return (
                    <div key={l.key} className="min-w-0">
                      <div className="flex items-baseline justify-between gap-3 min-w-0">
                        <span className="text-xs font-bold text-[var(--color-text-primary)] truncate min-w-0 flex-1" title={l.nome}>{l.nome}</span>
                        <span className="text-xs font-mono font-bold text-[var(--color-text-primary)] shrink-0 whitespace-nowrap">{fmt(v)}</span>
                        <span className="text-[11px] font-bold text-[var(--color-text-muted)] tabular-nums w-12 shrink-0 text-right">{pctDe(v)}</span>
                      </div>
                      <div className="h-2 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden mt-1.5">
                        <div className="h-full rounded-full" style={{ width: `${v > 0 ? Math.max(3, (v / maxValor) * 100) : 0}%`, backgroundColor: l.cor }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="min-w-0 overflow-hidden p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)]">
            <h4 className="text-sm font-black text-[var(--color-text-primary)]">Distribuição da receita por canal</h4>
            <p className="text-[11px] text-[var(--color-text-muted)] mb-4">Participação de cada canal na receita total.</p>
            {donut.length === 0 ? (
              <p className="text-xs text-[var(--color-text-faint)] italic py-10 text-center">Sem receita no período.</p>
            ) : (
              <div className="flex flex-col 2xl:flex-row items-center gap-5 min-w-0">
                <div className="relative h-[190px] w-[190px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donut.map((l) => ({ ...l, valor: valorDe(l) }))} cx="50%" cy="50%" innerRadius={62} outerRadius={90} paddingAngle={2} dataKey="valor" stroke="none">
                        {donut.map((l) => <Cell key={l.key} fill={l.cor} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 11 }}
                        formatter={(v: number) => fmt(v)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-base font-black text-[var(--color-text-primary)] font-mono">{fmt(totalMetrica)}</span>
                    <span className="text-[9px] text-[var(--color-text-faint)] font-bold uppercase">{METRICA_CANAL_LABEL[metrica].split(" (")[0]} total</span>
                  </div>
                </div>
                <div className="flex-1 w-full min-w-0 space-y-2">
                  {visiveis.map((l) => (
                    <div key={l.key} className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.cor }} />
                      <span className="text-xs text-[var(--color-text-primary)] font-semibold truncate min-w-0 flex-1" title={l.nome}>{l.nome}</span>
                      <span className="text-xs font-mono text-[var(--color-text-primary)] shrink-0 whitespace-nowrap">{fmt(valorDe(l))}</span>
                      <span className="text-xs font-bold text-[var(--color-text-muted)] tabular-nums w-12 shrink-0 text-right">{pctDe(valorDe(l))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Detalhamento */}
        <Card className="overflow-hidden min-w-0 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)]">
          <div className="p-4 border-b border-[var(--color-border-subtle)] flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="text-sm font-black text-[var(--color-text-primary)]">Detalhamento por canal de origem</h4>
              <p className="text-[11px] text-[var(--color-text-muted)]">Veja a receita, leads, vendas, conversão e ticket médio de cada canal.</p>
            </div>
            {variacaoTotal !== null && (
              <span className={`text-[11px] font-bold ${variacaoTotal >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                Receita total {formatCurrency(totalReceita)} · {variacaoTotal >= 0 ? "+" : ""}{variacaoTotal}% vs. período anterior
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2.5 w-8">#</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Canal</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Receita</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Participação</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Leads</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Vendas</th>
                  <th className="hidden md:table-cell whitespace-nowrap px-3 py-2.5 text-right">Conversão</th>
                  <th className="hidden md:table-cell whitespace-nowrap px-3 py-2.5 text-right">Ticket médio</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Tendência</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {visiveis.map((l, i) => (
                  <tr key={l.key} className="hover:bg-[var(--color-surface-sunken)]/50">
                    <td className="px-3 py-2.5">
                      <span className="w-5 h-5 rounded-full text-[10px] font-black text-white flex items-center justify-center" style={{ backgroundColor: l.cor }}>{i + 1}</span>
                    </td>
                    <td className="px-3 py-2.5 font-bold text-[var(--color-text-primary)] max-w-[220px] truncate" title={l.nome}>{l.nome}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-bold text-[var(--color-text-primary)]">{formatCurrency(l.receita)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{l.participacao}%</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{l.leads}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-[var(--color-text-primary)]">{l.vendas}</td>
                    <td className="hidden md:table-cell px-3 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{l.conversao === null ? "—" : `${l.conversao}%`}</td>
                    <td className="hidden md:table-cell whitespace-nowrap px-3 py-2.5 text-right font-mono text-[var(--color-text-muted)]">{formatCurrency(l.ticket)}</td>
                    <td className="px-3 py-2.5"><Tendencia pct={l.tendencia} /></td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button" onClick={() => setDetalhe(l)}
                        className="whitespace-nowrap px-3 h-7 rounded-lg border border-[var(--color-border-default)] text-[11px] font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] cursor-pointer"
                      >
                        Ver detalhes
                      </button>
                    </td>
                  </tr>
                ))}
                {visiveis.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-[var(--color-text-faint)]">Nenhum canal encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Aviso de atribuição */}
        <div className="flex items-start gap-3 rounded-xl border border-[var(--color-primary-blue)]/30 bg-[var(--color-primary-blue)]/8 px-4 py-3">
          <Info className="w-5 h-5 text-[var(--color-primary-blue)] shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="text-[var(--color-text-primary)]">
              <strong>Confira a atribuição:</strong> os totais por canal dependem da origem registrada no lead de cada venda.
              {vendasSemOrigem > 0 && ` ${vendasSemOrigem} venda${vendasSemOrigem === 1 ? "" : "s"} está${vendasSemOrigem === 1 ? "" : "ão"} em "${SEM_ORIGEM}" — preencha a origem do lead para contar no canal certo.`}
            </p>
          </div>
        </div>
      </Card>

      <DrillDownPanel
        isOpen={detalhe !== null}
        onClose={() => setDetalhe(null)}
        title={detalhe ? `${detalhe.contratos.length > 0 ? "Vendas" : "Leads"} — ${detalhe.nome}` : undefined}
        subtitle={detalhe
          ? detalhe.contratos.length > 0
            ? `${detalhe.contratos.length} contrato${detalhe.contratos.length === 1 ? "" : "s"} assinado${detalhe.contratos.length === 1 ? "" : "s"} no período · ${formatCurrency(detalhe.receita)}`
            : `${detalhe.leadsDoCanal.length} lead${detalhe.leadsDoCanal.length === 1 ? "" : "s"} criado${detalhe.leadsDoCanal.length === 1 ? "" : "s"} no período, sem venda ainda`
          : undefined}
        rows={detalhe ? (detalhe.contratos.length > 0 ? detalhe.contratos : detalhe.leadsDoCanal) : []}
        columns={detalhe && detalhe.contratos.length === 0 ? leadDrillColumns(formatCurrency) : contractDrillColumns(formatCurrency, "totalValue")}
      />
    </div>
  );
}
