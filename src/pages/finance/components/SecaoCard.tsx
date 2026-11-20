import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { cn } from "../../../lib/utils";

/**
 * Cartão de seção do Financeiro: faixa de título (ícone + nome em maiúsculas, como as colunas dos
 * mapas do NFC), ação opcional à direita e o conteúdo embaixo. É o bloco-base de todas as páginas.
 */
export function SecaoCard({
  titulo,
  icon: Icon,
  acao,
  children,
  semPadding,
  className,
}: {
  titulo: string;
  icon?: LucideIcon;
  acao?: { label: string; to: string };
  children: ReactNode;
  semPadding?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col overflow-hidden", className)}>
      <header className="flex items-center gap-2 border-b border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] px-4 py-2.5">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-[var(--color-primary-blue)]" />}
        <h3 className="min-w-0 flex-1 truncate text-[11px] font-black uppercase tracking-wide text-[var(--color-text-primary)]">{titulo}</h3>
        {acao && (
          <Link to={acao.to} className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-[var(--color-primary-blue)] hover:underline">
            {acao.label}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>
      <div className={cn("min-w-0 flex-1", !semPadding && "p-4")}>{children}</div>
    </Card>
  );
}
