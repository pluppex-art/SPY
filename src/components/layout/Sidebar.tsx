import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Building2, MapPin, ChevronDown } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";

import { navSections, conditionCheckers, type NavReqCondition } from "./navData";
import { useUsaOsImplementacao } from "../../pages/os/hooks/useUsaOsImplementacao";
import { Logo } from "../ui/Logo";

interface SidebarProps {
  isSidebarCollapsed: boolean;
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (isOpen: boolean) => void;
  setIsSDRWebhookOpen: (isOpen: boolean) => void;
}

export function Sidebar({
  isSidebarCollapsed,
  isMobileSidebarOpen,
  setIsMobileSidebarOpen,
  setIsSDRWebhookOpen,
}: SidebarProps) {
  const location = useLocation();
  const {
    user, isModuleEnabled, tenantIdMap,
    activeTenantId, activeTenantName, switchTenant,
    activeFilialId, switchFilial,
  } = useAuth();
  const { cargos, empresaFiliais, tenantPrimaryColor } = useData();
  // Com o departamento Implementação na OS, o trabalho de implementar vive lá (não há segundo lugar no menu).
  const usaOsImplementacao = useUsaOsImplementacao();
  const { t } = useLocalization();
  // Achado de UX 2026-09-21: toda seção começava fechada em todo login/refresh
  // — o cliente via só títulos de categoria, sem nenhum link clicável, até
  // clicar manualmente em cada uma (a própria seção "Visão Geral", com o link
  // do Dashboard, também começava fechada). Abre por padrão a seção da rota
  // atual; navegações seguintes só adicionam a nova seção ativa, nunca fecham
  // uma que o usuário abriu manualmente.
  const sectionForPath = (pathname: string) =>
    navSections.find((section) => section.items.some((item) => pathname.startsWith(item.path)))?.title;

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const active = sectionForPath(location.pathname);
    return active ? { [active]: true } : {};
  });

  useEffect(() => {
    const active = sectionForPath(location.pathname);
    if (active) setOpenSections((prev) => (prev[active] ? prev : { ...prev, [active]: true }));
  }, [location.pathname]);

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  // Master vê e troca de cliente (tenant); usuário de organização parceira (partnerId
  // setado) também, mas só entre os tenants vinculados a ela em tenant_partners — RLS em
  // `tenants` (has_tenant_access) já restringe tenantIdMap a isso, então o front só checa o
  // papel. Admin do próprio tenant (ou master, dentro do cliente ativo) vê e troca de filial.
  const tenantOptions = Object.entries(tenantIdMap).map(([name, id]) => ({ id, name }));
  const canSwitchTenant = (!!user?.isMaster || !!user?.partnerId) && tenantOptions.length > 1;
  const canSwitchFilial = !!(user?.isMaster || user?.isTenantAdmin) && empresaFiliais.length > 0;
  const userCargo = cargos.find(c => c.nome === user?.role);
  const cargoModulos: string[] | null = userCargo && Array.isArray(userCargo.modulos) && userCargo.modulos.length > 0
    ? userCargo.modulos
    : null;
  const checkModule = (mod: string) => {
    if (mod === "automotivo" || mod === "concessionaria") return isModuleEnabled("automotivo") || isModuleEnabled("concessionaria");
    if (mod === "agenda") return isModuleEnabled("agenda") || isModuleEnabled("crm");
    if (mod === "documentos") return isModuleEnabled("documentos") || isModuleEnabled("crm");
    return isModuleEnabled(mod);
  };
  const canAccessModule = (mod: string) => {
    if (user?.isMaster) return checkModule(mod);
    if (!cargoModulos) return checkModule(mod);
    return checkModule(mod) && cargoModulos.some(m => m === mod || ((mod === "automotivo" || mod === "concessionaria") && (m === "automotivo" || m === "concessionaria")));
  };

  return (
    <>
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      <aside
        className={`
        fixed inset-y-0 left-0 z-50 lg:z-30 lg:relative lg:h-full
        ${isSidebarCollapsed ? "lg:w-20" : "lg:w-68"}
        ${isMobileSidebarOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0"}
        transition-all duration-300 ease-in-out border-r border-[var(--color-border-default)] bg-[var(--color-surface)] flex flex-col shrink-0 select-none
      `}
      >
        <div className="h-20 flex items-center justify-center px-3 py-2.5 shrink-0 border-b border-[var(--color-border-subtle)]">
          <Link
            to="/app"
            className={`logo-image-container sidebar-logo-header flex items-center justify-center w-full h-full rounded-xl bg-transparent dark:bg-[var(--color-primary-blue)]/15 dark:border dark:border-[var(--color-primary-blue)]/25 dark:shadow-[0_0_20px_-6px_var(--color-primary-blue)] transition-all ${isSidebarCollapsed ? "mx-auto" : ""}`}
          >
            {isSidebarCollapsed ? (
              <div className="w-10 h-10 rounded-lg flex items-center justify-center">
                <Logo variant="icon" size={34} color={tenantPrimaryColor} />
              </div>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center overflow-hidden px-2">
                <Logo variant="full" size={30} color={tenantPrimaryColor} />
              </div>
            )}
          </Link>
        </div>

        {!isSidebarCollapsed && (canSwitchTenant || canSwitchFilial) && (
          <div className="px-2 pt-2 pb-1 space-y-0.5 shrink-0">
            {canSwitchTenant ? (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-control)] hover:bg-[var(--color-surface-sunken)] transition-colors" title="Trocar de cliente">
                <Building2 className="w-4 h-4 text-[var(--color-primary-blue)] shrink-0" />
                <select
                  className="appearance-none bg-transparent border-none outline-none shadow-none ring-0 text-[var(--color-text-primary)] focus:outline-none focus:ring-0 focus:shadow-none text-xs font-bold cursor-pointer w-full truncate"
                  value={activeTenantId || ""}
                  onChange={(e) => {
                    const opt = tenantOptions.find(t => t.id === e.target.value);
                    if (opt) switchTenant(opt.id, opt.name);
                  }}
                >
                  {tenantOptions.map(t => (
                    <option key={t.id} value={t.id} className="bg-[var(--color-surface)]">{t.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="text-xs text-[var(--color-text-muted)] font-bold truncate flex items-center gap-2.5 px-3 py-2">
                <Building2 className="w-4 h-4 shrink-0 text-[var(--color-text-faint)]" />
                {activeTenantName || user?.tenantName || "S.P.Y. Gestão Corporativa"}
              </div>
            )}

            {canSwitchFilial && (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-control)] hover:bg-[var(--color-surface-sunken)] transition-colors" title="Trocar de filial">
                <MapPin className="w-4 h-4 text-[var(--color-text-faint)] shrink-0" />
                <select
                  className="appearance-none bg-transparent border-none outline-none shadow-none ring-0 text-[var(--color-text-primary)] focus:outline-none focus:ring-0 focus:shadow-none text-xs font-bold cursor-pointer w-full truncate"
                  value={activeFilialId || ""}
                  onChange={(e) => {
                    const filial = empresaFiliais.find((f: any) => f.id === e.target.value);
                    switchFilial(filial ? { id: filial.id, name: filial.nome } : null);
                  }}
                >
                  <option value="" className="bg-[var(--color-surface)]">Todas as filiais</option>
                  {empresaFiliais.map((f: any) => (
                    <option key={f.id} value={f.id} className="bg-[var(--color-surface)]">{f.nome}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 scrollbar-thin">
          {navSections
            .map((section) => {
              if (section.reqModule && !canAccessModule(section.reqModule)) {
                return null;
              }

              const visibleItems = section.items.filter((item: any) => {
                if (item.reqModule && item.reqModule !== 'master' && !canAccessModule(item.reqModule)) return false;
                if (item.reqModule === 'master' && !user?.isMaster) return false;
                if (item.reqCondition && !conditionCheckers[item.reqCondition as NavReqCondition](user)) return false;
                if (item.hideWhen === 'os-implementacao' && usaOsImplementacao) return false;
                return true;
              });

              if (visibleItems.length === 0) return null;

              return { ...section, items: visibleItems };
            })
            .filter(Boolean)
            .map((section: any, idx) => {
              const isOpen = isSidebarCollapsed || !!openSections[section.title];

              return (
              <div key={idx} className="space-y-1">
                {!isSidebarCollapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleSection(section.title)}
                    className="w-full px-2.5 text-[10px] font-black text-[var(--color-text-faint)] uppercase tracking-wider mb-1.5 flex items-center justify-between cursor-pointer bg-transparent border-none hover:text-[var(--color-text-muted)] transition-colors"
                  >
                    <span>{t(section.title)}</span>
                    <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                ) : (
                  <div className="h-2"></div>
                )}
                {isOpen && section.items.map((item: any) => {
                  const isActive = item.path ? location.pathname === item.path || (item.path !== '/app/dashboard' && item.path !== '/app' && location.pathname.startsWith(item.path)) : false;

                  const btnContent = (
                    <button
                      type="button"
                      className={`w-full flex items-center ${isSidebarCollapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2"} text-xs font-bold rounded-[var(--radius-control)] transition-all cursor-pointer border-none text-left ${
                        isActive
                          ? "bg-[var(--color-primary-blue)] !text-white font-bold shadow-md shadow-[var(--color-primary-blue)]/25"
                          : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
                      }`}
                    >
                      <item.icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? "!text-white" : "text-[var(--color-text-faint)]"}`} />
                      {!isSidebarCollapsed && (
                        <span className={`truncate ${isActive ? "!text-white" : ""}`}>{t(item.name)}</span>
                      )}
                    </button>
                  );

                  if (item.action) {
                    return (
                      <div
                        key={item.name}
                        title={isSidebarCollapsed ? t(item.name) : undefined}
                        className="cursor-pointer"
                        onClick={() => {
                          if (item.action === "sdr-webhooks") setIsSDRWebhookOpen(true);
                          setIsMobileSidebarOpen(false);
                        }}
                      >
                        {btnContent}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.name}
                      to={item.path}
                      title={isSidebarCollapsed ? t(item.name) : undefined}
                      onClick={() => setIsMobileSidebarOpen(false)}
                      className="block"
                    >
                      {btnContent}
                    </Link>
                  );
                })}
              </div>
              );
            })}
        </div>

      </aside>
    </>
  );
}
