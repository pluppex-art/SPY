import { useMemo, useState } from "react";
import { SeletorCompetencia } from "./components/SeletorCompetencia";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, FolderTree, Sparkles, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { FilterBar, FilterSearch, FilterChips, type KpiItem } from "../../components/ui/kpi-filter-card";
import { EmptyState } from "../../components/ui/empty-state";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { SecaoCard } from "./components/SecaoCard";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { parseEntryDate } from "./lib/financeDates";

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Categorias criadas de uma vez para quem ainda não montou o Plano de Contas. */
const CATEGORIAS_PADRAO: { nome: string; tipo: "Receita" | "Despesa"; subtipo: string | null }[] = [
  { nome: "Vendas", tipo: "Receita", subtipo: null },
  { nome: "Serviços", tipo: "Receita", subtipo: null },
  { nome: "Mensalidades", tipo: "Receita", subtipo: null },
  { nome: "Outras receitas", tipo: "Receita", subtipo: null },
  { nome: "Aluguel", tipo: "Despesa", subtipo: "DESPESA_FIXA" },
  { nome: "Utilidades (energia, internet)", tipo: "Despesa", subtipo: "DESPESA_FIXA" },
  { nome: "Software e assinaturas", tipo: "Despesa", subtipo: "DESPESA_FIXA" },
  { nome: "Folha de pagamento", tipo: "Despesa", subtipo: "PESSOAS" },
  { nome: "Comissões", tipo: "Despesa", subtipo: "PESSOAS" },
  { nome: "Impostos", tipo: "Despesa", subtipo: "IMPOSTOS" },
  { nome: "Marketing", tipo: "Despesa", subtipo: "DESPESA_VARIAVEL" },
  { nome: "Fornecedores e insumos", tipo: "Despesa", subtipo: "DESPESA_VARIAVEL" },
  { nome: "Equipamentos", tipo: "Despesa", subtipo: "DESPESA_VARIAVEL" },
  { nome: "Viagens e eventos", tipo: "Despesa", subtipo: "DESPESA_VARIAVEL" },
  { nome: "Outras despesas", tipo: "Despesa", subtipo: "DESPESA_VARIAVEL" },
];

interface Linha { categoria: any; orcado: number; realizado: number }

/**
 * Orçamentos — um valor por categoria a cada mês, comparado com o realizado. O realizado é sempre calculado
 * dos lançamentos pagos (finance_entries), nunca digitado. Despesas e receitas lado a lado, com saldo e % usado.
 */
