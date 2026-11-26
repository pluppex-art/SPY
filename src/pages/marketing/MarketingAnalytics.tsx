import { ehGastoMarketing } from "../../lib/gastoMarketing";
import { canalDoLead, normalizarCanal } from "../../lib/canalAquisicao";
import { supabase } from "../../lib/supabase";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { StatCard } from "../../components/ui/stat-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { EmptyState } from "../../components/ui/empty-state";
import { BarChart2, TrendingUp, Users, Target, Activity, DollarSign, Inbox, PieChart as PieChartIcon, Wallet, Mail, Link2, Megaphone, LayoutDashboard } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { useMemo, useState, useEffect } from "react";
import { useLocalization } from "../../contexts/LocalizationContext";
import { parseCurrencyBR } from "../../lib/utils";
import { AquisicaoPanel } from "./AquisicaoPanel";
import { GeradorLinkUtm } from "./GeradorLinkUtm";
import { EmailResumoPanel } from "./EmailResumoPanel";
import { apiFetch } from "../../lib/apiClient";
import { BotaoRelatorio } from "../../components/relatorio/BotaoRelatorio";

const COLORS = ['#3b82f6', '#f43f5e', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4'];
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface AnalyticsServerSummary {
  totalRevenue: number; totalSpent: number; totalLeads: number; closedLeads: number;
  cac: number; avgDeal: number; roi: number;
  sourceData: { name: string; revenue: number }[];
}

export default function MarketingAnalytics() {
  const { leads, financeEntries } = useData();
  const { activeTenantId } = useAuth();
  const { formatCurrency } = useLocalization();

  // KPIs + receita por canal vêm de um cache no Redis-SPY quando disponível
  // (GET /api/marketing/analytics-summary), mesma fórmula. O gráfico de
  // evolução mensal (performanceData, abaixo) continua 100% client-side —
  // agrupa só por nome do mês sem determinismo de ordem, não dá pra
  // replicar fielmente no servidor.
  const [serverSummary, setServerSummary] = useState<AnalyticsServerSummary | null>(null);
  useEffect(() => {
    setServerSummary(null);
    if (!activeTenantId) return;
    let cancelled = false;
    apiFetch(`/api/marketing/analytics-summary?tenantId=${encodeURIComponent(activeTenantId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setServerSummary(data); })
      .catch(() => { /* silencioso — cálculo client-side abaixo já cobre */ });
    return () => { cancelled = true; };
  }, [activeTenantId]);

  // Gastos lançados à mão por canal (Marketing → Aquisição), para mostrar custo por lead em cada canal.
  const [gastosLancados, setGastosLancados] = useState<{ source: string; amount: number }[]>([]);
  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    supabase.from("marketing_spend").select("source, amount").eq("tenant_id", activeTenantId).limit(5000)
      .then(({ data }) => { if (!cancelled) setGastosLancados((data || []).map((r: any) => ({ source: String(r.source || ""), amount: Number(r.amount) || 0 }))); });
    return () => { cancelled = true; };
  }, [activeTenantId]);

  // Receita vinda de Marketing (simplificado como Total Recebido ou leads com status Fechado * valor)
  // Como as despesas de marketing também não têm flag clara, pegamos tudo do tipo Pagar/Receber ou usamos apenas baseados em leads
  const clientTotalRevenue = leads.filter(l => l.status === 'Fechado').reduce((s, l) => s + parseCurrencyBR(l.value), 0);
  const clientTotalSpent = financeEntries.filter(f => f.type === 'Pagar' && ehGastoMarketing(f.category) && f.status === 'Pago').reduce((s, f) => s + f.value, 0);

  const clientTotalLeads = leads.length;
  const clientClosedLeads = leads.filter(l => l.status === 'Fechado').length;

  const clientCac = clientTotalLeads > 0 ? (clientTotalSpent / clientTotalLeads) : 0;
  const clientAvgDeal = clientClosedLeads > 0 ? (clientTotalRevenue / clientClosedLeads) : 0;
  const clientRoi = clientTotalSpent > 0 ? (clientTotalRevenue / clientTotalSpent) : 0;

  const totalRevenue = serverSummary?.totalRevenue ?? clientTotalRevenue;
  const totalSpent = serverSummary?.totalSpent ?? clientTotalSpent;
  const cac = serverSummary?.cac ?? clientCac;
  const avgDeal = serverSummary?.avgDeal ?? clientAvgDeal;
  const roi = serverSummary?.roi ?? clientRoi;

  // Evolução mensal (agrupado por mês)
  const performanceData = useMemo(() => {
    const months: Record<string, { revenue: number, leads: number, closed: number, spent: number }> = {};
    
    // Processa leads
    leads.forEach(l => {
      try {
        const d = new Date(l.date || l.createdAt || '');
        if(isNaN(d.getTime())) return;
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        
        if (!months[month]) months[month] = { revenue: 0, leads: 0, closed: 0, spent: 0 };
        
        months[month].leads++;
        if (l.status === 'Fechado') {
          months[month].closed++;
          months[month].revenue += parseCurrencyBR(l.value);
        }
      } catch {}
    });

    // Processa gastos de mkt
    financeEntries.forEach(f => {
      if (f.type !== 'Pagar' || f.status !== 'Pago') return;
      if (!ehGastoMarketing(f.category)) return;
      try {
        const d = new Date(f.date || '');
        if(isNaN(d.getTime())) return;
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!months[month]) months[month] = { revenue: 0, leads: 0, closed: 0, spent: 0 };
        months[month].spent += f.value;
      } catch {}
    });

    const NOMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => ({
      name: `${NOMES[Number(month.slice(5)) - 1]}/${month.slice(2, 4)}`,
      revenue: data.revenue,
      cac: data.leads > 0 ? (data.spent / data.leads) : 0
    }));
  }, [leads, financeEntries]);

  // Receita por Origem (Canais)
  const clientSourceData = useMemo(() => {
    const srcMap: Record<string, number> = {};
    leads.forEach(l => {
      if (l.status === 'Fechado') {
        const src = l.source || 'Orgânico';
        srcMap[src] = (srcMap[src] || 0) + parseCurrencyBR(l.value);
      }
    });

    return Object.entries(srcMap)
      .filter(([, revenue]) => revenue > 0)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [leads]);

  // Desempenho por canal de aquisição: de onde os leads vêm (UTM da campanha quando existe, senão a origem cadastrada) e quanto viram venda.
  const canais = useMemo(() => {
    const m = new Map<string, { leads: number; fechados: number; receita: number }>();
    for (const l of leads) {
      const c = canalDoLead(l as any);
      const x = m.get(c) ?? { leads: 0, fechados: 0, receita: 0 };
      x.leads++;
      if (l.status === 'Fechado') { x.fechados++; x.receita += parseCurrencyBR(l.value); }
      m.set(c, x);
    }
    const gasto = new Map<string, number>();
    for (const g of gastosLancados) { const c = normalizarCanal(g.source); if (c) gasto.set(c, (gasto.get(c) ?? 0) + g.amount); }
    for (const c of gasto.keys()) if (!m.has(c)) m.set(c, { leads: 0, fechados: 0, receita: 0 });
    return [...m.entries()].map(([nome, x]) => ({ nome, ...x, gasto: gasto.get(nome) ?? 0, cpl: x.leads > 0 && (gasto.get(nome) ?? 0) > 0 ? (gasto.get(nome)! / x.leads) : 0, cac: x.fechados > 0 && (gasto.get(nome) ?? 0) > 0 ? (gasto.get(nome)! / x.fechados) : 0, taxa: x.leads > 0 ? (x.fechados / x.leads) * 100 : 0, ticket: x.fechados > 0 ? x.receita / x.fechados : 0 }))
      .sort((a, b) => b.receita - a.receita || b.leads - a.leads).slice(0, 12);
  }, [leads, gastosLancados]);

  const sourceData = (serverSummary?.sourceData ?? clientSourceData).map((s, i) => ({ ...s, color: COLORS[i % COLORS.length] }));
  const receitaCanais = sourceData.reduce((a, x) => a + x.revenue, 0);
  const totalLeads = serverSummary?.totalLeads ?? clientTotalLeads;
  const fechados = serverSummary?.closedLeads ?? clientClosedLeads;
  const maxLeadsCanal = Math.max(1, ...canais.map((c) => c.leads));
  const melhorCanal = canais.filter((c) => c.fechados > 0).sort((a, b) => b.taxa - a.taxa)[0];
  const [aba, setAba] = useState("geral");
  const tooltipStyle = { backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 12, color: "var(--color-text-primary)", boxShadow: "var(--shadow-panel)" } as const;
  const eixo = { stroke: "var(--color-text-faint)", fontSize: 11, tickLine: false, axisLine: false } as const;
  const compacto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(Math.round(v)));

  return (
    <PageContainer
      title="Análises de Marketing"
      actions={<BotaoRelatorio area="marketing" />}
      subtitle="De onde vêm seus leads, quanto custam e quanto viram venda. CPL = custo por lead · CAC = custo para conquistar um cliente · ROAS/ROI = retorno sobre o investimento."
    >
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="geral" className="gap-1.5"><LayoutDashboard className="w-3.5 h-3.5" /> Visão geral</TabsTrigger>
          <TabsTrigger value="canais" className="gap-1.5"><Megaphone className="w-3.5 h-3.5" /> Canais</TabsTrigger>
          <TabsTrigger value="investimento" className="gap-1.5"><Wallet className="w-3.5 h-3.5" /> Investimento</TabsTrigger>
          <TabsTrigger value="email" className="gap-1.5"><Mail className="w-3.5 h-3.5" /> E-mail</TabsTrigger>
          <TabsTrigger value="links" className="gap-1.5"><Link2 className="w-3.5 h-3.5" /> Links rastreados</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard icon={DollarSign} color="#10b981" label="Receita do marketing" value={formatCurrency(totalRevenue)} sub={`${fechados} venda(s) fechada(s)`} hint="Soma dos leads com status Fechado." />
            <StatCard icon={TrendingUp} color="#f43f5e" label="Custo por lead (CPL)" value={formatCurrency(cac)} sub={`${totalLeads} lead(s) · gasto ${formatCurrency(totalSpent)}`} hint="Investimento em marketing dividido pelo total de leads." />
            <StatCard icon={Target} color="#6366f1" label="Ticket médio" value={formatCurrency(avgDeal)} sub={fechados > 0 ? "por venda fechada" : "sem vendas ainda"} hint="Receita dividida pelo número de vendas fechadas." />
            <StatCard icon={Activity} color="#3b82f6" label="Retorno (ROI)" value={<>{roi.toFixed(1)}<span className="text-sm text-[var(--color-text-muted)]">x</span></>} sub={roi > 0 ? `cada R$ 1 investido volta R$ ${roi.toFixed(2).replace(".", ",")}` : "lance os gastos para calcular"} hint="Receita dividida pelo investimento em marketing." />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-5">
            <Card className="p-4 sm:p-6 lg:col-span-3 min-w-0">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-1 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-[var(--color-primary-blue)]" /> Receita e custo por lead, mês a mês</h3>
              <p className="text-[11px] text-[var(--color-text-muted)] mb-4">Receita no eixo da esquerda; custo por lead no da direita (escalas diferentes).</p>
              {performanceData.length === 0 ? (
                <EmptyState icon={Inbox} title="Sem dados mensais ainda" description="Cadastre leads e lance os gastos de marketing para ver a evolução." className="py-10" />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={performanceData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                        <linearGradient id="colorCac" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25} /><stop offset="95%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle, rgba(128,128,128,.2))" vertical={false} />
                      <XAxis dataKey="name" {...eixo} />
                      <YAxis yAxisId="rev" {...eixo} width={48} tickFormatter={compacto} />
                      <YAxis yAxisId="cpl" orientation="right" {...eixo} width={48} tickFormatter={compacto} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(value: any) => formatCurrency(value)} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      <Area yAxisId="rev" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2.5} fill="url(#colorRevenue)" name="Receita" />
                      <Area yAxisId="cpl" type="monotone" dataKey="cac" stroke="#f43f5e" strokeWidth={2.5} fill="url(#colorCac)" name="Custo por lead" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="p-4 sm:p-6 lg:col-span-2 min-w-0">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-1 flex items-center gap-2"><PieChartIcon className="w-4 h-4 text-[var(--color-primary-blue)]" /> Receita por canal</h3>
              <p className="text-[11px] text-[var(--color-text-muted)] mb-4">Vendas fechadas, por origem do lead.</p>
              {sourceData.length === 0 ? (
                <EmptyState icon={PieChartIcon} title="Nenhuma venda por canal" description="Quando um lead for fechado, a origem dele aparece aqui." className="py-10" />
              ) : (
                <div>
                  <div className="h-44 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={sourceData} cx="50%" cy="50%" innerRadius={52} outerRadius={74} paddingAngle={3} dataKey="revenue" stroke="none">
                          {sourceData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(value: any) => formatCurrency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[10px] font-bold uppercase text-[var(--color-text-faint)]">Total</span>
                      <span className="text-sm font-black text-[var(--color-text-primary)]">{formatCurrency(receitaCanais)}</span>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {sourceData.slice(0, 6).map((src) => (
                      <li key={src.name} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: src.color }} />
                        <span className="flex-1 min-w-0 truncate text-[var(--color-text-muted)]">{src.name}</span>
                        <span className="font-bold text-[var(--color-text-primary)]">{formatCurrency(src.revenue)}</span>
                        <span className="w-10 text-right text-[var(--color-text-faint)]">{receitaCanais > 0 ? Math.round((src.revenue / receitaCanais) * 100) : 0}%</span>
                      </li>))}
                  </ul>
                </div>
              )}
            </Card>
          </div>
          {melhorCanal && <p className="text-xs text-[var(--color-text-muted)]">💡 Melhor conversão: <b className="text-[var(--color-text-primary)]">{melhorCanal.nome}</b> ({melhorCanal.taxa.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% dos leads viram venda). Veja todos na aba <button onClick={() => setAba("canais")} className="underline text-[var(--color-primary-blue)] font-bold">Canais</button>.</p>}
        </TabsContent>

        <TabsContent value="canais">
          <Card className="p-4 sm:p-6">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-1 flex items-center gap-2"><Users className="w-4 h-4 text-emerald-500" /> Canais de aquisição</h3>
            <p className="text-[11px] text-[var(--color-text-muted)] mb-4 max-w-3xl">De onde vêm os leads e quantos viram venda. Leads de páginas, formulários e e-mails do sistema trazem o canal da campanha (UTM); os demais usam a origem cadastrada. O gasto vem dos valores lançados por canal na aba Investimento (o nome do canal precisa bater, ex.: “Meta” ou “Facebook Ads”).</p>
            {canais.length === 0 ? <EmptyState icon={Users} title="Ainda não há leads" description="Quando os primeiros leads chegarem, os canais aparecem aqui." className="py-8" /> : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full text-sm min-w-[820px]">
                  <thead className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                    <tr>{["Canal", "Leads", "Vendas", "Conversão", "Receita", "Ticket médio", "Gasto", "Custo/lead", "Custo/venda"].map((h, i) => <th key={h} className={`font-black py-2 px-3 ${i === 0 ? "text-left sticky left-0 bg-[var(--color-surface-elevated)]" : "text-right"}`}>{h}</th>)}</tr>
                  </thead>
                  <tbody>{canais.map((c) => (
                    <tr key={c.nome} className="border-t border-[var(--color-border-subtle,var(--color-border-default))] hover:bg-[var(--color-surface-sunken)]/60">
                      <td className="py-2.5 px-3 font-bold text-[var(--color-text-primary)] sticky left-0 bg-[var(--color-surface-elevated)]">{c.nome}</td>
                      <td className="py-2.5 px-3 text-right"><div className="flex items-center justify-end gap-2"><div className="hidden sm:block w-16 h-1.5 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden"><div className="h-full bg-[var(--color-primary-blue)]" style={{ width: `${(c.leads / maxLeadsCanal) * 100}%` }} /></div><span className="text-[var(--color-text-primary)] tabular-nums">{c.leads}</span></div></td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-primary)]">{c.fechados}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-muted)]">{c.taxa.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold text-emerald-500">{formatCurrency(c.receita)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-muted)]">{c.ticket > 0 ? formatCurrency(c.ticket) : "—"}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-muted)]">{c.gasto > 0 ? formatCurrency(c.gasto) : "—"}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-muted)]">{c.cpl > 0 ? formatCurrency(c.cpl) : "—"}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-muted)]">{c.cac > 0 ? formatCurrency(c.cac) : "—"}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="investimento"><AquisicaoPanel /></TabsContent>
        <TabsContent value="email"><EmailResumoPanel mostrarVazio /></TabsContent>
        <TabsContent value="links"><GeradorLinkUtm iniciarAberto /></TabsContent>
      </Tabs>
    </PageContainer>
  );
}
