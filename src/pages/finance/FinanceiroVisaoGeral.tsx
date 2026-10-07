import { useMemo, useState, useEffect } from "react";
import { Button } from "../../components/ui/button";
import { Printer, Download, ChevronLeft, ChevronRight, Calendar, Users, Inbox, Wallet, Scale, Repeat2, TrendingUp, TrendingDown, AlertTriangle, Landmark } from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { PageContainer } from "../../components/PageContainer";
import { FinanceiroKPIs, type FinanceiroKpiCard } from "./components/FinanceiroVisaoGeral/FinanceiroKPIs";
import { FinanceiroFluxoComposicao } from "./components/FinanceiroVisaoGeral/FinanceiroFluxoComposicao";
import { FinanceiroResumoRow, type ResumoLinha, type ProximoItem, type AtencaoItem } from "./components/FinanceiroVisaoGeral/FinanceiroResumoRow";
import { FinanceiroBottomPanels } from "./components/FinanceiroVisaoGeral/FinanceiroBottomPanels";
import { FinanceiroProjecaoReceita } from "./components/FinanceiroVisaoGeral/FinanceiroProjecaoReceita";
import { FinanceiroPrevistoRealizado } from "./components/FinanceiroVisaoGeral/FinanceiroPrevistoRealizado";
import { FinanceiroComparativoMes } from "./components/FinanceiroVisaoGeral/FinanceiroComparativoMes";
import { FinanceiroDespesasPorCategoria } from "./components/FinanceiroVisaoGeral/FinanceiroDespesasPorCategoria";
import { FinanceiroAgendaMes } from "./components/FinanceiroVisaoGeral/FinanceiroAgendaMes";
import { FinanceiroAnexosResumo } from "./components/FinanceiroVisaoGeral/FinanceiroAnexosResumo";
import { downloadCsv } from "../../lib/csvExport";
import { useLocalization } from "../../contexts/LocalizationContext";
import { getMRR, getActiveCustomers, getChurnRate, getRevenueProjection } from "../../lib/revenueMetrics";
import { isContractAtivo } from "../../components/ui/drillColumns";
import { parseEntryDate } from "./lib/financeDates";
import { saldoDaConta, transferenciasDaConta, previstoRealizado, comparativoMesAnterior, categoriesById, type FinanceEntryLike, type FinanceCategoryLike } from "./lib/financeEngine";
import { apiFetch } from "../../lib/apiClient";
import { useAuth } from "../../contexts/AuthContext";

interface VisaoGeralServerSummary {
  kpis: {
    receitaMes: number; receitaMesAnt: number; despesaMes: number; despesaMesAnt: number;
    resultadoMes: number; resultadoMesAnt: number; mrrAtual: number;
    abertoReceber: { value: number; count: number };
    abertoPagar: { value: number; count: number };
    vencidoReceber: { value: number; count: number };
    previstoReceber30: number; previstoPagar30: number; fluxoProjetado30: number;
  };
  alertas: {
    hoje: { entradas: number; saidas: number };
    proximos7: { aReceber: number; aPagar: number };
    vencidasPagar: { value: number; count: number };
    vencidasReceber: { value: number; count: number };
    vencendoEm3: { value: number; count: number };
  };
}

const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MONTH_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function parseDateBR(br?: string | null): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br || "");
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}
const mrrNum = (v: any) => Number(String(v).replace(/[^\d,.-]/g, "").replace(",", ".")) || 0;

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isInMonth(date: Date | null, year: number, month: number): boolean {
  return !!date && date.getFullYear() === year && date.getMonth() === month;
}

