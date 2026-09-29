import { useMemo } from 'react';
import { DollarSign, Users, Target, TrendingDown, Sun } from 'lucide-react';
import { useLocalization } from '../../../contexts/LocalizationContext';

export type DashboardStatsCard = {
  label: string;
  value: string;
  trend: string;
  color: string;
  bg: string;
  icon: React.ComponentType<any>;
  forecast: string;
  /** Explica de onde vem o número e como é calculado — mostrado como tooltip
   * no card (ver QuickStatsGrid.tsx). Nunca jargão de banco de dados. */
  tooltip?: string;
  /** Últimos pontos reais (mesmo bucket diário/mensal do Fluxo de
   * Performance) por trás do KPI — vira o mini-gráfico do card (ver
   * QuickStatsGrid.tsx). Ausente = card sem série equivalente (ex.: métricas
   * ainda hardcoded '--' em nichos de demonstração) — nesse caso não desenha
   * nada, nunca inventa uma linha. */
  sparkline?: number[];
};

type PerformancePoint = { name: string; vendas: number; faturamento?: number; leads: number; retention: number };

const TAIL_POINTS = 8;
const tail = (arr: number[]) => arr.slice(Math.max(0, arr.length - TAIL_POINTS));

/** Tendência real = último bucket (dia ou mês, o mesmo recorte do Fluxo de
 * Performance) vs o anterior. Não interpola nem inventa "vs. período
 * anterior" quando não há base confiável pra comparar (< 2 pontos, ou ponto
 * anterior zerado — variação percentual sobre zero não é um número real). */
