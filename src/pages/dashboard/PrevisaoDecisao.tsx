import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, Target, AlertTriangle, Gauge, Flame, Sparkles, UserX, FileWarning,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { parseCurrencyBR } from "../../lib/utils";
import { useDashboard } from "./useDashboard";
import { RevenueBreadcrumb } from "./components/RevenueBreadcrumb";
import { computeProductRevenue, buildAuroraAcoes, type AuroraAcaoIcon } from "./revenueInsights";

const AURORA_ICONS: Record<AuroraAcaoIcon, typeof Flame> = { flame: Flame, sparkles: Sparkles, userx: UserX, filewarning: FileWarning };

export default function PrevisaoDecisao() {
  const { contracts, proposals, proposalItems, products, squads } = useData();
  const { leads, totalRevenue, faturamentoContratado, dateFrom, setDateFrom, dateTo, setDateTo } = useDashboard();
  const { formatCurrency } = useLocalization();
  const navigate = useNavigate();

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
    { label: "Cenário Conservador", valor: totalRevenue + pipelinePonderado * 0.6 },
    { label: "Cenário Base", valor: previsao90dias },
    { label: "Cenário Otimista", valor: totalRevenue + pipelineTotal * 0.6 },
  ];

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

  return (
    <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <RevenueBreadcrumb current="Previsão & Decisão" />
          <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] mt-1 flex items-center gap-2">
            Previsão & Decisão <span className="w-2 h-2 rounded-full bg-[var(--color-primary-blue)]" />
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Veja o que provavelmente vai acontecer, os riscos, as oportunidades e o que fazer agora.</p>
        </div>
        <DateRangeFilter dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
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
          <p className="text-[10px] text-[var(--color-text-muted)] mb-4">Simulação baseada no pipeline atual e na probabilidade (Score IA) de cada oportunidade.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {cenarios.map((c) => (
              <div key={c.label} className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">{c.label}</p>
                <p className="text-lg font-black text-[var(--color-text-primary)] font-mono mt-1">{formatCurrency(c.valor)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-5 p-5 bg-gradient-to-br from-[var(--color-primary-blue)] to-[var(--color-primary-blue)]/70 border-none text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Sparkles className="w-4 h-4" /><h3 className="text-xs font-black uppercase tracking-wider">Aurora Recomenda</h3></div>
            <Badge variant="secondary" className="!bg-white/15 !text-white !border-white/20">{auroraAcoes.length}</Badge>
          </div>
          {auroraAcoes.length === 0 ? (
            <p className="text-xs text-white/70 italic">Nenhum sinal prioritário agora.</p>
          ) : (
            <div className="space-y-2">
              {auroraAcoes.map((a, i) => {
                const Icon = AURORA_ICONS[a.icon];
                return (
                  <div key={i} className="flex items-center gap-2.5 bg-white/10 rounded-xl px-3.5 py-2.5">
                    <Icon className="w-3.5 h-3.5 shrink-0 text-white/80" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold truncate">{a.titulo}</p>
                      <span className="text-[10px] text-white/70">{formatCurrency(a.valor)}</span>
                    </div>
                    <Button size="sm" onClick={() => navigate(a.target)} className="shrink-0 h-6 px-2 text-[9px] font-bold !bg-white !text-[var(--color-primary-blue)] hover:!brightness-95">Executar</Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
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

        <Card className="overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
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
