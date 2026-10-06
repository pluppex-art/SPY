import { useState } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  ArrowDownLeft, ArrowUpRight, Search, Download,
  CheckCircle2, Clock, AlertTriangle, Scale,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { StatCell, StatCellRow } from "./components/StatCell";
import { useLocalization } from "../../contexts/LocalizationContext";
import { downloadCsv } from "../../lib/csvExport";
import { parseEntryDate } from "./lib/financeDates";
import { cn } from "../../lib/utils";
import { useFinanceTransacoesList } from "./useFinanceTransacoesList";
import { Pagination } from "../../components/ui/Pagination";
import { DrillDownPanel } from "../../components/ui/DrillDownPanel";
import { financeEntryDrillColumns } from "../../components/ui/drillColumns";

const STATUS_STYLE: Record<string, { icon: typeof CheckCircle2; className: string }> = {
  Pago: { icon: CheckCircle2, className: "bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/20" },
  Atrasado: { icon: AlertTriangle, className: "bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/20" },
  "A Vencer": { icon: Clock, className: "bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/20" },
};

/** Extrato consolidado (Pagar + Receber juntos) — visão só-leitura, filtro e
 * exportação. Para lançar/editar, use Despesas, Receitas, Contas a Pagar ou
 * Contas a Receber, que têm o formulário completo (GenericFinanceiroList). */
export default function FinanceiroTransacoes() {
  const { formatCurrency } = useLocalization();
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<"Todos" | "Entradas" | "Saídas">("Todos");

  // Busca/pagina direto no Supabase (50 por vez), ordenado por
  // date_normalized — em vez de carregar todo o array `financeEntries` do
  // DataContext e filtrar/ordenar no navegador. Ver useFinanceTransacoesList.ts.
  const {
    entries, total, totalEntradas, totalSaidas,
    page, setPage, totalPages, pageSize, loading, fetchAllForExport,
  } = useFinanceTransacoesList({ search, tipoFilter });

  const filtered = entries.map((t: any) => ({ ...t, __data: parseEntryDate(t.date) }));

  const handleExport = async () => {
    const all = await fetchAllForExport();
    downloadCsv(
      `extrato_transacoes_${Date.now()}.csv`,
      ["Descrição", "Tipo", "Categoria", "Data", "Status", "Valor (R$)"],
      all.map((t: any) => [t.description, t.type === "Receber" ? "Entrada" : "Saída", t.category, t.date, t.status, Number(t.value).toFixed(2)])
    );
  };

  // KPIs vêm de uma query própria (totais, sem os registros) e a página
  // visível é só 50 por vez — nenhum array completo em memória pra drillar
  // sincronamente. O clique dispara `fetchAllForExport()` (já existe, usada
  // no CSV) com os mesmos filtros atuais, e o painel mostra "Carregando..."
  // até a busca voltar.
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

  return (
    <PageContainer
      title="Todas as Movimentações"
      description="Extrato consolidado de receitas e despesas — para lançar ou editar, use Despesas, Receitas, Contas a Pagar ou Contas a Receber."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Todas as Movimentações" }]}
      actions={
        <Button variant="outline" onClick={handleExport} className="h-9 px-4 text-xs font-medium gap-1.5"><Download className="w-3.5 h-3.5" /> Exportar CSV</Button>
      }
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <StatCellRow>
          <StatCell label="Entradas (filtro atual)" value={formatCurrency(totalEntradas)} icon={ArrowUpRight} tone="success" onClick={() => openDrill("entradas")} />
          <StatCell label="Saídas (filtro atual)" value={formatCurrency(totalSaidas)} icon={ArrowDownLeft} tone="danger" onClick={() => openDrill("saidas")} />
          <StatCell label="Saldo (filtro atual)" value={formatCurrency(totalEntradas - totalSaidas)} icon={Scale} tone={totalEntradas - totalSaidas < 0 ? "danger" : "neutral"} />
          <StatCell label="Lançamentos" value={total} icon={Search} onClick={() => openDrill("total")} />
        </StatCellRow>

        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between print:hidden">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="Buscar por descrição, categoria ou contraparte..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] pl-10 pr-4 py-2 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-primary-blue)]"
            />
          </div>

          <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
            {(["Todos", "Entradas", "Saídas"] as const).map(tp => (
              <Button key={tp} size="sm" variant={tipoFilter === tp ? "default" : "ghost"} onClick={() => setTipoFilter(tp)} className="h-7 px-3 text-xs font-medium">{tp}</Button>
            ))}
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                <tr>
                  <th className="px-5 py-3">Descrição</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {filtered.map(t => {
                  const isEntrada = t.type === "Receber";
                  const status = STATUS_STYLE[t.status] ?? STATUS_STYLE["A Vencer"];
                  const StatusIcon = status.icon;
                  return (
                    <tr key={t.id} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
                      <td className="px-5 py-3 font-medium text-[var(--color-text-primary)]">{t.description}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border", isEntrada ? "bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/20" : "bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/20")}>
                          {isEntrada ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                          {isEntrada ? "Entrada" : "Saída"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">{t.category || "—"}</td>
                      <td className="px-4 py-3 font-mono text-[var(--color-text-muted)]">{t.__data ? t.__data.toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border", status.className)}>
                          <StatusIcon className="w-3 h-3" /> {t.status}
                        </span>
                      </td>
                      <td className={cn("px-5 py-3 text-right font-semibold tabular-nums", isEntrada ? "text-[var(--color-success)]" : "text-[var(--color-danger)]")}>
                        {isEntrada ? "+ " : "− "}{formatCurrency(t.value)}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[var(--color-text-faint)]">Nenhuma transação encontrada para os filtros selecionados.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          loading={loading}
          onPageChange={setPage}
          itemLabel="lançamento"
        />
      </div>

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
