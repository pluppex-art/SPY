import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { SectionNavGroup } from "../../../components/layout/SectionSidebar";
import { cn } from "../../../lib/utils";

const RAIZ = "/app/financeiro";
const ativa = (pathname: string, path: string) => pathname === path || pathname.startsWith(path + "/");

/**
 * Navegação do Financeiro em dois níveis, no formato dos mapas do NFC:
 * 1) uma fileira de blocos grandes, um por área (no máximo 7);
 * 2) logo abaixo, só as abas da área aberta.
 * Substitui o menu lateral de ~30 itens: a pessoa sempre vê onde está e o que existe ao lado.
 */
export function FinanceiroNav({ areas }: { areas: SectionNavGroup[] }) {
  const { pathname } = useLocation();
  const refAba = useRef<HTMLAnchorElement | null>(null);
  const refArea = useRef<HTMLAnchorElement | null>(null);

  // Área aberta = a que contém a página atual; a raiz do módulo é o Painel Geral.
  const indice = Math.max(
    0,
    areas.findIndex((a) => a.items.some((i) => ativa(pathname, i.path))),
  );
  const area = areas[pathname === RAIZ ? 0 : indice];

  // No celular as abas rolam: traz a aba atual para a vista ao trocar de página.
  useEffect(() => {
    refArea.current?.scrollIntoView({ block: "nearest", inline: "center" });
    refAba.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <div className="shrink-0 border-b border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]">
      <nav aria-label="Áreas do financeiro" className="flex gap-2 overflow-x-auto px-4 pt-3 pb-3 scrollbar-none min-[1380px]:grid min-[1380px]:grid-cols-7 lg:px-8">
        {areas.map((a) => {
          const Icon = a.icon;
          const aberta = a === area;
          return (
            <Link
              key={a.title}
              ref={aberta ? refArea : undefined}
              to={a.items[0].path}
              aria-current={aberta ? "page" : undefined}
              className={cn(
                "flex min-h-[52px] min-w-[8.75rem] shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all min-[1380px]:min-w-0",
                aberta
                  ? "border-transparent bg-[var(--color-primary-blue)] text-white shadow-md"
                  : "border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] hover:border-[var(--color-primary-blue)]/50",
              )}
            >
              {Icon && (
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", aberta ? "bg-white/20" : "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]")}>
                  <Icon className="h-4 w-4" />
                </span>
              )}
              <span className="text-[11px] font-black uppercase leading-tight tracking-wide">{a.title}</span>
            </Link>
          );
        })}
      </nav>

      <nav aria-label={`Páginas de ${area.title}`} className="flex gap-1 overflow-x-auto px-4 scrollbar-none lg:px-8">
        {area.items.map((i) => {
          const atual = ativa(pathname, i.path) || (pathname === RAIZ && i === area.items[0]);
          const Icon = i.icon;
          const externa = !i.path.startsWith(RAIZ);
          return (
            <Link
              key={i.path}
              to={i.path}
              ref={atual ? refAba : undefined}
              aria-current={atual ? "page" : undefined}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
                atual
                  ? "border-[var(--color-primary-blue)] font-bold text-[var(--color-primary-blue)]"
                  : "border-transparent font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {i.title}
              {externa && <ArrowUpRight className="h-3 w-3 opacity-60" aria-label="abre em outro módulo" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
