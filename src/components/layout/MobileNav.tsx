import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import {
  LayoutDashboard,
  Columns3,
  Users,
  Search,
  Settings2,
  AlertCircle,
} from "lucide-react";
import { navSections, conditionCheckers, type NavReqCondition } from "./navData";
import { useUsaOsImplementacao } from "../../pages/os/hooks/useUsaOsImplementacao";
import { cargoPermiteModulo } from "../../lib/accessControl";

interface MobileNavProps {
  isMobileMoreOpen: boolean;
  setIsMobileMoreOpen: (val: boolean) => void;
  setIsSDRWebhookOpen: (val: boolean) => void;
}

export function MobileNav({ isMobileMoreOpen, setIsMobileMoreOpen, setIsSDRWebhookOpen }: MobileNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user, isModuleEnabled } = useAuth();
  const { cargos } = useData();
  const usaOsImplementacao = useUsaOsImplementacao();

  const userCargo = cargos.find((c: any) => c.nome === user?.role);
  const cargoModulos: string[] | null = userCargo && Array.isArray(userCargo.modulos) && userCargo.modulos.length > 0
    ? userCargo.modulos
    : null;
  const checkModule = (mod: string) => {
    if (mod === "automotivo" || mod === "concessionaria") return isModuleEnabled("automotivo") || isModuleEnabled("concessionaria");
    if (mod === "catalogo-produtos") return isModuleEnabled("catalogo") || isModuleEnabled("imobiliaria") || isModuleEnabled("automotivo") || isModuleEnabled("concessionaria") || isModuleEnabled("varejo");
    if (mod === "agenda") return isModuleEnabled("agenda") || isModuleEnabled("crm");
    if (mod === "documentos") return isModuleEnabled("documentos") || isModuleEnabled("crm");
    return isModuleEnabled(mod as any);
  };
  const canAccessModule = (mod: string) => {
    if (user?.isMaster) return checkModule(mod);
    if (!cargoModulos) return checkModule(mod);
    return checkModule(mod) && cargoPermiteModulo(cargoModulos, mod);
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[calc(4.5rem+env(safe-area-inset-bottom))] bg-[var(--color-surface-elevated)]/95 backdrop-blur-lg border-t border-[var(--color-border-default)] rounded-t-[28px] flex items-center justify-around px-3 gap-1 z-40 pb-safe shadow-[0_-10px_30px_-12px_rgba(15,23,42,0.18)]">
        {[
          { name: "Painel", path: "/app/dashboard", icon: LayoutDashboard },
          { name: "Leads", path: "/app/crm/pipeline", icon: Columns3 },
          { name: "Clientes", path: "/app/crm/clientes", icon: Users },
        ].map((tab) => {
          const isActive = location.pathname.startsWith(tab.path);
          const TabIcon = tab.icon;
          return (
            <Link
              key={tab.name}
              to={tab.path}
              className={`flex flex-col items-center justify-center flex-1 h-[calc(100%-1rem)] my-2 rounded-2xl py-1 text-[11px] font-bold transition-all relative active:scale-95 ${isActive ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]" : "text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]"}`}
            >
              <TabIcon className={`w-6 h-6 mb-0.5 transition-transform duration-200 ${isActive ? "text-[var(--color-primary-blue)] scale-110" : ""}`} />
              <span className={isActive ? "font-black text-[var(--color-primary-blue)] transition-all" : "font-semibold"}>
                {tab.name}
              </span>
              {isActive && <span className="absolute -top-2 w-10 h-1 bg-[var(--color-primary-blue)] rounded-b-full"></span>}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("spy:open-search"))}
          aria-label="Buscar"
          className="flex flex-col items-center justify-center flex-1 h-[calc(100%-1rem)] my-2 rounded-2xl py-1 text-[11px] font-bold transition-all active:scale-95 text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]"
        >
          <Search className="w-6 h-6 mb-0.5" />
          <span className="font-semibold">Buscar</span>
        </button>
      </nav>

      {isMobileMoreOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200" onClick={() => setIsMobileMoreOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-[var(--color-surface-elevated)] border-t border-[var(--color-border-default)] rounded-t-[var(--radius-panel-lg)] max-h-[85dvh] overflow-y-auto overscroll-contain p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] flex flex-col gap-4 shadow-[var(--shadow-panel)] animate-in slide-in-from-bottom duration-300">
            <div className="w-12 h-1 bg-[var(--color-border-default)] rounded-full mx-auto mb-2 shrink-0"></div>

            <div className="flex justify-between items-center mb-1 shrink-0">
              <h3 className="text-xs font-black text-[var(--color-accent)] uppercase tracking-widest">
                Navegação Completa
              </h3>
              <button className="text-[10px] font-bold bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] hover:bg-[var(--color-border-subtle)] px-3.5 py-1.5 rounded-[var(--radius-control)] text-[var(--color-text-muted)] transition-colors uppercase tracking-wider" onClick={() => setIsMobileMoreOpen(false)}>
                Fechar
              </button>
            </div>

            <div className="space-y-6 overflow-y-auto">
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
                .map((section: any, idx) => (
                <div key={idx} className="space-y-2.5 border-t border-[var(--color-border-subtle)] pt-4 first:border-none first:pt-0">
                  <div className="text-[10px] font-black text-[var(--color-text-faint)] uppercase tracking-widest">{section.title}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {section.items.map((item: any) => {
                      const isActive = item.path ? location.pathname.startsWith(item.path) : false;
                      const ItemIcon = item.icon;
                      const btnClass = `flex items-center gap-2 px-3 py-3 min-h-11 text-xs font-semibold rounded-[var(--radius-control)] border transition-all ${isActive ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/20 font-black" : "text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"}`;

                      if (item.action) {
                        return (
                          <button
                            key={item.name}
                            onClick={() => {
                              if (item.action === "sdr-webhooks") setIsSDRWebhookOpen(true);
                              setIsMobileMoreOpen(false);
                            }}
                            className={btnClass}
                          >
                            <ItemIcon className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
                            <span className="leading-tight break-words min-w-0">{item.name}</span>
                          </button>
                        );
                      }

                      return (
                        <Link key={item.name} to={item.path} onClick={() => setIsMobileMoreOpen(false)} className={btnClass}>
                          <ItemIcon className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
                          <span className="leading-tight break-words min-w-0">{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="space-y-2.5 border-t border-[var(--color-border-subtle)] pt-4">
                <div className="text-[10px] font-black text-[var(--color-text-faint)] uppercase tracking-widest">Conta & Configurações</div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setIsMobileMoreOpen(false); navigate("/app/configuracoes"); }} className="flex items-center gap-2 px-3 py-3 min-h-11 text-xs font-semibold rounded-[var(--radius-control)] border border-transparent hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] w-full text-left">
                    <Settings2 className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
                    <span className="truncate">Configurações</span>
                  </button>
                  <button onClick={() => { setIsMobileMoreOpen(false); handleLogout(); }} className="flex items-center gap-2 px-3 py-3 min-h-11 text-xs font-semibold rounded-[var(--radius-control)] border border-transparent bg-danger/5 hover:bg-danger/10 text-danger w-full text-left">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="truncate">Sair</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
