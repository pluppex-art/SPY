import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, BarChart3, CheckCircle2, ChevronRight, Inbox, Landmark, TrendingDown, Users, Wallet, type LucideIcon } from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { StatCard } from "../../components/ui/stat-card";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { supabase } from "../../lib/supabase";
import { LegendaStatusFinanceiro } from "./components/StatusFinanceiroBadge";
import { hojeISO, statusDoLancamento, useFinanceEntriesResumo } from "./hooks/useFinanceEntriesResumo";
import { saldoDaConta, transferenciasDaConta, type FinanceEntryLike } from "./lib/financeEngine";

const base = "/app/financeiro";
const soma = (xs: { value: number }[]) => xs.reduce((a, x) => a + x.value, 0);
const somaK = (xs: any[], k: string) => xs.reduce((a, x) => a + (Number(x[k]) || 0), 0);

interface Gestao {
  promessas: any[];
  adiantamentos: any[];
  acordos: any[];
  patrocinios: any[];
  viagens: any[];
  metas: any[];
  reservas: any[];
}
const VAZIO: Gestao = { promessas: [], adiantamentos: [], acordos: [], patrocinios: [], viagens: [], metas: [], reservas: [] };

interface LinhaArea {
  label: string;
  value: string;
  to?: string;
  tone?: "danger" | "warning" | "success";
}

