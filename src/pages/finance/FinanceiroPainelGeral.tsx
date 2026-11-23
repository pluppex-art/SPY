import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, BarChart3, CalendarClock, CheckCircle2, ChevronRight, Inbox, Landmark, TrendingDown, Users, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { supabase } from "../../lib/supabase";
import { useFinanceiroFiltro } from "./FinanceiroFilterContext";
import { FinanceiroFilterBar } from "./components/FinanceiroFilterBar";
import { SecaoCard } from "./components/SecaoCard";
import { FinanceKpiGrid } from "./components/FinanceKpiGrid";
import { kpiSimples } from "./components/kpiSimples";
import { LegendaStatusFinanceiro } from "./components/StatusFinanceiroBadge";
import { hojeISO, statusDoLancamento, useFinanceEntriesResumo, type LancamentoResumo } from "./hooks/useFinanceEntriesResumo";
import { saldoDaConta, transferenciasDaConta, type FinanceEntryLike } from "./lib/financeEngine";

const base = "/app/financeiro";
const soma = (xs: { value: number }[]) => xs.reduce((a, x) => a + x.value, 0);
const somaK = (xs: any[], k: string) => xs.reduce((a, x) => a + (Number(x[k]) || 0), 0);
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const dataBR = (iso: string | null) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "—");

interface Gestao { promessas: any[]; adiantamentos: any[]; acordos: any[]; patrocinios: any[]; viagens: any[]; metas: any[]; reservas: any[] }
const VAZIO: Gestao = { promessas: [], adiantamentos: [], acordos: [], patrocinios: [], viagens: [], metas: [], reservas: [] };

type Tom = "danger" | "warning" | "success";
const COR_TEXTO: Record<Tom, string> = { danger: "text-rose-600", warning: "text-amber-600", success: "text-emerald-600" };

/** Linha "rótulo ........ valor", clicável quando tem destino. */
function LinhaValor({ label, value, to, tone }: { label: string; value: string; to?: string; tone?: Tom }) {
  const corpo = (
    <>
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className={`whitespace-nowrap text-right font-semibold tabular-nums ${tone ? COR_TEXTO[tone] : ""}`}>{value}</span>
    </>
  );
  const cls = "flex items-center justify-between gap-3 px-4 py-2.5 text-sm";
  return to ? <Link to={to} className={`${cls} hover:bg-[var(--color-surface-sunken)]`}>{corpo}</Link> : <div className={cls}>{corpo}</div>;
}

