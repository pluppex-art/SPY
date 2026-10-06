import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Sparkline } from "../../components/ui/sparkline";
import { Pagination } from "../../components/ui/Pagination";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../../components/ui/dropdown-menu";
import { NovaOperacaoModal } from "./components/NovaOperacaoModal";
import {
  Download, Plus, Search, ArrowUpRight, ArrowDownRight, Scale, ListOrdered, Filter, X, MoreVertical,
  CheckCircle2, Clock, AlertCircle, Tag, Users, Building2, ArrowUpDown, Copy, ExternalLink,
} from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { downloadCsv } from "../../lib/csvExport";
import { parseEntryDate } from "./lib/financeDates";
import { cn } from "../../lib/utils";
import { toast } from "sonner";

type Aba = "movimentacoes" | "contatos" | "centros";
type Ordem = "data_desc" | "data_asc" | "valor_desc" | "valor_asc" | "descricao";

const ORDEM_OPTIONS: { id: Ordem; label: string }[] = [
  { id: "data_desc", label: "Data (mais recente)" },
  { id: "data_asc", label: "Data (mais antiga)" },
  { id: "valor_desc", label: "Valor (maior)" },
  { id: "valor_asc", label: "Valor (menor)" },
  { id: "descricao", label: "Descrição (A-Z)" },
];

