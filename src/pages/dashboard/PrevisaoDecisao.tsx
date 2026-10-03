import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  TrendingUp, Target, AlertTriangle, Gauge, Flame, Sparkles, UserX, FileWarning, SlidersHorizontal,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { parseCurrencyBR } from "../../lib/utils";
import { computeProductRevenue, buildAuroraAcoes, type AuroraAcaoIcon, type DashboardData } from "./revenueInsights";

const AURORA_ICONS: Record<AuroraAcaoIcon, typeof Flame> = { flame: Flame, sparkles: Sparkles, userx: UserX, filewarning: FileWarning };
const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function PrevisaoDecisao({ dashboard }: { dashboard: DashboardData }) {
  const { contracts, proposals, proposalItems, products, squads } = useData();
  const { leads, totalRevenue, faturamentoContratado, performanceData } = dashboard;
  const { formatCurrency } = useLocalization();
  const navigate = useNavigate();
  const [simConversao, setSimConversao] = useState(10);
  const [simRecuperar, setSimRecuperar] = useState(5);
  const [simNovosLeads, setSimNovosLeads] = useState(50);

  const leadsAbertos = useMemo(() => (leads as any[]).filter((l) => l.status !== "Fechado" && l.status !== "Perdido"), [leads]);
  const vendas = useMemo(() => (leads as any[]).filter((l) => l.status === "Fechado"), [leads]);
  const contratosEmRisco = useMemo(() => (contracts as any[]).filter((c) => c.status === "Inadimplente"), [contracts]);
  const receitaEmRisco = contratosEmRisco.reduce((s, c) => s + parseCurrencyBR(c.mrr), 0);
  const oportunidadesRecuperaveis = useMemo(
    () => leadsAbertos.filter((l: any) => (l.scoreIA ?? 0) > 70 && (Number(l.timeIdle) || 0) > 3 && parseCurrencyBR(l.value) > 0),
    [leadsAbertos]
  );
  const recuperavelValue = oportunidadesRecuperaveis.reduce((s: number, l: any) => s + parseCurrencyBR(l.value), 0);
  const propostasSemFollowUp = useMemo(() => (proposals as any[] || []).filter((p) => p.status === "Enviada"), [proposals]);
  const propostasSemFollowUpValue = propostasSemFollowUp.reduce((s, p) => s + parseCurrencyBR(p.valor), 0);

  const pipelineTotal = leadsAbertos.reduce((s: number, l: any) => s + parseCurrencyBR(l.value), 0);
  const pipelinePonderado = leadsAbertos.reduce((s: number, l: any) => s + parseCurrencyBR(l.value) * ((l.scoreIA ?? 0) / 100), 0);
  const previsao90dias = totalRevenue + pipelinePonderado;

  const squadsComMeta = (squads as any[]).filter((sq) => Number(sq.meta) > 0);
  const totalMeta = squadsComMeta.reduce((s, sq) => s + Number(sq.meta), 0);
  const totalAlcancado = squadsComMeta.reduce((s, sq) => s + Number(sq.faturamentoAlcancado || 0), 0);
  const probMeta = totalMeta > 0 ? Math.min(100, Math.round((totalAlcancado / totalMeta) * 1000) / 10) : null;

  const cenarios = [
    { label: "Cenário Conservador", valor: totalRevenue + pipelinePonderado * 0.6, cor: "#ef4444" },
    { label: "Cenário Base", valor: previsao90dias, cor: "var(--color-primary-blue)" },
    { label: "Cenário Otimista", valor: totalRevenue + pipelineTotal * 0.6, cor: "#10b981" },
  ];

  // Extensão real do histórico (últimos 3 meses de receita, já calculados em
  // useDashboard) + 3 meses projetados interpolando até cada cenário acima —
  // é uma simulação (rotulada como tal), não uma previsão de IA.
  const cenariosChartData = useMemo(() => {
    const hist = (performanceData || []).slice(-3);
    if (hist.length === 0) return [];
    const lastValue = hist[hist.length - 1]?.vendas || totalRevenue;
    const now = new Date();
    const base = hist.map((h: any) => ({ name: h.name, conservador: h.vendas, base: h.vendas, otimista: h.vendas }));
    const proj = [1, 2, 3].map((i) => {
      const t = i / 3;
      return {
        name: MONTH_NAMES[(now.getMonth() + i) % 12],
        conservador: Math.round(lastValue + (cenarios[0].valor - lastValue) * t),
        base: Math.round(lastValue + (cenarios[1].valor - lastValue) * t),
        otimista: Math.round(lastValue + (cenarios[2].valor - lastValue) * t),
      };
    });
    return [...base, ...proj];
  }, [performanceData, cenarios, totalRevenue]);

  const auroraAcoes = useMemo(() => buildAuroraAcoes({
    leadsAbertos, oportunidadesRecuperaveis, recuperavelValue, contratosEmRisco, propostasSemFollowUp, propostasSemFollowUpValue,
  }), [leadsAbertos, oportunidadesRecuperaveis, recuperavelValue, contratosEmRisco, propostasSemFollowUp, propostasSemFollowUpValue]);

  const topFechamento = useMemo(
    () => [...leadsAbertos].sort((a: any, b: any) => (b.scoreIA ?? 0) - (a.scoreIA ?? 0)).slice(0, 6),
    [leadsAbertos]
  );

  const produtos = useMemo(() => computeProductRevenue(proposals, proposalItems, products), [proposals, proposalItems, products]);

  const propostasEnviadasTotal = (proposals as any[] || []).length;
  const propostasAceitas = (proposals as any[] || []).filter((p) => p.status === "Aceita").length;
  const taxaConversaoPropostas = propostasEnviadasTotal > 0 ? Math.round((propostasAceitas / propostasEnviadasTotal) * 1000) / 10 : 0;
  const leadsQualificados = leadsAbertos.filter((l: any) => (l.scoreIA ?? 0) > 60).length;
  const ticketMedioFechado = vendas.length > 0 ? faturamentoContratado / vendas.length : 0;
  const oportunidadesParadas = leadsAbertos.filter((l: any) => (Number(l.timeIdle) || 0) > 30).length;

  const indicadores = [
    { label: "Taxa de conversão (Proposta → Fechamento)", valor: `${taxaConversaoPropostas}%` },
    { label: "Leads qualificados ativos (Score IA > 60)", valor: String(leadsQualificados) },
    { label: "Ticket médio dos negócios fechados", valor: formatCurrency(ticketMedioFechado) },
    { label: "Oportunidades paradas (+30 dias)", valor: String(oportunidadesParadas) },
  ];

  // Simulador: cada slider aplica uma fórmula real sobre os números já
  // calculados acima (ticket médio real, taxa de conversão real de
  // propostas) — não é uma projeção de IA, é aritmética transparente sobre
  // dado real, pra servir de "e se" interativo.
  const resultadoSimulado = previsao90dias
    + previsao90dias * (simConversao / 100)
    + simRecuperar * ticketMedioFechado
    + simNovosLeads * (taxaConversaoPropostas / 100) * ticketMedioFechado;
  const impactoSimulado = previsao90dias > 0 ? Math.round(((resultadoSimulado - previsao90dias) / previsao90dias) * 1000) / 10 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-[var(--color-text-primary)]">Previsão & Decisão</h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Veja o que provavelmente vai acontecer, os riscos, as oportunidades e o que fazer agora.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 text-[var(--color-text-faint)]"><TrendingUp className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider">Previsão de Receita (90d)</span></div>
          <p className="text-2xl font-black text-[var(--color-text-primary)] font-mono mt-2">{formatCurrency(previsao90dias)}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] font-bold mt-1">Cenário base</p>
        </Card>
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 text-[var(--color-text-faint)]"><Target className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider">Pipeline Ponderado</span></div>
          <p className="text-2xl font-black text-[var(--color-text-primary)] font-mono mt-2">{formatCurrency(pipelinePonderado)}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] font-bold mt-1">{leadsAbertos.length} oportunidade{leadsAbertos.length === 1 ? "" : "s"}</p>
        </Card>
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 text-[var(--color-text-faint)]"><Gauge className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider">Probabilidade de Atingir Meta</span></div>
          <p className="text-2xl font-black text-[var(--color-text-primary)] font-mono mt-2">{probMeta !== null ? `${probMeta}%` : "—"}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] font-bold mt-1">{totalMeta > 0 ? `Meta ${formatCurrency(totalMeta)}` : "Sem meta configurada"}</p>
        </Card>
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-danger/20">
          <div className="flex items-center gap-2 text-danger"><AlertTriangle className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider">Risco de Queda</span></div>
          <p className="text-2xl font-black text-danger font-mono mt-2">{formatCurrency(receitaEmRisco)}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] font-bold mt-1">{contratosEmRisco.length} contrato{contratosEmRisco.length === 1 ? "" : "s"} inadimplente{contratosEmRisco.length === 1 ? "" : "s"}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-7 p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-1">Cenários de Receita</h3>
          <p className="text-[10px] text-[var(--color-text-muted)] mb-3">Simulação a partir da tendência real dos últimos meses + pipeline ponderado por Score IA.</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {cenarios.map((c) => (
              <div key={c.label} className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] px-2.5 py-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.cor }} />
                <span className="text-[10px] font-bold text-[var(--color-text-muted)]">{c.label}</span>
                <span className="text-[10px] font-black font-mono text-[var(--color-text-primary)]">{formatCurrency(c.valor)}</span>
              </div>
            ))}
          </div>
          {cenariosChartData.length === 0 ? (
            <p className="text-xs text-[var(--color-text-faint)] italic py-8 text-center">Histórico insuficiente pra simular cenários ainda.</p>
          ) : (
            <div className="h-[200px] w-full -mx-2">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
                <LineChart data={cenariosChartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--color-text-faint)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-text-faint)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCurrency(v)} width={70} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 11 }}
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  />
                  <Line type="monotone" dataKey="otimista" name="Otimista" stroke={cenarios[2].cor} strokeWidth={2} dot={false} strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="base" name="Base" stroke={cenarios[1].cor as string} strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="conservador" name="Conservador" stroke={cenarios[0].cor} strokeWidth={2} dot={false} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-5 p-5 bg-gradient-to-br from-[var(--color-primary-blue)] to-[var(--color-primary-blue)]/70 border-none text-[#fff]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Sparkles className="w-4 h-4" /><h3 className="text-xs font-black uppercase tracking-wider">Aurora Recomenda</h3></div>
            <Badge variant="secondary" className="!bg-[rgba(255,255,255,0.15)] !text-[#fff] !border-[rgba(255,255,255,0.2)]">{auroraAcoes.length}</Badge>
          </div>
          {auroraAcoes.length === 0 ? (
            <p className="text-xs text-[#fff]/70 italic">Nenhum sinal prioritário agora.</p>
          ) : (
            <div className="space-y-2">
              {auroraAcoes.map((a, i) => {
                const Icon = AURORA_ICONS[a.icon];
                return (
                  <div key={i} className="flex items-center gap-2.5 bg-[rgba(255,255,255,0.1)] rounded-xl px-3.5 py-2.5">
                    <Icon className="w-3.5 h-3.5 shrink-0 text-[#fff]/80" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold truncate">{a.titulo}</p>
                      <span className="text-[10px] text-[#fff]/70">{formatCurrency(a.valor)}</span>
                    </div>
                    <Button size="sm" onClick={() => navigate(a.target)} className="shrink-0 h-6 px-2 text-[9px] font-bold !bg-white !text-[var(--color-primary-blue)] hover:!brightness-95">Executar</Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-4 overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="p-4 border-b border-[var(--color-border-subtle)]"><h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider">Maior Probabilidade de Fechamento</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                <tr><th className="px-4 py-2">Cliente</th><th className="px-4 py-2">Valor</th><th className="px-4 py-2">Prob.</th><th className="px-4 py-2" /></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {topFechamento.map((l: any) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2 font-bold text-[var(--color-text-primary)] truncate max-w-[110px]">{l.company || l.name}</td>
                    <td className="px-4 py-2 font-mono text-[var(--color-text-primary)]">{formatCurrency(parseCurrencyBR(l.value))}</td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{l.scoreIA ?? 0}%</td>
                    <td className="px-4 py-2"><Button size="sm" variant="outline" onClick={() => navigate(`/app/crm/pipeline?leadId=${l.id}`)} className="h-6 px-2 text-[9px] font-bold">Priorizar</Button></td>
                  </tr>
                ))}
                {topFechamento.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-[var(--color-text-faint)]">Sem oportunidades abertas.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="lg:col-span-4 overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="p-4 border-b border-[var(--color-border-subtle)]"><h3 className="text-xs font-black text-danger uppercase tracking-wider">Riscos Previstos</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                <tr><th className="px-4 py-2">Cliente</th><th className="px-4 py-2">Valor</th><th className="px-4 py-2">Motivo</th><th className="px-4 py-2" /></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {contratosEmRisco.map((c: any) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2 font-bold text-[var(--color-text-primary)] truncate max-w-[110px]">{c.client}</td>
                    <td className="px-4 py-2 font-mono text-[var(--color-text-primary)]">{formatCurrency(parseCurrencyBR(c.mrr))}</td>
                    <td className="px-4 py-2"><Badge variant="destructive">Inadimplente</Badge></td>
                    <td className="px-4 py-2"><Button size="sm" variant="outline" onClick={() => navigate("/app/financeiro/contratos")} className="h-6 px-2 text-[9px] font-bold">Ver</Button></td>
                  </tr>
                ))}
                {contratosEmRisco.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-[var(--color-text-faint)]">Nenhum contrato em risco agora.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="lg:col-span-4 p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-1 flex items-center gap-1.5"><SlidersHorizontal className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Simulador de Decisão</h3>
          <p className="text-[10px] text-[var(--color-text-muted)] mb-4">Veja o impacto de diferentes ações na sua receita.</p>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">Aumentar taxa de conversão em</span>
                <span className="text-[11px] font-black text-[var(--color-text-primary)] font-mono">{simConversao}%</span>
              </div>
              <input type="range" min={0} max={30} value={simConversao} onChange={(e) => setSimConversao(Number(e.target.value))} className="w-full accent-[var(--color-primary-blue)]" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">Recuperar oportunidades perdidas</span>
                <span className="text-[11px] font-black text-[var(--color-text-primary)] font-mono">{simRecuperar}</span>
              </div>
              <input type="range" min={0} max={20} value={simRecuperar} onChange={(e) => setSimRecuperar(Number(e.target.value))} className="w-full accent-[var(--color-primary-blue)]" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">Adicionar novos leads mensais</span>
                <span className="text-[11px] font-black text-[var(--color-text-primary)] font-mono">{simNovosLeads}</span>
              </div>
              <input type="range" min={0} max={200} step={10} value={simNovosLeads} onChange={(e) => setSimNovosLeads(Number(e.target.value))} className="w-full accent-[var(--color-primary-blue)]" />
            </div>
            <div className="rounded-xl bg-[var(--color-surface-sunken)] p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase text-[var(--color-text-faint)]">Resultado projetado</p>
                <p className="text-sm font-black text-[var(--color-text-primary)] font-mono">{formatCurrency(resultadoSimulado)}</p>
              </div>
              <span className={`text-xs font-black font-mono ${impactoSimulado >= 0 ? "text-success" : "text-danger"}`}>{impactoSimulado >= 0 ? "+" : ""}{impactoSimulado}%</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-4 p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-4">Indicadores que mais Afetam sua Receita</h3>
          <div className="space-y-2.5">
            {indicadores.map((ind) => (
              <div key={ind.label} className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--color-text-muted)] font-semibold">{ind.label}</span>
                <span className="text-xs font-black font-mono text-[var(--color-text-primary)] shrink-0">{ind.valor}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-4 overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="p-4 border-b border-[var(--color-border-subtle)]"><h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider">Receita por Produto/Serviço</h3></div>
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {produtos.slice(0, 5).map((p) => (
              <div key={p.produto} className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
                <span className="text-[var(--color-text-muted)] truncate font-semibold">{p.produto}</span>
                <span className="font-mono font-bold text-[var(--color-text-primary)] shrink-0">{formatCurrency(p.receita)}</span>
                <span className="text-[10px] text-[var(--color-text-faint)] shrink-0 w-10 text-right">{p.pct}%</span>
              </div>
            ))}
            {produtos.length === 0 && <p className="px-4 py-8 text-center text-[var(--color-text-faint)] text-xs">Sem propostas aceitas ainda.</p>}
          </div>
        </Card>

        <Card className="lg:col-span-4 p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-4">Metas e Performance</h3>
          {squadsComMeta.length === 0 ? (
            <p className="text-xs text-[var(--color-text-faint)] italic">Nenhuma meta de squad configurada.</p>
          ) : (
            <div className="space-y-3">
              {squadsComMeta.slice(0, 5).map((sq: any) => {
                const pct = Math.min(100, Math.round(((sq.faturamentoAlcancado || 0) / sq.meta) * 100));
                return (
                  <div key={sq.id || sq.nome}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-[var(--color-text-primary)] truncate">{sq.nome}</span>
                      <span className="text-[10px] font-bold text-[var(--color-text-muted)]">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--color-primary-blue)] rounded-full" style={{ width: `${Math.max(2, pct)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
