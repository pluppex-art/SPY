import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import {
  Calendar, Package, Wallet, Trophy, PieChart as PieIcon, LayoutGrid, FileText, TrendingUp, TrendingDown, Info, Filter,
} from "lucide-react";
import { HexHeatmap } from "../../../components/ui/hex-heatmap";
import { Card } from "../../../components/ui/card";
import { DrillDownPanel } from "../../../components/ui/DrillDownPanel";
import { contractDrillColumns } from "../../../components/ui/drillColumns";
import { useData } from "../../../contexts/DataContext";
import { useLocalization } from "../../../contexts/LocalizationContext";
import type { DashboardData } from "../revenueInsights";
import { resolverPeriodo, serieDiaria, PERIODO_LABEL, type PeriodoOpcao } from "../vendedoresMetrics";
import { computeProdutos, METRICA_PRODUTO_LABEL, type MetricaProduto, type ProdutoLinha } from "../produtosMetrics";

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

function KpiCard({ icon: Icon, label, children, cor }: { icon: typeof Wallet; label: string; children: React.ReactNode; cor: string }) {
  return (
    <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] min-w-0">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${cor}1f` }}>
          <Icon className="w-5 h-5" style={{ color: cor }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-[var(--color-text-muted)] truncate">{label}</p>
          {children}
        </div>
      </div>
    </Card>
  );
}

