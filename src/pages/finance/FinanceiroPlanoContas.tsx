import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Layers, TrendingUp, TrendingDown, CheckCircle2, CircleDashed, FolderTree } from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { FilterBar, FilterSearch, FilterChips } from "../../components/ui/kpi-filter-card";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { NovoPlanoContasModal, type FinanceCategorySubtipo } from "../../components/ui/modals/settings/NovoPlanoContasModal";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { SecaoCard } from "./components/SecaoCard";

type Categoria = { id: string; nome: string; tipo: "Receita" | "Despesa"; subtipo: FinanceCategorySubtipo | null };

const SUBTIPOS: { id: FinanceCategorySubtipo | "SEM"; label: string; ajuda: string }[] = [
  { id: "DESPESA_FIXA", label: "Despesas fixas", ajuda: "Todo mês, quase no mesmo valor (aluguel, internet)" },
  { id: "DESPESA_VARIAVEL", label: "Despesas variáveis", ajuda: "Mudam conforme a operação (comissão, frete, insumos)" },
  { id: "PESSOAS", label: "Pessoas", ajuda: "Salários, encargos e benefícios" },
  { id: "IMPOSTOS", label: "Impostos", ajuda: "Tributos e taxas" },
  { id: "SEM", label: "Sem classificação", ajuda: "Defina o tipo para o DRE separar os custos" },
];

/**
 * Plano de Contas (categorias financeiras). Cada categoria mostra quantos lançamentos e quanto já
 * passou por ela, para ficar claro o que está em uso; categoria usada não pode ser excluída
 * (deixaria lançamentos órfãos e quebraria o DRE).
 */
