import { useState, useMemo, useEffect } from 'react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { parseCurrencyBR } from '../../lib/utils';
import { getMRR, getFaturamentoContratado, getConversionRate, getActiveLeadsCount, getChurnRate } from '../../lib/revenueMetrics';
import { FUNIS_DEFAULT } from '../settings/sections/crm/funisTypes';
import { apiFetch } from '../../lib/apiClient';

export interface DashboardSummary {
  totalRevenue: number;
  conversionRate: number;
  activeLeadsCount: number;
  churnRate: number;
  valorPipelineAberto: number;
  leadsQuentes: number;
  mrrAtivo: number;
  mrrEmRisco: number;
  taxaInadimplencia: number;
  contractsAtivosCount: number;
  contractsEmRiscoCount: number;
  contractsTotalCount: number;
}

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
// Pedido explícito do usuário: cada etapa de progressão (tudo que não é
// Ganho/Perdido, esses ficam fixos verde/vermelho — ver funnelData abaixo)
// com uma cor bem distinta da vizinha, não um gradiente suave (um degradê
// deixava etapas adjacentes parecidas demais, difícil de diferenciar o
// bastão de uma da outra). Ordem pedida: Novo Lead azul, Reunião azul claro,
// Diagnóstico roxo, e assim por diante — cicla se o funil tiver mais etapas
// de progressão do que cores aqui. Classes literais (Tailwind JIT só inclui
// o que existe no código-fonte).
const FUNNEL_STAGE_COLORS = [
  'bg-blue-500',    // Novo Lead
  'bg-cyan-400',    // Reunião (azul claro)
  'bg-purple-500',  // Diagnóstico (roxo)
  'bg-fuchsia-500', // Apresentação
  'bg-pink-500',    // Proposta
  'bg-orange-500',  // Follow-Up
  'bg-amber-500',   // Negociação
  'bg-teal-500',    // Contrato
  'bg-indigo-500',
];

// `lead.date` é um campo de texto livre digitado no cadastro — NewLeadModal.tsx grava
// literalmente a string "Hoje" (não uma data ISO) em todo lead criado por lá, e muitos leads
// migrados ficam com "" (vazio). Usar `.date` sozinho pra filtrar por período ou agrupar por
// mês fazia um tenant inteiro sumir do Fluxo de Performance e do filtro de período (achado
// real: 60 leads da Pluppex, 40 com "" e 20 com "Hoje" — ZERO com uma data ISO de verdade,
// então "Volume de Leads" dava 0 em todo mês e o eixo direito do gráfico colapsava pra caber só
// "Negócios Fechados"). `created_at` (carimbado pelo banco, sempre presente) é o fallback
// confiável quando `.date` não é uma data ISO de verdade.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
function leadDateIso(l: any): string {
  if (typeof l?.date === "string" && ISO_DATE_RE.test(l.date)) return l.date;
  return typeof l?.created_at === "string" ? l.created_at : "";
}

// Mesma convenção de stageId usada em usePipeline.ts — precisa bater com o
// stageId real gravado no lead pelo Kanban, senão o funil conta tudo errado.
function getStageId(funilId: string, idx: number): string {
  if (funilId === "funil-comercial-default") return String(idx + 1);
  if (funilId === "funil-sdr-ia-default") return `sdr-${idx + 1}`;
  return `${funilId}-${idx}`;
}

