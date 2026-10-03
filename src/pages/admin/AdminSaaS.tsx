import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity, DollarSign, TerminalSquare, Bell,
  Plus, Cpu, ShieldCheck, Building2, LayoutGrid, Wrench, Bot
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
import { AdminLogsTab } from "./components/AdminLogsTab";
import { AdminHealthTab } from "./components/AdminHealthTab";
import { NovoTenantModal } from "./components/NovoTenantModal";
import { ModuleConfigModal } from "./components/ModuleConfigModal";
import { SystemAlertsModal } from "./components/SystemAlertsModal";

const TABS = [
  { id: "overview", label: "Visão Geral", icon: Activity },
  { id: "tenants", label: "Tenants & Instâncias", icon: Building2 },
  { id: "modules", label: "Módulos & Presets", icon: Cpu },
  { id: "manifest", label: "Módulos (Manifest)", icon: LayoutGrid },
  { id: "tools", label: "Ferramentas (Registry)", icon: Wrench },
  { id: "agents", label: "Agentes", icon: Bot },
  { id: "billing", label: "Faturamento & Planos", icon: DollarSign },
  { id: "subscriptions", label: "Assinaturas & IA", icon: DollarSign },
  { id: "logs", label: "Logs & Auditoria", icon: TerminalSquare },
  { id: "health", label: "Saúde & Diagnóstico", icon: ShieldCheck },
];

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
  const tabFromUrl = searchParams.get("tab");

  const normalizedTab = useMemo(() => {
    if (tabFromUrl === "tenants_modules") return "tenants";
    if (TABS.some(t => t.id === tabFromUrl)) return tabFromUrl;
    return "overview";
  }, [tabFromUrl]);

  const [activeTab, setActiveTab] = useState(normalizedTab);
  const [isCreateTenantOpen, setIsCreateTenantOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [selectedTenantForModules, setSelectedTenantForModules] = useState<string | null>(null);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    if (normalizedTab && normalizedTab !== activeTab) {
      setActiveTab(normalizedTab);
    }
  }, [normalizedTab]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId });
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

      {activeTab === "tenants" && (
        <AdminTenantsTab
          onConfigureModules={(tenantName) => setSelectedTenantForModules(tenantName)}
          onOpenNewTenant={() => setIsCreateTenantOpen(true)}
          reloadTrigger={reloadTrigger}
        />
      )}

      {activeTab === "modules" && (
        <AdminModulesTab
          initialTenant={selectedTenantForModules || undefined}
          onTenantChange={(name) => setSelectedTenantForModules(name)}
        />
      )}

      {activeTab === "manifest" && <AdminModuleManifestTab />}
      {activeTab === "tools" && <AdminToolsTab />}

      {activeTab === "agents" && <AdminAgentsTab />}

      {activeTab === "subscriptions" && <AdminAssinaturasTab />}

      {activeTab === "billing" && (
        <AdminBillingTab revenueData={revenueData} CustomTooltip={CustomTooltip} />
      )}

      {activeTab === "logs" && <AdminLogsTab />}

      {activeTab === "health" && <AdminHealthTab />}

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
