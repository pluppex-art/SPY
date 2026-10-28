import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity, DollarSign, Bell,
  Plus, Cpu, ShieldCheck, Building2
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/PageContainer";
import { supabase } from "../../lib/supabase";

import { AdminOverviewTab } from "./components/AdminOverviewTab";
import { AdminTenantsTab } from "./components/AdminTenantsTab";
import { AdminModulesTab } from "./components/AdminModulesTab";
import { AdminModuleManifestTab } from "./components/AdminModuleManifestTab";
import { AdminToolsTab } from "./components/AdminToolsTab";
import { AdminAgentsTab } from "./components/AdminAgentsTab";
import { AdminBillingTab } from "./components/AdminBillingTab";
import { AdminAssinaturasTab } from "./components/AdminAssinaturasTab";
import { AdminPlanosCatalogoTab } from "./components/AdminPlanosCatalogoTab";
import { ModulePlansMatrix } from "./components/ModulePlansMatrix";
import { AdminLogsTab } from "./components/AdminLogsTab";
import { AdminHealthTab } from "./components/AdminHealthTab";
import { NovoTenantModal } from "./components/NovoTenantModal";
import { ModuleConfigModal } from "./components/ModuleConfigModal";
import { SystemAlertsModal } from "./components/SystemAlertsModal";

// 5 abas principais; o resto vive como sub-aba dentro do grupo a que pertence.
const TABS = [
  { id: "overview", label: "Visão Geral", icon: Activity },
  { id: "tenants", label: "Empresas", icon: Building2 },
  { id: "plans", label: "Planos & Receita", icon: DollarSign },
  { id: "platform", label: "Plataforma", icon: Cpu },
  { id: "ops", label: "Operação", icon: ShieldCheck },
] as const;

type TabId = typeof TABS[number]["id"];

const SUBTABS: Record<Exclude<TabId, "overview">, { id: string; label: string }[]> = {
  tenants: [
    { id: "empresas", label: "Empresas & Instâncias" },
    { id: "modulos", label: "Módulos por empresa" },
  ],
  plans: [
    { id: "catalogo", label: "Planos & Pacotes" },
    { id: "modulos", label: "Módulos por plano" },
    { id: "assinaturas", label: "Assinaturas" },
    { id: "receita", label: "Receita da base" },
  ],
  platform: [
    { id: "manifest", label: "Módulos (Manifest)" },
    { id: "tools", label: "Ferramentas" },
    { id: "agents", label: "Agentes" },
  ],
  ops: [
    { id: "logs", label: "Logs & Auditoria" },
    { id: "health", label: "Saúde & Diagnóstico" },
  ],
};

/** Links antigos (?tab=billing, ?tab=modules...) continuam funcionando. */
const LEGACY_TABS: Record<string, { tab: TabId; sub?: string }> = {
  tenants_modules: { tab: "tenants" },
  modules: { tab: "tenants", sub: "modulos" },
  manifest: { tab: "platform", sub: "manifest" },
  tools: { tab: "platform", sub: "tools" },
  agents: { tab: "platform", sub: "agents" },
  billing: { tab: "plans", sub: "receita" },
  subscriptions: { tab: "plans", sub: "assinaturas" },
  logs: { tab: "ops", sub: "logs" },
  health: { tab: "ops", sub: "health" },
};

function resolveTab(tab: string | null, sub: string | null): { tab: TabId; sub: string } {
  const legacy = tab ? LEGACY_TABS[tab] : undefined;
  const id: TabId = legacy ? legacy.tab : TABS.some((t) => t.id === tab) ? (tab as TabId) : "overview";
  if (id === "overview") return { tab: id, sub: "" };
  const subs = SUBTABS[id];
  const wanted = sub ?? legacy?.sub;
  return { tab: id, sub: subs.some((x) => x.id === wanted) ? (wanted as string) : subs[0].id };
}

export const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const val = payload[0].value;
    return (
      <div className="bg-[#0f172a] border border-white/10 p-3 rounded-xl shadow-xl">
        <p className="text-white text-xs font-bold mb-1">{label}</p>
        <p className="text-cyan-400 font-mono text-sm font-black">
          R$ {val.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </p>
      </div>
    );
  }
  return null;
};