export default function FinanceiroOrcamentos() {
  const { financeCategories, financeBudgets, financeEntries, upsertFinanceBudget, addFinanceCategory } = useData() as any;
  const { formatCurrency: brl } = useLocalization();

  const [refDate, setRefDate] = useState(() => new Date());
  const mes = monthKey(refDate);
  const mesLabel = `${MONTH_NAMES[refDate.getMonth()]} de ${refDate.getFullYear()}`;
  const mesAtualKey = monthKey(new Date());
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [criando, setCriando] = useState(false);

  const categorias = useMemo(() => (financeCategories as any[]).filter((c) => c.tipo === "Receita" || c.tipo === "Despesa"), [financeCategories]);

  // Realizado do mês: lançamentos pagos, por categoria — e, à parte, os pagos sem categoria vinculada.
  const { realizadoPorCategoria, semCategoria } = useMemo(() => {
    const map: Record<string, number> = {};
    const sem = { Despesa: 0, Receita: 0 };
    for (const e of financeEntries as any[]) {
      if (e.status !== "Pago") continue;
      const d = parseEntryDate(e.date);
      if (!d || monthKey(d) !== mes) continue;
      const v = Number(e.value) || 0;
      if (e.category_id) map[e.category_id] = (map[e.category_id] || 0) + v;
      else sem[e.type === "Pagar" ? "Despesa" : "Receita"] += v;
    }
    return { realizadoPorCategoria: map, semCategoria: sem };
  }, [financeEntries, mes]);

  const orcadoDoMes = (m: string) => {
    const map: Record<string, number> = {};
    for (const b of financeBudgets as any[]) if (b.mes === m) map[b.category_id] = Number(b.valor_orcado) || 0;
    return map;
  };
  const orcadoPorCategoria = useMemo(() => orcadoDoMes(mes), [financeBudgets, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  const linhasDe = (tipo: "Receita" | "Despesa"): Linha[] =>
    categorias.filter((c) => c.tipo === tipo).map((c) => ({ categoria: c, orcado: orcadoPorCategoria[c.id] || 0, realizado: realizadoPorCategoria[c.id] || 0 }))
      .sort((a, b) => b.realizado - a.realizado || b.orcado - a.orcado);
  const despesasTodas = linhasDe("Despesa");
  const receitasTodas = linhasDe("Receita");
  const q = busca.trim().toLowerCase();
  const filtra = (l: Linha) => !q || String(l.categoria.nome || "").toLowerCase().includes(q);

  const tot = (ls: Linha[], extra = 0) => ({ orcado: ls.reduce((a, l) => a + l.orcado, 0), realizado: ls.reduce((a, l) => a + l.realizado, 0) + extra });
  const tD = tot(despesasTodas, semCategoria.Despesa);
  const tR = tot(receitasTodas, semCategoria.Receita);
  const estourosDespesa = despesasTodas.filter((l) => l.orcado > 0 && l.realizado > l.orcado);
  const semOrcamento = despesasTodas.filter((l) => l.orcado === 0 && l.realizado > 0).length;
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

  const kpis: KpiItem[] = [
    { label: "Despesas — orçado", value: brl(tD.orcado), icon: Target, tone: "neutral", hint: tD.orcado > 0 ? `${pct(tD.realizado, tD.orcado)}% já utilizado` : "Defina o orçado por categoria" },
    { label: "Despesas — realizado", value: brl(tD.realizado), icon: TrendingDown, tone: tD.orcado > 0 && tD.realizado > tD.orcado ? "danger" : "warning", hint: tD.orcado > 0 ? `${tD.realizado > tD.orcado ? "Acima" : "Sobram"} ${brl(Math.abs(tD.orcado - tD.realizado))}` : undefined },
    { label: "Receitas — orçado", value: brl(tR.orcado), icon: Target, tone: "neutral", hint: tR.orcado > 0 ? `${pct(tR.realizado, tR.orcado)}% da meta` : "Defina a meta por categoria" },
    { label: "Receitas — realizado", value: brl(tR.realizado), icon: TrendingUp, tone: "success", hint: tR.orcado > 0 ? `${tR.realizado >= tR.orcado ? "Meta batida" : `Faltam ${brl(tR.orcado - tR.realizado)}`}` : undefined },
  ];
  const activeCount = (mes !== mesAtualKey ? 1 : 0) + (busca.trim() ? 1 : 0) + (tipoFiltro ? 1 : 0);
  const limpar = () => { setRefDate(new Date()); setBusca(""); setTipoFiltro(""); };

  const commitEdit = async (categoryId: string) => {
    const valor = Math.max(0, parseFloat(draftValue.replace(",", ".")) || 0);
    setEditingId(null);
    await upsertFinanceBudget(categoryId, mes, valor);
  };

  const copiarMesAnterior = async () => {
    const anterior = monthKey(new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1));
    const doAnterior = orcadoDoMes(anterior);
    const alvos = Object.entries(doAnterior).filter(([id, v]) => v > 0 && !(orcadoPorCategoria[id] > 0));
    if (alvos.length === 0) return toast.info("Nada para copiar: o mês anterior não tem orçamento, ou este mês já está preenchido.");
    for (const [id, v] of alvos) await upsertFinanceBudget(id, mes, v);
    toast.success(`${alvos.length} categoria(s) copiada(s) de ${MONTH_NAMES[(refDate.getMonth() + 11) % 12]}.`);
  };

  const criarPadrao = async () => {
    setCriando(true);
    try {
      for (const c of CATEGORIAS_PADRAO) await addFinanceCategory(c);
      toast.success(`${CATEGORIAS_PADRAO.length} categorias criadas. Agora defina o orçado de cada uma.`);
    } finally {
      setCriando(false);
    }
  };

  const tabela = (titulo: string, icon: typeof TrendingUp, ls: Linha[], total: { orcado: number; realizado: number }, semCat: number, despesa: boolean) => {
    const linhas = ls.filter(filtra);
    return (
      <SecaoCard titulo={titulo} icon={icon} semPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]/60 text-left text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="px-4 py-2.5 font-semibold">Categoria</th>
                <th className="px-3 py-2.5 text-right font-semibold">{despesa ? "Orçado" : "Meta"}</th>
                <th className="px-3 py-2.5 text-right font-semibold">Realizado</th>
                <th className="px-3 py-2.5 text-right font-semibold">Saldo</th>
                <th className="min-w-[7rem] px-3 py-2.5 font-semibold">Uso</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">Nenhuma categoria encontrada.</td></tr>
              )}
              {linhas.map(({ categoria, orcado, realizado }) => {
                const p = pct(realizado, orcado);
                const saldo = orcado - realizado;
                const ruim = despesa ? orcado > 0 && realizado > orcado : false;
                const cor = despesa ? (ruim ? "bg-rose-500" : p > 85 ? "bg-amber-500" : "bg-emerald-500") : p >= 100 ? "bg-emerald-500" : "bg-[var(--color-primary-blue)]";
                return (
                  <tr key={categoria.id} className="border-b border-[var(--color-border-default)] last:border-0">
                    <td className="px-4 py-2.5 font-medium">{categoria.nome}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {editingId === categoria.id ? (
                        <input
                          type="number" autoFocus min={0} step={50} value={draftValue}
                          onChange={(e) => setDraftValue(e.target.value)} onBlur={() => commitEdit(categoria.id)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingId(null); }}
                          className="h-8 w-28 rounded-md border border-[var(--color-primary-blue)]/50 bg-[var(--color-surface-sunken)] px-2 text-right text-xs tabular-nums focus:outline-none"
                          aria-label={`Orçado de ${categoria.nome}`}
                        />
                      ) : (
                        <button type="button" onClick={() => { setEditingId(categoria.id); setDraftValue(orcado > 0 ? String(orcado) : ""); }} className="rounded px-1.5 py-0.5 hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-primary-blue)]" title="Clique para definir o valor deste mês">
                          {orcado > 0 ? brl(orcado) : <span className="text-xs text-[var(--color-text-muted)] underline decoration-dotted">definir</span>}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{brl(realizado)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${orcado > 0 ? (saldo < 0 && despesa ? "font-semibold text-rose-600" : "text-[var(--color-text-muted)]") : "text-[var(--color-text-muted)]"}`}>{orcado > 0 ? brl(saldo) : "—"}</td>
                    <td className="px-3 py-2.5">
                      {orcado > 0 ? (
                        <>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border-default)]"><div className={`h-full ${cor}`} style={{ width: `${Math.min(p, 100)}%` }} /></div>
                          <span className={`text-xs ${ruim ? "font-semibold text-rose-600" : "text-[var(--color-text-muted)]"}`}>{p}%</span>
                        </>
                      ) : <span className="text-xs text-[var(--color-text-muted)]">sem valor</span>}
                    </td>
                  </tr>
                );
              })}
              {semCat > 0 && (
                <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]/40">
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]" colSpan={2}>Sem categoria vinculada <span className="text-xs">(lançamentos pagos sem categoria)</span></td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{brl(semCat)}</td><td colSpan={2} />
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--color-border-default)] font-bold">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{brl(total.orcado)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{brl(total.realizado)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${despesa && total.orcado > 0 && total.realizado > total.orcado ? "text-rose-600" : ""}`}>{total.orcado > 0 ? brl(total.orcado - total.realizado) : "—"}</td>
                <td className="px-3 py-2.5 text-xs">{total.orcado > 0 ? `${pct(total.realizado, total.orcado)}%` : ""}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SecaoCard>
    );
  };

  return (
    <PageContainer
      title="Orçamentos"
      description="Planeje um valor para cada categoria a cada mês e acompanhe o realizado, que vem direto dos lançamentos pagos."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link to="/app/financeiro/plano-contas"><Button variant="outline"><FolderTree className="mr-2 h-4 w-4" />Plano de Contas</Button></Link>
          <Button variant="outline" onClick={copiarMesAnterior} disabled={categorias.length === 0}><Copy className="mr-2 h-4 w-4" />Copiar mês anterior</Button>
        </div>
      }
    >
      {categorias.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhuma categoria cadastrada ainda"
          description="O orçamento é por categoria. Crie um conjunto básico de categorias de receitas e despesas agora, ou monte o seu em Plano de Contas."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={criarPadrao} disabled={criando}><Sparkles className="mr-2 h-4 w-4" />{criando ? "Criando…" : "Criar categorias padrão"}</Button>
              <Link to="/app/financeiro/plano-contas"><Button variant="outline">Abrir Plano de Contas</Button></Link>
            </div>
          }
        />
      ) : (
        <div className="mx-auto max-w-[1700px] space-y-4 pb-12">
          <FinanceKpiFilter id="finOrcamentos" kpis={kpis} activeCount={activeCount} onClear={limpar}>
            <FilterBar>
              <SeletorCompetencia mes={refDate} setMes={setRefDate} />
              <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar categoria..." />
              <FilterChips value={tipoFiltro} onChange={setTipoFiltro} options={[{ value: "Despesa", label: "Despesas" }, { value: "Receita", label: "Receitas" }]} />
            </FilterBar>
          </FinanceKpiFilter>

          {(estourosDespesa.length > 0 || semOrcamento > 0) && (
            <SecaoCard titulo="Atenção neste mês" icon={AlertTriangle} semPadding>
              <ul className="divide-y divide-[var(--color-border-default)] text-sm">
                {estourosDespesa.map((l) => (
                  <li key={l.categoria.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span><b>{l.categoria.nome}</b> passou do orçado</span>
                    <span className="font-semibold tabular-nums text-rose-600">+{brl(l.realizado - l.orcado)} ({pct(l.realizado, l.orcado)}%)</span>
                  </li>
                ))}
                {semOrcamento > 0 && (
                  <li className="px-4 py-2.5 text-[var(--color-text-muted)]">{semOrcamento} categoria(s) de despesa tiveram gasto, mas ainda não têm valor orçado neste mês.</li>
                )}
              </ul>
            </SecaoCard>
          )}

          <div className={`grid gap-4 ${tipoFiltro ? "" : "min-[1700px]:grid-cols-2"}`}>
            {tipoFiltro !== "Receita" && tabela("Despesas", TrendingDown, despesasTodas, tD, semCategoria.Despesa, true)}
            {tipoFiltro !== "Despesa" && tabela("Receitas", TrendingUp, receitasTodas, tR, semCategoria.Receita, false)}
          </div>

          <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <Wallet className="h-3.5 w-3.5 shrink-0" /> Clique no valor de uma categoria para definir ou editar. O realizado nunca é digitado: soma os lançamentos pagos do mês.
          </p>
        </div>
      )}
    </PageContainer>
  );
}
