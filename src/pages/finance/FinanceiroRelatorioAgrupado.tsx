import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { KpiFilterCard, FilterBar, FilterSearch, FilterChips, type KpiItem } from "../../components/ui/kpi-filter-card";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import { KpiDrillChips } from "./components/KpiDrillChips";
import { Download, Printer, Hash, Layers, TrendingUp, Crown } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from "recharts";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { downloadCsv } from "../../lib/csvExport";
import { parseEntryDate } from "./lib/financeDates";
import { dreTipoDe, categoriesById, type FinanceEntryLike, type FinanceCategoryLike } from "./lib/financeEngine";
import { DrillDownPanel } from "../../components/ui/DrillDownPanel";
import { financeEntryDrillColumns } from "../../components/ui/drillColumns";

type Dimension = "description" | "day" | "dreTipo" | "category" | "tags" | "centroCusto" | "counterparty";
type Periodo = "mes" | "trimestre" | "ano" | "tudo" | "personalizado";
type Status = "Pago" | "A Vencer" | "Atrasado";

interface ReportConfig {
  type: "Pagar" | "Receber";
  dimension: Dimension;
  title: string;
  description: string;
  groupLabel: string;
}

const DRE_TIPO_LABEL: Record<string, string> = {
  DESPESA_FIXA: "Despesa Fixa",
  DESPESA_VARIAVEL: "Despesa Variável",
  PESSOAS: "Pessoas",
  IMPOSTOS: "Impostos",
  RECEBIMENTO: "Recebimento",
};

const REPORT_CONFIGS: Record<string, ReportConfig> = {
  "despesas-descricao": { type: "Pagar", dimension: "description", title: "Despesas por Descrição", description: "Total pago/previsto agrupado por descrição do lançamento.", groupLabel: "Descrição" },
  "despesas-dia": { type: "Pagar", dimension: "day", title: "Despesas por Dia", description: "Total de despesas por dia do período.", groupLabel: "Dia" },
  "despesas-tipo": { type: "Pagar", dimension: "dreTipo", title: "Despesas por Tipo", description: "Total agrupado por linha do DRE (fixa, variável, pessoal, impostos).", groupLabel: "Tipo" },
  "despesas-categoria": { type: "Pagar", dimension: "category", title: "Despesas por Categoria", description: "Total agrupado por categoria financeira.", groupLabel: "Categoria" },
  "despesas-tags": { type: "Pagar", dimension: "tags", title: "Despesas por Tags", description: "Total agrupado por marcador — um lançamento com várias tags aparece em cada uma.", groupLabel: "Tag" },
  "despesas-centro-custo": { type: "Pagar", dimension: "centroCusto", title: "Despesas por Centro de Custo", description: "Total agrupado por centro de custo.", groupLabel: "Centro de Custo" },
  "despesas-fornecedor": { type: "Pagar", dimension: "counterparty", title: "Pago a…", description: "Total agrupado por fornecedor/beneficiário.", groupLabel: "Fornecedor" },
  "recebimentos-descricao": { type: "Receber", dimension: "description", title: "Recebimentos por Descrição", description: "Total recebido/previsto agrupado por descrição do lançamento.", groupLabel: "Descrição" },
  "recebimentos-dia": { type: "Receber", dimension: "day", title: "Recebimentos por Dia", description: "Total de recebimentos por dia do período.", groupLabel: "Dia" },
  "recebimentos-categoria": { type: "Receber", dimension: "category", title: "Recebimentos por Categoria", description: "Total agrupado por categoria financeira.", groupLabel: "Categoria" },
  "recebimentos-tags": { type: "Receber", dimension: "tags", title: "Recebimentos por Tags", description: "Total agrupado por marcador — um lançamento com várias tags aparece em cada uma.", groupLabel: "Tag" },
  "recebimentos-centro-custo": { type: "Receber", dimension: "centroCusto", title: "Recebimentos por Centro de Custo", description: "Total agrupado por centro de custo.", groupLabel: "Centro de Custo" },
  "recebimentos-cliente": { type: "Receber", dimension: "counterparty", title: "Recebido de…", description: "Total agrupado por cliente.", groupLabel: "Cliente" },
};

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: "mes", label: "Este Mês" },
  { id: "trimestre", label: "Este Trimestre" },
  { id: "ano", label: "Este Ano" },
  { id: "tudo", label: "Tudo" },
  { id: "personalizado", label: "Personalizado" },
];