/** Bloco de uma área do financeiro (como as colunas do mapa): título + números-chave, cada um clicável. */
function CartaoArea({ titulo, icon: Icon, to, linhas, atalhos }: { titulo: string; icon: LucideIcon; to: string; linhas: LinhaArea[]; atalhos: { label: string; to: string }[] }) {
  const cor = { danger: "text-red-600", warning: "text-amber-600", success: "text-emerald-600" };
  return (
    <Card className="overflow-hidden">
      <Link to={to} className="flex items-center gap-2 bg-[var(--color-primary-blue)] px-4 py-3 text-sm font-bold uppercase tracking-wide text-white">
        <Icon className="h-4 w-4" />
        {titulo}
        <ChevronRight className="ml-auto h-4 w-4" />
      </Link>
      <ul className="divide-y divide-[var(--color-border-default)]">
        {linhas.map((l) => {
          const corpo = (
            <>
              <span className="text-[var(--color-text-muted)]">{l.label}</span>
              <span className={`font-semibold tabular-nums ${l.tone ? cor[l.tone] : ""}`}>{l.value}</span>
            </>
          );
          return (
            <li key={l.label}>
              {l.to ? (
                <Link to={l.to} className="flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-[var(--color-surface-sunken)]">{corpo}</Link>
              ) : (
                <div className="flex items-center justify-between gap-2 px-4 py-2 text-sm">{corpo}</div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-1.5 border-t border-[var(--color-border-default)] p-3">
        {atalhos.map((a) => (
          <Link key={a.to} to={a.to} className="rounded-full border border-[var(--color-border-default)] px-2.5 py-1 text-xs font-medium hover:border-[var(--color-primary-blue)] hover:text-[var(--color-primary-blue)]">
            {a.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}

/**
 * Painel Geral — a tela inicial do Financeiro: saldo, entradas, saídas, contas a
 * pagar e a receber, alertas, e um resumo de cada área (Entradas, Custos e
 * Despesas, Pessoas e Comercial, Financeiro Geral). Vale para qualquer tipo de
 * empresa; tudo vem dos lançamentos e cadastros já feitos.
 */
export default function FinanceiroPainelGeral() {
  const { rows, loading, erro, hoje } = useFinanceEntriesResumo();
  const { financeEntries, financeBankAccounts, financeTransfers } = useData();
  const { activeTenantId: tenantId } = useAuth();
  const { formatCurrency: brl } = useLocalization();
  const [g, setG] = useState<Gestao>(VAZIO);

  // Cadastros de gestão (promessas, adiantamentos…) — pequenos; se alguma tabela falhar, a área só fica zerada.
  useEffect(() => {
    if (!supabase || !tenantId) return;
    let cancelado = false;
    const tabelas: [keyof Gestao, string][] = [
      ["promessas", "finance_promessas"], ["adiantamentos", "finance_adiantamentos"], ["acordos", "finance_acordos"],
      ["patrocinios", "finance_patrocinios"], ["viagens", "finance_viagens"], ["metas", "finance_metas"], ["reservas", "finance_reservas"],
    ];
    Promise.all(tabelas.map(async ([k, t]) => {
      const { data } = await supabase!.from(t).select("*").eq("tenant_id", tenantId).limit(2000);
      return [k, data || []] as const;
    })).then((res) => { if (!cancelado) setG(Object.fromEntries(res) as unknown as Gestao); });
    return () => { cancelado = true; };
  }, [tenantId]);

  // Saldo real somando as contas bancárias (mesma conta da tela Contas Bancárias).
  const saldoContas = useMemo(() => {
    let total = 0;
    for (const c of (financeBankAccounts as any[]).filter((c) => !c.arquivada)) {
      const { recebidas, enviadas } = transferenciasDaConta(financeTransfers as any[], c.id);
      total += saldoDaConta({
        saldoInicial: c.saldo_inicial,
        sinalSaldoInicial: c.sinal_saldo_inicial,
        entriesDaConta: (financeEntries as unknown as FinanceEntryLike[]).filter((e: any) => e.conta_bancaria_id === c.id),
        transferenciasRecebidasPagas: recebidas,
        transferenciasEnviadasPagas: enviadas,
      });
    }
    return total;
  }, [financeBankAccounts, financeTransfers, financeEntries]);
  const temContas = (financeBankAccounts as any[]).some((c) => !c.arquivada);

  const d = useMemo(() => {
    const mes = hoje.slice(0, 7);
    const em = (n: number) => { const x = new Date(); x.setDate(x.getDate() + n); return hojeISO(x); };
    const doMes = rows.filter((l) => l.date?.startsWith(mes));
    const abertoR = rows.filter((l) => l.type === "Receber" && l.status !== "Pago");
    const abertoP = rows.filter((l) => l.type === "Pagar" && l.status !== "Pago");
    const atrasado = (l: (typeof rows)[number]) => statusDoLancamento(l, hoje) === "Atrasado";
    const ate = (xs: typeof rows, lim: string) => xs.filter((l) => !atrasado(l) && l.date && l.date <= lim);
    return {
      entradas: soma(doMes.filter((l) => l.type === "Receber" && l.status === "Pago")),
      saidas: soma(doMes.filter((l) => l.type === "Pagar" && l.status === "Pago")),
      aReceber: soma(abertoR), aPagar: soma(abertoP),
      receberAtrasado: abertoR.filter(atrasado), pagarAtrasado: abertoP.filter(atrasado),
      pagar7: ate(abertoP, em(7)), receber7: ate(abertoR, em(7)),
      pagar3: ate(abertoP, em(3)),
      venceHoje: abertoP.filter((l) => l.date === hoje),
      previsto30: soma(abertoR.filter((l) => !l.date || l.date <= em(30))) - soma(abertoP.filter((l) => !l.date || l.date <= em(30))),
      pagoMesN: doMes.filter((l) => l.type === "Pagar" && l.status === "Pago").length,
    };
  }, [rows, hoje]);

  const mesAtual = hoje.slice(0, 7);
  const promessasVencidas = g.promessas.filter((p) => p.status === "Pendente" && p.data_prometida < hoje);
  const promessasPend = g.promessas.filter((p) => p.status === "Pendente");
  const adiantAbertos = g.adiantamentos.filter((a) => a.status === "Em aberto");
  const acordosAnd = g.acordos.filter((a) => a.status === "Em andamento");
  const contrapPend = g.patrocinios.filter((p) => !p.entregue && (p.status === "Fechado" || p.status === "Recebido"));
  const patrocReceber = g.patrocinios.filter((p) => p.status !== "Cancelado");
  const viagensSemPrestacao = g.viagens.filter((v) => !v.prestacao_contas);
  const viagensEstouro = g.viagens.filter((v) => Number(v.valor_gasto) > Number(v.valor_orcado));
  const metasMes = g.metas.filter((m) => m.mes === mesAtual);

  // Alertas: só aparecem os que têm algo a mostrar.
  const alertas: { texto: string; to: string; tone: "danger" | "warning" }[] = [
    d.pagarAtrasado.length && { texto: `${d.pagarAtrasado.length} conta(s) a pagar vencida(s): ${brl(soma(d.pagarAtrasado))}`, to: `${base}/despesas`, tone: "danger" as const },
    d.receberAtrasado.length && { texto: `${d.receberAtrasado.length} recebimento(s) em atraso: ${brl(soma(d.receberAtrasado))}`, to: `${base}/inadimplencia`, tone: "danger" as const },
    promessasVencidas.length && { texto: `${promessasVencidas.length} promessa(s) de pagamento vencida(s): ${brl(somaK(promessasVencidas, "valor"))}`, to: `${base}/promessas`, tone: "danger" as const },
    d.venceHoje.length && { texto: `${d.venceHoje.length} conta(s) vencem hoje: ${brl(soma(d.venceHoje))}`, to: `${base}/agenda`, tone: "warning" as const },
    d.pagar3.length && { texto: `${d.pagar3.length} conta(s) vencem em até 3 dias: ${brl(soma(d.pagar3))}`, to: `${base}/agenda`, tone: "warning" as const },
    viagensEstouro.length && { texto: `${viagensEstouro.length} viagem/evento acima do orçamento`, to: `${base}/viagens`, tone: "danger" as const },
    contrapPend.length && { texto: `${contrapPend.length} patrocínio(s) com contrapartida a entregar`, to: `${base}/patrocinios`, tone: "warning" as const },
    viagensSemPrestacao.length && { texto: `${viagensSemPrestacao.length} viagem/evento sem prestação de contas`, to: `${base}/viagens`, tone: "warning" as const },
  ].filter(Boolean) as { texto: string; to: string; tone: "danger" | "warning" }[];

  return (
    <PageContainer
      title="Painel Geral"
      description="Saldo, entradas, saídas, contas a pagar e a receber, e os alertas do dia."
      actions={
        <div className="flex gap-2">
          <Link to={`${base}/resumo`}><Button variant="outline">Central de Resumo</Button></Link>
          <Link to={`${base}/visao-geral`}><Button variant="outline"><BarChart3 className="mr-2 h-4 w-4" />Análise detalhada</Button></Link>
        </div>
      }
    >
      {erro && <Card className="p-4 text-sm text-red-600">{erro}</Card>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={Landmark} label="Saldo em contas" value={loading ? "…" : temContas ? brl(saldoContas) : "—"} tone={saldoContas < 0 ? "danger" : "default"} caption={temContas ? "Todas as contas" : "Cadastre contas em Contas Bancárias"} />
        <StatCard icon={ArrowUpCircle} label="Entradas do mês" value={loading ? "…" : brl(d.entradas)} tone="success" caption="Recebido" />
        <StatCard icon={ArrowDownCircle} label="Saídas do mês" value={loading ? "…" : brl(d.saidas)} tone="danger" caption="Pago" />
        <StatCard icon={Inbox} label="A receber" value={loading ? "…" : brl(d.aReceber)} sub={`Atrasado: ${brl(soma(d.receberAtrasado))}`} caption="Em aberto" />
        <StatCard icon={TrendingDown} label="A pagar" value={loading ? "…" : brl(d.aPagar)} tone="warning" sub={`Vencido: ${brl(soma(d.pagarAtrasado))}`} caption="Em aberto" />
      </div>

      <Card className="p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4" />Alertas</h3>
        {alertas.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" />{loading ? "Verificando…" : "Tudo em dia: nenhum alerta no momento."}</p>
        ) : (
          <ul className="grid gap-1.5 md:grid-cols-2">
            {alertas.map((a) => (
              <li key={a.texto}>
                <Link to={a.to} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${a.tone === "danger" ? "border-red-500/30 bg-red-500/10 text-red-700" : "border-amber-500/30 bg-amber-500/10 text-amber-700"}`}>
                  {a.texto}
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <CartaoArea
          titulo="Entradas" icon={Inbox} to={`${base}/receitas`}
          linhas={[
            { label: "A receber", value: brl(d.aReceber), to: `${base}/receitas` },
            { label: "Em atraso", value: brl(soma(d.receberAtrasado)), tone: d.receberAtrasado.length ? "danger" : undefined, to: `${base}/inadimplencia` },
            { label: "Recebido no mês", value: brl(d.entradas), tone: "success" },
            { label: "Promessas pendentes", value: `${promessasPend.length} · ${brl(somaK(promessasPend, "valor"))}`, to: `${base}/promessas` },
            { label: "Patrocínios a receber", value: brl(somaK(patrocReceber, "valor_total") - somaK(patrocReceber, "valor_recebido")), to: `${base}/patrocinios` },
          ]}
          atalhos={[{ label: "Receitas", to: `${base}/receitas` }, { label: "Cobranças", to: `${base}/cobrancas` }, { label: "Contratos", to: `${base}/faturas` }, { label: "MRR", to: `${base}/mrr` }]}
        />
        <CartaoArea
          titulo="Custos e Despesas" icon={TrendingDown} to={`${base}/despesas`}
          linhas={[
            { label: "Total a pagar", value: brl(d.aPagar), to: `${base}/despesas` },
            { label: "Vencido", value: brl(soma(d.pagarAtrasado)), tone: d.pagarAtrasado.length ? "danger" : undefined, to: `${base}/despesas` },
            { label: "Vence em 7 dias", value: brl(soma(d.pagar7)), tone: d.pagar7.length ? "warning" : undefined, to: `${base}/agenda` },
            { label: `Pago no mês (${d.pagoMesN})`, value: brl(d.saidas) },
            { label: "Viagens e eventos (gasto)", value: brl(somaK(g.viagens, "valor_gasto")), to: `${base}/viagens` },
          ]}
          atalhos={[{ label: "Despesas", to: `${base}/despesas` }, { label: "Compras e parcelas", to: `${base}/compras` }, { label: "Centros de custo", to: `${base}/centros-custo` }, { label: "Orçamentos", to: `${base}/orcamentos` }]}
        />
        <CartaoArea
          titulo="Pessoas e Comercial" icon={Users} to={`${base}/adiantamentos`}
          linhas={[
            { label: "Adiantamentos em aberto", value: `${adiantAbertos.length} · ${brl(somaK(adiantAbertos, "valor"))}`, tone: adiantAbertos.length ? "warning" : undefined, to: `${base}/adiantamentos` },
            { label: "Acordos em andamento", value: `${acordosAnd.length} · ${brl(somaK(acordosAnd, "valor"))}`, to: `${base}/acordos` },
            { label: "Metas do mês batidas", value: `${metasMes.filter((m) => Number(m.valor_meta) > 0 && Number(m.valor_realizado) >= Number(m.valor_meta)).length}/${metasMes.length}`, to: `${base}/metas` },
          ]}
          atalhos={[{ label: "Adiantamentos", to: `${base}/adiantamentos` }, { label: "Acordos e permutas", to: `${base}/acordos` }, { label: "Comissões", to: `${base}/indicacoes` }, { label: "Equipe", to: "/app/equipe" }]}
        />
        <CartaoArea
          titulo="Financeiro Geral" icon={Wallet} to={`${base}/fluxo-caixa`}
          linhas={[
            { label: "Saldo em contas", value: temContas ? brl(saldoContas) : "—", tone: saldoContas < 0 ? "danger" : undefined, to: `${base}/bancos` },
            { label: "Previsão 30 dias", value: `${d.previsto30 < 0 ? "déficit " : "sobra "}${brl(Math.abs(d.previsto30))}`, tone: d.previsto30 < 0 ? "danger" : "success", to: `${base}/resumo` },
            { label: "Reservas (saldo)", value: brl(somaK(g.reservas, "saldo_atual")), to: `${base}/reservas` },
            { label: "Resultado do mês", value: brl(d.entradas - d.saidas), tone: d.entradas - d.saidas < 0 ? "danger" : "success", to: `${base}/dre` },
          ]}
          atalhos={[{ label: "Fluxo de caixa", to: `${base}/fluxo-caixa` }, { label: "Conciliação", to: `${base}/conciliacao` }, { label: "Relatórios", to: `${base}/relatorios` }, { label: "DRE", to: `${base}/dre` }]}
        />
      </div>

      <LegendaStatusFinanceiro />
    </PageContainer>
  );
}
