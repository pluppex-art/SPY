import { useMemo, useState } from "react";
import { Card } from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";
import { useLocalization } from "../../../../contexts/LocalizationContext";
import { Send, CheckCircle2, ArrowUpRight, FileText, DollarSign } from "lucide-react";
import { DrillDownPanel, type DrillColumn } from "../../../../components/ui/DrillDownPanel";
import { Sparkline } from "../../../../components/ui/sparkline";
import { contractDrillColumns } from "../../../../components/ui/drillColumns";

interface PropostasKpisValue {
  valorEmPropostas: number; valorEmPropostasDelta: number | null; valorEmPropostasRows: any[];
  convertidasMes: number; convertidasMesDelta: number | null; convertidasMesRows: any[];
  taxaConversao: number; taxaConversaoDeltaPP: number | null;
  propostasAtivas: number; propostasAtivasRows: any[]; propostasTotal: number;
  volumeSparkline: number[]; valorSparkline: number[]; convertidasSparkline: number[]; taxaConversaoSparkline: number[];
}

function parseDateBR(br?: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br || "");
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

function DeltaLabel({ deltaPct, deltaPP, colorGoodUp = true }: { deltaPct?: number | null; deltaPP?: number | null; colorGoodUp?: boolean }) {
  const delta = deltaPct ?? deltaPP;
  const suffix = deltaPP !== undefined ? "p.p." : "%";
  if (delta === null || delta === undefined) {
    return <span className="text-[10px] text-[var(--color-text-faint)]">Sem dado de comparação</span>;
  }
  const good = colorGoodUp ? delta >= 0 : delta <= 0;
  return (
    <span className={`text-[11px] font-bold ${delta === 0 ? "text-[var(--color-text-muted)]" : good ? "text-success" : "text-danger"}`}>
      {delta > 0 ? "+" : ""}{delta} {suffix} vs mês anterior
    </span>
  );
}

// Os KPIs de propostas já vêm calculados de src/pages/crm/usePropostasList.ts
// (buckets mensais reais sobre created_at, não um histórico sintético) —
// "Receita Confirmada" (contratos) é calculada aqui porque `contracts` já
// está em memória via useData() no componente pai (Propostas.tsx), sem
// precisar de uma query própria.
export function PropostasKPIs({ kpis, contracts }: { kpis: PropostasKpisValue; contracts: any[] }) {
  const { formatCurrency } = useLocalization();
  const [drillIndex, setDrillIndex] = useState<number | null>(null);

  const propostaColumns: DrillColumn[] = [
    { header: "Cliente/Título", render: (p: any) => <span className="font-bold text-[var(--color-text-primary)]">{p.cliente || p.titulo || "—"}</span> },
    { header: "Status", render: (p: any) => <Badge variant="secondary">{p.status || "—"}</Badge> },
    { header: "Valor", render: (p: any) => formatCurrency(Number(p.valor) || 0), className: "text-right" },
  ];
  const contractColumns = contractDrillColumns(formatCurrency, "totalValue");

  const { receitaConfirmada, receitaConfirmadaDelta, receitaConfirmadaRows, receitaSparkline } = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const y = d.getFullYear(), m = d.getMonth();
      const doMes = (contracts || []).filter((c: any) => {
        const cd = parseDateBR(c.date);
        return cd && cd.getFullYear() === y && cd.getMonth() === m;
      });
      const valor = doMes.reduce((s, c: any) => {
        const mrrValue = Number(String(c.mrr).replace(/[^\d,.-]/g, "").replace(",", ".")) || 0;
        return s + Math.max(Number(c.totalValue) || 0, mrrValue);
      }, 0);
      return { valor, rows: doMes };
    });
    const atual = buckets[buckets.length - 1];
    const anterior = buckets[buckets.length - 2];
    const delta = anterior.valor > 0 ? Math.round(((atual.valor - anterior.valor) / anterior.valor) * 1000) / 10 : null;
    return { receitaConfirmada: atual.valor, receitaConfirmadaDelta: delta, receitaConfirmadaRows: atual.rows, receitaSparkline: buckets.map((b) => b.valor) };
  }, [contracts]);

  const stats: { label: string; value: string; icon: typeof Send; color: string; spark: number[]; rows: any[] | undefined; columns: DrillColumn[]; hint?: string; deltaPct?: number | null; deltaPP?: number | null }[] = [
    { label: "Valor em Propostas", value: formatCurrency(kpis.valorEmPropostas), deltaPct: kpis.valorEmPropostasDelta, icon: Send, color: "text-[var(--color-primary-blue)]", spark: kpis.valorSparkline, rows: kpis.valorEmPropostasRows, columns: propostaColumns },
    { label: "Propostas Convertidas", value: formatCurrency(kpis.convertidasMes), deltaPct: kpis.convertidasMesDelta, icon: CheckCircle2, color: "text-success", spark: kpis.convertidasSparkline, rows: kpis.convertidasMesRows, columns: propostaColumns },
    { label: "Taxa de Conversão", value: `${kpis.taxaConversao}%`, deltaPP: kpis.taxaConversaoDeltaPP, icon: ArrowUpRight, color: "text-warning", spark: kpis.taxaConversaoSparkline, rows: undefined, columns: propostaColumns },
    { label: "Propostas Ativas", value: String(kpis.propostasAtivas), hint: `de ${kpis.propostasTotal} no total`, icon: FileText, color: "text-info", spark: kpis.volumeSparkline, rows: kpis.propostasAtivasRows, columns: propostaColumns },
    { label: "Receita Confirmada (Contratos)", value: formatCurrency(receitaConfirmada), deltaPct: receitaConfirmadaDelta, icon: DollarSign, color: "text-success", spark: receitaSparkline, rows: receitaConfirmadaRows, columns: contractColumns },
  ];
  const drillStat = drillIndex !== null ? stats[drillIndex] : null;

  return (
    <>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
      {stats.map((stat, i) => (
        <Card
          key={stat.label}
          onClick={stat.rows ? () => setDrillIndex(i) : undefined}
          className={`p-4 ${stat.rows ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all" : ""}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <stat.icon className={`w-4 h-4 ${stat.color}`} />
            <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">{stat.label}</span>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xl font-display font-black text-[var(--color-text-primary)] truncate">{stat.value}</div>
              {stat.hint ? (
                <span className="text-[11px] text-[var(--color-text-muted)]">{stat.hint}</span>
              ) : (
                <DeltaLabel deltaPct={stat.deltaPct} deltaPP={stat.deltaPP} />
              )}
            </div>
            <div className={stat.color}>
              <Sparkline data={stat.spark} className="w-14 h-7 shrink-0" />
            </div>
          </div>
        </Card>
      ))}
    </div>
    <DrillDownPanel
      isOpen={drillStat !== null}
      onClose={() => setDrillIndex(null)}
      title={drillStat?.label}
      rows={drillStat?.rows || []}
      columns={drillStat?.columns || propostaColumns}
    />
    </>
  );
}
