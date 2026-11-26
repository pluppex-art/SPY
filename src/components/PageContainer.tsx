import { ReactNode, useState } from "react";
import { ChevronRight, Home } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { navSections } from "./layout/navData";
import { HelpTip } from "./ui/help-tip";
import { HeaderSlotContext } from "./ui/header-slot";

interface PageContainerProps {
  children: ReactNode;
  title: string;
  description?: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumb?: { label: string; path?: string }[];
}

export function PageContainer({ 
  children, 
  title, 
  description,
  subtitle,
  actions,
  breadcrumb 
}: PageContainerProps) {
  const displayDescription = description || subtitle;
  const { pathname } = useLocation();
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);

  // Sem caminho informado pela tela: monta "Início › Seção › Tela" pela seção do menu a que a rota pertence
  // (a seção do item cujo caminho é o maior prefixo da rota atual). Se a tela é o próprio item do menu, não repete.
  const secao = (() => {
    if (breadcrumb) return null;
    let melhor: { sec: string; path: string; name: string; len: number } | null = null;
    for (const sec of navSections as any[]) {
      for (const it of sec.items as any[]) {
        if (!it.path || it.path === "/app/dashboard" || it.path === "/app") continue;
        if ((pathname === it.path || pathname.startsWith(it.path + "/")) && (!melhor || it.path.length > melhor.len)) {
          melhor = { sec: sec.title, path: it.path, name: it.name, len: it.path.length };
        }
      }
    }
    return melhor && melhor.name !== title && melhor.sec !== title ? melhor : null;
  })();

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
        <div className="min-w-0">
          {/* Breadcrumb Pattern */}
          <div className={`${breadcrumb ? "" : "max-md:hidden"} flex items-center gap-1.5 text-[10px] text-[var(--color-text-faint)] font-bold uppercase tracking-widest mb-2 overflow-x-auto whitespace-nowrap scrollbar-none`}>
            <Link to="/app/dashboard" className="hover:text-[var(--color-text-primary)] transition-colors flex items-center gap-1">
              <Home className="w-3 h-3 text-[var(--color-text-muted)]" /> Início
            </Link>
            {breadcrumb?.map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <ChevronRight className="w-3 h-3 text-[var(--color-text-faint)]" />
                {item.path ? (
                  <Link to={item.path} className="hover:text-[var(--color-text-primary)] transition-colors">{item.label}</Link>
                ) : (
                  <span className="text-[var(--color-primary-blue)] font-black">{item.label}</span>
                )}
              </div>
            ))}
            {!breadcrumb && secao && (
              <>
                <ChevronRight className="w-3 h-3 text-[var(--color-text-faint)]" />
                <Link to={secao.path} className="hover:text-[var(--color-text-primary)] transition-colors">{secao.sec}</Link>
              </>
            )}
            {!breadcrumb && (
               <>
                <ChevronRight className="w-3 h-3 text-[var(--color-text-faint)]" />
                <span className="text-[var(--color-primary-blue)] font-black">{title}</span>
               </>
            )}
          </div>

          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-[var(--color-text-primary)] flex items-center gap-3 break-words">
            {title}
            {displayDescription && <HelpTip label={`Sobre ${title}`}>{displayDescription}</HelpTip>}
            <span className="w-2 h-2 rounded-full bg-[var(--color-primary-blue)] animate-pulse hidden md:inline-block"></span>
          </h1>
        </div>
        
        {/* Sem ações, a área só aparece se a tela colocar algum botão nela (ex.: "Indicadores"). */}
        <div className={`${actions ? "flex" : "hidden has-[button]:flex"} flex-wrap items-center gap-2 sm:gap-3 shrink-0 w-full md:w-auto max-md:[&>div]:flex-wrap max-md:[&>div]:w-full max-md:[&_button]:whitespace-nowrap`}>
          <div ref={setHeaderSlot} className="contents" />
          {actions}
        </div>
      </div>

      {/* Page Content */}
      <div className="relative pt-1">
        <HeaderSlotContext.Provider value={headerSlot}>{children}</HeaderSlotContext.Provider>
      </div>
    </div>
  );
}
