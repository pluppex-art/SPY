import { useMemo } from "react";
import { Card } from "../../../../components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { PieChart as PieChartIcon, Layers, DollarSign, ListChecks, Clock, CalendarClock, ChevronRight } from "lucide-react";
import { useLocalization } from "../../../../contexts/LocalizationContext";
import { Sparkline } from "../../../../components/ui/sparkline";

const SETOR_PALETTE = ["#3b82f6", "#ef4444", "#10b981", "#a855f7", "#f59e0b", "#64748b"];
const STATUS_COLORS: Record<string, string> = { "Ativo": "var(--color-success)", "Em Implantação": "var(--color-warning)", "Inativo": "var(--color-danger)" };
const TOOLTIP_STYLE = { backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 11 };

function parseDateBR(br?: string | null): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br || "");
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

/** Resumo da Base de Clientes: distribuição por setor/situação (dado real,
 * mesmos clientes já na tela), MRR com tendência real reconstituída a partir
 * de datas de contrato (assinatura + cancelamento, ambas imutáveis — nunca
 * um histórico sintético), e próximas ações reais (implantação em
 * andamento, contratos vencendo). */
export function ClientesResumo({
  clientes, contracts, onFilterSetor, onFilterStatus,
}: {
  clientes: any[];
  contracts: any[];
  onFilterSetor: (s: string) => void;
  onFilterStatus: (s: string) => void;
}) {
  const { formatCurrency } = useLocalization();

  const porSetor = useMemo(() => {
    const map = new Map<string, number>();
    clientes.forEach((c) => { const k = c.industry || "Outros"; map.set(k, (map.get(k) || 0) + 1); });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, value, color: SETOR_PALETTE[i % SETOR_PALETTE.length] }));
  }, [clientes]);

  const porStatus = useMemo(() => {
    return ["Ativo", "Em Implantação", "Inativo"].map((s) => ({ name: s, value: clientes.filter((c) => c.status === s).length, color: STATUS_COLORS[s] }));
  }, [clientes]);

  const { mrrAtual, mrrDelta, mrrSparkline } = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 6 }, (_, i) => {
      const fimDoMes = new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 0);
      return (contracts || []).filter((ct: any) => {
        const signed = parseDateBR(ct.date);
        if (!signed || signed > fimDoMes) return false;
        if (ct.status === "Cancelado" && ct.cancelledAt) {
          const cancelled = new Date(ct.cancelledAt);
          if (!isNaN(cancelled.getTime()) && cancelled <= fimDoMes) return false;
        }
        return true;
      }).reduce((s: number, ct: any) => s + (Number(String(ct.mrr).replace(/[^\d,.-]/g, "").replace(",", ".")) || 0), 0);
    });
    const atual = buckets[buckets.length - 1];
    const anterior = buckets[buckets.length - 2];
    return { mrrAtual: atual, mrrDelta: anterior > 0 ? Math.round(((atual - anterior) / anterior) * 1000) / 10 : null, mrrSparkline: buckets };
  }, [contracts]);

  const emImplantacao = clientes.filter((c) => c.status === "Em Implantação").length;
  const vencendoEsteMes = useMemo(() => {
    const now = new Date();
    return (contracts || []).filter((ct: any) => {
      const end = parseDateBR(ct.endDate);
      return end && end.getMonth() === now.getMonth() && end.getFullYear() === now.getFullYear();
    }).length;
  }, [contracts]);

  const totalClientes = clientes.length || 1;
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-6">
      <Card className="p-5">
        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] mb-4 flex items-center gap-1.5"><PieChartIcon className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Distribuição por Setor</h3>
        {porSetor.length === 0 ? (
          <p className="text-xs text-[var(--color-text-faint)] italic">Sem clientes ainda.</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="relative h-[100px] w-[100px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={porSetor} cx="50%" cy="50%" innerRadius={30} outerRadius={46} paddingAngle={3} dataKey="value" stroke="none">
                    {porSetor.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-sm font-black text-[var(--color-text-primary)]">{clientes.length}</span>
                <span className="text-[8px] text-[var(--color-text-faint)] font-bold uppercase">clientes</span>
              </div>
            </div>
            <div className="flex-1 space-y-1.5 min-w-0">
              {porSetor.map((s) => (
                <button key={s.name} type="button" onClick={() => { onFilterSetor(s.name); scrollToTop(); }} className="w-full flex items-center gap-2 hover:opacity-70 transition-opacity">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="text-[11px] text-[var(--color-text-muted)] flex-1 text-left truncate">{s.name}</span>
                  <span className="text-[11px] font-bold text-[var(--color-text-primary)]">{Math.round((s.value / totalClientes) * 1000) / 10}%</span>
                  <span className="text-[10px] text-[var(--color-text-faint)] w-4 text-right">{s.value}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] mb-4 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Situação dos Clientes</h3>
        <div className="flex items-center gap-4">
          <div className="relative h-[100px] w-[100px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={porStatus} cx="50%" cy="50%" innerRadius={30} outerRadius={46} paddingAngle={3} dataKey="value" stroke="none">
                  {porStatus.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-sm font-black text-[var(--color-text-primary)]">{clientes.length}</span>
              <span className="text-[8px] text-[var(--color-text-faint)] font-bold uppercase">clientes</span>
            </div>
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            {porStatus.map((s) => (
              <button key={s.name} type="button" onClick={() => { onFilterStatus(s.name); scrollToTop(); }} className="w-full flex items-center gap-2 hover:opacity-70 transition-opacity">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="text-[11px] text-[var(--color-text-muted)] flex-1 text-left truncate">{s.name}</span>
                <span className="text-[11px] font-bold text-[var(--color-text-primary)]">{Math.round((s.value / totalClientes) * 1000) / 10}%</span>
                <span className="text-[10px] text-[var(--color-text-faint)] w-4 text-right">{s.value}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] mb-4 flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Receita Mensal (MRR)</h3>
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-2xl font-black text-[var(--color-text-primary)]">{formatCurrency(mrrAtual)}</div>
            {mrrDelta === null ? (
              <span className="text-[10px] text-[var(--color-text-faint)]">Sem dado de comparação</span>
            ) : (
              <span className={`text-[11px] font-bold ${mrrDelta > 0 ? "text-success" : mrrDelta < 0 ? "text-danger" : "text-[var(--color-text-muted)]"}`}>
                {mrrDelta > 0 ? "+" : ""}{mrrDelta}% vs. mês anterior
              </span>
            )}
          </div>
          <div className="text-[var(--color-primary-blue)]">
            <Sparkline data={mrrSparkline} className="w-20 h-9 shrink-0" />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] flex items-center gap-1.5"><ListChecks className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Próximas Ações</h3>
        </div>
        <div className="space-y-2">
          <button type="button" onClick={() => { onFilterStatus("Em Implantação"); scrollToTop(); }} disabled={emImplantacao === 0} className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface-elevated)] transition-colors disabled:opacity-50 disabled:cursor-default">
            <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-warning" /> {emImplantacao} implantação{emImplantacao === 1 ? "" : "ões"} em andamento</span>
            {emImplantacao > 0 && <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-faint)]" />}
          </button>
          <div className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[var(--color-surface-sunken)]">
            <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-2"><CalendarClock className="w-3.5 h-3.5 text-danger" /> {vencendoEsteMes} contrato{vencendoEsteMes === 1 ? "" : "s"} vencendo este mês</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
