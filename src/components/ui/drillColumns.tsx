import { Badge } from "./badge";
import { parseCurrencyBR } from "../../lib/utils";
import type { DrillColumn } from "./DrillDownPanel";

/** Mesmo critério de "ativo" usado em revenueMetrics.ts (getMRR/getFaturamentoContratado) — contrato que não está Cancelado nem Perdido. */
export const isContractAtivo = (c: any) => c.status !== "Cancelado" && c.status !== "Perdido";

/** Colunas padrão pra drill-down de uma lista de leads — reaproveitadas em todos os dashboards que têm card de KPI baseado em `leads`. */
export function leadDrillColumns(formatCurrency: (n: number) => string): DrillColumn[] {
  return [
    { header: "Nome", render: (l: any) => <span className="font-bold text-[var(--color-text-primary)]">{l.name || "—"}</span> },
    { header: "Empresa", render: (l: any) => l.company || "—" },
    { header: "Status", render: (l: any) => <Badge variant="secondary">{l.status || "—"}</Badge> },
    { header: "Origem", render: (l: any) => l.source || "—" },
    { header: "Vendedor", render: (l: any) => l.seller || "—" },
    { header: "Valor", render: (l: any) => <span className="font-mono">{formatCurrency(parseCurrencyBR(l.value))}</span>, className: "text-right" },
  ];
}

/** Colunas padrão pra drill-down de uma lista de contratos. `valueField` escolhe se a coluna de valor mostra MRR (parcela recorrente) ou Valor Total (recorrente + avulso) — mesma distinção de revenueMetrics.getMRR vs getFaturamentoContratado. */
export function contractDrillColumns(formatCurrency: (n: number) => string, valueField: "totalValue" | "mrr" = "mrr"): DrillColumn[] {
  return [
    { header: "Cliente", render: (c: any) => <span className="font-bold text-[var(--color-text-primary)]">{c.client || "—"}</span> },
    { header: "Plano", render: (c: any) => c.plan || "—" },
    { header: "Status", render: (c: any) => <Badge variant="secondary">{c.status || "—"}</Badge> },
    {
      header: valueField === "mrr" ? "MRR" : "Valor Total",
      render: (c: any) => {
        const mrrValue = parseCurrencyBR(c.mrr);
        const total = c.totalValue !== undefined && c.totalValue !== null ? Number(c.totalValue) : mrrValue;
        return <span className="font-mono">{formatCurrency(valueField === "mrr" ? mrrValue : Math.max(total, mrrValue))}</span>;
      },
      className: "text-right",
    },
  ];
}
