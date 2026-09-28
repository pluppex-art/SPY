import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, Area, Line, Legend } from 'recharts';
import { BarChart3, RefreshCw, Target, Trophy, Layers, Zap, Briefcase, ChevronDown, Wallet, TrendingDown, TrendingUp, Users, Receipt } from 'lucide-react';
import { useData } from '../../../contexts/DataContext';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { parseCurrencyBR, formatPercentage } from '../../../lib/utils';
import { parseEntryDate } from '../../finance/lib/financeDates';
import { getMRR, getLeadRealValue } from '../../../lib/revenueMetrics';
import type { DashboardSummary } from '../useDashboard';
import { RecentActivityFeed, type FeedActivity } from './StrategicalWidgets/RecentActivityFeed';
import { SalesFunnelWidget, type FunnelStepData } from './StrategicalWidgets/SalesFunnelWidget';
import { RevenueByProductDonut, type RevenueSlice } from './StrategicalWidgets/RevenueByProductDonut';
import { RevenueWaterfallChart } from './StrategicalWidgets/RevenueWaterfallChart';

interface Squad {
  nome: string;
  meta?: number;
  faturamentoAlcancado?: number;
}

interface Contract {
  mrr: string | number;
  status: string;
}

interface StrategicalViewProps {
  comparisonPeriod: 'month' | 'year';
  setComparisonPeriod: (p: 'month' | 'year') => void;
  performanceData: any[];
  squads?: Squad[];
  contracts?: Contract[];
  serverSummary?: DashboardSummary | null;
  dateFrom: string | null;
  dateTo: string | null;
}

