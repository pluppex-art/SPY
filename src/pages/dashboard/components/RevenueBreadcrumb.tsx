import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export function RevenueBreadcrumb({ current }: { current: string }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-[var(--color-text-faint)] font-semibold">
      <Link to="/app/dashboard" className="hover:text-[var(--color-text-primary)] transition-colors">Início</Link>
      <ChevronRight className="w-3 h-3" />
      <Link to="/app/dashboard" className="hover:text-[var(--color-text-primary)] transition-colors">Central de Receita</Link>
      <ChevronRight className="w-3 h-3" />
      <span className="text-[var(--color-text-primary)] font-bold">{current}</span>
    </nav>
  );
}
