import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import {
  Crown, Users, Target, FileText, ShoppingCart, ChevronRight, TrendingUp, TrendingDown, Calendar, Package,
} from "lucide-react";
import { Card } from "../../../components/ui/card";
import { SectionTitle } from "../../../components/ui/section-title";
import { DrillDownPanel } from "../../../components/ui/DrillDownPanel";
import { leadDrillColumns } from "../../../components/ui/drillColumns";
import { useData } from "../../../contexts/DataContext";
import { useLocalization } from "../../../contexts/LocalizationContext";
import type { DashboardData } from "../revenueInsights";
import {
  computeVendedores, resolverPeriodo, serieDiaria, PERIODO_LABEL,
  type PeriodoOpcao, type VendedorLinha,
} from "../vendedoresMetrics";

const selectCls =
  "h-9 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] px-3 text-xs font-semibold text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-blue)] cursor-pointer";

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

function Avatar({ v, size = 36 }: { v: Pick<VendedorLinha, "nome" | "avatar" | "cor">; size?: number }) {
  if (v.avatar && /^(https?:|data:)/.test(v.avatar)) {
    return <img src={v.avatar} alt={v.nome} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-black text-white shrink-0"
      style={{ width: size, height: size, backgroundColor: v.cor, fontSize: size * 0.34 }}
    >
      {iniciais(v.nome)}
    </div>
  );
}

function Tendencia({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[var(--color-text-faint)]">—</span>;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 font-bold ${up ? "text-emerald-500" : "text-rose-500"}`}>
      <Icon className="w-3.5 h-3.5" /> {up ? "+" : ""}{pct}%
    </span>
  );
}

