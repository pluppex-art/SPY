import { useState } from "react";
import { Card } from "../../../../components/ui/card";
import { Users, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { DrillDownPanel } from "../../../../components/ui/DrillDownPanel";
import { clienteDrillColumns } from "../../../../components/ui/drillColumns";

interface ClientesKPIsProps {
  total: number;
  ativos: number;
  implantacao: number;
  inativos: number;
  /** Listas reais por trás dos 4 números acima — cards ficam clicáveis e
   * abrem um drill-down com a lista correspondente. */
  todosRows?: any[];
  ativosRows?: any[];
  implantacaoRows?: any[];
  inativosRows?: any[];
}

export function ClientesKPIs({ total, ativos, implantacao, inativos, todosRows, ativosRows, implantacaoRows, inativosRows }: ClientesKPIsProps) {
  const [drillIndex, setDrillIndex] = useState<number | null>(null);
  const columns = clienteDrillColumns();
  const items = [
    { label: "Total", value: total, icon: Users, color: "text-[var(--color-primary-blue)]", rows: todosRows },
    { label: "Ativos", value: ativos, icon: CheckCircle2, color: "text-success", rows: ativosRows },
    { label: "Em Implantação", value: implantacao, icon: Clock, color: "text-warning", rows: implantacaoRows },
    { label: "Inativos", value: inativos, icon: AlertCircle, color: "text-danger", rows: inativosRows },
  ];
  const drillItem = drillIndex !== null ? items[drillIndex] : null;

  return (
    <>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
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
