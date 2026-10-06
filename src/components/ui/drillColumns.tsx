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

/** Colunas padrão pra drill-down de uma lista de clientes (`clienteBase`). */
export function clienteDrillColumns(): DrillColumn[] {
  return [
    { header: "Nome", render: (c: any) => <span className="font-bold text-[var(--color-text-primary)]">{c.name || "—"}</span> },
    { header: "Setor", render: (c: any) => c.industry || "—" },
    { header: "Email", render: (c: any) => c.email || "—" },
    { header: "Telefone", render: (c: any) => c.phone || "—" },
    { header: "Status", render: (c: any) => <Badge variant="secondary">{c.status || "—"}</Badge> },
  ];
}

/** Colunas padrão pra drill-down de uma lista de lançamentos financeiros (`financeEntries`). */
export function financeEntryDrillColumns(formatCurrency: (n: number) => string): DrillColumn[] {
  return [
    { header: "Descrição", render: (f: any) => <span className="font-bold text-[var(--color-text-primary)]">{f.description || f.category || "—"}</span> },
    { header: "Categoria", render: (f: any) => f.category || "—" },
    { header: "Data", render: (f: any) => f.date || "—" },
    { header: "Status", render: (f: any) => <Badge variant="secondary">{f.status || "—"}</Badge> },
    { header: "Valor", render: (f: any) => <span className="font-mono">{formatCurrency(Number(f.value) || 0)}</span>, className: "text-right" },
  ];
}

/** Colunas padrão pra drill-down de uma lista de transferências (`financeTransfers`). `contaNome` resolve `conta_origem_id`/`conta_destino_id` pro nome da conta (mesmo resolver já usado nas telas de Transferências/Extrato). */
export function transferDrillColumns(formatCurrency: (n: number) => string, contaNome: (id: string) => string): DrillColumn[] {
  return [
    { header: "De → Para", render: (t: any) => <span className="font-bold text-[var(--color-text-primary)]">{contaNome(t.conta_origem_id)} → {contaNome(t.conta_destino_id)}</span> },
    { header: "Descrição", render: (t: any) => t.descricao || "—" },
    { header: "Data", render: (t: any) => t.data_pagamento ? new Date(t.data_pagamento + "T12:00:00").toLocaleDateString("pt-BR") : "—" },
    { header: "Status", render: (t: any) => <Badge variant="secondary">{t.pago ? "Pago" : "Pendente"}</Badge> },
    { header: "Valor", render: (t: any) => <span className="font-mono">{formatCurrency(Number(t.valor) || 0)}</span>, className: "text-right" },
  ];
}

/** Colunas padrão pra drill-down de uma lista de contas bancárias (`financeBankAccounts`). */
export function contaBancariaDrillColumns(formatCurrency: (n: number) => string, saldoPorConta?: Map<string, number>): DrillColumn[] {
  return [
    { header: "Nome", render: (c: any) => <span className="font-bold text-[var(--color-text-primary)]">{c.nome || c.name || "—"}</span> },
    { header: "Tipo", render: (c: any) => c.tipo || c.type || "—" },
    { header: "Saldo", render: (c: any) => <span className="font-mono">{formatCurrency(saldoPorConta?.get(c.id) ?? Number(c.saldo) ?? 0)}</span>, className: "text-right" },
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
