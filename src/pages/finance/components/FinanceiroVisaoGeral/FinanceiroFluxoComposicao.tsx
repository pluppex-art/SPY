import { Card } from "../../../../components/ui/card";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useLocalization } from "../../../../contexts/LocalizationContext";

export interface FluxoPonto { name: string; receita: number; despesa: number; resultado: number }
export interface ComposicaoFatia { nome: string; valor: number }

const FATIA_CORES = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#94a3b8"];

const compact = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1000) return `${Math.round(v / 1000)}k`;
  return `${v}`;
};

interface Props {
  fluxo: FluxoPonto[];
  composicao: ComposicaoFatia[];
  /** Rótulo do mês da composição (ex.: "Outubro 2026"). */
  composicaoLabel: string;
}

/** Fluxo de caixa (receitas x despesas + resultado) e composição das receitas do mês — tudo a partir de lançamentos pagos. */
export function FinanceiroFluxoComposicao({ fluxo, composicao, composicaoLabel }: Props) {
  const { formatCurrency } = useLocalization();
  const total = composicao.reduce((s, c) => s + c.valor, 0);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
      <Card className="p-5 rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-sm font-black text-[var(--color-text-primary)]">
            Fluxo de Caixa <span className="font-normal text-[var(--color-text-muted)]">(Receitas x Despesas)</span>
          </h3>
          <div className="flex items-center gap-4 text-[11px] text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Receitas</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> Despesas</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> Resultado</span>
          </div>
        </div>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={fluxo} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} tickFormatter={compact} width={44} />
              <Tooltip
                formatter={(value: number, name: string) => [formatCurrency(value), name === "receita" ? "Receitas" : name === "despesa" ? "Despesas" : "Resultado"]}
                contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 12 }}
              />
              <Bar dataKey="receita" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Bar dataKey="despesa" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Line type="monotone" dataKey="resultado" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#fff", stroke: "#3b82f6", strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5 rounded-2xl">
        <h3 className="text-sm font-black text-[var(--color-text-primary)] mb-1">Composição das Receitas</h3>
        <p className="text-[11px] text-[var(--color-text-muted)] mb-3">Recebido em {composicaoLabel}, por categoria</p>
        {total <= 0 ? (
          <div className="h-[220px] flex items-center justify-center text-xs text-[var(--color-text-faint)] border border-dashed border-[var(--color-border-subtle)] rounded-xl">
            Nenhuma receita recebida no mês.
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative w-44 h-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={composicao} dataKey="valor" nameKey="nome" innerRadius={54} outerRadius={80} paddingAngle={2} stroke="none">
                    {composicao.map((_, i) => <Cell key={i} fill={FATIA_CORES[i % FATIA_CORES.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-sm font-black text-[var(--color-text-primary)] tabular-nums">{formatCurrency(total)}</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">Total</span>
              </div>
            </div>
            <ul className="flex-1 w-full space-y-2.5">
              {composicao.map((c, i) => (
                <li key={c.nome} className="flex items-center justify-between gap-3 text-xs border-b border-[var(--color-border-subtle)] pb-2 last:border-0">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: FATIA_CORES[i % FATIA_CORES.length] }} />
                    <span className="text-[var(--color-text-muted)] truncate">{c.nome}</span>
                  </span>
                  <span className="font-bold tabular-nums text-[var(--color-text-primary)]">{Math.round((c.valor / total) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
