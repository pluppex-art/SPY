import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, PanelLeftClose, PanelLeftOpen, ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { useLocalization } from "../../contexts/LocalizationContext";

export interface SectionNavItem {
  title: string;
  path: string;
  icon?: LucideIcon;
  /** Item ainda não implementado — some com um rótulo "Em breve" e não navega. */
  soon?: boolean;
}

export interface SectionNavGroup {
  title: string;
  icon?: LucideIcon;
  items: SectionNavItem[];
}

interface SectionSidebarProps {
  heading: string;
  subheading?: string;
  groups: SectionNavGroup[];
  children: ReactNode;
}

/**
 * Shell de navegação secundária (sidebar colapsável desktop + dropdown mobile)
 * reutilizado por toda página que precisa de uma sub-navegação própria dentro
 * do app (Configurações, Financeiro...). Antes cada uma reimplementava isso do
 * zero com pequenas divergências de active-state/collapse; agora é um único
 * padrão visual e de comportamento.
 */
export function SectionSidebar({ heading, subheading, groups, children }: SectionSidebarProps) {
  const location = useLocation();
  const { t } = useLocalization();
  const [isHidden, setIsHidden] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");
  const activeItem = groups.flatMap((g) => g.items).find((i) => !i.soon && isActive(i.path));
  const ActiveIcon = activeItem?.icon ?? Menu;

  // Trocou de página (ou girou o aparelho pra desktop): fecha a folha do menu.
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  return (
    <div className="flex flex-col lg:flex-row h-full -m-4 md:-m-8 relative overflow-hidden">
      {isHidden && (
        <div className="absolute left-0 top-12 z-[60] hidden lg:block">
          <Button
            variant="outline"
            onClick={() => setIsHidden(false)}
            className="h-10 w-6 rounded-l-none p-0"
            title={t("Abrir menu")}
          >
            <PanelLeftOpen className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      <div
        style={{ width: isHidden ? 0 : 256, opacity: isHidden ? 0 : 1 }}
        className="hidden lg:flex shrink-0 bg-[var(--color-surface-sunken)] border-r border-[var(--color-border-default)] flex-col z-20 sticky top-0 h-full overflow-hidden transition-all duration-300 ease-in-out"
      >
        <div className="px-6 py-6 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-black text-[var(--color-text-primary)] tracking-tight">{t(heading)}</h2>
            {subheading && (
              <p className="text-[10px] text-[var(--color-text-faint)] uppercase font-bold tracking-wider mt-0.5">
                {t(subheading)}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsHidden(true)}
            className="h-7 w-7"
            title={t("Recolher menu")}
          >
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        </div>

        <nav className="flex flex-col overflow-y-auto pb-10 px-2 scrollbar-none">
          {groups.map((group) => (
            <SectionGroup key={group.title} group={group} isActive={isActive} />
          ))}
        </nav>
      </div>

      {/* Celular/tablet: uma barra com o NOME da página atual; tocar abre o menu numa folha por cima
          de tudo (portal), em vez de um dropdown preso dentro do container e brigando com a barra inferior. */}
      <div className="lg:hidden w-full bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-default)] shrink-0 z-20">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-haspopup="dialog"
          className="w-full px-4 py-2.5 flex items-center gap-3 text-left cursor-pointer border-none bg-transparent"
        >
          <span className="w-9 h-9 shrink-0 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center">
            <ActiveIcon className="w-4 h-4" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] leading-none">{t(heading)}</span>
            <span className="block text-sm font-black text-[var(--color-text-primary)] leading-tight mt-1 break-words">{t(activeItem?.title ?? heading)}</span>
          </span>
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] shrink-0">
            <Menu className="w-4 h-4" /> Menu
          </span>
        </button>
      </div>

      {mobileMenuOpen && createPortal(
        <div className="fixed inset-0 z-[90] lg:hidden" role="dialog" aria-modal="true" aria-label={t(heading)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] flex flex-col bg-[var(--color-surface-elevated)] border-t border-[var(--color-border-default)] rounded-t-[var(--radius-panel-lg)] shadow-[var(--shadow-panel)] animate-in slide-in-from-bottom duration-300">
            <div className="w-12 h-1 bg-[var(--color-border-default)] rounded-full mx-auto mt-2.5 shrink-0" />
            <div className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0">
              <div>
                <h2 className="text-base font-black text-[var(--color-text-primary)] tracking-tight">{t(heading)}</h2>
                {subheading && <p className="text-[10px] text-[var(--color-text-faint)] uppercase font-bold tracking-wider mt-0.5">{t(subheading)}</p>}
              </div>
              <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)} className="h-10 w-10" aria-label="Fechar menu">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="overflow-y-auto overscroll-contain px-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              {groups.map((group) => (
                <SectionGroup
                  key={group.title}
                  group={group}
                  isActive={isActive}
                  onItemClick={() => setMobileMenuOpen(false)}
                />
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}

      <div className="flex-1 overflow-y-auto p-4 lg:p-8 relative min-w-0 w-full">{children}</div>
    </div>
  );
}

