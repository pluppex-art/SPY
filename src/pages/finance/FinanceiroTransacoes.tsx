import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Sparkline } from "../../components/ui/sparkline";
import { Pagination } from "../../components/ui/Pagination";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import { DrillDownPanel } from "../../components/ui/DrillDownPanel";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../../components/ui/dropdown-menu";
import { financeEntryDrillColumns } from "../../components/ui/drillColumns";
import { ViewModal, type ViewSection } from "./components/ViewModal";
import { useRowOpen } from "./components/useRowOpen";
import { NovaOperacaoModal } from "./components/NovaOperacaoModal";
import { FinanceKpiGrid } from "./components/FinanceKpiGrid";
import {
  ArrowDownLeft, ArrowUpRight, ArrowDownRight, Download, Plus, ListOrdered, Scale, Search, Minus,
  CheckCircle2, Clock, AlertTriangle, Tag, List as ListIcon, LayoutGrid, ArrowUpDown, X, MoreVertical, Copy, ExternalLink, Eye, FileText, Landmark, Trash2,
} from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { downloadCsv } from "../../lib/csvExport";
import { parseEntryDate } from "./lib/financeDates";
import { cn } from "../../lib/utils";
import { toast } from "sonner";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useFinanceTransacoesList, type TransacoesTab, type TransacoesOrdem, type TransacaoLeve } from "./useFinanceTransacoesList";

