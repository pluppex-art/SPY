import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../../components/ui/card';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, PieChart, Pie, Cell } from 'recharts';
import { Globe, Share2, Sparkles, MousePointer2, Layers, Users, DollarSign } from 'lucide-react';
import { useData } from '../../../contexts/DataContext';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { parseCurrencyBR } from '../../../lib/utils';

const COLORS = ['#3b82f6', '#f43f5e', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4'];

const tooltipStyle = { backgroundColor: 'var(--color-surface-elevated)', border: '1px solid var(--color-border-default)', borderRadius: '12px' };
const tooltipItemStyle = { fontSize: '10px', fontWeight: 'bold' as const };

export function MarketingView() {
  const { leads, financeEntries, contracts, marketingLandingPages } = useData();
  const { formatCurrency } = useLocalization();

  // Calculate real metrics from database
  const totalRevenue = leads.filter(l => l.status === 'Fechado').reduce((s, l) => s + parseCurrencyBR(l.value), 0);
  const totalSpent = financeEntries.filter(f => f.type === 'Pagar' && (f.category?.toLowerCase().includes('marketing') || f.category?.toLowerCase().includes('anúncio')) && f.status === 'Pago').reduce((s, f) => s + f.value, 0);

  const totalLeads = leads.length;
  const closedLeads = leads.filter(l => l.status === 'Fechado').length;

  // CPL - Cost Per Lead
  const cpl = totalLeads > 0 ? totalSpent / totalLeads : 0;

  // ROAS - Return on Ad Spend
  const roas = totalSpent > 0 ? totalRevenue / totalSpent : 0;

  // CAC Payback - months to recover CAC
  const monthlyRevenue = closedLeads > 0 ? totalRevenue / Math.max(1, closedLeads) : 0;
  const cacPayback = monthlyRevenue > 0 ? (cpl * totalLeads) / monthlyRevenue : 0;

  // Share of Voice - leads by source
  const sourceData = useMemo(() => {
    const srcMap: Record<string, number> = {};
    leads.forEach(l => {
      const src = l.source || 'Orgânico';
      srcMap[src] = (srcMap[src] || 0) + 1;
    });

    const total = Object.values(srcMap).reduce((a, b) => a + b, 0);
    return Object.entries(srcMap)
      .map(([name, count], i) => ({
        name,
        value: total > 0 ? (count / total) * 100 : 0,
        count,
        color: COLORS[i % COLORS.length]
      }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  const topSource = sourceData[0];

  const totalLpViews = (marketingLandingPages || []).reduce((s: number, p: any) => s + (p.views || 0), 0);
  const totalLpConversions = (marketingLandingPages || []).reduce((s: number, p: any) => s + (p.conversions || 0), 0);
  const lpConversionRate = totalLpViews > 0 ? (totalLpConversions / totalLpViews) * 100 : null;

  // Attribution data - leads by source and channel (classificação simples por
  // palavra-chave no nome da origem — não é IA/Aurora, então o rótulo não
  // pode dizer que é; ver comentário no cabeçalho do card abaixo).
  const attributionData = useMemo(() => {
    const channelMap: Record<string, { direct: number; organic: number; social: number }> = {};

    leads.forEach(l => {
      const src = l.source || 'Orgânico';
      if (!channelMap[src]) {
        channelMap[src] = { direct: 0, organic: 0, social: 0 };
      }

      if (src.toLowerCase().includes('direct')) channelMap[src].direct++;
      else if (src.toLowerCase().includes('organic') || src.toLowerCase().includes('seo')) channelMap[src].organic++;
      else if (src.toLowerCase().includes('social') || src.toLowerCase().includes('instagram') || src.toLowerCase().includes('facebook')) channelMap[src].social++;
    });

    return Object.entries(channelMap).map(([name, data]) => ({
      name: name.substring(0, 8),
      direct: data.direct,
      organic: data.organic,
      social: data.social
    }));
  }, [leads]);

  return (
    <motion.div
      key="marketing"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6 text-left"
    >
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 shadow-sm">
           <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
              <div>
                 <h3 className="text-sm font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
                   <Globe className="w-4 h-4 text-[var(--color-primary-blue)]" /> Origem de Leads por Canal
                 </h3>
                 {/* Antes dizia "Atribuição Dinâmica Aurora" — não é IA nenhuma, é
                     uma classificação por palavra-chave no nome da origem
                     (direct/organic/social). Rótulo tem que dizer o que
                     realmente é, não sugerir automação que não existe aqui. */}
                 <p className="text-xs text-[var(--color-text-muted)] mt-1 font-medium">Leads agrupados por origem e canal (direto, orgânico, social).</p>
              </div>
           </div>
           <div className="h-[260px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                 <BarChart data={attributionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--color-text-faint)" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--color-text-faint)" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: 'var(--color-surface-sunken)' }}
                      contentStyle={tooltipStyle}
                      itemStyle={tooltipItemStyle}
                    />
                    <Bar dataKey="direct" name="Direto" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                    <Bar dataKey="organic" name="Orgânico" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                    <Bar dataKey="social" name="Social" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={20} />
                 </BarChart>
              </ResponsiveContainer>
           </div>
           <div className="mt-6 grid grid-cols-3 gap-3">
              {/* Sem variação % ao lado de CPL/ROAS — não existe uma série
                  histórica calculada pra comparar com o período anterior aqui
                  (achado real: "-12%"/"+0.5" eram valores fixos no código,
                  não vinham de cálculo nenhum — removidos). */}
              <div className="p-3 bg-[var(--color-surface-sunken)] rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
                 <p className="text-[9px] text-[var(--color-text-faint)] font-black uppercase mb-1">CPL Médio</p>
                 <p className="text-lg font-black text-[var(--color-text-primary)] font-mono tracking-tight">{formatCurrency(cpl)}</p>
              </div>
              <div className="p-3 bg-[var(--color-surface-sunken)] rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
                 <p className="text-[9px] text-[var(--color-text-faint)] font-black uppercase mb-1">ROAS Global</p>
                 <p className="text-lg font-black text-[var(--color-text-primary)] font-mono tracking-tight">{roas > 0 ? `${roas.toFixed(2)}x` : '—'}</p>
              </div>
              <div className="p-3 bg-[var(--color-surface-sunken)] rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
                 <p className="text-[9px] text-[var(--color-text-faint)] font-black uppercase mb-1">CAC Payback</p>
                 <p className="text-lg font-black text-[var(--color-text-primary)] font-mono tracking-tight">{cacPayback > 0 ? `${cacPayback.toFixed(1)} meses` : '—'}</p>
              </div>
           </div>
        </Card>

        <div className="space-y-6">
           <Card className="p-6 shadow-sm">
              <h4 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-4 flex items-center gap-2">
                <Share2 className="w-3.5 h-3.5 text-purple-500" /> Distribuição por Origem
              </h4>
              <div className="h-[180px] w-full min-w-0">
                 <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160}>
                    <PieChart>
                       <Pie
                         data={sourceData}
                         cx="50%" cy="50%"
                         innerRadius={55}
                         outerRadius={75}
                         paddingAngle={4}
                         dataKey="value"
                       >
                         {sourceData.map((entry, i) => (
                           <Cell key={`cell-${i}`} fill={entry.color} />
                         ))}
                       </Pie>
                       <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} />
                    </PieChart>
                 </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-4">
                 {sourceData.slice(0, 2).map((item, i) => (
                   <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                         <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                         <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase">{item.name}</span>
                      </div>
                      <span className="text-xs font-black text-[var(--color-text-primary)]">{item.value.toFixed(1)}%</span>
                   </div>
                 ))}
              </div>
           </Card>

           <Card className="p-5 bg-[var(--color-primary-blue)]/5 border-[var(--color-primary-blue)]/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-5 opacity-[0.06]">
                 <Sparkles className="w-14 h-14 text-[var(--color-primary-blue)]" />
              </div>
              <h5 className="text-[10px] font-black text-[var(--color-primary-blue)] uppercase tracking-widest mb-2">Destaque do Período</h5>
              <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed font-medium relative">
                {topSource
                  ? `${topSource.count} leads (${topSource.value.toFixed(0)}%) vieram de "${topSource.name}" — sua principal origem de leads no período.`
                  : "Ainda não há leads suficientes para gerar um destaque."}
              </p>
           </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
         {[
           // CTR (cliques/impressões) depende de integração com plataformas de anúncio que o
           // sistema ainda não tem — mostrar "—" em vez de um número de exemplo.
           { icon: MousePointer2, label: "CTR Médio", value: "—", color: "text-indigo-500", bg: "bg-indigo-500/10" },
           { icon: Layers, label: "Conv. Landing Pages", value: lpConversionRate !== null ? `${lpConversionRate.toFixed(1)}%` : "—", color: "text-blue-500", bg: "bg-blue-500/10" },
           { icon: Users, label: "Leads de Marketing", value: totalLeads.toString(), color: "text-emerald-500", bg: "bg-emerald-500/10" },
           { icon: DollarSign, label: "Total Investido", value: formatCurrency(totalSpent), color: "text-amber-500", bg: "bg-amber-500/10" },
         ].map((metric, i) => (
            <Card key={i} className="p-5 shadow-sm">
               <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2 rounded-xl ${metric.bg} ${metric.color}`}>
                     <metric.icon className="w-4 h-4" />
                  </div>
                  <p className="text-[10px] text-[var(--color-text-faint)] font-extrabold uppercase tracking-wider">{metric.label}</p>
               </div>
               <h4 className="text-xl font-black text-[var(--color-text-primary)] font-mono tracking-tight">{metric.value}</h4>
            </Card>
         ))}
      </div>
    </motion.div>
  );
}