export default function VendedoresPanel({ dashboard }: { dashboard: DashboardData }) {
  const { leads, proposals, proposalItems, products, contracts, colaboradores, cargos, sellerRestricted } = useData() as any;
  const { formatCurrency } = useLocalization();

  const [periodo, setPeriodo] = useState<PeriodoOpcao>("mes");
  const [vendedorSel, setVendedorSel] = useState<string>("todos");
  const [produtoSel, setProdutoSel] = useState<string>("todos");
  const [acumulada, setAcumulada] = useState(true);
  const [detalhe, setDetalhe] = useState<VendedorLinha | null>(null);

  const faixa = useMemo(
    () => resolverPeriodo(periodo, dashboard.dateFrom, dashboard.dateTo),
    [periodo, dashboard.dateFrom, dashboard.dateTo],
  );

  const { linhas, vendasNoPeriodo } = useMemo(
    () => computeVendedores(
      { leads, proposals, proposalItems, products, contracts, colaboradores, cargos },
      faixa,
      { produtoId: produtoSel === "todos" ? null : produtoSel },
    ),
    [leads, proposals, proposalItems, products, contracts, colaboradores, cargos, faixa, produtoSel],
  );

  // Catálogo pro filtro: produtos ativos, em ordem alfabética.
  const opcoesProduto = useMemo(
    () => [...((products as any[]) || [])]
      .filter((p) => p.active !== false)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR")),
    [products],
  );
  const produtoNome = produtoSel === "todos" ? null : (opcoesProduto.find((p) => p.id === produtoSel)?.name ?? null);

  const visiveis = useMemo(
    () => linhas.filter((l) => vendedorSel === "todos" || l.key === vendedorSel),
    [linhas, vendedorSel],
  );
  const vendedorAtual = vendedorSel === "todos" ? null : (linhas.find((l) => l.key === vendedorSel) ?? null);
  // Clicar de novo no vendedor já escolhido volta para "todos".
  const escolherVendedor = (key: string) => setVendedorSel((cur) => (cur === key ? "todos" : key));

  // Produtos vendidos somando os vendedores visíveis (ranking de produtos).
  const produtosGeral = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; vendas: number; receita: number }>();
    visiveis.forEach((l) => l.produtos.forEach((p) => {
      const cur = m.get(p.id) ?? { id: p.id, nome: p.nome, vendas: 0, receita: 0 };
      cur.vendas += p.vendas;
      cur.receita += p.receita;
      m.set(p.id, cur);
    }));
    return [...m.values()].sort((a, b) => b.receita - a.receita || b.vendas - a.vendas);
  }, [visiveis]);

  // O ranking mostra sempre todos (é por onde se escolhe o vendedor); o resto da tela segue a escolha.
  const ranking = useMemo(
    () => [...linhas].sort((a, b) => b.receita - a.receita || b.vendas - a.vendas || a.nome.localeCompare(b.nome, "pt-BR")),
    [linhas],
  );
  const podio = ranking.filter((l) => l.receita > 0 || l.vendas > 0).slice(0, 3);
  const maxReceita = ranking[0]?.receita || 1;
  const totalReceitaRanking = ranking.reduce((sum, v) => sum + (v.receita || 0), 0);
  const shareReceita = (r: number) => (totalReceitaRanking > 0 ? `${Math.round((r / totalReceitaRanking) * 1000) / 10}%` : "0%");

  const serie = useMemo(
    () => serieDiaria(vendasNoPeriodo, visiveis.slice(0, 4), faixa, acumulada),
    [vendasNoPeriodo, visiveis, faixa, acumulada],
  );

  const f = visiveis.reduce(
    (a, l) => ({ leads: a.leads + l.leads, oportunidades: a.oportunidades + l.oportunidades, propostas: a.propostas + l.propostas, vendas: a.vendas + l.vendas }),
    { leads: 0, oportunidades: 0, propostas: 0, vendas: 0 },
  );
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : "—");
  const etapasFunil = [
    { label: "Leads", icon: Users, valor: f.leads, sub: "100%", cor: "#3b82f6" },
    { label: "Oportunidades", icon: Target, valor: f.oportunidades, sub: pct(f.oportunidades, f.leads), cor: "#a855f7" },
    { label: "Propostas", icon: FileText, valor: f.propostas, sub: pct(f.propostas, f.oportunidades), cor: "#3b82f6" },
    { label: "Vendas", icon: ShoppingCart, valor: f.vendas, sub: pct(f.vendas, f.propostas), cor: "#10b981" },
  ];

  const comMeta = visiveis.filter((l) => l.meta > 0);
  const seriesVendedores = visiveis.slice(0, 4);
  const titulo = sellerRestricted ? "Meus números" : "Receita por vendedor";

  return (
    <div className="space-y-5">
      <Card className="p-5 space-y-5 shadow-sm">
        {/* Cabeçalho + filtros */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>{titulo}</SectionTitle>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none" />
              <select value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoOpcao)} className={`${selectCls} pl-8`}>
                {(Object.keys(PERIODO_LABEL) as PeriodoOpcao[]).map((p) => <option key={p} value={p}>{PERIODO_LABEL[p]}</option>)}
              </select>
            </label>
            <label className="relative">
              <Package className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none" />
              <select value={produtoSel} onChange={(e) => setProdutoSel(e.target.value)} className={`${selectCls} pl-8 max-w-[220px]`}>
                <option value="todos">Todos os produtos</option>
                {opcoesProduto.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
        </div>

        {/* Filtro rápido de vendedor: um clique filtra a tela toda */}
        {!sellerRestricted && linhas.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)] shrink-0">Vendedor</span>
            {[{ key: "todos", nome: "Todos" } as const, ...linhas].map((l) => {
              const ativo = vendedorSel === l.key;
              return (
                <button
                  key={l.key} type="button" onClick={() => (l.key === "todos" ? setVendedorSel("todos") : escolherVendedor(l.key))}
                  className={`shrink-0 inline-flex items-center gap-1.5 h-8 rounded-full border px-3 text-xs font-bold cursor-pointer transition-colors ${
                    ativo
                      ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]"
                      : "border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  {"cor" in l && <Avatar v={l as VendedorLinha} size={20} />}
                  {l.nome}
                </button>
              );
            })}
          </div>
        )}

        {/* Ranking + desempenho por vendedor (uma tabela só) */}
        <Card className="min-w-0 overflow-hidden shadow-sm">
          <div className="p-5 pb-3">
            <SectionTitle as="h4">{sellerRestricted ? "Desempenho" : "Ranking e desempenho por vendedor"}</SectionTitle>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              {sellerRestricted ? "Detalhamento dos seus números no período." : "Todos os vendedores por receita no período. Clique numa linha para filtrar a tela."}
            </p>
          </div>
          {!sellerRestricted && podio.length > 0 && (
            <div className="flex items-end justify-center gap-3 px-5 pt-8 pb-5 min-h-[240px]">
                  {[1, 0, 2].map((pos) => {
                    const v = podio[pos];
                    if (!v) return <div key={pos} className="w-24" />;
                    const alturas = [150, 112, 84];
                    const cores = ["from-amber-300 to-amber-500", "from-indigo-300 to-indigo-500", "from-orange-400 to-orange-600"];
                    return (
                      <button
                        key={v.key} type="button" onClick={() => escolherVendedor(v.key)} title="Filtrar por este vendedor"
                        className={`flex flex-col items-center w-28 rounded-xl p-1 cursor-pointer bg-transparent border-none ${vendedorSel === v.key ? "ring-2 ring-[var(--color-primary-blue)]" : "hover:bg-[var(--color-surface-sunken)]"}`}
                      >
                        <div className="relative mb-1.5">
                          {pos === 0 && <Crown className="w-5 h-5 text-amber-400 absolute -top-5 left-1/2 -translate-x-1/2" />}
                          <Avatar v={v} size={pos === 0 ? 44 : 38} />
                        </div>
                        <p className="text-[10px] font-black uppercase text-[var(--color-text-primary)] text-center leading-tight truncate w-full">{v.nome}</p>
                        <p className="text-sm font-black font-mono text-[var(--color-text-primary)]">{formatCurrency(v.receita)}</p>
                        <p className="text-[10px] text-[var(--color-text-muted)] mb-1">{v.vendas} venda{v.vendas === 1 ? "" : "s"}</p>
                        <div className={`w-full rounded-t-lg bg-gradient-to-b ${cores[pos]} flex items-center justify-center text-white font-black text-3xl`} style={{ height: alturas[pos] }}>
                          {pos + 1}
                        </div>
                      </button>
                    );
                  })}
                </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[900px]">
              <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)] border-y border-[var(--color-border-subtle)]">
                <tr>
                  <th className="whitespace-nowrap pl-5 pr-2 py-2.5 w-10">#</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Vendedor</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Receita</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Leads</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Oportunidades</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Vendas</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Ticket médio</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Conversão</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Meta</th>
                  <th className="whitespace-nowrap px-3 py-2.5">vs. anterior</th>
                  <th className="whitespace-nowrap pl-3 pr-5 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {ranking.map((v, i) => {
                  const medalha = i === 0 ? "bg-amber-400 text-white" : i === 1 ? "bg-slate-400 text-white" : i === 2 ? "bg-orange-500 text-white" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]";
                  return (
                    <tr
                      key={v.key}
                      onClick={sellerRestricted ? undefined : () => escolherVendedor(v.key)}
                      title={sellerRestricted ? undefined : "Filtrar por este vendedor"}
                      className={`transition-colors ${sellerRestricted ? "" : "cursor-pointer"} ${vendedorSel === v.key ? "bg-[var(--color-primary-blue)]/10" : "hover:bg-[var(--color-surface-sunken)]/60"}`}
                    >
                      <td className="pl-5 pr-2 py-3">
                        <span className={`w-6 h-6 rounded-full text-[10px] font-black flex items-center justify-center ${medalha}`}>
                          {i === 0 ? <Crown className="w-3.5 h-3.5" /> : i + 1}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar v={v} size={32} />
                          <div className="min-w-0">
                            <p className="font-bold text-[var(--color-text-primary)] truncate max-w-[180px]">{v.nome}</p>
                            <div className="h-1.5 w-32 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden mt-1">
                              <div className="h-full rounded-full" style={{ width: `${Math.max(v.receita > 0 ? 4 : 0, (v.receita / maxReceita) * 100)}%`, backgroundColor: v.cor }} />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <p className="font-mono font-black text-[var(--color-text-primary)]">{formatCurrency(v.receita)}</p>
                        <p className="text-[10px] text-[var(--color-text-faint)]">{shareReceita(v.receita)} do total</p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text-muted)]">{v.leads}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text-muted)]">{v.oportunidades}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-[var(--color-text-primary)]">{v.vendas}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-[var(--color-text-muted)]">{v.vendas > 0 ? formatCurrency(v.ticket) : "—"}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text-muted)]">{v.conversao}%</td>
                      <td className="px-3 py-3 min-w-[120px]">
                        {v.metaPct === null ? (
                          <span className="text-[var(--color-text-faint)]">sem meta</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, v.metaPct)}%`, backgroundColor: v.cor }} />
                            </div>
                            <span className="font-bold tabular-nums" style={{ color: v.cor }}>{v.metaPct}%</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3"><Tendencia pct={v.tendencia} /></td>
                      <td className="pl-3 pr-5 py-3 text-right">
                        <button
                          type="button" onClick={(e) => { e.stopPropagation(); setDetalhe(v); }}
                          className="whitespace-nowrap px-3 h-7 rounded-lg border border-[var(--color-border-default)] text-[11px] font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] cursor-pointer"
                        >
                          Ver detalhes
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {ranking.length === 0 && (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-[var(--color-text-faint)]">Nenhum vendedor encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {produtoNome && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-primary-blue)]/30 bg-[var(--color-primary-blue)]/8 px-4 py-2.5 text-xs">
            <span className="text-[var(--color-text-primary)]">
              Filtrando pelo produto <strong>{produtoNome}</strong>: só entram os leads que envolvem esse produto, e a receita é a parte desse produto nas vendas.
            </span>
            <button type="button" onClick={() => setProdutoSel("todos")} className="font-bold text-[var(--color-primary-blue)] hover:underline cursor-pointer shrink-0">Limpar</button>
          </div>
        )}

        {/* Produtos vendidos */}
        <Card className="overflow-hidden shadow-sm">
          <div className="p-4 border-b border-[var(--color-border-subtle)]">
            <SectionTitle as="h4">Produtos vendidos{vendedorAtual ? ` — ${vendedorAtual.nome}` : sellerRestricted ? "" : " por vendedor"}</SectionTitle>
            <p className="text-[11px] text-[var(--color-text-muted)]">Quais produtos cada {sellerRestricted ? "venda sua trouxe" : "vendedor vendeu"} no período. Recorrente mostra a mensalidade.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-4 p-4 border-b lg:border-b-0 lg:border-r border-[var(--color-border-subtle)]">
              <p className="text-[9px] font-black uppercase tracking-wider text-[var(--color-text-faint)] mb-3">Mais vendidos</p>
              {produtosGeral.length === 0 ? (
                <p className="text-xs text-[var(--color-text-faint)] italic py-4">Nenhuma venda com produto no período.</p>
              ) : (
                <div className="space-y-3">
                  {produtosGeral.slice(0, 6).map((p) => (
                    <div key={p.id}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-bold text-[var(--color-text-primary)] truncate">{p.nome}</span>
                        <span className="text-xs font-black font-mono text-[var(--color-text-primary)] shrink-0">{formatCurrency(p.receita)}</span>
                      </div>
                      <div className="h-1.5 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden mt-1">
                        <div className="h-full rounded-full bg-[var(--color-primary-blue)]" style={{ width: `${Math.max(4, (p.receita / (produtosGeral[0].receita || 1)) * 100)}%` }} />
                      </div>
                      <span className="text-[9px] text-[var(--color-text-faint)]">{p.vendas} venda{p.vendas === 1 ? "" : "s"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="lg:col-span-8 divide-y divide-[var(--color-border-subtle)]">
              {visiveis.map((v) => (
                <div key={v.key} className="flex items-start gap-3 px-4 py-3">
                  <Avatar v={v} size={30} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{v.nome}</p>
                    {v.produtos.length === 0 ? (
                      <p className="text-[11px] text-[var(--color-text-faint)] mt-1">Sem produtos vendidos no período.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {v.produtos.map((p) => (
                          <span key={p.id} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] px-2 py-1 text-[11px]">
                            <span className="font-bold text-[var(--color-text-primary)]">{p.nome}</span>
                            <span className="text-[var(--color-text-muted)]">× {p.vendas}</span>
                            <span className="font-mono font-bold text-[var(--color-text-primary)]">{formatCurrency(p.receita)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {visiveis.length === 0 && <p className="px-4 py-8 text-center text-xs text-[var(--color-text-faint)]">Nenhum vendedor encontrado.</p>}
            </div>
          </div>
        </Card>

        {/* Evolução + Funil */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Card className="lg:col-span-7 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <SectionTitle as="h4">Evolução da receita{sellerRestricted ? "" : " por vendedor"}</SectionTitle>
                <p className="text-[11px] text-[var(--color-text-muted)]">Receita diária no período selecionado.</p>
              </div>
              <select value={acumulada ? "acumulada" : "diaria"} onChange={(e) => setAcumulada(e.target.value === "acumulada")} className={selectCls}>
                <option value="acumulada">Receita acumulada</option>
                <option value="diaria">Receita diária</option>
              </select>
            </div>
            {seriesVendedores.length === 0 ? (
              <p className="text-xs text-[var(--color-text-faint)] italic py-12 text-center">Sem vendas no período.</p>
            ) : (
              <div className="h-[230px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "var(--color-text-faint)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--color-text-faint)" }} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => formatCurrency(v)} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 11 }}
                      formatter={(v: number, k: string) => [formatCurrency(v), seriesVendedores.find((s) => s.key === k)?.nome ?? k]}
                    />
                    <Legend formatter={(k: string) => seriesVendedores.find((s) => s.key === k)?.nome ?? k} wrapperStyle={{ fontSize: 11 }} />
                    {seriesVendedores.map((v) => (
                      <Line key={v.key} type="monotone" dataKey={v.key} stroke={v.cor} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card className="lg:col-span-5 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <SectionTitle as="h4">Funil{vendedorAtual ? ` — ${vendedorAtual.nome}` : sellerRestricted ? "" : " por vendedor"}</SectionTitle>
                <p className="text-[11px] text-[var(--color-text-muted)]">Quantidade de leads em cada etapa.</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5 items-stretch">
              {etapasFunil.map((e, i) => (
                <div key={e.label} className="relative">
                  <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-2.5 text-center h-full">
                    <e.icon className="w-5 h-5 mx-auto mb-1" style={{ color: e.cor }} />
                    <p className="text-[8px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">{e.label}</p>
                    <p className="text-xl font-black text-[var(--color-text-primary)] font-mono">{e.valor}</p>
                    <p className="text-[10px] font-bold" style={{ color: e.cor }}>{e.sub}</p>
                    {i > 0 && <p className="text-[8px] text-[var(--color-text-faint)]">de conversão</p>}
                  </div>
                  {i < etapasFunil.length - 1 && <ChevronRight className="absolute top-1/2 -right-2.5 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)] z-10" />}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Meta x realizado */}
        <Card className="p-5 shadow-sm">
          <SectionTitle as="h4">Meta x realizado{sellerRestricted ? "" : " por vendedor"}</SectionTitle>
          <p className="text-[11px] text-[var(--color-text-muted)] mb-4">Acompanhe o progresso da meta de receita.</p>
          {comMeta.length === 0 ? (
            <p className="text-xs text-[var(--color-text-faint)] italic py-8 text-center">
              Nenhuma meta definida. Cadastre a meta mensal em Equipe › Editar colaborador.
            </p>
          ) : (
            <div className="space-y-4">
              {comMeta.map((v) => (
                <div key={v.key} className="flex items-center gap-3">
                  <Avatar v={v} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] font-black uppercase text-[var(--color-text-primary)] truncate">{v.nome}</span>
                      <span className="text-[10px] font-mono text-[var(--color-text-muted)] shrink-0">{formatCurrency(v.receita)} / {formatCurrency(v.meta)}</span>
                    </div>
                    <div className="h-2 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden mt-1.5">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, v.metaPct ?? 0)}%`, backgroundColor: v.cor }} />
                    </div>
                  </div>
                  <span className="text-sm font-black tabular-nums w-12 text-right" style={{ color: v.cor }}>{v.metaPct}%</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Card>

      <DrillDownPanel
        isOpen={detalhe !== null}
        onClose={() => setDetalhe(null)}
        title={detalhe ? `Leads de ${detalhe.nome}` : undefined}
        subtitle={detalhe ? `${detalhe.leadsDoVendedor.length} lead${detalhe.leadsDoVendedor.length === 1 ? "" : "s"} criado${detalhe.leadsDoVendedor.length === 1 ? "" : "s"} no período` : undefined}
        rows={detalhe ? detalhe.leadsDoVendedor : []}
        columns={leadDrillColumns(formatCurrency)}
      />
    </div>
  );
}
