import { useState } from "react";
import { Card } from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";
import { useLocalization } from "../../../../contexts/LocalizationContext";
import { Send, CheckCircle2, ArrowUpRight, FileText } from "lucide-react";
import { DrillDownPanel, type DrillColumn } from "../../../../components/ui/DrillDownPanel";

interface PropostasKpisValue {
  aguardandoAceite: number;
  aguardandoAceiteRows?: any[];
  convertidasMes: number;
  convertidasMesRows?: any[];
  taxaConversao: number;
  propostasAtivas: number;
  propostasAtivasRows?: any[];
}

// Os quatro números já vêm calculados de src/pages/crm/usePropostasList.ts
// (query server-side, não o array de propostas inteiro) — este componente só
// formata e renderiza. "Convertidas (Mês)" é sempre o mês corrente de verdade,
// independente do filtro de data aplicado na tela (indicador fixo, não a lista filtrada).
export function PropostasKPIs({ kpis }: { kpis: PropostasKpisValue }) {
  const { formatCurrency } = useLocalization();
  const [drillIndex, setDrillIndex] = useState<number | null>(null);
  const columns: DrillColumn[] = [
    { header: "Cliente/Título", render: (p: any) => <span className="font-bold text-[var(--color-text-primary)]">{p.cliente || p.titulo || "—"}</span> },
    { header: "Status", render: (p: any) => <Badge variant="secondary">{p.status || "—"}</Badge> },
    { header: "Valor", render: (p: any) => formatCurrency(Number(p.valor) || 0), className: "text-right" },
  ];
  const stats = [
    { label: "Aguardando Aceite", value: formatCurrency(kpis.aguardandoAceite), icon: Send, color: "text-info", rows: kpis.aguardandoAceiteRows },
    { label: "Convertidas (Mês)", value: formatCurrency(kpis.convertidasMes), icon: CheckCircle2, color: "text-success", rows: kpis.convertidasMesRows },
    { label: "Taxa de Conversão", value: `${kpis.taxaConversao}%`, icon: ArrowUpRight, color: "text-[var(--color-primary-blue)]", rows: undefined as any[] | undefined },
    { label: "Propostas Ativas", value: kpis.propostasAtivas.toString(), icon: FileText, color: "text-warning", rows: kpis.propostasAtivasRows },
  ];
  const drillStat = drillIndex !== null ? stats[drillIndex] : null;

  return (
    <>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {stats.map((stat, i) => (
        <Card
          key={stat.label}
          onClick={stat.rows ? () => setDrillIndex(i) : undefined}
          className={`p-6 ${stat.rows ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all" : ""}`}
        >
          <stat.icon className={`w-5 h-5 ${stat.color} mb-4`} />
          <div className="text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic">{stat.value}</div>
          <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">{stat.label}</div>
        </Card>
      ))}
    </div>
    <DrillDownPanel
      isOpen={drillStat !== null}
      onClose={() => setDrillIndex(null)}
      title={drillStat?.label}
      rows={drillStat?.rows || []}
      columns={columns}
    />
    </>
  );
}
