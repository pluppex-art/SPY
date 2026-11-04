import { ReactNode } from "react";
import { ChevronRight, Home } from "lucide-react";
import { Link } from "react-router-dom";

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

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
        <div className="min-w-0">
          {/* Breadcrumb Pattern */}
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-faint)] font-bold uppercase tracking-widest mb-2 overflow-x-auto whitespace-nowrap scrollbar-none">
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
            {!breadcrumb && (
               <>
                <ChevronRight className="w-3 h-3 text-[var(--color-text-faint)]" />
                <span className="text-[var(--color-primary-blue)] font-black">{title}</span>
               </>
            )}
          </div>

          <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-[var(--color-text-primary)] flex items-center gap-3 break-words">
            {title}
            <span className="w-2 h-2 rounded-full bg-[var(--color-primary-blue)] animate-pulse hidden md:inline-block"></span>
          </h1>
          {displayDescription && (
            <p className="text-[var(--color-text-muted)] text-sm mt-1 max-w-2xl font-medium leading-relaxed">{displayDescription}</p>
          )}
        </div>
        
        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0 w-full md:w-auto">
            {actions}
          </div>
        )}
      </div>

      {/* Page Content */}
      <div className="relative pt-1">
        {children}
      </div>
    </div>
  );
}
