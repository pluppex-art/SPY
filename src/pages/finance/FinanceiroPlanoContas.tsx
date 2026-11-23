import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Layers, TrendingUp, TrendingDown, CheckCircle2, CircleDashed, FolderTree, Copy } from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { Pagination } from "../../components/ui/Pagination";
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
  const [classe, setClasse] = useState("");
  const [pagina, setPagina] = useState(0);
  const POR_PAGINA = 15;

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
    (!classe || (c.tipo === "Despesa" && (c.subtipo ?? "SEM") === classe)) &&
    (!uso || (uso === "usadas" ? emUso(c.id) : !emUso(c.id))),
  );
  // Receitas primeiro, depois despesas por classificação; dentro de cada uma, as mais usadas no topo.
  const ordemSub = (c: Categoria) => (c.tipo === "Receita" ? -1 : SUBTIPOS.findIndex((g) => g.id === (c.subtipo ?? "SEM")));
  const ordenadas = [...visiveis].sort((a, b) =>
    ordemSub(a) - ordemSub(b) ||
    (usoPorCategoria.get(b.id)?.qtd ?? 0) - (usoPorCategoria.get(a.id)?.qtd ?? 0) ||
    a.nome.localeCompare(b.nome, "pt-BR"));
  const totalPaginas = Math.max(1, Math.ceil(ordenadas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const daPagina = ordenadas.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA);
  useEffect(() => { setPagina(0); }, [busca, tipo, uso, classe]);
  const maiorQtd = Math.max(1, ...categorias.map((c) => usoPorCategoria.get(c.id)?.qtd ?? 0));
  const rotuloClasse = (c: Categoria) => (c.tipo === "Receita" ? "Receita" : (SUBTIPOS.find((g) => g.id === (c.subtipo ?? "SEM"))?.label ?? "—"));

  // Cadastros repetidos (mesmo nome e tipo): sobra uma cópia; a que tem lançamentos nunca é apagada.
  const duplicadasSemUso = useMemo(() => {
    const grupos = new Map<string, Categoria[]>();
    for (const c of categorias) {
      const k = `${c.tipo}::${c.nome.trim().toLowerCase()}`;
      grupos.set(k, [...(grupos.get(k) ?? []), c]);
    }
    const apagar: Categoria[] = [];
    for (const lista of grupos.values()) {
      if (lista.length < 2) continue;
      const usadas = lista.filter((c) => emUso(c.id));
      const manter = usadas.length > 0 ? usadas : [lista[0]];
      for (const c of lista) if (!manter.includes(c) && !emUso(c.id)) apagar.push(c);
    }
    return apagar;
  }, [categorias, usoPorCategoria]); // eslint-disable-line react-hooks/exhaustive-deps
  const ehDuplicada = useMemo(() => new Set(duplicadasSemUso.map((c) => c.id)), [duplicadasSemUso]);

  const limparDuplicadas = async () => {
    if (!(await confirmDialog({
      title: "Remover categorias repetidas",
      description: `Foram encontradas ${duplicadasSemUso.length} categoria(s) repetida(s) e sem nenhum lançamento. Elas serão excluídas e a cópia original de cada uma fica. Essa ação não pode ser desfeita.`,
    }))) return;
    duplicadasSemUso.forEach((c) => deleteFinanceCategory(c.id));
    toast.success(`${duplicadasSemUso.length} categoria(s) repetida(s) removida(s).`);
  };

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
      <tr key={c.id} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-[var(--color-text-primary)] truncate">{c.nome}</span>
            {ehDuplicada.has(c.id) && <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--color-warning)]/15 text-[var(--color-warning)] shrink-0">Repetida</span>}
          </div>
        </td>
        <td className="px-4 py-2.5 whitespace-nowrap">
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${c.tipo === "Receita" ? "bg-[var(--color-success)]/12 text-[var(--color-success)]" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]"}`}>{rotuloClasse(c)}</span>
        </td>
        <td className="px-4 py-2.5 w-[34%]">
          {usada ? (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 min-w-[60px] max-w-[160px] rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
                <div className={`h-full rounded-full ${c.tipo === "Receita" ? "bg-[var(--color-success)]" : "bg-[var(--color-primary-blue)]"}`} style={{ width: `${Math.max(8, (u!.qtd / maiorQtd) * 100)}%` }} />
              </div>
              <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums whitespace-nowrap">{u!.qtd} lanç.{u!.valor > 0 ? ` · ${formatCurrency(u!.valor)}` : ""}</span>
            </div>
          ) : <span className="text-[11px] text-[var(--color-text-faint)]">Sem uso</span>}
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center justify-end gap-1">
            <button type="button" onClick={() => { setEditando(c); setModalAberto(true); }} title="Editar" aria-label={`Editar ${c.nome}`} className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => excluir(c)} title={usada ? "Em uso: não pode excluir" : "Excluir"} aria-label={`Excluir ${c.nome}`} className={`p-1.5 rounded-lg cursor-pointer ${usada ? "text-[var(--color-text-faint)] opacity-50" : "text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"}`}><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </td>
      </tr>
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
          activeCount={(busca ? 1 : 0) + (tipo ? 1 : 0) + (uso ? 1 : 0) + (classe ? 1 : 0)}
          onClear={() => { setBusca(""); setTipo(""); setUso(""); setClasse(""); }}
        >
          <FilterBar>
            <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar categoria..." />
            <FilterSelect value={tipo} onChange={(v) => { setTipo(v); if (v !== "Despesa") setClasse(""); }} allLabel="Receitas e despesas" options={[{ value: "Receita", label: "Só receitas" }, { value: "Despesa", label: "Só despesas" }]} />
            <FilterSelect value={classe} onChange={(v) => { setClasse(v); if (v) setTipo("Despesa"); }} allLabel="Todas as classificações" options={SUBTIPOS.map((g) => ({ value: g.id, label: g.label }))} />
            <FilterSelect value={uso} onChange={setUso} allLabel="Com ou sem uso" options={[{ value: "usadas", label: "Em uso" }, { value: "sem-uso", label: "Sem uso" }]} />
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
          <SecaoCard
            titulo={`Categorias (${ordenadas.length})`}
            icon={FolderTree}
            semPadding
            direita={duplicadasSemUso.length > 0 ? (
              <Button variant="outline" onClick={limparDuplicadas} className="h-7 px-2.5 text-[11px] font-medium gap-1.5 print:hidden"><Copy className="w-3 h-3" /> Remover {duplicadasSemUso.length} repetida(s) sem uso</Button>
            ) : undefined}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                  <tr><th className="px-4 py-2.5">Categoria</th><th className="px-4 py-2.5">Classificação</th><th className="px-4 py-2.5">Uso nos lançamentos</th><th className="px-4 py-2.5 text-right">Ações</th></tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {daPagina.length === 0
                    ? <tr><td colSpan={4} className="px-4 py-10 text-center text-[var(--color-text-faint)]">Nenhuma categoria neste filtro.</td></tr>
                    : daPagina.map(linha)}
                </tbody>
              </table>
            </div>
            <div className="px-4 pb-3">
              <Pagination page={paginaAtual} totalPages={totalPaginas} total={ordenadas.length} pageSize={POR_PAGINA} onPageChange={setPagina} itemLabel="categoria" />
            </div>
          </SecaoCard>
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
