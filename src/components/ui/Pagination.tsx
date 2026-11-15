import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "./button";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}

/** Janela de números: 1 … 4 5 [6] 7 8 … 1512 (índices 0-based). */
function janela(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
  const set = new Set<number>([0, totalPages - 1]);
  for (let i = page - 2; i <= page + 2; i++) if (i > 0 && i < totalPages - 1) set.add(i);
  const ordenado = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  ordenado.forEach((n, i) => {
    if (i > 0 && n - ordenado[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

/**
 * Paginação server-side genérica — usada por qualquer tela que busca uma
 * página por vez direto do Supabase (ver src/pages/crm/useLeadsList.ts como
 * referência de hook). `page` é 0-indexed.
 * Pensada para listas grandes (dezenas de milhares de linhas): primeira/última,
 * números ao redor da página atual e campo para pular direto a uma página.
 */
export function Pagination({ page, totalPages, total, pageSize, loading, onPageChange, itemLabel = "item" }: PaginationProps) {
  const [alvo, setAlvo] = useState(String(page + 1));
  useEffect(() => { setAlvo(String(page + 1)); }, [page]);

  if (total === 0) return null;

  const ultima = Math.max(0, totalPages - 1);
  const irPara = (p: number) => onPageChange(Math.min(ultima, Math.max(0, p)));
  const from = page * pageSize + 1;
  const to = Math.min(total, from + pageSize - 1);
  const plural = total === 1 ? "" : "s";
  const confirmarAlvo = () => {
    const n = parseInt(alvo, 10);
    if (Number.isNaN(n)) { setAlvo(String(page + 1)); return; }
    irPara(n - 1);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-xs text-[var(--color-text-muted)]">
      <span>
        {from.toLocaleString("pt-BR")}–{to.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} {itemLabel}{plural}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" title="Primeira página" disabled={page === 0 || loading} onClick={() => irPara(0)}>
          <ChevronsLeft className="w-3.5 h-3.5" />
        </Button>
        <Button variant="outline" size="sm" title="Página anterior" disabled={page === 0 || loading} onClick={() => irPara(page - 1)}>
          <ChevronLeft className="w-3.5 h-3.5" />
        </Button>
        {janela(page, totalPages).map((n, i) =>
          n === "…" ? (
            <span key={`e${i}`} className="px-1">…</span>
          ) : (
            <Button
              key={n}
              variant={n === page ? "default" : "outline"}
              size="sm"
              disabled={loading}
              onClick={() => n !== page && irPara(n)}
              className="min-w-8 font-bold"
            >
              {(n + 1).toLocaleString("pt-BR")}
            </Button>
          )
        )}
        <Button variant="outline" size="sm" title="Próxima página" disabled={page >= ultima || loading} onClick={() => irPara(page + 1)}>
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
        <Button variant="outline" size="sm" title="Última página" disabled={page >= ultima || loading} onClick={() => irPara(ultima)}>
          <ChevronsRight className="w-3.5 h-3.5" />
        </Button>
        <span className="ml-2 hidden sm:inline">Ir para</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={alvo}
          onChange={(e) => setAlvo(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") confirmarAlvo(); }}
          onBlur={confirmarAlvo}
          className="w-16 h-8 rounded-md border border-[var(--color-border)] bg-transparent px-2 text-center font-bold"
          aria-label="Ir para a página"
        />
        <span>de {totalPages.toLocaleString("pt-BR")}</span>
      </div>
    </div>
  );
}