export default function AdminSaaS() {
  const [searchParams, setSearchParams] = useSearchParams();
  const current = useMemo(
    () => resolveTab(searchParams.get("tab"), searchParams.get("sub")),
    [searchParams],
  );
  const activeTab = current.tab;
  const activeSub = current.sub;
  const [isCreateTenantOpen, setIsCreateTenantOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [selectedTenantForModules, setSelectedTenantForModules] = useState<string | null>(null);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Aceita id novo ("plans") ou antigo ("billing"); a sub-aba vem do mapa legado quando não informada.
  const handleTabChange = (tabId: string, sub?: string) => {
    const r = resolveTab(tabId, sub ?? null);
    setSearchParams(r.sub ? { tab: r.tab, sub: r.sub } : { tab: r.tab });
  };

  // A3 (auditoria 2026-09-21): `useData().financeEntries` só traz o tenant
  // ATIVO da sessão do master (o próprio "G-Tech Master", que não deveria ter
  // receita de cliente real) — "MRR Global"/"MRR Ativo" mostravam esse número
  // sozinho, não a soma da plataforma. Esta tela é master-only (rota
  // requireMaster), então busca direto todos os tenants — mesmo padrão já
  // usado em AdminBillingTab.tsx pra tabela de assinaturas por tenant.
  const [allFinanceEntries, setAllFinanceEntries] = useState<{ value: number; date: string | null }[]>([]);
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("finance_entries")
      .select("value, date")
      .eq("type", "Receber")
      .eq("status", "Pago")
      .then(({ data, error }) => {
        if (!error && data) setAllFinanceEntries(data as any[]);
      });
  }, [reloadTrigger]);

  const revenueData = useMemo(() => {
    const months: Record<string, { name: string; mrr: number }> = {};
    allFinanceEntries.forEach((f) => {
      try {
        const d = new Date(f.date || "");
        if (isNaN(d.getTime())) return;
        const month = d.toLocaleDateString("pt-BR", { month: "short" });
        if (!months[month]) months[month] = { name: month, mrr: 0 };
        months[month].mrr += Number(f.value) || 0;
      } catch {}
    });
    return Object.values(months);
  }, [allFinanceEntries]);

  const globalMrr = revenueData.reduce((acc, curr) => acc + curr.mrr, 0);

  return (
    <PageContainer
      title="Gestão de Infraestrutura & SaaS"
      description="Centro de Comando Global — Instâncias, Faturamento, Governança Modular e Saúde da Infraestrutura."
      actions={
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Status Pill */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-bold text-emerald-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-[11px]">SLA 99.98% Operacional</span>
          </div>

          {/* Alertas */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsAlertsOpen(true)}
            className="h-10 px-3.5 relative font-bold"
          >
            <Bell className="w-4 h-4 mr-1.5 text-[var(--color-primary-blue)]" />
            Alertas
            {unreadAlertsCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-500 text-white">
                {unreadAlertsCount}
              </span>
            )}
          </Button>

          {/* Novo Tenant */}
          <Button
            type="button"
            onClick={() => setIsCreateTenantOpen(true)}
            className="h-10 px-4 font-black shadow-md shadow-[var(--color-primary-blue)]/20"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Novo Tenant
          </Button>
        </div>
      }
    >
      {/* Navigation Tabs Bar */}
      <div className="flex items-center gap-1.5 p-1.5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-2xl mb-8 overflow-x-auto scrollbar-none shadow-xs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer select-none ${
                isActive
                  ? "bg-[var(--color-primary-blue)] !text-white shadow-md shadow-[var(--color-primary-blue)]/25"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab !== "overview" && (
        <div className="flex items-center gap-1 mb-6 overflow-x-auto scrollbar-none">
          {SUBTABS[activeTab].map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => handleTabChange(activeTab, st.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer border transition-colors ${
                activeSub === st.id
                  ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/30"
                  : "bg-transparent text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab Contents */}
      {activeTab === "overview" && (
        <AdminOverviewTab
          globalMrr={globalMrr}
          revenueData={revenueData}
          CustomTooltip={CustomTooltip}
          onNavigateTab={handleTabChange}
          onOpenNewTenant={() => setIsCreateTenantOpen(true)}
        />
      )}

      {activeTab === "tenants" && activeSub === "empresas" && (
        <AdminTenantsTab
          onConfigureModules={(tenantName) => setSelectedTenantForModules(tenantName)}
          onOpenNewTenant={() => setIsCreateTenantOpen(true)}
          reloadTrigger={reloadTrigger}
        />
      )}
      {activeTab === "tenants" && activeSub === "modulos" && (
        <AdminModulesTab
          initialTenant={selectedTenantForModules || undefined}
          onTenantChange={(name) => setSelectedTenantForModules(name)}
        />
      )}

      {activeTab === "plans" && activeSub === "catalogo" && <AdminPlanosCatalogoTab />}
      {activeTab === "plans" && activeSub === "modulos" && <ModulePlansMatrix />}
      {activeTab === "plans" && activeSub === "assinaturas" && <AdminAssinaturasTab />}
      {activeTab === "plans" && activeSub === "receita" && (
        <AdminBillingTab revenueData={revenueData} CustomTooltip={CustomTooltip} />
      )}

      {activeTab === "platform" && activeSub === "manifest" && <AdminModuleManifestTab />}
      {activeTab === "platform" && activeSub === "tools" && <AdminToolsTab />}
      {activeTab === "platform" && activeSub === "agents" && <AdminAgentsTab />}

      {activeTab === "ops" && activeSub === "logs" && <AdminLogsTab />}
      {activeTab === "ops" && activeSub === "health" && <AdminHealthTab />}

      {/* Modals */}
      <NovoTenantModal
        isOpen={isCreateTenantOpen}
        onClose={() => setIsCreateTenantOpen(false)}
        onCreated={() => {
          setReloadTrigger(v => v + 1);
        }}
      />

      <ModuleConfigModal
        selectedTenant={selectedTenantForModules}
        onClose={() => setSelectedTenantForModules(null)}
        onSaved={() => {
          setReloadTrigger(v => v + 1);
        }}
      />

      <SystemAlertsModal
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        onAlertsChange={(count) => setUnreadAlertsCount(count)}
      />
    </PageContainer>
  );
}
