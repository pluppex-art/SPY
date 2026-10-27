import React, { useState, useEffect, useMemo } from "react";
import { Card } from "../../../components/ui/card";
import {
  Cpu, Layers, Target, Clock, DollarSign, Package,
  Megaphone, MessageSquare, Award, Activity, Users,
  Columns3, Home, Car, Sun, ShoppingCart, Code2,
  Sparkles, ShieldCheck, UserCheck, Check, Building2
} from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { useData } from "../../../contexts/DataContext";
import { toast } from "sonner";

interface AdminModulesTabProps {
  initialTenant?: string;
  onTenantChange?: (name: string) => void;
}

const DEFAULT_MODULES: Record<string, boolean> = {
  crm: true,
  educacao: true,
  produtividade: true,
  financeiro: true,
  catalogo: true,
  marketing: true,
  engajamento: true,
  rh: true,
  bi: true,
  clinica: true,
  dev: true,
  imobiliaria: false,
  concessionaria: false,
  automotivo: false,
  varejo: false,
  solar: false,
  aurora: true,
};

const MODULE_DEFINITIONS = [
  { id: "crm", title: "CRM & Funil de Vendas", desc: "Leads, funil comercial, rodízio de closers e SDR IA", icon: Target, category: "Comercial", color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  { id: "aurora", title: "Aurora Diretoria IA", desc: "Assistente executiva com inteligência e comandos por voz", icon: Sparkles, category: "Inteligência", color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20" },
  { id: "produtividade", title: "Tarefas & Produtividade", desc: "Quadro Kanban de operações e gestão de follow-ups", icon: Clock, category: "Operações", color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/20" },
  { id: "financeiro", title: "Cofre & Financeiro", desc: "Contas a pagar/receber, DRE, conciliação e metas", icon: DollarSign, category: "Finanças", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  { id: "catalogo", title: "Catálogo de Produtos & SKUs", desc: "Produtos, serviços, controle de estoque e precificação", icon: Package, category: "Vendas", color: "text-purple-500 bg-purple-500/10 border-purple-500/20" },
  { id: "marketing", title: "Marketing & Campanhas", desc: "Automações, landing pages, formulários e tracking de conversão", icon: Megaphone, category: "Marketing", color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  { id: "engajamento", title: "Engajamento & WhatsApp", desc: "Disparos automáticos, webhooks, NPS e central de mensagens", icon: MessageSquare, category: "Comunicação", color: "text-rose-500 bg-rose-500/10 border-rose-500/20" },
  { id: "educacao", title: "Educação & Acadêmico", desc: "Turmas, matrículas, certificados digitais e alunos", icon: Award, category: "Vertical", color: "text-purple-500 bg-purple-500/10 border-purple-500/20" },
  { id: "clinica", title: "Clínica Médica & Saúde", desc: "Prontuários EHR, telemedicina, agenda e consultas médicas", icon: Activity, category: "Vertical", color: "text-teal-500 bg-teal-500/10 border-teal-500/20" },
  { id: "rh", title: "RH & Colaboradores", desc: "Equipe interna, comissões, perfis e organograma da empresa", icon: Users, category: "Gestão", color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  { id: "bi", title: "BI & Inteligência de Dados", desc: "Dashboards analíticos, projeções, OTE e score preditivo", icon: Columns3, category: "Inteligência", color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20" },
  { id: "imobiliaria", title: "Imobiliária", desc: "Portfólio de imóveis, visitas, corretores e funil de propostas", icon: Home, category: "Vertical", color: "text-orange-500 bg-orange-500/10 border-orange-500/20" },
  { id: "concessionaria", title: "Concessionária & Automotivo", desc: "Estoque de veículos, financiamentos, trocas e consignações", icon: Car, category: "Vertical", color: "text-amber-600 bg-amber-600/10 border-amber-600/20" },
  { id: "solar", title: "Energia Solar", desc: "Análise de fatura por IA, dimensionamento e funil fotovoltaico", icon: Sun, category: "Vertical", color: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20" },
  { id: "varejo", title: "Varejo & Ponto de Venda", desc: "Carrinho de compras, baixa de estoque e catálogo compartilhável", icon: ShoppingCart, category: "Vertical", color: "text-lime-500 bg-lime-500/10 border-lime-500/20" },
  { id: "dev", title: "Engenharia & Sprints", desc: "Quadro de sprints, releases e backlog de demandas tech", icon: Code2, category: "Engenharia", color: "text-slate-500 bg-slate-500/10 border-slate-500/20" },
];

export function AdminModulesTab({ initialTenant, onTenantChange }: AdminModulesTabProps) {
  const { user, login, allTenantModules, updateTenantModules, getTenantModules } = useAuth();
  const { setSidebarModules } = useData();

  // `allTenantModules` já vem completo dos tenants reais do Supabase — antes
  // forçava um "G-Tech Master" fixo aqui (tenant excluído em 2026-09-22),
  // reintroduzindo um fantasma nesse seletor toda vez.
  const tenantOptions = useMemo(() => Object.keys(allTenantModules), [allTenantModules]);

  const [selectedTenant, setSelectedTenant] = useState<string>(
    initialTenant || user?.tenantName || ""
  );
  const [activeModules, setActiveModules] = useState<Record<string, boolean>>(DEFAULT_MODULES);
  const [simulationRole, setSimulationRole] = useState("Administrador / Sócio");

  useEffect(() => {
    if (initialTenant && initialTenant !== selectedTenant) {
      setSelectedTenant(initialTenant);
    }
  }, [initialTenant]);

  useEffect(() => {
    const mods = getTenantModules(selectedTenant);
    setActiveModules({ ...DEFAULT_MODULES, ...mods });
  }, [selectedTenant, allTenantModules]);

  const handleSelectTenant = (name: string) => {
    setSelectedTenant(name);
    onTenantChange?.(name);
  };

  const handleToggleModule = async (key: string) => {
    const newVal = !activeModules[key];
    const updated = { ...activeModules, [key]: newVal };
    if (key === "concessionaria" || key === "automotivo") {
      updated.concessionaria = newVal;
      updated.automotivo = newVal;
    }
    setActiveModules(updated);
    await updateTenantModules(selectedTenant, updated as any);
    if (selectedTenant === user?.tenantName) {
      setSidebarModules(updated);
    }
    toast.success(`Módulo "${key.toUpperCase()}" ${newVal ? "ATIVADO" : "DESATIVADO"} para ${selectedTenant}!`);
  };

  const applyPreset = async (presetName: string) => {
    let preset: Record<string, boolean>;
    switch (presetName) {
      case "ALL_ACTIVE":
        preset = { crm: true, educacao: true, produtividade: true, financeiro: true, catalogo: true, engajamento: true, rh: true, bi: true, clinica: true, marketing: true, dev: true, imobiliaria: true, concessionaria: true, varejo: true, solar: true, aurora: true };
        toast.success("Preset Aplicado: Ecossistema Global (Todos os Módulos Ativos)");
        break;
      case "SDR_CLOSER":
        preset = { crm: true, educacao: false, produtividade: true, financeiro: false, catalogo: false, engajamento: true, rh: false, bi: true, clinica: false, marketing: true, dev: false, imobiliaria: false, concessionaria: false, varejo: false, solar: false, aurora: true };
        toast.success("Preset Aplicado: Agência SDR & Closers");
        break;
      case "EDUCACAO":
        preset = { crm: true, educacao: true, produtividade: true, financeiro: true, catalogo: false, engajamento: true, rh: true, bi: true, clinica: false, marketing: true, dev: false, imobiliaria: false, concessionaria: false, varejo: false, solar: false, aurora: true };
        toast.success("Preset Aplicado: Escola & Acadêmico");
        break;
      case "CLINICA":
        preset = { crm: true, educacao: false, produtividade: true, financeiro: true, catalogo: false, engajamento: true, rh: true, bi: true, clinica: true, marketing: false, dev: false, imobiliaria: false, concessionaria: false, varejo: false, solar: false, aurora: true };
        toast.success("Preset Aplicado: Clínica & Saúde Integrada");
        break;
      case "IMOBILIARIA":
        preset = { crm: true, educacao: false, produtividade: true, financeiro: true, catalogo: false, engajamento: true, rh: true, bi: true, clinica: false, marketing: true, dev: false, imobiliaria: true, concessionaria: false, varejo: false, solar: false, aurora: true };
        toast.success("Preset Aplicado: Imobiliária");
        break;
      case "CONCESSIONARIA":
        preset = { crm: true, educacao: false, produtividade: true, financeiro: true, catalogo: false, engajamento: true, rh: true, bi: true, clinica: false, marketing: true, dev: false, imobiliaria: false, concessionaria: true, varejo: false, solar: false, aurora: true };
        toast.success("Preset Aplicado: Concessionária");
        break;
      case "VAREJO":
        preset = { crm: true, educacao: false, produtividade: true, financeiro: true, catalogo: true, engajamento: true, rh: true, bi: true, clinica: false, marketing: true, dev: false, imobiliaria: false, concessionaria: false, varejo: true, solar: false, aurora: true };
        toast.success("Preset Aplicado: Varejo & Lojas");
        break;
      case "SOLAR":
        preset = { crm: true, educacao: false, produtividade: true, financeiro: true, catalogo: false, engajamento: true, rh: true, bi: true, clinica: false, marketing: false, dev: false, imobiliaria: false, concessionaria: false, varejo: false, solar: true, aurora: true };
        toast.success("Preset Aplicado: Energia Solar");
        break;
      default:
        return;
    }
    if (preset.concessionaria !== undefined) preset.automotivo = preset.concessionaria;
    setActiveModules(preset);
    await updateTenantModules(selectedTenant, preset as any);
    if (selectedTenant === user?.tenantName) {
      setSidebarModules(preset);
    }
  };

  const handleSwitchRole = (role: string) => {
    setSimulationRole(role);
    if (user) login({ ...user, role });
    toast.info(`Simulação ativada para o perfil: ${role}`);
  };

  const activeCount = Object.values(activeModules).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Header Selector Box */}
      <Card className="p-5 sm:p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-3xl space-y-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center text-[var(--color-primary-blue)] shrink-0">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] block">
                Governança de Módulos & Recursos
              </span>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <select
                  value={selectedTenant}
                  onChange={e => handleSelectTenant(e.target.value)}
                  className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2 text-xs font-black text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)] cursor-pointer"
                >
                  {tenantOptions.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 px-2.5 py-1 rounded-lg">
                  {activeCount} de 16 Ativos
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <p className="text-xs text-[var(--color-text-muted)] max-w-md hidden sm:block">
              As alterações são gravadas instantaneamente no banco de dados e refletidas na barra lateral de navegação do tenant.
            </p>
          </div>
        </div>

        {/* 1-Click Operational Presets */}
        <div className="pt-4 border-t border-[var(--color-border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-primary-blue)] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Presets Estratégicos de Operação em 1 Clique
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)]">
              Configura o pacote completo ideal para cada vertente
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {[
              { id: "ALL_ACTIVE", label: "Geral Full", sub: "Todos Ativos", icon: "🌐", color: "hover:border-[var(--color-primary-blue)]" },
              { id: "SDR_CLOSER", label: "SDR & Closers", sub: "Funil Comercial", icon: "⚡", color: "hover:border-cyan-500" },
              { id: "IMOBILIARIA", label: "Imobiliária", sub: "Imóveis & Leads", icon: "🏢", color: "hover:border-purple-500" },
              { id: "SOLAR", label: "Energia Solar", sub: "Fotovoltaico", icon: "☀️", color: "hover:border-amber-500" },
              { id: "CLINICA", label: "Saúde / Clínica", sub: "Prontuários EHR", icon: "🩺", color: "hover:border-teal-500" },
              { id: "EDUCACAO", label: "Educação / Cursos", sub: "Turmas & Aulas", icon: "🎓", color: "hover:border-indigo-500" },
              { id: "CONCESSIONARIA", label: "Concessionária", sub: "Estoque Veículos", icon: "🚗", color: "hover:border-orange-500" },
              { id: "VAREJO", label: "Varejo & PDV", sub: "Lojas & Estoque", icon: "🛍️", color: "hover:border-lime-500" },
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`p-2.5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface)] text-left transition-all flex flex-col items-center text-center cursor-pointer group shadow-2xs ${p.color}`}
              >
                <span className="text-base mb-1 group-hover:scale-110 transition-transform">{p.icon}</span>
                <span className="text-[11px] font-bold text-[var(--color-text-primary)] leading-tight">{p.label}</span>
                <span className="text-[9px] text-[var(--color-text-muted)] mt-0.5">{p.sub}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Modules Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
        {MODULE_DEFINITIONS.map(mod => {
          const isEnabled = activeModules[mod.id] ?? true;
          const Icon = mod.icon;

          return (
            <div
              key={mod.id}
              onClick={() => handleToggleModule(mod.id)}
              className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 cursor-pointer select-none group shadow-xs ${
                isEnabled
                  ? "bg-[var(--color-surface-elevated)] border-[var(--color-primary-blue)]/50 ring-1 ring-[var(--color-primary-blue)]/20"
                  : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] opacity-55 hover:opacity-85"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`p-2.5 rounded-xl border shrink-0 ${mod.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[var(--color-text-primary)] block truncate">
                      {mod.title}
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-wider text-[var(--color-text-muted)] block mt-0.5">
                      {mod.category}
                    </span>
                  </div>
                </div>

                {/* Switch Visual */}
                <div className="shrink-0 mt-0.5">
                  <div
                    className={`w-9 h-5 rounded-full p-0.5 transition-all flex items-center ${
                      isEnabled
                        ? "bg-[var(--color-primary-blue)] justify-end shadow-xs"
                        : "bg-slate-300 dark:bg-slate-700 justify-start"
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full bg-white transition-transform shadow-xs" />
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed font-medium line-clamp-2">
                {mod.desc}
              </p>
            </div>
          );
        })}
      </div>

      {/* Role Simulator */}
      <Card className="p-5 sm:p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-3xl space-y-4 shadow-xs">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-indigo-500" /> Simulador de Visão por Cargo & Perfil
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Selecione uma função operacional para testar instantaneamente a interface e as restrições do menu lateral.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { role: "Administrador / Sócio", desc: "Acesso irrestrito a configurações globais, finanças, módulos e auditoria." },
            { role: "SDR / Pré-Vendas", desc: "Focado em triagem de leads, contatos rápidos e agendamento de reuniões." },
            { role: "Médico / Clínico Closer", desc: "Acesso a prontuários EHR, telemedicina, exames e agenda de pacientes." },
            { role: "Professor / Mentor", desc: "Acesso restrito ao módulo acadêmico, turmas, aulas e certificados." },
          ].map(r => {
            const isSelected = simulationRole === r.role;
            return (
              <button
                key={r.role}
                type="button"
                onClick={() => handleSwitchRole(r.role)}
                className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2 cursor-pointer ${
                  isSelected
                    ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)] text-[var(--color-text-primary)] font-bold shadow-xs"
                    : "bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-xs text-[var(--color-text-primary)]">{r.role}</span>
                  <span
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      isSelected ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]" : "border-slate-400"
                    }`}
                  >
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                </div>
                <span className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
                  {r.desc}
                </span>
              </button>
            );
          })}
        </div>

        <div className="p-3 bg-[var(--color-primary-blue)]/5 rounded-xl border border-[var(--color-primary-blue)]/15 text-[11px] text-[var(--color-text-muted)] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[var(--color-primary-blue)] shrink-0" />
          <span>
            <strong>Governança Multitenant:</strong> Cada alteração de módulo é isolada por tenant e persistida na coluna <code className="text-[var(--color-primary-blue)]">tenants.modules</code> no Supabase.
          </span>
        </div>
      </Card>
    </div>
  );
}