export default function FinanceiroPlanoContas() {
  const { financeCategories, addFinanceCategory, updateFinanceCategory, deleteFinanceCategory, financeEntries, ensureNicheModulesLoaded } = useData();
  const { formatCurrency } = useLocalization();
  useEffect(() => { ensureNicheModulesLoaded(); }, [ensureNicheModulesLoaded]);

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Categoria | null>(null);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  const [uso, setUso] = useState("");

  const categorias: Categoria[] = useMemo(
    () => (financeCategories as any[]).map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, subtipo: c.subtipo ?? null })),
    [financeCategories],
  );

  // Quanto cada categoria já movimentou (só lançamentos pagos somam valor).
  const usoPorCategoria = useMemo(() => {
    const m = new Map<string, { qtd: number; valor: number }>();
    for (const e of financeEntries as any[]) {
      if (!e.category_id) continue;
      const cur = m.get(e.category_id) ?? { qtd: 0, valor: 0 };
      cur.qtd += 1;
      if (e.status === "Pago") cur.valor += Number(e.value) || 0;
      m.set(e.category_id, cur);
    }
    return m;
  }, [financeEntries]);

  const emUso = (id: string) => (usoPorCategoria.get(id)?.qtd ?? 0) > 0;
  const q = busca.trim().toLowerCase();
  const visiveis = categorias.filter((c) =>
    (!q || c.nome.toLowerCase().includes(q)) &&
    (!tipo || c.tipo === tipo) &&
    (!uso || (uso === "usadas" ? emUso(c.id) : !emUso(c.id))),
  );
  const ordenar = (a: Categoria, b: Categoria) =>
    (usoPorCategoria.get(b.id)?.qtd ?? 0) - (usoPorCategoria.get(a.id)?.qtd ?? 0) || a.nome.localeCompare(b.nome, "pt-BR");

  const receitas = visiveis.filter((c) => c.tipo === "Receita").sort(ordenar);
  const despesas = visiveis.filter((c) => c.tipo === "Despesa");
  const maiorQtd = Math.max(1, ...categorias.map((c) => usoPorCategoria.get(c.id)?.qtd ?? 0));

  const salvar = (data: { nome: string; tipo: "Receita" | "Despesa"; subtipo: FinanceCategorySubtipo | null }) => {
    if (editando) { updateFinanceCategory(editando.id, data); toast.success("Categoria atualizada."); }
    else { addFinanceCategory(data); toast.success("Categoria cadastrada."); }
    setModalAberto(false); setEditando(null);
  };
  const excluir = async (c: Categoria) => {
    if (emUso(c.id)) { toast.error("Esta categoria tem lançamentos vinculados e não pode ser excluída."); return; }
    if (!(await confirmDialog({ title: "Excluir categoria", description: `Excluir "${c.nome}"? Essa ação não pode ser desfeita.` }))) return;
    deleteFinanceCategory(c.id);
    toast.success("Categoria excluída.");
  };

  const linha = (c: Categoria) => {
    const u = usoPorCategoria.get(c.id);
    const usada = !!u && u.qtd > 0;
    return (
      <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">{c.nome}</span>
            {!usada && <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-text-faint)] shrink-0">Sem uso</span>}
          </div>
          {usada && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1 flex-1 max-w-[180px] rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
                <div className={`h-full rounded-full ${c.tipo === "Receita" ? "bg-[var(--color-success)]" : "bg-[var(--color-primary-blue)]"}`} style={{ width: `${Math.max(6, (u!.qtd / maiorQtd) * 100)}%` }} />
              </div>
              <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums whitespace-nowrap">{u!.qtd} lançamento{u!.qtd === 1 ? "" : "s"}{u!.valor > 0 ? ` · ${formatCurrency(u!.valor)}` : ""}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => { setEditando(c); setModalAberto(true); }} title="Editar" aria-label={`Editar ${c.nome}`} className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => excluir(c)} title={usada ? "Em uso: não pode excluir" : "Excluir"} aria-label={`Excluir ${c.nome}`} className={`p-1.5 rounded-lg cursor-pointer ${usada ? "text-[var(--color-text-faint)] opacity-50" : "text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"}`}><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </li>
    );
  };

  const vazio = (texto: string) => <p className="px-4 py-8 text-center text-xs text-[var(--color-text-faint)]">{texto}</p>;
  const nenhuma = categorias.length === 0;

  return (
    <PageContainer
      title="Plano de Contas"
      description="As categorias classificam cada receita e despesa. É por elas que o DRE, o orçamento e os relatórios separam para onde o dinheiro vai."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Plano de Contas" }]}
      actions={<Button onClick={() => { setEditando(null); setModalAberto(true); }} className="h-9 px-4 text-xs font-medium gap-1.5"><Plus className="w-3.5 h-3.5" /> Nova Categoria</Button>}
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <FinanceKpiFilter
          id="finPlanoContas"
          kpis={[
            { label: "Categorias", value: categorias.length, icon: Layers, tone: "primary" },
            { label: "Receitas", value: categorias.filter((c) => c.tipo === "Receita").length, icon: TrendingUp, tone: "success" },
            { label: "Despesas", value: categorias.filter((c) => c.tipo === "Despesa").length, icon: TrendingDown, tone: "danger" },
            { label: "Em uso", value: categorias.filter((c) => emUso(c.id)).length, icon: CheckCircle2, tone: "info", hint: "Têm ao menos um lançamento" },
            { label: "Sem uso", value: categorias.filter((c) => !emUso(c.id)).length, icon: CircleDashed, tone: "neutral", hint: "Podem ser excluídas" },
          ]}
          activeCount={(busca ? 1 : 0) + (tipo ? 1 : 0) + (uso ? 1 : 0)}
          onClear={() => { setBusca(""); setTipo(""); setUso(""); }}
        >
          <FilterBar>
            <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar categoria..." />
            <FilterChips value={tipo} onChange={setTipo} options={[{ value: "Receita", label: "Receitas" }, { value: "Despesa", label: "Despesas" }]} />
            <FilterChips value={uso} onChange={setUso} options={[{ value: "usadas", label: "Em uso" }, { value: "sem-uso", label: "Sem uso" }]} />
          </FilterBar>
        </FinanceKpiFilter>

        {nenhuma ? (
          <SecaoCard titulo="Plano de Contas" icon={FolderTree}>
            <div className="py-10 text-center">
              <p className="text-sm font-bold text-[var(--color-text-primary)]">Nenhuma categoria ainda</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1 mb-4">Crie as categorias de receita e de despesa para classificar os lançamentos.</p>
              <Button onClick={() => { setEditando(null); setModalAberto(true); }} className="h-9 px-4 text-xs font-medium gap-1.5"><Plus className="w-3.5 h-3.5" /> Nova Categoria</Button>
            </div>
          </SecaoCard>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2 items-start">
            {tipo !== "Despesa" && (
              <SecaoCard titulo={`Receitas (${receitas.length})`} icon={TrendingUp} semPadding>
                {receitas.length === 0 ? vazio("Nenhuma categoria de receita neste filtro.") : <ul className="divide-y divide-[var(--color-border-subtle)] list-none p-0 m-0">{receitas.map(linha)}</ul>}
              </SecaoCard>
            )}
            {tipo !== "Receita" && (
              <SecaoCard titulo={`Despesas (${despesas.length})`} icon={TrendingDown} semPadding>
                {despesas.length === 0 ? vazio("Nenhuma categoria de despesa neste filtro.") : (
                  <div className="divide-y divide-[var(--color-border-default)]">
                    {SUBTIPOS.map((g) => {
                      const itens = despesas.filter((c) => (c.subtipo ?? "SEM") === g.id).sort(ordenar);
                      if (itens.length === 0) return null;
                      return (
                        <section key={g.id}>
                          <header className="px-4 py-2 bg-[var(--color-surface-sunken)]/60 flex items-baseline gap-2">
                            <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-primary)] m-0">{g.label}</h4>
                            <span className="text-[10px] text-[var(--color-text-faint)] truncate">{g.ajuda}</span>
                          </header>
                          <ul className="divide-y divide-[var(--color-border-subtle)] list-none p-0 m-0">{itens.map(linha)}</ul>
                        </section>
                      );
                    })}
                  </div>
                )}
              </SecaoCard>
            )}
          </div>
        )}
      </div>

      <NovoPlanoContasModal
        isOpen={modalAberto}
        onClose={() => { setModalAberto(false); setEditando(null); }}
        onSave={salvar}
        title={editando ? "Editar Categoria Financeira" : undefined}
        submitText={editando ? "Salvar Alterações" : undefined}
        initialValue={editando}
      />
    </PageContainer>
  );
}
