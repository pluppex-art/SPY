import { useMemo, useState } from "react";
import { Card } from "../../../../components/ui/card";
import { useLocalization } from "../../../../contexts/LocalizationContext";
import { FileText, DollarSign, AlertCircle, TrendingUp } from "lucide-react";
import { DrillDownPanel } from "../../../../components/ui/DrillDownPanel";
import { contractDrillColumns } from "../../../../components/ui/drillColumns";
import { FinanceKpiGrid } from "../../../finance/components/FinanceKpiGrid";

interface ContractsKPIsProps {
  /** Valor total contratado (recorrente + avulso) dos contratos ativos —
   * revenueMetrics.getFaturamentoContratado, não getMRR (que é só a parcela
   * recorrente). */
  valorAtivos: number;
  ativos: number;
  inadimplentes: number;
  /** Listas reais por trás de Valor/Contratos Ativos/Inadimplência — cards
   * ficam clicáveis e abrem um drill-down com a lista correspondente. */
  mrrRows?: any[];
  ativosRows?: any[];
  inadimplentesRows?: any[];
  /** Array completo de contratos — usado só aqui pra reconstituir os
   * buckets mensais reais (assinatura/cancelamento, ambos imutáveis) da
   * sparkline/delta de cada card, sem nenhum histórico sintético. */
  contracts: any[];
}

function parseDateBR(br?: string | null): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br || "");
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

function pctDelta(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

export function ContractsKPIs({ valorAtivos, ativos, inadimplentes, mrrRows, ativosRows, inadimplentesRows, contracts }: ContractsKPIsProps) {
  const { formatCurrency } = useLocalization();
  const [drillIndex, setDrillIndex] = useState<number | null>(null);
  const columns = contractDrillColumns(formatCurrency, "totalValue");

  // Buckets dos últimos 6 meses, reconstituídos a partir de datas reais de
  // contrato (assinatura em `date`, cancelamento em `cancelledAt`) — nunca
  // um histórico sintético. Pra cada fim de mês passado: quais contratos já
  // estavam assinados e ainda não tinham sido cancelados naquele momento.
  const buckets = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const fimDoMes = new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 0);
      const inicioDoMes = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const ativosNoFim = contracts.filter((c: any) => {
        const signed = parseDateBR(c.date);
        if (!signed || signed > fimDoMes) return false;
        if (c.status === "Cancelado" && c.cancelledAt) {
          const cancelled = new Date(c.cancelledAt);
          if (!isNaN(cancelled.getTime()) && cancelled <= fimDoMes) return false;
        }
        return true;
      });
      const ativosNoInicio = contracts.filter((c: any) => {
        const signed = parseDateBR(c.date);
        if (!signed || signed >= inicioDoMes) return false;
        if (c.status === "Cancelado" && c.cancelledAt) {
          const cancelled = new Date(c.cancelledAt);
          if (!isNaN(cancelled.getTime()) && cancelled < inicioDoMes) return false;
        }
        return true;
      });
      const canceladosNoMes = contracts.filter((c: any) => {
        if (!c.cancelledAt) return false;
        const cancelled = new Date(c.cancelledAt);
        return !isNaN(cancelled.getTime()) && cancelled >= inicioDoMes && cancelled <= fimDoMes;
      });
      const novosNoMes = contracts.filter((c: any) => {
        const signed = parseDateBR(c.date);
        return signed && signed >= inicioDoMes && signed <= fimDoMes;
      });
      const valor = ativosNoFim.reduce((s: number, c: any) => {
        const mrrValue = Number(String(c.mrr).replace(/[^\d,.-]/g, "").replace(",", ".")) || 0;
        return s + Math.max(Number(c.totalValue) || 0, mrrValue);
      }, 0);
      const retencao = ativosNoInicio.length > 0 ? 100 - Math.round((canceladosNoMes.length / ativosNoInicio.length) * 1000) / 10 : null;
      return { valor, count: ativosNoFim.length, novos: novosNoMes.length, retencao };
    });
  }, [contracts]);

  const atual = buckets[buckets.length - 1];
  const anterior = buckets[buckets.length - 2];
  const carteiraAtiva = Math.max(1, ativos);

  const valorDelta = pctDelta(atual.valor, anterior.valor);
  const retencaoDeltaPP = atual.retencao !== null && anterior.retencao !== null ? Math.round((atual.retencao - anterior.retencao) * 10) / 10 : null;

  const items = [
    { label: "Valor Contratos Ativos", value: formatCurrency(valorAtivos), icon: DollarSign, color: "text-[var(--color-primary-blue)]", rows: mrrRows, spark: buckets.map((b) => b.valor), footer: valorDelta === null ? "Sem dado de comparação" : `${valorDelta > 0 ? "+" : ""}${valorDelta}% vs. mês anterior` },
    { label: "Contratos Ativos", value: String(ativos), icon: FileText, color: "text-info", rows: ativosRows, spark: buckets.map((b) => b.count), footer: `+${atual.novos} novo${atual.novos === 1 ? "" : "s"} este mês` },
    { label: "Inadimplência", value: String(inadimplentes), icon: AlertCircle, color: "text-danger", rows: inadimplentesRows, spark: undefined, footer: `${Math.round((inadimplentes / carteiraAtiva) * 1000) / 10}% da carteira` },
    { label: "Retenção Estimada", value: atual.retencao !== null ? `${atual.retencao}%` : "—", icon: TrendingUp, color: "text-success", rows: undefined as any[] | undefined, spark: buckets.map((b) => b.retencao ?? 100), footer: retencaoDeltaPP === null ? "Sem dado de comparação" : `${retencaoDeltaPP > 0 ? "+" : ""}${retencaoDeltaPP} p.p. vs. mês anterior` },
  ];
  const drillItem = drillIndex !== null ? items[drillIndex] : null;

  return (
    <>
    <FinanceKpiGrid
      noDeltaLabel="Sem base p/ comparação"
      cards={items.map((it, i) => ({
        label: it.label,
        value: it.value,
        icon: it.icon,
        delta: i === 0 ? valorDelta : i === 1 ? pctDelta(atual.count, anterior.count) : i === 3 ? retencaoDeltaPP : null,
        deltaSuffix: i === 3 ? " p.p." : "%",
        goodUp: i === 2 ? false : i === 0 || i === 1 || i === 3 ? true : null,
        series: it.spark ?? [],
        footer: i === 1 || i === 2 ? it.footer : i === 0 ? "vs. mês anterior" : "vs. mês anterior",
        hideDelta: i === 2,
        danger: i === 2 && inadimplentes > 0,
        onClick: it.rows ? () => setDrillIndex(i) : undefined,
      }))}
    />
    <DrillDownPanel
      isOpen={drillItem !== null}
      onClose={() => setDrillIndex(null)}
      title={drillItem?.label}
      rows={drillItem?.rows || []}
      columns={columns}
    />
    </>
  );
}
