import { useUnidadeMax } from "../../lib/unidadeMaxdata";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Users, Target, ShoppingCart, DollarSign, RefreshCw, AlertTriangle,
  Radio, Package, Globe2, Trophy, Sparkles, Workflow,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { SectionTitle } from "../../components/ui/section-title";
import { StatCard } from "../../components/ui/stat-card";
import { periodoCaption } from "./periodoCaption";
import { Badge } from "../../components/ui/badge";
import { DrillDownPanel, type DrillColumn } from "../../components/ui/DrillDownPanel";
import { leadDrillColumns, contractDrillColumns, isContractAtivo } from "../../components/ui/drillColumns";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { parseCurrencyBR } from "../../lib/utils";
import { prepararValor, somarLeads } from "../../lib/valorDoLead";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import SegmentosPanel from "./components/SegmentosPanel";
import ProdutosPanel from "./components/ProdutosPanel";
import CanaisPanel from "./components/CanaisPanel";
import { computeChannelRevenue, computeProductRevenue, computeSegmentRevenue, type DashboardData } from "./revenueInsights";

import { HelpTip } from "../../components/ui/help-tip";
type DrillKey = "leads" | "oportunidades" | "vendas" | "receita" | "retencao" | "emRisco";

const SEGMENT_PALETTE = [
  "var(--color-primary-blue)", "#14b8a6", "#f59e0b", "#64748b", "#ec4899", "#94a3b8",
];

// Uma cor própria por etapa do fluxo — mesma ideia do ícone colorido do
// mockup, não um degradê genérico (etapas vizinhas ficariam parecidas).
const FLUXO_COLORS = ["#3b82f6", "#a855f7", "#10b981", "#f97316", "#6366f1", "#ef4444"];

type SubAba = "visaoGeral" | "canais" | "produtos" | "segmentos";
const SUB_ABAS: { id: SubAba; label: string }[] = [
  { id: "visaoGeral", label: "Visão Geral" },
  { id: "canais", label: "Canais" },
  { id: "produtos", label: "Produtos" },
  { id: "segmentos", label: "Segmentos" },
];

