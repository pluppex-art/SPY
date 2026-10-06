import { useState } from "react";
import { Card } from "../../../../components/ui/card";
import { useLocalization } from "../../../../contexts/LocalizationContext";
import { FileText, DollarSign, AlertCircle, TrendingUp } from "lucide-react";
import { DrillDownPanel } from "../../../../components/ui/DrillDownPanel";
import { contractDrillColumns } from "../../../../components/ui/drillColumns";

interface ContractsKPIsProps {
  totalMRR: number;
  ativos: number;
  inadimplentes: number;
  /** Listas reais por trás de MRR Total/Contratos Ativos/Inadimplência —
   * cards ficam clicáveis e abrem um drill-down com a lista correspondente.
   * "Retenção Estimada" continua sem lista (hardcoded, sem fonte real). */
  mrrRows?: any[];
  ativosRows?: any[];
  inadimplentesRows?: any[];
}

export function ContractsKPIs({ totalMRR, ativos, inadimplentes, mrrRows, ativosRows, inadimplentesRows }: ContractsKPIsProps) {
  const { formatCurrency } = useLocalization();
  const [drillIndex, setDrillIndex] = useState<number | null>(null);
  const columns = contractDrillColumns(formatCurrency, "mrr");
  const items = [
    { label: "MRR Total", value: formatCurrency(totalMRR), icon: DollarSign, color: "text-[var(--color-primary-blue)]", rows: mrrRows },
    { label: "Contratos Ativos", value: ativos, icon: FileText, color: "text-info", rows: ativosRows },
    { label: "Inadimplência", value: inadimplentes, icon: AlertCircle, color: "text-danger", rows: inadimplentesRows },
    { label: "Retenção Estimada", value: "96.8%", icon: TrendingUp, color: "text-success", rows: undefined as any[] | undefined },
  ];
  const drillItem = drillIndex !== null ? items[drillIndex] : null;

  return (
    <>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {items.map(({ label, value, icon: Icon, color, rows }, i) => (
        <Card
          key={label}
          onClick={rows ? () => setDrillIndex(i) : undefined}
          className={`p-6 ${rows ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all" : ""}`}
        >
          <Icon className={`w-5 h-5 ${color} mb-4`} />
          <div className="text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic">{value}</div>
          <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">{label}</div>
        </Card>
      ))}
    </div>
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
