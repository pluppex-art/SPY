import React, { useState, useEffect, useMemo } from "react";
import {
  Search, Server, Plus, Settings, ShieldCheck, CheckCircle2,
  RefreshCw, Building2, Pencil, Trash2, KeyRound, ExternalLink,
  Layers, LayoutGrid, ListFilter, Users, Filter, X, Eye
} from "lucide-react";
import {
  fetchTenantsDetailed,
  updateTenantInfo,
  deactivateTenant,
  fetchTenantAdminUser,
  updateTenantUserCredentials,
  PLUPPEX_TENANT_ID,
} from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import { confirmDialog } from "../../../components/ui/confirm-dialog";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { toast } from "sonner";

interface TenantItem {
  id: string;
  name: string;
  niche: string;
  primary_color?: string | null;
  status?: string;
}

const NICHES_LIST = [
  "Todos",
  "Tecnologia",
  "Solar",
  "Imobiliária",
  "Clínica",
  "Educação",
  "Agronegócio",
  "Varejo",
  "Concessionária",
  "Parceira",
];

interface AdminTenantsTabProps {
  onConfigureModules: (tenantName: string) => void;
  onOpenNewTenant: () => void;
  reloadTrigger?: number;
}

export function AdminTenantsTab({
  onConfigureModules,
  onOpenNewTenant,
  reloadTrigger,
}: AdminTenantsTabProps) {
  const { user, login, getTenantModules, tenantIdMap } = useAuth();
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedNiche, setSelectedNiche] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [loading, setLoading] = useState(true);

  // Edit Modal State
  const [editingTenant, setEditingTenant] = useState<TenantItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editNiche, setEditNiche] = useState("Tecnologia");
  const [editAdminUserId, setEditAdminUserId] = useState<string | null>(null);
  const [editAdminEmail, setEditAdminEmail] = useState("");
  const [editAdminPassword, setEditAdminPassword] = useState("");
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const loadTenants = async () => {
    setLoading(true);
    try {
      const data = await fetchTenantsDetailed();
      if (data && data.length > 0) {
        setTenants(data.map(d => ({ ...d, status: (d as any).status || "Active" })));
      } else {
        const names = Object.keys(tenantIdMap || {});
        if (names.length > 0) {
          setTenants(names.map(name => ({
            id: tenantIdMap[name] || name.toLowerCase().replace(/\s+/g, "-"),
            name,
            niche: (tenantIdMap[name] || "") === PLUPPEX_TENANT_ID ? "Tecnologia" : "Parceira",
            status: "Active"
          })));
        } else {
          setTenants([]);
        }
      }
    } catch {
      const names = Object.keys(tenantIdMap || {});
      setTenants(names.map(name => ({
        id: tenantIdMap[name] || name.toLowerCase().replace(/\s+/g, "-"),
        name,
        niche: (tenantIdMap[name] || "") === PLUPPEX_TENANT_ID ? "Tecnologia" : "Parceira",
        status: "Active"
      })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, [reloadTrigger]);

  const handleOpenEdit = async (tenant: TenantItem) => {
    setEditingTenant(tenant);
    setEditName(tenant.name);
    setEditNiche(tenant.niche || "Tecnologia");
    setEditAdminEmail("");
    setEditAdminPassword("");
    setEditAdminUserId(null);

    setLoadingAdmin(true);
    try {
      const res = await fetchTenantAdminUser(tenant.id);
      if (res.success && res.user) {
        setEditAdminUserId(res.user.id);
        setEditAdminEmail(res.user.email);
      }
    } catch {
      // no-op
    } finally {
      setLoadingAdmin(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingTenant) return;
    if (!editName.trim()) {
      toast.error("Nome da empresa é obrigatório.");
      return;
    }
    if (editAdminPassword && editAdminPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setSavingEdit(true);
    try {
      const resInfo = await updateTenantInfo(editingTenant.id, {
        name: editName.trim(),
        niche: editNiche,
      });

      if (!resInfo.success) {
        toast.error(`Erro ao atualizar dados: ${resInfo.error}`);
        setSavingEdit(false);
        return;
      }

      if (editAdminUserId && (editAdminEmail.trim() || editAdminPassword)) {
        const credUpdates: { email?: string; password?: string } = {};
        if (editAdminEmail.trim()) credUpdates.email = editAdminEmail.trim();
        if (editAdminPassword) credUpdates.password = editAdminPassword;

        const resCred = await updateTenantUserCredentials(editAdminUserId, credUpdates);
        if (!resCred.success) {
          toast.warning(`Dados salvos, mas houve aviso nas credenciais: ${resCred.error}`);
        }
      }

      toast.success(`Empresa "${editName}" atualizada com sucesso!`);
      setEditingTenant(null);
      await loadTenants();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar alterações.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeactivate = async (tenant: TenantItem) => {
    if (tenant.id === PLUPPEX_TENANT_ID) {
      toast.error("Esta é a instância master (Pluppex, raiz do sistema) e não pode ser desativada.");
      return;
    }

    const confirmed = await confirmDialog({
      title: `Desativar empresa "${tenant.name}"?`,
      description: "A empresa terá seus acessos suspensos imediatamente. Os dados permanecem isolados e seguros no banco de dados.",
      confirmText: "Confirmar Desativação",
    });

    if (!confirmed) return;

    try {
      const res = await deactivateTenant(tenant.id);
      if (res.success) {
        toast.success(`Empresa "${tenant.name}" desativada.`);
        await loadTenants();
      } else {
        toast.error(res.error || "Erro ao desativar empresa.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro na conexão.");
    }
  };

  const handleSimulateAccess = (tenantName: string) => {
    if (!user) return;
    login({
      ...user,
      tenantName,
      tenantId: tenants.find(t => t.name === tenantName)?.id || user.tenantId,
    });
    toast.info(`Ambiente alternado para: ${tenantName}`);
  };

  const filteredTenants = useMemo(() => {
    return tenants.filter(t => {
      const q = search.toLowerCase();
      const matchSearch =
        t.name.toLowerCase().includes(q) ||
        (t.niche && t.niche.toLowerCase().includes(q)) ||
        t.id.toLowerCase().includes(q);

      const matchNiche = selectedNiche === "Todos" || t.niche?.toLowerCase() === selectedNiche.toLowerCase();
      const matchStatus = statusFilter === "all" || (statusFilter === "active" ? t.status === "Active" : t.status !== "Active");

      return matchSearch && matchNiche && matchStatus;
    });
  }, [tenants, search, selectedNiche, statusFilter]);

  const getNicheBadgeStyle = (niche: string) => {
    switch (niche?.toLowerCase()) {
      case "solar":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "imobiliária":
      case "imobiliaria":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "clínica":
      case "clinica":
        return "bg-teal-500/10 text-teal-500 border-teal-500/20";
      case "educação":
      case "educacao":
        return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
      case "varejo":
        return "bg-pink-500/10 text-pink-500 border-pink-500/20";
      case "concessionária":
      case "concessionaria":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      default:
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Bar */}
      <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] p-4 rounded-2xl space-y-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por Nome, Nicho ou Tenant ID..."
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl pl-9 pr-9 py-2.5 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-primary-blue)] focus:ring-1 focus:ring-[var(--color-primary-blue)] transition-all font-medium"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action Buttons & View Mode */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle */}
            <div className="flex items-center p-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                title="Visualização em Grade"
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === "grid"
                    ? "bg-[var(--color-surface)] text-[var(--color-primary-blue)] shadow-xs"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                title="Visualização em Tabela"
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === "table"
                    ? "bg-[var(--color-surface)] text-[var(--color-primary-blue)] shadow-xs"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                <ListFilter className="w-4 h-4" />
              </button>
            </div>

            {/* Refresh */}
            <button
              type="button"
              onClick={loadTenants}
              disabled={loading}
              title="Recarregar lista do banco"
              className="p-2.5 bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[var(--color-primary-blue)]" : ""}`} />
            </button>

            {/* Novo Tenant */}
            <button
              type="button"
              onClick={onOpenNewTenant}
              className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary-blue)] hover:opacity-95 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-[var(--color-primary-blue)]/20 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Novo Tenant
            </button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none pt-2 border-t border-[var(--color-border-subtle)]">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] mr-2 flex items-center gap-1 shrink-0">
            <Filter className="w-3 h-3" /> Nicho:
          </span>
          {NICHES_LIST.map(niche => (
            <button
              key={niche}
              type="button"
              onClick={() => setSelectedNiche(niche)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                selectedNiche === niche
                  ? "bg-[var(--color-primary-blue)] text-white shadow-xs"
                  : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-default)]"
              }`}
            >
              {niche}
            </button>
          ))}
        </div>
      </div>

      {/* Tenants Grid or Table */}
      {loading ? (
        <div className="bg-[var(--color-surface-elevated)] rounded-3xl border border-[var(--color-border-default)] min-h-[320px] flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 text-[var(--color-primary-blue)] animate-spin" />
          <span className="text-xs font-bold text-[var(--color-text-muted)]">Carregando instâncias e módulos...</span>
        </div>
      ) : filteredTenants.length === 0 ? (
        <div className="bg-[var(--color-surface-elevated)] rounded-3xl border border-[var(--color-border-default)] min-h-[320px] flex flex-col items-center justify-center p-8 text-center gap-3">
          <Server className="w-12 h-12 text-[var(--color-text-faint)]" />
          <h4 className="text-sm font-black text-[var(--color-text-primary)] uppercase tracking-wider">
            Nenhuma Instância Encontrada
          </h4>
          <p className="text-xs text-[var(--color-text-muted)] max-w-sm">
            Nenhum tenant corresponde à busca "{search}". Cadastre um novo tenant ou limpe os filtros.
          </p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => { setSearch(""); setSelectedNiche("Todos"); }}>
              Limpar Filtros
            </Button>
            <Button size="sm" onClick={onOpenNewTenant}>
              Cadastrar Tenant
            </Button>
          </div>
        </div>
      ) : viewMode === "grid" ? (
        /* Grid Mode */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTenants.map(tenant => {
            const isMaster = tenant.id === PLUPPEX_TENANT_ID;
            const mods = getTenantModules(tenant.name);
            const activeModsCount = Object.values(mods).filter(Boolean).length;
            const nicheBadge = getNicheBadgeStyle(tenant.niche);

            return (
              <div
                key={tenant.id}
                className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/50 rounded-2xl p-5 space-y-4 transition-all hover:shadow-md group flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center shrink-0 text-[var(--color-primary-blue)] group-hover:scale-105 transition-transform">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-black text-[var(--color-text-primary)] truncate group-hover:text-[var(--color-primary-blue)] transition-colors">
                          {tenant.name}
                        </h4>
                        <p className="text-[10px] text-[var(--color-text-muted)] font-mono truncate mt-0.5">
                          ID: {tenant.id}
                        </p>
                      </div>
                    </div>

                    <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Ativo
                    </span>
                  </div>

                  {/* Attributes Badges */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--color-border-subtle)] text-xs">
                    <div>
                      <span className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block">
                        Nicho de Mercado
                      </span>
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border mt-1 ${nicheBadge}`}>
                        {tenant.niche || "Geral"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block">
                        Segurança RLS
                      </span>
                      <span className="font-bold text-emerald-500 text-[11px] flex items-center gap-1 mt-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> Isolamento Ativo
                      </span>
                    </div>
                  </div>

                  {/* Active Modules Progress Bar */}
                  <div className="pt-2 border-t border-[var(--color-border-subtle)] space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-1">
                        <Layers className="w-3 h-3 text-[var(--color-primary-blue)]" /> Módulos Habilitados
                      </span>
                      <span className="font-black text-xs text-[var(--color-text-primary)]">
                        {activeModsCount} <span className="text-[var(--color-text-muted)] font-normal">/ 16</span>
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden border border-[var(--color-border-subtle)]">
                      <div
                        className="h-full bg-[var(--color-primary-blue)] rounded-full transition-all duration-500"
                        style={{ width: `${(activeModsCount / 16) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-3 border-t border-[var(--color-border-subtle)] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onConfigureModules(tenant.name)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-[var(--color-primary-blue)] hover:opacity-95 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" /> Módulos
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(tenant)}
                    title="Editar dados e credenciais de administrador"
                    className="p-2 bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" />
                  </button>

                  {!isMaster && (
                    <button
                      type="button"
                      onClick={() => handleDeactivate(tenant)}
                      title="Desativar instância parceira"
                      className="p-2 bg-[var(--color-surface-sunken)] hover:bg-rose-500/10 border border-[var(--color-border-default)] hover:border-rose-500/30 text-[var(--color-text-muted)] hover:text-rose-500 rounded-xl transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table Mode */
        <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-default)] text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
                <tr>
                  <th className="py-3 px-4">Organização / Tenant</th>
                  <th className="py-3 px-4">Nicho</th>
                  <th className="py-3 px-4">Módulos Ativos</th>
                  <th className="py-3 px-4">Segurança & RLS</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {filteredTenants.map(tenant => {
                  const isMaster = tenant.id === PLUPPEX_TENANT_ID;
                  const mods = getTenantModules(tenant.name);
                  const activeModsCount = Object.values(mods).filter(Boolean).length;
                  const nicheBadge = getNicheBadgeStyle(tenant.niche);

                  return (
                    <tr key={tenant.id} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center text-[var(--color-primary-blue)] shrink-0 font-bold">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-[var(--color-text-primary)] block truncate">
                              {tenant.name}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--color-text-muted)] truncate block">
                              {tenant.id}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${nicheBadge}`}>
                          {tenant.niche || "Geral"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[var(--color-primary-blue)]">
                            {activeModsCount}/16
                          </span>
                          <div className="w-20 h-1.5 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden border border-[var(--color-border-subtle)]">
                            <div
                              className="h-full bg-[var(--color-primary-blue)] rounded-full"
                              style={{ width: `${(activeModsCount / 16) * 100}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-emerald-500">
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" /> RLS Ativo
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Ativo
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onConfigureModules(tenant.name)}
                            className="px-2.5 py-1 bg-[var(--color-primary-blue)] text-white rounded-lg text-xs font-bold hover:opacity-90 transition-all cursor-pointer"
                          >
                            Módulos
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(tenant)}
                            title="Editar Dados"
                            className="p-1.5 bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" />
                          </button>
                          {!isMaster && (
                            <button
                              type="button"
                              onClick={() => handleDeactivate(tenant)}
                              title="Desativar"
                              className="p-1.5 bg-[var(--color-surface-sunken)] hover:bg-rose-500/10 border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-rose-500 rounded-lg transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Tenant & Admin Credentials Modal */}
      {editingTenant && (
        <Modal
          isOpen={true}
          onClose={() => setEditingTenant(null)}
          title={
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center text-[var(--color-primary-blue)]">
                <Pencil className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--color-text-primary)]">
                  Editar Empresa: {editingTenant.name}
                </h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mt-0.5">
                  Atualização cadastral e credenciais administrativas
                </p>
              </div>
            </div>
          }
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button variant="outline" onClick={() => setEditingTenant(null)} disabled={savingEdit}>
                Cancelar
              </Button>
              <Button onClick={handleSaveEdit} disabled={savingEdit} className="px-6 font-bold">
                {savingEdit ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block mb-1">
                Nome da Empresa / Instância *
              </label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)] focus:ring-1 focus:ring-[var(--color-primary-blue)]"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block mb-1">
                Nicho / Vertical de Negócio
              </label>
              <select
                value={editNiche}
                onChange={e => setEditNiche(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)] cursor-pointer"
              >
                {NICHES_LIST.filter(n => n !== "Todos").map(n => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            {/* Admin Credentials Section */}
            <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Credenciais do Administrador
                </span>
                {loadingAdmin && (
                  <span className="text-[10px] text-[var(--color-text-muted)] animate-pulse">
                    Consultando administrador...
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block mb-1">
                    E-mail do Administrador
                  </label>
                  <input
                    type="email"
                    value={editAdminEmail}
                    onChange={e => setEditAdminEmail(e.target.value)}
                    placeholder="admin@empresa.com"
                    disabled={loadingAdmin}
                    className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block mb-1">
                    Nova Senha (opcional)
                  </label>
                  <input
                    type="password"
                    value={editAdminPassword}
                    onChange={e => setEditAdminPassword(e.target.value)}
                    placeholder="Deixe em branco para manter"
                    disabled={loadingAdmin}
                    className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                  />
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