export default function MapaDaReceita({ dashboard }: { dashboard: DashboardData }) {
  const { contracts, proposals, proposalItems, products, clienteBase } = useData();
  const { leads, totalRevenue, faturamentoContratado, salesRanking: salesRankingLocal, funnelData } = dashboard;
  const { formatCurrency } = useLocalization();
  const periodo = periodoCaption(dashboard.dateFrom, dashboard.dateTo);
  const [subAba, setSubAba] = useState<SubAba>("visaoGeral");

  const oportunidades = useMemo(() => (leads as any[]).filter((l) => parseCurrencyBR(l.value) > 0), [leads]);
  const vendas = useMemo(() => (leads as any[]).filter((l) => l.status === "Fechado"), [leads]);
  // Empresa sem contrato (vende rápido, sem proposta): a receita é o valor dos negócios ganhos no período (regra única de valor).
  const receitaDasVendas = useMemo(() => somarLeads(vendas, prepararValor(proposals as any[], products as any[])).total, [vendas, proposals, products]);
  const receitaDoFluxo = faturamentoContratado > 0 ? faturamentoContratado : receitaDasVendas;
  const contratosAtivos = useMemo(() => (contracts as any[]).filter(isContractAtivo), [contracts]);
  const contratosEmRisco = useMemo(() => (contracts as any[]).filter((c) => c.status === "Inadimplente"), [contracts]);
  const valorEmRisco = contratosEmRisco.reduce((s, c) => s + parseCurrencyBR(c.mrr), 0);

  const [drillKey, setDrillKey] = useState<DrillKey | null>(null);

  // Loja Max Data: o navegador só tem parte das vendas (de 490 mil+); os totais do fluxo vêm agregados do banco.
  const { activeTenantId } = useAuth();
  const [unidade] = useUnidadeMax();
  const virtual = (contracts as any[]).some((c) => String(c.id).startsWith("venda-"));
  const [pan, setPan] = useState<any | null>(null);
  useEffect(() => {
    if (!virtual || !activeTenantId || !supabase) { setPan(null); return; }
    let off = false;
    supabase.rpc("maxdata_panorama", { p_tenant: activeTenantId, p_de: dashboard.dateFrom || null, p_ate: dashboard.dateTo || null, p_origem: unidade || null })
      .then(({ data, error }: any) => { if (!off) setPan(error ? null : data); });
    return () => { off = true; };
  }, [virtual, activeTenantId, dashboard.dateFrom, dashboard.dateTo, unidade]);
  const [vend, setVend] = useState<any[] | null>(null);
  useEffect(() => {
    if (!virtual || !activeTenantId || !supabase) { setVend(null); return; }
    let off = false;
    supabase.rpc("maxdata_vendedores", { p_tenant: activeTenantId, p_de: dashboard.dateFrom || null, p_ate: dashboard.dateTo || null, p_origem: unidade || null })
      .then(({ data, error }: any) => { if (!off && !error && Array.isArray(data)) setVend(data); });
    return () => { off = true; };
  }, [virtual, activeTenantId, dashboard.dateFrom, dashboard.dateTo, unidade]);
  const salesRanking = useMemo(() => vend
    ? vend.map((v: any) => ({ name: v.codigo === "sem código" ? "Sem atendente" : `Atendente ${v.codigo}`, total: Number(v.total) || 0, deals: Number(v.deals) || 0, rate: Number(v.rate) || 0 }))
    : salesRankingLocal, [vend, salesRankingLocal]) as any[];
  const [det, setDet] = useState<{ canais?: any[]; produtos?: any[]; segmentos?: any[] }>({});
  useEffect(() => {
    if (!virtual || !activeTenantId || !supabase) { setDet({}); return; }
    let off = false;
    (["canais", "produtos", "segmentos"] as const).forEach((tipo) => {
      supabase!.rpc("maxdata_panorama_detalhe", { p_tenant: activeTenantId, p_tipo: tipo, p_de: dashboard.dateFrom || null, p_ate: dashboard.dateTo || null, p_origem: unidade || null })
        .then(({ data, error }: any) => { if (!off && !error && Array.isArray(data)) setDet((d) => ({ ...d, [tipo]: data })); });
    });
    return () => { off = true; };
  }, [virtual, activeTenantId, dashboard.dateFrom, dashboard.dateTo, unidade]);

  const fluxo = useMemo(() => {
    if (pan) {
      const n = (v: number) => Number(v || 0).toLocaleString("pt-BR");
      const tot = pan.registros || 1;
      return [
        { key: "leads" as DrillKey, icon: Users, label: "Leads", value: n(pan.registros), sub: "Todas as vendas registradas" as string | null },
        { key: "oportunidades" as DrillKey, icon: Target, label: "Oportunidades", value: n(pan.vendas + pan.em_aberto), sub: `${Math.round(((pan.vendas + pan.em_aberto) / tot) * 1000) / 10}% dos leads` },
        { key: "vendas" as DrillKey, icon: ShoppingCart, label: "Vendas", value: n(pan.vendas), sub: `${Math.round((pan.vendas / tot) * 1000) / 10}% dos leads` },
        { key: "receita" as DrillKey, icon: DollarSign, label: "Receita", value: formatCurrency(pan.faturamento), sub: pan.vendas > 0 ? `Ticket médio ${formatCurrency(pan.faturamento / pan.vendas)}` : "Sem vendas ainda" },
        { key: "retencao" as DrillKey, icon: RefreshCw, label: "Clientes que compraram", value: n(pan.clientes), sub: "Clientes distintos no período" },
        { key: "emRisco" as DrillKey, icon: AlertTriangle, label: "Canceladas", value: formatCurrency(pan.canceladas_valor), sub: `${n(pan.canceladas)} venda${pan.canceladas === 1 ? "" : "s"} cancelada${pan.canceladas === 1 ? "" : "s"}` },
      ].map((f, i) => ({ ...f, color: FLUXO_COLORS[i % FLUXO_COLORS.length] }));
    }
    const totalLeads = leads.length || 1;
    return [
      { key: "leads" as DrillKey, icon: Users, label: "Leads", value: String(leads.length), sub: `100% do funil` as string | null },
      { key: "oportunidades" as DrillKey, icon: Target, label: "Oportunidades", value: String(oportunidades.length), sub: `${Math.round((oportunidades.length / totalLeads) * 1000) / 10}% dos leads` },
      { key: "vendas" as DrillKey, icon: ShoppingCart, label: "Vendas", value: String(vendas.length), sub: `${oportunidades.length > 0 ? Math.round((vendas.length / oportunidades.length) * 1000) / 10 : 0}% das oportunidades` },
      { key: "receita" as DrillKey, icon: DollarSign, label: "Receita", value: formatCurrency(receitaDoFluxo), sub: vendas.length > 0 ? `Ticket médio ${formatCurrency(receitaDoFluxo / vendas.length)}` : "Sem vendas ainda" },
      { key: "retencao" as DrillKey, icon: RefreshCw, label: "Retenção (MRR)", value: formatCurrency(totalRevenue), sub: faturamentoContratado > 0 ? `${Math.round((totalRevenue / faturamentoContratado) * 1000) / 10}% da receita` : "Sem receita ainda" },
      { key: "emRisco" as DrillKey, icon: AlertTriangle, label: "Em Risco", value: formatCurrency(valorEmRisco), sub: `${contratosEmRisco.length} contrato${contratosEmRisco.length === 1 ? "" : "s"} · ${faturamentoContratado > 0 ? Math.round((valorEmRisco / faturamentoContratado) * 1000) / 10 : 0}% da receita` },
    ].map((f, i) => ({ ...f, color: FLUXO_COLORS[i % FLUXO_COLORS.length] }));
  }, [pan, leads.length, oportunidades.length, vendas.length, faturamentoContratado, receitaDoFluxo, totalRevenue, valorEmRisco, contratosEmRisco.length, formatCurrency]);

  const leadColumns = leadDrillColumns(formatCurrency);
  const contractColumnsTotal = contractDrillColumns(formatCurrency, "totalValue");
  const contractColumnsMrr = contractDrillColumns(formatCurrency, "mrr");

  const drillConfig: Record<DrillKey, { title: string; subtitle: string; rows: any[]; columns: DrillColumn[] }> = {
    leads: { title: "Leads", subtitle: `${leads.length} lead${leads.length === 1 ? "" : "s"} no total`, rows: leads as any[], columns: leadColumns },
    oportunidades: { title: "Oportunidades", subtitle: `${oportunidades.length} lead${oportunidades.length === 1 ? "" : "s"} com valor atribuído`, rows: oportunidades, columns: leadColumns },
    vendas: { title: "Vendas", subtitle: `${vendas.length} negócio${vendas.length === 1 ? "" : "s"} fechado${vendas.length === 1 ? "" : "s"}`, rows: vendas, columns: leadColumns },
    receita: { title: "Receita", subtitle: `${contratosAtivos.length} contrato${contratosAtivos.length === 1 ? "" : "s"} ativo${contratosAtivos.length === 1 ? "" : "s"} · ${formatCurrency(faturamentoContratado)}`, rows: contratosAtivos, columns: contractColumnsTotal },
    retencao: { title: "Retenção (MRR)", subtitle: `${contratosAtivos.length} contrato${contratosAtivos.length === 1 ? "" : "s"} ativo${contratosAtivos.length === 1 ? "" : "s"} · ${formatCurrency(totalRevenue)}/mês`, rows: contratosAtivos, columns: contractColumnsMrr },
    emRisco: { title: "Em Risco", subtitle: `${contratosEmRisco.length} contrato${contratosEmRisco.length === 1 ? "" : "s"} inadimplente${contratosEmRisco.length === 1 ? "" : "s"}`, rows: contratosEmRisco, columns: contractColumnsMrr },
  };

  const canais = useMemo(() => det.canais
    ? det.canais.map((c: any) => ({ origem: c.origem, leads: 0, fechados: 1, vendas: null as number | null, conversao: Number(c.conversao) || 0, receita: Number(c.receita) || 0, ticketMedio: 0 }))
    : computeChannelRevenue(leads).map((c) => ({ ...c, vendas: c.fechados as number | null })), [leads, det.canais]);
  const produtos = useMemo(() => {
    if (!det.produtos) return computeProductRevenue(proposals, proposalItems, products);
    const tot = det.produtos.reduce((t: number, p: any) => t + (Number(p.receita) || 0), 0) || 1;
    return det.produtos.map((p: any) => ({ produto: p.produto, receita: Number(p.receita) || 0, margem: p.margem === null || p.margem === undefined ? null : Number(p.margem), pct: Math.round(((Number(p.receita) || 0) / tot) * 1000) / 10 }));
  }, [proposals, proposalItems, products, det.produtos]);
  const segmentos = useMemo(() => {
    const base = det.segmentos
      ? (() => { const tot = det.segmentos.reduce((t: number, x: any) => t + (Number(x.receita) || 0), 0) || 1; return det.segmentos.map((x: any) => ({ segmento: x.segmento, receita: Number(x.receita) || 0, pct: Math.round(((Number(x.receita) || 0) / tot) * 1000) / 10 })); })()
      : computeSegmentRevenue(contracts, clienteBase);
    return base.map((s, i) => ({ ...s, color: SEGMENT_PALETTE[i % SEGMENT_PALETTE.length] }));
  }, [contracts, clienteBase, det.segmentos]);
  const segmentoTotal = segmentos.reduce((s, v) => s + v.receita, 0);

  const insights = useMemo(() => {
    const lista: { icon: typeof Radio; texto: string }[] = [];
    const canalTopTicket = [...canais].filter((c) => c.fechados > 0).sort((a, b) => b.ticketMedio - a.ticketMedio)[0];
    const ticketMedioGeral = canais.reduce((s, c) => s + c.receita, 0) / Math.max(canais.reduce((s, c) => s + c.fechados, 0), 1);
    if (canalTopTicket && ticketMedioGeral > 0 && canalTopTicket.ticketMedio > ticketMedioGeral) {
      lista.push({ icon: Radio, texto: `Leads de ${canalTopTicket.origem} têm ticket médio ${(canalTopTicket.ticketMedio / ticketMedioGeral).toFixed(1)}× maior que a média.` });
    }
    const segmentoTop = segmentos[0];
    if (segmentoTop && segmentos.length > 1) {
      lista.push({ icon: Globe2, texto: `O segmento ${segmentoTop.segmento} responde por ${segmentoTop.pct}% da receita recorrente ativa.` });
    }
    const produtoTop = produtos[0];
    if (produtoTop) {
      lista.push({ icon: Package, texto: `${produtoTop.produto} é o produto/serviço que mais gera receita (${produtoTop.pct}% do total vendido).` });
    }
    const vendedorTop = salesRanking[0];
    if (vendedorTop) {
      lista.push({ icon: Trophy, texto: `${vendedorTop.name} lidera o ranking de vendas, com ${formatCurrency(vendedorTop.total)} em negócios fechados.` });
    }
    return lista.slice(0, 4);
  }, [canais, segmentos, produtos, salesRanking, formatCurrency]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 w-full md:w-auto overflow-x-auto scrollbar-none bg-[var(--color-surface-sunken)] p-1.5 md:p-1 rounded-2xl md:rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
          {SUB_ABAS.map((a) => (
            <button
              key={a.id}
              onClick={() => setSubAba(a.id)}
              className={`flex-1 md:flex-none whitespace-nowrap px-3 py-2.5 md:py-1.5 text-xs md:text-[11px] font-bold rounded-xl md:rounded-lg transition-all ${subAba === a.id ? "bg-[var(--color-primary-blue)] !text-[#fff]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <DateRangeFilter dateFrom={dashboard.dateFrom} setDateFrom={dashboard.setDateFrom} dateTo={dashboard.dateTo} setDateTo={dashboard.setDateTo} />
      </div>

      {/* Fluxo da Receita — mesmos cards (StatCard) soltos da aba Previsão & Decisão, sem caixa em volta. */}
      <div className="space-y-3">
        <SectionTitle>Fluxo da Receita</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
          {fluxo.map((f) => (
            <StatCard key={f.label} icon={f.icon} label={f.label} value={f.value} sub={f.sub} caption={periodo} color={f.color} onClick={() => setDrillKey(f.key)} className="h-full" />
          ))}
        </div>
      </div>

      {subAba === "canais" ? (
        <CanaisPanel dashboard={dashboard} />
      ) : subAba === "produtos" ? (
        <ProdutosPanel dashboard={dashboard} />
      ) : subAba === "segmentos" ? (
        <SegmentosPanel dashboard={dashboard} />
      ) : (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="overflow-hidden shadow-sm">
          <div className="p-4 border-b border-[var(--color-border-subtle)]">
            <SectionTitle>Receita por Canal de Origem <HelpTip label="Sobre Receita por Canal de Origem">Mostra de qual canal vem a sua receita. Os canais no topo da lista são os que mais trazem dinheiro: é neles que costuma valer investir mais.</HelpTip></SectionTitle>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                <tr><th className="px-2.5 md:px-4 py-2">Canal</th><th className="px-2.5 md:px-4 py-2">Receita</th><th className="px-2.5 md:px-4 py-2">Vendas</th><th className="px-2.5 md:px-4 py-2">Conv.</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {canais.map((c) => (
                  <tr key={c.origem}>
                    <td className="px-2.5 md:px-4 py-2 font-bold text-[var(--color-text-primary)] truncate-desktop md:max-w-[110px]">{c.origem}</td>
                    <td className="px-2.5 md:px-4 py-2 font-mono text-[var(--color-text-primary)]">{formatCurrency(c.receita)}</td>
                    <td className="px-2.5 md:px-4 py-2 text-[var(--color-text-muted)]">{c.vendas ?? "—"}</td>
                    <td className="px-2.5 md:px-4 py-2 text-[var(--color-text-muted)]">{c.conversao}%</td>
                  </tr>
                ))}
                {canais.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-[var(--color-text-faint)]">Sem leads ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden shadow-sm">
          <div className="p-4 border-b border-[var(--color-border-subtle)]">
            <SectionTitle>Receita por Produto/Serviço <HelpTip label="Sobre Receita por Produto/Serviço">Mostra quais produtos ou serviços geram mais receita. Os primeiros da lista são os que mais sustentam o seu faturamento.</HelpTip></SectionTitle>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                <tr><th className="px-2.5 md:px-4 py-2">Produto</th><th className="px-2.5 md:px-4 py-2">Receita</th><th className="px-2.5 md:px-4 py-2">Margem</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {produtos.map((p) => (
                  <tr key={p.produto}>
                    <td className="px-2.5 md:px-4 py-2 font-bold text-[var(--color-text-primary)] truncate-desktop md:max-w-[110px]">{p.produto}</td>
                    <td className="px-2.5 md:px-4 py-2 font-mono text-[var(--color-text-primary)]">{formatCurrency(p.receita)}</td>
                    <td className="px-2.5 md:px-4 py-2 text-[var(--color-text-muted)]">{p.margem !== null ? `${p.margem}%` : "—"}</td>
                  </tr>
                ))}
                {produtos.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-[var(--color-text-faint)]">Nenhuma proposta aceita com itens ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5 flex flex-col shadow-sm">
          <SectionTitle className="mb-1">Receita por Segmento <HelpTip label="Sobre Receita por Segmento">Mostra em quais segmentos (categorias dos seus produtos e serviços) a empresa mais ganha. Ajuda a decidir onde focar a venda.</HelpTip></SectionTitle>
          {segmentos.length === 0 ? (
            <p className="text-xs text-[var(--color-text-faint)] italic flex-1 flex items-center justify-center">Sem contratos ativos ainda</p>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="relative h-[110px] w-[110px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={segmentos} cx="50%" cy="50%" innerRadius={34} outerRadius={52} paddingAngle={3} dataKey="receita" stroke="none">
                      {segmentos.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 11 }} formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[11px] font-black text-[var(--color-text-primary)] font-mono">{formatCurrency(segmentoTotal)}</span>
                </div>
              </div>
              <div className="w-full space-y-1.5">
                {segmentos.slice(0, 5).map((s) => (
                  <div key={s.segmento} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-[10px] text-[var(--color-text-muted)] font-semibold truncate flex-1">{s.segmento}</span>
                    <span className="text-[10px] font-bold text-[var(--color-text-primary)] tabular-nums">{s.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-5 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
            <SectionTitle>Receita por Vendedor</SectionTitle>
            <Badge variant="secondary">{salesRanking.length}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                <tr><th className="px-2.5 md:px-4 py-2.5">Vendedor</th><th className="px-2.5 md:px-4 py-2.5">Receita</th><th className="px-2.5 md:px-4 py-2.5">Negócios</th><th className="px-2.5 md:px-4 py-2.5">Taxa</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {salesRanking.map((v) => (
                  <tr key={v.name}>
                    <td className="px-2.5 md:px-4 py-2.5 font-bold text-[var(--color-text-primary)] truncate-desktop md:max-w-[140px]">{v.name}</td>
                    <td className="px-2.5 md:px-4 py-2.5 font-mono text-[var(--color-text-primary)]">{formatCurrency(v.total)}</td>
                    <td className="px-2.5 md:px-4 py-2.5 text-[var(--color-text-muted)]">{v.deals}</td>
                    <td className="px-2.5 md:px-4 py-2.5 text-[var(--color-text-muted)]">{v.rate}%</td>
                  </tr>
                ))}
                {salesRanking.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-[var(--color-text-faint)]">Nenhum negócio fechado ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="lg:col-span-4 p-5 shadow-sm">
          <SectionTitle className="mb-4"><Workflow className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Oportunidades por Etapa</SectionTitle>
          <div className="space-y-2.5">
            {funnelData.map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--color-text-muted)] font-semibold w-24 truncate shrink-0">{s.label}</span>
                <div className="flex-1 h-2 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${s.color}`} style={{ width: `${Math.max(2, Math.min(100, (s.value / (funnelData[0]?.value || 1)) * 100))}%` }} />
                </div>
                <span className="text-[10px] font-bold text-[var(--color-text-primary)] tabular-nums w-7 text-right shrink-0">{s.value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-3 p-5 bg-gradient-to-br from-[var(--color-primary-blue)] to-[var(--color-primary-blue)]/70 border-none text-[#fff]">
          <div className="flex items-center gap-2 mb-3"><Sparkles className="w-4 h-4" /><h3 className="text-xs font-black uppercase tracking-wider">Insights da Aurora</h3></div>
          {insights.length === 0 ? (
            <p className="text-xs text-[#fff]/70 italic">Ainda não há dado suficiente pra identificar padrões.</p>
          ) : (
            <div className="space-y-2.5">
              {insights.map((ins, i) => (
                <div key={i} className="flex items-start gap-2.5 bg-[rgba(255,255,255,0.1)] rounded-xl px-3.5 py-2.5">
                  <ins.icon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#fff]/80" />
                  <p className="text-xs leading-relaxed">{ins.texto}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      </>
      )}

      <DrillDownPanel
        isOpen={drillKey !== null}
        onClose={() => setDrillKey(null)}
        title={drillKey ? drillConfig[drillKey].title : undefined}
        subtitle={drillKey ? drillConfig[drillKey].subtitle : undefined}
        rows={drillKey ? drillConfig[drillKey].rows : []}
        columns={drillKey ? drillConfig[drillKey].columns : []}
      />
    </div>
  );
}