export default function ProdutosPanel({ dashboard }: { dashboard: DashboardData }) {
  const { contracts, proposals, proposalItems, products } = useData() as any;
  const { formatCurrency } = useLocalization();

  const [periodo, setPeriodo] = useState<PeriodoOpcao>("mes");
  const [produtoSel, setProdutoSel] = useState<string>("todos");
  const [metrica, setMetrica] = useState<MetricaProduto>("receita");
  const [acumulada, setAcumulada] = useState(false);
  const [detalhe, setDetalhe] = useState<ProdutoLinha | null>(null);

  const faixa = useMemo(
    () => resolverPeriodo(periodo, dashboard.dateFrom, dashboard.dateTo),
    [periodo, dashboard.dateFrom, dashboard.dateTo],
  );

  const { linhas, eventos, totalReceita, totalMrr, variacaoTotal, cadastrados } = useMemo(
    () => computeProdutos({ contracts, proposals, proposalItems, products }, faixa),
    [contracts, proposals, proposalItems, products, faixa],
  );

  const visiveis = useMemo(() => linhas.filter((l) => produtoSel === "todos" || l.key === produtoSel), [linhas, produtoSel]);

  const valorDe = (l: ProdutoLinha) => (metrica === "receita" ? l.receita : metrica === "mrr" ? l.mrr : metrica === "total" ? l.total : l.vendas);
  const fmt = (n: number) => (metrica === "vendas" ? `${n}` : formatCurrency(n));
  const totalMetrica = visiveis.reduce((s, l) => s + valorDe(l), 0);
  const rankeados = [...visiveis].sort((a, b) => valorDe(b) - valorDe(a)).filter((l) => valorDe(l) > 0 || visiveis.length <= 8).slice(0, 8);
  const maxValor = Math.max(1, ...rankeados.map(valorDe));
  const top = linhas[0] && linhas[0].receita > 0 ? linhas[0] : null;

  const serie = useMemo(() => {
    const topSeries = [...visiveis].sort((a, b) => valorDe(b) - valorDe(a)).filter((l) => valorDe(l) > 0).slice(0, 4);
    const ev = eventos.map((e) => ({ vendedorKey: e.vendedorKey, iso: e.iso, valor: metrica === "receita" ? e.valor : metrica === "mrr" ? e.mrr : metrica === "total" ? e.total : e.vendas }));
    return { top: topSeries, pontos: serieDiaria(ev, topSeries.map((t) => ({ key: t.key, nome: t.nome })), faixa, acumulada) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveis, eventos, metrica, faixa, acumulada]);

  return (
    <div className="space-y-5">
      <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] space-y-5">
        {/* Cabeçalho + filtros */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider">Receita por produto/serviço</h3>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Quais produtos geram mais receita e margem.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none" />
              <select value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoOpcao)} className={`${selectCls} pl-8`}>
                {(Object.keys(PERIODO_LABEL) as PeriodoOpcao[]).map((p) => <option key={p} value={p}>{PERIODO_LABEL[p]}</option>)}
              </select>
            </label>
            <label className="relative">
              <Package className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none" />
              <select value={produtoSel} onChange={(e) => setProdutoSel(e.target.value)} className={`${selectCls} pl-8 max-w-[220px]`}>
                <option value="todos">Todos os produtos</option>
                {linhas.map((l) => <option key={l.key} value={l.key}>{l.nome}</option>)}
              </select>
            </label>
            <label className="relative">
              <Filter className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none" />
              <select value={metrica} onChange={(e) => setMetrica(e.target.value as MetricaProduto)} className={`${selectCls} pl-8`}>
                {(Object.keys(METRICA_PRODUTO_LABEL) as MetricaProduto[]).map((m) => <option key={m} value={m}>{METRICA_PRODUTO_LABEL[m]}</option>)}
              </select>
            </label>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard icon={Wallet} label="Receita total de produtos" cor="#3b82f6">
            <p className="text-xl font-black text-[var(--color-text-primary)] font-mono truncate">{formatCurrency(totalReceita)}</p>
            <p className="text-[11px] font-semibold">
              {variacaoTotal === null ? <span className="text-[var(--color-text-faint)]">sem período anterior</span> : (
                <span className={variacaoTotal >= 0 ? "text-emerald-500" : "text-rose-500"}>
                  {variacaoTotal >= 0 ? "↗ +" : "↘ "}{variacaoTotal}% vs. período anterior
                </span>
              )}
            </p>
          </KpiCard>
          <KpiCard icon={Trophy} label="Produto com maior receita" cor="#6366f1">
            <p className="text-sm font-black text-[var(--color-text-primary)] truncate" title={top?.nome}>{top ? top.nome : "—"}</p>
            <p className="text-xs font-mono text-[var(--color-text-muted)]">{top ? formatCurrency(top.receita) : "Sem vendas no período"}</p>
          </KpiCard>
          <KpiCard icon={PieIcon} label="Participação do top produto" cor="#f59e0b">
            <p className="text-xl font-black text-[var(--color-text-primary)] font-mono">{top ? `${top.participacao}%` : "—"}</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">da receita total</p>
          </KpiCard>
          <KpiCard icon={LayoutGrid} label="Total de produtos/serviços" cor="#14b8a6">
            <p className="text-xl font-black text-[var(--color-text-primary)] font-mono">{cadastrados}</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">cadastrados</p>
          </KpiCard>
        </div>

        {/* Mapa de calor hexagonal: onde está mais quente / mais frio */}
        {visiveis.filter((l) => valorDe(l) > 0).length > 1 && (
          <Card className="min-w-0 overflow-hidden p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)]">
            <h4 className="text-sm font-black text-[var(--color-text-primary)]">Mapa de calor</h4>
            <p className="text-[11px] text-[var(--color-text-muted)] mb-3">Passe o mouse num hexágono para ver os detalhes. Cada um mostra a participação no total.</p>
            <HexHeatmap
              items={visiveis.filter((l) => valorDe(l) > 0).map((l) => ({ key: l.key, label: l.nome, value: valorDe(l), extra: [{ label: "Vendas", value: String(l.vendas) }, { label: "Ticket médio", value: formatCurrency(l.ticket) }] }))}
              formatValue={fmt}
              metricLabel={METRICA_PRODUTO_LABEL[metrica]}
              maxCols={5}
            />
          </Card>
        )}

        {/* Barras + evolução */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card className="min-w-0 overflow-hidden p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)]">
            <h4 className="text-sm font-black text-[var(--color-text-primary)]">Receita por produto/serviço</h4>
            <p className="text-[11px] text-[var(--color-text-muted)] mb-4">Distribuição da receita no período selecionado.</p>
            {rankeados.length === 0 ? (
              <p className="text-xs text-[var(--color-text-faint)] italic py-10 text-center">Nenhum produto vendido no período.</p>
            ) : (
              <div className="space-y-4">
                {rankeados.map((l) => {
                  const v = valorDe(l);
                  return (
                    <div key={l.key} className="min-w-0">
                      <div className="flex items-baseline justify-between gap-3 min-w-0">
                        <span className="text-xs font-bold text-[var(--color-text-primary)] truncate min-w-0 flex-1" title={l.nome}>{l.nome}</span>
                        <span className="text-xs font-mono font-bold text-[var(--color-text-primary)] shrink-0 whitespace-nowrap">{fmt(v)}</span>
                        <span className="text-[11px] font-bold text-[var(--color-text-muted)] tabular-nums w-12 shrink-0 text-right">
                          {totalMetrica > 0 ? `${Math.round((v / totalMetrica) * 1000) / 10}%` : "0%"}
                        </span>
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
            <div className="flex items-start justify-between gap-3 mb-1">
              <div>
                <h4 className="text-sm font-black text-[var(--color-text-primary)]">Evolução da receita por produto</h4>
                <p className="text-[11px] text-[var(--color-text-muted)] mb-3">{acumulada ? "Receita acumulada" : "Receita diária"} no período selecionado.</p>
              </div>
              <select value={acumulada ? "acumulada" : "diaria"} onChange={(e) => setAcumulada(e.target.value === "acumulada")} className={selectCls}>
                <option value="diaria">Receita diária</option>
                <option value="acumulada">Receita acumulada</option>
              </select>
            </div>
            {serie.top.length === 0 ? (
              <p className="text-xs text-[var(--color-text-faint)] italic py-12 text-center">Sem movimento no período.</p>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie.pontos} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "var(--color-text-faint)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--color-text-faint)" }} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => fmt(v)} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 11 }}
                      formatter={(v: number, k: string) => [fmt(v), serie.top.find((s) => s.key === k)?.nome ?? k]}
                    />
                    <Legend formatter={(k: string) => serie.top.find((s) => s.key === k)?.nome ?? k} wrapperStyle={{ fontSize: 11 }} />
                    {serie.top.map((l) => (
                      <Line key={l.key} type="monotone" dataKey={l.key} stroke={l.cor} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>

        {/* Detalhamento */}
        <Card className="overflow-hidden min-w-0 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)]">
          <div className="p-4 border-b border-[var(--color-border-subtle)]">
            <h4 className="text-sm font-black text-[var(--color-text-primary)]">Detalhamento por produto/serviço</h4>
            <p className="text-[11px] text-[var(--color-text-muted)]">Veja a receita, vendas, ticket médio, participação e margem de cada produto.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2.5">Produto/serviço</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Receita</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Vendas</th>
                  <th className="hidden md:table-cell whitespace-nowrap px-3 py-2.5 text-right">Ticket médio</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Participação</th>
                  <th className="hidden md:table-cell whitespace-nowrap px-3 py-2.5 text-right">Margem</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Tendência</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {visiveis.map((l) => (
                  <tr key={l.key} className="hover:bg-[var(--color-surface-sunken)]/50">
                    <td className="px-3 py-2.5 max-w-[320px]">
                      <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
                        <FileText className="w-4 h-4 shrink-0" style={{ color: l.cor }} />
                        <span className="font-bold text-[var(--color-text-primary)] truncate" title={l.nome}>{l.nome}</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-bold text-[var(--color-text-primary)]">{formatCurrency(l.receita)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{l.vendas}</td>
                    <td className="hidden md:table-cell whitespace-nowrap px-3 py-2.5 text-right font-mono text-[var(--color-text-muted)]">{formatCurrency(l.ticket)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{l.participacao}%</td>
                    <td className="hidden md:table-cell px-3 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{l.margem === null ? "—" : `${l.margem}%`}</td>
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
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--color-text-faint)]">Nenhum produto cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Aviso de MRR */}
        {totalMrr <= 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-[var(--color-primary-blue)]/30 bg-[var(--color-primary-blue)]/8 px-4 py-3">
            <Info className="w-5 h-5 text-[var(--color-primary-blue)] shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-[var(--color-text-primary)]">A receita recorrente (MRR) não possui registros neste período.</p>
              <p className="text-[var(--color-text-muted)] mt-0.5">Não há receita registrada para produtos com cobrança recorrente no período selecionado. Verifique se há vendas com plano recorrente ou ajuste o filtro de período.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-4 py-3 text-xs">
            <Info className="w-5 h-5 text-emerald-500 shrink-0" />
            <p className="text-[var(--color-text-primary)]">
              Receita recorrente (MRR) no período: <strong className="font-mono">{formatCurrency(totalMrr)}</strong> por mês.
            </p>
          </div>
        )}
      </Card>

      <DrillDownPanel
        isOpen={detalhe !== null}
        onClose={() => setDetalhe(null)}
        title={detalhe ? `Vendas — ${detalhe.nome}` : undefined}
        subtitle={detalhe ? `${detalhe.contratos.length} contrato${detalhe.contratos.length === 1 ? "" : "s"} assinado${detalhe.contratos.length === 1 ? "" : "s"} no período · ${formatCurrency(detalhe.receita)}` : undefined}
        rows={detalhe ? detalhe.contratos : []}
        columns={contractDrillColumns(formatCurrency, "totalValue")}
      />
    </div>
  );
}
