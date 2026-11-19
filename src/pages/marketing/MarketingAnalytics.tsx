import { ehGastoMarketing } from "../../lib/gastoMarketing";
import { canalDoLead, normalizarCanal } from "../../lib/canalAquisicao";
import { supabase } from "../../lib/supabase";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { BarChart2, TrendingUp, Users, Target, Activity, DollarSign, Inbox } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { useMemo, useState, useEffect } from "react";
import { useLocalization } from "../../contexts/LocalizationContext";
import { parseCurrencyBR } from "../../lib/utils";
import { AquisicaoPanel } from "./AquisicaoPanel";
import { GeradorLinkUtm } from "./GeradorLinkUtm";
import { apiFetch } from "../../lib/apiClient";

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

  return (
    <PageContainer
      title="Métricas de Marketing Avançadas"
      subtitle="Analise o custo e o retorno dos seus canais: CPL (custo por lead), CPLQ (custo por lead qualificado), CAC (custo para conquistar um cliente) e ROAS (retorno sobre o gasto com anúncios)."
    >
      <AquisicaoPanel />
      <GeradorLinkUtm />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="p-6 bg-[var(--color-surface-elevated)]/50 border hover:border-white/10 border-white/5 backdrop-blur-md transition-all">
          <DollarSign className="w-5 h-5 text-emerald-500 mb-4" />
          <div className="text-2xl font-display font-black text-white mb-1 italic">{formatCurrency(totalRevenue)}</div>
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Receita Mkt</div>
        </Card>

        <Card className="p-6 bg-[var(--color-surface-elevated)]/50 border hover:border-white/10 border-white/5 backdrop-blur-md transition-all">
          <TrendingUp className="w-5 h-5 text-rose-500 mb-4" />
          <div className="text-2xl font-display font-black text-white mb-1 italic">{formatCurrency(cac)}</div>
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Custo por lead (CPL)</div>
        </Card>

        <Card className="p-6 bg-[var(--color-surface-elevated)]/50 border hover:border-white/10 border-white/5 backdrop-blur-md transition-all">
          <Target className="w-5 h-5 text-indigo-500 mb-4" />
          <div className="text-2xl font-display font-black text-white mb-1 italic">{formatCurrency(avgDeal)}</div>
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Valor Médio do Negócio</div>
        </Card>

        <Card className="p-6 bg-[var(--color-surface-elevated)]/50 border hover:border-white/10 border-white/5 backdrop-blur-md transition-all">
          <Activity className="w-5 h-5 text-blue-500 mb-4" />
          <div className="text-2xl font-display font-black text-white mb-1 italic">{roi.toFixed(1)}<span className="text-sm text-slate-500">x</span></div>
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Retorno (ROI)</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 bg-[var(--color-surface-elevated)] border-white/5 lg:col-span-2">
          <h3 className="text-sm font-black text-white uppercase tracking-wider mb-6 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-blue-500" /> Receita Marketing vs Investimento (custo por lead)
          </h3>
          {performanceData.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center gap-4 opacity-40">
              <Inbox className="w-10 h-10 text-slate-500" />
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">
                Sem dados de performance mensal.<br/>Cadastre leads e gastos em campanhas.
              </p>
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorCac" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--color-surface-elevated)', border: 'none', borderRadius: '12px', fontSize: '12px', color: '#fff', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                    formatter={(value: any) => formatCurrency(value)}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" name="Receita" />
                  <Area type="monotone" dataKey="cac" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorCac)" name="CAC" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-6 bg-[var(--color-surface-elevated)] border-white/5">
          <h3 className="text-sm font-black text-white uppercase tracking-wider mb-6 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-500" /> Receita p/ Canais (Ganho)
          </h3>
          {sourceData.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center gap-4 opacity-40">
              <PieChart className="w-10 h-10 text-slate-500" />
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">
                Nenhuma receita atrelada a origens de mkt.
              </p>
            </div>
          ) : (
            <div className="h-72 flex flex-col justify-center">
              <ResponsiveContainer width="100%" height="70%">
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="revenue"
                    stroke="none"
                  >
                    {sourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--color-surface-elevated)', border: 'none', borderRadius: '12px', fontSize: '12px', color: '#fff' }}
                    formatter={(value: any) => formatCurrency(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-4 mt-4">
                {sourceData.map(source => (
                  <div key={source.name} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: source.color }}></div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter truncate">{source.name}</span>
                    </div>
                    <span className="text-xs font-black text-white ml-4">
                      {formatCurrency(source.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6 bg-[var(--color-surface-elevated)] border-white/5 mt-6">
        <h3 className="text-sm font-black text-white uppercase tracking-wider mb-1 flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-500" /> Canais de Aquisição
        </h3>
        <p className="text-[11px] text-slate-500 mb-4">De onde vêm os leads e quantos viram venda. Leads de páginas e formulários do sistema trazem o canal da campanha (UTM); os demais usam a origem cadastrada. O gasto vem dos valores lançados por canal em Aquisição (o nome do canal precisa bater, ex.: “Meta” ou “Facebook Ads”).</p>
        {canais.length === 0 ? <p className="text-xs text-slate-500">Ainda não há leads.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500"><tr>{["Canal", "Leads", "Vendas", "Conversão", "Receita", "Ticket médio", "Gasto", "Custo/lead", "Custo/venda"].map((h, i) => <th key={h} className={`font-black py-2 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
              <tbody>{canais.map((c) => (
                <tr key={c.nome} className="border-t border-white/5">
                  <td className="py-2 font-bold text-white">{c.nome}</td>
                  <td className="py-2 text-right text-slate-300">{c.leads}</td>
                  <td className="py-2 text-right text-slate-300">{c.fechados}</td>
                  <td className="py-2 text-right text-slate-300">{c.taxa.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
                  <td className="py-2 text-right font-bold text-emerald-400">{formatCurrency(c.receita)}</td>
                  <td className="py-2 text-right text-slate-300">{c.ticket > 0 ? formatCurrency(c.ticket) : "—"}</td>
                  <td className="py-2 text-right text-slate-300">{c.gasto > 0 ? formatCurrency(c.gasto) : "—"}</td>
                  <td className="py-2 text-right text-slate-300">{c.cpl > 0 ? formatCurrency(c.cpl) : "—"}</td>
                  <td className="py-2 text-right text-slate-300">{c.cac > 0 ? formatCurrency(c.cac) : "—"}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