const STATUS_STYLE: Record<string, { icon: typeof CheckCircle2; className: string; label: string }> = {
  Pago: { icon: CheckCircle2, className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", label: "Pago" },
  Atrasado: { icon: AlertTriangle, className: "bg-rose-500/10 text-rose-600 dark:text-rose-400", label: "Atrasado" },
  "A Vencer": { icon: Clock, className: "bg-amber-500/10 text-amber-600 dark:text-amber-400", label: "A vencer" },
};

const ORDEM_OPTIONS: { id: TransacoesOrdem; label: string }[] = [
  { id: "data_desc", label: "Data (mais recente)" },
  { id: "data_asc", label: "Data (mais antiga)" },
  { id: "valor_desc", label: "Valor (maior)" },
  { id: "valor_asc", label: "Valor (menor)" },
];

const ICON_COLORS = ["text-[var(--color-primary-blue)]", "text-emerald-500", "text-cyan-500", "text-rose-500"];

const SELECT = "h-9 px-3 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40 cursor-pointer";

const pct = (cur: number, ant: number): number | null => (ant === 0 ? null : ((cur - ant) / Math.abs(ant)) * 100);
const soma = (l: TransacaoLeve[], tipo: "Receber" | "Pagar") => l.filter((r) => r.type === tipo).reduce((s, r) => s + r.value, 0);

/** Extrato consolidado (Pagar + Receber juntos) — visão de consulta, filtro e
 * exportação. Para editar um lançamento, use Despesas, Receitas, Contas a
 * Pagar ou Contas a Receber, que têm o formulário completo. */
export default function FinanceiroTransacoes() {
  const { formatCurrency } = useLocalization();
  const { financeEntries, financeBankAccounts, deleteFinanceEntry } = useData();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TransacoesTab>("todos");
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [categoria, setCategoria] = useState("");
  const [contraparte, setContraparte] = useState("");
  const [ordem, setOrdem] = useState<TransacoesOrdem>("data_desc");
  const [pageSize, setPageSize] = useState(10);
  const [viewMode, setViewMode] = useState<"lista" | "grade">("lista");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [novaOpen, setNovaOpen] = useState(false);
  const [novaTipo, setNovaTipo] = useState<"Pagar" | "Receber">("Pagar");
  const [viewing, setViewing] = useState<any | null>(null);
  const rowOpen = useRowOpen<any>(setViewing);

  const { entries, total, base, prev, page, setPage, totalPages, loading, fetchAllForExport, refetch } = useFinanceTransacoesList({
    search, tab, dateFrom, dateTo, categoria, contraparte, ordem, pageSize,
  });

  useEffect(() => { setSelecionados(new Set()); }, [entries]);

  const categorias = useMemo(
    () => Array.from(new Set((financeEntries as any[]).map((e) => e.category).filter(Boolean))).sort((a: any, b: any) => String(a).localeCompare(String(b), "pt-BR")) as string[],
    [financeEntries]
  );
  const contrapartes = useMemo(
    () => Array.from(new Set((financeEntries as any[]).map((e) => e.counterparty).filter(Boolean))).sort((a: any, b: any) => String(a).localeCompare(String(b), "pt-BR")) as string[],
    [financeEntries]
  );
  const contaNome = (id?: string | null) => (id ? (financeBankAccounts as any[]).find((c) => c.id === id)?.nome : undefined);

  // Contagem das abas e totais saem das linhas leves do conjunto filtrado.
  const tabCounts = useMemo(() => ({
    todos: base.length,
    entradas: base.filter((r) => r.type === "Receber").length,
    saidas: base.filter((r) => r.type === "Pagar").length,
    pendentes: base.filter((r) => r.status === "A Vencer" || r.status === "Atrasado").length,
  }), [base]);

  const kpiRows = useMemo(() => base.filter((r) => (
    tab === "entradas" ? r.type === "Receber" : tab === "saidas" ? r.type === "Pagar" : tab === "pendentes" ? (r.status === "A Vencer" || r.status === "Atrasado") : true
  )), [base, tab]);
  const prevRows = useMemo(() => (prev ? prev.filter((r) => (
    tab === "entradas" ? r.type === "Receber" : tab === "saidas" ? r.type === "Pagar" : tab === "pendentes" ? (r.status === "A Vencer" || r.status === "Atrasado") : true
  )) : null), [prev, tab]);

  const entradas = soma(kpiRows, "Receber");
  const saidas = soma(kpiRows, "Pagar");

  // Série mensal (últimos 6 meses) do conjunto filtrado.
  const series = useMemo(() => {
    const now = new Date();
    const meses = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    const por = (f: (r: TransacaoLeve) => number) => meses.map((m) => kpiRows.filter((r) => r.date_normalized?.startsWith(m)).reduce((s, r) => s + f(r), 0));
    return {
      entradas: por((r) => (r.type === "Receber" ? r.value : 0)),
      saidas: por((r) => (r.type === "Pagar" ? r.value : 0)),
      saldo: por((r) => (r.type === "Receber" ? r.value : -r.value)),
      qtd: por(() => 1),
    };
  }, [kpiRows]);

  const periodoLabel = !dateFrom && !dateTo
    ? "Todo o período"
    : `${dateFrom ? dateFrom.split("-").reverse().join("/") : "…"} – ${dateTo ? dateTo.split("-").reverse().join("/") : "…"}`;

  const kpis = [
    { label: "Entradas", value: formatCurrency(entradas), icon: ArrowUpRight, delta: prevRows ? pct(entradas, soma(prevRows, "Receber")) : null, goodUp: true, series: series.entradas, drill: "entradas" as const, danger: false },
    { label: "Saídas", value: formatCurrency(saidas), icon: ArrowDownLeft, delta: prevRows ? pct(saidas, soma(prevRows, "Pagar")) : null, goodUp: false, series: series.saidas, drill: "saidas" as const, danger: false },
    { label: "Saldo", value: formatCurrency(entradas - saidas), icon: Scale, delta: prevRows ? pct(entradas - saidas, soma(prevRows, "Receber") - soma(prevRows, "Pagar")) : null, goodUp: true, series: series.saldo, drill: "total" as const, danger: entradas - saidas < 0 },
    { label: "Lançamentos", value: String(kpiRows.length), icon: ListOrdered, delta: prevRows ? pct(kpiRows.length, prevRows.length) : null, goodUp: null as boolean | null, series: series.qtd, drill: "total" as const, danger: false },
  ];

  // Drill-down: clique no card abre a lista completa por trás do número.
  const [drillKey, setDrillKey] = useState<"entradas" | "saidas" | "total" | null>(null);
  const [drillRows, setDrillRows] = useState<any[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const entryColumns = financeEntryDrillColumns(formatCurrency);

  const openDrill = async (key: "entradas" | "saidas" | "total") => {
    setDrillKey(key);
    setDrillLoading(true);
    const all = await fetchAllForExport();
    setDrillRows(key === "entradas" ? all.filter((t: any) => t.type === "Receber") : key === "saidas" ? all.filter((t: any) => t.type === "Pagar") : all);
    setDrillLoading(false);
  };

  const handleExport = async () => {
    const all = selecionados.size > 0 ? entries.filter((t: any) => selecionados.has(t.id)) : await fetchAllForExport();
    downloadCsv(
      `extrato_transacoes_${Date.now()}.csv`,
      ["Descrição", "Tipo", "Categoria", "Data", "Status", "Valor (R$)"],
      all.map((t: any) => [t.description, t.type === "Receber" ? "Entrada" : "Saída", t.category, t.date, t.status, Number(t.value).toFixed(2)])
    );
  };

  const filtrosAtivos = (search.trim() ? 1 : 0) + (dateFrom || dateTo ? 1 : 0) + (categoria ? 1 : 0) + (contraparte ? 1 : 0) + (tab !== "todos" ? 1 : 0);
  const limpar = () => { setSearch(""); setDateFrom(null); setDateTo(null); setCategoria(""); setContraparte(""); setTab("todos"); };

  const linhas = entries.map((t: any) => ({ ...t, __data: parseEntryDate(t.date) }));
  const excluirIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!(await confirmDialog({
      title: "Excluir lançamentos",
      description: `Excluir ${ids.length} lançamento${ids.length > 1 ? "s" : ""} selecionado${ids.length > 1 ? "s" : ""}? Essa ação não pode ser desfeita.`,
    }))) return;
    await Promise.all(ids.map((id) => deleteFinanceEntry(id)));
    setSelecionados(new Set());
    toast.success(`${ids.length} lançamento${ids.length > 1 ? "s excluídos" : " excluído"}.`);
    setTimeout(refetch, 300);
  };
  const handleExcluirSelecionados = () => excluirIds([...selecionados]);
  const todosNaPagina = linhas.length > 0 && linhas.every((t) => selecionados.has(t.id));
  const toggleTodos = () => setSelecionados(todosNaPagina ? new Set() : new Set(linhas.map((t) => t.id)));
  const toggleUm = (id: string) => setSelecionados((prevSel) => { const n = new Set(prevSel); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const tabs: { id: TransacoesTab; label: string; icon: typeof ListIcon; count: number }[] = [
    { id: "todos", label: "Todos", icon: ListIcon, count: tabCounts.todos },
    { id: "entradas", label: "Entradas", icon: ArrowUpRight, count: tabCounts.entradas },
    { id: "saidas", label: "Saídas", icon: ArrowDownLeft, count: tabCounts.saidas },
    { id: "pendentes", label: "Pendentes", icon: Clock, count: tabCounts.pendentes },
  ];

  const viewSections = (t: any): ViewSection[] => {
    const st = STATUS_STYLE[t.status]?.label ?? t.status;
    const d = parseEntryDate(t.date);
    return [
      { icon: FileText, title: "Lançamento", rows: [
        { label: "Descrição", value: t.description },
        { label: "Tipo", value: t.type === "Receber" ? "Entrada" : "Saída" },
        { label: "Categoria", value: t.category || null },
        { label: t.type === "Receber" ? "Cliente" : "Fornecedor", value: t.counterparty || null },
        { label: "Data", value: d ? d.toLocaleDateString("pt-BR") : t.date || null, mono: true },
        { label: "Status", value: st || null },
      ] },
      { icon: Landmark, title: "Pagamento", rows: [
        { label: "Conta", value: contaNome(t.conta_bancaria_id) || null },
        { label: "Forma de pagamento", value: t.payment_method || null },
        { label: "Nº do documento", value: t.numero_documento || null, mono: true },
        { label: "Observações", value: t.notes || null },
      ] },
    ];
  };

  const acoes = (t: any) => (
    <div className="flex items-center justify-end gap-1">
    <button type="button" onClick={() => setViewing(t)} className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-surface-sunken)] bg-transparent border-none cursor-pointer" aria-label="Visualizar" title="Visualizar"><Eye className="w-4 h-4" /></button>
    <button type="button" onClick={() => excluirIds([t.id])} className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 bg-transparent border-none cursor-pointer" aria-label="Excluir" title="Excluir"><Trash2 className="w-4 h-4" /></button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)] bg-transparent border-none cursor-pointer" aria-label="Ações"><MoreVertical className="w-4 h-4" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(t.description || ""); toast.success("Descrição copiada."); }} className="gap-2"><Copy className="w-3.5 h-3.5" /> Copiar descrição</DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(t.type === "Receber" ? "/app/financeiro/receitas" : "/app/financeiro/despesas")} className="gap-2"><ExternalLink className="w-3.5 h-3.5" /> Abrir {t.type === "Receber" ? "receitas" : "despesas"}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </div>
  );

  return (
    <PageContainer
      title="Todas as Movimentações"
      description="Extrato consolidado de receitas e despesas — para lançar ou editar, use Despesas, Receitas, Contas a Pagar ou Contas a Receber."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Todas as Movimentações" }]}
      actions={
        <div className="flex items-center gap-2">
          <DateRangeFilter dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} className="!h-9 !rounded-lg" />
          {selecionados.size > 0 && (
            <Button variant="outline" onClick={handleExcluirSelecionados} className="h-9 px-4 text-xs font-bold gap-1.5 text-rose-500 border-rose-500/30 hover:bg-rose-500/10">
              <Trash2 className="w-3.5 h-3.5" /> Excluir ({selecionados.size})
            </Button>
          )}
          <Button variant="outline" onClick={handleExport} className="h-9 px-4 text-xs font-medium gap-1.5">
            <Download className="w-3.5 h-3.5" /> Exportar CSV{selecionados.size > 0 ? ` (${selecionados.size})` : ""}
          </Button>
          <Button onClick={() => { setNovaTipo("Pagar"); setNovaOpen(true); }} className="h-9 px-4 text-xs font-bold gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Nova Movimentação
          </Button>
        </div>
      }
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <FinanceKpiGrid cards={kpis.map((k) => ({ label: k.label, value: k.value, icon: k.icon, delta: k.delta, goodUp: k.goodUp, series: k.series, danger: k.danger, footer: k.delta === null ? periodoLabel : "vs. período anterior", onClick: () => openDrill(k.drill) }))} />

        {/* Filtros */}
        <Card className="p-2.5 rounded-xl">
          <div className="flex flex-col xl:flex-row xl:items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por descrição, categoria, contato ou contraparte..."
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
              />
            </div>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={cn(SELECT, "max-w-[200px]")}>
              <option value="">Categoria: Todas</option>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={contraparte} onChange={(e) => setContraparte(e.target.value)} className={cn(SELECT, "max-w-[220px]")}>
              <option value="">Cliente / Fornecedor: Todos</option>
              {contrapartes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {filtrosAtivos > 0 && (
              <button type="button" onClick={limpar} className="flex items-center gap-1 px-2 h-9 text-xs font-bold text-[var(--color-text-muted)] hover:text-rose-500 bg-transparent border-none cursor-pointer whitespace-nowrap">
                <X className="w-3 h-3" /> Limpar ({filtrosAtivos})
              </button>
            )}
          </div>
        </Card>

        {/* Abas + ordenação + visualização */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer",
                  tab === t.id
                    ? "bg-[var(--color-primary-blue)] text-white border-transparent shadow-sm"
                    : "bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] border-[var(--color-border-default)] hover:text-[var(--color-text-primary)]"
                )}
              >
                <t.icon className="w-3.5 h-3.5" /> {t.label}
                <span className={cn("min-w-5 text-center text-[10px] font-black px-1.5 py-0.5 rounded-full", tab === t.id ? "bg-white text-[var(--color-primary-blue)]" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]")}>{t.count}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 h-9 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-3">
              <ArrowUpDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
              <span className="flex flex-col">
                <span className="text-[9px] text-[var(--color-text-faint)] leading-none">Ordenar por</span>
                <select value={ordem} onChange={(e) => setOrdem(e.target.value as TransacoesOrdem)} className="bg-transparent text-xs font-bold text-[var(--color-text-primary)] focus:outline-none cursor-pointer">
                  {ORDEM_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </span>
            </label>
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]">
              {([{ id: "lista" as const, icon: ListIcon }, { id: "grade" as const, icon: LayoutGrid }]).map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setViewMode(id)}
                  className={cn("h-8 w-8 flex items-center justify-center rounded-md border-none cursor-pointer", viewMode === id ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]" : "bg-transparent text-[var(--color-text-muted)]")}
                  aria-label={id === "lista" ? "Visualização em lista" : "Visualização em grade"}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {viewMode === "lista" ? (
          <Card className="overflow-hidden rounded-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[900px]">
                <thead className="text-[10px] uppercase font-bold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                  <tr>
                    <th className="px-4 py-3 w-10"><input type="checkbox" checked={todosNaPagina} onChange={toggleTodos} className="w-4 h-4 accent-[var(--color-primary-blue)] cursor-pointer" aria-label="Selecionar todos da página" /></th>
                    <th className="px-3 py-3">Descrição</th>
                    <th className="px-3 py-3">Tipo</th>
                    <th className="px-3 py-3">Categoria</th>
                    <th className="px-3 py-3">Conta</th>
                    <th className="px-3 py-3">Data</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-right">Valor</th>
                    <th className="px-3 py-3 text-right w-20">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {linhas.map((t) => {
                    const entrada = t.type === "Receber";
                    const st = STATUS_STYLE[t.status] ?? STATUS_STYLE["A Vencer"];
                    const StIcon = st.icon;
                    return (
                      <tr key={t.id} {...rowOpen(t)} className={cn("cursor-pointer hover:bg-[var(--color-surface-sunken)]/50 transition-colors", selecionados.has(t.id) && "bg-[var(--color-primary-blue)]/[0.04]")}>
                        <td className="px-4 py-3"><input type="checkbox" checked={selecionados.has(t.id)} onChange={() => toggleUm(t.id)} className="w-4 h-4 accent-[var(--color-primary-blue)] cursor-pointer" /></td>
                        <td className="px-3 py-3 max-w-[340px]">
                          <span className="font-medium text-[var(--color-text-primary)] block truncate hover:text-[var(--color-primary-blue)]">{t.description}</span>
                          {t.counterparty && <span className="block text-[10px] text-[var(--color-text-faint)] truncate">({t.counterparty})</span>}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full", entrada ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400")}>
                            {entrada ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                            {entrada ? "Entrada" : "Saída"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="flex items-center gap-2 text-[var(--color-text-muted)]">
                            <span className="w-7 h-7 rounded-md bg-[var(--color-surface-sunken)] flex items-center justify-center shrink-0"><Tag className="w-3.5 h-3.5" /></span>
                            <span className="truncate max-w-[150px]">{t.category || "—"}</span>
                          </span>
                        </td>
                        <td className="px-3 py-3 text-[var(--color-text-muted)]">{contaNome(t.conta_bancaria_id) || "—"}</td>
                        <td className="px-3 py-3 font-mono text-[var(--color-text-muted)] whitespace-nowrap">{t.__data ? t.__data.toLocaleDateString("pt-BR") : "—"}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full", st.className)}><StIcon className="w-3 h-3" /> {st.label}</span>
                        </td>
                        <td className={cn("px-3 py-3 text-right font-bold tabular-nums whitespace-nowrap", entrada ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500")}>
                          {entrada ? "+ " : "− "}{formatCurrency(t.value)}
                        </td>
                        <td className="px-3 py-3 text-right">{acoes(t)}</td>
                      </tr>
                    );
                  })}
                  {linhas.length === 0 && (
                    <tr><td colSpan={9} className="py-12 text-center text-[var(--color-text-faint)]">{loading ? "Carregando..." : "Nenhuma transação encontrada para os filtros selecionados."}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {linhas.map((t) => {
              const entrada = t.type === "Receber";
              const st = STATUS_STYLE[t.status] ?? STATUS_STYLE["A Vencer"];
              const StIcon = st.icon;
              return (
                <Card key={t.id} {...rowOpen(t)} className="p-4 rounded-xl space-y-2.5 cursor-pointer hover:border-[var(--color-primary-blue)]/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{t.description}</p>
                      <p className="text-[11px] text-[var(--color-text-muted)] truncate">{t.category || "Sem categoria"}{t.counterparty ? ` · ${t.counterparty}` : ""}</p>
                    </div>
                    {acoes(t)}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-base font-black tabular-nums", entrada ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500")}>{entrada ? "+ " : "− "}{formatCurrency(t.value)}</span>
                    <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full", st.className)}><StIcon className="w-3 h-3" /> {st.label}</span>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-faint)]">{t.__data ? t.__data.toLocaleDateString("pt-BR") : "—"}{contaNome(t.conta_bancaria_id) ? ` · ${contaNome(t.conta_bancaria_id)}` : ""}</p>
                </Card>
              );
            })}
            {linhas.length === 0 && <p className="col-span-full py-12 text-center text-xs text-[var(--color-text-faint)]">{loading ? "Carregando..." : "Nenhuma transação encontrada para os filtros selecionados."}</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className={SELECT}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            registros por página
          </label>
          <div className="min-w-[260px] flex-1 max-w-xl">
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} loading={loading} onPageChange={setPage} itemLabel="lançamento" />
          </div>
        </div>
      </div>

      <NovaOperacaoModal isOpen={novaOpen} onClose={() => setNovaOpen(false)} defaultType={novaTipo} />

      {viewing && (
        <ViewModal
          isOpen
          onClose={() => setViewing(null)}
          icon={viewing.type === "Receber" ? ArrowUpRight : ArrowDownLeft}
          tone={viewing.type === "Receber" ? "success" : "danger"}
          title={viewing.description}
          subtitle={viewing.type === "Receber" ? "Entrada" : "Saída"}
          highlight={<span className={cn("text-xl font-black tabular-nums", viewing.type === "Receber" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500")}>{viewing.type === "Receber" ? "+ " : "− "}{formatCurrency(viewing.value)}</span>}
          sections={viewSections(viewing)}
          onNew={() => { setNovaTipo(viewing.type === "Receber" ? "Receber" : "Pagar"); setViewing(null); setNovaOpen(true); }}
          newLabel="Nova movimentação"
        />
      )}

      <DrillDownPanel
        isOpen={drillKey !== null}
        onClose={() => setDrillKey(null)}
        title={drillKey === "entradas" ? "Entradas (filtro atual)" : drillKey === "saidas" ? "Saídas (filtro atual)" : drillKey === "total" ? "Lançamentos" : undefined}
        rows={drillRows}
        columns={entryColumns}
        loading={drillLoading}
      />
    </PageContainer>
  );
}
