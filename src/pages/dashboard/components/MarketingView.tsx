import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../../components/ui/card';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, PieChart, Pie, Cell, Sankey, Treemap } from 'recharts';
import { Globe, Share2, Sparkles, MousePointer2, Layers, Users, DollarSign, Workflow, LayoutGrid } from 'lucide-react';
import { useData } from '../../../contexts/DataContext';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { parseCurrencyBR } from '../../../lib/utils';

// Paleta de categorias sem contagem fixa (origens de lead variam por tenant)
// — em vez do arco-íris antigo, usa a cor da marca (destaque pra fatia mais
// relevante) + tons neutros de cinza (ver regra de cores do dashboard: só
// branco/cinza/cor do tenant). Cicla se houver mais origens que tons.
const COLORS = [
  'var(--color-primary-blue)',
  'var(--color-text-primary)',
  'var(--color-text-muted)',
  'var(--color-text-faint)',
  'var(--color-border-default)',
];

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

  // Receita fechada real por origem (leads.value dos Fechados, mesma fonte
  // do total no topo do arquivo) — pro Treemap abaixo. Diferente de
  // `sourceData`: aquele conta QUANTIDADE de leads por origem, este soma o
  // VALOR fechado por origem — origens com poucos leads mas alto ticket
  // aparecem grandes aqui mesmo sendo pequenas em contagem.
  const revenueBySourceData = useMemo(() => {
    const map: Record<string, number> = {};
    leads.filter(l => l.status === 'Fechado').forEach(l => {
      const src = l.source || 'Orgânico';
      map[src] = (map[src] || 0) + parseCurrencyBR(l.value);
    });
    return Object.entries(map)
      .filter(([, value]) => value > 0)
      .map(([name, value], i) => ({ name, size: value, fill: COLORS[i % COLORS.length] }))
      .sort((a, b) => b.size - a.size);
  }, [leads]);

  // Sankey: de cada origem, quantos leads fecharam x quantos não fecharam
  // (ainda em aberto ou perdido) — só 2 desfechos reais, sem inventar
  // etapas intermediárias que o funil comercial já cobre em outro card.
  const sankeyData = useMemo(() => {
    const bySource: Record<string, { fechado: number; naoFechado: number }> = {};
    leads.forEach(l => {
      const src = l.source || 'Orgânico';
      if (!bySource[src]) bySource[src] = { fechado: 0, naoFechado: 0 };
      if (l.status === 'Fechado') bySource[src].fechado++;
      else bySource[src].naoFechado++;
    });
    const sources = Object.keys(bySource);
    const nodes = [...sources.map(s => ({ name: s })), { name: 'Fechado' }, { name: 'Não Fechado' }];
    const fechadoIdx = sources.length;
    const naoFechadoIdx = sources.length + 1;
    const links: { source: number; target: number; value: number }[] = [];
    sources.forEach((s, i) => {
      if (bySource[s].fechado > 0) links.push({ source: i, target: fechadoIdx, value: bySource[s].fechado });
      if (bySource[s].naoFechado > 0) links.push({ source: i, target: naoFechadoIdx, value: bySource[s].naoFechado });
    });
    return { nodes, links, hasData: links.length > 0 };
  }, [leads]);

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
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="direct" name="Direto" fill="var(--color-primary-blue)" radius={[4, 4, 0, 0]} barSize={20} />
                    <Bar dataKey="organic" name="Orgânico" fill="var(--color-text-muted)" radius={[4, 4, 0, 0]} barSize={20} />
                    <Bar dataKey="social" name="Social" fill="var(--color-text-faint)" radius={[4, 4, 0, 0]} barSize={20} />
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
                <Share2 className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Distribuição por Origem
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
                       <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} formatter={(v: number) => `${v.toFixed(1)}%`} />
                    </PieChart>
                 </ResponsiveContainer>
              </div>
              {/* Antes só os 2 primeiros — o donut de Receita por Produto
                  (StrategicalWidgets/RevenueByProductDonut.tsx) já usa esse
                  padrão de legenda manual mostrando TODAS as fatias, não só
                  as maiores; aqui ficava sem explicação nenhuma pras origens
                  menores. */}
              <div className="space-y-2 mt-4 max-h-[120px] overflow-y-auto scrollbar-thin pr-1">
                 {sourceData.map((item, i) => (
                   <div key={i} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                         <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                         <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase truncate">{item.name}</span>
                      </div>
                      <span className="text-xs font-black text-[var(--color-text-primary)] shrink-0">{item.value.toFixed(1)}%</span>
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

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6 shadow-sm">
          <h4 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-1 flex items-center gap-2">
            <Workflow className="w-4 h-4 text-[var(--color-primary-blue)]" /> Jornada do Lead (Origem → Desfecho)
          </h4>
          <p className="text-xs text-[var(--color-text-muted)] mb-4 font-medium">De cada origem, quantos leads fecharam negócio até agora.</p>
          {!sankeyData.hasData ? (
            <div className="py-10 text-center text-xs text-[var(--color-text-faint)]">Sem leads suficientes pra montar a jornada.</div>
          ) : (
            <div className="h-[240px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                <Sankey
                  data={sankeyData}
                  nodePadding={20}
                  margin={{ top: 10, right: 90, bottom: 10, left: 10 }}
                  link={{ stroke: 'var(--color-border-default)', strokeOpacity: 0.4 }}
                  node={{ stroke: 'var(--color-surface-elevated)', fill: 'var(--color-primary-blue)' }}
                >
                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} />
                </Sankey>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-6 shadow-sm">
          <h4 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-1 flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-[var(--color-primary-blue)]" /> Receita Fechada por Origem
          </h4>
          <p className="text-xs text-[var(--color-text-muted)] mb-4 font-medium">Quanto cada origem realmente gerou em negócios fechados — não só volume de leads.</p>
          {revenueBySourceData.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--color-text-faint)]">Sem negócios fechados com valor no período.</div>
          ) : (
            <div className="h-[240px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                <Treemap data={revenueBySourceData} dataKey="size" stroke="var(--color-surface-elevated)" isAnimationActive={false}>
                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} formatter={(v: number) => formatCurrency(v)} />
                </Treemap>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
         {[
           // CTR (cliques/impressões) depende de integração com plataformas de anúncio que o
           // sistema ainda não tem — mostrar "—" em vez de um número de exemplo.
           { icon: MousePointer2, label: "CTR Médio", value: "—", color: "text-[var(--color-text-muted)]", bg: "bg-[var(--color-surface-sunken)]" },
           { icon: Layers, label: "Conv. Landing Pages", value: lpConversionRate !== null ? `${lpConversionRate.toFixed(1)}%` : "—", color: "text-[var(--color-text-muted)]", bg: "bg-[var(--color-surface-sunken)]" },
           { icon: Users, label: "Leads de Marketing", value: totalLeads.toString(), color: "text-[var(--color-primary-blue)]", bg: "bg-[var(--color-primary-blue)]/10" },
           { icon: DollarSign, label: "Total Investido", value: formatCurrency(totalSpent), color: "text-[var(--color-text-muted)]", bg: "bg-[var(--color-surface-sunken)]" },
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
