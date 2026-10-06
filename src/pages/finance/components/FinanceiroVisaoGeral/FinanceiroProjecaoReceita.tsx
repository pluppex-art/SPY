import { useState, type ReactNode } from "react";
import { Card } from "../../../../components/ui/card";
import { useLocalization } from "../../../../contexts/LocalizationContext";
import type { RevenueProjectionResult } from "../../../../lib/revenueMetrics";
import { DrillDownPanel, type DrillColumn } from "../../../../components/ui/DrillDownPanel";
import { contractDrillColumns } from "../../../../components/ui/drillColumns";

interface FinanceiroProjecaoReceitaProps {
  mrr: number;
  receitaAvulsa: number;
  clientesAtivos: number;
  churnRate: number;
  projection: RevenueProjectionResult;
  /** Listas reais por trás de MRR Ativo/Receita Avulsa/Clientes Ativos —
   * card fica clicável quando presente. Ausente = sem interação (Taxa de
   * Churn nunca recebe lista, é uma razão sem array 1:1). */
  mrrRows?: any[];
  receitaAvulsaRows?: any[];
  clientesAtivosRows?: any[];
}

/**
 * Receita Recorrente vs Avulsa + projeção real de MRR — separado do resto do
 * painel porque mistura duas coisas que antes viviam espalhadas: o "MRR" que
 * cada tela calculava do seu jeito, e uma "projeção" que era só receita do
 * mês * 1.1 (chute fixo). Aqui a projeção vem de getRevenueProjection, que só
 * mostra número quando há histórico real o suficiente pra sustentar a conta —
 * REALIZADO e PROJETADO nunca se misturam na mesma linha.
 */
export function FinanceiroProjecaoReceita({ mrr, receitaAvulsa, clientesAtivos, churnRate, projection, mrrRows, receitaAvulsaRows, clientesAtivosRows }: FinanceiroProjecaoReceitaProps) {
  const { formatCurrency } = useLocalization();
  const [drillKey, setDrillKey] = useState<"mrr" | "avulsa" | "clientes" | null>(null);
  const contractColumns = contractDrillColumns(formatCurrency, "mrr");
  const financeEntryColumns: DrillColumn[] = [
    { header: "Descrição", render: (f: any) => <span className="font-bold text-[var(--color-text-primary)]">{f.description || f.category || "—"}</span> },
    { header: "Categoria", render: (f: any) => f.category || "—" },
    { header: "Data", render: (f: any) => f.date || "—" },
    { header: "Valor", render: (f: any) => formatCurrency(f.value || 0), className: "text-right" },
  ];
  const drillConfig: Record<string, { title: string; rows: any[]; columns: DrillColumn[] }> = {
    mrr: { title: "MRR Ativo", rows: mrrRows || [], columns: contractColumns },
    avulsa: { title: "Receita Avulsa (Setup)", rows: receitaAvulsaRows || [], columns: financeEntryColumns },
    clientes: { title: "Clientes Ativos", rows: clientesAtivosRows || [], columns: contractColumns },
  };

  let projectionSection: ReactNode;
  if (projection.insufficientData) {
    projectionSection = (
      <div className="py-6 text-center text-xs text-[var(--color-text-faint)] border border-dashed border-[var(--color-border-subtle)] rounded-[var(--radius-control)]">
        Dados insuficientes para projeção — é preciso pelo menos 2 meses de histórico de contratos.
      </div>
    );
  } else {
    // Cast explícito em vez de depender de narrowing de union discriminada —
    // este projeto roda com strictNullChecks desligado (tsconfig.json), e sem
    // isso o TS não estreita `projection` pro branch `insufficientData: false`
    // mesmo dentro do else de um if/else convencional.
    const { monthlyChurnRate, months } = projection as Extract<RevenueProjectionResult, { insufficientData: false }>;
    projectionSection = (
      <div>
        <p className="text-[11px] text-[var(--color-text-muted)] mb-3">
          Projeção de MRR · churn mensal observado: {monthlyChurnRate}%
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {months.map((m) => (
            <div key={m.month} className="border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] p-3 text-center">
              <p className="text-[10px] text-[var(--color-text-faint)] mb-1">{m.label}</p>
              <p className="text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">{formatCurrency(m.mrr)}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Receita Recorrente &amp; Projeção</h3>
        <span className="text-[11px] text-[var(--color-text-faint)]">MRR considera só valor recorrente ativo — implantação/setup fica de fora</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <button type="button" onClick={() => mrrRows && setDrillKey("mrr")} className={`text-left ${mrrRows ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"}`}>
          <p className="text-[11px] text-[var(--color-text-muted)] mb-1">MRR Ativo</p>
          <p className="text-lg font-semibold tabular-nums text-[var(--color-text-primary)]">{formatCurrency(mrr)}</p>
        </button>
        <button type="button" onClick={() => receitaAvulsaRows && setDrillKey("avulsa")} className={`text-left ${receitaAvulsaRows ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"}`}>
          <p className="text-[11px] text-[var(--color-text-muted)] mb-1">Receita Avulsa (Setup)</p>
          <p className="text-lg font-semibold tabular-nums text-[var(--color-text-primary)]">{formatCurrency(receitaAvulsa)}</p>
        </button>
        <button type="button" onClick={() => clientesAtivosRows && setDrillKey("clientes")} className={`text-left ${clientesAtivosRows ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"}`}>
          <p className="text-[11px] text-[var(--color-text-muted)] mb-1">Clientes Ativos</p>
          <p className="text-lg font-semibold tabular-nums text-[var(--color-text-primary)]">{clientesAtivos}</p>
        </button>
        <div>
          <p className="text-[11px] text-[var(--color-text-muted)] mb-1">Taxa de Churn</p>
          <p className="text-lg font-semibold tabular-nums text-[var(--color-danger)]">{churnRate.toFixed(1)}%</p>
        </div>
      </div>

      {projectionSection}

      <DrillDownPanel
        isOpen={drillKey !== null}
        onClose={() => setDrillKey(null)}
        title={drillKey ? drillConfig[drillKey].title : undefined}
        rows={drillKey ? drillConfig[drillKey].rows : []}
        columns={drillKey ? drillConfig[drillKey].columns : []}
      />
    </Card>
  );
}
