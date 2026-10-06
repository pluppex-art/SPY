import { useMemo, useState } from "react";
import { Card } from "../../../../components/ui/card";
import { Users, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { DrillDownPanel } from "../../../../components/ui/DrillDownPanel";
import { clienteDrillColumns } from "../../../../components/ui/drillColumns";
import { Sparkline } from "../../../../components/ui/sparkline";

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
  /** Array completo (todosRows) de novo, só que usado aqui pra montar os
   * buckets mensais reais (created_at) da sparkline/delta — nunca um
   * histórico sintético. */
  clientes: any[];
}

function pctDelta(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

export function ClientesKPIs({ total, ativos, implantacao, inativos, todosRows, ativosRows, implantacaoRows, inativosRows, clientes }: ClientesKPIsProps) {
  const [drillIndex, setDrillIndex] = useState<number | null>(null);
  const columns = clienteDrillColumns();

  // Buckets mensais reais sobre created_at (imutável) — pra cada status,
  // conta quantos clientes criados NAQUELE mês já têm, HOJE, esse status.
  // Mesma convenção já usada em usePropostasList.ts ("Convertidas (Mês)"):
  // não existe histórico de status no passado, então o proxy honesto é
  // olhar o status atual dos clientes criados em cada mês.
  const buckets = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const y = d.getFullYear(), m = d.getMonth();
      const upToEndOfMonth = clientes.filter((c: any) => {
        const cd = c.created_at ? new Date(c.created_at) : null;
        if (!cd || isNaN(cd.getTime())) return false;
        return cd.getFullYear() < y || (cd.getFullYear() === y && cd.getMonth() <= m);
      });
      return {
        total: upToEndOfMonth.length,
        ativos: upToEndOfMonth.filter((c: any) => c.status === "Ativo").length,
        implantacao: upToEndOfMonth.filter((c: any) => c.status === "Em Implantação").length,
        inativos: upToEndOfMonth.filter((c: any) => c.status === "Inativo").length,
      };
    });
  }, [clientes]);
  const atual = buckets[buckets.length - 1];
  const anterior = buckets[buckets.length - 2];

  const items = [
    { label: "Total de Clientes", value: total, icon: Users, color: "text-[var(--color-primary-blue)]", rows: todosRows, spark: buckets.map((b) => b.total), delta: pctDelta(atual.total, anterior.total) },
    { label: "Clientes Ativos", value: ativos, icon: CheckCircle2, color: "text-success", rows: ativosRows, spark: buckets.map((b) => b.ativos), delta: pctDelta(atual.ativos, anterior.ativos) },
    { label: "Em Implantação", value: implantacao, icon: Clock, color: "text-warning", rows: implantacaoRows, spark: buckets.map((b) => b.implantacao), delta: pctDelta(atual.implantacao, anterior.implantacao) },
    { label: "Inativos", value: inativos, icon: AlertCircle, color: "text-danger", rows: inativosRows, spark: buckets.map((b) => b.inativos), delta: pctDelta(atual.inativos, anterior.inativos) },
  ];
  const drillItem = drillIndex !== null ? items[drillIndex] : null;

  return (
    <>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {items.map(({ label, value, icon: Icon, color, rows, spark, delta }, i) => (
        <Card
          key={label}
          onClick={rows ? () => setDrillIndex(i) : undefined}
          className={`p-4 ${rows ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all" : ""}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Icon className={`w-4 h-4 ${color}`} />
            <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">{label}</span>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="text-2xl font-display font-black text-[var(--color-text-primary)]">{value}</div>
              {delta === null ? (
                <span className="text-[10px] text-[var(--color-text-faint)]">Sem dado de comparação</span>
              ) : (
                <span className={`text-[11px] font-bold ${delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-[var(--color-text-muted)]"}`}>
                  {delta > 0 ? "+" : ""}{delta}% vs. mês anterior
                </span>
              )}
            </div>
            <div className={color}>
              <Sparkline data={spark} className="w-14 h-7 shrink-0" />
            </div>
          </div>
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
