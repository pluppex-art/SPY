import { useMemo, useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Download, Printer, ArrowUpRight, ArrowDownRight, Minus, TrendingUp, TrendingDown, Scale, Landmark } from "lucide-react";
import { FilterBar, FilterChips, type KpiItem } from "../../components/ui/kpi-filter-card";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { downloadCsv } from "../../lib/csvExport";
import { parseEntryDate } from "./lib/financeDates";
import { dreTipoDe, categoriesById, saldoDaConta, transferenciasDaConta, type FinanceEntryLike, type FinanceCategoryLike } from "./lib/financeEngine";
import { cn } from "../../lib/utils";
import { apiFetch } from "../../lib/apiClient";

const DRE_TIPO_LABEL: Record<string, string> = { DESPESA_FIXA: "Despesas Fixas", DESPESA_VARIAVEL: "Despesas Variáveis", PESSOAS: "Pessoal", IMPOSTOS: "Impostos" };
const DONUT_COLORS = ["var(--color-success)", "var(--color-info)", "var(--color-warning)", "var(--color-danger)", "#8b5cf6", "#64748b"];

interface MovimentoTop { id: string; description: string | null; value: number }
interface LinhaTipo { label: string; atual: number; anterior: number }
interface DonutItem { name: string; value: number }
interface PerformanceAnualServerSummary {
  receitaAtual: number; receitaAnterior: number; despesaAtual: number; despesaAnterior: number;
  maioresGastos: MovimentoTop[]; maioresReceitas: MovimentoTop[];
  donutReceita: DonutItem[]; donutDespesa: DonutItem[]; linhasTipo: LinhaTipo[];
}