function SectionGroup({
  group,
  isActive,
  onItemClick,
}: {
  group: SectionNavGroup;
  isActive: (path: string) => boolean;
  onItemClick?: () => void;
}) {
  const { t } = useLocalization();
  const GroupIcon = group.icon;
  // Começa FECHADO — exceto o grupo que contém a página atual, senão a pessoa
  // entraria numa tela sem ver onde está no menu. Estado local por grupo (desktop
  // e o dropdown mobile remontam independentes).
  const hasActive = group.items.some((item) => !item.soon && isActive(item.path));
  const [isOpen, setIsOpen] = useState(hasActive);
  // Navegar (por link de fora do menu) pra uma página deste grupo abre ele.
  useEffect(() => { if (hasActive) setIsOpen(true); }, [hasActive]);
  return (
    <div className="px-2 w-full mb-4 lg:mb-6 last:mb-0">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full px-4 py-2 lg:py-0 mb-1 lg:mb-2 flex items-center gap-2 text-[11px] font-bold text-[var(--color-text-faint)] uppercase tracking-widest hover:text-[var(--color-text-muted)] transition-colors cursor-pointer"
      >
        {GroupIcon && <GroupIcon className="w-4 h-4 shrink-0" />}
        <span className="flex-1 text-left">{t(group.title)}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 transition-transform duration-200", !isOpen && "-rotate-90")} />
      </button>
      {isOpen && (
      <div className="space-y-0.5 flex flex-col">
        {group.items.map((item) => {
          const active = isActive(item.path);
          const ItemIcon = item.icon;
          if (item.soon) {
            return (
              <div
                key={item.path}
                title={t("Em breve")}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm font-medium rounded-[var(--radius-control)] text-[var(--color-text-faint)] border border-transparent cursor-not-allowed opacity-60"
              >
                {ItemIcon && <ItemIcon className="w-4 h-4 shrink-0" />}
                <span className="truncate w-full text-left">{t(item.title)}</span>
                <span className="text-[8px] font-bold uppercase tracking-wider shrink-0 border border-[var(--color-border-default)] rounded px-1.5 py-0.5">
                  {t("Em breve")}
                </span>
              </div>
            );
          }
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onItemClick}
              className={cn(
                "w-full flex items-center gap-2.5 px-4 py-3 lg:py-2 text-sm font-medium rounded-[var(--radius-control)] transition-all",
                active
                  ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border border-[var(--color-primary-blue)]/20"
                  : "text-[var(--color-text-muted)] border border-transparent hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
              )}
            >
              {ItemIcon && <ItemIcon className="w-4 h-4 shrink-0" />}
              <span className="break-words lg:truncate w-full text-left leading-tight">{t(item.title)}</span>
            </Link>
          );
        })}
      </div>
      )}
    </div>
  );
}
