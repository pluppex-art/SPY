import { Link, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Columns3, Plus, Search, Menu } from "lucide-react";

interface MobileNavProps {
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (val: boolean) => void;
}

/**
 * Barra inferior (celular e tablet, até 1023px) no padrão que o usuário já conhece de outros apps
 * (Lei de Jakob): início à esquerda, ação principal no centro, busca e "mais" à direita.
 * "Mais" abre o MESMO menu do hambúrguer da Topbar (Sidebar) — não existe um segundo menu.
 * Avisos ficam só no sino da Topbar (não duplicar).
 */
export function MobileNav({ isMobileSidebarOpen, setIsMobileSidebarOpen }: MobileNavProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const itemBase = "flex flex-col items-center justify-center min-h-12 my-2 rounded-2xl py-1 text-[11px] font-bold transition-all active:scale-95";
  const idle = "text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]";

  return (
    <nav aria-label="Navegação principal" className="lg:hidden fixed bottom-0 left-0 right-0 h-[calc(4.5rem+env(safe-area-inset-bottom))] bg-[var(--color-surface-elevated)]/95 backdrop-blur-lg border-t border-[var(--color-border-default)] rounded-t-[28px] grid grid-cols-5 items-center px-3 gap-1 z-40 pb-safe shadow-[0_-10px_30px_-12px_rgba(15,23,42,0.18)]">
      {[
        { name: "Painel", path: "/app/dashboard", icon: LayoutDashboard },
        { name: "Leads", path: "/app/crm/pipeline", icon: Columns3 },
      ].map((tab) => {
        const isActive = location.pathname.startsWith(tab.path);
        const TabIcon = tab.icon;
        return (
          <Link
            key={tab.name}
            to={tab.path}
            aria-current={isActive ? "page" : undefined}
            className={`${itemBase} relative ${isActive ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]" : idle}`}
          >
            <TabIcon className={`w-6 h-6 mb-0.5 transition-transform duration-200 ${isActive ? "text-[var(--color-primary-blue)] scale-110" : ""}`} />
            <span className={isActive ? "font-black text-[var(--color-primary-blue)]" : "font-semibold"}>{tab.name}</span>
            {isActive && <span className="absolute -top-2 w-10 h-1 bg-[var(--color-primary-blue)] rounded-b-full"></span>}
          </Link>
        );
      })}

      {/* Ação principal no centro: abre o cadastro de novo lead (o Pipeline abre o modal por ?novo=1). */}
      <button
        type="button"
        onClick={() => navigate("/app/crm/pipeline?novo=1")}
        aria-label="Novo lead"
        className="flex flex-col items-center justify-center min-h-12 my-2 text-[11px] font-semibold text-[var(--color-text-faint)] active:scale-95 transition-all"
      >
        <span className="-mt-5 mb-0.5 flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-primary-blue)] text-white shadow-lg shadow-[var(--color-primary-blue)]/30 border-4 border-[var(--color-surface-elevated)]">
          <Plus className="w-7 h-7" strokeWidth={2.5} />
        </span>
        <span>Novo lead</span>
      </button>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("spy:open-search"))}
        aria-label="Buscar"
        className={`${itemBase} ${idle}`}
      >
        <Search className="w-6 h-6 mb-0.5" />
        <span className="font-semibold">Buscar</span>
      </button>

      <button
        type="button"
        onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        aria-label="Mais opções"
        aria-expanded={isMobileSidebarOpen}
        className={`${itemBase} ${isMobileSidebarOpen ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]" : idle}`}
      >
        <Menu className="w-6 h-6 mb-0.5" />
        <span className="font-semibold">Mais</span>
      </button>
    </nav>
  );
}
