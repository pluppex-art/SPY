import { useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Users, Target, ShoppingCart, DollarSign, RefreshCw, AlertTriangle,
  Radio, Package, Globe2, Trophy, Sparkles, ChevronRight,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { parseCurrencyBR } from "../../lib/utils";
import { useDashboard } from "./useDashboard";
import { RevenueBreadcrumb } from "./components/RevenueBreadcrumb";
import { computeChannelRevenue, computeProductRevenue, computeSegmentRevenue } from "./revenueInsights";

const SEGMENT_PALETTE = [
  "var(--color-primary-blue)", "#14b8a6", "#f59e0b", "#64748b", "#ec4899", "#94a3b8",
];

export default function MapaDaReceita() {
  const { contracts, proposals, proposalItems, products, clienteBase } = useData();
  const { leads, totalRevenue, faturamentoContratado, salesRanking, dateFrom, setDateFrom, dateTo, setDateTo } = useDashboard();
  const { formatCurrency } = useLocalization();

  const oportunidades = useMemo(() => (leads as any[]).filter((l) => parseCurrencyBR(l.value) > 0), [leads]);
  const vendas = useMemo(() => (leads as any[]).filter((l) => l.status === "Fechado"), [leads]);
  const contratosEmRisco = useMemo(() => (contracts as any[]).filter((c) => c.status === "Inadimplente"), [contracts]);
  const valorEmRisco = contratosEmRisco.reduce((s, c) => s + parseCurrencyBR(c.mrr), 0);

  const fluxo = useMemo(() => {
    const totalLeads = leads.length || 1;
    return [
      { icon: Users, label: "Leads", value: leads.length, sub: null as string | null },
      { icon: Target, label: "Oportunidades", value: oportunidades.length, sub: `${Math.round((oportunidades.length / totalLeads) * 1000) / 10}% de conversão` },
      { icon: ShoppingCart, label: "Vendas", value: vendas.length, sub: `${oportunidades.length > 0 ? Math.round((vendas.length / oportunidades.length) * 1000) / 10 : 0}% de conversão` },
      { icon: DollarSign, label: "Receita", value: formatCurrency(faturamentoContratado), sub: vendas.length > 0 ? `Ticket médio ${formatCurrency(faturamentoContratado / vendas.length)}` : null },
      { icon: RefreshCw, label: "Retenção (MRR)", value: formatCurrency(totalRevenue), sub: faturamentoContratado > 0 ? `${Math.round((totalRevenue / faturamentoContratado) * 1000) / 10}% da receita` : null },
      { icon: AlertTriangle, label: "Em Risco", value: formatCurrency(valorEmRisco), sub: `${contratosEmRisco.length} contrato${contratosEmRisco.length === 1 ? "" : "s"}` },
    ];
  }, [leads.length, oportunidades.length, vendas.length, faturamentoContratado, totalRevenue, valorEmRisco, contratosEmRisco.length, formatCurrency]);

  const canais = useMemo(() => computeChannelRevenue(leads), [leads]);
  const produtos = useMemo(() => computeProductRevenue(proposals, proposalItems, products), [proposals, proposalItems, products]);
  const segmentos = useMemo(
    () => computeSegmentRevenue(contracts, clienteBase).map((s, i) => ({ ...s, color: SEGMENT_PALETTE[i % SEGMENT_PALETTE.length] })),
    [contracts, clienteBase]
  );
  const segmentoTotal = segmentos.reduce((s, v) => s + v.receita, 0);

  const insights = useMemo(() => {
    const lista: { icon: typeof Radio; texto: string }[] = [];
    const canalTopTicket = [...canais].filter((c) => c.fechados > 0).sort((a, b) => b.ticketMedio - a.ticketMedio)[0];
    const ticketMedioGeral = canais.reduce((s, c) => s + c.receita, 0) / Math.max(canais.reduce((s, c) => s + c.fechados, 0), 1);
    if (canalTopTicket && ticketMedioGeral > 0 && canalTopTicket.ticketMedio > ticketMedioGeral) {
      lista.push({ icon: Radio, texto: `Leads de ${canalTopTicket.origem} têm ticket médio ${(canalTopTicket.ticketMedio / ticketMedioGeral).toFixed(1)}× maior que a média.` });
    }
    const segmentoTop = segmentos[0];
    if (segmentoTop && segmentos.length > 1) {
      lista.push({ icon: Globe2, texto: `O segmento ${segmentoTop.segmento} responde por ${segmentoTop.pct}% da receita recorrente ativa.` });
    }
    const produtoTop = produtos[0];
    if (produtoTop) {
      lista.push({ icon: Package, texto: `${produtoTop.produto} é o produto/serviço que mais gera receita (${produtoTop.pct}% do total vendido).` });
    }
    const vendedorTop = salesRanking[0];
    if (vendedorTop) {
      lista.push({ icon: Trophy, texto: `${vendedorTop.name} lidera o ranking de vendas, com ${formatCurrency(vendedorTop.total)} em negócios fechados.` });
    }
    return lista.slice(0, 4);
  }, [canais, segmentos, produtos, salesRanking, formatCurrency]);

  return (
    <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <RevenueBreadcrumb current="Mapa da Receita" />
          <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] mt-1 flex items-center gap-2">
            Mapa da Receita <span className="w-2 h-2 rounded-full bg-[var(--color-primary-blue)]" />
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Veja como sua empresa ganha dinheiro, de onde vem a receita e onde estão as maiores oportunidades.</p>
        </div>
        <DateRangeFilter dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
      </div>

      {/* Fluxo da Receita */}
      <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
        <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-4">Fluxo da Receita</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {fluxo.map((f, i) => (
            <div key={f.label} className="relative">
              <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-3.5">
                <f.icon className="w-4 h-4 text-[var(--color-primary-blue)] mb-2" />
                <p className="text-[9px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">{f.label}</p>
                <p className="text-base font-black text-[var(--color-text-primary)] font-mono mt-0.5 truncate">{f.value}</p>
                {f.sub && <p className="text-[10px] text-[var(--color-text-muted)] font-semibold mt-0.5">{f.sub}</p>}
              </div>
              {i < fluxo.length - 1 && (
                <ChevronRight className="hidden xl:block absolute top-1/2 -right-3.5 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)]" />
              )}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="p-4 border-b border-[var(--color-border-subtle)]">
            <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider">Receita por Canal de Origem</h3>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Qual canal traz mais receita pro seu negócio.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                <tr><th className="px-4 py-2">Canal</th><th className="px-4 py-2">Receita</th><th className="px-4 py-2">Conv.</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {canais.map((c) => (
                  <tr key={c.origem}>
                    <td className="px-4 py-2 font-bold text-[var(--color-text-primary)] truncate max-w-[110px]">{c.origem}</td>
                    <td className="px-4 py-2 font-mono text-[var(--color-text-primary)]">{formatCurrency(c.receita)}</td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{c.conversao}%</td>
                  </tr>
                ))}
                {canais.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-[var(--color-text-faint)]">Sem leads ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="p-4 border-b border-[var(--color-border-subtle)]">
            <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider">Receita por Produto/Serviço</h3>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Quais produtos geram mais receita.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                <tr><th className="px-4 py-2">Produto</th><th className="px-4 py-2">Receita</th><th className="px-4 py-2">Margem</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {produtos.map((p) => (
                  <tr key={p.produto}>
                    <td className="px-4 py-2 font-bold text-[var(--color-text-primary)] truncate max-w-[110px]">{p.produto}</td>
                    <td className="px-4 py-2 font-mono text-[var(--color-text-primary)]">{formatCurrency(p.receita)}</td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{p.margem !== null ? `${p.margem}%` : "—"}</td>
                  </tr>
                ))}
                {produtos.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-[var(--color-text-faint)]">Nenhuma proposta aceita com itens ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col">
          <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-1">Receita por Segmento</h3>
          <p className="text-[10px] text-[var(--color-text-muted)] mb-3">Em quais segmentos sua empresa mais ganha.</p>
          {segmentos.length === 0 ? (
            <p className="text-xs text-[var(--color-text-faint)] italic flex-1 flex items-center justify-center">Sem contratos ativos ainda</p>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="relative h-[110px] w-[110px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={segmentos} cx="50%" cy="50%" innerRadius={34} outerRadius={52} paddingAngle={3} dataKey="receita" stroke="none">
                      {segmentos.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 11 }} formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[11px] font-black text-[var(--color-text-primary)] font-mono">{formatCurrency(segmentoTotal)}</span>
                </div>
              </div>
              <div className="w-full space-y-1.5">
                {segmentos.slice(0, 5).map((s) => (
                  <div key={s.segmento} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-[10px] text-[var(--color-text-muted)] font-semibold truncate flex-1">{s.segmento}</span>
                    <span className="text-[10px] font-bold text-[var(--color-text-primary)] tabular-nums">{s.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3 overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
            <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider">Receita por Vendedor</h3>
            <Badge variant="secondary">{salesRanking.length}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                <tr><th className="px-4 py-2.5">Vendedor</th><th className="px-4 py-2.5">Receita</th><th className="px-4 py-2.5">Negócios</th><th className="px-4 py-2.5">Ticket Médio</th><th className="px-4 py-2.5">Taxa</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {salesRanking.map((v) => (
                  <tr key={v.name}>
                    <td className="px-4 py-2.5 font-bold text-[var(--color-text-primary)] truncate max-w-[160px]">{v.name}</td>
                    <td className="px-4 py-2.5 font-mono text-[var(--color-text-primary)]">{formatCurrency(v.total)}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{v.deals}</td>
                    <td className="px-4 py-2.5 font-mono text-[var(--color-text-muted)]">{formatCurrency(v.deals > 0 ? v.total / v.deals : 0)}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{v.rate}%</td>
                  </tr>
                ))}
                {salesRanking.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--color-text-faint)]">Nenhum negócio fechado ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="lg:col-span-2 p-5 bg-gradient-to-br from-[var(--color-primary-blue)] to-[var(--color-primary-blue)]/70 border-none text-white">
          <div className="flex items-center gap-2 mb-3"><Sparkles className="w-4 h-4" /><h3 className="text-xs font-black uppercase tracking-wider">Insights da Aurora</h3></div>
          {insights.length === 0 ? (
            <p className="text-xs text-white/70 italic">Ainda não há dado suficiente pra identificar padrões.</p>
          ) : (
            <div className="space-y-2.5">
              {insights.map((ins, i) => (
                <div key={i} className="flex items-start gap-2.5 bg-white/10 rounded-xl px-3.5 py-2.5">
                  <ins.icon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-white/80" />
                  <p className="text-xs leading-relaxed">{ins.texto}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