const STATUS_CHIP: Record<string, { cls: string; icon: typeof CheckCircle2; label: string }> = {
  Pago: { cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: CheckCircle2, label: "Pago" },
  "A Vencer": { cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400", icon: Clock, label: "A vencer" },
  Atrasado: { cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400", icon: AlertCircle, label: "Atrasado" },
};

const initials = (name: string) => (name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";

const FIELD = "h-[52px] rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] px-3.5 flex flex-col justify-center";
const SELECT = "h-10 px-3 rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40 cursor-pointer";

/**
 * Busca global — ignora QUALQUER período selecionado em outras telas (varre
 * todos os lançamentos) e os totalizadores somam tudo, pago ou não —
 * validação obrigatória da especificação (§7).
 */
export default function FinanceiroBuscaGlobal() {
  const { financeEntries, financeCentrosCusto, financeBankAccounts } = useData();
  const { formatCurrency } = useLocalization();
  const navigate = useNavigate();

  const [texto, setTexto] = useState("");
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [aba, setAba] = useState<Aba>("movimentacoes");
  const [ordem, setOrdem] = useState<Ordem>("data_desc");
  const [showMais, setShowMais] = useState(false);
  const [tipoF, setTipoF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [categoriaF, setCategoriaF] = useState("");
  const [contaF, setContaF] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [novaOpen, setNovaOpen] = useState(false);

  const contaNome = (id: string) => (financeBankAccounts as any[]).find(c => c.id === id)?.nome;

  const categorias = useMemo(
    () => Array.from(new Set((financeEntries as any[]).map((e) => e.category).filter(Boolean))).sort((a: any, b: any) => String(a).localeCompare(String(b), "pt-BR")) as string[],
    [financeEntries]
  );

  const resultadosMovimentacoes = useMemo(() => {
    const q = texto.trim().toLowerCase();
    const min = parseFloat(valorMin), max = parseFloat(valorMax);
    const de = dataDe ? new Date(dataDe + "T00:00:00") : null;
    const ate = dataAte ? new Date(dataAte + "T23:59:59") : null;

    const lista = (financeEntries as any[]).filter(e => {
      if (q) {
        const alvo = `${e.description || ""} ${e.category || ""} ${e.counterparty || ""} ${e.notes || ""}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      if (!isNaN(min) && e.value < min) return false;
      if (!isNaN(max) && e.value > max) return false;
      if (tipoF && e.type !== tipoF) return false;
      if (statusF && e.status !== statusF) return false;
      if (categoriaF && e.category !== categoriaF) return false;
      if (contaF && e.conta_bancaria_id !== contaF) return false;
      if (de || ate) {
        const d = parseEntryDate(e.date);
        if (!d) return false;
        if (de && d < de) return false;
        if (ate && d > ate) return false;
      }
      return true;
    });

    const ts = (e: any) => parseEntryDate(e.date)?.getTime() ?? 0;
    lista.sort((a, b) => {
      switch (ordem) {
        case "data_asc": return ts(a) - ts(b);
        case "valor_desc": return b.value - a.value;
        case "valor_asc": return a.value - b.value;
        case "descricao": return String(a.description || "").localeCompare(String(b.description || ""), "pt-BR");
        default: return ts(b) - ts(a);
      }
    });
    return lista;
  }, [financeEntries, texto, valorMin, valorMax, dataDe, dataAte, tipoF, statusF, categoriaF, contaF, ordem]);

  const resultadosContatos = useMemo(() => {
    const q = texto.trim().toLowerCase();
    const mapa = new Map<string, { n: number; recebido: number; pago: number }>();
    for (const e of financeEntries as any[]) {
      if (!e.counterparty) continue;
      const cur = mapa.get(e.counterparty) || { n: 0, recebido: 0, pago: 0 };
      cur.n++;
      if (e.type === "Receber") cur.recebido += e.value; else cur.pago += e.value;
      mapa.set(e.counterparty, cur);
    }
    return Array.from(mapa.entries())
      .filter(([nome]) => !q || nome.toLowerCase().includes(q))
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [financeEntries, texto]);

  const resultadosCentros = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return (financeCentrosCusto as any[])
      .filter(c => !q || String(c.nome || "").toLowerCase().includes(q))
      .map((c) => {
        const lanc = (financeEntries as any[]).filter((e) => e.centro_custo_id === c.id);
        return { ...c, n: lanc.length, total: lanc.reduce((s, e) => s + e.value, 0) };
      });
  }, [financeCentrosCusto, financeEntries, texto]);

  const entradas = resultadosMovimentacoes.filter(e => e.type === "Receber").reduce((s, e) => s + e.value, 0);
  const saidas = resultadosMovimentacoes.filter(e => e.type === "Pagar").reduce((s, e) => s + e.value, 0);
  const nEntradas = resultadosMovimentacoes.filter(e => e.type === "Receber").length;
  const nSaidas = resultadosMovimentacoes.length - nEntradas;

  // Séries dos últimos 6 meses (por data do lançamento) a partir do próprio resultado filtrado.
  const series = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (5 - i), 1));
    const pick = (b: Date, f: (e: any) => boolean) =>
      resultadosMovimentacoes.filter((e) => { const d = parseEntryDate(e.date); return !!d && d.getFullYear() === b.getFullYear() && d.getMonth() === b.getMonth() && f(e); });
    const sum = (l: any[]) => l.reduce((s, e) => s + e.value, 0);
    return {
      entradas: buckets.map((b) => sum(pick(b, (e) => e.type === "Receber"))),
      saidas: buckets.map((b) => sum(pick(b, (e) => e.type === "Pagar"))),
      resultado: buckets.map((b) => sum(pick(b, (e) => e.type === "Receber")) - sum(pick(b, (e) => e.type === "Pagar"))),
      qtd: buckets.map((b) => pick(b, () => true).length),
    };
  }, [resultadosMovimentacoes]);

  useEffect(() => { setPage(0); setSelecionados(new Set()); }, [texto, valorMin, valorMax, dataDe, dataAte, tipoF, statusF, categoriaF, contaF, ordem, pageSize]);

  const totalPages = Math.max(1, Math.ceil(resultadosMovimentacoes.length / pageSize));
  const pageItems = resultadosMovimentacoes.slice(page * pageSize, page * pageSize + pageSize);
  const todosNaPagina = pageItems.length > 0 && pageItems.every((e) => selecionados.has(e.id));

  const toggleTodos = () => setSelecionados((prev) => {
    const next = new Set(prev);
    if (todosNaPagina) pageItems.forEach((e) => next.delete(e.id)); else pageItems.forEach((e) => next.add(e.id));
    return next;
  });
  const toggleUm = (id: string) => setSelecionados((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const activeCount = (texto.trim() ? 1 : 0) + (valorMin || valorMax ? 1 : 0) + (dataDe || dataAte ? 1 : 0) + (tipoF ? 1 : 0) + (statusF ? 1 : 0) + (categoriaF ? 1 : 0) + (contaF ? 1 : 0);
  const limparFiltros = () => {
    setTexto(""); setValorMin(""); setValorMax(""); setDataDe(""); setDataAte("");
    setTipoF(""); setStatusF(""); setCategoriaF(""); setContaF("");
  };

  const handleExport = () => {
    const base = selecionados.size > 0 ? resultadosMovimentacoes.filter((e) => selecionados.has(e.id)) : resultadosMovimentacoes;
    downloadCsv(
      `busca_financeira_${Date.now()}.csv`,
      ["Data", "Tipo", "Descrição", "Contato", "Categoria", "Valor", "Status"],
      base.map(e => [e.date, e.type, e.description, e.counterparty || "", e.category, e.value, e.status])
    );
  };

  const abas = [
    { id: "movimentacoes" as const, label: "Movimentações", count: resultadosMovimentacoes.length, icon: Filter },
    { id: "contatos" as const, label: "Contatos", count: resultadosContatos.length, icon: Users },
    { id: "centros" as const, label: "Centros de Custo", count: resultadosCentros.length, icon: Building2 },
  ];

  const kpis = [
    { label: "Entradas", value: formatCurrency(entradas), chip: `${nEntradas} ${nEntradas === 1 ? "movimentação" : "movimentações"}`, icon: ArrowUpRight, color: "#10b981", tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", chipCls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", data: series.entradas, danger: false },
    { label: "Saídas", value: formatCurrency(saidas), chip: `${nSaidas} ${nSaidas === 1 ? "movimentação" : "movimentações"}`, icon: ArrowDownRight, color: "#f43f5e", tile: "bg-rose-500/10 text-rose-600 dark:text-rose-400", chipCls: "bg-rose-500/10 text-rose-600 dark:text-rose-400", data: series.saidas, danger: false },
    { label: "Resultado", value: formatCurrency(entradas - saidas), chip: "Saldo no período", icon: Scale, color: "#3b82f6", tile: "bg-blue-500/10 text-blue-600 dark:text-blue-400", chipCls: "bg-blue-500/10 text-blue-600 dark:text-blue-400", data: series.resultado, danger: entradas - saidas < 0 },
    { label: "Movimentações", value: String(resultadosMovimentacoes.length), chip: "Total de registros", icon: ListOrdered, color: "#8b5cf6", tile: "bg-violet-500/10 text-violet-600 dark:text-violet-400", chipCls: "bg-violet-500/10 text-violet-600 dark:text-violet-400", data: series.qtd, danger: false },
  ];

  return (
    <PageContainer
      title="Busca Financeira"
      description="Busca em todo o histórico, sem limite de período — os totalizadores somam pagamentos e pendências."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Busca" }]}
      actions={
        <div className="flex items-center gap-2">
          <Button onClick={handleExport} variant="outline" className="h-9 px-4 text-xs font-medium gap-1.5">
            <Download className="w-3.5 h-3.5" /> Exportar{selecionados.size > 0 ? ` (${selecionados.size})` : ""}
          </Button>
          <Button onClick={() => setNovaOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Nova Movimentação
          </Button>
        </div>
      }
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center", k.tile)}><k.icon className="w-4 h-4" /></span>
                <span className="text-[11px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">{k.label}</span>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className={cn("text-2xl font-black tabular-nums tracking-tight", k.danger ? "text-rose-500" : "text-[var(--color-text-primary)]")}>{k.value}</p>
                  <span className={cn("inline-block mt-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full", k.chipCls)}>{k.chip}</span>
                </div>
                <div className="w-24 h-10 shrink-0" style={{ color: k.color }}>
                  <Sparkline data={k.data} className="w-full h-full" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Busca e filtros principais */}
        <Card className="p-3 rounded-2xl">
          <div className="flex flex-col xl:flex-row gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
              <input
                type="text"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Buscar por descrição, categoria, contato ou palavra-chave..."
                className="w-full h-[52px] pl-10 pr-3 rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
              />
            </div>
            <label className={cn(FIELD, "w-full xl:w-44")}>
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Valor de</span>
              <span className="flex items-center gap-1.5 text-sm"><span className="font-bold text-[var(--color-text-muted)]">R$</span>
                <input type="number" min="0" value={valorMin} onChange={(e) => setValorMin(e.target.value)} placeholder="0,00" className="w-full bg-transparent font-mono text-[var(--color-text-primary)] focus:outline-none" />
              </span>
            </label>
            <label className={cn(FIELD, "w-full xl:w-44")}>
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Até</span>
              <span className="flex items-center gap-1.5 text-sm"><span className="font-bold text-[var(--color-text-muted)]">R$</span>
                <input type="number" min="0" value={valorMax} onChange={(e) => setValorMax(e.target.value)} placeholder="0,00" className="w-full bg-transparent font-mono text-[var(--color-text-primary)] focus:outline-none" />
              </span>
            </label>
            <DateRangeFilter dateFrom={dataDe || null} setDateFrom={(v) => setDataDe(v ?? "")} dateTo={dataAte || null} setDateTo={(v) => setDataAte(v ?? "")} className="h-[52px] rounded-xl" />
          </div>
        </Card>

        {/* Abas */}
        <div className="flex flex-wrap items-center gap-2">
          {abas.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setAba(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all cursor-pointer",
                aba === t.id
                  ? "bg-[var(--color-primary-blue)] text-white border-transparent shadow-sm"
                  : "bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] border-[var(--color-border-default)] hover:text-[var(--color-text-primary)]"
              )}
            >
              <t.icon className="w-4 h-4" /> {t.label}
              <span className={cn("min-w-6 text-center text-[11px] font-black px-1.5 py-0.5 rounded-full", aba === t.id ? "bg-white text-[var(--color-primary-blue)]" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]")}>{t.count}</span>
            </button>
          ))}
          {activeCount > 0 && (
            <button type="button" onClick={limparFiltros} className="flex items-center gap-1 px-2 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-rose-500 bg-transparent border-none cursor-pointer">
              <X className="w-3 h-3" /> Limpar filtros ({activeCount})
            </button>
          )}
        </div>

        {aba === "movimentacoes" && (
          <Card className="rounded-2xl overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-5">
              <div>
                <h3 className="text-base font-black text-[var(--color-text-primary)]">
                  {resultadosMovimentacoes.length} {resultadosMovimentacoes.length === 1 ? "movimentação encontrada" : "movimentações encontradas"}
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {activeCount > 0 ? "Resultado dos filtros aplicados ao histórico completo." : "Mostrando todas as movimentações do histórico."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 h-10 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-3">
                  <ArrowUpDown className="w-4 h-4 text-[var(--color-text-muted)]" />
                  <span className="flex flex-col">
                    <span className="text-[9px] text-[var(--color-text-faint)] leading-none">Ordenar por</span>
                    <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className="bg-transparent text-xs font-bold text-[var(--color-text-primary)] focus:outline-none cursor-pointer">
                      {ORDEM_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </span>
                </label>
                <Button variant="outline" onClick={() => setShowMais((v) => !v)} className={cn("h-10 gap-2 text-xs font-bold", (showMais || tipoF || statusF || categoriaF || contaF) && "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]")}>
                  <Filter className="w-4 h-4" /> Mais filtros
                </Button>
              </div>
            </div>

            {showMais && (
              <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
                <select value={tipoF} onChange={(e) => setTipoF(e.target.value)} className={SELECT}>
                  <option value="">Tipo: Todos</option>
                  <option value="Receber">Recebimento</option>
                  <option value="Pagar">Despesa</option>
                </select>
                <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className={SELECT}>
                  <option value="">Status: Todos</option>
                  <option value="Pago">Pago</option>
                  <option value="A Vencer">A vencer</option>
                  <option value="Atrasado">Atrasado</option>
                </select>
                <select value={categoriaF} onChange={(e) => setCategoriaF(e.target.value)} className={cn(SELECT, "max-w-[220px]")}>
                  <option value="">Categoria: Todas</option>
                  {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={contaF} onChange={(e) => setContaF(e.target.value)} className={cn(SELECT, "max-w-[220px]")}>
                  <option value="">Conta: Todas</option>
                  {(financeBankAccounts as any[]).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left min-w-[860px]">
                <thead className="text-[10px] uppercase font-bold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-y border-[var(--color-border-subtle)]">
                  <tr>
                    <th className="px-4 py-3 w-10"><input type="checkbox" checked={todosNaPagina} onChange={toggleTodos} className="w-4 h-4 accent-[var(--color-primary-blue)] cursor-pointer" aria-label="Selecionar todos da página" /></th>
                    <th className="px-3 py-3">Data</th>
                    <th className="px-3 py-3">Tipo</th>
                    <th className="px-3 py-3">Descrição</th>
                    <th className="px-3 py-3">Contato</th>
                    <th className="px-3 py-3">Categoria</th>
                    <th className="px-3 py-3 text-right">Valor</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-right w-14">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {pageItems.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-14 text-center text-[var(--color-text-faint)]">Nenhum resultado encontrado.</td></tr>
                  ) : pageItems.map((e) => {
                    const rec = e.type === "Receber";
                    const st = STATUS_CHIP[e.status] ?? { cls: "bg-slate-500/10 text-slate-500", icon: Clock, label: e.status };
                    const StIcon = st.icon;
                    return (
                      <tr key={e.id} className={cn("hover:bg-[var(--color-surface-sunken)]/50 transition-colors", selecionados.has(e.id) && "bg-[var(--color-primary-blue)]/[0.04]")}>
                        <td className="px-4 py-3"><input type="checkbox" checked={selecionados.has(e.id)} onChange={() => toggleUm(e.id)} className="w-4 h-4 accent-[var(--color-primary-blue)] cursor-pointer" /></td>
                        <td className="px-3 py-3 font-mono text-[var(--color-text-muted)] whitespace-nowrap">{(parseEntryDate(e.date) ?? null)?.toLocaleDateString("pt-BR") ?? e.date}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="flex items-center gap-2">
                            <span className={cn("w-8 h-8 rounded-full flex items-center justify-center", rec ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400")}>
                              {rec ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                            </span>
                            <span className={cn("text-[11px] font-bold px-2.5 py-1 rounded-full", rec ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400")}>
                              {rec ? "Recebimento" : "Despesa"}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-3 max-w-[320px]">
                          <span className="text-[var(--color-text-primary)] font-medium">{e.description}{e.installment_total > 1 && <span className="ml-1 text-[10px] text-[var(--color-text-faint)]">({e.installment_number}/{e.installment_total})</span>}</span>
                          {e.conta_bancaria_id && <span className="block text-[10px] text-[var(--color-text-faint)]">{contaNome(e.conta_bancaria_id)}</span>}
                        </td>
                        <td className="px-3 py-3 text-[var(--color-text-muted)]">{e.counterparty || "—"}</td>
                        <td className="px-3 py-3">
                          <span className="flex items-center gap-2 text-[var(--color-text-muted)]">
                            <span className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0"><Tag className="w-4 h-4" /></span>
                            <span className="truncate max-w-[150px]">{e.category || "—"}</span>
                          </span>
                        </td>
                        <td className={cn("px-3 py-3 text-right tabular-nums font-black whitespace-nowrap", rec ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500")}>{formatCurrency(e.value)}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full", st.cls)}><StIcon className="w-3.5 h-3.5" /> {st.label}</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)] bg-transparent border-none cursor-pointer" aria-label="Ações"><MoreVertical className="w-4 h-4" /></button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(e.description || ""); toast.success("Descrição copiada."); }} className="gap-2"><Copy className="w-3.5 h-3.5" /> Copiar descrição</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate(rec ? "/app/financeiro/receitas" : "/app/financeiro/despesas")} className="gap-2"><ExternalLink className="w-3.5 h-3.5" /> Abrir {rec ? "receitas" : "despesas"}</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t border-[var(--color-border-subtle)]">
              <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className={cn(SELECT, "h-9")}>
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                registros por página
              </label>
              <div className="min-w-[260px]">
                <Pagination page={page} totalPages={totalPages} total={resultadosMovimentacoes.length} pageSize={pageSize} onPageChange={setPage} itemLabel="movimentação" />
              </div>
            </div>
          </Card>
        )}

        {aba === "contatos" && (
          <Card className="rounded-2xl overflow-hidden">
            {resultadosContatos.length === 0 ? <p className="text-xs text-[var(--color-text-faint)] p-8 text-center">Nenhum contato encontrado.</p> : (
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {resultadosContatos.map((c) => (
                  <div key={c.nome} className="px-5 py-3.5 flex items-center gap-3 text-xs">
                    <span className="w-9 h-9 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] font-black flex items-center justify-center shrink-0">{initials(c.nome)}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-[var(--color-text-primary)] truncate">{c.nome}</span>
                      <span className="block text-[11px] text-[var(--color-text-muted)]">{c.n} lançamento(s)</span>
                    </span>
                    {c.recebido > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">+ {formatCurrency(c.recebido)}</span>}
                    {c.pago > 0 && <span className="text-rose-500 font-bold tabular-nums">− {formatCurrency(c.pago)}</span>}
                    <Button variant="outline" onClick={() => { setTexto(c.nome); setAba("movimentacoes"); }} className="h-8 px-3 text-[11px] font-bold">Ver movimentações</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {aba === "centros" && (
          <Card className="rounded-2xl overflow-hidden">
            {resultadosCentros.length === 0 ? <p className="text-xs text-[var(--color-text-faint)] p-8 text-center">Nenhum centro de custo encontrado.</p> : (
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {resultadosCentros.map((c: any) => (
                  <div key={c.id} className="px-5 py-3.5 flex items-center gap-3 text-xs">
                    <span className="w-9 h-9 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0"><Building2 className="w-4 h-4" /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-[var(--color-text-primary)] truncate">{c.nome}</span>
                      <span className="block text-[11px] text-[var(--color-text-muted)]">{c.codigo || "Sem código"} · {c.n} lançamento(s)</span>
                    </span>
                    <span className="font-bold tabular-nums text-[var(--color-text-primary)]">{formatCurrency(c.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      <NovaOperacaoModal isOpen={novaOpen} onClose={() => setNovaOpen(false)} defaultType="Pagar" />
    </PageContainer>
  );
}