export function StrategicalView({
  comparisonPeriod,
  setComparisonPeriod,
  performanceData,
  squads = [],
  contracts = [],
  serverSummary,
  dateFrom,
  dateTo,
}: StrategicalViewProps) {
  const { leads, financeEntries, clienteBase, proposals, reunioes, tasks, products } = useData();
  const { formatCurrency } = useLocalization();
  const leadsAbertos = leads.filter(l => l.status !== 'Fechado' && l.status !== 'Perdido');
  // Cada métrica abaixo prefere o valor cacheado de GET /api/dashboard/summary
  // (ver useDashboard.ts) quando disponível — mesma fórmula, só calculada no
  // servidor sobre a base inteira do tenant em vez do array já em memória.
  const valorPipelineAberto = serverSummary?.valorPipelineAberto ?? leadsAbertos.reduce((s, l) => s + parseCurrencyBR(l.value), 0);
  const leadsQuentes = serverSummary?.leadsQuentes ?? leadsAbertos.filter(l => (l.scoreIA ?? 0) > 80).length;

  const contratosInadimplentesClient = contracts.filter(c => c.status === 'Inadimplente').length;
  const taxaInadimplencia = serverSummary
    ? (contracts.length > 0 ? serverSummary.taxaInadimplencia : null)
    : (contracts.length > 0 ? (contratosInadimplentesClient / contracts.length) * 100 : null);

  // Compute Goal Meter from real squads
  const totalMeta = squads.reduce((s, sq) => s + (sq.meta || 0), 0);
  const totalAlcancado = squads.reduce((s, sq) => s + (sq.faturamentoAlcancado || 0), 0);
  const goalPct = totalMeta > 0 ? Math.min(100, Math.round((totalAlcancado / totalMeta) * 100)) : 0;
  const restanteMeta = Math.max(0, totalMeta - totalAlcancado);

  // Compute real MRR from contracts (camada única de métricas) — saldo do
  // momento atual, não recortado pelo período selecionado (ver useDashboard.ts).
  const activeMRR = serverSummary?.mrrAtivo ?? getMRR(contracts);

  const hasSquads = squads.length > 0;
  const hasContracts = contracts.length > 0;
  const [showDetails, setShowDetails] = useState(false);

  // Snapshot Financeiro — único bloco que de fato usa dateFrom/dateTo (o
  // mesmo período dos cards/gráfico acima). Receita/Despesas/Novas Vendas são
  // um FLUXO do período (só o que foi pago dentro da janela); Contas a
  // Receber/Pagar são um SALDO do momento atual (o que está em aberto agora,
  // independente de quando foi lançado — período não muda "quanto falta
  // receber hoje"). `parseEntryDate` já trata os dois formatos de data que
  // finance_entries.date pode ter (ver src/pages/finance/lib/financeDates.ts).
  const financeSnapshot = useMemo(() => {
    const inPeriod = (raw?: string | null) => {
      if (!dateFrom && !dateTo) return true;
      const d = parseEntryDate(raw);
      if (!d) return false;
      const pad = (n: number) => String(n).padStart(2, "0");
      const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      if (dateFrom && iso < dateFrom) return false;
      if (dateTo && iso > dateTo) return false;
      return true;
    };
    const entries = financeEntries as any[];
    const pagosNoPeriodo = entries.filter(f => f.status === 'Pago' && inPeriod(f.date));
    const receita = pagosNoPeriodo.filter(f => f.type === 'Receber').reduce((s, f) => s + (Number(f.value) || 0), 0);
    const despesas = pagosNoPeriodo.filter(f => f.type === 'Pagar').reduce((s, f) => s + (Number(f.value) || 0), 0);
    const novasVendas = pagosNoPeriodo.filter(f => f.type === 'Receber').length;
    const contasAReceber = entries.filter(f => f.type === 'Receber' && (f.status === 'A Vencer' || f.status === 'Atrasado')).reduce((s, f) => s + (Number(f.value) || 0), 0);
    const contasAPagar = entries.filter(f => f.type === 'Pagar' && (f.status === 'A Vencer' || f.status === 'Atrasado')).reduce((s, f) => s + (Number(f.value) || 0), 0);
    const clientes = clienteBase as any[];
    const clientesAtivos = clientes.filter(c => c.status === 'Ativo').length;
    const clientesPerdidos = clientes.filter(c => c.status === 'Inativo').length;

    // Mesmas despesas pagas no período (`despesas` acima), só quebradas por
    // categoria real (FinanceEntry.category) em vez de um total só — pro
    // waterfall Receita Bruta -> Lucro Líquido abaixo. Top 6 categorias +
    // "Outras" agrupando o resto, senão um tenant com muitas categorias
    // cadastradas vira um waterfall ilegível de 20+ barras.
    const despesasPorCategoriaMap: Record<string, number> = {};
    pagosNoPeriodo.filter(f => f.type === 'Pagar').forEach(f => {
      const cat = f.category || 'Sem categoria';
      despesasPorCategoriaMap[cat] = (despesasPorCategoriaMap[cat] || 0) + (Number(f.value) || 0);
    });
    const despesasOrdenadas = Object.entries(despesasPorCategoriaMap)
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
    const despesasPorCategoria = despesasOrdenadas.length > 7
      ? [
          ...despesasOrdenadas.slice(0, 6),
          { category: 'Outras', value: despesasOrdenadas.slice(6).reduce((s, d) => s + d.value, 0) },
        ]
      : despesasOrdenadas;

    return {
      receita, despesas, receitaLiquida: receita - despesas, novasVendas,
      contasAReceber, contasAPagar, clientesAtivos, clientesPerdidos, despesasPorCategoria,
      hasAnyEntry: entries.length > 0, hasAnyCliente: clientes.length > 0,
    };
  }, [financeEntries, clienteBase, dateFrom, dateTo]);

  // Últimas Atividades: mistura eventos reais de 4 tabelas diferentes, cada um com o timestamp
  // real do próprio registro — sem depender de um log manual (leadActivities), que só é
  // preenchido por 2 telas do sistema e ficaria quase sempre vazio aqui.
  const recentActivities = useMemo<FeedActivity[]>(() => {
    const items: FeedActivity[] = [];
    for (const l of leads as any[]) {
      const createdTs = l.created_at ? new Date(l.created_at).getTime() : NaN;
      if (Number.isFinite(createdTs)) {
        items.push({ id: `lead-${l.id}`, kind: 'lead', title: 'Novo lead recebido', description: l.company || l.name || 'Lead sem nome', ts: createdTs });
      }
      if (l.status === 'Fechado') {
        const wonTs = new Date(l.updated_at || l.created_at || 0).getTime();
        if (Number.isFinite(wonTs) && wonTs > 0) {
          items.push({ id: `won-${l.id}`, kind: 'cliente', title: 'Cliente convertido', description: l.company || l.name || 'Lead', ts: wonTs });
        }
      }
    }
    for (const p of proposals as any[]) {
      const ts = p.created_at ? new Date(p.created_at).getTime() : NaN;
      if (Number.isFinite(ts)) items.push({ id: `prop-${p.id}`, kind: 'proposta', title: 'Proposta enviada', description: p.cliente || p.titulo || 'Proposta comercial', ts });
    }
    for (const r of reunioes as any[]) {
      if (r.status !== 'Concluída' || !r.scheduledAt) continue;
      const ts = new Date(r.scheduledAt).getTime();
      if (Number.isFinite(ts)) {
        items.push({ id: `reun-${r.id}`, kind: 'reuniao', title: 'Reunião realizada', description: [r.companyName || r.leadName, r.pauta].filter(Boolean).join(' — ') || 'Reunião', ts });
      }
    }
    for (const t of tasks as any[]) {
      if (t.status !== 'Concluída') continue;
      const ts = new Date(t.completed_at || t.updated_at || 0).getTime();
      if (Number.isFinite(ts) && ts > 0) items.push({ id: `task-${t.id}`, kind: 'tarefa', title: 'Tarefa concluída', description: t.title || 'Tarefa', ts });
    }
    return items.sort((a, b) => b.ts - a.ts).slice(0, 6);
  }, [leads, proposals, reunioes, tasks]);

  // Funil de Vendas: 5 etapas genéricas ACUMULATIVAS — cada uma é um SUBCONJUNTO real da
  // anterior (nunca "todo lead com proposta", por exemplo, que poderia ser maior que
  // "qualificados" e faria o funil crescer no meio por acaso dos dados).
  const salesFunnelSteps = useMemo<FunnelStepData[]>(() => {
    const all = leads as any[];
    const qualificados = new Set(all.filter((l) => l.status !== 'Novo').map((l) => l.id));
    const leadsComProposta = new Set((proposals as any[]).map((p) => p.lead_id).filter(Boolean));
    const propostas = new Set(all.filter((l) => qualificados.has(l.id) && leadsComProposta.has(l.id)).map((l) => l.id));
    const negociacoes = new Set(all.filter((l) => propostas.has(l.id) && (l.status === 'Em Negociação' || l.status === 'Fechado')).map((l) => l.id));
    const clientes = new Set(all.filter((l) => negociacoes.has(l.id) && l.status === 'Fechado').map((l) => l.id));

    const base = [
      { label: 'Leads', value: all.length, color: 'bg-purple-500', textColor: 'text-purple-600' },
      { label: 'Qualificados', value: qualificados.size, color: 'bg-[var(--color-primary-blue)]', textColor: 'text-[var(--color-primary-blue)]' },
      { label: 'Propostas', value: propostas.size, color: 'bg-cyan-500', textColor: 'text-cyan-600' },
      { label: 'Negociações', value: negociacoes.size, color: 'bg-teal-500', textColor: 'text-teal-600' },
      { label: 'Clientes', value: clientes.size, color: 'bg-emerald-500', textColor: 'text-emerald-600' },
    ];
    const top = base[0].value || 1;
    return base.map((s) => ({ ...s, pct: Math.round((s.value / top) * 1000) / 10 }));
  }, [leads, proposals]);

  // Receita por Produto: valor real (getLeadRealValue — mesma fonte do Ranking de Vendas, sem
  // fallback pro preço de catálogo) dos leads Fechado, somado por categoria do(s) produto(s)
  // vinculado(s). Mais de um produto na mesma venda divide o valor igualmente entre eles; sem
  // produto vinculado nenhum, cai em "Outros" (nunca fica de fora do total).
  const revenueByProduct = useMemo<RevenueSlice[]>(() => {
    const byCategory: Record<string, number> = {};
    for (const l of (leads as any[]).filter((l) => l.status === 'Fechado')) {
      const value = getLeadRealValue(l, proposals as any[]);
      if (value <= 0) continue;
      const ids: string[] = Array.isArray(l.productIds) ? l.productIds : [];
      const cats = [...new Set(ids.map((id) => (products as any[]).find((p) => p.id === id)?.category).filter(Boolean))] as string[];
      if (cats.length === 0) {
        byCategory['Outros'] = (byCategory['Outros'] || 0) + value;
      } else {
        const share = value / cats.length;
        for (const c of cats) byCategory[c] = (byCategory[c] || 0) + share;
      }
    }
    const total = Object.values(byCategory).reduce((s, v) => s + v, 0);
    const PALETTE = ['#2563EB', '#8B5CF6', '#F59E0B', '#10B981', '#EC4899', '#06B6D4', '#F43F5E'];
    return Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({
        name, value: Math.round(value * 100) / 100,
        pct: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
        color: PALETTE[i % PALETTE.length],
      }));
  }, [leads, proposals, products]);

  return (
    <motion.div
      key="executivo"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="space-y-5 text-left"
    >
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] relative shadow-sm">
          <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
            <div>
              <h3 className="text-lg font-black text-[var(--color-text-primary)] uppercase tracking-tight flex items-center gap-2.5">
                <BarChart3 className="w-5 h-5 text-[var(--color-primary-blue)]" /> Fluxo de Performance
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-1 font-medium">Correlação entre volume de leads prospectados e faturamento recorrente.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] p-1 rounded-[var(--radius-control)] gap-1">
                {(['MRR', 'Retenção'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setComparisonPeriod(type === 'MRR' ? 'month' : 'year')}
                    className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all border-none cursor-pointer ${
                      comparisonPeriod === (type === 'MRR' ? 'month' : 'year')
                        ? 'bg-[var(--color-primary-blue)] text-white shadow-xs'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mb-3">
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-[var(--color-primary-blue)]/10 rounded-full border border-[var(--color-primary-blue)]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary-blue)]" />
              <span className="text-[10px] text-[var(--color-primary-blue)] font-bold uppercase tracking-wider">MRR (R$)</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-cyan-500/10 rounded-full border border-cyan-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 opacity-60" />
              <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-bold uppercase tracking-wider">Volume de Leads</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-purple-500/10 rounded-full border border-purple-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold uppercase tracking-wider">Negócios Fechados</span>
            </div>
          </div>

          {/* Receita (R$) e contagens (leads/negócios fechados) são unidades
              diferentes — dividir em dois eixos Y evita que uma métrica
              esmague visualmente a outra (achado real: um mês com centenas
              de leads sincronizados de uma vez fazia a linha de MRR, em
              milhares de reais, parecer achatada perto do zero). */}
          <div className="h-[240px] w-full min-w-0 -mx-2">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
              <AreaChart data={performanceData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--color-text-faint)" fontSize={11} tickLine={false} axisLine={false} padding={{ left: 24, right: 24 }} />
                <YAxis
                  yAxisId="revenue"
                  stroke="var(--color-text-faint)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => formatCurrency(v)}
                  width={90}
                />
                <YAxis
                  yAxisId="count"
                  orientation="right"
                  stroke="var(--color-text-faint)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface-elevated)',
                    border: '1px solid var(--color-border-default)',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-panel)',
                    color: 'var(--color-text-primary)',
                    fontSize: '12px',
                  }}
                  itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                  formatter={(value: number, name: string) => name === 'MRR (R$)' ? [formatCurrency(value), name] : [value, name]}
                />
                <Legend wrapperStyle={{ display: 'none' }} />
                <Area yAxisId="revenue" type="monotone" dataKey="vendas" name="MRR (R$)" stroke="#2563EB" fillOpacity={1} fill="url(#colorSales)" strokeWidth={3} strokeLinecap="round" />
                <Area yAxisId="count" type="monotone" dataKey="leads" name="Volume de Leads" stroke="#06B6D4" fillOpacity={0} strokeWidth={2.5} strokeDasharray="5 5" />
                <Line yAxisId="count" type="stepAfter" dataKey="retention" name="Negócios Fechados" stroke="#8B5CF6" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] relative h-full flex flex-col shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-500" /> Medidor de Metas
              </h3>
              <Trophy className="w-4 h-4 text-amber-500" />
            </div>
            <div className="flex-1 flex flex-col justify-center items-center py-4">
              {!hasSquads ? (
                <div className="flex flex-col items-center justify-center py-6 gap-1.5 opacity-60">
                  <Target className="w-6 h-6 text-[var(--color-text-faint)]" />
                  <p className="text-[11px] font-bold text-[var(--color-text-muted)] text-center">Nenhum squad com meta cadastrada</p>
                  <p className="text-[10px] text-[var(--color-text-faint)] text-center">Configure em RH → Squads pra acompanhar aqui</p>
                </div>
              ) : (
                <>
                  <div className="relative w-32 h-32 mb-4">
                    <svg className="w-full h-full" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="var(--color-border-default)" strokeWidth="8" />
                      <motion.circle
                        cx="50" cy="50" r="45"
                        fill="none" stroke="#10b981" strokeWidth="8"
                        strokeDasharray="282.7"
                        initial={{ strokeDashoffset: 282.7 }}
                        animate={{ strokeDashoffset: 282.7 * (1 - goalPct / 100) }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                        strokeLinecap="round"
                        transform="rotate(-90 50 50)"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-black text-[var(--color-text-primary)] font-mono">{goalPct}%</span>
                      <span className="text-[10px] text-[var(--color-text-muted)] font-black uppercase">Alcançado</span>
                    </div>
                  </div>
                  <div className="w-full space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[var(--color-text-faint)]" />
                        <span className="text-xs text-[var(--color-text-muted)] font-medium">Meta Global:</span>
                      </div>
                      <span className="text-xs font-bold text-[var(--color-text-faint)]">{formatCurrency(totalMeta)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-xs text-[var(--color-text-muted)] font-medium">Realizado:</span>
                      </div>
                      <span className="text-xs font-black text-[var(--color-text-primary)]">{formatCurrency(totalAlcancado)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-xs text-[var(--color-text-muted)] font-medium">Restante:</span>
                      </div>
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400">{formatCurrency(restanteMeta)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>

      <SalesFunnelWidget steps={salesFunnelSteps} />

      <div className="grid lg:grid-cols-2 gap-6 items-stretch">
        <RecentActivityFeed activities={recentActivities} />
        <RevenueByProductDonut slices={revenueByProduct} />
      </div>

      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-panel)] transition-colors text-left cursor-pointer shadow-xs"
        >
          <span className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--color-primary-blue)]" />
            {showDetails ? "Ocultar Detalhes Estratégicos" : "Expandir Insights & Snapshot Financeiro"}
          </span>
          <ChevronDown className={`w-4 h-4 text-[var(--color-text-muted)] shrink-0 transition-transform ${showDetails ? "rotate-180" : ""}`} />
        </button>

        {showDetails && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col shadow-sm">
              <h3 className="text-xs font-black text-[var(--color-text-muted)] mb-4 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-[var(--color-primary-blue)]" /> Insights de Operação
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold text-[var(--color-text-primary)] mb-1 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500" /> Pipeline em Aberto
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                    {leadsAbertos.length} lead(s) em negociação, somando {formatCurrency(valorPipelineAberto)}.
                  </p>
                </div>
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-[var(--radius-control)]">
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-0.5">Oportunidade Mapeada</p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {leadsQuentes > 0
                      ? `${leadsQuentes} lead(s) quente(s) com Score IA > 80 aguardando follow-up.`
                      : "Nenhum lead com Score IA > 80 em aberto no momento."}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="lg:col-span-3 p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2.5">
                  <Briefcase className="w-4 h-4 text-purple-500" /> Snapshot de Contratos & Retenção
                </h3>
                {taxaInadimplencia !== null && (
                  <Badge variant={taxaInadimplencia > 0 ? "destructive" : "success"} dot>
                    {taxaInadimplencia === 0 ? "Sem inadimplência" : `${formatPercentage(taxaInadimplencia)} inadimplente`}
                  </Badge>
                )}
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                {!hasContracts ? (
                  <div className="col-span-3 flex flex-col items-center justify-center py-6 gap-2 opacity-50">
                    <Briefcase className="w-6 h-6 text-[var(--color-text-faint)]" />
                    <p className="text-xs font-medium text-[var(--color-text-muted)]">Cadastre contratos para ver as métricas financeiras</p>
                  </div>
                ) : (
                  [
                    { label: "MRR Ativo", value: formatCurrency(activeMRR), desc: "Contratos ativos em execução", color: "text-emerald-600 dark:text-emerald-400" },
                    { label: "Contratos Ativos", value: contracts.filter(c => c.status === 'Ativo').length.toString(), desc: "Carteira de clientes recorrentes", color: "text-[var(--color-primary-blue)]" },
                    { label: "Ticket Médio", value: contracts.filter(c => c.status === 'Ativo').length > 0 ? formatCurrency(activeMRR / contracts.filter(c => c.status === 'Ativo').length) : formatCurrency(0), desc: "Receita média por contrato", color: "text-purple-600 dark:text-purple-400" },
                  ].map((item, i) => (
                    <div key={i} className="space-y-1.5 border-r border-[var(--color-border-subtle)] last:border-0 pr-6 last:pr-0">
                      <p className="text-[10px] text-[var(--color-text-faint)] font-bold uppercase tracking-wider">{item.label}</p>
                      <h4 className={`text-xl font-black ${item.color} font-mono tracking-tight`}>{item.value}</h4>
                      <p className="text-[10px] text-[var(--color-text-muted)]">{item.desc}</p>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="lg:col-span-4 p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
              <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2.5 mb-6">
                <Wallet className="w-4 h-4 text-emerald-500" /> Snapshot Financeiro
                <span className="text-[10px] font-medium normal-case text-[var(--color-text-faint)]">
                  {!dateFrom && !dateTo ? "· todo o período" : "· período selecionado"}
                </span>
              </h3>
              {!financeSnapshot.hasAnyEntry ? (
                <div className="flex flex-col items-center justify-center py-6 gap-2 opacity-50">
                  <Wallet className="w-6 h-6 text-[var(--color-text-faint)]" />
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">Sem lançamentos financeiros para calcular este snapshot.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
                  {[
                    { label: "Receita", value: formatCurrency(financeSnapshot.receita), desc: "Recebido no período", icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400" },
                    { label: "Despesas", value: formatCurrency(financeSnapshot.despesas), desc: "Pago no período", icon: TrendingDown, color: "text-rose-600 dark:text-rose-400" },
                    {
                      label: "Receita Líquida", value: formatCurrency(financeSnapshot.receitaLiquida), desc: "Receita − Despesas",
                      icon: Wallet, color: financeSnapshot.receitaLiquida >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                    },
                    { label: "Novas Vendas", value: financeSnapshot.novasVendas.toString(), desc: "Recebimentos no período", icon: Receipt, color: "text-[var(--color-primary-blue)]" },
                    { label: "Contas a Receber", value: formatCurrency(financeSnapshot.contasAReceber), desc: "Em aberto agora", icon: Receipt, color: "text-amber-600 dark:text-amber-400" },
                    { label: "Contas a Pagar", value: formatCurrency(financeSnapshot.contasAPagar), desc: "Em aberto agora", icon: Receipt, color: "text-amber-600 dark:text-amber-400" },
                    { label: "Clientes Ativos", value: financeSnapshot.clientesAtivos.toString(), desc: "Base de clientes atual", icon: Users, color: "text-[var(--color-primary-blue)]" },
                    { label: "Clientes Perdidos", value: financeSnapshot.clientesPerdidos.toString(), desc: "Marcados como Inativo", icon: Users, color: "text-rose-600 dark:text-rose-400" },
                  ].map((item, i) => (
                    <div key={i} className="space-y-1">
                      <p className="text-[10px] text-[var(--color-text-faint)] font-bold uppercase tracking-wider flex items-center gap-1">
                        <item.icon className="w-3 h-3" /> {item.label}
                      </p>
                      <h4 className={`text-base font-black ${item.color} font-mono tracking-tight`}>{item.value}</h4>
                      <p className="text-[10px] text-[var(--color-text-muted)]">{item.desc}</p>
                    </div>
                  ))}
                </div>
              )}
              {!financeSnapshot.hasAnyCliente && financeSnapshot.hasAnyEntry && (
                <p className="text-[10px] text-[var(--color-text-faint)] mt-4">Clientes Ativos/Perdidos: sem registros na Base de Clientes ainda.</p>
              )}
            </Card>

            <div className="lg:col-span-4">
              <RevenueWaterfallChart
                receita={financeSnapshot.receita}
                despesasPorCategoria={financeSnapshot.despesasPorCategoria}
                receitaLiquida={financeSnapshot.receitaLiquida}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
