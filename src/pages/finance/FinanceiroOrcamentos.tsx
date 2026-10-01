import { useMemo, useState } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { Target, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Wallet } from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { parseEntryDate } from "./lib/financeDates";

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Orçamentos — Financeiro > Gestão. Não existia NENHUM conceito de "orçamento
 * por categoria e mês" na base antes disso (só coisas adjacentes sem relação:
 * squads.meta/orcamento_mensal e finance_centros_custo.orcamento, nenhuma com
 * recorte por mês nem ligada a finance_categories) — nova tabela
 * finance_budgets (ver migration 20260924_finance_budgets_table.sql).
 *
 * "Realizado" é sempre calculado a partir de finance_entries (status Pago,
 * date_normalized dentro do mês, mesma category_id) — nunca digitado à mão,
 * pra não divergir do resto do financeiro.
 */
export default function FinanceiroOrcamentos() {
  const { financeCategories, financeBudgets, financeEntries, upsertFinanceBudget } = useData();
  const { formatCurrency } = useLocalization();

  const [refDate, setRefDate] = useState(() => new Date());
  const mes = monthKey(refDate);
  const mesLabel = `${MONTH_NAMES[refDate.getMonth()]} de ${refDate.getFullYear()}`;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");

  const categoriasAtivas = useMemo(
    () => (financeCategories as any[]).filter((c) => c.tipo === "Receita" || c.tipo === "Despesa"),
    [financeCategories]
  );

  // Realizado por categoria, só pra este mês — uma passada só sobre
  // finance_entries (já carregado em memória pelo resto do app), sem query
  // nova nenhuma.
  const realizadoPorCategoria = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of financeEntries as any[]) {
      if (e.status !== "Pago" || !e.category_id) continue;
      const d = parseEntryDate(e.date);
      if (!d || monthKey(d) !== mes) continue;
      map[e.category_id] = (map[e.category_id] || 0) + (Number(e.value) || 0);
    }
    return map;
  }, [financeEntries, mes]);

  const orcadoPorCategoria = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of financeBudgets as any[]) {
      if (b.mes !== mes) continue;
      map[b.category_id] = Number(b.valor_orcado) || 0;
    }
    return map;
  }, [financeBudgets, mes]);

  const rows = (tipo: "Receita" | "Despesa") =>
    categoriasAtivas
      .filter((c) => c.tipo === tipo)
      .map((c) => ({
        categoria: c,
        orcado: orcadoPorCategoria[c.id] || 0,
        realizado: realizadoPorCategoria[c.id] || 0,
      }))
      .sort((a, b) => b.realizado - a.realizado || b.orcado - a.orcado);

  const despesaRows = rows("Despesa");
  const receitaRows = rows("Receita");

  const totalOrcadoDespesa = despesaRows.reduce((s, r) => s + r.orcado, 0);
  const totalRealizadoDespesa = despesaRows.reduce((s, r) => s + r.realizado, 0);
  const totalOrcadoReceita = receitaRows.reduce((s, r) => s + r.orcado, 0);
  const totalRealizadoReceita = receitaRows.reduce((s, r) => s + r.realizado, 0);

  const startEdit = (categoryId: string, current: number) => {
    setEditingId(categoryId);
    setDraftValue(current > 0 ? String(current) : "");
  };
  const commitEdit = async (categoryId: string) => {
    const valor = Math.max(0, parseFloat(draftValue.replace(",", ".")) || 0);
    setEditingId(null);
    await upsertFinanceBudget(categoryId, mes, valor);
  };

  const renderGrupo = (
    titulo: string,
    icon: typeof TrendingUp,
    rows: { categoria: any; orcado: number; realizado: number }[],
    totalOrcado: number,
    totalRealizado: number,
    accentColor: string
  ) => {
    const Icon = icon;
    return (
      <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-[var(--color-text-primary)] flex items-center gap-2">
            <Icon className={`w-4 h-4 ${accentColor}`} /> {titulo}
          </h3>
          <div className="text-right">
            <span className="text-[10px] text-[var(--color-text-faint)] font-bold uppercase block">Orçado / Realizado</span>
            <span className="text-sm font-mono font-black text-[var(--color-text-primary)]">
              {formatCurrency(totalOrcado)} <span className="text-[var(--color-text-faint)]">/</span>{" "}
              <span className={accentColor}>{formatCurrency(totalRealizado)}</span>
            </span>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-xs text-[var(--color-text-faint)] py-6 text-center">Nenhuma categoria cadastrada — configure em Financeiro &gt; Plano de Contas.</p>
        ) : (
          <div className="space-y-3">
            {rows.map(({ categoria, orcado, realizado }) => {
              const perc = orcado > 0 ? Math.round((realizado / orcado) * 100) : realizado > 0 ? 100 : 0;
              const estourou = orcado > 0 && realizado > orcado;
              const barColor = estourou ? "bg-danger" : perc > 85 ? "bg-warning" : "bg-success";
              return (
                <div key={categoria.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-[var(--color-text-primary)] truncate">{categoria.nome}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {editingId === categoria.id ? (
                        <input
                          type="number"
                          autoFocus
                          min={0}
                          step={50}
                          value={draftValue}
                          onChange={(e) => setDraftValue(e.target.value)}
                          onBlur={() => commitEdit(categoria.id)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          className="w-24 bg-[var(--color-surface-sunken)] border border-[var(--color-primary-blue)]/40 rounded px-2 py-0.5 text-xs font-mono text-right focus:outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(categoria.id, orcado)}
                          className="text-xs font-mono text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] hover:underline transition-colors"
                          title="Clique para definir o orçamento deste mês"
                        >
                          {orcado > 0 ? formatCurrency(orcado) : "Definir orçado"}
                        </button>
                      )}
                      <span className="text-[var(--color-text-faint)] text-xs">/</span>
                      <span className={`text-xs font-mono font-bold ${estourou ? "text-danger" : "text-[var(--color-text-primary)]"}`}>
                        {formatCurrency(realizado)}
                      </span>
                    </div>
                  </div>
                  {orcado > 0 && (
                    <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${Math.min(perc, 100)}%` }} />
                    </div>
                  )}
                  {estourou && (
                    <p className="text-[10px] text-danger font-semibold">
                      {formatCurrency(realizado - orcado)} acima do orçado ({perc}%)
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    );
  };

  return (
    <PageContainer
      title="Orçamentos"
      description="Planeje um valor por categoria a cada mês e acompanhe o realizado — calculado direto dos lançamentos pagos, nunca digitado à mão."
      actions={
        <div className="flex items-center gap-1.5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-2 py-1">
          <button type="button" onClick={() => setRefDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="p-1 rounded hover:bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold text-[var(--color-text-primary)] w-32 text-center capitalize">{mesLabel}</span>
          <button type="button" onClick={() => setRefDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="p-1 rounded hover:bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      }
    >
      {categoriasAtivas.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhuma categoria cadastrada ainda"
          description="Cadastre categorias em Financeiro > Plano de Contas antes de definir orçamentos por categoria."
        />
      ) : (
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-danger/10 flex items-center justify-center shrink-0">
                <TrendingDown className="w-4 h-4 text-danger" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-[var(--color-text-faint)] block">Despesas — Orçado x Realizado</span>
                <span className="text-sm font-mono font-black text-[var(--color-text-primary)]">
                  {formatCurrency(totalOrcadoDespesa)} <span className="text-[var(--color-text-faint)]">/</span>{" "}
                  <span className={totalRealizadoDespesa > totalOrcadoDespesa && totalOrcadoDespesa > 0 ? "text-danger" : "text-[var(--color-text-primary)]"}>
                    {formatCurrency(totalRealizadoDespesa)}
                  </span>
                </span>
              </div>
            </Card>
            <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4 text-success" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-[var(--color-text-faint)] block">Receitas — Orçado x Realizado</span>
                <span className="text-sm font-mono font-black text-[var(--color-text-primary)]">
                  {formatCurrency(totalOrcadoReceita)} <span className="text-[var(--color-text-faint)]">/</span>{" "}
                  <span className="text-success">{formatCurrency(totalRealizadoReceita)}</span>
                </span>
              </div>
            </Card>
          </div>

          {renderGrupo("Despesas", TrendingDown, despesaRows, totalOrcadoDespesa, totalRealizadoDespesa, "text-danger")}
          {renderGrupo("Receitas", TrendingUp, receitaRows, totalOrcadoReceita, totalRealizadoReceita, "text-success")}

          <p className="text-[10px] text-[var(--color-text-faint)] flex items-center gap-1.5">
            <Wallet className="w-3 h-3" /> Clique no valor orçado de qualquer categoria pra definir/editar. O realizado é sempre calculado a partir dos lançamentos pagos deste mês — nunca digitado.
          </p>
        </div>
      )}
    </PageContainer>
  );
}