const STATUSES: Status[] = ["Pago", "A Vencer", "Atrasado"];

function isInPeriodo(date: Date | null, periodo: Periodo, now: Date, custom: { inicio: string; fim: string }): boolean {
  if (periodo === "tudo") return true;
  if (!date) return false;
  if (periodo === "mes") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  if (periodo === "trimestre") return date.getFullYear() === now.getFullYear() && Math.floor(date.getMonth() / 3) === Math.floor(now.getMonth() / 3);
  if (periodo === "personalizado") {
    const inicio = custom.inicio ? new Date(custom.inicio + "T00:00:00") : null;
    const fim = custom.fim ? new Date(custom.fim + "T23:59:59") : null;
    if (inicio && date < inicio) return false;
    if (fim && date > fim) return false;
    return true;
  }
  return date.getFullYear() === now.getFullYear();
}

export default function FinanceiroRelatorioAgrupado() {
  const { slug } = useParams<{ slug: string }>();
  const config = slug ? REPORT_CONFIGS[slug] : undefined;
  const { financeEntries, financeCategories, financeCentrosCusto } = useData();
  const { formatCurrency } = useLocalization();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [customInicio, setCustomInicio] = useState("");
  const [customFim, setCustomFim] = useState("");
  const [statusAtivos, setStatusAtivos] = useState<Status[]>(["Pago", "A Vencer", "Atrasado"]);
  const [busca, setBusca] = useState("");

  const toggleStatus = (s: Status) => {
    setStatusAtivos(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const catMap = useMemo(() => categoriesById(financeCategories as FinanceCategoryLike[]), [financeCategories]);
  const centroCustoMap = useMemo(() => new Map((financeCentrosCusto as any[]).map(c => [c.id, c.nome])), [financeCentrosCusto]);

  const linhas = useMemo(() => {
    if (!config) return [];
    const now = new Date();
    const base = (financeEntries as (FinanceEntryLike & any)[]).filter(e => {
      if (e.type !== config.type) return false;
      if (!statusAtivos.includes(e.status as Status)) return false;
      return isInPeriodo(parseEntryDate(e.date), periodo, now, { inicio: customInicio, fim: customFim });
    });

    const grupos = new Map<string, { label: string; valor: number; qtd: number; rows: any[] }>();
    const addTo = (key: string, label: string, valor: number, entry: any) => {
      const cur = grupos.get(key) || { label, valor: 0, qtd: 0, rows: [] as any[] };
      cur.valor += valor; cur.qtd += 1; cur.rows.push(entry);
      grupos.set(key, cur);
    };

    for (const e of base) {
      switch (config.dimension) {
        case "description":
          addTo(e.description || "Sem descrição", e.description || "Sem descrição", e.value, e);
          break;
        case "day": {
          const d = parseEntryDate(e.date);
          const key = d ? d.toISOString().slice(0, 10) : "sem-data";
          const label = d ? d.toLocaleDateString("pt-BR") : "Sem data";
          addTo(key, label, e.value, e);
          break;
        }
        case "dreTipo": {
          const tipo = dreTipoDe(e, catMap);
          addTo(tipo, DRE_TIPO_LABEL[tipo] || tipo, e.value, e);
          break;
        }
        case "category":
          addTo(e.category || "Sem categoria", e.category || "Sem categoria", e.value, e);
          break;
        case "tags": {
          const tags: string[] = Array.isArray(e.tags) ? e.tags : [];
          if (tags.length === 0) addTo("__sem_tag__", "Sem tag", e.value, e);
          else tags.forEach(t => addTo(t, t, e.value, e));
          break;
        }
        case "centroCusto": {
          const nome = e.centro_custo_id ? centroCustoMap.get(e.centro_custo_id) : null;
          addTo(nome || "__sem_cc__", nome || "Sem centro de custo", e.value, e);
          break;
        }
        case "counterparty":
          addTo(e.counterparty || "__sem_cp__", e.counterparty || (config.type === "Pagar" ? "Sem fornecedor" : "Sem cliente"), e.value, e);
          break;
      }
    }

    return Array.from(grupos.values()).sort((a, b) => b.valor - a.valor);
  }, [config, financeEntries, catMap, centroCustoMap, periodo, customInicio, customFim, statusAtivos]);

  const linhasFiltradas = useMemo(() => {
    if (!busca.trim()) return linhas;
    const q = busca.trim().toLowerCase();
    return linhas.filter(l => l.label.toLowerCase().includes(q));
  }, [linhas, busca]);

  const total = linhasFiltradas.reduce((s, l) => s + l.valor, 0);
  const qtdTotal = linhasFiltradas.reduce((s, l) => s + l.qtd, 0);
  const media = qtdTotal > 0 ? total / qtdTotal : 0;
  const corBarra = config?.type === "Pagar" ? "var(--color-danger)" : "var(--color-success)";

  const [drillGrupo, setDrillGrupo] = useState<{ label: string; rows: any[] } | null>(null);
  const entryColumns = financeEntryDrillColumns(formatCurrency);

  const chartData = useMemo(() => {
    const top = linhasFiltradas.slice(0, 8).map(l => ({ name: l.label, valor: l.valor }));
    const resto = linhasFiltradas.slice(8).reduce((s, l) => s + l.valor, 0);
    if (resto > 0) top.push({ name: "Outros", valor: resto });
    return top;
  }, [linhasFiltradas]);

  if (!config) {
    return (
      <PageContainer title="Relatório não encontrado" description="">
        <p className="text-sm text-[var(--color-text-muted)]">
          Este relatório não existe. Volte para a <Link to="/app/financeiro/relatorios" className="text-[var(--color-primary-blue)] hover:underline">Central de Relatórios</Link>.
        </p>
      </PageContainer>
    );
  }

  const statusPadrao = statusAtivos.length === STATUSES.length;
  const activeCount = (periodo !== "mes" ? 1 : 0) + (!statusPadrao ? 1 : 0) + (busca.trim() ? 1 : 0);
  const limparFiltros = () => { setPeriodo("mes"); setCustomInicio(""); setCustomFim(""); setStatusAtivos([...STATUSES]); setBusca(""); };
  const maior = linhasFiltradas[0];

  const kpis: KpiItem[] = [
    { label: "Total", value: formatCurrency(total), icon: TrendingUp, tone: config.type === "Pagar" ? "danger" : "success" },
    { label: "Lançamentos", value: qtdTotal, icon: Hash, tone: "info" },
    { label: "Média por Lançamento", value: formatCurrency(media), icon: Layers, tone: "primary" },
    { label: `Maior ${config.groupLabel}`, value: maior ? formatCurrency(maior.valor) : "—", icon: Crown, tone: "accent", hint: maior?.label },
  ];

  const handleExport = () => {
    downloadCsv(`${slug}_${Date.now()}.csv`, [config.groupLabel, "Quantidade", "Valor", "% do Total"], linhasFiltradas.map(l => [l.label, l.qtd, l.valor, total > 0 ? `${((l.valor / total) * 100).toFixed(1)}%` : "0%"]));
  };

  return (
    <PageContainer
      title={config.title}
      description={config.description}
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Relatórios", path: "/app/financeiro/relatorios" }, { label: config.title }]}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()} className="h-9 px-3 text-xs font-medium"><Printer className="w-3.5 h-3.5" /></Button>
          <Button onClick={handleExport} className="h-9 px-4 text-xs font-medium gap-1.5"><Download className="w-3.5 h-3.5" /> Exportar CSV</Button>
        </div>
      }
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <KpiFilterCard id="finRelatorioAgrupado" kpis={kpis} activeCount={activeCount} onClear={limparFiltros}>
          <FilterBar>
            <FilterSearch value={busca} onChange={setBusca} placeholder={`Buscar ${config.groupLabel.toLowerCase()}...`} />
            <FilterChips
              value={periodo}
              onChange={(v) => setPeriodo(v as Periodo)}
              allValue="mes"
              allLabel="Este Mês"
              options={PERIODOS.filter(p => p.id !== "mes").map(p => ({ value: p.id, label: p.label }))}
            />
            {periodo === "personalizado" && (
              <DateRangeFilter
                dateFrom={customInicio || null}
                setDateFrom={(v) => setCustomInicio(v ?? "")}
                dateTo={customFim || null}
                setDateTo={(v) => setCustomFim(v ?? "")}
                className="h-[38px]"
              />
            )}
            <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
              {STATUSES.map(st => (
                <Button key={st} size="sm" variant={statusAtivos.includes(st) ? "default" : "ghost"} onClick={() => toggleStatus(st)} className="h-7 px-3 text-xs font-medium">{st}</Button>
              ))}
            </div>
          </FilterBar>
          {maior && <KpiDrillChips items={[{ label: `Maior ${config.groupLabel}`, onClick: () => setDrillGrupo({ label: maior.label, rows: maior.rows }) }]} />}
        </KpiFilterCard>

        {chartData.length > 0 && (
          <Card className="p-6 print:hidden">
            <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-4">Distribuição por {config.groupLabel}</h3>
            <div style={{ height: Math.max(180, chartData.length * 34) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-muted)", fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" width={140} axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-control)" }} />
                  <Bar dataKey="valor" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {chartData.map((_, i) => <Cell key={i} fill={corBarra} fillOpacity={i === chartData.length - 1 && chartData[i].name === "Outros" ? 0.4 : 1 - i * 0.06} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        <Card className="overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
              <tr>
                <th className="px-6 py-3">{config.groupLabel}</th>
                <th className="px-6 py-3 text-right">Qtd.</th>
                <th className="px-6 py-3 text-right">Valor</th>
                <th className="px-6 py-3 text-right">% do Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {linhasFiltradas.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-10 text-center text-[var(--color-text-faint)]">Nenhum lançamento encontrado para os filtros selecionados.</td></tr>
              ) : linhasFiltradas.map(l => (
                <tr key={l.label} onClick={() => setDrillGrupo({ label: l.label, rows: l.rows })} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors cursor-pointer">
                  <td className="px-6 py-3 font-medium text-[var(--color-text-primary)]">{l.label}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-[var(--color-text-muted)]">{l.qtd}</td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-[var(--color-text-primary)]">{formatCurrency(l.valor)}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-[var(--color-text-muted)]">{total > 0 ? `${((l.valor / total) * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
            {linhasFiltradas.length > 0 && (
              <tfoot className="bg-[var(--color-surface-sunken)] border-t border-[var(--color-border-subtle)] font-semibold">
                <tr>
                  <td className="px-6 py-3 text-[var(--color-text-muted)] uppercase text-[10px]">Total</td>
                  <td className="px-6 py-3 text-right tabular-nums">{qtdTotal}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{formatCurrency(total)}</td>
                  <td className="px-6 py-3 text-right">100%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </Card>
      </div>

      <DrillDownPanel
        isOpen={drillGrupo !== null}
        onClose={() => setDrillGrupo(null)}
        title={drillGrupo?.label}
        subtitle={drillGrupo ? `${drillGrupo.rows.length} lançamento${drillGrupo.rows.length === 1 ? "" : "s"}` : undefined}
        rows={drillGrupo?.rows || []}
        columns={entryColumns}
      />
    </PageContainer>
  );
}