function Atalhos({ itens }: { itens: { label: string; to: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 border-t border-[var(--color-border-default)] p-3">
      {itens.map((a) => (
        <Link key={a.to} to={a.to} className="rounded-full border border-[var(--color-border-default)] px-2.5 py-1 text-xs font-medium hover:border-[var(--color-primary-blue)] hover:text-[var(--color-primary-blue)]">
          {a.label}
        </Link>
      ))}
    </div>
  );
}

/** Barra empilhada por faixa de vencimento: vencido / 7 dias / 30 dias / depois. */
function Faixas({ itens, brl, rota }: { itens: { label: string; valor: number; cor: string; ruim?: boolean }[]; brl: (n: number) => string; rota: string }) {
  const total = itens.reduce((a, i) => a + i.valor, 0);
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-border-default)]" role="img" aria-label="Distribuição por vencimento">
        {total > 0 && itens.map((i) => i.valor > 0 && <span key={i.label} className={i.cor} style={{ width: `${(i.valor / total) * 100}%` }} />)}
      </div>
      <ul className="mt-3 space-y-1.5">
        {itens.map((i) => (
          <li key={i.label}>
            <Link to={rota} className="flex items-center gap-2 text-sm hover:underline">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${i.cor}`} />
              <span className="flex-1 text-[var(--color-text-muted)]">{i.label}</span>
              <span className={`font-semibold tabular-nums ${i.ruim && i.valor > 0 ? "text-rose-600" : ""}`}>{brl(i.valor)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Painel Geral — tela inicial do Financeiro. De cima para baixo: situação do caixa, entradas × saídas,
 * alertas, a receber e a pagar por vencimento, próximos vencimentos e um resumo de cada área.
 * Vale para qualquer tipo de empresa; tudo vem dos lançamentos e cadastros já feitos.
 */
export default function FinanceiroPainelGeral() {
  const { rows, loading, erro, hoje } = useFinanceEntriesResumo();
  const { financeEntries, financeBankAccounts, financeTransfers } = useData();
  const { activeTenantId: tenantId } = useAuth();
  const { formatCurrency: brl } = useLocalization();
  const [g, setG] = useState<Gestao>(VAZIO);
  const navigate = useNavigate();
  const { periodoFrom, periodoTo, preset, label: periodoLabel } = useFinanceiroFiltro();
  const sufixo = preset === "mes-atual" ? "do mês" : `(${periodoLabel.toLowerCase()})`;

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

  const temContas = (financeBankAccounts as any[]).some((c) => !c.arquivada);
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

  const d = useMemo(() => {
    const em = (n: number) => { const x = new Date(); x.setDate(x.getDate() + n); return hojeISO(x); };
    const l7 = em(7), l30 = em(30);
    // Período escolhido no filtro (padrão: mês atual); sem limite = tudo.
    const doMes = rows.filter((l) => !!l.date && (!periodoFrom || l.date >= periodoFrom) && (!periodoTo || l.date <= periodoTo));
    const abertoR = rows.filter((l) => l.type === "Receber" && l.status !== "Pago");
    const abertoP = rows.filter((l) => l.type === "Pagar" && l.status !== "Pago");
    const atrasado = (l: LancamentoResumo) => statusDoLancamento(l, hoje) === "Atrasado";
    const faixas = (xs: LancamentoResumo[]) => ({
      vencido: soma(xs.filter(atrasado)),
      sete: soma(xs.filter((l) => !atrasado(l) && !!l.date && l.date <= l7)),
      trinta: soma(xs.filter((l) => !!l.date && l.date > l7 && l.date <= l30)),
      depois: soma(xs.filter((l) => !l.date || l.date > l30)),
    });
    // Últimos 6 meses, só o que já foi pago (regime de caixa).
    const serie = Array.from({ length: 6 }, (_, i) => {
      const ref = new Date(new Date().getFullYear(), new Date().getMonth() - (5 - i), 1);
      const pref = hojeISO(ref).slice(0, 7);
      const pagos = rows.filter((l) => l.status === "Pago" && l.date?.startsWith(pref));
      return { mes: MESES[ref.getMonth()], Entradas: soma(pagos.filter((l) => l.type === "Receber")), Saídas: soma(pagos.filter((l) => l.type === "Pagar")) };
    });
    const proximos = rows
      .filter((l) => l.status !== "Pago" && !atrasado(l) && l.date)
      .sort((a, b) => (a.date as string).localeCompare(b.date as string))
      .slice(0, 7);
    return {
      entradas: soma(doMes.filter((l) => l.type === "Receber" && l.status === "Pago")),
      saidas: soma(doMes.filter((l) => l.type === "Pagar" && l.status === "Pago")),
      aReceber: soma(abertoR), aPagar: soma(abertoP),
      receberAtrasado: abertoR.filter(atrasado), pagarAtrasado: abertoP.filter(atrasado),
      fR: faixas(abertoR), fP: faixas(abertoP),
      pagar7: abertoP.filter((l) => !atrasado(l) && l.date && l.date <= l7),
      pagar3: abertoP.filter((l) => !atrasado(l) && l.date && l.date <= em(3)),
      venceHoje: abertoP.filter((l) => l.date === hoje),
      previsto30: soma(abertoR.filter((l) => !l.date || l.date <= l30)) - soma(abertoP.filter((l) => !l.date || l.date <= l30)),
      pagoMesN: doMes.filter((l) => l.type === "Pagar" && l.status === "Pago").length,
      serie, proximos,
    };
  }, [rows, hoje, periodoFrom, periodoTo]);

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
  const resultado = d.entradas - d.saidas;
  const v = (s: string) => (loading ? "…" : s);

  const alertas = ([
    d.pagarAtrasado.length && { texto: `${d.pagarAtrasado.length} conta(s) a pagar vencida(s)`, valor: brl(soma(d.pagarAtrasado)), to: `${base}/despesas`, tom: "danger" },
    d.receberAtrasado.length && { texto: `${d.receberAtrasado.length} recebimento(s) em atraso`, valor: brl(soma(d.receberAtrasado)), to: `${base}/inadimplencia`, tom: "danger" },
    promessasVencidas.length && { texto: `${promessasVencidas.length} promessa(s) de pagamento vencida(s)`, valor: brl(somaK(promessasVencidas, "valor")), to: `${base}/promessas`, tom: "danger" },
    viagensEstouro.length && { texto: `${viagensEstouro.length} viagem/evento acima do orçamento`, to: `${base}/viagens`, tom: "danger" },
    d.venceHoje.length && { texto: `${d.venceHoje.length} conta(s) vencem hoje`, valor: brl(soma(d.venceHoje)), to: `${base}/agenda`, tom: "warning" },
    d.pagar3.length && { texto: `${d.pagar3.length} conta(s) vencem em até 3 dias`, valor: brl(soma(d.pagar3)), to: `${base}/agenda`, tom: "warning" },
    contrapPend.length && { texto: `${contrapPend.length} patrocínio(s) com contrapartida a entregar`, to: `${base}/patrocinios`, tom: "warning" },
    viagensSemPrestacao.length && { texto: `${viagensSemPrestacao.length} viagem/evento sem prestação de contas`, to: `${base}/viagens`, tom: "warning" },
  ].filter(Boolean)) as { texto: string; valor?: string; to: string; tom: "danger" | "warning" }[];

  return (
    <PageContainer
      title="Painel Geral"
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Painel Geral" }]}
      description="Saldo, entradas, saídas, contas a pagar e a receber, e os alertas do dia."
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <FinanceiroFilterBar />
          <Link to={`${base}/resumo`}><Button variant="outline">Central de Resumo</Button></Link>
          <Link to={`${base}/visao-geral`}><Button variant="outline"><BarChart3 className="mr-2 h-4 w-4" />Análise detalhada</Button></Link>
        </div>
      }
    >
      <div className="mx-auto max-w-[1700px] space-y-4 pb-12">
        {erro && <SecaoCard titulo="Erro ao carregar"><p className="text-sm text-rose-600">{erro}</p></SecaoCard>}

        <FinanceKpiGrid
          cards={[
            kpiSimples("Saldo em contas", v(temContas ? brl(saldoContas) : "—"), Landmark, temContas ? "Todas as contas somadas" : "Cadastre em Contas Bancárias", saldoContas < 0, () => navigate(`${base}/bancos`)),
            kpiSimples(`Entradas ${sufixo}`, v(brl(d.entradas)), ArrowUpCircle, "Recebido até hoje", false, () => navigate(`${base}/receitas`)),
            kpiSimples(`Saídas ${sufixo}`, v(brl(d.saidas)), ArrowDownCircle, `${d.pagoMesN} pagamento(s) feitos`, false, () => navigate(`${base}/despesas`)),
            kpiSimples(`Resultado ${sufixo}`, v(brl(resultado)), Wallet, "Entradas − saídas", resultado < 0, () => navigate(`${base}/dre`)),
          ]}
        />

        <div className="grid gap-4 xl:grid-cols-5">
          <SecaoCard titulo="Entradas × saídas — últimos 6 meses" icon={BarChart3} className="xl:col-span-3" acao={{ label: "Fluxo de caixa", to: `${base}/fluxo-caixa` }}>
            <div className="h-64 xl:h-[calc(100%-1.75rem)] xl:min-h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.serie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-default)" />
                  <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={48} tickFormatter={(n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))} />
                  <Tooltip formatter={(val: number) => brl(val)} cursor={{ fill: "var(--color-surface-sunken)" }} />
                  <Bar dataKey="Entradas" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Saídas" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">Só o que já foi pago ou recebido (regime de caixa).</p>
          </SecaoCard>

          <SecaoCard titulo="Alertas" icon={AlertTriangle} semPadding className="xl:col-span-2">
            {alertas.length === 0 ? (
              <p className="flex items-center gap-2 p-4 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" />{loading ? "Verificando…" : "Tudo em dia: nenhum alerta no momento."}</p>
            ) : (
              <ul className="divide-y divide-[var(--color-border-default)]">
                {alertas.map((a) => (
                  <li key={a.texto}>
                    <Link to={a.to} className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-[var(--color-surface-sunken)]">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${a.tom === "danger" ? "bg-rose-500" : "bg-amber-500"}`} />
                      <span className="min-w-0 flex-1">{a.texto}</span>
                      {a.valor && <span className={`whitespace-nowrap font-semibold tabular-nums ${a.tom === "danger" ? "text-rose-600" : "text-amber-600"}`}>{a.valor}</span>}
                      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SecaoCard>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <SecaoCard titulo="A receber" icon={Inbox} acao={{ label: "Ver receitas", to: `${base}/receitas` }}>
            <p className="mb-3 text-2xl font-black tabular-nums">{v(brl(d.aReceber))}</p>
            <Faixas brl={brl} rota={`${base}/receitas`} itens={[
              { label: "Vencido", valor: d.fR.vencido, cor: "bg-rose-500", ruim: true },
              { label: "Vence em 7 dias", valor: d.fR.sete, cor: "bg-amber-500" },
              { label: "Em 8 a 30 dias", valor: d.fR.trinta, cor: "bg-sky-500" },
              { label: "Depois / sem data", valor: d.fR.depois, cor: "bg-slate-400" },
            ]} />
          </SecaoCard>
          <SecaoCard titulo="A pagar" icon={TrendingDown} acao={{ label: "Ver despesas", to: `${base}/despesas` }}>
            <p className="mb-3 text-2xl font-black tabular-nums">{v(brl(d.aPagar))}</p>
            <Faixas brl={brl} rota={`${base}/despesas`} itens={[
              { label: "Vencido", valor: d.fP.vencido, cor: "bg-rose-500", ruim: true },
              { label: "Vence em 7 dias", valor: d.fP.sete, cor: "bg-amber-500" },
              { label: "Em 8 a 30 dias", valor: d.fP.trinta, cor: "bg-sky-500" },
              { label: "Depois / sem data", valor: d.fP.depois, cor: "bg-slate-400" },
            ]} />
          </SecaoCard>
          <SecaoCard titulo="Próximos vencimentos" icon={CalendarClock} semPadding acao={{ label: "Agenda", to: `${base}/agenda` }}>
            {d.proximos.length === 0 ? (
              <p className="p-4 text-sm text-[var(--color-text-muted)]">{loading ? "Carregando…" : "Nada a vencer nos próximos dias."}</p>
            ) : (
              <ul className="divide-y divide-[var(--color-border-default)]">
                {d.proximos.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="w-11 shrink-0 text-xs font-bold tabular-nums text-[var(--color-text-muted)]">{dataBR(l.date)}</span>
                    <span className="min-w-0 flex-1 truncate">{l.description}</span>
                    <span className={`whitespace-nowrap font-semibold tabular-nums ${l.type === "Pagar" ? "text-rose-600" : "text-emerald-600"}`}>{l.type === "Pagar" ? "−" : "+"}{brl(l.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SecaoCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 min-[1700px]:grid-cols-4">
          <SecaoCard titulo="Entradas" icon={Inbox} semPadding>
            <div className="divide-y divide-[var(--color-border-default)]">
              <LinhaValor label="A receber" value={brl(d.aReceber)} to={`${base}/receitas`} />
              <LinhaValor label="Em atraso" value={brl(soma(d.receberAtrasado))} tone={d.receberAtrasado.length ? "danger" : undefined} to={`${base}/inadimplencia`} />
              <LinhaValor label={`Recebido ${preset === "mes-atual" ? "no mês" : sufixo}`} value={brl(d.entradas)} tone="success" />
              <LinhaValor label="Promessas pendentes" value={`${promessasPend.length} · ${brl(somaK(promessasPend, "valor"))}`} to={`${base}/promessas`} />
              <LinhaValor label="Patrocínios a receber" value={brl(somaK(patrocReceber, "valor_total") - somaK(patrocReceber, "valor_recebido"))} to={`${base}/patrocinios`} />
            </div>
            <Atalhos itens={[{ label: "Cobranças", to: `${base}/cobrancas` }, { label: "Contratos", to: `${base}/faturas` }, { label: "MRR", to: `${base}/mrr` }]} />
          </SecaoCard>
          <SecaoCard titulo="Custos e despesas" icon={TrendingDown} semPadding>
            <div className="divide-y divide-[var(--color-border-default)]">
              <LinhaValor label="Total a pagar" value={brl(d.aPagar)} to={`${base}/despesas`} />
              <LinhaValor label="Vencido" value={brl(soma(d.pagarAtrasado))} tone={d.pagarAtrasado.length ? "danger" : undefined} to={`${base}/despesas`} />
              <LinhaValor label="Vence em 7 dias" value={brl(soma(d.pagar7))} tone={d.pagar7.length ? "warning" : undefined} to={`${base}/agenda`} />
              <LinhaValor label={`Pago ${preset === "mes-atual" ? "no mês" : sufixo}`} value={brl(d.saidas)} />
              <LinhaValor label="Viagens e eventos (gasto)" value={brl(somaK(g.viagens, "valor_gasto"))} to={`${base}/viagens`} />
            </div>
            <Atalhos itens={[{ label: "Compras e parcelas", to: `${base}/compras` }, { label: "Centros de custo", to: `${base}/centros-custo` }, { label: "Orçamentos", to: `${base}/orcamentos` }]} />
          </SecaoCard>
          <SecaoCard titulo="Pessoas e comercial" icon={Users} semPadding>
            <div className="divide-y divide-[var(--color-border-default)]">
              <LinhaValor label="Adiantamentos em aberto" value={`${adiantAbertos.length} · ${brl(somaK(adiantAbertos, "valor"))}`} tone={adiantAbertos.length ? "warning" : undefined} to={`${base}/adiantamentos`} />
              <LinhaValor label="Acordos em andamento" value={`${acordosAnd.length} · ${brl(somaK(acordosAnd, "valor"))}`} to={`${base}/acordos`} />
              <LinhaValor label="Metas do mês batidas" value={`${metasMes.filter((m) => Number(m.valor_meta) > 0 && Number(m.valor_realizado) >= Number(m.valor_meta)).length}/${metasMes.length}`} to={`${base}/metas`} />
            </div>
            <Atalhos itens={[{ label: "Folha", to: `${base}/folha` }, { label: "Comissões", to: `${base}/comissoes` }, { label: "Indicações", to: `${base}/indicacoes` }]} />
          </SecaoCard>
          <SecaoCard titulo="Financeiro geral" icon={Wallet} semPadding>
            <div className="divide-y divide-[var(--color-border-default)]">
              <LinhaValor label="Saldo em contas" value={temContas ? brl(saldoContas) : "—"} tone={saldoContas < 0 ? "danger" : undefined} to={`${base}/bancos`} />
              <LinhaValor label="Previsão 30 dias" value={`${d.previsto30 < 0 ? "déficit " : "sobra "}${brl(Math.abs(d.previsto30))}`} tone={d.previsto30 < 0 ? "danger" : "success"} to={`${base}/resumo`} />
              <LinhaValor label="Reservas (saldo)" value={brl(somaK(g.reservas, "saldo_atual"))} to={`${base}/reservas`} />
              <LinhaValor label={`Resultado ${sufixo}`} value={brl(resultado)} tone={resultado < 0 ? "danger" : "success"} to={`${base}/dre`} />
            </div>
            <Atalhos itens={[{ label: "Conciliação", to: `${base}/conciliacao` }, { label: "Relatórios", to: `${base}/relatorios` }, { label: "DRE", to: `${base}/dre` }]} />
          </SecaoCard>
        </div>

        <LegendaStatusFinanceiro />
      </div>
    </PageContainer>
  );
}
