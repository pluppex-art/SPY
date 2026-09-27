import React, { useMemo } from "react";
import { Card } from "../../../components/ui/card";
import {
  Building2, DollarSign, Users, HardDrive, BarChart3,
  Activity, PieChart as PieChartIcon, Server, Inbox,
  CheckCircle2, ArrowUpRight, ShieldCheck, Zap,
  Clock, Database
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer
} from "recharts";
import { useLocalization } from "../../../contexts/LocalizationContext";
import { useAuth } from "../../../contexts/AuthContext";

interface AdminOverviewTabProps {
  globalMrr: number;
  revenueData: { name: string; mrr: number }[];
  CustomTooltip: React.ComponentType<any>;
  onNavigateTab: (tabId: string) => void;
  onOpenNewTenant: () => void;
}

export function AdminOverviewTab({
  globalMrr,
  revenueData,
  CustomTooltip,
  onNavigateTab,
  onOpenNewTenant,
}: AdminOverviewTabProps) {
  const { formatCurrency } = useLocalization();
  const { tenantIdMap } = useAuth();
  const tenantNames = Object.keys(tenantIdMap);
  const totalTenants = tenantNames.length;

  // Achado real 2026-09-27: este número (globalMrr) é a soma de TODOS os
  // lançamentos financeiros (tipo Receber, status Pago) de TODOS os tenants —
  // ou seja, o faturamento combinado dos clientes finais de cada empresa que
  // roda no SPY, não a mensalidade que essas empresas pagam pro SPY (essa
  // segunda coisa não existe como dado real hoje: não há tabela de assinatura/
  // plano com valor monetário, só `tenants.plan` como rótulo textual — ver
  // AdminBillingTab.tsx). "MRR"/"ARR Projetado" (globalMrr * 12) tratavam esse
  // agregado como se fosse a mensalidade recorrente do próprio SPY, o que não
  // é: é a soma do HISTÓRICO INTEIRO de faturamento de todos os tenants, não
  // "a receita deste mês" — multiplicar isso por 12 não é uma projeção anual
  // de nada. "Média Mensal" abaixo é um fato real (não uma projeção).
  const mesesComFaturamento = revenueData.filter(m => m.mrr > 0).length;
  const faturamentoMedioMensal = mesesComFaturamento > 0 ? globalMrr / mesesComFaturamento : 0;
  const activeUsersCount = "—";

  return (
    <div className="space-y-6">
      {/* KPI Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Empresas */}
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/40 hover:shadow-md transition-all group">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
              <Building2 className="w-5 h-5" />
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <CheckCircle2 className="w-2.5 h-2.5" /> {totalTenants} Ativas
            </span>
          </div>
          <div className="text-3xl font-display font-black text-[var(--color-text-primary)] tracking-tight">
            {totalTenants}
          </div>
          <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mt-1">
            Instâncias Multi-Tenant
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)] flex items-center justify-between text-xs">
            <span className="text-[var(--color-text-muted)]">Isolamento RLS</span>
            <button
              onClick={() => onNavigateTab("tenants")}
              className="font-bold text-[var(--color-primary-blue)] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              Gerenciar <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </Card>

        {/* MRR Global */}
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-emerald-500/40 hover:shadow-md transition-all group">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
              <DollarSign className="w-5 h-5" />
            </div>
            {globalMrr > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                Ativo
              </span>
            )}
          </div>
          <div className="text-3xl font-display font-black text-[var(--color-text-primary)] tracking-tight">
            {formatCurrency(globalMrr)}
          </div>
          <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mt-1">
            Faturamento da Base (Todos os Tenants)
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)] flex items-center justify-between text-xs">
            <span className="text-[var(--color-text-muted)]">Média Mensal</span>
            <span className="font-mono font-bold text-emerald-500">
              {faturamentoMedioMensal > 0 ? formatCurrency(faturamentoMedioMensal) : "—"}
            </span>
          </div>
        </Card>

        {/* Usuários Ativos */}
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-indigo-500/40 hover:shadow-md transition-all group">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500">
              <Users className="w-5 h-5" />
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
              Cadastrados
            </span>
          </div>
          <div className="text-3xl font-display font-black text-[var(--color-text-primary)] tracking-tight">
            {activeUsersCount}
          </div>
          <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mt-1">
            Usuários Corporativos (MAU)
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)] flex items-center justify-between text-xs">
            <span className="text-[var(--color-text-muted)]">Total de Contas</span>
            <span className="font-bold text-[var(--color-text-primary)]">{activeUsersCount}</span>
          </div>
        </Card>

        {/* Disponibilidade & Infra */}
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-cyan-500/40 hover:shadow-md transition-all group">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-500">
              <Activity className="w-5 h-5" />
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Ativo
            </span>
          </div>
          <div className="text-3xl font-display font-black text-[var(--color-text-primary)] tracking-tight">
            100%
          </div>
          <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mt-1">
            Disponibilidade do Cluster
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)] flex items-center justify-between text-xs">
            <span className="text-[var(--color-text-muted)]">Supabase Cloud</span>
            <button
              onClick={() => onNavigateTab("health")}
              className="font-bold text-[var(--color-primary-blue)] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              Diagnóstico <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </Card>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Growth Chart */}
        <Card className="lg:col-span-2 p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[var(--color-primary-blue)]" /> Evolução do Faturamento da Base
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Histórico consolidado de faturamento de todos os tenants, a partir dos lançamentos financeiros liquidados — não é a mensalidade paga ao SPY (ver aba Faturamento).
              </p>
            </div>
            {globalMrr > 0 && (
              <span className="text-[11px] font-black text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 px-2.5 py-1 rounded-lg border border-[var(--color-primary-blue)]/20">
                Total: {formatCurrency(globalMrr)}
              </span>
            )}
          </div>

          {revenueData.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 min-h-[250px] p-8 text-center">
              <Inbox className="w-10 h-10 text-[var(--color-text-faint)]" />
              <span className="text-sm font-bold text-[var(--color-text-muted)]">Nenhum faturamento registrado ainda</span>
              <p className="text-xs text-[var(--color-text-faint)] max-w-sm">
                Os valores aparecem automaticamente conforme lançamentos do tipo Receber são marcados como Pago.
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMrrReal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--color-text-muted)", fontSize: 12, fontWeight: 600 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
                    tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <CartesianGrid vertical={false} stroke="var(--color-border-default)" strokeDasharray="3 3" />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="mrr"
                    name="Faturamento"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorMrrReal)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Plan Distribution / Status Card */}
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-purple-500" /> Distribuição de Planos
              </h4>
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
                {totalTenants} {totalTenants === 1 ? "instância" : "instâncias"}
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">
              Composição de instâncias e planos do SaaS.
            </p>

            <div className="flex-1 flex flex-col items-center justify-center gap-3 min-h-[160px] p-6 text-center bg-[var(--color-surface-sunken)] rounded-2xl border border-[var(--color-border-subtle)]">
              <PieChartIcon className="w-8 h-8 text-[var(--color-text-faint)]" />
              <div>
                <span className="text-xs font-bold text-[var(--color-text-primary)] block">
                  {totalTenants > 0 ? `${totalTenants} Instâncias Provisionadas` : "Nenhum plano ativo"}
                </span>
                <span className="text-[11px] text-[var(--color-text-muted)] block mt-0.5">
                  Consulte a aba Faturamento para detalhes de contratos e planos.
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--color-border-subtle)]">
            <button
              onClick={() => onNavigateTab("billing")}
              className="w-full py-2 bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl text-xs font-bold text-[var(--color-text-primary)] transition-all flex items-center justify-center gap-1 cursor-pointer"
            >
              Acessar Faturamento & Assinaturas <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </Card>
      </div>

      {/* Registered Tenants List */}
      <Card className="overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-xs">
        <div className="p-4 border-b border-[var(--color-border-default)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[var(--color-primary-blue)]" />
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
              Empresas & Instâncias Cadastradas
            </h3>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] px-2 py-0.5 rounded border border-[var(--color-border-default)]">
              {totalTenants} no total
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenNewTenant}
              className="text-xs font-bold text-white bg-[var(--color-primary-blue)] px-3 py-1.5 rounded-xl hover:opacity-90 transition-all cursor-pointer"
            >
              + Novo Tenant
            </button>
            <button
              onClick={() => onNavigateTab("tenants")}
              className="text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] px-3 py-1.5 rounded-xl transition-all cursor-pointer"
            >
              Ver Diretório Completo
            </button>
          </div>
        </div>

        {tenantNames.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
            <Building2 className="w-10 h-10 text-[var(--color-text-faint)]" />
            <span className="text-sm font-bold text-[var(--color-text-muted)]">Nenhuma empresa cadastrada no momento</span>
            <button
              onClick={onOpenNewTenant}
              className="mt-1 px-4 py-2 bg-[var(--color-primary-blue)] text-white text-xs font-bold rounded-xl"
            >
              Cadastrar Primeira Empresa
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {tenantNames.slice(0, 6).map((name) => (
              <div key={name} className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center text-[var(--color-primary-blue)] shrink-0 font-bold text-xs">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-[var(--color-text-primary)] truncate">
                        {name}
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                        Ativo
                      </span>
                    </div>
                    <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                      ID: {tenantIdMap[name] || name.toLowerCase().replace(/\s+/g, '-')} • RLS Isolado
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onNavigateTab("tenants")}
                    className="px-3 py-1 bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-lg text-xs font-bold text-[var(--color-text-primary)] transition-all cursor-pointer"
                  >
                    Gerenciar
                  </button>
                </div>
              </div>
            ))}
            {tenantNames.length > 6 && (
              <div className="px-4 py-2.5 text-center text-[11px] font-bold text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)]/30">
                +{tenantNames.length - 6} outras empresas cadastradas no cluster
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
