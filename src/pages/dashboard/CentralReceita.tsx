import { useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, Area, Line,
  PieChart, Pie, Cell,
} from "recharts";
import {
  DollarSign, Workflow, AlertTriangle, RefreshCw, Sparkles, TrendingUp, TrendingDown,
  Flame, FileWarning, UserX, PieChart as PieChartIcon, Map as MapIcon, Target, Brain, LineChart,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { parseCurrencyBR } from "../../lib/utils";
import { useDashboard } from "./useDashboard";
import { DashboardActionsTabs } from "./components/DashboardActionsTabs";
import { DashboardTabContent } from "./components/DashboardTabContent";
import { DashboardGoalAlerts } from "./components/DashboardGoalAlerts";
import {
  diasDesde, situacaoDe, recomendacaoDe, computeVazamentos, buildAuroraAcoes,
  type AuroraAcaoIcon,
} from "./revenueInsights";

// Paleta neutra pro donut de origem (um por fatia) — a ÚNICA cor "de marca"
// é a primeira (a fatia maior, mesma regra já usada nos outros gráficos
// categóricos desta sessão: destaque só na série mais importante).
const ORIGEM_PALETTE = [
  "var(--color-primary-blue)", "var(--color-text-muted)", "#14b8a6", "#f59e0b", "#64748b", "#94a3b8",
];

const AURORA_ICONS: Record<AuroraAcaoIcon, typeof Flame> = { flame: Flame, sparkles: Sparkles, userx: UserX, filewarning: FileWarning };

export default function CentralReceita() {
  const { user } = useAuth();
  const { proposals } = useData();
  const {
    leads, contracts, performanceData, funnelData, serverSummary,
    activeTab, setActiveTab, squads, recentActivities, salesRanking, goalAlerts,
    dateFrom, setDateFrom, dateTo, setDateTo,
  } = useDashboard();
  const { formatCurrency } = useLocalization();
  const navigate = useNavigate();

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const primeiroNome = (user?.name || "").split(" ")[0] || "";

  const leadsAbertos = useMemo(() => leads.filter((l: any) => l.status !== "Fechado" && l.status !== "Perdido"), [leads]);
  const pipelineValue = serverSummary?.valorPipelineAberto ?? leadsAbertos.reduce((s: number, l: any) => s + parseCurrencyBR(l.value), 0);
  const pipelineCount = leadsAbertos.length;

  const contratosEmRisco = useMemo(() => (contracts as any[]).filter((c) => c.status === "Inadimplente"), [contracts]);
  const receitaEmRisco = serverSummary?.mrrEmRisco ?? contratosEmRisco.reduce((s, c) => s + parseCurrencyBR(c.mrr), 0);
  const receitaEmRiscoCount = serverSummary?.contractsEmRiscoCount ?? contratosEmRisco.length;

  // "Recuperável" = aberto, com sinal de intenção real (score alto) mas parado
  // há alguns dias — oposto de "abandonado de vez" (esse é o estagnado/perdido).
  const oportunidadesRecuperaveis = useMemo(
    () => leadsAbertos.filter((l: any) => (l.scoreIA ?? 0) > 70 && (Number(l.timeIdle) || 0) > 3 && parseCurrencyBR(l.value) > 0),
    [leadsAbertos]
  );
  const recuperavelValue = oportunidadesRecuperaveis.reduce((s: number, l: any) => s + parseCurrencyBR(l.value), 0);

  const trendPct = (key: "vendas" | "leads"): number | null => {
    if (!performanceData || performanceData.length < 2) return null;
    const last = performanceData[performanceData.length - 1]?.[key] ?? 0;
    const prev = performanceData[performanceData.length - 2]?.[key] ?? 0;
    if (!prev) return null;
    return Math.round(((last - prev) / prev) * 1000) / 10;
  };

  const propostasSemFollowUp = useMemo(
    () => (proposals as any[] || []).filter((p) => p.status === "Enviada" && diasDesde(p.created_at) > 5),
    [proposals]
  );
  const propostasSemFollowUpValue = propostasSemFollowUp.reduce((s, p) => s + parseCurrencyBR(p.valor), 0);

  const leadsQuentesParados = useMemo(
    () => leadsAbertos.filter((l: any) => (l.scoreIA ?? 0) > 70 && (Number(l.timeIdle) || 0) > 2),
    [leadsAbertos]
  );

  const oportunidadesParadas = useMemo(
    () => leadsAbertos.filter((l: any) => (Number(l.timeIdle) || 0) > 30),
    [leadsAbertos]
  );

  // ── Aurora: ações priorizadas por impacto real em R$ (regra, não IA ao vivo) ──
  const auroraAcoes = useMemo(() => buildAuroraAcoes({
    leadsAbertos, oportunidadesRecuperaveis, recuperavelValue, contratosEmRisco, propostasSemFollowUp, propostasSemFollowUpValue,
  }), [leadsAbertos, oportunidadesRecuperaveis, recuperavelValue, contratosEmRisco, propostasSemFollowUp, propostasSemFollowUpValue]);

  const impactoTotal = auroraAcoes.reduce((s, a) => s + a.valor, 0);

  // ── Origem dos leads (donut) ─────────────────────────────────────────────
  const origemSlices = useMemo(() => {
    const map = new Map<string, number>();
    (leads as any[]).forEach((l) => { const src = l.source || "Outros"; map.set(src, (map.get(src) || 0) + 1); });
    const total = leads.length || 1;
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count], i) => ({ name, value: count, pct: Math.round((count / total) * 1000) / 10, color: ORIGEM_PALETTE[i % ORIGEM_PALETTE.length] }));
  }, [leads]);
  const origemTotal = leads.length;

  // ── Oportunidades prioritárias (tabela) ──────────────────────────────────
  const oportunidadesPrioritarias = useMemo(() => {
    return [...leadsAbertos]
      .map((l: any) => ({ ...l, _val: parseCurrencyBR(l.value), _score: l.scoreIA ?? 0 }))
      .filter((l) => l._val > 0)
      .sort((a, b) => b._val * b._score - a._val * a._score)
      .slice(0, 7);
  }, [leadsAbertos]);

  // ── Receita em risco, agrupada por motivo ────────────────────────────────
  const vazamentos = useMemo(() => computeVazamentos({
    contratosEmRisco, oportunidadesParadas, leadsQuentesParados, propostasSemFollowUp, propostasSemFollowUpValue,
  }), [contratosEmRisco, oportunidadesParadas, leadsQuentesParados, propostasSemFollowUpValue, propostasSemFollowUp]);

  const totalRevenue = serverSummary?.totalRevenue ?? 0;
  const vendasTrend = trendPct("vendas");

  return (
    <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-[var(--color-text-faint)] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary-blue)]" /> {saudacao}{primeiroNome ? `, ${primeiroNome}!` : "!"}
          </p>
          <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] mt-1 flex items-center gap-2">
            Central de Receita <span className="w-2 h-2 rounded-full bg-[var(--color-primary-blue)]" />
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Aqui está o panorama da sua receita, o que importa agora e as ações recomendadas pela Aurora.</p>
        </div>
        <DateRangeFilter dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
      </div>

      {/* Transita entre esta visão (nova) e as telas que já existiam (Comercial/
          Marketing/Retenção/BI, ver DashboardTabContent) — substituir o Dashboard
          não podia deixar essas 4 telas inalcançáveis. */}
      <DashboardActionsTabs activeTab={activeTab as any} onTabChange={setActiveTab as any} />

      <DashboardGoalAlerts goalAlerts={goalAlerts} />

      {activeTab !== "executivo" ? (
        <DashboardTabContent
          activeTab={activeTab as any}
          performanceData={performanceData}
          squads={squads}
          contracts={contracts}
          salesRanking={salesRanking}
          funnelData={funnelData}
          recentActivities={recentActivities}
          serverSummary={serverSummary}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      ) : (
      <>
      {/* Sub-navegação da Central de Receita (as outras 5 telas da suíte) —
          deliberadamente mais leve que DashboardActionsTabs acima (sem
          caixa/borda própria, só links inline) pra não parecer uma SEGUNDA
          fileira de abas do mesmo nível; ela é escopada a esta aba
          ("Central de Receita"), não uma irmã de Comercial/Marketing/etc. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 -mt-2">
        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">Explorar nesta seção</span>
        {[
          { to: "/app/dashboard/mapa-receita", label: "Mapa da Receita", icon: MapIcon },
          { to: "/app/dashboard/oportunidades", label: "Oportunidades", icon: Target },
          { to: "/app/dashboard/vazamentos", label: "Vazamentos de Receita", icon: AlertTriangle },
          { to: "/app/dashboard/aurora", label: "Inteligência Aurora", icon: Brain },
          { to: "/app/dashboard/previsao", label: "Previsão & Decisão", icon: LineChart },
        ].map((item, i, arr) => (
          <span key={item.to} className="flex items-center gap-3">
            <Link
              to={item.to}
              className="flex items-center gap-1 text-[11px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] transition-colors"
            >
              <item.icon className="w-3 h-3" /> {item.label}
            </Link>
            {i < arr.length - 1 && <span className="text-[var(--color-border-default)] text-[10px]">•</span>}
          </span>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 text-[var(--color-text-faint)]"><DollarSign className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider">Receita Realizada</span></div>
          <p className="text-2xl font-black text-[var(--color-text-primary)] font-mono mt-2">{formatCurrency(totalRevenue)}</p>
          {vendasTrend !== null && (
            <p className={`text-[11px] font-bold mt-1 flex items-center gap-1 ${vendasTrend >= 0 ? "text-success" : "text-danger"}`}>
              {vendasTrend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} {vendasTrend >= 0 ? "+" : ""}{vendasTrend}% vs período anterior
            </p>
          )}
        </Card>
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 text-[var(--color-text-faint)]"><Workflow className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider">Pipeline Total</span></div>
          <p className="text-2xl font-black text-[var(--color-text-primary)] font-mono mt-2">{formatCurrency(pipelineValue)}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] font-bold mt-1">{pipelineCount} oportunidade{pipelineCount === 1 ? "" : "s"}</p>
        </Card>
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-danger/20">
          <div className="flex items-center gap-2 text-danger"><AlertTriangle className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider">Receita em Risco</span></div>
          <p className="text-2xl font-black text-danger font-mono mt-2">{formatCurrency(receitaEmRisco)}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] font-bold mt-1">{receitaEmRiscoCount} contrato{receitaEmRiscoCount === 1 ? "" : "s"}</p>
        </Card>
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-success/20">
          <div className="flex items-center gap-2 text-success"><RefreshCw className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider">Oportunidades Recuperáveis</span></div>
          <p className="text-2xl font-black text-success font-mono mt-2">{formatCurrency(recuperavelValue)}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] font-bold mt-1">{oportunidadesRecuperaveis.length} oportunidade{oportunidadesRecuperaveis.length === 1 ? "" : "s"}</p>
        </Card>
      </div>

      {/* Aurora recomenda */}
      <Card className="p-6 bg-gradient-to-br from-[var(--color-primary-blue)] to-[var(--color-primary-blue)]/70 border-none text-white">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0"><Sparkles className="w-5 h-5" /></div>
            <div>
              <p className="text-sm font-black">Aurora recomenda hoje</p>
              <p className="text-xs text-white/80 max-w-xl">
                Encontrei {auroraAcoes.length} ação{auroraAcoes.length === 1 ? "" : "ões"} prioritária{auroraAcoes.length === 1 ? "" : "s"} que podem impactar sua receita em até {formatCurrency(impactoTotal)}.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => navigate("/app/dashboard/previsao")} className="shrink-0 h-7 px-3 text-[10px] font-bold !bg-white !text-[var(--color-primary-blue)] hover:!brightness-95">
            Ver todas as ações →
          </Button>
        </div>
        {auroraAcoes.length === 0 ? (
          <p className="text-xs text-white/70 italic">Nenhum sinal prioritário agora — pipeline em dia.</p>
        ) : (
          <div className="space-y-2">
            {auroraAcoes.map((a, i) => {
              const Icon = AURORA_ICONS[a.icon];
              return (
                <div key={i} className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-2.5">
                  <Icon className="w-4 h-4 shrink-0 text-white/80" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate">{a.titulo}</p>
                    <p className="text-[10px] text-white/70">{a.subtitulo}</p>
                  </div>
                  <span className="text-xs font-black font-mono shrink-0">{formatCurrency(a.valor)}</span>
                  <Button size="sm" onClick={() => navigate(a.target)} className="shrink-0 h-7 px-3 text-[10px] font-bold !bg-white !text-[var(--color-primary-blue)] hover:!brightness-95">
                    Ver ação
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Evolução + Origem + Conversão */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-5 p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-4">Evolução da Receita</h3>
          <div className="h-[220px] w-full -mx-2">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
              <AreaChart data={performanceData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary-blue)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-primary-blue)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--color-text-faint)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-text-faint)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCurrency(v)} width={70} />
                <Tooltip
                  contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 11 }}
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                />
                <Area type="monotone" dataKey="vendas" name="Receita" stroke="var(--color-primary-blue)" fill="url(#colorReceita)" strokeWidth={2.5} />
                <Line type="monotone" dataKey="leads" name="Leads" stroke="var(--color-text-faint)" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-3 p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col">
          <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-4 flex items-center gap-2"><PieChartIcon className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Origem dos Leads</h3>
          {origemSlices.length === 0 ? (
            <p className="text-xs text-[var(--color-text-faint)] italic flex-1 flex items-center justify-center">Sem leads ainda</p>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="relative h-[120px] w-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={origemSlices} cx="50%" cy="50%" innerRadius={38} outerRadius={56} paddingAngle={3} dataKey="value" stroke="none">
                      {origemSlices.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-base font-black text-[var(--color-text-primary)] font-mono">{origemTotal}</span>
                  <span className="text-[8px] text-[var(--color-text-faint)] font-bold uppercase">leads</span>
                </div>
              </div>
              <div className="w-full space-y-1.5">
                {origemSlices.map((s) => (
                  <div key={s.name} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-[10px] text-[var(--color-text-muted)] font-semibold truncate flex-1">{s.name}</span>
                    <span className="text-[10px] font-bold text-[var(--color-text-primary)] tabular-nums">{s.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-4 p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-4">Conversão por Etapa</h3>
          <div className="space-y-2.5">
            {funnelData.map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--color-text-muted)] font-semibold w-24 truncate shrink-0">{s.label}</span>
                <div className="flex-1 h-2 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${s.color}`} style={{ width: `${Math.max(2, Math.min(100, (s.value / (funnelData[0]?.value || 1)) * 100))}%` }} />
                </div>
                <span className="text-[10px] font-bold text-[var(--color-text-primary)] tabular-nums w-8 text-right shrink-0">{s.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Tabelas: Prioritárias + Em risco */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3 overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
            <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider">Oportunidades Prioritárias</h3>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{oportunidadesPrioritarias.length}</Badge>
              <Button variant="outline" size="sm" onClick={() => navigate("/app/dashboard/oportunidades")} className="h-7 px-2.5 text-[10px] font-bold">Ver todas</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                <tr><th className="px-4 py-2.5">Cliente</th><th className="px-4 py-2.5">Valor</th><th className="px-4 py-2.5">Situação</th><th className="px-4 py-2.5">Recomendação</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {oportunidadesPrioritarias.map((l) => {
                  const sit = situacaoDe(l);
                  return (
                    <tr key={l.id} onClick={() => navigate(`/app/crm/pipeline?leadId=${l.id}`)} className="hover:bg-[var(--color-surface-sunken)] cursor-pointer transition-colors">
                      <td className="px-4 py-2.5 font-bold text-[var(--color-text-primary)] truncate max-w-[160px]">{l.company || l.name}</td>
                      <td className="px-4 py-2.5 font-mono text-[var(--color-text-primary)]">{formatCurrency(l._val)}</td>
                      <td className="px-4 py-2.5"><Badge variant={sit.tone}>{sit.label}</Badge></td>
                      <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{recomendacaoDe(sit.label)}</td>
                    </tr>
                  );
                })}
                {oportunidadesPrioritarias.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-[var(--color-text-faint)]">Nenhuma oportunidade aberta com valor ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="lg:col-span-2 overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
            <h3 className="text-xs font-black text-danger uppercase tracking-wider flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Receita em Risco</h3>
            <Button variant="outline" size="sm" onClick={() => navigate("/app/dashboard/vazamentos")} className="h-7 px-2.5 text-[10px] font-bold">Ver todas</Button>
          </div>
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {vazamentos.map((v) => (
              <div key={v.motivo} className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
                <span className="text-[var(--color-text-muted)] truncate">{v.motivo}</span>
                <span className="font-mono font-bold text-[var(--color-text-primary)] shrink-0">{formatCurrency(v.valor)}</span>
                <span className="text-[10px] text-[var(--color-text-faint)] shrink-0 w-8 text-right">{v.qtd}×</span>
              </div>
            ))}
            {vazamentos.length === 0 && <p className="px-4 py-8 text-center text-[var(--color-text-faint)] text-xs">Nenhum vazamento de receita identificado.</p>}
          </div>
        </Card>
      </div>
      </>
      )}
    </div>
  );
}