export default function FinanceiroPerformanceAnual() {
  const { financeEntries, financeCategories, financeBankAccounts, financeTransfers } = useData();
  const { activeTenantId } = useAuth();
  const { formatCurrency } = useLocalization();
  const [ano, setAno] = useState(new Date().getFullYear());

  const catMap = useMemo(() => categoriesById(financeCategories as FinanceCategoryLike[]), [financeCategories]);

  const clientDadosAno = useMemo(() => {
    const doAno = (y: number) => (financeEntries as (FinanceEntryLike & any)[]).filter(e => { const d = parseEntryDate(e.date); return d && d.getFullYear() === y && e.status === "Pago"; });
    const atual = doAno(ano);
    const anterior = doAno(ano - 1);

    const somaTipo = (arr: any[], type: "Pagar" | "Receber") => arr.filter(e => e.type === type).reduce((s, e) => s + e.value, 0);
    const receitaAtual = somaTipo(atual, "Receber"), receitaAnterior = somaTipo(anterior, "Receber");
    const despesaAtual = somaTipo(atual, "Pagar"), despesaAnterior = somaTipo(anterior, "Pagar");

    const maioresGastos = [...atual].filter(e => e.type === "Pagar").sort((a, b) => b.value - a.value).slice(0, 5);
    const maioresReceitas = [...atual].filter(e => e.type === "Receber").sort((a, b) => b.value - a.value).slice(0, 5);

    const porCategoriaReceita = new Map<string, number>();
    atual.filter(e => e.type === "Receber").forEach(e => porCategoriaReceita.set(e.category || "Sem categoria", (porCategoriaReceita.get(e.category || "Sem categoria") || 0) + e.value));

    const porTipoDespesa = new Map<string, number>();
    atual.filter(e => e.type === "Pagar").forEach(e => { const t = dreTipoDe(e, catMap); porTipoDespesa.set(t, (porTipoDespesa.get(t) || 0) + e.value); });

    const linhasTipo = (["DESPESA_FIXA", "DESPESA_VARIAVEL", "PESSOAS", "IMPOSTOS"] as const).map(tipo => {
      const val = porTipoDespesa.get(tipo) || 0;
      const valAnt = anterior.filter(e => e.type === "Pagar" && dreTipoDe(e, catMap) === tipo).reduce((s, e) => s + e.value, 0);
      return { label: DRE_TIPO_LABEL[tipo], atual: val, anterior: valAnt };
    });

    return {
      receitaAtual, receitaAnterior, despesaAtual, despesaAnterior,
      maioresGastos, maioresReceitas,
      donutReceita: Array.from(porCategoriaReceita.entries()).map(([name, value]) => ({ name, value })),
      donutDespesa: Array.from(porTipoDespesa.entries()).map(([tipo, value]) => ({ name: DRE_TIPO_LABEL[tipo] || tipo, value })),
      linhasTipo,
    };
  }, [financeEntries, catMap, ano]);

  // GET /api/finance/performance-anual-summary replica o mesmo cálculo no
  // servidor (ano vs. ano anterior, regime de caixa), cacheado 60s no
  // Redis-SPY. Saldo das contas fica de fora (ver saldosContas abaixo) —
  // sempre client-side, mesmo critério da Visão Geral.
  const [serverSummary, setServerSummary] = useState<PerformanceAnualServerSummary | null>(null);
  useEffect(() => {
    setServerSummary(null);
    if (!activeTenantId) return;
    let cancelled = false;
    apiFetch(`/api/finance/performance-anual-summary?tenantId=${encodeURIComponent(activeTenantId)}&ano=${ano}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setServerSummary(data); })
      .catch(() => { /* silencioso — cálculo client-side acima já cobre */ });
    return () => { cancelled = true; };
  }, [activeTenantId, ano]);

  const dadosAno = serverSummary ?? clientDadosAno;

  const saldosContas = useMemo(() => {
    return (financeBankAccounts as any[]).filter(c => !c.arquivada).map(conta => {
      const entriesDaConta = (financeEntries as FinanceEntryLike[]).filter((e: any) => e.conta_bancaria_id === conta.id);
      const { recebidas, enviadas } = transferenciasDaConta(financeTransfers as any[], conta.id);
      const saldo = saldoDaConta({ saldoInicial: conta.saldo_inicial, sinalSaldoInicial: conta.sinal_saldo_inicial, entriesDaConta, transferenciasRecebidasPagas: recebidas, transferenciasEnviadasPagas: enviadas });
      return { nome: conta.nome, saldo };
    });
  }, [financeBankAccounts, financeEntries, financeTransfers]);
  const saldoTotal = saldosContas.reduce((s, c) => s + c.saldo, 0);

  const variacao = (atual: number, anterior: number) => {
    if (anterior === 0 && atual === 0) return { pct: null, valor: 0 };
    if (anterior === 0) return { pct: null, valor: atual };
    return { pct: ((atual - anterior) / anterior) * 100, valor: atual - anterior };
  };
  const varReceita = variacao(dadosAno.receitaAtual, dadosAno.receitaAnterior);
  const varDespesa = variacao(dadosAno.despesaAtual, dadosAno.despesaAnterior);

  const handleExport = () => {
    downloadCsv(`performance_anual_${ano}.csv`, ["Linha", "Valor Atual", "Valor Ano Anterior"], [
      ["Receita Total", dadosAno.receitaAtual, dadosAno.receitaAnterior],
      ["Despesa Total", dadosAno.despesaAtual, dadosAno.despesaAnterior],
      ...dadosAno.linhasTipo.map(l => [l.label, l.atual, l.anterior]),
    ]);
  };

  const anoAtual = new Date().getFullYear();
  const VarBadge = ({ v, invertido }: { v: { pct: number | null; valor: number }; invertido?: boolean }) => {
    const isUp = v.valor > 0;
    if (v.pct === null && v.valor === 0) return <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--color-text-faint)]"><Minus className="w-3 h-3" /> Manteve</span>;
    const bom = invertido ? !isUp : isUp;
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium", bom ? "text-[var(--color-success)]" : "text-[var(--color-warning)]")}>
        {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {v.pct !== null ? `${Math.abs(v.pct).toFixed(0)}%` : formatCurrency(Math.abs(v.valor))}
      </span>
    );
  };
  const resultadoAtual = dadosAno.receitaAtual - dadosAno.despesaAtual;
  const kpis: KpiItem[] = [
    { label: "Receita Total", value: <span className="inline-flex items-baseline gap-2">{formatCurrency(dadosAno.receitaAtual)} <VarBadge v={varReceita} /></span>, icon: TrendingUp, tone: "success", hint: `Variação vs. ${ano - 1}` },
    { label: "Despesa Total", value: <span className="inline-flex items-baseline gap-2">{formatCurrency(dadosAno.despesaAtual)} <VarBadge v={varDespesa} invertido /></span>, icon: TrendingDown, tone: "danger", hint: `Variação vs. ${ano - 1}` },
    { label: "Resultado", value: formatCurrency(resultadoAtual), icon: Scale, tone: resultadoAtual < 0 ? "danger" : "primary", hint: `Receitas menos despesas pagas em ${ano}` },
    { label: "Saldo das Contas", value: formatCurrency(saldoTotal), icon: Landmark, tone: saldoTotal < 0 ? "danger" : "info", hint: "Posição atual (independe do ano)" },
  ];

  return (
    <PageContainer
      title="Performance Anual"
      description="Comparativo do ano com o ano anterior — receitas, despesas, maiores movimentações e saldo das contas."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Relatórios", path: "/app/financeiro/relatorios" }, { label: "Performance Anual" }]}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()} className="h-9 px-3 text-xs font-medium"><Printer className="w-3.5 h-3.5" /></Button>
          <Button onClick={handleExport} className="h-9 px-4 text-xs font-medium gap-1.5"><Download className="w-3.5 h-3.5" /> Exportar CSV</Button>
        </div>
      }
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <FinanceKpiFilter id="finPerformanceAnual" kpis={kpis} activeCount={ano !== anoAtual ? 1 : 0} onClear={() => setAno(anoAtual)}>
          <FilterBar>
            <FilterChips value={String(ano)} onChange={(v) => setAno(Number(v))} allValue={String(anoAtual)} allLabel={String(anoAtual)} options={[String(anoAtual - 1)]} />
          </FilterBar>
        </FinanceKpiFilter>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Maiores Receitas</h3>
            <div className="space-y-2">
              {dadosAno.maioresReceitas.length === 0 ? <p className="text-xs text-[var(--color-text-faint)]">Nenhuma receita no período.</p> : dadosAno.maioresReceitas.map((e: any) => (
                <div key={e.id} className="flex justify-between text-xs py-1.5 border-b border-[var(--color-border-subtle)] last:border-0">
                  <span className="text-[var(--color-text-muted)]">{e.description}</span>
                  <span className="font-semibold tabular-nums text-[var(--color-success)]">{formatCurrency(e.value)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Maiores Gastos</h3>
            <div className="space-y-2">
              {dadosAno.maioresGastos.length === 0 ? <p className="text-xs text-[var(--color-text-faint)]">Nenhum gasto no período.</p> : dadosAno.maioresGastos.map((e: any) => (
                <div key={e.id} className="flex justify-between text-xs py-1.5 border-b border-[var(--color-border-subtle)] last:border-0">
                  <span className="text-[var(--color-text-muted)]">{e.description}</span>
                  <span className="font-semibold tabular-nums text-[var(--color-danger)]">{formatCurrency(e.value)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[{ title: "Receitas por Categoria", data: dadosAno.donutReceita }, { title: "Despesas por Tipo", data: dadosAno.donutDespesa }].map(({ title, data }) => {
            const total = data.reduce((s, d) => s + d.value, 0);
            return (
              <Card key={title} className="p-6">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">{title}</h3>
                {data.length === 0 ? <p className="text-xs text-[var(--color-text-faint)]">Sem dados.</p> : (
                  <div className="flex items-center gap-6">
                    <div className="w-40 h-40 relative shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={data} dataKey="value" innerRadius={45} outerRadius={70} stroke="none">
                            {data.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: number, n: string) => [`${formatCurrency(v)} - ${total > 0 ? ((v / total) * 100).toFixed(0) : 0}%`, n]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-sm font-semibold text-[var(--color-text-primary)]">{formatCurrency(total)}</span>
                      </div>
                    </div>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      {data.map((d, i) => (
                        <div key={d.name} className="flex items-center gap-2 text-[11px]">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                          <span className="text-[var(--color-text-muted)] truncate flex-1">{d.name}</span>
                          <span className="font-medium text-[var(--color-text-primary)] tabular-nums shrink-0">{total > 0 ? ((d.value / total) * 100).toFixed(0) : 0}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        <Card className="overflow-hidden">
          <div className="p-4 border-b border-[var(--color-border-subtle)]"><h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Movimentações em {ano}</h3></div>
          <table className="w-full text-xs text-left">
            <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
              <tr><th className="px-6 py-3">Linha</th><th className="px-6 py-3 text-right">{ano}</th><th className="px-6 py-3 text-right">{ano - 1}</th><th className="px-6 py-3 text-right">Progresso</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              <tr className="bg-[var(--color-surface-sunken)]/50 font-semibold">
                <td className="px-6 py-2.5 text-[var(--color-text-primary)]">Recebimentos</td>
                <td className="px-6 py-2.5 text-right tabular-nums text-[var(--color-success)]">{formatCurrency(dadosAno.receitaAtual)}</td>
                <td className="px-6 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{formatCurrency(dadosAno.receitaAnterior)}</td>
                <td className="px-6 py-2.5 text-right tabular-nums">{dadosAno.receitaAnterior > 0 ? `${(((dadosAno.receitaAtual - dadosAno.receitaAnterior) / dadosAno.receitaAnterior) * 100).toFixed(0)}%` : "—"}</td>
              </tr>
              {dadosAno.linhasTipo.map(l => (
                <tr key={l.label}>
                  <td className="px-6 py-2.5 text-[var(--color-text-muted)] pl-8">{l.label}</td>
                  <td className="px-6 py-2.5 text-right tabular-nums text-[var(--color-text-primary)]">{formatCurrency(l.atual)}</td>
                  <td className="px-6 py-2.5 text-right tabular-nums text-[var(--color-text-faint)]">{formatCurrency(l.anterior)}</td>
                  <td className="px-6 py-2.5 text-right tabular-nums text-[var(--color-text-faint)]">{l.anterior > 0 ? `${(((l.atual - l.anterior) / l.anterior) * 100).toFixed(0)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-6 py-2 text-[10px] text-[var(--color-text-faint)] border-t border-[var(--color-border-subtle)]">Progresso compara o valor pago no ano com o mesmo período do ano anterior.</p>
        </Card>

        <Card className="overflow-hidden">
          <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Saldo das Contas</h3>
            <span className="text-[10px] text-[var(--color-text-faint)]">Posição em {new Date().toLocaleString("pt-BR")}</span>
          </div>
          {saldosContas.length === 0 ? (
            <p className="text-xs text-[var(--color-text-faint)] p-6">Nenhuma conta bancária cadastrada.</p>
          ) : (
            <table className="w-full text-xs text-left">
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {saldosContas.map(c => (
                  <tr key={c.nome}><td className="px-6 py-2.5 text-[var(--color-text-primary)] font-medium">{c.nome}</td><td className="px-6 py-2.5 text-right tabular-nums">{formatCurrency(c.saldo)}</td></tr>
                ))}
                <tr className="bg-[var(--color-surface-sunken)] font-semibold"><td className="px-6 py-2.5">Saldo Total</td><td className="px-6 py-2.5 text-right tabular-nums">{formatCurrency(saldoTotal)}</td></tr>
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
