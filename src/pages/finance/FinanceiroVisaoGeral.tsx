import { useMemo, useState, useEffect } from "react";
import { Button } from "../../components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../../components/ui/dropdown-menu";
import { Printer, Download, Calendar, Check, Inbox, Wallet, Scale, Repeat2, TrendingUp, TrendingDown, AlertTriangle, Waves, Landmark } from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { PageContainer } from "../../components/PageContainer";
import { FinanceiroKPIs, type FinanceiroKpiCard } from "./components/FinanceiroVisaoGeral/FinanceiroKPIs";
import { FinanceiroAlertas, type FinanceiroAlertaItem } from "./components/FinanceiroVisaoGeral/FinanceiroAlertas";
import { FinanceiroCashflowChart } from "./components/FinanceiroVisaoGeral/FinanceiroCashflowChart";
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

type Ciclo = "mes" | "trimestre" | "ano" | "tudo";
const CICLOS: { id: Ciclo; label: string }[] = [
  { id: "mes", label: "Mês Atual" },
  { id: "trimestre", label: "Trimestre Atual" },
  { id: "ano", label: "Ano Atual" },
  { id: "tudo", label: "Tudo" },
];

function isInCiclo(date: Date | null, ciclo: Ciclo, now: Date): boolean {
  if (ciclo === "tudo") return true;
  if (!date) return false;
  if (ciclo === "mes") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  if (ciclo === "trimestre") {
    const q = Math.floor(now.getMonth() / 3);
    const dq = Math.floor(date.getMonth() / 3);
    return date.getFullYear() === now.getFullYear() && dq === q;
  }
  return date.getFullYear() === now.getFullYear(); // ano
}

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
  const { financeEntries, contracts, leads, financeBankAccounts, financeTransfers, financeCategories, financeAttachments } = useData();
  const { formatCurrency } = useLocalization();
  const { activeTenantId } = useAuth();
  const [ciclo, setCiclo] = useState<Ciclo>("mes");

  // Cards do topo (exceto "Saldo em Contas", que depende do financeEngine.ts
  // e fica só client-side) + resumo de alertas vêm de um cache no Redis-SPY
  // quando disponível — mesmo padrão de src/pages/dashboard/useDashboard.ts.
  // Puramente aditivo: se a chamada falhar/não tiver voltado, os useMemo
  // abaixo (client-side, inalterados) continuam sendo a fonte.
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

  const cicloEntries = useMemo(() => {
    if (ciclo === "tudo") return financeEntries;
    const now = new Date();
    return financeEntries.filter(f => isInCiclo(parseEntryDate(f.date), ciclo, now));
  }, [financeEntries, ciclo]);

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

  // Liquidez = quanto da despesa paga no período a receita paga cobre (100% =
  // cobertura total). Burn Rate = queima de caixa do período (só existe
  // quando a despesa supera a receita — senão não há "queima", há sobra).
  const liquidez = despesa > 0 ? (receita / despesa) * 100 : (receita > 0 ? 100 : null);
  const burnRate = despesa > receita ? despesa - receita : 0;

  // Cartões do topo comparam sempre mês atual vs mês anterior, independente
  // do seletor de ciclo acima (que só afeta o restante do painel) — é o que
  // o card "Receitas · +12,4% vs. mês anterior" pede.
  const kpiCards: FinanceiroKpiCard[] = useMemo(() => {
    const now = new Date();
    const curY = now.getFullYear(), curM = now.getMonth();
    const prevDate = new Date(curY, curM - 1, 1);
    const prevY = prevDate.getFullYear(), prevM = prevDate.getMonth();

    const inCurMonth = (f: typeof financeEntries[number]) => isInMonth(parseEntryDate(f.date), curY, curM);
    const inPrevMonth = (f: typeof financeEntries[number]) => isInMonth(parseEntryDate(f.date), prevY, prevM);

    // Cada métrica abaixo usa o valor cacheado do servidor (GET
    // /api/finance/visao-geral-summary) quando disponível, senão cai pro
    // cálculo client-side de sempre — mesma fórmula, nunca modificada.
    const k = serverSummary?.kpis;

    const receitaMes = k?.receitaMes ?? financeEntries.filter(f => f.type === "Receber" && f.status === "Pago" && inCurMonth(f)).reduce((s, f) => s + f.value, 0);
    const receitaMesAnt = k?.receitaMesAnt ?? financeEntries.filter(f => f.type === "Receber" && f.status === "Pago" && inPrevMonth(f)).reduce((s, f) => s + f.value, 0);
    const despesaMes = k?.despesaMes ?? financeEntries.filter(f => f.type === "Pagar" && f.status === "Pago" && inCurMonth(f)).reduce((s, f) => s + f.value, 0);
    const despesaMesAnt = k?.despesaMesAnt ?? financeEntries.filter(f => f.type === "Pagar" && f.status === "Pago" && inPrevMonth(f)).reduce((s, f) => s + f.value, 0);
    const resultadoMes = k ? k.resultadoMes : receitaMes - despesaMes;
    const resultadoMesAnt = k ? k.resultadoMesAnt : receitaMesAnt - despesaMesAnt;

    const abertoReceberClient = financeEntries.filter(f => f.type === "Receber" && (f.status === "A Vencer" || f.status === "Atrasado"));
    const abertoPagarClient = financeEntries.filter(f => f.type === "Pagar" && (f.status === "A Vencer" || f.status === "Atrasado"));
    const vencidoReceberClient = financeEntries.filter(f => f.type === "Receber" && f.status === "Atrasado");
    const abertoReceber = k?.abertoReceber ?? { value: abertoReceberClient.reduce((s, f) => s + f.value, 0), count: abertoReceberClient.length };
    const abertoPagar = k?.abertoPagar ?? { value: abertoPagarClient.reduce((s, f) => s + f.value, 0), count: abertoPagarClient.length };
    const vencidoReceber = k?.vencidoReceber ?? { value: vencidoReceberClient.reduce((s, f) => s + f.value, 0), count: vencidoReceberClient.length };

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

    // MRR não tem snapshot histórico por mês salvo em banco — sem isso não dá
    // pra calcular a variação vs. mês anterior sem inventar número, então o
    // card de MRR fica sem delta (deltaPct: null) até essa série existir.
    const mrrAtual = k?.mrrAtual ?? getMRR(contracts);

    // Saldo real de caixa (financeEngine.ts) — sempre client-side, não faz
    // parte do resumo cacheado (ver server.ts pro motivo).
    const contasAtivas = (financeBankAccounts as any[]).filter(c => !c.arquivada);
    const saldoTotalContas = contasAtivas.reduce((soma, conta) => {
      const entriesDaConta = (financeEntries as FinanceEntryLike[]).filter((e: any) => e.conta_bancaria_id === conta.id);
      const { recebidas, enviadas } = transferenciasDaConta(financeTransfers as any[], conta.id);
      return soma + saldoDaConta({ saldoInicial: conta.saldo_inicial, sinalSaldoInicial: conta.sinal_saldo_inicial, entriesDaConta, transferenciasRecebidasPagas: recebidas, transferenciasEnviadasPagas: enviadas });
    }, 0);

    return [
      { label: "Saldo em Contas", value: saldoTotalContas, format: "currency", count: contasAtivas.length || undefined, deltaPct: null, deltaGoodWhenUp: null, danger: saldoTotalContas < 0, icon: Landmark, href: "/app/financeiro/bancos" },
      { label: "Receitas do Mês", value: receitaMes, format: "currency", deltaPct: pctChange(receitaMes, receitaMesAnt), deltaGoodWhenUp: true, icon: Inbox, href: "/app/financeiro/receitas" },
      { label: "Despesas do Mês", value: despesaMes, format: "currency", deltaPct: pctChange(despesaMes, despesaMesAnt), deltaGoodWhenUp: false, icon: TrendingDown, href: "/app/financeiro/despesas" },
      { label: "Resultado do Mês", value: resultadoMes, format: "currency", deltaPct: pctChange(resultadoMes, resultadoMesAnt), deltaGoodWhenUp: true, danger: resultadoMes < 0, icon: Scale, href: "/app/financeiro/transacoes" },
      { label: "MRR Ativo", value: mrrAtual, format: "currency", deltaPct: null, deltaGoodWhenUp: true, icon: Repeat2, href: "/app/financeiro/mrr" },
      { label: "Contas a Receber", value: abertoReceber.value, format: "currency", count: abertoReceber.count, deltaPct: null, deltaGoodWhenUp: null, icon: TrendingUp, href: "/app/financeiro/receber" },
      { label: "Contas a Pagar", value: abertoPagar.value, format: "currency", count: abertoPagar.count, deltaPct: null, deltaGoodWhenUp: null, icon: Wallet, href: "/app/financeiro/pagar" },
      { label: "Vencido (Inadimplência)", value: vencidoReceber.value, format: "currency", count: vencidoReceber.count, deltaPct: null, deltaGoodWhenUp: null, danger: vencidoReceber.count > 0, icon: AlertTriangle, href: "/app/financeiro/inadimplencia" },
      { label: "Fluxo Projetado (30d)", value: fluxoProjetado30, format: "currency", deltaPct: null, deltaGoodWhenUp: null, danger: fluxoProjetado30 < 0, icon: Waves, href: "/app/financeiro/projecao" },
    ];
  }, [financeEntries, contracts, financeBankAccounts, financeTransfers, serverSummary]);

  // Previsto × Realizado e Comparativo com mês anterior vêm direto do motor
  // de cálculo central — nunca recalculados aqui, pra não divergir do que a
  // tela de DRE/Projeção mostra pro mesmo período.
  const catMap = useMemo(() => categoriesById(financeCategories as FinanceCategoryLike[]), [financeCategories]);
  const previstoRealizadoRecebimentos = useMemo(() => previstoRealizado(financeEntries as FinanceEntryLike[], "Receber", new Date()), [financeEntries]);
  const previstoRealizadoDespesas = useMemo(() => previstoRealizado(financeEntries as FinanceEntryLike[], "Pagar", new Date()), [financeEntries]);
  const comparativoLinhas = useMemo(() => comparativoMesAnterior(financeEntries as FinanceEntryLike[], catMap, new Date()), [financeEntries, catMap]);

  const alertasResumo = useMemo(() => {
    const now = new Date();
    const a = serverSummary?.alertas;

    const hojeEntradas = a?.hoje.entradas ?? financeEntries.filter(f => {
      const d = parseEntryDate(f.date);
      return f.type === "Receber" && f.status === "Pago" && d && isSameDay(d, now);
    }).reduce((s, f) => s + f.value, 0);
    const hojeSaidas = a?.hoje.saidas ?? financeEntries.filter(f => {
      const d = parseEntryDate(f.date);
      return f.type === "Pagar" && f.status === "Pago" && d && isSameDay(d, now);
    }).reduce((s, f) => s + f.value, 0);

    const next7 = new Date(now); next7.setDate(next7.getDate() + 7);
    const aReceber7 = a?.proximos7.aReceber ?? financeEntries.filter(f => {
      const d = parseEntryDate(f.date);
      return f.type === "Receber" && f.status === "A Vencer" && d && d >= now && d <= next7;
    }).reduce((s, f) => s + f.value, 0);
    const aPagar7 = a?.proximos7.aPagar ?? financeEntries.filter(f => {
      const d = parseEntryDate(f.date);
      return f.type === "Pagar" && f.status === "A Vencer" && d && d >= now && d <= next7;
    }).reduce((s, f) => s + f.value, 0);

    const vencidasReceberClient = financeEntries.filter(f => f.type === "Receber" && f.status === "Atrasado");
    const vencidasPagarClient = financeEntries.filter(f => f.type === "Pagar" && f.status === "Atrasado");
    const vencendoEm3Client = financeEntries.filter(f => {
      const d = parseEntryDate(f.date);
      const in3 = new Date(now); in3.setDate(in3.getDate() + 3);
      return f.status === "A Vencer" && d && d >= now && d <= in3;
    });
    const vencidasReceber = a?.vencidasReceber ?? { value: vencidasReceberClient.reduce((s, f) => s + f.value, 0), count: vencidasReceberClient.length };
    const vencidasPagar = a?.vencidasPagar ?? { value: vencidasPagarClient.reduce((s, f) => s + f.value, 0), count: vencidasPagarClient.length };
    const vencendoEm3 = a?.vencendoEm3 ?? { value: vencendoEm3Client.reduce((s, f) => s + f.value, 0), count: vencendoEm3Client.length };

    const alertas: FinanceiroAlertaItem[] = [];
    if (vencidasPagar.count > 0) {
      alertas.push({ tone: "danger", href: "/app/financeiro/pagar", text: `${vencidasPagar.count} conta(s) a pagar vencida(s), somando ${formatCurrency(vencidasPagar.value)}.` });
    }
    if (vencidasReceber.count > 0) {
      alertas.push({ tone: "danger", href: "/app/financeiro/inadimplencia", text: `${vencidasReceber.count} cobrança(s) vencida(s), somando ${formatCurrency(vencidasReceber.value)}.` });
    }
    if (vencendoEm3.count > 0) {
      alertas.push({ tone: "warning", href: "/app/financeiro/transacoes", text: `${formatCurrency(vencendoEm3.value)} em lançamentos vencem nos próximos 3 dias.` });
    }

    return { hoje: { entradas: hojeEntradas, saidas: hojeSaidas }, proximos7: { aReceber: aReceber7, aPagar: aPagar7 }, alertas };
  }, [financeEntries, formatCurrency, serverSummary]);

  const upcomingEntries = useMemo(() =>
    financeEntries.filter(f => f.status === "A Vencer").slice(0, 4).map(f => ({
      label: f.description,
      date: f.date,
      value: formatCurrency(f.value),
      type: f.type.toLowerCase() as "pagar" | "receber",
    })),
  [financeEntries, formatCurrency]);

  // Despesas por categoria do MESMO ciclo já selecionado no topo da tela
  // (cicloEntries) — nenhuma outra tela do Financeiro tem essa quebra por
  // categoria fora do DRE (que só agrega, não lista categoria por categoria).
  const categoriaGastos = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of cicloEntries) {
      if (e.type !== "Pagar" || e.status !== "Pago") continue;
      const nome = e.category || "Sem categoria";
      map.set(nome, (map.get(nome) || 0) + e.value);
    }
    return Array.from(map.entries()).map(([nome, valor]) => ({ nome, valor }));
  }, [cicloEntries]);

  const chartData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const y = d.getFullYear(); const m = d.getMonth();
      const monthEntries = financeEntries.filter(f => {
        const fd = parseEntryDate(f.date);
        return !!fd && fd.getFullYear() === y && fd.getMonth() === m;
      });
      const rec = monthEntries.filter(f => f.type === "Receber" && f.status === "Pago").reduce((s, f) => s + f.value, 0);
      const des = monthEntries.filter(f => f.type === "Pagar"   && f.status === "Pago").reduce((s, f) => s + f.value, 0);
      return { name: MONTH_NAMES[m], receita: rec, despesa: des };
    });
  }, [financeEntries]);

  const operationalInsights = useMemo(() => {
    const marketingSpend = financeEntries
      .filter(f => f.type === "Pagar" && f.status === "Pago" && (f.category?.toLowerCase().includes("marketing") || f.category?.toLowerCase().includes("anúncio")))
      .reduce((s, f) => s + f.value, 0);
    const cpl = leads.length > 0 ? marketingSpend / leads.length : null;
    const ltvProjetado = mrr > 0 ? mrr * 12 : null;
    const margemEbitda = receita > 0 ? ((receita - despesa) / receita) * 100 : null;
    return { cpl, ltvProjetado, margemEbitda };
  }, [financeEntries, leads, mrr, receita, despesa]);

  const handleExport = () => {
    downloadCsv(
      `painel_financeiro_${ciclo}_${Date.now()}.csv`,
      ["Descrição", "Tipo", "Valor", "Status", "Data"],
      cicloEntries.map(f => [f.description, f.type, f.value, f.status, f.date])
    );
  };

  return (
    <PageContainer
      title="Painel Financeiro"
      description="Saúde financeira, fluxo de caixa, MRR e inadimplência em um só lugar."
      actions={
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="hidden sm:flex print:hidden h-9 px-4 text-xs font-medium gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> {CICLOS.find(c => c.id === ciclo)?.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {CICLOS.map(c => (
                <DropdownMenuItem key={c.id} onClick={() => setCiclo(c.id)} className="justify-between">
                  {c.label}
                  {ciclo === c.id && <Check className="w-3.5 h-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={() => window.print()} className="print:hidden h-9 px-3 text-xs font-medium" title="Imprimir relatório">
            <Printer className="w-3.5 h-3.5" />
          </Button>
          <Button onClick={handleExport} className="print:hidden h-9 px-4 text-xs font-medium gap-1.5">
            <Download className="w-3.5 h-3.5" /> Exportar
          </Button>
        </div>
      }
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <FinanceiroKPIs cards={kpiCards} />
        <FinanceiroAlertas {...alertasResumo} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FinanceiroPrevistoRealizado recebimentos={previstoRealizadoRecebimentos} despesas={previstoRealizadoDespesas} />
          <FinanceiroComparativoMes linhas={comparativoLinhas} />
        </div>
        <FinanceiroDespesasPorCategoria categorias={categoriaGastos} />
        <FinanceiroCashflowChart chartData={chartData} liquidez={liquidez} burnRate={burnRate} />
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