export function useDashboard() {
  const { leads: allLeads, contracts, squads, leadActivities, appointments, funis, proposals } = useData();
  const { isModuleEnabled, user, activeTenantId } = useAuth();
  const [activeTab, setActiveTab] = useState<'executivo' | 'comercial' | 'sucesso' | 'marketing' | 'bi'>('executivo');
  const [comparisonPeriod, setComparisonPeriod] = useState<'month' | 'year'>('month');

  // Filtro de período do Dashboard — por `date` do lead (data de cadastro/
  // criação), o mesmo campo já usado no gráfico de performance mais abaixo.
  // Vazio (null) = sem filtro, mostra tudo. Afeta os cartões/funil/ranking
  // que dependem de `leads`; o gráfico de performance mantém sua própria
  // janela fixa de 7 meses (é um gráfico de tendência, não um total).
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);

  const leads = useMemo(() => {
    if (!dateFrom && !dateTo) return allLeads;
    return (allLeads as any[]).filter((l) => {
      const iso = leadDateIso(l).slice(0, 10);
      if (!iso) return false;
      if (dateFrom && iso < dateFrom) return false;
      if (dateTo && iso > dateTo) return false;
      return true;
    });
  }, [allLeads, dateFrom, dateTo]);

  // `contract.date` é "DD/MM/YYYY" (ver rowToContract em DataContext.tsx),
  // convertido pra ISO antes de comparar com dateFrom/dateTo (que já vêm em
  // ISO do DateRangeFilter). Usado só pelo gráfico de Fluxo de Performance
  // abaixo (MRR assinado EM CADA mês/dia do período — uma métrica de fluxo,
  // por natureza recortada por data de assinatura). "MRR Ativo"/"Contratos
  // Ativos"/Snapshot continuam usando `contracts` inteiro (sem esse filtro):
  // são saldos do momento atual ("ativo" = agora), não um fluxo do período —
  // a mesma convenção de "MRR Ativo" já usada em todo o resto do sistema
  // (Financeiro, BI, revenueMetrics.getMRR). Period-scopar esse número faria
  // ele divergir do "MRR Ativo" mostrado em qualquer outra tela.
  const contractDateToIso = (d: string | undefined | null): string | null => {
    if (!d) return null;
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  };
  const filteredContracts = useMemo(() => {
    if (!dateFrom && !dateTo) return contracts;
    return (contracts as any[]).filter((c) => {
      const iso = contractDateToIso(c.date);
      if (!iso) return false;
      if (dateFrom && iso < dateFrom) return false;
      if (dateTo && iso > dateTo) return false;
      return true;
    });
  }, [contracts, dateFrom, dateTo]);

  // Quantos meses o período selecionado cobre — usado só pra Churn (ver
  // abaixo): getChurnRate(contracts, {months}) já filtra por `cancelledAt`
  // (data real do cancelamento), não por `signed_date` — a definição certa
  // de "churn no período" é "cancelado durante o período", não "contrato
  // assinado durante o período". `undefined` (sem período/"Tudo") cai na
  // taxa geral (cancelados/total, sem recorte de data).
  const churnPeriodMonths = useMemo(() => {
    if (!dateFrom && !dateTo) return undefined;
    const start = dateFrom ? new Date(dateFrom + "T00:00:00") : new Date(2000, 0, 1);
    const end = dateTo ? new Date(dateTo + "T00:00:00") : new Date();
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / (30 * 86400000)));
  }, [dateFrom, dateTo]);

  // Goal Alerts
  const goalAlerts = useMemo(() => {
    return squads.filter(sq => (sq.faturamentoAlcancado / sq.meta) >= 0.9);
  }, [squads]);

  // Resumo cacheado (Redis-SPY) das 4 métricas "hero" — GET /api/dashboard/summary
  // em server.ts, mesma fórmula de src/lib/revenueMetrics.ts. Só usado quando
  // não há filtro de data ativo (o endpoint agrega o tenant inteiro, sem
  // recorte por período) — com filtro, sempre cai pro cálculo client-side
  // abaixo, que já respeita dateFrom/dateTo corretamente. Puramente aditivo:
  // se a chamada falhar ou ainda não tiver voltado, o cálculo client-side
  // (que já roda de qualquer forma, sem custo extra real — os arrays já
  // estão em memória por causa de outras telas) continua sendo usado.
  const [serverSummary, setServerSummary] = useState<DashboardSummary | null>(null);
  useEffect(() => {
    setServerSummary(null);
    if (dateFrom || dateTo || !activeTenantId) return;
    let cancelled = false;
    // `tenantId` explícito — essencial pra contas master/parceiro trocando
    // de "empresa visualizada" (switchTenant() em AuthContext.tsx): sem
    // isso, o servidor resolvia sempre o tenant "de casa" do usuário
    // logado, nunca o tenant selecionado na tela. Revalidado no servidor
    // via has_tenant_access antes de usar — nunca aceito às cegas.
    apiFetch(`/api/dashboard/summary?tenantId=${encodeURIComponent(activeTenantId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setServerSummary(data); })
      .catch(() => { /* silencioso — cálculo client-side abaixo já cobre */ });
    return () => { cancelled = true; };
  }, [activeTenantId, dateFrom, dateTo]);

  // Stats Calculations — via camada única de métricas (src/lib/revenueMetrics.ts)
  // pra usar exatamente a mesma definição de MRR/conversão/leads ativos em
  // todos os dashboards do sistema, não uma fórmula própria por tela.
  // `getMRR(contracts)` (sem filtro de período) de propósito — ver comentário
  // acima sobre "MRR Ativo" ser saldo atual, não fluxo do período.
  const totalRevenueClient = useMemo(() => getMRR(contracts), [contracts]);
  // Faturamento contratado (recorrente + avulso/implantação) — distinto do
  // MRR acima. Sem filtro de período, mesma convenção de "saldo do momento
  // atual" (ver revenueMetrics.getFaturamentoContratado). Usado só pelos
  // cards de nicho cujo rótulo não é "MRR" (Faturamento Clínico, VGV
  // Estimado, Hardware & Upgrades — ver DashboardStatsByNiche.tsx); o card
  // "Receita (MRR)" continua em cima de `totalRevenue`/getMRR, sem mudança.
  const faturamentoContratado = useMemo(() => getFaturamentoContratado(contracts), [contracts]);
  const conversionRateClient = useMemo(() => getConversionRate(leads).toFixed(1), [leads]);
  const activeLeadsCountClient = useMemo(() => getActiveLeadsCount(leads), [leads]);
  // BUG real: essa função trocava de fórmula (churn de contrato cancelado ->
  // churn de paciente sem visita há 90 dias) só porque a tabela `appointments`
  // tinha alguma linha — sem checar se o tenant É de fato uma clínica. Um
  // tenant de outro nicho que por qualquer motivo tivesse linhas nessa tabela
  // (ela é usada só pelo módulo Clínica) exibiria uma métrica com definição
  // completamente diferente sem nenhum aviso. Agora só entra nesse ramo
  // clínico quando o nicho do tenant é realmente "Clínica".
  const isClinicaNiche = user?.tenantNiche === 'Clínica';
  const churnRateClient = useMemo(() => {
    if (!isClinicaNiche || !appointments || appointments.length === 0) {
      return getChurnRate(contracts, churnPeriodMonths ? { months: churnPeriodMonths } : undefined);
    }
    const patientMap = new Map<string, Date>();
    appointments.forEach(a => {
      try {
        const appointmentDate = new Date(a.date);
        if (!isNaN(appointmentDate.getTime())) {
          const existing = patientMap.get(a.patient);
          if (!existing || appointmentDate > existing) patientMap.set(a.patient, appointmentDate);
        }
      } catch {}
    });
    const totalPatients = patientMap.size;
    if (totalPatients === 0) return 0;
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const churnedPatients = Array.from(patientMap.values()).filter(d => d < ninetyDaysAgo).length;
    return parseFloat(((churnedPatients / totalPatients) * 100).toFixed(1));
  }, [isClinicaNiche, appointments, contracts, churnPeriodMonths]);

  const totalRevenue = serverSummary?.totalRevenue ?? totalRevenueClient;
  const conversionRate = (serverSummary?.conversionRate ?? Number(conversionRateClient)).toFixed(1);
  const activeLeadsCount = serverSummary?.activeLeadsCount ?? activeLeadsCountClient;

  // Fluxo de Performance: agrupa por mês (ou por dia, se o período selecionado
  // for curto) dentro do MESMO intervalo (dateFrom/dateTo) usado pelos cards
  // acima — antes o gráfico tinha uma janela fixa de "últimos 7 meses a
  // partir de hoje" totalmente independente do filtro de período da página,
  // violando a regra de que todo componente precisa refletir o mesmo
  // intervalo. Sem filtro ("Tudo"), preserva a janela padrão de 7 meses de
  // antes (mesma leitura visual que já existia pro caso mais comum).
  const performanceData = useMemo(() => {
    const now = new Date();
    const toDateOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const rangeEndDate = dateTo ? toDateOnly(new Date(dateTo + "T12:00:00")) : toDateOnly(now);
    const sixMonthsBack = new Date(rangeEndDate.getFullYear(), rangeEndDate.getMonth() - 6, 1);
    // Sem filtro de período explícito: em vez de sempre voltar 6 meses fixos, começa no mês da
    // atividade real mais antiga do tenant (1º lead ou 1º contrato) — nunca antes disso, nunca
    // depois de 6 meses atrás. Achado real: um tenant jovem com toda a atividade concentrada no
    // mês mais recente mostrava 6 meses vazios seguidos de uma subida quase vertical no fim —
    // tecnicamente certo (não tem dado antes disso), mas ilegível. Com a janela ajustada ao que
    // realmente existe, o mesmo tenant mostra só os meses com dado de verdade.
    let earliestActivity: Date | null = null;
    for (const l of allLeads as any[]) {
      const t = l.created_at ? new Date(l.created_at).getTime() : NaN;
      if (Number.isFinite(t) && (!earliestActivity || t < earliestActivity.getTime())) earliestActivity = new Date(t);
    }
    for (const c of contracts as any[]) {
      const iso = contractDateToIso(c.date);
      const t = iso ? new Date(iso + "T12:00:00").getTime() : NaN;
      if (Number.isFinite(t) && (!earliestActivity || t < earliestActivity.getTime())) earliestActivity = new Date(t);
    }
    const earliestMonth = earliestActivity ? new Date(earliestActivity.getFullYear(), earliestActivity.getMonth(), 1) : null;
    let rangeStartDate = dateFrom
      ? toDateOnly(new Date(dateFrom + "T12:00:00"))
      : (earliestMonth && earliestMonth.getTime() > sixMonthsBack.getTime() ? earliestMonth : sixMonthsBack);
    // Piso de 3 meses de calendário — pra um tenant jovem (toda a atividade num único mês, ou
    // até num único dia) não virar uma linha de 1-2 pontos só; os meses extras aparecem
    // corretamente zerados (não tinha atividade mesmo), só dão mais contexto visual à tendência.
    const threeMonthsBack = new Date(rangeEndDate.getFullYear(), rangeEndDate.getMonth() - 2, 1);
    if (!dateFrom && rangeStartDate.getTime() > threeMonthsBack.getTime()) rangeStartDate = threeMonthsBack;
    const spanDays = Math.max(0, Math.round((rangeEndDate.getTime() - rangeStartDate.getTime()) / 86400000));

    // Período curto (<=31 dias): granularidade diária — um "Fluxo de
    // Performance" mensal não faz sentido pra "Hoje"/"7 dias"/"30 dias".
    if (spanDays <= 31) {
      const days = Array.from({ length: spanDays + 1 }, (_, i) => {
        const d = new Date(rangeStartDate.getFullYear(), rangeStartDate.getMonth(), rangeStartDate.getDate() + i);
        return d;
      });
      return days.map((d) => {
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const dayLeads = leads.filter(l => leadDateIso(l).slice(0, 10) === iso);
        const closedThisDay = dayLeads.filter(l => l.status === 'Fechado').length;
        const contractsThisDay = filteredContracts.filter(c => contractDateToIso(c.date) === iso && c.status !== 'Cancelado');
        const revenueThisDay = contractsThisDay.reduce((sum, c) => sum + parseCurrencyBR(c.mrr), 0);
        // Mesmo contrato-do-dia, mas somando o valor TOTAL (recorrente + avulso/
        // implantação, `totalValue` — cai pro mrr quando ausente) em vez de só o
        // `mrr` — flow real de faturamento contratado, não só de recorrência.
        // Ver revenueMetrics.getFaturamentoContratado pro mesmo critério aplicado
        // ao saldo atual (snapshot) em vez de por-bucket (flow).
        const faturamentoThisDay = contractsThisDay.reduce((sum, c: any) => {
          const mrrValue = parseCurrencyBR(c.mrr);
          const total = c.totalValue;
          return sum + Math.max(total !== undefined && total !== null ? Number(total) : mrrValue, mrrValue);
        }, 0);
        return {
          name: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
          vendas: Math.round(revenueThisDay),
          faturamento: Math.round(faturamentoThisDay),
          leads: dayLeads.length,
          retention: closedThisDay,
        };
      });
    }

    // Período longo (ou "Tudo"): granularidade mensal, do mês de início ao
    // mês de fim — cap de 24 meses pra não gerar um gráfico ilegível/pesado
    // num tenant com muitos anos de histórico e "Tudo" selecionado.
    const months: { year: number; month: number; name: string }[] = [];
    let cursor = new Date(rangeStartDate.getFullYear(), rangeStartDate.getMonth(), 1);
    const endCursor = new Date(rangeEndDate.getFullYear(), rangeEndDate.getMonth(), 1);
    while (cursor <= endCursor && months.length < 24) {
      months.push({ year: cursor.getFullYear(), month: cursor.getMonth(), name: MONTH_NAMES[cursor.getMonth()] });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    return months.map(({ year, month, name }) => {
      const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
      const monthLeads = leads.filter(l => leadDateIso(l).slice(0, 7) === monthKey);
      const closedThisMonth = monthLeads.filter(l => l.status === 'Fechado').length;
      const contractsThisMonth = filteredContracts
        .filter(c => c.status !== 'Cancelado' && contractDateToIso(c.date)?.slice(0, 7) === monthKey);
      const mrrThisMonth = contractsThisMonth.reduce((sum, c) => sum + parseCurrencyBR(c.mrr), 0);
      // Mesmo critério do branch diário acima (ver comentário lá).
      const faturamentoThisMonth = contractsThisMonth.reduce((sum, c: any) => {
        const mrrValue = parseCurrencyBR(c.mrr);
        const total = c.totalValue;
        return sum + Math.max(total !== undefined && total !== null ? Number(total) : mrrValue, mrrValue);
      }, 0);

      return {
        name,
        vendas: Math.round(mrrThisMonth),
        faturamento: Math.round(faturamentoThisMonth),
        leads: monthLeads.length,
        retention: closedThisMonth,
      };
    });
  }, [leads, allLeads, contracts, filteredContracts, dateFrom, dateTo]);

  // Sales ranking: group closed leads by seller
  // Mesma fonte de valor usada no Kanban/"Total de Ganhos" do Pipeline (ver
  // PipelineKanbanBoard.tsx getLeadValue, corrigido em 14b886b) — sem isso o
  // pódio e o Pipeline mostravam totais DIFERENTES pro mesmo conjunto de
  // leads fechados.
  //
  // BUG real (achado em produção 2026-09-27): esta função ainda tinha o
  // fallback antigo pro preço de CATÁLOGO dos produtos vinculados quando
  // l.value = 0 — igual ao bug já corrigido no Kanban, só que essa cópia
  // ficou pra trás. Um lead fechado por R$0 (ex.: cortesia) com um produto
  // vinculado de R$997 fazia o vendedor dele somar +R$997 fantasma no pódio,
  // sem esse mesmo valor aparecer em lugar nenhum do Pipeline — dois números
  // diferentes pro "mesmo" total fechado. `l.value` já é a fonte de verdade
  // (sincronizada com a proposta aceita); só cai pra proposta vinculada
  // quando o lead genuinamente não tem valor nenhum gravado ainda.
  const salesRanking = useMemo(() => {
    const getLeadValue = (l: any) => {
      const parsed = parseCurrencyBR(l.value ?? l.valor);
      if (parsed > 0) return parsed;
      const linkedProposal = (proposals as any[] || [])
        .filter((p: any) => p.lead_id === l.id)
        .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
      return linkedProposal?.valor ? Number(linkedProposal.valor) || 0 : 0;
    };

    const bySellerMap: Record<string, { name: string; deals: number; total: number }> = {};
    leads.filter(l => l.status === 'Fechado').forEach(l => {
      const seller = l.seller || 'Sem atribuição';
      if (!bySellerMap[seller]) bySellerMap[seller] = { name: seller, deals: 0, total: 0 };
      bySellerMap[seller].deals += 1;
      bySellerMap[seller].total += getLeadValue(l);
    });

    const sorted = Object.values(bySellerMap).sort((a, b) => b.total - a.total);

    // Achado real: cortava em 3 aqui na origem — o card do Ranking (pódio +
    // lista dos demais colocados) nunca tinha como mostrar um 4º/5º vendedor
    // real mesmo quando existiam, mesmo cálculo/critério de sempre, só sem
    // truncar tão cedo (SalesRankingPodium.tsx decide o que fazer com o
    // resto: pódio pros 3 primeiros, lista simples do 4º em diante).
    return sorted.slice(0, 8).map(s => ({
      name: s.name,
      total: s.total,
      deals: s.deals,
      rate: Math.round((s.deals / Math.max(leads.filter(l => l.seller === s.name).length, 1)) * 100),
    }));
  }, [leads, proposals]);

  // Funnel data: count leads by real pipeline stage (stageId), não por um
  // vocabulário fixo de `status`. O Kanban (PipelineKanbanBoard.handleDrop)
  // só grava status "Em Aberto"/"Fechado"/"Perdido" — nunca "Qualificado",
  // "Proposta Enviada" etc. — então o funil ficava quase todo zerado exceto
  // na primeira/última etapa. Usa o funil comercial ativo (por tenant) pra
  // bater com as mesmas etapas/nomes mostrados no Pipeline.
  //
  // 2 BUGS reais achados em produção (2026-09-27, funil da Pluppex — "FUNIL
  // COMERCIAL" com 10 etapas custom terminando em Ganho/Perdido):
  // 1) "última etapa = etapa de ganho" era uma suposição errada — pra esse
  //    funil a ÚLTIMA etapa é "Perdido", não "Ganho" (posição 8, não 9). Os
  //    5 leads Fechados (corretamente já contados em "Ganho" pelo stageId
  //    real) eram contados DE NOVO na etapa errada ("Perdido"), inflando e
  //    mislabeling vendas fechadas como perdidas no gráfico. Agora acha a
  //    etapa de ganho pelo NOME (contém "ganh"/"fech"/"venda"), não pela
  //    posição; sem nome identificável, cai na última etapa como antes.
  // 2) Leads com stageId de um funil ANTIGO/reconfigurado (ex.: "1", "2" —
  //    convenção antiga de funil-comercial-default) não batem com NENHUMA
  //    etapa do funil custom atual e ficavam de fora do gráfico inteiro (39
  //    leads da Pluppex sumiam assim) — mesmo "stageId órfão" que o Kanban já
  //    trata (PipelineKanbanBoard.tsx `unmatchedLeads`), aqui caem na 1ª
  //    etapa, mesma convenção.
  const funnelData = useMemo(() => {
    const funisConfig: any[] = funis && funis.length > 0 ? funis : FUNIS_DEFAULT;
    const comercialFunil =
      funisConfig.find((f: any) => f.tipo === 'comercial' && f.ativo !== false) ??
      funisConfig.find((f: any) => f.tipo === 'comercial') ??
      FUNIS_DEFAULT[0];

    const stageNames: string[] = comercialFunil.etapasConfig?.map((s: any) => s.nome) ?? comercialFunil.etapas ?? [];
    const stageIds = stageNames.map((_: string, idx: number) => getStageId(comercialFunil.id, idx));

    const normalize = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const namedWonIdx = stageNames.findIndex((n) => /ganh|fech|venda|won/.test(normalize(n)));
    const wonIdx = namedWonIdx !== -1 ? namedWonIdx : stageNames.length - 1;
    // Achado real: Ganho/Perdido são dois desfechos PARALELOS (o lead vai pra
    // um ou pro outro, nunca "flui" de um pro outro), não mais um passo na
    // progressão normal do funil — coloridos como parte do gradiente de
    // posição, "Perdido" saía num tom de azul (a mesma família de cor de
    // "avançou bastante no funil"), o oposto do que essa etapa representa.
    const lostIdx = stageNames.findIndex((n) => /perdid|lost/.test(normalize(n)));

    const comercialLeads = leads.filter(l => !l.pipelineId || l.pipelineId === 'comercial');
    const total = comercialLeads.length || 1;

    // Cada lead cai em EXATAMENTE uma etapa: Fechado sempre vira a etapa de
    // ganho (mesmo que o card não tenha sido arrastado até lá); senão, a
    // etapa do stageId real dele; sem bater com nenhuma (stageId órfão), cai
    // na 1ª etapa — nunca fica de fora da contagem.
    const counts = new Array(stageNames.length).fill(0);
    for (const l of comercialLeads) {
      const idx = l.status === 'Fechado' ? wonIdx : stageIds.indexOf(l.stageId);
      counts[idx === -1 ? 0 : idx]++;
    }

    let prevCount = total;
    let progressIdx = 0;
    return stageNames.map((name, i) => {
      const count = counts[i];
      // `null` (não 0) quando não há base real pra comparar (1ª etapa, ou
      // etapa anterior zerada) — 0 vira um valor real e distinto ("ficou
      // igual"), não mais indistinguível de "sem base pra calcular".
      const drop = i > 0 && prevCount > 0 ? Math.round((1 - count / prevCount) * 100) : null;
      let color: string;
      if (i === wonIdx) color = 'bg-emerald-500';
      else if (i === lostIdx) color = 'bg-rose-500';
      else { color = FUNNEL_STAGE_COLORS[progressIdx % FUNNEL_STAGE_COLORS.length]; progressIdx++; }
      const step = { label: name, value: count, drop, color };
      prevCount = count;
      return step;
    });
  }, [leads, funis]);

  // Behavioral activities: last 4 lead activities
  const recentActivities = useMemo(() => {
    return [...leadActivities]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 4);
  }, [leadActivities]);

  // churnRateClient já calculado mais acima (mesma fórmula de antes, sem
  // mudança de comportamento) — só decide aqui se usa o valor do cache do
  // servidor ou o client-side, igual às outras 3 métricas "hero".
  const churnRate = serverSummary?.churnRate ?? churnRateClient;
  // `getChurnRate([])` devolve 0 pra não quebrar o cálculo — mas 0 contratos
  // não é "0% de churn", é "não dá pra medir". Sem essa distinção, um tenant
  // que nunca cadastrou contrato nenhum mostrava "Taxa Churn: 0,0%" como se
  // fosse uma métrica boa, quando na real não existe métrica nenhuma ali.
  const hasContractsData = (isClinicaNiche ? (appointments?.length ?? 0) > 0 : contracts.length > 0);

  return {
    leads,
    // Sem filtro de período de propósito — StrategicalView usa isso no
    // Snapshot de Contratos (MRR Ativo/Contratos Ativos/Ticket Médio/
    // Inadimplência), que são saldos do momento atual ("ativo" = agora),
    // não um fluxo do período selecionado (ver comentário em
    // filteredContracts acima).
    contracts,
    hasContractsData,
    squads,
    leadActivities,
    activeLeadsCount,
    serverSummary,
    isModuleEnabled,
    user,
    activeTab,
    setActiveTab,
    comparisonPeriod,
    setComparisonPeriod,
    goalAlerts,
    totalRevenue,
    faturamentoContratado,
    conversionRate,
    performanceData,
    salesRanking,
    funnelData,
    recentActivities,
    churnRate,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
  };
}
