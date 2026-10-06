import type { ReactNode } from "react";
import { Modal } from "./modal";

export type DrillColumn<T = any> = { header: string; render: (row: T) => ReactNode; className?: string };

/**
 * Painel lateral genérico pra "drill-down" de card de KPI: mostra a lista real
 * de registros (leads, contratos, tarefas...) por trás de um número agregado.
 * Usado em todos os dashboards — ver MapaDaReceita.tsx pro primeiro caso.
 */
export function DrillDownPanel<T = any>({
  isOpen,
  onClose,
  title,
  subtitle,
  rows,
  columns,
  emptyLabel = "Nenhum registro ainda.",
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  rows: T[];
  columns: DrillColumn<T>[];
  emptyLabel?: string;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} position="right" maxWidth="max-w-xl" noPadding title={title} description={subtitle}>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs text-left">
          <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)] sticky top-0">
            <tr>
              {columns.map((c) => (
                <th key={c.header} className={`px-4 py-2.5 ${c.className || ""}`}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-subtle)]">
            {rows.map((row, i) => (
              <tr key={(row as any)?.id || i} className="hover:bg-[var(--color-surface-sunken)]/60">
                {columns.map((c) => (
                  <td key={c.header} className={`px-4 py-2.5 ${c.className || ""}`}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-[var(--color-text-faint)]">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