function computeTrend(series: number[] | undefined): string {
  if (!series || series.length < 2) return '--';
  const curr = series[series.length - 1];
  const prev = series[series.length - 2];
  if (!(prev > 0)) return '--';
  const pct = Math.round(((curr - prev) / prev) * 100);
  if (pct === 0) return '0%';
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

export function DashboardStatsByNiche({
  tenantNiche,
  totalRevenue,
  faturamentoContratado,
  leadsLength,
  conversionRate,
  churnRate,
  hasContractsData,
  performanceData,
}: {
  tenantNiche: string | undefined;
  /** MRR — só a parcela recorrente (ver revenueMetrics.getMRR). Usado
   * exclusivamente pelo card "Receita (MRR)" do nicho Master/default. */
  totalRevenue: number;
  /** Faturamento contratado = MRR + avulso/implantação (ver
   * revenueMetrics.getFaturamentoContratado). Usado pelos cards cujo rótulo
   * NÃO é "MRR" (Hardware & Upgrades, Faturamento Clínico, VGV Estimado) —
   * achado real 2026-09-27: esses 3 cards mostravam `totalRevenue` (MRR puro)
   * como se fosse o valor total contratado, uma métrica genuinamente diferente
   * (MRR exclui projeto avulso/implantação por definição). Opcional: cai pro
   * próprio `totalRevenue` quando o chamador não passa essa prop, nunca "sem
   * dado" onde já existia um número (só menos preciso que o ideal). */
  faturamentoContratado?: number;
  leadsLength: number;
  conversionRate: number;
  churnRate: number;
  hasContractsData: boolean;
  /** Mesma série já usada no gráfico "Fluxo de Performance" (useDashboard.ts)
   * — reaproveitada aqui pra tendência/mini-gráfico real dos KPIs, em vez de
   * uma segunda fonte de dado só pra esses cards. Opcional: telas que ainda
   * não passam essa prop continuam funcionando, só sem tendência/sparkline. */
  performanceData?: PerformancePoint[];
}) {
  const { formatCurrency } = useLocalization();
  // 0 contratos/pacientes não é "0% de churn" — é "não dá pra medir ainda".
  // Mostrar "0,0%" nesse caso pareceria uma métrica boa quando na real não
  // existe base nenhuma por trás dela.
  const churnValue = hasContractsData ? `${churnRate.toFixed(1)}%` : 'Sem dados';

  // Séries reais por trás dos 3 KPIs que têm equivalente direto no Fluxo de
  // Performance (revenue/leads/conversão) — Taxa Churn não tem uma série
  // por bucket calculada hoje, então fica sem tendência/sparkline (nunca
  // reaproveita a série errada só pra "preencher" o card).
  const revenueSeries = useMemo(() => tail((performanceData || []).map(p => p.vendas)), [performanceData]);
  // Mesmo bucket do `revenueSeries` acima, só que somando o valor TOTAL
  // contratado (recorrente + avulso) por bucket, não só o `mrr` — a série que
  // bate com `faturamentoContratado` (snapshot), pros cards que mostram
  // faturamento total em vez de MRR (ver comentário no tipo das props acima).
  // `p.faturamento` pode faltar num chamador antigo — cai pro `vendas` (só
  // fica menos preciso, nunca quebra ou inventa dado maior que o real).
  const faturamentoSeries = useMemo(
    () => tail((performanceData || []).map(p => p.faturamento ?? p.vendas)),
    [performanceData]
  );
  const leadsSeries = useMemo(() => tail((performanceData || []).map(p => p.leads)), [performanceData]);
  const conversionSeries = useMemo(
    () => tail((performanceData || []).map(p => (p.leads > 0 ? Math.round((p.retention / p.leads) * 1000) / 10 : 0))),
    [performanceData]
  );
  // Faturamento contratado: cai pro próprio totalRevenue (MRR) quando o
  // chamador não passa a prop nova — nunca fica "sem dado" onde já existia
  // um número, só um pouco menos preciso (ver comentário na prop acima).
  const faturamento = faturamentoContratado ?? totalRevenue;

  const stats = useMemo<DashboardStatsCard[]>(() => {
    const niche = tenantNiche || 'Master';

    if (niche === 'Tecnologia') {
      return [
        {
          label: 'Hardware & Upgrades',
          value: formatCurrency(faturamento),
          trend: computeTrend(faturamentoSeries),
          color: 'text-slate-400',
          bg: 'bg-white/5',
          icon: DollarSign,
          forecast: '--',
          tooltip: 'Valor total dos contratos ativos (recorrente + venda avulsa de aparelho/upgrade) — diferente de MRR, que conta só a parcela recorrente.',
          sparkline: faturamentoSeries,
        },
        {
          label: 'Aparelhos Trade-In',
          value: leadsLength.toString(),
          trend: computeTrend(leadsSeries),
          color: 'text-slate-400',
          bg: 'bg-white/5',
          icon: Users,
          forecast: '--',
          sparkline: leadsSeries,
        },
        {
          label: 'Ativação SDR',
          value: `${conversionRate}%`,
          trend: computeTrend(conversionSeries),
          color: 'text-slate-400',
          bg: 'bg-white/5',
          icon: Target,
          forecast: '--',
          sparkline: conversionSeries,
        },
        {
          label: 'Foco Conversão',
          value: `${churnRate.toFixed(1)}%`,
          trend: '--',
          color: 'text-slate-400',
          bg: 'bg-white/5',
          icon: TrendingDown,
          forecast: '--',
        },
      ];
    }

    if (niche === 'Solar') {
      return [
        {
          label: 'Potência Total',
          value: '--',
          trend: '--',
          color: 'text-slate-400',
          bg: 'bg-white/5',
          icon: Sun,
          forecast: '--',
        },
        {
          label: 'Projetos em Homologação',
          value: leadsLength.toString(),
          trend: computeTrend(leadsSeries),
          color: 'text-slate-400',
          bg: 'bg-white/5',
          icon: Users,
          forecast: '--',
          sparkline: leadsSeries,
        },
        {
          label: 'Viabilidade Concluída',
          value: '--',
          trend: '--',
          color: 'text-slate-400',
          bg: 'bg-white/5',
          icon: Target,
          forecast: '--',
        },
        {
          label: 'ROI Médio Projetos',
          value: '--',
          trend: '--',
          color: 'text-slate-400',
          bg: 'bg-white/5',
          icon: TrendingDown,
          forecast: '--',
        },
      ];
    }

    if (niche === 'Clínica') {
      return [
        {
          label: 'Faturamento Clínico',
          value: formatCurrency(faturamento),
          trend: computeTrend(faturamentoSeries),
          color: 'text-slate-400',
          bg: 'bg-white/5',
          icon: DollarSign,
          forecast: '--',
          tooltip: 'Valor total dos contratos/planos ativos (recorrente + procedimento avulso) — diferente de MRR, que conta só a parcela recorrente.',
          sparkline: faturamentoSeries,
        },
        {
          label: 'Consultas Agendadas',
          value: leadsLength.toString(),
          trend: computeTrend(leadsSeries),
          color: 'text-slate-400',
          bg: 'bg-white/5',
          icon: Users,
          forecast: '--',
          sparkline: leadsSeries,
        },
        {
          label: 'Teleconsultas Ativas',
          value: '--',
          trend: '--',
          color: 'text-slate-400',
          bg: 'bg-white/5',
          icon: Target,
          forecast: '--',
        },
        {
          label: 'Taxa Churn Pacientes',
          value: churnValue,
          trend: '--',
          color: 'text-slate-400',
          bg: 'bg-white/5',
          icon: TrendingDown,
          forecast: '--',
        },
      ];
    }

    if (niche === 'Imobiliária') {
      return [
        {
          label: 'VGV Estimado',
          value: formatCurrency(faturamento),
          trend: computeTrend(faturamentoSeries),
          color: 'text-slate-400',
          bg: 'bg-white/5',
          icon: DollarSign,
          forecast: '--',
          tooltip: 'Valor Geral de Vendas: total contratado (recorrente + avulso) dos contratos ativos — diferente de MRR, que conta só a parcela recorrente mensal.',
          sparkline: faturamentoSeries,
        },
        {
          label: 'Visitas Incorporador',
          value: leadsLength.toString(),
          trend: computeTrend(leadsSeries),
          color: 'text-slate-400',
          bg: 'bg-white/5',
          icon: Users,
          forecast: '--',
          sparkline: leadsSeries,
        },
        {
          label: 'Crédito Pré-Aprovado',
          value: `${conversionRate}%`,
          trend: computeTrend(conversionSeries),
          color: 'text-slate-400',
          bg: 'bg-white/5',
          icon: Target,
          forecast: '--',
          sparkline: conversionSeries,
        },
        {
          label: 'Tempo de Campanha',
          value: '--',
          trend: '--',
          color: 'text-slate-400',
          bg: 'bg-white/5',
          icon: TrendingDown,
          forecast: '--',
        },
      ];
    }

    // Default fallback
    return [
      {
        // Achado real (2026-09-29): o card único "Receita (MRR)" somava
        // `mrr_value`, mas por causa de contratos legados com esse campo
        // gravado errado (valor total do contrato em vez da mensalidade),
        // o usuário via um número que não batia com MRR nenhum. Em vez de
        // só corrigir o dado, agora existem os dois cards separados: este
        // (total contratado, recorrente + avulso — pode incluir contratos
        // plurianuais pelo valor cheio) e "Receita (MRR)" logo abaixo (só a
        // parcela mensal). Nunca são o mesmo número quando há contrato de
        // mais de 1 mês.
        label: 'Receita',
        value: formatCurrency(faturamento),
        trend: computeTrend(faturamentoSeries),
        color: 'text-slate-400',
        bg: 'bg-white/5',
        icon: DollarSign,
        forecast: '--',
        tooltip: 'Valor total contratado (recorrente + avulso/implantação) dos contratos ativos agora — em contratos de mais de 1 mês, é o valor cheio do contrato, não a mensalidade. Para a parcela mensal, veja o card "Receita (MRR)".',
        sparkline: faturamentoSeries,
      },
      {
        label: 'Receita (MRR)',
        value: formatCurrency(totalRevenue),
        trend: computeTrend(revenueSeries),
        color: 'text-slate-400',
        bg: 'bg-white/5',
        icon: DollarSign,
        forecast: '--',
        tooltip: 'Soma do valor recorrente (mrr) de todos os contratos ativos agora — só a parcela mensal, mesmo em contratos de vários meses. Não muda com o período selecionado, é um saldo do momento atual.',
        sparkline: revenueSeries,
      },
      {
        label: 'Leads Ativos',
        value: leadsLength.toString(),
        trend: computeTrend(leadsSeries),
        color: 'text-slate-400',
        bg: 'bg-white/5',
        icon: Users,
        forecast: '--',
        tooltip: 'Leads criados no período selecionado que ainda não foram marcados como Perdido (inclui os já Fechados).',
        sparkline: leadsSeries,
      },
      {
        label: 'Conversão',
        value: `${conversionRate}%`,
        trend: computeTrend(conversionSeries),
        color: 'text-slate-400',
        bg: 'bg-white/5',
        icon: Target,
        forecast: '--',
        tooltip: 'Leads com status Fechado ÷ total de leads criados no período selecionado.',
        sparkline: conversionSeries,
      },
      {
        label: 'Taxa Churn',
        value: churnValue,
        trend: '--',
        color: 'text-slate-400',
        bg: 'bg-white/5',
        icon: TrendingDown,
        tooltip: 'Contratos cancelados durante o período selecionado ÷ total de contratos existentes nesse intervalo.',
        forecast: '--',
      },
    ];
  }, [tenantNiche, totalRevenue, faturamento, leadsLength, conversionRate, churnRate, churnValue, formatCurrency, revenueSeries, faturamentoSeries, leadsSeries, conversionSeries]);

  return stats;
}