/** `null` = sem base de comparação (mês anterior zerado) — nunca "Infinity%". */
function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export default function FinanceiroVisaoGeral() {
  const { financeEntries: allEntries, contracts: allContracts, leads, financeBankAccounts, financeTransfers, financeCategories, financeAttachments } = useData();
  const { formatCurrency } = useLocalization();
  const { activeTenantId } = useAuth();

  // Mês de referência do painel (padrão: o atual) e filtro por cliente.
  const [refMonth, setRefMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [clienteFiltro, setClienteFiltro] = useState("");

  const hoje = new Date();
  const isMesAtual = refMonth.getFullYear() === hoje.getFullYear() && refMonth.getMonth() === hoje.getMonth();
  const refY = refMonth.getFullYear(), refM = refMonth.getMonth();
  const mesLabel = `${MONTH_FULL[refM]} ${refY}`;

  // Cards do topo (exceto "Saldo em Contas") + resumo de alertas vêm de um
  // cache no Redis-SPY quando disponível — mesmo padrão de
  // src/pages/dashboard/useDashboard.ts. O cache só descreve o mês atual sem
  // filtro de cliente; fora disso o cálculo client-side abaixo é a fonte.
  const [serverSummary, setServerSummary] = useState<VisaoGeralServerSummary | null>(null);
  useEffect(() => {
    setServerSummary(null);
    if (!activeTenantId) return;
    let cancelled = false;
    apiFetch(`/api/finance/visao-geral-summary?tenantId=${encodeURIComponent(activeTenantId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setServerSummary(data); })
      .catch(() => { /* silencioso — cálculo client-side abaixo já cobre */ });
    return () => { cancelled = true; };
  }, [activeTenantId]);
  const usaServidor = isMesAtual && !clienteFiltro;

  // Clientes que aparecem como contraparte de recebimentos.
  const clienteOptions = useMemo(() => {
    const set = new Set<string>();
    for (const f of allEntries as any[]) if (f.type === "Receber" && f.counterparty) set.add(String(f.counterparty));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [allEntries]);

  const financeEntries = useMemo(
    () => (clienteFiltro ? (allEntries as any[]).filter((f) => f.counterparty === clienteFiltro) : allEntries) as typeof allEntries,
    [allEntries, clienteFiltro]
  );
  const contracts = useMemo(
    () => (clienteFiltro ? (allContracts as any[]).filter((c) => c.client === clienteFiltro) : allContracts) as typeof allContracts,
    [allContracts, clienteFiltro]
  );

  // Lançamentos do mês selecionado.
  const cicloEntries = useMemo(
    () => financeEntries.filter(f => isInMonth(parseEntryDate(f.date), refY, refM)),
    [financeEntries, refY, refM]
  );

  const { receita, despesa, mrr, receitaAvulsa, clientesAtivos, churnRate, mrrRows, receitaAvulsaRows, clientesAtivosRows } = useMemo(() => {
    const receita = cicloEntries.filter(f => f.type === "Receber" && f.status === "Pago").reduce((s, f) => s + f.value, 0);
    const despesa = cicloEntries.filter(f => f.type === "Pagar"   && f.status === "Pago").reduce((s, f) => s + f.value, 0);
    const mrr = getMRR(contracts);
    const mrrRows = (contracts as any[]).filter(isContractAtivo);
    // Implantação/Setup é lançado à parte pela reconciliação de propostas
    // (DataContext.tsx syncAcceptedProposal) exatamente pra não entrar no MRR —
    // aqui ela aparece como receita avulsa do período, separada.
    const receitaAvulsaRows = cicloEntries.filter(f => f.type === "Receber" && f.status === "Pago" && f.category === "Implantação / Setup");
    const receitaAvulsa = receitaAvulsaRows.reduce((s, f) => s + f.value, 0);
    const clientesAtivos = getActiveCustomers(contracts);
    const seenClients = new Set<string>();
    const clientesAtivosRows = mrrRows.filter((c: any) => {
      if (!c.client || seenClients.has(c.client)) return false;
      seenClients.add(c.client);
      return true;
    });
    const churnRate = getChurnRate(contracts);
    return { receita, despesa, mrr, receitaAvulsa, clientesAtivos, churnRate, mrrRows, receitaAvulsaRows, clientesAtivosRows };
  }, [cicloEntries, contracts]);

  const revenueProjection = useMemo(() => getRevenueProjection(contracts), [contracts]);

  // Liquidez = quanto da despesa paga no mês a receita paga cobre (100% =
  // cobertura total). Burn Rate = queima de caixa do mês (só existe quando a
  // despesa supera a receita — senão não há "queima", há sobra).
  const liquidez = despesa > 0 ? (receita / despesa) * 100 : (receita > 0 ? 100 : null);
  const burnRate = despesa > receita ? despesa - receita : 0;

  // Saldo real de caixa (financeEngine.ts) numa data de corte — mesma regra do
  // saldo atual, só que olhando lançamentos/transferências até aquela data.
  const saldoTotalAte = (corte: Date | null) => {
    const contasAtivas = (financeBankAccounts as any[]).filter(c => !c.arquivada);
    return contasAtivas.reduce((soma, conta) => {
      const entriesDaConta = (allEntries as FinanceEntryLike[]).filter((e: any) => {
        if (e.conta_bancaria_id !== conta.id) return false;
        if (!corte) return true;
        const d = parseEntryDate(e.date);
        return !!d && d <= corte;
      });
      const transf = (financeTransfers as any[]).filter(t => !corte || (t.data_pagamento && new Date(t.data_pagamento + "T12:00:00") <= corte));
      const { recebidas, enviadas } = transferenciasDaConta(transf, conta.id);
      return soma + saldoDaConta({ saldoInicial: conta.saldo_inicial, sinalSaldoInicial: conta.sinal_saldo_inicial, entriesDaConta, transferenciasRecebidasPagas: recebidas, transferenciasEnviadasPagas: enviadas });
    }, 0);
  };

  const mrrAte = (corte: Date) =>
    (allContracts as any[])
      .filter((c) => (!clienteFiltro || c.client === clienteFiltro))
      .filter((c) => {
        const signed = parseDateBR(c.date);
        if (!signed || signed > corte) return false;
        if (c.status === "Cancelado" && c.cancelledAt) {
          const canc = new Date(c.cancelledAt);
          if (!isNaN(canc.getTime()) && canc <= corte) return false;
        }
        return true;
      })
      .reduce((s, c) => s + mrrNum(c.mrr), 0);

  const mesesSerie = useMemo(
    () => Array.from({ length: 6 }, (_, i) => {
      const d = new Date(refY, refM - (5 - i), 1);
      return { y: d.getFullYear(), m: d.getMonth(), fim: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59) };
    }),
    [refY, refM]
  );

  const somaMes = (tipo: "Receber" | "Pagar", y: number, m: number) =>
    financeEntries.filter(f => f.type === tipo && f.status === "Pago" && isInMonth(parseEntryDate(f.date), y, m)).reduce((s, f) => s + f.value, 0);

  // Valores-base do mês de referência.
  const base = useMemo(() => {
    const prevDate = new Date(refY, refM - 1, 1);
    const prevY = prevDate.getFullYear(), prevM = prevDate.getMonth();
    const k = usaServidor ? serverSummary?.kpis : undefined;

    const receitaMes = k?.receitaMes ?? somaMes("Receber", refY, refM);
    const receitaMesAnt = k?.receitaMesAnt ?? somaMes("Receber", prevY, prevM);
    const despesaMes = k?.despesaMes ?? somaMes("Pagar", refY, refM);
    const despesaMesAnt = k?.despesaMesAnt ?? somaMes("Pagar", prevY, prevM);
    const resultadoMes = k ? k.resultadoMes : receitaMes - despesaMes;
    const resultadoMesAnt = k ? k.resultadoMesAnt : receitaMesAnt - despesaMesAnt;

    const abertoReceberClient = financeEntries.filter(f => f.type === "Receber" && (f.status === "A Vencer" || f.status === "Atrasado"));
    const abertoPagarClient = financeEntries.filter(f => f.type === "Pagar" && (f.status === "A Vencer" || f.status === "Atrasado"));
    const vencidoReceberClient = financeEntries.filter(f => f.type === "Receber" && f.status === "Atrasado");
    const abertoReceber = k?.abertoReceber ?? { value: abertoReceberClient.reduce((s, f) => s + f.value, 0), count: abertoReceberClient.length };
    const abertoPagar = k?.abertoPagar ?? { value: abertoPagarClient.reduce((s, f) => s + f.value, 0), count: abertoPagarClient.length };
    const vencidoReceber = k?.vencidoReceber ?? { value: vencidoReceberClient.reduce((s, f) => s + f.value, 0), count: vencidoReceberClient.length };

    const now = new Date();
    const next30 = new Date(now); next30.setDate(next30.getDate() + 30);
    const previstoReceber30 = k?.previstoReceber30 ?? financeEntries.filter(f => {
      const d = parseEntryDate(f.date);
      return f.type === "Receber" && f.status === "A Vencer" && d && d >= now && d <= next30;
    }).reduce((s, f) => s + f.value, 0);
    const previstoPagar30 = k?.previstoPagar30 ?? financeEntries.filter(f => {
      const d = parseEntryDate(f.date);
      return f.type === "Pagar" && f.status === "A Vencer" && d && d >= now && d <= next30;
    }).reduce((s, f) => s + f.value, 0);
    const fluxoProjetado30 = k ? k.fluxoProjetado30 : previstoReceber30 - previstoPagar30;

    const mrrAtual = k?.mrrAtual ?? getMRR(contracts);
    return { receitaMes, receitaMesAnt, despesaMes, despesaMesAnt, resultadoMes, resultadoMesAnt, abertoReceber, abertoPagar, vencidoReceber, fluxoProjetado30, mrrAtual };
  }, [financeEntries, contracts, serverSummary, usaServidor, refY, refM]);

  // Saldo em contas: não depende do filtro de cliente (é da conta bancária).
  const saldo = useMemo(() => {
    const contasAtivas = (financeBankAccounts as any[]).filter(c => !c.arquivada);
    const corteAtual = isMesAtual ? null : mesesSerie[5].fim;
    const atual = saldoTotalAte(corteAtual);
    const serie = mesesSerie.map((mm, i) => (i === 5 ? atual : saldoTotalAte(mm.fim)));
    return { atual, serie, anterior: serie[4], contas: contasAtivas.length };
  }, [allEntries, financeBankAccounts, financeTransfers, mesesSerie, isMesAtual]);

  const mrrHist = useMemo(() => {
    const serie = mesesSerie.map((mm) => mrrAte(mm.fim));
    return { serie, delta: pctChange(serie[5], serie[4]) };
  }, [allContracts, mesesSerie, clienteFiltro]);

  const serieReceita = useMemo(() => mesesSerie.map((mm) => somaMes("Receber", mm.y, mm.m)), [financeEntries, mesesSerie]);
  const serieDespesa = useMemo(() => mesesSerie.map((mm) => somaMes("Pagar", mm.y, mm.m)), [financeEntries, mesesSerie]);
  const serieResultado = useMemo(() => serieReceita.map((r, i) => r - serieDespesa[i]), [serieReceita, serieDespesa]);

  const kpiCards: FinanceiroKpiCard[] = useMemo(() => [
    { label: "Saldo em contas", value: saldo.atual, format: "currency", count: saldo.contas || undefined, deltaPct: pctChange(saldo.atual, saldo.anterior), deltaGoodWhenUp: true, danger: saldo.atual < 0, icon: Landmark, href: "/app/financeiro/bancos", tone: "green", series: saldo.serie, chart: "line" },
    { label: "Receitas do mês", value: base.receitaMes, format: "currency", deltaPct: pctChange(base.receitaMes, base.receitaMesAnt), deltaGoodWhenUp: true, icon: Inbox, href: "/app/financeiro/receitas", tone: "blue", series: serieReceita, chart: "bars" },
    { label: "Despesas do mês", value: base.despesaMes, format: "currency", deltaPct: pctChange(base.despesaMes, base.despesaMesAnt), deltaGoodWhenUp: false, icon: TrendingDown, href: "/app/financeiro/despesas", tone: "rose", series: serieDespesa, chart: "bars" },
    { label: "Resultado do mês", value: base.resultadoMes, format: "currency", deltaPct: pctChange(base.resultadoMes, base.resultadoMesAnt), deltaGoodWhenUp: true, danger: base.resultadoMes < 0, icon: Scale, href: "/app/financeiro/transacoes", tone: "violet", series: serieResultado, chart: "line" },
    { label: "MRR ativo", value: base.mrrAtual, format: "currency", deltaPct: mrrHist.delta, deltaGoodWhenUp: true, icon: Repeat2, href: "/app/financeiro/mrr", tone: "amber", series: mrrHist.serie, chart: "bars" },
    { label: "Contas a receber", value: base.abertoReceber.value, format: "currency", count: base.abertoReceber.count, deltaPct: null, deltaGoodWhenUp: null, icon: TrendingUp, href: "/app/financeiro/receitas?status=A%20Vencer", tone: "sky", note: "Posição atual em aberto" },
    { label: "Contas a pagar", value: base.abertoPagar.value, format: "currency", count: base.abertoPagar.count, deltaPct: null, deltaGoodWhenUp: null, icon: Wallet, href: "/app/financeiro/despesas?status=A%20Vencer", tone: "rose", note: "Posição atual em aberto" },
    { label: "Vencido (inadimplência)", value: base.vencidoReceber.value, format: "currency", count: base.vencidoReceber.count, deltaPct: null, deltaGoodWhenUp: null, danger: base.vencidoReceber.count > 0, icon: AlertTriangle, href: "/app/financeiro/inadimplencia", tone: "red", note: "Posição atual em atraso" },
  ], [saldo, base, serieReceita, serieDespesa, serieResultado, mrrHist]);

  // Previsto × Realizado e Comparativo com mês anterior vêm direto do motor
  // de cálculo central — nunca recalculados aqui, pra não divergir do que a
  // tela de DRE/Projeção mostra pro mesmo período.
  const catMap = useMemo(() => categoriesById(financeCategories as FinanceCategoryLike[]), [financeCategories]);
  const previstoRealizadoRecebimentos = useMemo(() => previstoRealizado(financeEntries as FinanceEntryLike[], "Receber", refMonth), [financeEntries, refMonth]);
  const previstoRealizadoDespesas = useMemo(() => previstoRealizado(financeEntries as FinanceEntryLike[], "Pagar", refMonth), [financeEntries, refMonth]);
  const comparativoLinhas = useMemo(() => comparativoMesAnterior(financeEntries as FinanceEntryLike[], catMap, refMonth), [financeEntries, catMap, refMonth]);

  // Próximos 7 dias, Atenção e Resumo do mês.
  const { proximos, atencao } = useMemo(() => {
    const now = new Date();
    const hoje0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const next7 = new Date(hoje0); next7.setDate(next7.getDate() + 8);
    const fmtDia = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const a = usaServidor ? serverSummary?.alertas : undefined;

    const aVencer7 = financeEntries
      .map((f) => ({ f, d: parseEntryDate(f.date) }))
      .filter((x) => x.f.status === "A Vencer" && x.d && x.d >= hoje0 && x.d < next7)
      .sort((x, y) => x.d!.getTime() - y.d!.getTime());
    const atrasados = financeEntries
      .map((f) => ({ f, d: parseEntryDate(f.date) }))
      .filter((x) => x.f.status === "Atrasado" && x.d)
      .sort((x, y) => y.d!.getTime() - x.d!.getTime());
    const proximosItens: ProximoItem[] = [
      ...aVencer7.slice(0, 5).map((x) => ({ id: x.f.id, label: x.f.description, value: x.f.value, dateLabel: fmtDia(x.d!), type: (x.f.type === "Receber" ? "receber" : "pagar") as "receber" | "pagar" })),
      ...atrasados.slice(0, Math.max(0, 6 - Math.min(5, aVencer7.length))).map((x) => ({ id: x.f.id, label: `Em atraso — ${x.f.description}`, value: x.f.value, dateLabel: fmtDia(x.d!), type: (x.f.type === "Receber" ? "receber" : "pagar") as "receber" | "pagar", overdue: true })),
    ];

    const vencidasReceber = a?.vencidasReceber ?? (() => { const l = financeEntries.filter(f => f.type === "Receber" && f.status === "Atrasado"); return { value: l.reduce((s, f) => s + f.value, 0), count: l.length }; })();
    const vencidasPagar = a?.vencidasPagar ?? (() => { const l = financeEntries.filter(f => f.type === "Pagar" && f.status === "Atrasado"); return { value: l.reduce((s, f) => s + f.value, 0), count: l.length }; })();
    const aReceber7 = a?.proximos7.aReceber ?? aVencer7.filter((x) => x.f.type === "Receber").reduce((s, x) => s + x.f.value, 0);
    const vencendoEm3 = a?.vencendoEm3 ?? (() => {
      const in3 = new Date(hoje0); in3.setDate(in3.getDate() + 4);
      const l = aVencer7.filter((x) => x.d! < in3);
      return { value: l.reduce((s, x) => s + x.f.value, 0), count: l.length };
    })();

    const itens: AtencaoItem[] = [];
    const totalVencidas = vencidasReceber.count + vencidasPagar.count;
    if (totalVencidas > 0) {
      itens.push({ tone: "danger", badge: totalVencidas, title: "Contas vencidas", detail: `Total de ${formatCurrency(vencidasReceber.value + vencidasPagar.value)} em atraso`, href: "/app/financeiro/inadimplencia" });
    }
    if (aReceber7 > 0) {
      itens.push({ tone: "warning", title: "Recebimentos previstos (7 dias)", detail: `Total de ${formatCurrency(aReceber7)}`, href: "/app/financeiro/receitas?status=A%20Vencer" });
    }
    if (vencendoEm3.count > 0) {
      itens.push({ tone: "warning", title: "Vencendo nos próximos 3 dias", detail: `${vencendoEm3.count} lançamento(s) · ${formatCurrency(vencendoEm3.value)}`, href: "/app/financeiro/transacoes" });
    }
    const recorrente = financeEntries
      .map((f) => ({ f, d: parseEntryDate(f.date) }))
      .filter((x) => x.f.type === "Pagar" && x.f.status === "A Vencer" && (x.f as any).is_recurring && x.d && x.d >= hoje0)
      .sort((x, y) => x.d!.getTime() - y.d!.getTime())[0];
    if (recorrente) {
      itens.push({ tone: "info", title: "Despesa recorrente", detail: `${recorrente.f.description} vence em ${fmtDia(recorrente.d!)} — ${formatCurrency(recorrente.f.value)}`, href: "/app/financeiro/despesas?status=A%20Vencer" });
    }
    if (itens.length === 0) {
      itens.push({ tone: "neutral", title: "Tudo em dia", detail: "Nenhuma pendência crítica no momento.", href: "/app/financeiro/transacoes" });
    }
    return { proximos: proximosItens, atencao: itens };
  }, [financeEntries, serverSummary, usaServidor, formatCurrency]);

  const resumoLinhas: ResumoLinha[] = [
    { label: "Entradas (receitas)", value: base.receitaMes, tone: "green", deltaPct: pctChange(base.receitaMes, base.receitaMesAnt) },
    { label: "Saídas (despesas)", value: base.despesaMes, tone: "rose", deltaPct: pctChange(base.despesaMes, base.despesaMesAnt) },
    { label: "Resultado", value: base.resultadoMes, tone: "violet", deltaPct: pctChange(base.resultadoMes, base.resultadoMesAnt), strong: true },
    { label: "Saldo em contas", value: saldo.atual, tone: "blue", deltaPct: pctChange(saldo.atual, saldo.anterior) },
    { label: "Fluxo projetado", hint: "(30 dias)", value: base.fluxoProjetado30, tone: "blue", deltaPct: null },
  ];

  // Despesas por categoria do MESMO mês selecionado (cicloEntries).
  const categoriaGastos = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of cicloEntries) {
      if (e.type !== "Pagar" || e.status !== "Pago") continue;
      const nome = e.category || "Sem categoria";
      map.set(nome, (map.get(nome) || 0) + e.value);
    }
    return Array.from(map.entries()).map(([nome, valor]) => ({ nome, valor }));
  }, [cicloEntries]);

  // Fluxo de caixa: 10 meses terminando no mês selecionado (realizado = pago).
  const fluxoData = useMemo(() => {
    return Array.from({ length: 10 }, (_, i) => {
      const d = new Date(refY, refM - (9 - i), 1);
      const rec = somaMes("Receber", d.getFullYear(), d.getMonth());
      const des = somaMes("Pagar", d.getFullYear(), d.getMonth());
      return { name: MONTH_NAMES[d.getMonth()], receita: rec, despesa: des, resultado: rec - des };
    });
  }, [financeEntries, refY, refM]);

  // Composição das receitas recebidas no mês, por categoria (top 4 + Outros).
  const composicao = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of cicloEntries) {
      if (e.type !== "Receber" || e.status !== "Pago") continue;
      const nome = e.category || "Sem categoria";
      map.set(nome, (map.get(nome) || 0) + e.value);
    }
    const ord = Array.from(map.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
    if (ord.length <= 5) return ord;
    const resto = ord.slice(4).reduce((s, c) => s + c.valor, 0);
    return [...ord.slice(0, 4), { nome: "Outros", valor: resto }];
  }, [cicloEntries]);

  const operationalInsights = useMemo(() => {
    const marketingSpend = financeEntries
      .filter(f => f.type === "Pagar" && f.status === "Pago" && (f.category?.toLowerCase().includes("marketing") || f.category?.toLowerCase().includes("anúncio")))
      .reduce((s, f) => s + f.value, 0);
    const cpl = leads.length > 0 ? marketingSpend / leads.length : null;
    const ltvProjetado = mrr > 0 ? mrr * 12 : null;
    const margemEbitda = receita > 0 ? ((receita - despesa) / receita) * 100 : null;
    return { cpl, ltvProjetado, margemEbitda };
  }, [financeEntries, leads, mrr, receita, despesa]);

  const upcomingEntries = useMemo(() =>
    financeEntries.filter(f => f.status === "A Vencer").slice(0, 4).map(f => ({
      label: f.description,
      date: f.date,
      value: formatCurrency(f.value),
      type: f.type.toLowerCase() as "pagar" | "receber",
    })),
  [financeEntries, formatCurrency]);

  const handleExport = () => {
    downloadCsv(
      `painel_financeiro_${refY}-${String(refM + 1).padStart(2, "0")}_${Date.now()}.csv`,
      ["Descrição", "Tipo", "Valor", "Status", "Data"],
      cicloEntries.map(f => [f.description, f.type, f.value, f.status, f.date])
    );
  };

  const irMes = (delta: number) => setRefMonth(new Date(refY, refM + delta, 1));
  const selCls = "h-9 px-3 rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40 cursor-pointer";

  return (
    <PageContainer
      title="Painel Financeiro"
      description="Saúde financeira, fluxo de caixa, MRR e inadimplência em um só lugar."
      actions={
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="flex items-center rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] h-9">
            <button type="button" onClick={() => irMes(-1)} className="px-2 h-full text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-transparent border-none cursor-pointer" title="Mês anterior"><ChevronLeft className="w-4 h-4" /></button>
            <button type="button" onClick={() => setRefMonth(new Date(hoje.getFullYear(), hoje.getMonth(), 1))} className="flex items-center gap-1.5 px-1.5 text-xs font-bold text-[var(--color-text-primary)] bg-transparent border-none cursor-pointer" title="Voltar ao mês atual">
              <Calendar className="w-3.5 h-3.5 text-[var(--color-text-muted)]" /> {MONTH_FULL[refM]} {refY}
            </button>
            <button type="button" onClick={() => irMes(1)} className="px-2 h-full text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-transparent border-none cursor-pointer" title="Próximo mês"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="relative">
            <Users className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none" />
            <select value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)} className={`${selCls} pl-8 max-w-[220px]`} title="Filtra receitas, despesas, contas a receber/pagar e MRR por cliente; o saldo em contas não é filtrado">
              <option value="">Todos os clientes</option>
              {clienteOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <Button variant="outline" onClick={() => window.print()} className="h-9 px-3 text-xs font-medium" title="Imprimir relatório">
            <Printer className="w-3.5 h-3.5" />
          </Button>
          <Button onClick={handleExport} className="h-9 px-4 text-xs font-medium gap-1.5">
            <Download className="w-3.5 h-3.5" /> Exportar
          </Button>
        </div>
      }
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <FinanceiroKPIs cards={kpiCards} />
        <FinanceiroFluxoComposicao fluxo={fluxoData} composicao={composicao} composicaoLabel={mesLabel} />
        <FinanceiroResumoRow mesLabel={mesLabel} resumo={resumoLinhas} proximos={proximos} atencao={atencao} liquidez={liquidez} burnRate={burnRate} />

        <h2 className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] pt-4">Análises detalhadas · {mesLabel}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FinanceiroPrevistoRealizado recebimentos={previstoRealizadoRecebimentos} despesas={previstoRealizadoDespesas} />
          <FinanceiroComparativoMes linhas={comparativoLinhas} />
        </div>
        <FinanceiroDespesasPorCategoria categorias={categoriaGastos} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <FinanceiroAgendaMes />
          </div>
          <FinanceiroAnexosResumo
            totalArquivos={(financeAttachments as any[]).length}
            totalBytes={(financeAttachments as any[]).reduce((s, a) => s + (a.tamanho_bytes || 0), 0)}
          />
        </div>
        <FinanceiroProjecaoReceita mrr={mrr} receitaAvulsa={receitaAvulsa} clientesAtivos={clientesAtivos} churnRate={churnRate} projection={revenueProjection} mrrRows={mrrRows} receitaAvulsaRows={receitaAvulsaRows} clientesAtivosRows={clientesAtivosRows} />
        <FinanceiroBottomPanels upcomingEntries={upcomingEntries} {...operationalInsights} />
      </div>
    </PageContainer>
  );
}
