import { ehGastoMarketing } from "../../lib/gastoMarketing";
import { parseCurrencyBR } from "../../lib/utils";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../../components/ui/table";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import {
  Users,
  MousePointerClick,
  DollarSign,
  Target,
  ArrowUpRight,
  Facebook,
  Globe,
  Plus,
  Zap,
  Inbox,
  Settings,
  TrendingUp,
} from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { apiFetch } from "../../lib/apiClient";

import { HelpTip } from "../../components/ui/help-tip";
import { MetaCampanhasLista } from "./MetaCampanhasLista";
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface CampanhasServerSummary {
  totalLeads: number; closedLeads: number; totalRevenue: number; totalSpent: number; cpa: number;
  trafficData: { name: string; leads: number; spend: number }[];
  bySource: { source: string; leads: number; closed: number }[];
}

export default function MarketingCampanhas() {
  const navigate = useNavigate();
  const { leads, financeEntries, appSettings } = useData();
  const { activeTenantId } = useAuth();
  const { formatCurrency } = useLocalization();

  // KPIs/gráficos/tabela-por-origem vêm de um cache no Redis-SPY quando
  // disponível (GET /api/marketing/campanhas-summary) — mesma fórmula,
  // calculada sobre a base inteira do tenant em vez do array já em memória.
  // Puramente aditivo: cálculo client-side abaixo continua como fallback.
  const [serverSummary, setServerSummary] = useState<CampanhasServerSummary | null>(null);
  useEffect(() => {
    setServerSummary(null);
    if (!activeTenantId) return;
    let cancelled = false;
    apiFetch(`/api/marketing/campanhas-summary?tenantId=${encodeURIComponent(activeTenantId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setServerSummary(data); })
      .catch(() => { /* silencioso — cálculo client-side abaixo já cobre */ });
    return () => { cancelled = true; };
  }, [activeTenantId]);

  // Status das integrações vem do Supabase (app_settings, via DataContext),
  // gravado pela Central de Integrações.
  const metaConfig = appSettings?.integracoes_meta_ads ?? { connected: false, pixelId: "" };
  const googleConfig = appSettings?.integracoes_google_ads ?? { connected: false, measurementId: "" };

  // Cada métrica abaixo prefere o valor cacheado do servidor quando
  // disponível, senão cai pro cálculo client-side de sempre (mesma fórmula).
  const totalLeads = serverSummary?.totalLeads ?? leads.length;
  const closedLeads = serverSummary?.closedLeads ?? leads.filter((l) => l.status === "Fechado").length;

  const totalRevenueClient = useMemo(
    () =>
      leads
        .filter((l) => l.status === "Fechado")
        .reduce((s, l) => s + parseCurrencyBR(l.value), 0),
    [leads]
  );
  const totalRevenue = serverSummary?.totalRevenue ?? totalRevenueClient;

  const totalSpentClient = useMemo(
    () =>
      financeEntries
        .filter((f) => f.type === "Pagar" && f.status === "Pago" && ehGastoMarketing(f.category))
        .reduce((s, f) => s + f.value, 0),
    [financeEntries]
  );
  const totalSpent = serverSummary?.totalSpent ?? totalSpentClient;

  const cpa = serverSummary?.cpa ?? (totalLeads > 0 ? totalSpent / totalLeads : 0);

  // Leads grouped by weekday for traffic chart
  const trafficDataClient = useMemo(() => {
    return WEEKDAYS.map((day) => {
      const dayLeads = leads.filter((l) => {
        try {
          const d = new Date(l.date || "");
          return !isNaN(d.getTime()) && WEEKDAYS[d.getDay()] === day;
        } catch {
          return false;
        }
      });
      return { name: day, leads: dayLeads.length, spend: 0 };
    });
  }, [leads]);
  const trafficData = serverSummary?.trafficData ?? trafficDataClient;

  return (
    <PageContainer
      title="Gestão de Campanhas & Tráfego"
      subtitle="Acompanhe o retorno (ROI), as conversões e as conexões ativas do Meta Ads e do Google Ads."
      actions={
        <Button
          onClick={() => navigate("/app/configuracoes/integracoes/apps")}
          variant="outline"
          className="gap-2 text-xs font-bold"
        >
          <Settings className="w-3.5 h-3.5" /> Central de Integrações
        </Button>
      }
    >
      <div className="mb-6"><MetaCampanhasLista /></div>

      {/* Channels Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {/* Meta Ads Card */}
        <Card
          className={`p-5 flex flex-col justify-between transition-all duration-200 ${
            metaConfig.connected
              ? "border-[var(--color-primary-blue)]/40 shadow-sm"
              : "opacity-90"
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-3.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                  metaConfig.connected
                    ? "bg-blue-600/10 text-blue-500 border-blue-500/20"
                    : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border-[var(--color-border-default)]"
                }`}
              >
                <Facebook className="w-5 h-5" />
              </div>
              <Badge
                variant={metaConfig.connected ? "success" : "neutral"}
                dot
                dotPulse={metaConfig.connected}
              >
                {metaConfig.connected ? "Pixel Ativo" : "Desconectado"}
              </Badge>
            </div>
            <h4 className="font-bold text-[var(--color-text-primary)] text-base mb-1">
              Meta Ads (Facebook & Instagram)
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              {metaConfig.connected
                ? `Pixel ${metaConfig.pixelId || "Ativo"} e CAPI sincronizados`
                : "Conecte sua conta para rastrear visitantes e conversões"}
            </p>
          </div>
          <div className="mt-4 pt-3.5 border-t border-[var(--color-border-subtle)] flex justify-between items-center">
            <span className="text-[11px] font-mono text-[var(--color-text-faint)]">
              {metaConfig.connected ? "Rastreamento OK" : "Aguardando conexão"}
            </span>
            <Button
              onClick={() => navigate("/app/configuracoes/integracoes/apps")}
              variant="outline"
              size="sm"
              className="text-xs font-bold h-7"
            >
              Configurar
            </Button>
          </div>
        </Card>

        {/* Google Ads Card */}
        <Card
          className={`p-5 flex flex-col justify-between transition-all duration-200 ${
            googleConfig.connected
              ? "border-emerald-500/40 shadow-sm"
              : "opacity-90"
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-3.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                  googleConfig.connected
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                    : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border-[var(--color-border-default)]"
                }`}
              >
                <Globe className="w-5 h-5" />
              </div>
              <Badge
                variant={googleConfig.connected ? "success" : "neutral"}
                dot
                dotPulse={googleConfig.connected}
              >
                {googleConfig.connected ? "Tag Ativa" : "Desconectado"}
              </Badge>
            </div>
            <h4 className="font-bold text-[var(--color-text-primary)] text-base mb-1">
              Google Ads & Analytics
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              {googleConfig.connected
                ? `Tag ${googleConfig.measurementId || "G-Tag"} conectada`
                : "Acompanhe palavras-chave, conversões e Enhanced Tags"}
            </p>
          </div>
          <div className="mt-4 pt-3.5 border-t border-[var(--color-border-subtle)] flex justify-between items-center">
            <span className="text-[11px] font-mono text-[var(--color-text-faint)]">
              {googleConfig.connected ? "Tag OK" : "Aguardando conexão"}
            </span>
            <Button
              onClick={() => navigate("/app/configuracoes/integracoes/apps")}
              variant="outline"
              size="sm"
              className="text-xs font-bold h-7"
            >
              Configurar
            </Button>
          </div>
        </Card>

        {/* Nova Conexão Card */}
        <Card
          onClick={() => navigate("/app/configuracoes/integracoes/apps")}
          className="p-5 border-dashed border-[var(--color-border-default)] flex flex-col justify-center items-center text-center cursor-pointer hover:border-[var(--color-primary-blue)]/50 hover:bg-[var(--color-surface-sunken)]/40 transition-all"
        >
          <div className="w-10 h-10 rounded-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center justify-center mb-2 text-[var(--color-text-muted)]">
            <Plus className="w-5 h-5" />
          </div>
          <h4 className="font-bold text-[var(--color-text-primary)] text-sm mb-0.5">
            Nova Integração de Tráfego
           <HelpTip label="Sobre Nova Integração de Tráfego">Conecte outras fontes de tráfego pago, como TikTok Ads, LinkedIn, Taboola ou webhooks, para trazer os resultados para dentro do SPY.</HelpTip></h4>
        </Card>
      </div>

      {/* Real KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: "Total Investido",
            value: formatCurrency(totalSpent),
            icon: DollarSign,
            color: "text-rose-500",
            sub: "Despesas pagas de marketing e anúncios",
          },
          {
            label: "Receita Gerada",
            value: formatCurrency(totalRevenue),
            icon: ArrowUpRight,
            color: "text-emerald-500",
            sub: "Negócios fechados no CRM",
          },
          {
            label: "CPA Médio",
            value: cpa > 0 ? formatCurrency(cpa) : "—",
            icon: Target,
            color: "text-amber-500",
            sub: "Custo por lead adquirido",
          },
          {
            label: "Leads Gerados",
            value: totalLeads.toString(),
            icon: Users,
            color: "text-[var(--color-primary-blue)]",
            sub: `${closedLeads} negócios ganhos`,
          },
        ].map((kpi, i) => (
          <Card key={i} className="p-4 hover:border-[var(--color-border-default)]/80 transition-all">
            <div className="flex items-center justify-between mb-2">
              <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              <span className="text-[10px] font-bold text-[var(--color-text-faint)] uppercase tracking-wider">
                {kpi.label}
              </span>
            </div>
            <div className="text-xl md:text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic">
              {kpi.value}
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)] truncate">
              {kpi.sub}
            </div>
          </Card>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="p-5">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-[var(--color-primary-blue)]" /> Leads por Dia da Semana
          </h3>
          {totalLeads === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 opacity-50">
              <Inbox className="w-8 h-8 text-[var(--color-text-faint)]" />
              <p className="text-xs text-[var(--color-text-muted)] font-medium">Nenhum lead registrado na base.</p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trafficData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--color-text-faint)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-text-faint)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border-default)",
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: "var(--color-text-primary)",
                      boxShadow: "var(--shadow-panel)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="leads"
                    stroke="#2563EB"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "#2563EB" }}
                    activeDot={{ r: 6 }}
                    name="Leads"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider mb-4 flex items-center gap-2">
            <MousePointerClick className="w-4 h-4 text-[var(--color-primary-blue)]" /> Distribuição de Volume
          </h3>
          {totalLeads === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 opacity-50">
              <Inbox className="w-8 h-8 text-[var(--color-text-faint)]" />
              <p className="text-xs text-[var(--color-text-muted)] font-medium">Cadastre leads para visualizar os dados.</p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trafficData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--color-text-faint)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-text-faint)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(37, 99, 235, 0.05)" }}
                    contentStyle={{
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border-default)",
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: "var(--color-text-primary)",
                      boxShadow: "var(--shadow-panel)",
                    }}
                  />
                  <Bar dataKey="leads" fill="#2563EB" radius={[6, 6, 0, 0]} name="Leads" maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Campaigns by Source Table */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-[var(--color-border-subtle)] flex justify-between items-center">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" /> Desempenho por Origem de Tráfego
          </h3>
        </div>

        {totalLeads === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nenhum lead com origem cadastrada"
            description="Cadastre leads atribuindo fontes de tráfego (Meta Ads, Google, Orgânico) para visualizar métricas comparativas."
            className="border-none rounded-none"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fonte de Aquisição</TableHead>
                <TableHead>Total de Leads</TableHead>
                <TableHead>Vendas Fechadas</TableHead>
                <TableHead className="text-right">Taxa de Conversão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                let bySourceList: { source: string; leads: number; closed: number }[];
                if (serverSummary) {
                  bySourceList = serverSummary.bySource;
                } else {
                  const bySource: Record<string, { leads: number; closed: number }> = {};
                  leads.forEach((l) => {
                    const src = l.source || "Orgânico / Direto";
                    if (!bySource[src]) bySource[src] = { leads: 0, closed: 0 };
                    bySource[src].leads++;
                    if (l.status === "Fechado") bySource[src].closed++;
                  });
                  bySourceList = Object.entries(bySource)
                    .sort((a, b) => b[1].leads - a[1].leads)
                    .map(([source, data]) => ({ source, ...data }));
                }

                return bySourceList.map((data, i) => {
                  const rate = data.leads > 0 ? Math.round((data.closed / data.leads) * 100) : 0;
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <span className="font-bold text-[var(--color-text-primary)] text-sm">
                          {data.source}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs font-bold text-[var(--color-primary-blue)]">
                          {data.leads}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {data.closed}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={rate > 20 ? "success" : rate > 0 ? "warning" : "secondary"}>
                          {rate}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                });
              })()}
            </TableBody>
          </Table>
        )}
      </Card>
    </PageContainer>
  );
}
