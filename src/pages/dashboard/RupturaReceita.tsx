import { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { UserMinus, PackageX, Filter, TrendingDown, AlertTriangle, Percent, CircleOff, Clock, Users, PackageMinus, PackageCheck, Wallet, Ban, Target } from "lucide-react";
import { Card } from "../../components/ui/card";
import { StatCard } from "../../components/ui/stat-card";
import { SectionTitle } from "../../components/ui/section-title";
import { periodoCaption } from "./periodoCaption";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { parseCurrencyBR } from "../../lib/utils";
import { isLeadLost } from "../../lib/leadStatus";
import { categoriaDoMotivo } from "../../lib/motivos";
import type { DashboardData } from "./revenueInsights";

type Visao = "churn" | "estoque" | "tempo" | "funil";

const VISOES: { id: Visao; label: string; icon: typeof UserMinus }[] = [
  { id: "churn", label: "Cancelamentos", icon: UserMinus },
  { id: "estoque", label: "Estoque", icon: PackageX },
  { id: "tempo", label: "Tempo sem comprar", icon: Clock },
  { id: "funil", label: "Funil", icon: Filter },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dataDe = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmtData = (v: unknown) => {
  const d = dataDe(v);
  return d ? d.toLocaleDateString("pt-BR") : "—";
};
const dentro = (d: Date | null, from: string | null, to: string | null) => {
  if (!d) return false;
  const k = iso(d);
  return (!from || k >= from) && (!to || k <= to);
};

const thCls = "px-3 py-2.5 text-[11px] uppercase font-bold text-[var(--color-text-faint)] whitespace-nowrap";
const tdCls = "px-3 py-2.5 align-top";

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-xs italic text-[var(--color-text-faint)]">{children}</p>;
}

/** Aba "Ruptura": onde a receita se rompe — contratos cancelados (churn), produtos sem estoque e leads que se perdem no funil. */
export default function RupturaReceita({ dashboard }: { dashboard: DashboardData }) {
  const { contracts, products, clienteBase } = useData() as any;
  const { formatCurrency } = useLocalization();
  const periodo = periodoCaption(dashboard.dateFrom, dashboard.dateTo);
  const [visao, setVisao] = useState<Visao>("churn");

  // ── Churn ────────────────────────────────────────────────────────────────
  const churn = useMemo(() => {
    const todos: any[] = contracts || [];
    const cancelados = todos.filter((c) => c.status === "Cancelado");
    const noPeriodo = cancelados.filter((c) => dentro(dataDe(c.cancelledAt), dashboard.dateFrom, dashboard.dateTo));
    const semData = cancelados.filter((c) => !c.cancelledAt).length;
    const ativos = todos.filter((c) => c.status !== "Cancelado" && c.status !== "Perdido");
    const inadimplentes = todos.filter((c) => c.status === "Inadimplente");
    const mrrPerdido = noPeriodo.reduce((s, c) => s + parseCurrencyBR(c.mrr), 0);
    const mrrRisco = inadimplentes.reduce((s, c) => s + parseCurrencyBR(c.mrr), 0);
    const base = ativos.length + noPeriodo.length;
    const taxa = base > 0 ? Math.round((noPeriodo.length / base) * 1000) / 10 : 0;

    // Últimos 6 meses (independe do filtro de período da página).
    const hoje = new Date();
    const meses = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - (5 - i), 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, nome: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), cancelamentos: 0, mrr: 0 };
    });
    for (const c of cancelados) {
      const d = dataDe(c.cancelledAt);
      if (!d) continue;
      const m = meses.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (m) { m.cancelamentos += 1; m.mrr += parseCurrencyBR(c.mrr); }
    }

    const porPlano = new Map<string, { plano: string; qtd: number; mrr: number }>();
    for (const c of noPeriodo) {
      const k = String(c.plan || "Sem plano");
      const cur = porPlano.get(k) ?? { plano: k, qtd: 0, mrr: 0 };
      cur.qtd += 1; cur.mrr += parseCurrencyBR(c.mrr);
      porPlano.set(k, cur);
    }
    const porMotivo = new Map<string, { motivo: string; qtd: number; mrr: number }>();
    for (const c of noPeriodo) {
      const k = categoriaDoMotivo(c.cancelReason);
      const cur = porMotivo.get(k) ?? { motivo: k, qtd: 0, mrr: 0 };
      cur.qtd += 1; cur.mrr += parseCurrencyBR(c.mrr);
      porMotivo.set(k, cur);
    }
    return {
      porMotivo: [...porMotivo.values()].sort((a, b) => b.qtd - a.qtd || b.mrr - a.mrr),
      noPeriodo: [...noPeriodo].sort((a, b) => (dataDe(b.cancelledAt)?.getTime() ?? 0) - (dataDe(a.cancelledAt)?.getTime() ?? 0)),
      inadimplentes, mrrPerdido, mrrRisco, taxa, meses, semData,
      porPlano: [...porPlano.values()].sort((a, b) => b.mrr - a.mrr),
    };
  }, [contracts, dashboard.dateFrom, dashboard.dateTo]);

  // ── Estoque ──────────────────────────────────────────────────────────────
  const estoque = useMemo(() => {
    const controlados = ((products as any[]) || []).filter(
      (p) => p.active !== false && (Number(p.stockMin) > 0 || Number(p.stockMax) > 0 || Number(p.currentStock) > 0),
    );
    const linha = (p: any) => {
      const atual = Number(p.currentStock) || 0;
      const min = Number(p.stockMin) || 0;
      const deficit = Math.max(0, min - atual);
      return { p, atual, min, deficit, custo: deficit * (Number(p.cost) || 0), venda: deficit * (Number(p.price) || 0) };
    };
    const linhas = controlados.map(linha);
    const ruptura = linhas.filter((l) => l.atual <= 0);
    const abaixo = linhas.filter((l) => l.atual > 0 && l.atual <= l.min);
    const ok = linhas.length - ruptura.length - abaixo.length;
    const criticos = [...ruptura, ...abaixo].sort((a, b) => a.atual - b.atual || b.deficit - a.deficit);
    return {
      total: linhas.length, ruptura, abaixo, ok, criticos,
      custoRepor: criticos.reduce((s, l) => s + l.custo, 0),
      vendaParada: criticos.reduce((s, l) => s + l.venda, 0),
    };
  }, [products]);

  // ── Tempo sem comprar ────────────────────────────────────────────────────
  // Última compra por cliente e última venda por produto, a partir das vendas fechadas e dos contratos.
  const tempo = useMemo(() => {
    const hoje = Date.now();
    const dia = 86400000;
    const parse = (v: unknown): Date | null => {
      const t = String(v ?? "").trim();
      const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
      return dataDe(br ? `${br[3]}-${br[2]}-${br[1]}` : t);
    };
    const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
    const clientes = new Map<string, { nome: string; ultima: Date; compras: number; valor: number }>();
    const produtos = new Map<string, Date>();
    const marca = (nome: string, d: Date | null, valor: number) => {
      const k = norm(nome);
      if (!k || !d) return;
      const cur = clientes.get(k);
      if (!cur) clientes.set(k, { nome, ultima: d, compras: 1, valor });
      else { cur.compras += 1; cur.valor += valor; if (d > cur.ultima) cur.ultima = d; }
    };
    for (const l of (dashboard.leads || []) as any[]) {
      if (l.status !== "Fechado") continue;
      const d = parse(l.date) ?? parse(l.createdAt);
      marca(String(l.clientName || l.company || l.name || ""), d, parseCurrencyBR(l.value));
      if (d) for (const id of l.productIds || []) { const ant = produtos.get(String(id)); if (!ant || d > ant) produtos.set(String(id), d); }
    }
    for (const c of (contracts || []) as any[]) marca(String(c.client || ""), parse(c.date), parseCurrencyBR(c.mrr));

    // Parado = sem compra desde o início do período escolhido na página (sem período, 60 dias).
    const corte = dataDe(dashboard.dateFrom ? `${dashboard.dateFrom}T00:00:00` : null) ?? new Date(hoje - 60 * dia);
    const dias = (d: Date) => Math.max(0, Math.floor((hoje - d.getTime()) / dia));
    const listaClientes = [...clientes.values()].map((c) => ({ ...c, dias: dias(c.ultima) })).sort((a, b) => b.dias - a.dias);
    const paradosC = listaClientes.filter((c) => c.ultima < corte);
    const semCompra = ((clienteBase as any[]) || []).filter((c) => !clientes.has(norm(c.name))).length;

    const listaProdutos = ((products as any[]) || []).filter((p) => p.active !== false).map((p) => {
      const u = produtos.get(String(p.id));
      return { p, ultima: u ?? null, dias: u ? dias(u) : null as number | null };
    });
    const paradosP = listaProdutos.filter((x) => !x.ultima || x.ultima < corte)
      .sort((a, b) => (b.dias ?? 1e9) - (a.dias ?? 1e9));
    return {
      paradosC, paradosP, semCompra, totalC: listaClientes.length, totalP: listaProdutos.length,
      valorEmRisco: paradosC.reduce((s, c) => s + (c.compras > 0 ? c.valor / c.compras : 0), 0),
      nuncaVendidos: paradosP.filter((x) => x.dias === null).length,
    };
  }, [dashboard.leads, dashboard.dateFrom, contracts, products, clienteBase]);

  // ── Funil ────────────────────────────────────────────────────────────────
  const funil = useMemo(() => {
    const leads: any[] = dashboard.leads || [];
    const perdidos = leads.filter((l) => isLeadLost(l.status));
    const valorPerdido = perdidos.reduce((s, l) => s + parseCurrencyBR(l.value), 0);
    const taxa = leads.length > 0 ? Math.round((perdidos.length / leads.length) * 1000) / 10 : 0;
    const etapas: { label: string; value: number; drop: number | null }[] = (dashboard.funnelData || []) as any[];
    const gargalo = etapas.reduce<{ label: string; drop: number } | null>(
      (m, e) => (e.drop !== null && e.drop !== undefined && e.drop > (m?.drop ?? -1) ? { label: e.label, drop: e.drop } : m), null,
    );
    const agrupar = (chave: (l: any) => string) => {
      const mapa = new Map<string, { nome: string; qtd: number; valor: number }>();
      for (const l of perdidos) {
        const k = chave(l) || "Não informado";
        const cur = mapa.get(k) ?? { nome: k, qtd: 0, valor: 0 };
        cur.qtd += 1; cur.valor += parseCurrencyBR(l.value);
        mapa.set(k, cur);
      }
      return [...mapa.values()].sort((a, b) => b.qtd - a.qtd || b.valor - a.valor).slice(0, 6);
    };
    const motivos = new Map<string, { nome: string; qtd: number; valor: number }>();
    for (const l of perdidos) {
      const k = categoriaDoMotivo(l.lost_reason);
      const cur = motivos.get(k) ?? { nome: k, qtd: 0, valor: 0 };
      cur.qtd += 1; cur.valor += parseCurrencyBR(l.value);
      motivos.set(k, cur);
    }
    return {
      porMotivo: [...motivos.values()].sort((a, b) => b.qtd - a.qtd || b.valor - a.valor),
      total: leads.length, perdidos, valorPerdido, taxa, etapas, gargalo,
      porOrigem: agrupar((l) => String(l.source ?? "").trim()),
      porVendedor: agrupar((l) => String(l.seller ?? "").trim()),
      maiores: [...perdidos].sort((a, b) => parseCurrencyBR(b.value) - parseCurrencyBR(a.value)).slice(0, 8),
    };
  }, [dashboard.leads, dashboard.funnelData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 w-full md:w-fit overflow-x-auto scrollbar-none bg-[var(--color-surface-sunken)] p-1.5 md:p-1 rounded-2xl md:rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]" role="tablist" aria-label="Tipo de ruptura">
        {VISOES.map((v) => (
          <button
            key={v.id} type="button" role="tab" aria-selected={visao === v.id} onClick={() => setVisao(v.id)}
            className={`flex-1 md:flex-none whitespace-nowrap px-3 py-2.5 md:py-1.5 text-xs font-bold rounded-xl md:rounded-lg inline-flex items-center justify-center gap-1.5 border-none cursor-pointer ${visao === v.id ? "bg-[var(--color-primary-blue)] !text-[#fff]" : "bg-transparent text-[var(--color-text-muted)]"}`}
          >
            <v.icon className="w-3.5 h-3.5 shrink-0" /> {v.label}
          </button>
        ))}
      </div>

      {visao === "churn" && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
            <StatCard icon={UserMinus} tone="danger" label="Contratos cancelados" value={String(churn.noPeriodo.length)} caption={periodo} sub="no período" />
            <StatCard icon={TrendingDown} tone="danger" label="Receita mensal perdida" value={formatCurrency(churn.mrrPerdido)} caption={periodo} sub="receita recorrente que saiu" />
            <StatCard icon={Percent} tone="warning" label="Taxa de cancelamento" value={`${churn.taxa}%`} caption={periodo} sub="cancelados ÷ base de contratos" />
            <StatCard icon={AlertTriangle} tone="warning" label="Em risco (atrasados)" value={formatCurrency(churn.mrrRisco)} caption="agora" sub={`${churn.inadimplentes.length} contrato${churn.inadimplentes.length === 1 ? "" : "s"}`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <Card className="lg:col-span-7 p-5 shadow-sm">
              <SectionTitle as="h4">Cancelamentos por mês</SectionTitle>
              <p className="text-[11px] text-[var(--color-text-muted)] mb-3">Últimos 6 meses, pela data de cancelamento.</p>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
                  <BarChart data={churn.meses} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
                    <XAxis dataKey="nome" stroke="var(--color-text-faint)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} stroke="var(--color-text-faint)" fontSize={11} tickLine={false} axisLine={false} width={28} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 12 }}
                      formatter={(v: number, _n: string, item: any) => [`${v} (${formatCurrency(item.payload.mrr)} de mensalidade)`, "Cancelamentos"]}
                    />
                    <Bar dataKey="cancelamentos" fill="#ef4444" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {churn.semData > 0 && (
                <p className="text-[11px] text-[var(--color-text-faint)] mt-2">{churn.semData} contrato(s) cancelado(s) sem data de cancelamento não entram no gráfico nem no período.</p>
              )}
            </Card>

            <Card className="lg:col-span-5 shadow-sm overflow-hidden">
              <div className="p-5 pb-3">
                <SectionTitle as="h4">Por que cancelam</SectionTitle>
                <p className="text-[11px] text-[var(--color-text-muted)]">Motivo informado ao cancelar o contrato.</p>
              </div>
              {churn.porMotivo.length === 0 ? <Vazio>Nenhum cancelamento no período.</Vazio> : (
                <ul className="divide-y divide-[var(--color-border-subtle)] border-t border-[var(--color-border-subtle)]">
                  {churn.porMotivo.map((m) => (
                    <li key={m.motivo} className="px-5 py-3 flex items-center justify-between gap-3">
                      <span className={`text-xs font-bold break-words min-w-0 ${m.motivo === "Sem motivo registrado" ? "text-[var(--color-text-faint)] italic" : "text-[var(--color-text-primary)]"}`}>{m.motivo}</span>
                      <span className="text-xs text-right shrink-0"><b className="font-mono text-[var(--color-text-primary)]">{formatCurrency(m.mrr)}</b><br /><span className="text-[var(--color-text-muted)]">{m.qtd} contrato{m.qtd === 1 ? "" : "s"}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="lg:col-span-12 shadow-sm overflow-hidden">
              <div className="p-5 pb-3">
                <SectionTitle as="h4">Cancelamentos por plano</SectionTitle>
                <p className="text-[11px] text-[var(--color-text-muted)]">O que mais sai, no período.</p>
              </div>
              {churn.porPlano.length === 0 ? <Vazio>Nenhum cancelamento no período.</Vazio> : (
                <ul className="divide-y divide-[var(--color-border-subtle)] border-t border-[var(--color-border-subtle)]">
                  {churn.porPlano.map((p) => (
                    <li key={p.plano} className="px-5 py-3 flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-[var(--color-text-primary)] break-words min-w-0">{p.plano}</span>
                      <span className="text-xs text-right shrink-0"><b className="font-mono text-[var(--color-text-primary)]">{formatCurrency(p.mrr)}</b><br /><span className="text-[var(--color-text-muted)]">{p.qtd} contrato{p.qtd === 1 ? "" : "s"}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="shadow-sm overflow-hidden">
            <div className="p-5 pb-3">
              <SectionTitle as="h4">Contratos cancelados no período</SectionTitle>
              <p className="text-[11px] text-[var(--color-text-muted)]">Cliente, plano, valor, motivo e tempo de casa.</p>
            </div>
            {churn.noPeriodo.length === 0 ? <Vazio>Nenhum contrato cancelado no período.</Vazio> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[640px]">
                  <thead className="bg-[var(--color-surface-sunken)] border-y border-[var(--color-border-subtle)]"><tr>
                    <th className={thCls}>Cliente</th><th className={thCls}>Plano</th><th className={`${thCls} text-right`}>Mensalidade</th><th className={thCls}>Cancelado em</th><th className={thCls}>Motivo</th><th className={thCls}>Tempo de casa</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {churn.noPeriodo.map((c) => {
                      const ini = dataDe(c.date); const fim = dataDe(c.cancelledAt);
                      const meses = ini && fim ? Math.max(0, Math.round((fim.getTime() - ini.getTime()) / (86400000 * 30))) : null;
                      return (
                        <tr key={c.id}>
                          <td className={`${tdCls} font-bold text-[var(--color-text-primary)] break-words`}>{c.client}</td>
                          <td className={`${tdCls} text-[var(--color-text-muted)] break-words`}>{c.plan}</td>
                          <td className={`${tdCls} text-right font-mono font-bold whitespace-nowrap`}>{formatCurrency(parseCurrencyBR(c.mrr))}</td>
                          <td className={`${tdCls} whitespace-nowrap`}>{fmtData(c.cancelledAt)}</td>
                          <td className={`${tdCls} text-[var(--color-text-muted)] break-words`}>{c.cancelReason || "—"}</td>
                          <td className={`${tdCls} whitespace-nowrap text-[var(--color-text-muted)]`}>{meses === null ? "—" : `${meses} ${meses === 1 ? "mês" : "meses"}`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {visao === "estoque" && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
            <StatCard icon={CircleOff} tone="danger" label="Em ruptura" value={String(estoque.ruptura.length)} caption="agora" sub="produtos com estoque zerado" />
            <StatCard icon={PackageMinus} tone="warning" label="Abaixo do mínimo" value={String(estoque.abaixo.length)} caption="agora" sub="precisam de reposição" />
            <StatCard icon={PackageCheck} tone="success" label="Estoque saudável" value={String(estoque.ok)} caption="agora" sub={`de ${estoque.total} com controle`} />
            <StatCard icon={Wallet} tone="warning" label="Custo para repor" value={formatCurrency(estoque.custoRepor)} caption="até o mínimo" sub={`venda parada: ${formatCurrency(estoque.vendaParada)}`} />
          </div>

          <Card className="shadow-sm overflow-hidden">
            <div className="p-5 pb-3">
              <SectionTitle as="h4">Produtos em ruptura ou abaixo do mínimo</SectionTitle>
              <p className="text-[11px] text-[var(--color-text-muted)]">Só produtos ativos com controle de estoque (mínimo, máximo ou saldo informado). Déficit = mínimo − saldo atual.</p>
            </div>
            {estoque.total === 0 ? <Vazio>Nenhum produto com controle de estoque cadastrado.</Vazio>
              : estoque.criticos.length === 0 ? <Vazio>Nenhum produto em ruptura ou abaixo do mínimo.</Vazio> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[640px]">
                  <thead className="bg-[var(--color-surface-sunken)] border-y border-[var(--color-border-subtle)]"><tr>
                    <th className={thCls}>Produto</th><th className={thCls}>Situação</th><th className={`${thCls} text-right`}>Saldo</th><th className={`${thCls} text-right`}>Mínimo</th><th className={`${thCls} text-right`}>Déficit</th><th className={`${thCls} text-right`}>Custo p/ repor</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {estoque.criticos.map(({ p, atual, min, deficit, custo }) => (
                      <tr key={p.id}>
                        <td className={tdCls}>
                          <div className="font-bold text-[var(--color-text-primary)] break-words">{p.name}</div>
                          <div className="text-[11px] text-[var(--color-text-faint)] break-words">{[p.sku, p.category].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className={tdCls}>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-black ${atual <= 0 ? "bg-rose-500/10 text-rose-600" : "bg-amber-500/10 text-amber-600"}`}>{atual <= 0 ? "Ruptura" : "Abaixo do mínimo"}</span>
                        </td>
                        <td className={`${tdCls} text-right font-mono font-bold`}>{atual}</td>
                        <td className={`${tdCls} text-right font-mono text-[var(--color-text-muted)]`}>{min}</td>
                        <td className={`${tdCls} text-right font-mono font-bold text-rose-600`}>{deficit}</td>
                        <td className={`${tdCls} text-right font-mono whitespace-nowrap`}>{formatCurrency(custo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {visao === "tempo" && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
            <StatCard icon={Users} tone="danger" label="Clientes sem comprar" value={String(tempo.paradosC.length)} caption="agora" sub={`sem compra no período · de ${tempo.totalC} com compra`} />
            <StatCard icon={TrendingDown} tone="warning" label="Valor médio em risco" value={formatCurrency(tempo.valorEmRisco)} caption="agora" sub="soma da compra média desses clientes" />
            <StatCard icon={PackageX} tone="danger" label="Produtos parados" value={String(tempo.paradosP.length)} caption="agora" sub="sem venda no período" />
            <StatCard icon={Ban} tone="warning" label="Nunca vendidos" value={String(tempo.nuncaVendidos)} caption="agora" sub={`${tempo.semCompra} cliente(s) cadastrado(s) sem nenhuma compra`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm overflow-hidden">
              <div className="p-5 pb-3">
                <SectionTitle as="h4">Clientes há muito tempo sem comprar</SectionTitle>
                <p className="text-[11px] text-[var(--color-text-muted)]">Do mais antigo para o mais recente. Boa hora para um contato de retomada.</p>
              </div>
              {tempo.paradosC.length === 0 ? <Vazio>Nenhum cliente parado no período.</Vazio> : (
                <ul className="divide-y divide-[var(--color-border-subtle)] border-t border-[var(--color-border-subtle)] max-h-[480px] overflow-y-auto">
                  {tempo.paradosC.slice(0, 50).map((c) => (
                    <li key={c.nome} className="px-5 py-3 flex items-center justify-between gap-3">
                      <span className="min-w-0"><b className="text-xs text-[var(--color-text-primary)] break-words">{c.nome}</b><br /><span className="text-[11px] text-[var(--color-text-muted)]">última compra em {fmtData(c.ultima)} · {c.compras} compra{c.compras === 1 ? "" : "s"}</span></span>
                      <span className={`text-xs font-bold shrink-0 ${c.dias >= 180 ? "text-rose-600" : "text-amber-600"}`}>{c.dias} dias</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="shadow-sm overflow-hidden">
              <div className="p-5 pb-3">
                <SectionTitle as="h4">Produtos há muito tempo sem vender</SectionTitle>
                <p className="text-[11px] text-[var(--color-text-muted)]">Pela data da última venda fechada com o produto.</p>
              </div>
              {tempo.paradosP.length === 0 ? <Vazio>Nenhum produto parado no período.</Vazio> : (
                <ul className="divide-y divide-[var(--color-border-subtle)] border-t border-[var(--color-border-subtle)] max-h-[480px] overflow-y-auto">
                  {tempo.paradosP.slice(0, 50).map(({ p, ultima, dias }) => (
                    <li key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <span className="min-w-0"><b className="text-xs text-[var(--color-text-primary)] break-words">{p.name}</b><br /><span className="text-[11px] text-[var(--color-text-muted)]">{ultima ? `última venda em ${fmtData(ultima)}` : "nenhuma venda registrada"}</span></span>
                      <span className={`text-xs font-bold shrink-0 ${dias === null || dias >= 180 ? "text-rose-600" : "text-amber-600"}`}>{dias === null ? "nunca vendeu" : `${dias} dias`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      {visao === "funil" && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
            <StatCard icon={ Ban } tone="danger" label="Oportunidades perdidas" value={String(funil.perdidos.length)} caption={periodo} sub="perdidos + desqualificados" />
            <StatCard icon={TrendingDown} tone="danger" label="Valor perdido" value={formatCurrency(funil.valorPerdido)} caption={periodo} sub="soma dos valores das oportunidades" />
            <StatCard icon={Percent} tone="warning" label="Taxa de perda" value={`${funil.taxa}%`} caption={periodo} sub={`de ${funil.total} oportunidades`} />
            <StatCard icon={Target} tone="warning" label="Maior gargalo" value={funil.gargalo ? `${funil.gargalo.drop}%` : "—"} caption="queda entre etapas" sub={funil.gargalo ? `na etapa ${funil.gargalo.label}` : "sem base de comparação"} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5 shadow-sm">
              <SectionTitle as="h4">Onde o funil se rompe</SectionTitle>
              <p className="text-[11px] text-[var(--color-text-muted)] mb-4">Queda de oportunidades de uma etapa para a seguinte.</p>
              {funil.etapas.length === 0 ? <Vazio>Sem dados de funil.</Vazio> : (
                <ul className="space-y-3">
                  {funil.etapas.map((e) => (
                    <li key={e.label}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs font-bold text-[var(--color-text-primary)] break-words min-w-0">{e.label}</span>
                        <span className="text-xs shrink-0"><b className="font-mono">{e.value}</b> <span className={e.drop !== null && e.drop > 0 ? "text-rose-600 font-bold" : "text-[var(--color-text-faint)]"}>{e.drop === null || e.drop === undefined ? "—" : e.drop > 0 ? `−${e.drop}%` : "0%"}</span></span>
                      </div>
                      <div className="h-1.5 mt-1 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.min(100, Math.max(e.drop ?? 0, 0))}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="grid grid-cols-1 gap-4">
              {([["Por que se perdem", funil.porMotivo], ["Perdas por origem", funil.porOrigem], ["Perdas por vendedor", funil.porVendedor]] as const).map(([titulo, lista]) => (
                <Card key={titulo} className="p-5 shadow-sm">
                  <SectionTitle as="h4">{titulo}</SectionTitle>
                  {lista.length === 0 ? <Vazio>Nenhuma oportunidade perdida no período.</Vazio> : (
                    <ul className="divide-y divide-[var(--color-border-subtle)] mt-2">
                      {lista.map((i) => (
                        <li key={i.nome} className="py-2.5 flex items-center justify-between gap-3">
                          <span className="text-xs font-bold text-[var(--color-text-primary)] break-words min-w-0">{i.nome}</span>
                          <span className="text-xs text-right shrink-0"><b className="font-mono">{i.qtd}</b> <span className="text-[var(--color-text-muted)]">· {formatCurrency(i.valor)}</span></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          </div>

          <Card className="shadow-sm overflow-hidden">
            <div className="p-5 pb-3">
              <SectionTitle as="h4">Maiores oportunidades perdidas</SectionTitle>
              <p className="text-[11px] text-[var(--color-text-muted)]">Com o motivo informado ao perder a oportunidade.</p>
            </div>
            {funil.maiores.length === 0 ? <Vazio>Nenhuma oportunidade perdida no período.</Vazio> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[560px]">
                  <thead className="bg-[var(--color-surface-sunken)] border-y border-[var(--color-border-subtle)]"><tr>
                    <th className={thCls}>Oportunidade</th><th className={thCls}>Origem</th><th className={thCls}>Vendedor</th><th className={thCls}>Status</th><th className={thCls}>Motivo</th><th className={`${thCls} text-right`}>Valor</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {funil.maiores.map((l: any) => (
                      <tr key={l.id}>
                        <td className={`${tdCls} font-bold text-[var(--color-text-primary)] break-words`}>{l.name}{l.company ? <div className="text-[11px] font-normal text-[var(--color-text-faint)]">{l.company}</div> : null}</td>
                        <td className={`${tdCls} text-[var(--color-text-muted)] break-words`}>{l.source || "—"}</td>
                        <td className={`${tdCls} text-[var(--color-text-muted)] break-words`}>{l.seller || "—"}</td>
                        <td className={`${tdCls} whitespace-nowrap`}>{l.status}</td>
                        <td className={`${tdCls} text-[var(--color-text-muted)] break-words`}>{l.lost_reason || "—"}</td>
                        <td className={`${tdCls} text-right font-mono font-bold whitespace-nowrap`}>{formatCurrency(parseCurrencyBR(l.value))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
