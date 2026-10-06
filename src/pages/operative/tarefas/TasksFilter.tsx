import React from "react";
import { Calendar } from "lucide-react";
import { FilterBar, FilterSearch } from "../../../components/ui/kpi-filter-card";
import { cn } from "../../../lib/utils";

interface TasksFilterProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  deadlineFilter: string;
  setDeadlineFilter: (val: string) => void;
  selectedPriorities: string[];
  setSelectedPriorities: React.Dispatch<React.SetStateAction<string[]>>;
}

/** Barra de filtros de Tarefas (vai dentro do <KpiFilterCard>). */
export function TasksFilter({
  searchQuery,
  setSearchQuery,
  deadlineFilter,
  setDeadlineFilter,
  selectedPriorities,
  setSelectedPriorities,
}: TasksFilterProps) {
  return (
    <FilterBar>
      <FilterSearch value={searchQuery} onChange={setSearchQuery} placeholder="Buscar por título ou contato do lead..." />

      <div className="flex items-center gap-1.5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] shrink-0 px-3 h-[38px]">
        <Calendar className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
        <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Até:</span>
        <input
          type="date"
          value={deadlineFilter}
          onChange={(e) => setDeadlineFilter(e.target.value)}
          className="bg-transparent text-[var(--color-text-primary)] text-[11px] focus:outline-none border-none font-mono cursor-pointer"
          title="Filtrar por data limite da tarefa"
        />
      </div>

      <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] flex-wrap">
        <span className="text-[10px] text-[var(--color-text-muted)] font-black uppercase tracking-wider px-2">Prioridade:</span>
        {["Alta", "Média", "Baixa"].map(p => {
          const isSelected = selectedPriorities.includes(p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => setSelectedPriorities(prev => (prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]))}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded cursor-pointer transition-all",
                isSelected ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
              )}
            >
              {p}
            </button>
          );
        })}
      </div>
    </FilterBar>
  );
}
